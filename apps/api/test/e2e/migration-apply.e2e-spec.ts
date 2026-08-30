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
    const processKind = process.env.MASARIFI_PROCESS_KIND;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.MASARIFI_LIVE_DATABASE_TESTS;
    process.env.MASARIFI_PROCESS_KIND = 'migration';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const { runMigrations } = await import('../../src/migration');
      await expect(runMigrations()).resolves.toBe(0);
      await expect(runMigrations()).resolves.toBe(0);
    } finally {
      process.env.MASARIFI_LIVE_DATABASE_TESTS = liveTestFlag;
      process.env.MASARIFI_PROCESS_KIND = processKind;
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
    }

    const schemas = await pool.query<{ name: string }>(
      "select nspname as name from pg_namespace where nspname in ('private', 'audit') order by name",
    );
    expect(schemas.rows.map((row) => row.name)).toEqual(['audit', 'private']);

    const tables = await pool.query<{ name: string }>(
      "select schemaname || '.' || tablename as name from pg_tables where schemaname in ('private', 'audit') order by name",
    );
    expect(tables.rows.map((row) => row.name)).toEqual([
      'audit.audit_events',
      'audit.transaction_revisions',
      'private.account_deletion_requests',
      'private.clerk_webhook_events',
      'private.idempotency_keys',
      'private.outbox_events',
      'private.privacy_export_requests',
      'private.retention_holds',
      'private.retention_policies',
      'private.security_incident_timeline',
      'private.security_incidents',
      'private.support_access_grants',
      'private.support_access_requests',
    ]);

    const functions = await pool.query<{ name: string }>(
      `select proname as name
       from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
       where nspname = 'private'
       order by name`,
    );
    expect(functions.rows.map((row) => row.name)).toEqual([
      'accept_admin_invitation',
      'admin_has_permission',
      'assert_active_profile',
      'assert_admin_permission',
      'assert_support_grant',
      'claim_idempotency_key',
      'claim_outbox_batch',
      'complete_idempotency_key',
      'dispatch_security_alerts',
      'enqueue_outbox_event',
      'guard_account_balance',
      'guard_account_update',
      'guard_category_graph',
      'guard_idempotency_key',
      'guard_transaction_update',
      'is_valid_support_scope',
      'ledger_account_ids',
      'ledger_actor_is_admin',
      'ledger_apply_posting',
      'ledger_begin',
      'ledger_next_version',
      'ledger_record_revision',
      'ledger_result',
      'ledger_safe_text',
      'ledger_snapshot',
      'ledger_touch_balance',
      'lookup_idempotency_key',
      'post_opening_transaction',
      'post_transaction',
      'prevent_retention_hold_overlap',
      'protect_clerk_webhook_receipt',
      'protect_last_super_admin',
      'protect_security_definition',
      'protect_system_role_permissions',
      'read_support_workspace',
      'reconcile_account_balance',
      'refund_transaction',
      'reject_exchange_rate_change',
      'reject_immutable_change',
      'reject_ledger_evidence_change',
      'resolve_category',
      'resolve_exchange_rate',
      'restore_transaction',
      'reverse_transaction',
      'revise_transaction',
      'set_updated_at_and_version',
      'soft_delete_transaction',
      'transfer_funds',
      'validate_support_grant_invariant',
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
