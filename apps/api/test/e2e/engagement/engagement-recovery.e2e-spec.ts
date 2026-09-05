import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import {
  applyPendingMigrations,
  assertCompatibleMigrationHistory,
} from '../../../src/platform/database/migration-runner';
import { createLivePool } from '../../live-database';

const root = resolve(__dirname, '../../../../..');
const migrations = resolve(root, 'supabase/migrations');
const phaseFiles = [
  '20260905070527_phase11_notifications.sql',
  '20260905070557_phase11_support.sql',
  '20260905070558_phase11_content_feedback.sql',
  '20260905070618_phase11_functions_access.sql',
];

describe('engagement migration and operational recovery', () => {
  it('keeps Phase 11 additive, ordered, checksum-complete, and N-1 compatible', () => {
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const start = files.indexOf(phaseFiles[0] ?? '');
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

  const liveTest = process.env.MASARIFI_LIVE_DATABASE_TESTS === '1' ? it : it.skip;
  liveTest('rolls a failed Phase 11 migration back and accepts its forward fix', async () => {
    const pool = createLivePool();
    const version = '99999999999981';
    try {
      await pool.withClient(async (client) => {
        try {
          await expect(
            applyPendingMigrations(
              client,
              [
                {
                  version,
                  name: 'phase11_failure_probe',
                  sql: 'set local role masarifi_migration; create table private.phase11_forward_fix_probe(id integer); select 1/0;',
                },
              ],
              [],
              9_000,
            ),
          ).rejects.toThrow('MIGRATION_APPLY_FAILED');
          expect(
            (
              await client.query<{ relation: string | null }>(
                "select to_regclass('private.phase11_forward_fix_probe')::text relation",
              )
            ).rows[0]?.relation,
          ).toBeNull();
          await applyPendingMigrations(
            client,
            [
              {
                version,
                name: 'phase11_failure_probe',
                sql: 'set local role masarifi_migration; create table private.phase11_forward_fix_probe(id integer); reset role;',
              },
            ],
            [],
            9_000,
          );
        } finally {
          await client.query('begin');
          await client.query('set local role masarifi_migration');
          await client.query('drop table if exists private.phase11_forward_fix_probe');
          await client.query('reset role');
          await client.query('delete from supabase_migrations.schema_migrations where version=$1', [
            version,
          ]);
          await client.query('commit');
        }
      });
    } finally {
      await pool.onModuleDestroy();
    }
  });
});
