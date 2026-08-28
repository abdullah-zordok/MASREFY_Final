import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { ClerkIdentityUser } from '../../../src/identity/clerk-client.service';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Clerk webhook worker', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const subjects = [
    'webhook_worker_created', 'webhook_worker_updated', 'webhook_worker_deleted',
    'webhook_worker_failed', 'webhook_worker_absent_unknown',
    'webhook_worker_serialized', 'webhook_worker_conflict_holder',
    'webhook_worker_crash_rollback', 'webhook_worker_concurrent_a',
    'webhook_worker_concurrent_b',
  ];
  const eventIds = [
    ...subjects.map((subject) => `msg_${subject}`),
    'msg_webhook_worker_serialized_a',
    'msg_webhook_worker_serialized_b',
  ];

  async function asMigration<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        const value = await action(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async function receive(
    subject: string,
    type: 'user.created' | 'user.updated' | 'user.deleted',
    eventId = `msg_${subject}`,
  ) {
    const payload = { type, data: { id: subject } };
    return repository.receiveClerkWebhook({
      eventId,
      eventType: type,
      verifiedAt: new Date(),
      payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      payload,
    });
  }

  function current(subject: string, overrides: Partial<ClerkIdentityUser> = {}): ClerkIdentityUser {
    return {
      id: subject,
      primaryEmail: `${subject}@example.test`,
      primaryPhone: null,
      displayName: 'Initial Provider Name',
      ...overrides,
    };
  }

  beforeAll(() => {
    pool = createLivePool();
    repository = new IdentityRepository(pool);
  });

  afterAll(async () => {
    await asMigration(async (client) => {
      await client.query(
        `delete from private.outbox_events where payload ->> 'profileId' = any($1::text[])`, [subjects],
      );
      await client.query('delete from public.user_preferences where user_id = any($1::text[])', [subjects]);
      await client.query('delete from public.onboarding_progress where user_id = any($1::text[])', [subjects]);
      await client.query('delete from public.user_devices where user_id = any($1::text[])', [subjects]);
      await client.query('delete from public.profiles where id = any($1::text[])', [subjects]);
      await client.query('delete from private.clerk_webhook_events where clerk_event_id = any($1::text[])', [eventIds]);
    });
    await pool.onModuleDestroy();
  });

  it('atomically creates profile defaults, one safe event, and processed receipt', async () => {
    const subject = subjects[0] as string;
    await receive(subject, 'user.created');
    await expect(repository.processNextClerkWebhook(() => Promise.resolve(current(subject)), 3))
      .resolves.toMatchObject({ status: 'processed', eventId: `msg_${subject}` });
    const evidence = await asMigration((client) => client.query<{
      status: string; display_name: string | null; preferences: string; onboarding: string;
      inbox_status: string; events: string;
    }>(
      `select p.status,p.display_name,
         (select count(*) from public.user_preferences where user_id=p.id)::text preferences,
         (select count(*) from public.onboarding_progress where user_id=p.id)::text onboarding,
         (select status from private.clerk_webhook_events where clerk_event_id=$2) inbox_status,
         (select count(*) from private.outbox_events where event_type='profile.created'
            and payload->>'profileId'=p.id)::text events
       from public.profiles p where p.id=$1`,
      [subject, `msg_${subject}`],
    ));
    expect(evidence.rows[0]).toEqual({
      status: 'active', display_name: 'Initial Provider Name', preferences: '1',
      onboarding: '1', inbox_status: 'processed', events: '1',
    });
  });

  it('uses the delivery as a current-state signal and preserves customer display name', async () => {
    const subject = subjects[1] as string;
    await asMigration((client) => client.query(
      `insert into public.profiles(id,primary_email,display_name,status)
       values($1,$2,'Customer Name','active')`, [subject, `old_${subject}@example.test`],
    ));
    await receive(subject, 'user.deleted');
    await repository.processNextClerkWebhook(() => Promise.resolve(current(subject, {
      primaryEmail: `current_${subject}@example.test`, displayName: 'Provider Changed Name',
    })), 3);
    const profile = await asMigration((client) => client.query<{
      status: string; display_name: string | null; primary_email: string | null;
    }>('select status,display_name,primary_email from public.profiles where id=$1', [subject]));
    expect(profile.rows[0]).toEqual({
      status: 'active', display_name: 'Customer Name',
      primary_email: `current_${subject}@example.test`,
    });
  });

  it('treats confirmed absence as deletion evidence and revokes local delivery', async () => {
    const subject = subjects[2] as string;
    await asMigration((client) => client.query(
      `insert into public.profiles(id,status) values($1,'active')`, [subject],
    ));
    await receive(subject, 'user.updated');
    await repository.processNextClerkWebhook(() => Promise.resolve(null), 3);
    const evidence = await asMigration((client) => client.query<{ status: string; events: string }>(
      `select p.status,
         (select count(*) from private.outbox_events where event_type='profile.deletion_requested'
           and payload->>'profileId'=p.id)::text events
       from public.profiles p where id=$1`, [subject],
    ));
    expect(evidence.rows[0]).toEqual({ status: 'deletion_pending', events: '1' });
  });

  it('records confirmed absence without creating an unknown profile shell', async () => {
    const subject = subjects[4] as string;
    await receive(subject, 'user.deleted');
    await expect(repository.processNextClerkWebhook(() => Promise.resolve(null), 3))
      .resolves.toMatchObject({ status: 'processed', eventId: `msg_${subject}` });
    const evidence = await asMigration((client) => client.query<{
      profiles: string; events: string; inbox_status: string;
    }>(
      `select
         (select count(*) from public.profiles where id=$1)::text profiles,
         (select count(*) from private.outbox_events where payload->>'profileId'=$1)::text events,
         status as inbox_status
       from private.clerk_webhook_events where clerk_event_id=$2`,
      [subject, `msg_${subject}`],
    ));
    expect(evidence.rows[0]).toEqual({ profiles: '0', events: '0', inbox_status: 'processed' });
  });

  it('rolls back partial effects on provider failure and retains bounded retry evidence', async () => {
    const subject = subjects[3] as string;
    await receive(subject, 'user.created');
    const result = await repository.processNextClerkWebhook(
      () => Promise.reject(new Error('provider private detail')), 3,
    );
    expect(result).toMatchObject({ status: 'failed', attemptCount: 1 });
    await repository.processNextClerkWebhook(
      () => Promise.reject(new Error('provider private detail')), 3,
    );
    await repository.processNextClerkWebhook(
      () => Promise.reject(new Error('provider private detail')), 3,
    );
    await expect(repository.processNextClerkWebhook(() => Promise.resolve(current(subject)), 3))
      .resolves.toEqual({ status: 'idle' });
    const evidence = await asMigration((client) => client.query<{
      profiles: string; status: string; attempt_count: number; last_error_code: string;
    }>(
      `select
         (select count(*) from public.profiles where id=$1)::text profiles,
         status,attempt_count,last_error_code
       from private.clerk_webhook_events where clerk_event_id=$2`,
      [subject, `msg_${subject}`],
    ));
    expect(evidence.rows[0]).toEqual({
      profiles: '0', status: 'failed', attempt_count: 3, last_error_code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('serializes two concurrent deliveries for the same immutable subject', async () => {
    const subject = subjects[5] as string;
    await receive(subject, 'user.created', 'msg_webhook_worker_serialized_a');
    await receive(subject, 'user.updated', 'msg_webhook_worker_serialized_b');
    let releaseFirstLookup: (() => void) | undefined;
    const firstLookupGate = new Promise<void>((resolveGate) => {
      releaseFirstLookup = resolveGate;
    });
    let lookupCount = 0;
    const lookup = async () => {
      lookupCount += 1;
      if (lookupCount === 1) await firstLookupGate;
      return current(subject, { primaryEmail: null });
    };
    const first = repository.processNextClerkWebhook(lookup, 3);
    while (lookupCount === 0) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    const second = repository.processNextClerkWebhook(lookup, 3);
    const completedBeforeRelease = await Promise.race([
      second.then(() => true),
      new Promise<boolean>((resolveWait) => setTimeout(() => {
        resolveWait(false);
      }, 50)),
    ]);
    expect(completedBeforeRelease).toBe(false);
    expect(lookupCount).toBe(1);
    releaseFirstLookup?.();
    const processed = await Promise.all([first, second]);
    expect(processed.every((entry) => entry.status === 'processed')).toBe(true);
    expect(lookupCount).toBe(2);
  });

  it('rolls back profile/default/outbox effects when synchronization fails after lookup', async () => {
    const holder = subjects[6] as string;
    const subject = subjects[7] as string;
    const conflictingEmail = 'webhook-conflict@example.test';
    await asMigration((client) => client.query(
      `insert into public.profiles(id,primary_email,status) values($1,$2,'active')`,
      [holder, conflictingEmail],
    ));
    await receive(subject, 'user.created');
    await expect(repository.processNextClerkWebhook(
      () => Promise.resolve(current(subject, { primaryEmail: conflictingEmail })), 3,
    )).resolves.toMatchObject({ status: 'failed', attemptCount: 1 });
    await repository.processNextClerkWebhook(
      () => Promise.resolve(current(subject, { primaryEmail: conflictingEmail })), 3,
    );
    await repository.processNextClerkWebhook(
      () => Promise.resolve(current(subject, { primaryEmail: conflictingEmail })), 3,
    );
    const evidence = await asMigration((client) => client.query<{
      profiles: string; preferences: string; onboarding: string; events: string;
    }>(
      `select
         (select count(*) from public.profiles where id=$1)::text profiles,
         (select count(*) from public.user_preferences where user_id=$1)::text preferences,
         (select count(*) from public.onboarding_progress where user_id=$1)::text onboarding,
         (select count(*) from private.outbox_events where payload->>'profileId'=$1)::text events`,
      [subject],
    ));
    expect(evidence.rows[0]).toEqual({
      profiles: '0', preferences: '0', onboarding: '0', events: '0',
    });
  });

  it('lets concurrent workers claim disjoint rows', async () => {
    const pending = subjects.slice(8);
    await Promise.all(pending.map((subject) => receive(subject, 'user.created')));
    const seen: string[] = [];
    const lookup = (subject: string) => {
      seen.push(subject);
      return Promise.resolve(current(subject, { primaryEmail: null }));
    };
    const results = await Promise.all([
      repository.processNextClerkWebhook(lookup, 3),
      repository.processNextClerkWebhook(lookup, 3),
    ]);
    expect(results.every((result) => result.status === 'processed')).toBe(true);
    expect(new Set(seen).size).toBe(2);
  });
});
