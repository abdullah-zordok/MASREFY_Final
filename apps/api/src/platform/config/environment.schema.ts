import Joi from 'joi';

import type { PlatformEnvironment, ProcessKind } from './environment.types';

const applicationKeys = new Set([
  'MASARIFI_PROCESS_KIND',
  'MASARIFI_RELEASE_VERSION',
  'MASARIFI_HTTP_PORT',
  'MASARIFI_CORS_ORIGINS',
  'MASARIFI_HTTP_BODY_LIMIT_BYTES',
  'MASARIFI_REQUEST_TIMEOUT_MS',
  'MASARIFI_READINESS_TIMEOUT_MS',
  'MASARIFI_READINESS_CACHE_TTL_MS',
  'MASARIFI_DATABASE_POOL_MAX',
  'MASARIFI_SHUTDOWN_TIMEOUT_MS',
  'MASARIFI_OUTBOX_BATCH_SIZE',
  'MASARIFI_WORKER_ID',
  'MASARIFI_OUTBOX_LEASE_SECONDS',
  'MASARIFI_OUTBOX_POLL_MS',
  'MASARIFI_OUTBOX_MAX_ATTEMPTS',
  'MASARIFI_OUTBOX_RETRY_BASE_SECONDS',
  'MASARIFI_OUTBOX_RETRY_MAX_SECONDS',
  'MASARIFI_OUTBOX_RETRY_JITTER_MS',
  'MASARIFI_LOG_LEVEL',
  'MASARIFI_META_MIN_MOBILE_VERSION',
  'MASARIFI_META_MIN_ADMIN_VERSION',
  'MASARIFI_MIGRATION_CHECKSUM_FILE',
  'MASARIFI_MIGRATION_STATEMENT_TIMEOUT_MS',
  'MASARIFI_PUSH_TOKEN_HASH_KEY',
  'MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS',
  'MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS',
  'MASARIFI_CLERK_API_TIMEOUT_MS',
  'MASARIFI_CLERK_WEBHOOK_POLL_MS',
  'MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS',
  'MASARIFI_CLERK_RECONCILE_PAGE_SIZE',
]);
const testHarnessKeys = new Set(['MASARIFI_IMAGE_UNDER_TEST', 'MASARIFI_LIVE_DATABASE_TESTS']);

const base64UrlKey = /^[A-Za-z0-9_-]{43}$/;
const safeKeyId = /^[A-Za-z0-9._-]{1,32}$/;
const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function decodedKey(value: string): Buffer | undefined {
  if (!base64UrlKey.test(value)) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === 32 && decoded.toString('base64url') === value ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function parseAuthorizedParties(value: string, helpers: Joi.CustomHelpers): unknown {
  if (value.length > 2_048) return helpers.error('string.max');
  const parties = value
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const party of parties) {
    try {
      const url = new URL(party);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.hostname.includes('*') ||
        url.origin !== party
      ) {
        return helpers.error('string.uri');
      }
    } catch {
      return helpers.error('string.uri');
    }
    if (!unique.includes(party)) unique.push(party);
  }
  return unique;
}

