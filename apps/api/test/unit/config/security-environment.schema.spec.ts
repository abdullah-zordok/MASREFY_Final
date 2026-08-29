import { validateEnvironment } from '../../../src/platform/config/environment.schema';

const key = (byte: number): string => Buffer.alloc(32, byte).toString('base64url');
const secret = (kind: 'pk' | 'sk'): string => `${kind}_test_nonfunctionalfixture`;

const shared = {
  NODE_ENV: 'test',
  MASARIFI_RELEASE_VERSION: 'test-release',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
};

const api = {
  ...shared,
  MASARIFI_PROCESS_KIND: 'api',
  CLERK_PUBLISHABLE_KEY: secret('pk'),
  CLERK_SECRET_KEY: secret('sk'),
  CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
  CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_nonfunctionalfixture',
  MASARIFI_PUSH_TOKEN_HASH_KEY: key(1),
  MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${key(2)}`,
  MASARIFI_ADMIN_INVITATION_REDIRECT_URL: 'https://admin.example.test/invitations/accept',
  MASARIFI_SECURITY_IP_HASH_KEYS: `active:${key(3)}`,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local_nonfunctional_service_role_fixture',
  MASARIFI_EXPORT_RETENTION_HOURS: 24,
  MASARIFI_EXPORT_SIGNED_URL_SECONDS: 300,
  MASARIFI_DELETION_COOLING_OFF_HOURS: 72,
};

const worker = {
  ...shared,
  MASARIFI_PROCESS_KIND: 'worker',
  CLERK_SECRET_KEY: secret('sk'),
  MASARIFI_PUSH_TOKEN_HASH_KEY: key(1),
  MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${key(2)}`,
  MASARIFI_SECURITY_IP_HASH_KEYS: `active:${key(3)}`,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local_nonfunctional_service_role_fixture',
  MASARIFI_EXPORT_MAX_BYTES: 16 * 1024 * 1024,
  MASARIFI_EXPORT_MAX_ENTRIES: 100,
  MASARIFI_EXPORT_RETENTION_HOURS: 24,
  MASARIFI_DELETION_COOLING_OFF_HOURS: 72,
  MASARIFI_SECURITY_WORKER_POLL_MS: 500,
  MASARIFI_SECURITY_JOB_BATCH_SIZE: 25,
  MASARIFI_PRIVACY_HANDLER_MANIFEST: 'identity@1',
};

describe('Phase 03 security environment', () => {
  it('defaults Admin routes off and accepts the exact API variables', () => {
    expect(validateEnvironment(api)).toMatchObject({
      MASARIFI_ADMIN_ROUTES_ENABLED: false,
      MASARIFI_EXPORT_SIGNED_URL_SECONDS: 300,
    });
  });

  it('accepts the exact worker variables', () => {
    expect(validateEnvironment(worker)).toMatchObject({
      MASARIFI_EXPORT_MAX_BYTES: 16 * 1024 * 1024,
      MASARIFI_SECURITY_JOB_BATCH_SIZE: 25,
      MASARIFI_PRIVACY_HANDLER_MANIFEST: ['identity@1'],
    });
  });

  it('keeps migration independent from every Phase 03 provider secret', () => {
    expect(validateEnvironment({ ...shared, MASARIFI_PROCESS_KIND: 'migration' })).toMatchObject({
      MASARIFI_PROCESS_KIND: 'migration',
    });
    expect(() =>
      validateEnvironment({
        ...shared,
        MASARIFI_PROCESS_KIND: 'migration',
        SUPABASE_SERVICE_ROLE_KEY: api.SUPABASE_SERVICE_ROLE_KEY,
      }),
    ).toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it.each([
    'MASARIFI_ADMIN_INVITATION_REDIRECT_URL',
    'MASARIFI_SECURITY_IP_HASH_KEYS',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MASARIFI_EXPORT_RETENTION_HOURS',
    'MASARIFI_EXPORT_SIGNED_URL_SECONDS',
    'MASARIFI_DELETION_COOLING_OFF_HOURS',
  ])('fails closed when API variable %s is absent', (name) => {
    const candidate: Record<string, unknown> = { ...api };
    Reflect.deleteProperty(candidate, name);
    expect(() => validateEnvironment(candidate)).toThrow(name);
  });

  it.each([
    'MASARIFI_SECURITY_IP_HASH_KEYS',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MASARIFI_EXPORT_MAX_BYTES',
    'MASARIFI_EXPORT_MAX_ENTRIES',
    'MASARIFI_EXPORT_RETENTION_HOURS',
    'MASARIFI_DELETION_COOLING_OFF_HOURS',
    'MASARIFI_SECURITY_WORKER_POLL_MS',
    'MASARIFI_SECURITY_JOB_BATCH_SIZE',
    'MASARIFI_PRIVACY_HANDLER_MANIFEST',
  ])('fails closed when worker variable %s is absent', (name) => {
    const candidate: Record<string, unknown> = { ...worker };
    Reflect.deleteProperty(candidate, name);
    expect(() => validateEnvironment(candidate)).toThrow(name);
  });

  it('enforces URL, size, retention, polling, and manifest bounds', () => {
    expect(() => validateEnvironment({ ...api, MASARIFI_ADMIN_INVITATION_REDIRECT_URL: 'http://example.test' })).toThrow('MASARIFI_ADMIN_INVITATION_REDIRECT_URL');
    expect(() => validateEnvironment({ ...worker, MASARIFI_EXPORT_MAX_BYTES: 1024 })).toThrow('MASARIFI_EXPORT_MAX_BYTES');
    expect(() => validateEnvironment({ ...worker, MASARIFI_EXPORT_MAX_ENTRIES: 10_001 })).toThrow('MASARIFI_EXPORT_MAX_ENTRIES');
    expect(() => validateEnvironment({ ...worker, MASARIFI_EXPORT_RETENTION_HOURS: 169 })).toThrow('MASARIFI_EXPORT_RETENTION_HOURS');
    expect(() => validateEnvironment({ ...worker, MASARIFI_SECURITY_WORKER_POLL_MS: 99 })).toThrow('MASARIFI_SECURITY_WORKER_POLL_MS');
    expect(() => validateEnvironment({ ...worker, MASARIFI_PRIVACY_HANDLER_MANIFEST: 'identity@1,identity@1' })).toThrow('MASARIFI_PRIVACY_HANDLER_MANIFEST');
  });

  it('rejects API-only values in the worker and never echoes a secret', () => {
    expect(() => validateEnvironment({ ...worker, MASARIFI_ADMIN_ROUTES_ENABLED: true })).toThrow('MASARIFI_ADMIN_ROUTES_ENABLED');
    const sentinel = 'SENTINEL_SECURITY_SECRET_VALUE';
    try {
      validateEnvironment({ ...api, MASARIFI_SECURITY_IP_HASH_KEYS: sentinel });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('MASARIFI_SECURITY_IP_HASH_KEYS');
      expect(String(error)).not.toContain(sentinel);
    }
  });
});
