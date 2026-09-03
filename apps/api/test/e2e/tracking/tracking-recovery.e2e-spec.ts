import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import {
  applyPendingMigrations,
  assertCompatibleMigrationHistory,
} from '../../../src/platform/database/migration-runner';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('tracking migration and recovery', () => {
  const pool = createLivePool();
  afterAll(async () => {
    await pool.onModuleDestroy();
  });

  it('keeps Phase 08 additive, ordered, checksum-complete, and N-1 compatible', () => {
    const root = resolve(__dirname, '../../../../..');
    const migrations = resolve(root, 'supabase/migrations');
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const phaseFiles = [
      '20260902120000_phase08_tracking_tables.sql',
      '20260902120100_phase08_tracking_functions.sql',
      '20260902120200_phase08_tracking_access_seeds.sql',
    ] as const;
    const start = files.indexOf(phaseFiles[0]);
    expect(files.slice(start, start + phaseFiles.length)).toEqual(phaseFiles);
    expect(buildMigrationManifest(migrations)).toBe(
      readFileSync(resolve(root, 'supabase/migration-checksums.sha256'), 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    );
    const versions = files.map((name) => name.slice(0, 14));
    expect(() => {
      assertCompatibleMigrationHistory(versions.slice(0, start), versions);
    }).not.toThrow();
    for (const file of phaseFiles)
      expect(readFileSync(resolve(migrations, file), 'utf8')).not.toMatch(
        /\bdrop\s+(?:table|column)\b/i,
      );
  });

  it('rolls a failed Phase 08 migration back and accepts its forward fix', async () => {
    const version = '99999999999993';
    await pool.withClient(async (client) => {
      try {
        await expect(
          applyPendingMigrations(
            client,
            [
              {
                version,
                name: 'phase08_failure_probe',
                sql: 'set local role masarifi_migration; create table private.phase08_forward_fix_probe(id integer); select 1/0;',
              },
            ],
            [],
            9_000,
          ),
        ).rejects.toThrow('MIGRATION_APPLY_FAILED');
        const rolledBack = await client.query<{ relation: string | null; history: string }>(
          `select to_regclass('private.phase08_forward_fix_probe')::text relation,
            (select count(*)::text from supabase_migrations.schema_migrations where version=$1) history`,
          [version],
        );
        expect(rolledBack.rows[0]).toEqual({ relation: null, history: '0' });
        await applyPendingMigrations(
          client,
          [
            {
              version,
              name: 'phase08_failure_probe',
              sql: 'set local role masarifi_migration; create table private.phase08_forward_fix_probe(id integer); reset role;',
            },
          ],
          [],
          9_000,
        );
      } finally {
        await client.query('begin');
        await client.query('set local role masarifi_migration');
        await client.query('drop table if exists private.phase08_forward_fix_probe');
        await client.query('reset role');
        await client.query('delete from supabase_migrations.schema_migrations where version=$1', [
          version,
        ]);
        await client.query('commit');
      }
    });
  });

  it('restores tracking evidence, reclaims a crashed lease, and rolls a parser back without a ledger write', async () => {
    const owner = `tracking_recovery_${randomUUID()}`;
    const admin = `tracking_admin_${randomUUID()}`;
    const sessionId = randomUUID();
    const firstToken = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query(
          "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
          [owner, admin],
        );
        await client.query(
          "insert into public.admin_profiles(user_id,status) values($1,'active')",
          [admin],
        );
        await client.query(
          "insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason) select $1,id,$1,'Phase 08 recovery verification' from public.roles where key='super-admin'",
          [admin],
        );
        await client.query(
          `insert into public.import_sessions(
            id,user_id,source_type,request_hash,status,item_count,attempt_count,
            claim_token,claimed_by,lease_until,next_attempt_at,started_at
          )
           values($1,$2,'manual',$3,'processing',1,1,$4,'recovery-first',
            clock_timestamp()-interval '1 second','1970-01-01'::timestamptz,'1970-01-01'::timestamptz)`,
          [sessionId, owner, 'c'.repeat(64), firstToken],
        );
        await client.query(
          `insert into private.import_attempts(session_id,attempt_no,worker_id,fence_token,started_at,lease_until)
           values($1,1,'recovery-first',$2,clock_timestamp()-interval '10 seconds',
            clock_timestamp()-interval '1 second')`,
          [sessionId, firstToken],
        );
        await client.query(
          `insert into public.tracking_history(user_id,source_type,source_ref,outcome)
           values($1,'manual',$2,'received')`,
          [owner, sessionId],
        );
        await client.query(
          'create temporary table phase08_history_backup on commit drop as select * from public.tracking_history where user_id=$1',
          [owner],
        );
        await client.query("select set_config('app.tracking_retention','on',true)");
        await client.query('delete from public.tracking_history where user_id=$1', [owner]);
        await client.query(
          'insert into public.tracking_history select * from phase08_history_backup',
        );

        await client.query('set local role masarifi_worker');
        const reclaimed = await client.query<{ claim_token: string }>(
          "select claim_token from private.claim_import_session('recovery-second',1,30) where id=$1",
          [sessionId],
        );

        await client.query('set local role masarifi_migration');
        const rule = await client.query<{ version: string }>(
          "select version::text from public.parser_rules where id='08000000-0000-4000-8000-000000000021'",
        );
        const secondVersion = randomUUID();
        await client.query(
          `insert into public.parser_rule_versions(id,parser_rule_id,version_no,definition,definition_hash,created_by,corpus_status)
           select $1,id,2,$2::jsonb,encode(extensions.digest(convert_to(($2::jsonb)::text,'UTF8'),'sha256'),'hex'),$3,'passed'
           from public.parser_rules where id='08000000-0000-4000-8000-000000000021'`,
          [
            secondVersion,
            '{"version":1,"match":[],"captures":[],"output":{"currency":"SAR"}}',
            admin,
          ],
        );
        await client.query(
          `insert into public.parser_test_cases(parser_version_id,name,input_fixture,expected_output,last_result,last_run_at)
           values($1,'Recovery corpus match','FICTIONAL: recovery','{"currency":"SAR"}','passed',clock_timestamp()),
             ($1,'Recovery corpus reject','FICTIONAL: unrelated','{}','passed',clock_timestamp())`,
          [secondVersion],
        );
        await client.query('select private.publish_parser_version($1,$2,$3,$4)', [
          secondVersion,
          Number(rule.rows[0]?.version),
          'system:seed',
          'Recovery publishes passing parser corpus',
        ]);
        const current = await client.query<{ version: string }>(
          "select version::text from public.parser_rules where id='08000000-0000-4000-8000-000000000021'",
        );
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: admin, sid: 'tracking-recovery' }),
        ]);
        await client.query('set local role masarifi_api');
        await client.query(
          "select private.mutate_tracking_admin('versions',$1,'rollback','{}',$2,$3,$4)",
          [
            '08000000-0000-4000-8000-000000000031',
            Number(current.rows[0]?.version),
            'Recovery rolls back to the last passing parser',
            admin,
          ],
        );
        await client.query('set local role masarifi_migration');
        const evidence = await client.query<{
          history: string;
          attempts: string;
          active: string;
          transactions: string;
        }>(
          `select
            (select count(*)::text from public.tracking_history where user_id=$1) history,
            (select count(*)::text from private.import_attempts where session_id=$2) attempts,
            (select active_version_id::text from public.parser_rules where id='08000000-0000-4000-8000-000000000021') active,
            (select count(*)::text from public.transactions where user_id=$1) transactions`,
          [owner, sessionId],
        );
        expect(firstToken).not.toBe(reclaimed.rows[0]?.claim_token);
        expect(evidence.rows[0]).toEqual({
          history: '1',
          attempts: '2',
          active: '08000000-0000-4000-8000-000000000031',
          transactions: '0',
        });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });
});
