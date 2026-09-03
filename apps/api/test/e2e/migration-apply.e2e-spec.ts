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
      'private.import_attempts',
      'private.outbox_events',
      'private.planning_job_claims',
      'private.planning_reminder_intents',
      'private.privacy_export_requests',
      'private.raw_ingestion_payloads',
      'private.retention_holds',
      'private.retention_policies',
      'private.security_incident_timeline',
      'private.security_incidents',
      'private.support_access_grants',
      'private.support_access_requests',
      'private.sync_cursor_positions',
    ]);

    const functions = await pool.query<{ name: string }>(
      `select proname as name
       from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
       where nspname = 'private'
       order by name`,
    );
    expect(functions.rows.map((row) => row.name)).toEqual([
      'accept_admin_invitation',
      'accept_import_item',
      'ack_client_sync_cursor',
      'admin_has_permission',
      'allocate_obligation_payment',
      'apply_parser_result',
      'assert_active_profile',
      'assert_active_sync_device',
      'assert_admin_permission',
      'assert_support_grant',
      'attach_outbox_sync_metadata',
      'attach_planning_sync_metadata',
      'check_sync_reconciliation',
      'claim_client_mutations',
      'claim_duplicate_decision',
      'claim_idempotency_key',
      'claim_import_session',
      'claim_outbox_batch',
      'claim_parser_corpus',
      'claim_planning_job',
      'claim_planning_match_candidates',
      'claim_planning_obligation_schedules',
      'claim_planning_overdue',
      'claim_planning_reminders',
      'claim_planning_salary_cycles',
      'claim_review_decision',
      'claim_sync_idempotency_key',
      'claim_tracking_admin_idempotency',
      'clear_tracking_history',
      'compact_tracking_history',
      'complete_client_mutation',
      'complete_idempotency_key',
      'complete_import_attempt',
      'complete_parser_corpus',
      'complete_planning_claim',
      'complete_raw_ingestion_purge',
      'complete_sync_idempotency_key',
      'complete_tracking_admin_idempotency',
      'compute_duplicate_candidates',
      'create_import_session',
      'create_review_item',
      'create_transaction_conflict',
      'decide_duplicate_candidate',
      'decide_payment_match',
      'decide_review_item',
      'defer_import_item',
      'delete_keyword_rule',
      'delete_sender_rule',
      'delete_tracking_data',
      'dispatch_security_alerts',
      'enqueue_outbox_event',
      'execute_planning_claim',
      'export_tracking_batch',
      'export_tracking_data',
      'finalize_import_session',
      'generate_obligation_schedule',
      'generate_salary_receipts',
      'get_sync_bounds',
      'get_sync_delta',
      'get_tracking_preferences',
      'guard_account_balance',
      'guard_account_update',
      'guard_category_graph',
      'guard_client_mutation',
      'guard_idempotency_key',
      'guard_outbox_payload',
      'guard_published_parser_version',
      'guard_tracking_history_change',
      'guard_transaction_conflict',
      'guard_transaction_update',
      'invalidate_linked_obligation_payments',
      'invalidate_linked_obligation_payments_after_ledger_status',
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
      'link_salary_receipt',
      'lookup_idempotency_key',
      'mark_planning_overdue',
      'mutate_tracking_admin',
      'next_sync_cursor',
      'planning_thresholds_valid',
      'post_opening_transaction',
      'post_transaction',
      'prepare_import_session',
      'prevent_retention_hold_overlap',
      'propose_payment_matches',
      'protect_clerk_webhook_receipt',
      'protect_last_super_admin',
      'protect_security_definition',
      'protect_system_role_permissions',
      'publish_parser_version',
      'purge_raw_ingestion_payloads',
      'queue_parser_corpus',
      'queue_raw_ingestion_cleanup',
      'raw_ingestion_payload_registered',
      'read_admin_planning_summary',
      'read_parser_corpus',
      'read_parser_preview',
      'read_support_workspace',
      'read_tracking_admin',
      'read_tracking_raw_refs',
      'receive_client_mutation',
      'recompute_obligation_schedule_item',
      'reconcile_account_balance',
      'reconcile_import_session_counts',
      'reconcile_import_sessions',
      'reconcile_planning',
      'record_savings_movement',
      'record_sync_cursor_issued',
      'record_tracking_feedback',
      'record_unsupported_import',
      'refund_transaction',
      'register_raw_ingestion_payload',
      'reject_exchange_rate_change',
      'reject_immutable_change',
      'reject_ledger_evidence_change',
      'reject_planning_history_change',
      'replace_budget_categories',
      'resolve_category',
      'resolve_exchange_rate',
      'resolve_transaction_conflict',
      'restore_default_keyword_rules',
      'restore_linked_obligation_payments',
      'restore_linked_obligation_payments_after_ledger_status',
      'restore_transaction',
      'retry_client_mutation',
      'reverse_savings_movement',
      'reverse_transaction',
      'revise_transaction',
      'run_sync_maintenance',
      'save_budget',
      'save_obligation',
      'save_salary_profile',
      'save_savings_goal',
      'set_updated_at_and_version',
      'soft_delete_transaction',
      'tracking_operational_metrics',
      'tracking_request_id',
      'transfer_funds',
      'update_tracking_preferences',
      'upsert_keyword_rule',
      'upsert_sender_rule',
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
      "select id, public from storage.buckets where id in ('support-attachments', 'report-exports', 'tracking-imports', 'voice-temp') order by id",
    );
    expect(buckets.rows).toEqual([
      { id: 'report-exports', public: false },
      { id: 'support-attachments', public: false },
      { id: 'tracking-imports', public: false },
      { id: 'voice-temp', public: false },
    ]);

    const queue = await pool.query<{ present: boolean }>(
      `select to_regclass('pgmq."q_platform-events"') is not null as present`,
    );
    expect(queue.rows[0]?.present).toBe(true);
  }, 600_000);
});
