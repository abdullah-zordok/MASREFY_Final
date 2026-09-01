import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import {
  applyPendingMigrations,
  assertCompatibleMigrationHistory,
} from '../../../src/platform/database/migration-runner';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('planning migration and recovery', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());

  it('keeps Phase 07 additive, ordered, checksum-complete, and N-1 compatible', () => {
    const root = resolve(__dirname, '../../../../..');
    const migrations = resolve(root, 'supabase/migrations');
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(files.slice(-3)).toEqual([
      '20260831120000_phase07_planning_tables.sql',
      '20260831120100_phase07_planning_functions.sql',
      '20260831120200_phase07_planning_access.sql',
    ]);
    expect(buildMigrationManifest(migrations)).toBe(
      readFileSync(resolve(root, 'supabase/migration-checksums.sha256'), 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    );
    const versions = files.map((name) => name.slice(0, 14));
    expect(() => {
      assertCompatibleMigrationHistory(versions.slice(0, -3), versions);
    }).not.toThrow();
    for (const file of files.slice(-3))
      expect(readFileSync(resolve(migrations, file), 'utf8')).not.toMatch(
        /\bdrop\s+(?:table|column)\b/i,
      );
  });

  it('rolls a failed Phase 07 migration back and accepts the forward fix', async () => {
    const version = '99999999999994';
    await pool.withClient(async (client) => {
      try {
        await expect(
          applyPendingMigrations(
            client,
            [
              {
                version,
                name: 'phase07_failure_probe',
                sql: 'set local role masarifi_migration; create table private.phase07_forward_fix_probe(id integer); select 1/0;',
              },
            ],
            [],
            9_000,
          ),
        ).rejects.toThrow('MIGRATION_APPLY_FAILED');
        const rolledBack = await client.query<{ relation: string | null; history: string }>(
          `select to_regclass('private.phase07_forward_fix_probe')::text relation,
            (select count(*)::text from supabase_migrations.schema_migrations where version=$1) history`,
          [version],
        );
        expect(rolledBack.rows[0]).toEqual({ relation: null, history: '0' });
        await applyPendingMigrations(
          client,
          [
            {
              version,
              name: 'phase07_failure_probe',
              sql: 'set local role masarifi_migration; create table private.phase07_forward_fix_probe(id integer); reset role;',
            },
          ],
          [],
          9_000,
        );
      } finally {
        await client.query('begin');
        await client.query('set local role masarifi_migration');
        await client.query('drop table if exists private.phase07_forward_fix_probe');
        await client.query('reset role');
        await client.query('delete from supabase_migrations.schema_migrations where version=$1', [
          version,
        ]);
        await client.query('commit');
      }
    });
  });

  it('imports an exact planning row and retains rejected input in the Phase 06 queue', async () => {
    const ownerId = `planning_import_${randomUUID()}`;
    const deviceId = randomUUID();
    const profileId = randomUUID();
    const rejectedProfileId = randomUUID();
    const operationId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
        await client.query(
          `insert into public.user_devices(id,user_id,device_fingerprint,clerk_session_id,platform,app_version)
           values($1,$2,$3,'planning-import','ios','1.0.0')`,
          [deviceId, ownerId, `h1:${'7'.repeat(64)}`],
        );
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: ownerId, sid: 'planning-import' }),
        ]);
        await client.query('set local role masarifi_api');
        const command = {
          operation: 'create',
          profileId,
          operationId: randomUUID(),
          requestId: 'planning-import',
          name: 'Imported salary',
          amountMinor: '9007199254740991',
          currencyCode: 'SAR',
          frequency: 'monthly',
          expectedDay: 28,
          customIntervalDays: null,
          accountId: null,
          automaticDetectionEnabled: false,
        };
        await client.query('select private.save_salary_profile($1,$2::jsonb)', [
          ownerId,
          JSON.stringify(command),
        ]);
        const invalidPayload = { ...command, profileId: rejectedProfileId, currencyCode: 'XXX' };
        await client.query('savepoint invalid_import');
        await expect(
          client.query('select private.save_salary_profile($1,$2::jsonb)', [
            ownerId,
            JSON.stringify(invalidPayload),
          ]),
        ).rejects.toThrow(/SALARY_REFERENCE_INVALID/);
        await client.query('rollback to savepoint invalid_import');
        const payloadHash = `sha256:${createHash('sha256').update(JSON.stringify(invalidPayload)).digest('hex')}`;
        const received = await client.query<{ mutation_id: string }>(
          `select mutation_id from private.receive_client_mutation($1,$2,0,$3,'planning','salary-profile',1,
            '{}'::uuid[],'create',$4,null,$5,$6::jsonb)`,
          [
            ownerId,
            deviceId,
            operationId,
            rejectedProfileId,
            payloadHash,
            JSON.stringify(invalidPayload),
          ],
        );
        await client.query('set local role masarifi_migration');
        await client.query(
          `update public.client_mutations set status='rejected',processed_at=clock_timestamp(),
            error='{"code":"PLANNING_IMPORT_CURRENCY"}'::jsonb where id=$1`,
          [received.rows[0]?.mutation_id],
        );
        const evidence = await client.query<{ amount: string; rejected: string; invalid: string }>(
          `select
            (select amount_minor::text from public.salary_profiles where id=$1) amount,
            (select count(*)::text from public.client_mutations where id=$2 and status='rejected'
              and error->>'code'='PLANNING_IMPORT_CURRENCY') rejected,
            (select count(*)::text from public.salary_profiles where id=$3) invalid`,
          [profileId, received.rows[0]?.mutation_id, rejectedProfileId],
        );
        expect(evidence.rows[0]).toEqual({
          amount: '9007199254740991',
          rejected: '1',
          invalid: '0',
        });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('backs up and restores planning rows without changing the ledger or N-1 query shape', async () => {
    const ownerId = `planning_restore_${randomUUID()}`;
    const accountId = randomUUID();
    const transactionId = randomUUID();
    const budgetId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
        await client.query(
          "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Recovery','cash','SAR')",
          [accountId, ownerId],
        );
        await client.query(
          `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at)
           values($1,$2,'expense','confirmed',1250,'SAR','N-1 transaction',clock_timestamp())`,
          [transactionId, ownerId],
        );
        await client.query(
          `insert into public.transaction_postings(id,transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at)
           values($1,$2,$3,-1250,'confirmed','source',clock_timestamp())`,
          [randomUUID(), transactionId, accountId],
        );
        await client.query(
          `insert into public.budgets(id,user_id,name,currency_code,period_start,period_end,total_minor,
            income_target_minor,savings_target_minor,status)
           values($1,$2,'Recovery budget','SAR','2026-09-01','2026-09-30',500000,1200000,200000,'active')`,
          [budgetId, ownerId],
        );
        const before = await client.query<{ signature: string }>(
          `select md5(string_agg(t.id::text||':'||t.amount_minor::text||':'||p.amount_minor::text,',' order by t.id,p.id)) signature
           from public.transactions t join public.transaction_postings p on p.transaction_id=t.id where t.user_id=$1`,
          [ownerId],
        );
        await client.query(
          'create temporary table phase07_budget_backup on commit drop as select * from public.budgets where id=$1',
          [budgetId],
        );
        await client.query('delete from public.budgets where id=$1', [budgetId]);
        await client.query('insert into public.budgets select * from phase07_budget_backup');
        const restored = await client.query<{
          amount: string;
          status: string;
          signature: string;
          n1: string;
        }>(
          `select
            (select total_minor::text from public.budgets where id=$1) amount,
            (select status from public.budgets where id=$1) status,
            (select md5(string_agg(t.id::text||':'||t.amount_minor::text||':'||p.amount_minor::text,',' order by t.id,p.id))
              from public.transactions t join public.transaction_postings p on p.transaction_id=t.id where t.user_id=$2) signature,
            (select count(*)::text from public.accounts a join public.transactions t on t.user_id=a.user_id
              where a.id=$3 and t.id=$4 and a.status='active' and t.status='confirmed') n1`,
          [budgetId, ownerId, accountId, transactionId],
        );
        expect(restored.rows[0]).toEqual({
          amount: '500000',
          status: 'active',
          signature: before.rows[0]?.signature,
          n1: '1',
        });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });
});
