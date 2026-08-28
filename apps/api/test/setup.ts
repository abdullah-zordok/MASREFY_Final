import { Pool } from 'pg';

process.env.NODE_ENV = 'test';
process.env.MASARIFI_PROCESS_KIND ??= 'api';
process.env.MASARIFI_RELEASE_VERSION ??= 'test-release';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:54322/test';
process.env.CLERK_PUBLISHABLE_KEY ??= ['pk', 'test', 'nonfunctionalfixture'].join('_');
process.env.CLERK_SECRET_KEY ??= ['sk', 'test', 'nonfunctionalfixture'].join('_');
process.env.CLERK_INSTANCE_DOMAIN ??= 'example.clerk.accounts.dev';
process.env.CLERK_AUTHORIZED_PARTIES ??= 'https://admin.example.test';
process.env.CLERK_WEBHOOK_SIGNING_SECRET ??= ['whsec', 'nonfunctionalfixture'].join('_');
process.env.MASARIFI_PUSH_TOKEN_HASH_KEY ??= Buffer.alloc(32, 1).toString('base64url');
process.env.MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS ??=
  `active:${Buffer.alloc(32, 2).toString('base64url')}`;

let liveDatabasePool: Pool | undefined;

beforeAll(async () => {
  if (process.env.MASARIFI_LIVE_DATABASE_TESTS !== '1') return;
  liveDatabasePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await liveDatabasePool.query(
    'grant masarifi_api, masarifi_worker, masarifi_migration to current_user with inherit true, set true',
  );
});

afterAll(async () => {
  if (!liveDatabasePool) return;
  try {
    await liveDatabasePool.query(
      'revoke masarifi_api, masarifi_worker, masarifi_migration from current_user granted by current_user',
    );
  } finally {
    await liveDatabasePool.end();
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
