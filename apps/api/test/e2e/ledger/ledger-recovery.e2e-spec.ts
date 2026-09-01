import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import {
  applyPendingMigrations,
  assertCompatibleMigrationHistory,
} from '../../../src/platform/database/migration-runner';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('ledger migration and recovery', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());

  it('keeps the Phase 04 upgrade ordered, immutable, and checksum-complete', () => {
    const root = resolve(__dirname, '../../../../..');
    const migrations = resolve(root, 'supabase/migrations');
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const phase05Start = files.indexOf('20260830080000_phase05_idempotency_bridge.sql');
    expect(files.slice(phase05Start, phase05Start + 4)).toEqual([
      '20260830080000_phase05_idempotency_bridge.sql',
      '20260830080100_phase05_ledger_tables.sql',
      '20260830080200_phase05_ledger_commands.sql',
      '20260830080300_phase05_ledger_access.sql',
    ]);
    expect(files.indexOf('20260829080300_preference_currency_fk.sql')).toBe(
      files.indexOf('20260830080000_phase05_idempotency_bridge.sql') - 1,
    );
    expect(buildMigrationManifest(migrations)).toBe(
      readFileSync(resolve(root, 'supabase/migration-checksums.sha256'), 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    );
    const versions = files.map((name) => name.slice(0, 14));
    expect(() => {
      assertCompatibleMigrationHistory(versions.slice(0, -4), versions);
    }).not.toThrow();
  });

  it('applies the four Phase 05 migrations over a transactional Phase 04 schema', async () => {
    const root = resolve(__dirname, '../../../../..');
    const migrationFiles = [
      '20260830080000_phase05_idempotency_bridge.sql',
      '20260830080100_phase05_ledger_tables.sql',
      '20260830080200_phase05_ledger_commands.sql',
      '20260830080300_phase05_ledger_access.sql',
    ];
    const functionSignatures = [
      'private.guard_idempotency_key()',
      'private.claim_idempotency_key(text,text,text,text,interval)',
      'private.lookup_idempotency_key(text,text,text,text)',
      'private.complete_idempotency_key(text,text,text,text,integer,jsonb,text)',
      'private.reject_ledger_evidence_change()',
      'private.guard_transaction_update()',
      'private.guard_account_balance()',
      'private.ledger_safe_text(text,integer,integer)',
      'private.ledger_begin(text)',
      'private.ledger_next_version(text)',
      'private.ledger_touch_balance(uuid,bigint)',
      'private.ledger_apply_posting(uuid,uuid,bigint,text,text,timestamptz,bigint)',
      'private.ledger_snapshot(uuid)',
      'private.ledger_account_ids(uuid)',
      'private.ledger_record_revision(uuid,text,text,jsonb)',
      'private.ledger_result(uuid,bigint)',
      'private.post_transaction(text,jsonb)',
      'private.transfer_funds(text,jsonb)',
      'private.post_opening_transaction(text,uuid,bigint,text,timestamptz,text)',
      'private.revise_transaction(text,uuid,bigint,jsonb,text)',
      'private.refund_transaction(text,uuid,bigint,bigint,uuid,timestamptz,text)',
      'private.reverse_transaction(text,uuid,bigint,timestamptz,text)',
      'private.soft_delete_transaction(text,uuid,bigint,text)',
      'private.restore_transaction(text,uuid,bigint)',
      'private.reconcile_account_balance(uuid,integer)',
      'private.ledger_actor_is_admin(text)',
    ];
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query('drop view if exists public.v_account_balance_summary');
        await client.query(
          `drop table if exists audit.transaction_revisions,public.transaction_postings,
            public.account_balances,public.transactions,private.idempotency_keys cascade`,
        );
        await client.query(`drop function if exists ${functionSignatures.join(',')} cascade`);
        await client.query('reset role');
        for (const file of migrationFiles) {
          await client.query(readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'));
        }
        const inventory = await client.query<{ relations: string; functions: string }>(`
          select
            (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where (n.nspname,c.relname) in (('private','idempotency_keys'),('public','transactions'),
                ('public','transaction_postings'),('audit','transaction_revisions'),('public','account_balances'))) relations,
            (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='private' and p.proname in ('post_transaction','transfer_funds',
                'reconcile_account_balance')) functions`);
        expect(inventory.rows[0]).toEqual({ relations: '5', functions: '3' });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('rolls a failed migration back and accepts its forward fix without a down migration', async () => {
    const version = '99999999999997';
    const preamble = 'set local role masarifi_migration;';
    await pool.withClient(async (client) => {
      try {
        await expect(
          applyPendingMigrations(
            client,
            [
              {
                version,
                name: 'phase05_failure_probe',
                sql: `${preamble} create table private.phase05_forward_fix_probe(id integer); select 1/0;`,
              },
            ],
            [],
            9_000,
          ),
        ).rejects.toThrow('MIGRATION_APPLY_FAILED');
        const rolledBack = await client.query<{ relation: string | null; history: string }>(
          `
          select to_regclass('private.phase05_forward_fix_probe')::text relation,
            (select count(*)::text from supabase_migrations.schema_migrations where version=$1) history`,
          [version],
        );
        expect(rolledBack.rows[0]).toEqual({ relation: null, history: '0' });

        await applyPendingMigrations(
          client,
          [
            {
              version,
              name: 'phase05_forward_fix_probe',
              sql: `${preamble} create table private.phase05_forward_fix_probe(id integer); reset role;`,
            },
          ],
          [],
          9_000,
        );
        const fixed = await client.query<{ relation: string; history: string }>(
          `
          select to_regclass('private.phase05_forward_fix_probe')::text relation,
            (select count(*)::text from supabase_migrations.schema_migrations where version=$1) history`,
          [version],
        );
        expect(fixed.rows[0]).toEqual({
          relation: 'private.phase05_forward_fix_probe',
          history: '1',
        });
      } finally {
        await client.query('begin');
        await client.query('set local role masarifi_migration');
        await client.query('drop table if exists private.phase05_forward_fix_probe');
        await client.query('reset role');
        await client.query('delete from supabase_migrations.schema_migrations where version=$1', [
          version,
        ]);
        await client.query('commit');
      }
    });
  });

  it('preserves the Phase 04 account query shape for N-1 application rollback', async () => {
    const userId = `ledger_n1_${randomUUID()}`;
    const accountId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [userId]);
        await client.query(
          "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'N-1 cash','cash','SAR')",
          [accountId, userId],
        );
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: userId, sid: 'n-1' }),
        ]);
        await client.query('set local role masarifi_api');
        const account = await client.query(
          `select id,user_id,name,type,btrim(currency_code::text) currency_code,status,version
           from public.accounts where id=$1 and user_id=$2`,
          [accountId, userId],
        );
        expect(account.rows).toEqual([
          {
            id: accountId,
            user_id: userId,
            name: 'N-1 cash',
            type: 'cash',
            currency_code: 'SAR',
            status: 'active',
            version: '1',
          },
        ]);
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('backs up/restores a projection, replays its retained alert, disables writes, and fully reconciles', async () => {
    const ownerId = `ledger_recovery_${randomUUID()}`;
    const accountId = randomUUID();
    const eventId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
        await client.query(
          "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Recovery','cash','SAR')",
          [accountId, ownerId],
        );
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: ownerId, sid: 'recovery' }),
        ]);
        await client.query('set local role masarifi_api');
        await client.query(
          "select private.post_opening_transaction($1,$2,500,'Opening balance',clock_timestamp(),'account_opening')",
          [ownerId, accountId],
        );

        await client.query('set local role masarifi_migration');
        await client.query(
          'create temporary table phase05_projection_backup on commit drop as select * from public.account_balances where account_id=$1',
          [accountId],
        );
        await client.query("select set_config('masarifi.ledger_command','on',true)");
        await client.query(
          'update public.account_balances set confirmed_minor=999 where account_id=$1',
          [accountId],
        );

        await client.query('set local role masarifi_worker');
        const mismatch = await client.query<{ matches: boolean }>(
          'select matches from private.reconcile_account_balance(null,500) where account_id=$1',
          [accountId],
        );
        expect(mismatch.rows[0]?.matches).toBe(false);
        const alert = await client.query<{ id: string }>(
          `select private.enqueue_outbox_event('ledger.reconciliation_failed','account_balance',$1::uuid,
            jsonb_build_object('accountId',$1::uuid,'mismatchKind','confirmed','ledgerVersion',1,
              'observedAt','2026-08-30T08:00:00.000Z','requestId',$2::text)) as id`,
          [accountId, eventId],
        );
        await client.query(
          "update private.outbox_events set available_at='1970-01-01T00:00:00Z' where id=$1",
          [alert.rows[0]?.id],
        );
        const firstClaim = await client.query<{ id: string }>(
          "select id from private.claim_outbox_batch('recovery-first',100,1) where aggregate_id=$1",
          [accountId],
        );
        expect(firstClaim.rows).toHaveLength(1);

        await client.query('set local role masarifi_migration');
        await client.query(
          `update public.account_balances b set confirmed_minor=x.confirmed_minor,
             pending_minor=x.pending_minor,ledger_version=x.ledger_version,reconciled_at=x.reconciled_at
           from phase05_projection_backup x where b.account_id=x.account_id`,
        );
        await client.query(
          "update private.outbox_events set locked_by=null,locked_until=null,available_at='1970-01-01T00:00:00Z' where id=$1",
          [firstClaim.rows[0]?.id],
        );
        await client.query(
          'revoke execute on function private.post_transaction(text,jsonb) from masarifi_api',
        );
        await client.query('savepoint write_denied');
        await client.query('set local role masarifi_api');
        await expect(
          client.query("select private.post_transaction($1,'{}'::jsonb)", [ownerId]),
        ).rejects.toMatchObject({ code: '42501' });
        await client.query('rollback to savepoint write_denied');

        await client.query('set local role masarifi_worker');
        const replay = await client.query<{ id: string }>(
          "select id from private.claim_outbox_batch('recovery-restart',100,30) where aggregate_id=$1",
          [accountId],
        );
        expect(replay.rows.map(({ id }) => id)).toEqual([firstClaim.rows[0]?.id]);
        const reconciled = await client.query<{ matches: boolean }>(
          'select matches from private.reconcile_account_balance(null,500) where account_id=$1',
          [accountId],
        );
        expect(reconciled.rows[0]?.matches).toBe(true);
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });
});
