import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

const owned = {
  tables: new Set(['private.outbox_events']),
  schemas: new Set(['private', 'audit']),
  functions: new Set([
    'private.set_updated_at_and_version',
    'private.enqueue_outbox_event',
    'private.claim_outbox_batch',
  ]),
  queues: new Set(['platform-events']),
  buckets: new Set(['support-attachments', 'report-exports', 'voice-temp']),
  endpoints: new Set(['GET /health/live', 'GET /health/ready', 'GET /api/v1/meta']),
  jobs: new Set(['outbox.dispatch', 'migration.apply']),
  events: new Set([
    'platform.started',
    'platform.ready',
    'outbox.published',
    'outbox.delivery_failed',
  ]),
};

const identityOwned = {
  tables: new Set([
    'public.profiles',
    'public.user_preferences',
    'public.onboarding_progress',
    'public.user_devices',
    'public.push_tokens',
    'private.clerk_webhook_events',
  ]),
  functions: new Set([
    'public.current_clerk_user_id',
    'private.assert_active_profile',
  ]),
  endpoints: new Set([
    'GET /api/v1/me',
    'PATCH /api/v1/me',
    'GET /api/v1/me/preferences',
    'PUT /api/v1/me/preferences',
    'GET /api/v1/me/onboarding',
    'PUT /api/v1/me/onboarding',
    'GET /api/v1/me/devices',
    'POST /api/v1/me/devices/register',
    'DELETE /api/v1/me/devices/{deviceId}',
    'POST /webhooks/clerk',
  ]),
  jobs: new Set(['clerk.webhook.process']),
  events: new Set([
    'profile.created',
    'profile.updated',
    'profile.deletion_requested',
    'device.registered',
    'device.revoked',
  ]),
};

function findUnowned(kind: keyof typeof owned, values: string[]): string[] {
  return values.filter((value) => !owned[kind].has(value));
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] as string);
}

