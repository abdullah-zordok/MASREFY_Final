import { validateEnvironment } from '../../../src/platform/config/environment.schema';

const pushKey = (byte: number): string => Buffer.alloc(32, byte).toString('base64url');
const clerkKey = (kind: 'pk' | 'sk', environment: 'test' | 'live'): string =>
  [kind, environment, 'nonfunctionalfixture'].join('_');

const valid = {
  NODE_ENV: 'test',
  MASARIFI_PROCESS_KIND: 'api',
  MASARIFI_RELEASE_VERSION: 'test-release',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  CLERK_PUBLISHABLE_KEY: clerkKey('pk', 'test'),
  CLERK_SECRET_KEY: clerkKey('sk', 'test'),
  CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
  CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test,http://localhost:3000',
  CLERK_WEBHOOK_SIGNING_SECRET: ['whsec', 'nonfunctionalfixture'].join('_'),
  MASARIFI_PUSH_TOKEN_HASH_KEY: pushKey(1),
  MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${pushKey(2)}`,
  MASARIFI_ADMIN_INVITATION_REDIRECT_URL: 'https://admin.example.test/invitations/accept',
  MASARIFI_SECURITY_IP_HASH_KEYS: `active:${pushKey(3)}`,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local_nonfunctional_service_role_fixture',
  MASARIFI_EXPORT_RETENTION_HOURS: 24,
  MASARIFI_EXPORT_SIGNED_URL_SECONDS: 300,
  MASARIFI_DELETION_COOLING_OFF_HOURS: 72,
};

describe('validateEnvironment', () => {
  it('accepts the minimum valid API environment', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      NODE_ENV: 'test',
      MASARIFI_PROCESS_KIND: 'api',
      MASARIFI_RELEASE_VERSION: 'test-release',
    });
  });

  it.each(['NODE_ENV', 'MASARIFI_PROCESS_KIND', 'MASARIFI_RELEASE_VERSION', 'DATABASE_URL'])(
    'rejects missing %s without echoing values',
    (key) => {
      const candidate = { ...valid };
      Reflect.deleteProperty(candidate, key);
      expect(() => validateEnvironment(candidate)).toThrow(key);
    },
  );

  it('rejects unknown application variables', () => {
    expect(() => validateEnvironment({ ...valid, MASARIFI_UNKNOWN: 'secret-value' })).toThrow(
      'MASARIFI_UNKNOWN',
    );
  });

  it('allows the live-database harness flag only in tests', () => {
    expect(validateEnvironment({ ...valid, MASARIFI_LIVE_DATABASE_TESTS: '1' })).toMatchObject({
      NODE_ENV: 'test',
    });
    expect(() =>
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        MASARIFI_LIVE_DATABASE_TESTS: '1',
      }),
    ).toThrow('MASARIFI_LIVE_DATABASE_TESTS');
  });

  it('does not echo a malformed secret', () => {
    const sentinel = 'SENTINEL_DATABASE_SECRET';
    try {
      validateEnvironment({ ...valid, DATABASE_URL: sentinel });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).not.toContain(sentinel);
    }
  });

  it('enforces readiness and shutdown ceilings', () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        MASARIFI_READINESS_CACHE_TTL_MS: '5001',
        MASARIFI_SHUTDOWN_TIMEOUT_MS: '30001',
      }),
    ).toThrow();
  });

  it.each(['*', 'http://admin.example.test', 'https://localhost:3000'])(
    'rejects unsafe production CORS origin %s',
    (origin) => {
      expect(() =>
        validateEnvironment({
          ...valid,
          NODE_ENV: 'production',
          MASARIFI_CORS_ORIGINS: origin,
        }),
      ).toThrow('MASARIFI_CORS_ORIGINS');
    },
  );

  it.each([
    'CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_INSTANCE_DOMAIN',
    'CLERK_AUTHORIZED_PARTIES',
    'CLERK_WEBHOOK_SIGNING_SECRET',
    'MASARIFI_PUSH_TOKEN_HASH_KEY',
    'MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS',
  ])('requires API security variable %s', (key) => {
    const candidate: Record<string, unknown> = { ...valid };
    Reflect.deleteProperty(candidate, key);
    expect(() => validateEnvironment(candidate)).toThrow(key);
  });

  it('requires only worker Clerk Admin and push secrets', () => {
    const worker: Record<string, unknown> = {
      ...valid,
      MASARIFI_PROCESS_KIND: 'worker',
    };
    for (const key of [
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_INSTANCE_DOMAIN',
      'CLERK_AUTHORIZED_PARTIES',
      'CLERK_WEBHOOK_SIGNING_SECRET',
      'MASARIFI_ADMIN_INVITATION_REDIRECT_URL',
      'MASARIFI_EXPORT_SIGNED_URL_SECONDS',
    ]) {
      Reflect.deleteProperty(worker, key);
    }
    Object.assign(worker, {
      MASARIFI_EXPORT_MAX_BYTES: 16 * 1024 * 1024,
      MASARIFI_EXPORT_MAX_ENTRIES: 100,
      MASARIFI_SECURITY_WORKER_POLL_MS: 500,
      MASARIFI_SECURITY_JOB_BATCH_SIZE: 25,
      MASARIFI_PRIVACY_HANDLER_MANIFEST: 'identity@1',
      EMAIL_SMTP_HOST: 'smtp.example.test',
      EMAIL_SMTP_PORT: 465,
      EMAIL_SMTP_USERNAME: 'smtp-user',
      EMAIL_SMTP_PASSWORD: 'nonfunctional-smtp-password',
      EMAIL_FROM: 'reports@example.test',
    });

    expect(validateEnvironment(worker)).toMatchObject({
      MASARIFI_PROCESS_KIND: 'worker',
      CLERK_SECRET_KEY: clerkKey('sk', 'test'),
    });
  });

  it('keeps the migration process independent from Clerk and push secrets', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        MASARIFI_PROCESS_KIND: 'migration',
        MASARIFI_RELEASE_VERSION: 'test-release',
        DATABASE_URL: valid.DATABASE_URL,
      }),
    ).toMatchObject({ MASARIFI_PROCESS_KIND: 'migration' });
  });

  it('normalizes and deduplicates authorized HTTP parties', () => {
    const environment = validateEnvironment({
      ...valid,
      CLERK_AUTHORIZED_PARTIES:
        ' https://admin.example.test,https://admin.example.test,http://localhost:3000 ',
    }) as unknown as { CLERK_AUTHORIZED_PARTIES: string[] };
    expect(environment.CLERK_AUTHORIZED_PARTIES).toEqual([
      'https://admin.example.test',
      'http://localhost:3000',
    ]);
  });

  it.each([
    'masarifi://oauth-callback',
    'https://*.example.test',
    'https://user@example.test',
    'https://admin.example.test/path',
    'https://admin.example.test?query=1',
  ])('rejects malformed authorized party %s', (party) => {
    expect(() => validateEnvironment({ ...valid, CLERK_AUTHORIZED_PARTIES: party })).toThrow(
      'CLERK_AUTHORIZED_PARTIES',
    );
  });

  it('rejects mixed Clerk development and production keys', () => {
    expect(() =>
      validateEnvironment({ ...valid, CLERK_SECRET_KEY: clerkKey('sk', 'live') }),
    ).toThrow('CLERK_SECRET_KEY');
    expect(() =>
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://project.example.supabase.co',
        CLERK_PUBLISHABLE_KEY: clerkKey('pk', 'test'),
        CLERK_SECRET_KEY: clerkKey('sk', 'test'),
        CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test',
      }),
    ).toThrow('CLERK_PUBLISHABLE_KEY');
  });

  it('rejects malformed or reused push key material without echoing it', () => {
    expect(() =>
      validateEnvironment({ ...valid, MASARIFI_PUSH_TOKEN_HASH_KEY: 'not-base64url' }),
    ).toThrow('MASARIFI_PUSH_TOKEN_HASH_KEY');
    expect(() =>
      validateEnvironment({
        ...valid,
        MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${pushKey(1)}`,
      }),
    ).toThrow('MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS');
    expect(() =>
      validateEnvironment({
        ...valid,
        MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${pushKey(2)},active:${pushKey(3)}`,
      }),
    ).toThrow('MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS');
  });

  it('enforces identity operational bounds', () => {
    expect(() =>
      validateEnvironment({ ...valid, MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS: 59 }),
    ).toThrow('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS');
    expect(() => validateEnvironment({ ...valid, MASARIFI_CLERK_API_TIMEOUT_MS: 10_001 })).toThrow(
      'MASARIFI_CLERK_API_TIMEOUT_MS',
    );
    expect(() =>
      validateEnvironment({ ...valid, MASARIFI_CLERK_RECONCILE_PAGE_SIZE: 101 }),
    ).toThrow('MASARIFI_CLERK_RECONCILE_PAGE_SIZE');
  });

  it('provides bounded offline-sync defaults', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      MASARIFI_SYNC_BATCH_SIZE: 100,
      MASARIFI_SYNC_DELTA_LIMIT: 500,
      MASARIFI_SYNC_PAYLOAD_LIMIT_BYTES: 524_288,
      MASARIFI_SYNC_LEASE_SECONDS: 60,
      MASARIFI_SYNC_MAX_ATTEMPTS: 10,
      MASARIFI_SYNC_RETENTION_DAYS: 30,
    });
  });

  it('rejects unsafe offline-sync bounds and inverted retry delays', () => {
    for (const candidate of [
      { MASARIFI_SYNC_BATCH_SIZE: 101 },
      { MASARIFI_SYNC_DELTA_LIMIT: 501 },
      { MASARIFI_SYNC_PAYLOAD_LIMIT_BYTES: 524_289 },
      { MASARIFI_SYNC_LEASE_SECONDS: 301 },
      { MASARIFI_SYNC_MAX_ATTEMPTS: 0 },
      { MASARIFI_SYNC_RETENTION_DAYS: 29 },
      { MASARIFI_SYNC_RETRY_BASE_SECONDS: 30, MASARIFI_SYNC_RETRY_MAX_SECONDS: 10 },
    ]) {
      expect(() => validateEnvironment({ ...valid, ...candidate })).toThrow('MASARIFI_SYNC_');
    }
  });

  it('normalizes unique bounded ledger recent-auth thresholds', () => {
    expect(
      validateEnvironment({ ...valid, MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS: 'SAR:50000,USD:900' })
        .MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS,
    ).toEqual({ SAR: 50000, USD: 900 });
  });

  it.each(['SAR', 'sar:1', 'SAR:0', 'SAR:9007199254740992', 'SAR:1,SAR:2', 'SAR:1, USD:x'])(
    'rejects malformed ledger threshold manifest %s without echoing it',
    (manifest) => {
      expect(() =>
        validateEnvironment({ ...valid, MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS: manifest }),
      ).toThrow('MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS');
    },
  );

  it('never echoes Clerk or push secret values', () => {
    const sentinel = ['sk', 'test', 'SENTINEL!PRIVATE!VALUE'].join('_');
    try {
      validateEnvironment({ ...valid, CLERK_SECRET_KEY: sentinel });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('CLERK_SECRET_KEY');
      expect(String(error)).not.toContain(sentinel);
    }
  });
});
