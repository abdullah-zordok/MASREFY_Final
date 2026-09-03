import { validateEnvironment } from '../../../src/platform/config/environment.schema';

const pushKey = (byte: number): string => Buffer.alloc(32, byte).toString('base64url');

const worker = {
  NODE_ENV: 'test',
  MASARIFI_PROCESS_KIND: 'worker',
  MASARIFI_RELEASE_VERSION: 'phase10-test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  CLERK_SECRET_KEY: 'sk_test_nonfunctionalfixture',
  MASARIFI_PUSH_TOKEN_HASH_KEY: pushKey(1),
  MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${pushKey(2)}`,
  MASARIFI_SECURITY_IP_HASH_KEYS: `active:${pushKey(3)}`,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local_nonfunctional_service_role_fixture',
  MASARIFI_EXPORT_MAX_BYTES: 16 * 1024 * 1024,
  MASARIFI_EXPORT_MAX_ENTRIES: 100,
  MASARIFI_EXPORT_RETENTION_HOURS: 24,
  MASARIFI_DELETION_COOLING_OFF_HOURS: 72,
  MASARIFI_SECURITY_WORKER_POLL_MS: 500,
  MASARIFI_SECURITY_JOB_BATCH_SIZE: 25,
  MASARIFI_PRIVACY_HANDLER_MANIFEST: 'identity@1',
  EMAIL_SMTP_HOST: 'smtp.example.test',
  EMAIL_SMTP_PORT: 465,
  EMAIL_SMTP_USERNAME: 'smtp-user',
  EMAIL_SMTP_PASSWORD: 'nonfunctional-smtp-password',
  EMAIL_FROM: 'reports@example.test',
};

const api: Record<string, unknown> = {
  ...worker,
  MASARIFI_PROCESS_KIND: 'api',
  CLERK_PUBLISHABLE_KEY: 'pk_test_nonfunctionalfixture',
  CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
  CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_nonfunctionalfixture',
  MASARIFI_ADMIN_INVITATION_REDIRECT_URL: 'https://admin.example.test/invitations/accept',
  MASARIFI_EXPORT_SIGNED_URL_SECONDS: 300,
};
for (const key of [
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USERNAME',
  'EMAIL_SMTP_PASSWORD',
  'EMAIL_FROM',
]) {
  Reflect.deleteProperty(api, key);
}

describe('Phase 10 report delivery environment', () => {
  it('requires the five SMTP settings for workers and applies bounded defaults', () => {
    expect(validateEnvironment(worker)).toMatchObject({
      EMAIL_SMTP_HOST: 'smtp.example.test',
      EMAIL_SMTP_PORT: 465,
      EMAIL_FROM: 'reports@example.test',
      MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS: 5_000,
      MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS: 10_000,
      MASARIFI_REPORT_BATCH_SIZE: 25,
      MASARIFI_REPORT_SIGNED_URL_SECONDS: 300,
    });

    for (const key of [
      'EMAIL_SMTP_HOST',
      'EMAIL_SMTP_PORT',
      'EMAIL_SMTP_USERNAME',
      'EMAIL_SMTP_PASSWORD',
      'EMAIL_FROM',
    ]) {
      const candidate: Record<string, unknown> = { ...worker };
      Reflect.deleteProperty(candidate, key);
      expect(() => validateEnvironment(candidate)).toThrow(key);
    }
  });

  it.each([
    ['EMAIL_SMTP_HOST', 'https://smtp.example.test'],
    ['EMAIL_SMTP_PORT', 0],
    ['EMAIL_FROM', 'Display Name <reports@example.test>\r\nBcc: victim@example.test'],
    ['MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS', 30_001],
    ['MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS', 60_001],
    ['MASARIFI_REPORT_SIGNED_URL_SECONDS', 901],
    ['MASARIFI_REPORT_BATCH_SIZE', 101],
  ])('rejects unsafe or unbounded %s', (key, value) => {
    expect(() => validateEnvironment({ ...worker, [key]: value })).toThrow(key);
  });

  it('accepts only a bounded optional delivery webhook secret and never echoes it', () => {
    expect(
      validateEnvironment({
        ...api,
        EMAIL_DELIVERY_WEBHOOK_SECRET: 'w'.repeat(48),
      }).EMAIL_DELIVERY_WEBHOOK_SECRET,
    ).toBe('w'.repeat(48));

    const sentinel = 'SENTINEL-SHORT-WEBHOOK-SECRET';
    try {
      validateEnvironment({ ...api, EMAIL_DELIVERY_WEBHOOK_SECRET: sentinel });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('EMAIL_DELIVERY_WEBHOOK_SECRET');
      expect(String(error)).not.toContain(sentinel);
    }
  });

  it('rejects SMTP credentials outside the worker process', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        MASARIFI_PROCESS_KIND: 'migration',
        MASARIFI_RELEASE_VERSION: 'phase10-test',
        DATABASE_URL: worker.DATABASE_URL,
        EMAIL_SMTP_PASSWORD: worker.EMAIL_SMTP_PASSWORD,
      }),
    ).toThrow('EMAIL_SMTP_PASSWORD');
  });
});