describe('SPEC-BE-001 ownership boundary', () => {
  const root = resolve(__dirname, '../../../..');
  const foundationMigration = readFileSync(
    resolve(root, 'supabase/migrations/20260827000100_foundation_schemas_extensions.sql'),
    'utf8',
  );
  const outboxMigration = readFileSync(
    resolve(root, 'supabase/migrations/20260827000200_outbox_queue_functions.sql'),
    'utf8',
  );
  const migrations = [
    '20260827000100_foundation_schemas_extensions.sql',
    '20260827000200_outbox_queue_functions.sql',
    '20260827000300_private_storage_buckets.sql',
    '20260827000400_foundation_grants.sql',
  ]
    .map((file) => readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'))
    .join('\n');

  it('contains only owned database, queue, and bucket objects', () => {
    expect(
      findUnowned('schemas', matches(migrations, /create schema if not exists\s+([a-z_]\w*)/gi)),
    ).toEqual([]);
    expect(
      findUnowned(
        'tables',
        matches(migrations, /create table(?: if not exists)?\s+([a-z_]\w*\.[a-z_]\w*)/gi),
      ),
    ).toEqual([]);
    expect(
      findUnowned(
        'functions',
        matches(migrations, /create(?: or replace)? function\s+([a-z_]\w*\.[a-z_]\w*)/gi),
      ),
    ).toEqual([]);
    expect(findUnowned('queues', matches(migrations, /pgmq\.create\('([^']+)'\)/gi))).toEqual([]);
    expect(
      findUnowned('buckets', matches(migrations, /^\s*\('([^']+)',\s*'[^']+',\s*false\)/gim)),
    ).toEqual([]);
  });

  it('creates least-privilege roles and fails closed for unsafe existing attributes', () => {
    for (const role of ['masarifi_migration', 'masarifi_api', 'masarifi_worker']) {
      expect(foundationMigration).toMatch(
        new RegExp(`create role ${role} nologin noinherit;`, 'i'),
      );
    }
    for (const unsafeAttribute of [
      'rolcanlogin',
      'rolinherit',
      'rolsuper',
      'rolcreatedb',
      'rolcreaterole',
      'rolreplication',
      'rolbypassrls',
    ]) {
      expect(foundationMigration).toContain(unsafeAttribute);
    }
    expect(foundationMigration).toContain('FOUNDATION_ROLE_ATTRIBUTES_INVALID');
    expect(foundationMigration).toContain(
      'grant masarifi_migration to current_user with set true, inherit false;',
    );
    expect(foundationMigration).not.toMatch(/grant masarifi_migration .*inherit true/i);
    expect(foundationMigration).not.toMatch(/alter role .*superuser/i);
    expect(foundationMigration).toMatch(
      /set local role masarifi_migration;[\s\S]+alter default privileges[\s\S]+reset role;/i,
    );
    expect(foundationMigration).toContain(
      'grant usage on schema extensions to masarifi_migration;',
    );
    expect(foundationMigration).toContain(
      'grant execute on function extensions.gen_random_uuid() to masarifi_migration;',
    );
    expect(migrations).toContain(
      'revoke masarifi_migration from current_user granted by current_user;',
    );
    expect(migrations).toMatch(
      /set local role masarifi_migration;[\s\S]+create policy outbox_worker_update[\s\S]+reset role;[\s\S]+grant usage on schema pgmq/i,
    );
    expect(outboxMigration).toMatch(
      /set local role masarifi_migration;[\s\S]+create table private\.outbox_events[\s\S]+reset role;[\s\S]+pgmq\.create/i,
    );
  });

  it('contains only owned API paths and operational events', () => {
    const contract = load(
      readFileSync(
        resolve(root, 'apps/api/specs/001-backend-foundation/contracts/openapi.yaml'),
        'utf8',
      ),
    ) as { paths: Record<string, Record<string, unknown>> };
    const endpoints = Object.entries(contract.paths).flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );
    const eventSource = readFileSync(
      resolve(root, 'apps/api/src/platform/outbox/outbox-dispatcher.ts'),
      'utf8',
    );
    const events = matches(eventSource, /'(platform\.[a-z_]+|outbox\.[a-z_]+)'/g);

    expect(findUnowned('endpoints', endpoints)).toEqual([]);
    expect(findUnowned('events', events)).toEqual([]);
    expect(owned.jobs).toEqual(new Set(['outbox.dispatch', 'migration.apply']));
  });

  it('rejects an unowned fixture for every resource category', () => {
    for (const kind of Object.keys(owned) as (keyof typeof owned)[]) {
      expect(findUnowned(kind, ['unowned.fixture'])).toEqual(['unowned.fixture']);
    }
  });
});

describe('SPEC-BE-002 ownership boundary', () => {
  const root = resolve(__dirname, '../../../..');

  it('owns exactly the approved identity endpoints', () => {
    const contract = load(
      readFileSync(
        resolve(
          root,
          'apps/api/specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml',
        ),
        'utf8',
      ),
    ) as { paths: Record<string, Record<string, unknown>> };
    const endpoints = Object.entries(contract.paths).flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(new Set(endpoints)).toEqual(identityOwned.endpoints);
  });

  it('owns only the six tables, two functions, one job, and five events in the register', () => {
    expect(identityOwned.tables).toEqual(
      new Set([
        'public.profiles',
        'public.user_preferences',
        'public.onboarding_progress',
        'public.user_devices',
        'public.push_tokens',
        'private.clerk_webhook_events',
      ]),
    );
    expect(identityOwned.functions).toEqual(
      new Set(['public.current_clerk_user_id', 'private.assert_active_profile']),
    );
    expect(identityOwned.jobs).toEqual(new Set(['clerk.webhook.process']));
    expect(identityOwned.events).toEqual(
      new Set([
        'profile.created',
        'profile.updated',
        'profile.deletion_requested',
        'device.registered',
        'device.revoked',
      ]),
    );
    const ownedNames = Object.values(identityOwned).flatMap((values) => [...values]);
    expect(ownedNames.join('\n')).not.toMatch(
      /auth\.users|session_table|idempotency|audit|permission|admin_role/i,
    );
  });
});