const schema = Joi.object<PlatformEnvironment>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  MASARIFI_PROCESS_KIND: Joi.string().valid('api', 'worker', 'migration').required(),
  MASARIFI_RELEASE_VERSION: Joi.string().trim().min(1).max(64).required(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  MASARIFI_HTTP_PORT: Joi.number().integer().min(1024).max(65535).default(3000),
  MASARIFI_CORS_ORIGINS: Joi.string().allow('').default(''),
  MASARIFI_HTTP_BODY_LIMIT_BYTES: Joi.number().integer().min(1024).max(1_048_576).default(262_144),
  MASARIFI_REQUEST_TIMEOUT_MS: Joi.number().integer().min(100).max(10_000).default(10_000),
  MASARIFI_READINESS_TIMEOUT_MS: Joi.number().integer().min(100).max(1_000).default(1_000),
  MASARIFI_READINESS_CACHE_TTL_MS: Joi.number().integer().min(0).max(5_000).default(5_000),
  MASARIFI_DATABASE_POOL_MAX: Joi.number().integer().min(1).max(50).default(10),
  MASARIFI_SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(1_000).max(30_000).default(30_000),
  MASARIFI_OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(50),
  MASARIFI_WORKER_ID: Joi.string()
    .pattern(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional(),
  MASARIFI_OUTBOX_LEASE_SECONDS: Joi.number().integer().min(1).max(300).default(30),
  MASARIFI_OUTBOX_POLL_MS: Joi.number().integer().min(100).max(10_000).default(500),
  MASARIFI_OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).max(100).default(10),
  MASARIFI_OUTBOX_RETRY_BASE_SECONDS: Joi.number().integer().min(1).max(60).default(1),
  MASARIFI_OUTBOX_RETRY_MAX_SECONDS: Joi.number().integer().min(1).max(3_600).default(300),
  MASARIFI_OUTBOX_RETRY_JITTER_MS: Joi.number().integer().min(0).max(5_000).default(1_000),
  MASARIFI_LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
  MASARIFI_META_MIN_MOBILE_VERSION: Joi.string().trim().min(1).max(32).optional(),
  MASARIFI_META_MIN_ADMIN_VERSION: Joi.string().trim().min(1).max(32).optional(),
  MASARIFI_MIGRATION_CHECKSUM_FILE: Joi.string()
    .pattern(/^supabase\/[A-Za-z0-9._/-]+$/)
    .default('supabase/migration-checksums.sha256'),
  MASARIFI_MIGRATION_STATEMENT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(600_000)
    .default(120_000),
  CLERK_PUBLISHABLE_KEY: Joi.string()
    .trim()
    .pattern(/^pk_(?:test|live)_[A-Za-z0-9_-]{8,}$/)
    .max(512)
    .optional(),
  CLERK_SECRET_KEY: Joi.string()
    .trim()
    .pattern(/^sk_(?:test|live)_[A-Za-z0-9_-]{8,}$/)
    .max(512)
    .optional(),
  CLERK_INSTANCE_DOMAIN: Joi.string().trim().lowercase().pattern(hostname).max(253).optional(),
  CLERK_AUTHORIZED_PARTIES: Joi.string()
    .allow('')
    .custom(parseAuthorizedParties, 'authorized party parser')
    .optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: Joi.string()
    .trim()
    .pattern(/^whsec_[A-Za-z0-9_-]{8,}$/)
    .max(512)
    .optional(),
  MASARIFI_PUSH_TOKEN_HASH_KEY: Joi.string().trim().pattern(base64UrlKey).optional(),
  MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: Joi.string().trim().min(1).max(1_024).optional(),
  MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS: Joi.number().integer().min(60).max(3_600).default(600),
  MASARIFI_CLERK_API_TIMEOUT_MS: Joi.number().integer().min(250).max(10_000).default(2_000),
  MASARIFI_CLERK_WEBHOOK_POLL_MS: Joi.number().integer().min(100).max(10_000).default(500),
  MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS: Joi.number().integer().min(1).max(100).default(10),
  MASARIFI_CLERK_RECONCILE_PAGE_SIZE: Joi.number().integer().min(1).max(100).default(100),
}).unknown(true);

const requiredByProcess: Record<ProcessKind, readonly (keyof PlatformEnvironment)[]> = {
  api: [
    'CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_INSTANCE_DOMAIN',
    'CLERK_AUTHORIZED_PARTIES',
    'CLERK_WEBHOOK_SIGNING_SECRET',
    'MASARIFI_PUSH_TOKEN_HASH_KEY',
    'MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS',
  ],
  worker: [
    'CLERK_SECRET_KEY',
    'MASARIFI_PUSH_TOKEN_HASH_KEY',
    'MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS',
  ],
  migration: [],
};

function invalidEnvironment(keys: readonly string[]): never {
  throw new Error(`Invalid environment variables: ${[...new Set(keys)].sort().join(', ')}`);
}

