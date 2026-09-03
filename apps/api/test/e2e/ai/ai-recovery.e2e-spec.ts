import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import {
  applyPendingMigrations,
  assertCompatibleMigrationHistory,
} from '../../../src/platform/database/migration-runner';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI migration and operational recovery', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());

  it('keeps Phase 09 additive, ordered, checksum-complete, and N-1 compatible', () => {
    const root = resolve(__dirname, '../../../../..'),
      migrations = resolve(root, 'supabase/migrations');
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const phaseFiles = [
      '20260903090000_phase09_ai_config.sql',
      '20260903090100_phase09_ai_tables.sql',
      '20260903090200_phase09_ai_functions.sql',
      '20260903090300_phase09_ai_access_seeds.sql',
    ];
    const firstPhaseFile = phaseFiles[0];
    if (!firstPhaseFile) throw new Error('AI_MIGRATION_LIST_EMPTY');
    const start = files.indexOf(firstPhaseFile);
    expect(files.slice(start, start + phaseFiles.length)).toEqual(phaseFiles);
    expect(buildMigrationManifest(migrations)).toBe(
      readFileSync(resolve(root, 'supabase/migration-checksums.sha256'), 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    );
    expect(() => {
      assertCompatibleMigrationHistory(
        files.slice(0, start).map((name) => name.slice(0, 14)),
        files.map((name) => name.slice(0, 14)),
      );
    }).not.toThrow();
    for (const file of phaseFiles)
      expect(readFileSync(resolve(migrations, file), 'utf8')).not.toMatch(
        /\bdrop\s+(?:table|column)\b/i,
      );
  });

  it('rolls a failed Phase 09 migration back and accepts its forward fix', async () => {
    const version = '99999999999992';
    await pool.withClient(async (client) => {
      try {
        await expect(
          applyPendingMigrations(
            client,
            [
              {
                version,
                name: 'phase09_failure_probe',
                sql: 'set local role masarifi_migration; create table private.phase09_forward_fix_probe(id integer); select 1/0;',
              },
            ],
            [],
            9_000,
          ),
        ).rejects.toThrow('MIGRATION_APPLY_FAILED');
        expect(
          (
            await client.query<{ relation: string | null }>(
              "select to_regclass('private.phase09_forward_fix_probe')::text relation",
            )
          ).rows[0]?.relation,
        ).toBeNull();
        await applyPendingMigrations(
          client,
          [
            {
              version,
              name: 'phase09_failure_probe',
              sql: 'set local role masarifi_migration; create table private.phase09_forward_fix_probe(id integer); reset role;',
            },
          ],
          [],
          9_000,
        );
      } finally {
        await client.query('begin');
        await client.query('set local role masarifi_migration');
        await client.query('drop table if exists private.phase09_forward_fix_probe');
        await client.query('reset role');
        await client.query('delete from supabase_migrations.schema_migrations where version=$1', [
          version,
        ]);
        await client.query('commit');
      }
    });
  });

  it('restores media metadata, recovers purge work, rolls route changes back, and keeps finance healthy', async () => {
    const owner = `ai_restore_${randomUUID()}`,
      accountId = randomUUID(),
      transactionId = randomUUID(),
      sessionId = randomUUID();
    await pool.withClient(async (client) => {
      const routeBefore = (
        await client.query<{ enabled: boolean; budget: string }>(
          "select enabled,limits->>'monthlyBudget' budget from private.ai_feature_routes where workload='financial_assistant'",
        )
      ).rows[0];
      if (!routeBefore) throw new Error('AI_ROUTE_FIXTURE_MISSING');
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [owner]);
        await client.query(
          "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'AI outage finance','cash','SAR')",
          [accountId, owner],
        );
        await client.query(
          "insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values($1,$2,'expense','confirmed',100,'SAR','Unaffected finance',clock_timestamp())",
          [transactionId, owner],
        );
        await client.query(
          "insert into public.transaction_postings(transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at) values($1,$2,-100,'confirmed','source',clock_timestamp())",
          [transactionId, accountId],
        );
        await client.query(
          `insert into public.voice_sessions(id,user_id,locale,storage_ref,content_type,size_bytes,status,duration_ms,expires_at,operation_id,created_at)
          values($1,$2,'en',$3,'audio/wav',44,'failed',1000,clock_timestamp()-interval '1 hour',$4,clock_timestamp()-interval '2 hours')`,
          [sessionId, owner, `voice/${sessionId}/${randomUUID()}`, randomUUID()],
        );
        await client.query(
          'create temporary table phase09_voice_backup on commit drop as select * from public.voice_sessions where id=$1',
          [sessionId],
        );
        await client.query('delete from public.voice_sessions where id=$1', [sessionId]);
        await client.query('insert into public.voice_sessions select * from phase09_voice_backup');
        await client.query(
          "update private.ai_feature_routes set enabled=false,limits=jsonb_set(limits,'{monthlyBudget}','49'::jsonb) where workload='financial_assistant'",
        );
        await client.query('set local role masarifi_worker');
        const purge = (
          await client.query<{ id: string; purge_token: string }>(
            "select id,purge_token from private.claim_voice_media_purge('recovery-worker',100,120)",
          )
        ).rows.find(({ id }) => id === sessionId);
        expect(purge).toBeDefined();
        if (!purge) throw new Error('AI_RECOVERY_PURGE_MISSING');
        expect(
          (
            await client.query<{ result: boolean }>(
              'select private.complete_voice_media_purge($1,$2,true,null) result',
              [sessionId, purge.purge_token],
            )
          ).rows[0]?.result,
        ).toBe(true);
        await client.query('set local role masarifi_migration');
        expect(
          (
            await client.query<{ finance: string; storage_ref: string | null }>(
              `select
          (select count(*)::text from public.transactions where id=$1 and status='confirmed') finance,
          (select storage_ref from public.voice_sessions where id=$2) storage_ref`,
              [transactionId, sessionId],
            )
          ).rows[0],
        ).toEqual({ finance: '1', storage_ref: null });
        await client.query('rollback');
        expect(
          (
            await client.query(
              "select enabled,limits->>'monthlyBudget' budget from private.ai_feature_routes where workload='financial_assistant'",
            )
          ).rows[0],
        ).toEqual(routeBefore);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });
});
