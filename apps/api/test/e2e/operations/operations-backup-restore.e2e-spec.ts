import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { PoolService } from '../../../src/platform/database/pool.service';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('operations backup and restore', () => {
  let pool: PoolService;

  beforeAll(() => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4),
    } as never);
  });
  afterAll(async () => pool.onModuleDestroy());

  it('restores owned state in isolation and rejects corrupt rows within the RTO/RPO target', async () => {
    const id = randomUUID();
    const started = performance.now();
    const repositoryRoot = resolve(__dirname, '../../../../..');
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'masarifi-operations-restore-'));
    const backupFile = join(temporaryDirectory, 'provider-health.sql');
    try {
      await pool.query(
        "insert into private.provider_health_checks(id,provider_key,check_type,status,latency_ms) values($1,'database','restore','up',1)",
        [id],
      );
      const before = await pool.query<{ count: string }>(
        'select count(*)::text count from private.provider_health_checks',
      );
      const excluded = await pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname='private' and tablename<>'provider_health_checks' order by tablename",
      );
      execFileSync(
        process.execPath,
        [
          resolve(repositoryRoot, 'apps/api/node_modules/supabase/dist/supabase.js'),
          'db',
          'dump',
          '--workdir',
          repositoryRoot,
          '--local',
          '--data-only',
          '--schema',
          'private',
          '--exclude',
          excluded.rows.map(({ tablename }) => `private.${tablename}`).join(','),
          '--file',
          backupFile,
        ],
        { cwd: resolve(repositoryRoot, 'apps/api'), env: process.env, timeout: 600_000 },
      );
      await pool.query('delete from private.provider_health_checks');
      const projectId = /project_id\s*=\s*"([^"]+)"/.exec(
        readFileSync(resolve(repositoryRoot, 'supabase/config.toml'), 'utf8'),
      )?.[1];
      if (!projectId) throw new Error('SUPABASE_PROJECT_ID_MISSING');
      const databaseContainer = execFileSync(
        'docker',
        ['ps', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Names}}'],
        { encoding: 'utf8', timeout: 30_000 },
      )
        .trim()
        .split(/\r?\n/u)
        .find((name) => name.startsWith('supabase_db_'));
      if (!databaseContainer) throw new Error('SUPABASE_DATABASE_CONTAINER_MISSING');
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          databaseContainer,
          'psql',
          '--set',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
        ],
        { input: readFileSync(backupFile), timeout: 600_000 },
      );
      const restored = await pool.query<{
        provider_key: string;
        status: string;
        age_seconds: number;
        count: string;
        forced: boolean;
      }>(
        `select provider_key,status,extract(epoch from clock_timestamp()-checked_at)::float8 age_seconds,
          (select count(*)::text from private.provider_health_checks) count,
          (select relforcerowsecurity from pg_class where oid='private.provider_health_checks'::regclass) forced
         from private.provider_health_checks where id=$1`,
        [id],
      );
      expect(restored.rows[0]).toMatchObject({
        provider_key: 'database',
        status: 'up',
        count: before.rows[0]?.count,
        forced: true,
      });
      await expect(
        pool.query(
          "insert into private.provider_health_checks(provider_key,check_type,status,latency_ms) values('arbitrary','restore','up',1)",
        ),
      ).rejects.toThrow();
      expect(restored.rows[0]?.age_seconds ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(900);
      expect((performance.now() - started) / 1_000).toBeLessThanOrEqual(7_200);
    } finally {
      await pool.query('delete from private.provider_health_checks where id=$1', [id]);
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 600_000);
});
