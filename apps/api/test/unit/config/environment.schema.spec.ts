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
    ]) {
      Reflect.deleteProperty(worker, key);
    }

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
    expect(() =>
      validateEnvironment({ ...valid, MASARIFI_CLERK_API_TIMEOUT_MS: 10_001 }),
    ).toThrow('MASARIFI_CLERK_API_TIMEOUT_MS');
    expect(() =>
      validateEnvironment({ ...valid, MASARIFI_CLERK_RECONCILE_PAGE_SIZE: 101 }),
    ).toThrow('MASARIFI_CLERK_RECONCILE_PAGE_SIZE');
  });

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