function validateIdentityEnvironment(environment: PlatformEnvironment): void {
  const missing = requiredByProcess[environment.MASARIFI_PROCESS_KIND].filter((key) => {
    const value = environment[key];
    return value === undefined || value === '';
  });
  if (missing.length > 0) invalidEnvironment(missing);

  if (environment.MASARIFI_PROCESS_KIND === 'migration') return;

  const expectedKeyEnvironment = environment.NODE_ENV === 'production' ? 'live' : 'test';
  const mismatched: string[] = [];
  if (
    environment.CLERK_SECRET_KEY &&
    !environment.CLERK_SECRET_KEY.startsWith(`sk_${expectedKeyEnvironment}_`)
  ) {
    mismatched.push('CLERK_SECRET_KEY');
  }
  if (
    environment.CLERK_PUBLISHABLE_KEY &&
    !environment.CLERK_PUBLISHABLE_KEY.startsWith(`pk_${expectedKeyEnvironment}_`)
  ) {
    mismatched.push('CLERK_PUBLISHABLE_KEY');
  }
  if (mismatched.length > 0) invalidEnvironment(mismatched);

  if (
    environment.MASARIFI_PROCESS_KIND === 'api' &&
    environment.NODE_ENV !== 'test' &&
    environment.CLERK_AUTHORIZED_PARTIES?.length === 0
  ) {
    invalidEnvironment(['CLERK_AUTHORIZED_PARTIES']);
  }
  if (
    environment.NODE_ENV === 'production' &&
    environment.CLERK_AUTHORIZED_PARTIES?.some(
      (party) => !party.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(party),
    )
  ) {
    invalidEnvironment(['CLERK_AUTHORIZED_PARTIES']);
  }

  const hashKey = environment.MASARIFI_PUSH_TOKEN_HASH_KEY
    ? decodedKey(environment.MASARIFI_PUSH_TOKEN_HASH_KEY)
    : undefined;
  if (!hashKey) invalidEnvironment(['MASARIFI_PUSH_TOKEN_HASH_KEY']);

  const entries = environment.MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS?.split(',') ?? [];
  const ids = new Set<string>();
  const encryptionKeys: Buffer[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf(':');
    const id = separator > 0 ? entry.slice(0, separator) : '';
    const key = separator > 0 ? decodedKey(entry.slice(separator + 1)) : undefined;
    if (!safeKeyId.test(id) || ids.has(id) || !key) {
      invalidEnvironment(['MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS']);
    }
    ids.add(id);
    encryptionKeys.push(key);
  }
  if (entries.length < 1 || entries.length > 3) {
    invalidEnvironment(['MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS']);
  }
  if (encryptionKeys.some((key) => key.equals(hashKey))) {
    invalidEnvironment(['MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS']);
  }
}

export function validateEnvironment(input: Record<string, unknown>): PlatformEnvironment {
  const unknownApplicationKeys = Object.keys(input).filter(
    (key) =>
      key.startsWith('MASARIFI_') &&
      !applicationKeys.has(key) &&
      !(input.NODE_ENV === 'test' && testHarnessKeys.has(key)),
  );
  if (unknownApplicationKeys.length > 0) {
    throw new Error(`Invalid environment variables: ${unknownApplicationKeys.sort().join(', ')}`);
  }

  const result: Joi.ValidationResult<PlatformEnvironment> = schema.validate(input, {
    abortEarly: false,
    convert: true,
    stripUnknown: false,
  });
  const error = result.error;
  const value: unknown = result.value;
  if (error) {
    const keys = [
      ...new Set(error.details.map((detail) => String(detail.path[0] ?? 'environment'))),
    ]
      .sort()
      .join(', ');
    throw new Error(`Invalid environment variables: ${keys}`);
  }

  const environment = value as PlatformEnvironment;
  if (
    environment.MASARIFI_OUTBOX_RETRY_MAX_SECONDS < environment.MASARIFI_OUTBOX_RETRY_BASE_SECONDS
  ) {
    throw new Error(
      'Invalid environment variables: MASARIFI_OUTBOX_RETRY_BASE_SECONDS, MASARIFI_OUTBOX_RETRY_MAX_SECONDS',
    );
  }
  if (environment.NODE_ENV === 'production' && environment.MASARIFI_LOG_LEVEL === 'debug') {
    throw new Error('Invalid environment variables: MASARIFI_LOG_LEVEL');
  }
  if (environment.NODE_ENV === 'production') {
    const invalidOrigin = environment.MASARIFI_CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .some(
        (origin) =>
          origin === '*' ||
          !origin.startsWith('https://') ||
          /localhost|127\.0\.0\.1/i.test(origin),
      );
    if (invalidOrigin) throw new Error('Invalid environment variables: MASARIFI_CORS_ORIGINS');
  }

  validateIdentityEnvironment(environment);

  return environment;
}
