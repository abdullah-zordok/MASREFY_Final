import type { PoolService } from '../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../live-database';

describeLiveDatabase('migration application', () => {
  let pool: PoolService;

  beforeAll(() => {
    pool = createLivePool();
  });
  afterAll(async () => pool.onModuleDestroy());

  it('is idempotent and creates only the registered application inventory', async () => {
    const liveTestFlag = process.env.MASARIFI_LIVE_DATABASE_TESTS;
    delete process.env.MASARIFI_LIVE_DATABASE_TESTS;
    try {
      const { runMigrations } = await import('../../src/migration');
      await expect(runMigrations()).resolves.toBe(0);
      await expect(runMigrations()).resolves.toBe(0);
    } finally {
      process.env.MASARIFI_LIVE_DATABASE_TESTS = liveTestFlag;
    }

    const schemas = await pool.query<{ name: string }>(
      "select nspname as name from pg_namespace where nspname in ('private', 'audit') order by name",
    );
    expect(schemas.rows.map((row) => row.name)).toEqual(['audit', 'private']);

    const tables = await pool.query<{ name: string }>(
      "select schemaname || '.' || tablename as name from pg_tables where schemaname in ('private', 'audit') order by name",
    );
    expect(tables.rows.map((row) => row.name)).toEqual([
      'private.clerk_webhook_events',
      'private.outbox_events',
    ]);

    const functions = await pool.query<{ name: string }>(
      `select proname as name
       from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
       where nspname = 'private'
       order by name`,
    );
    expect(functions.rows.map((row) => row.name)).toEqual([
      'assert_active_profile',
      'claim_outbox_batch',
      'enqueue_outbox_event',
      'protect_clerk_webhook_receipt',
      'set_updated_at_and_version',
    ]);

    const roles = await pool.query<{ name: string; login: boolean }>(
      "select rolname as name, rolcanlogin as login from pg_roles where rolname like 'masarifi_%' order by name",
    );
    expect(roles.rows).toEqual([
      { name: 'masarifi_api', login: false },
      { name: 'masarifi_migration', login: false },
      { name: 'masarifi_worker', login: false },
    ]);

    const buckets = await pool.query<{ id: string; public: boolean }>(
      "select id, public from storage.buckets where id in ('support-attachments', 'report-exports', 'voice-temp') order by id",
    );
    expect(buckets.rows).toEqual([
      { id: 'report-exports', public: false },
      { id: 'support-attachments', public: false },
      { id: 'voice-temp', public: false },
    ]);

    const queue = await pool.query<{ present: boolean }>(
      `select to_regclass('pgmq."q_platform-events"') is not null as present`,
    );
    expect(queue.rows[0]?.present).toBe(true);
  }, 600_000);
});
