import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { PoolService } from '../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase, removeOutbox, seedOutbox } from '../live-database';

interface Inventory {
  columns: Array<Record<string, unknown>>;
  grants: Array<Record<string, unknown>>;
  buckets: Array<Record<string, unknown>>;
  queuePresent: boolean;
  outboxRows: string;
}

async function inventory(pool: PoolService): Promise<Inventory> {
  const [columns, grants, buckets, queue, rows] = await Promise.all([
    pool.query(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'private' and table_name = 'outbox_events'
       order by ordinal_position`,
    ),
    pool.query(
      `select grantee, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'private' and table_name = 'outbox_events'
       order by grantee, privilege_type`,
    ),
    pool.query(
      "select id, name, public from storage.buckets where id in ('support-attachments', 'report-exports', 'voice-temp') order by id",
    ),
    pool.query<{ present: boolean }>(
      `select to_regclass('pgmq."q_platform-events"') is not null as present`,
    ),
    pool.query<{ count: string }>('select count(*)::text as count from private.outbox_events'),
  ]);
  return {
    columns: columns.rows,
    grants: grants.rows,
    buckets: buckets.rows,
    queuePresent: queue.rows[0]?.present ?? false,
    outboxRows: rows.rows[0]?.count ?? '0',
  };
}

describeLiveDatabase('foundation backup and restore', () => {
  let pool: PoolService;

  beforeAll(() => {
    pool = createLivePool();
  });
  afterAll(async () => pool.onModuleDestroy());

  it('restores all outbox rows without changing owned definitions, grants, buckets, or queue', async () => {
    const repositoryRoot = resolve(__dirname, '../../../..');
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'masarifi-backup-'));
    const backupFile = join(temporaryDirectory, 'private-data.sql');
    const aggregateId = await seedOutbox(pool, 3);

    try {
      const before = await inventory(pool);
      const excluded = await pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname='private' and tablename<>'outbox_events' order by tablename",
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
        {
          cwd: resolve(repositoryRoot, 'apps/api'),
          env: process.env,
          timeout: 600_000,
        },
      );

      await pool.query('truncate table private.outbox_events');
      const projectId = /project_id\s*=\s*"([^"]+)"/.exec(
        readFileSync(resolve(repositoryRoot, 'supabase/config.toml'), 'utf8'),
      )?.[1];
      if (!projectId) throw new Error('SUPABASE_PROJECT_ID_MISSING');
      const containers = execFileSync(
        'docker',
        ['ps', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Names}}'],
        { encoding: 'utf8', timeout: 30_000 },
      )
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      const databaseContainer = containers.find((name) => name.startsWith('supabase_db_'));
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
        {
          input: readFileSync(backupFile),
          timeout: 600_000,
        },
      );

      const after = await inventory(pool);
      expect(after).toEqual(before);
    } finally {
      await removeOutbox(pool, aggregateId);
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 900_000);
});
