import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function migrationSql(): Map<number, string> {
  const source = readFileSync(join(__dirname, 'database.ts'), 'utf8');
  const start = source.indexOf('const migrations = parseMigrations(`');
  const end = source.indexOf('`);', start);
  if (start < 0 || end < 0) throw new Error('MOBILE_MIGRATIONS_NOT_FOUND');
  const parts = source
    .slice(start + 'const migrations = parseMigrations(`'.length, end)
    .split(/-- migration:(\d+)\s*/);
  const migrations = new Map<number, string>();
  for (let index = 1; index < parts.length; index += 2)
    migrations.set(Number(parts[index]), parts[index + 1]!.trim());
  return migrations;
}

const sqliteAvailable =
  spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status === 0;

(sqliteAvailable ? describe : describe.skip)(
  'native SQLite sync migration',
  () => {
    it('preserves exact legacy cents and quarantines ambiguous amounts', () => {
      const directory = mkdtempSync(join(tmpdir(), 'masarifi-sync-'));
      const database = join(directory, 'migration.db');
      try {
        const migrations = migrationSql();
        const throughV9 = Array.from({ length: 9 }, (_, index) => {
          const version = index + 1;
          return `${migrations.get(version)}\nINSERT INTO schema_migrations(version,applied_at) VALUES(${version},0);`;
        }).join('\n');
        const result = spawnSync('sqlite3', ['-batch', database], {
          encoding: 'utf8',
          input: `
          PRAGMA foreign_keys=ON;
          CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
          BEGIN IMMEDIATE;
          ${throughV9}
          INSERT INTO offline_entries(local_id,amount,currency_code,category_key,sync_status,created_at,updated_at)
            VALUES('exact',4.25,'SAR','food','pending',0,0),
                  ('review',1.005,'SAR','food','pending',0,0);
          COMMIT;
          BEGIN IMMEDIATE;
          ${migrations.get(10)}
          INSERT INTO schema_migrations(version,applied_at) VALUES(10,0);
          COMMIT;
        `
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        const query = spawnSync(
          'sqlite3',
          [
            '-batch',
            '-separator',
            '|',
            database,
            "SELECT local_id,coalesce(amount_minor,'NULL'),coalesce(last_error_key,'') FROM offline_entries ORDER BY local_id; SELECT count(*) FROM sync_resource_state;"
          ],
          { encoding: 'utf8' }
        );
        expect(query.status).toBe(0);
        expect(query.stdout.trim().split(/\r?\n/)).toEqual([
          'exact|425|',
          'review|NULL|legacy_amount_review_required',
          '0'
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
);
