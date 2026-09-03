import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import { PlatformConfigService } from '../config/platform-config.service';
import { verifyMigrationManifest } from './migration-checksums';
import { PoolService } from './pool.service';

const migrationLockKey = '5574319470126001';

interface MigrationClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

export async function withMigrationLock<T>(
  client: MigrationClient,
  action: () => Promise<T>,
): Promise<T> {
  const result = await client.query('select pg_try_advisory_lock($1::bigint) as locked', [
    migrationLockKey,
  ]);
  if (result.rows[0]?.locked !== true) throw new Error('MIGRATION_LOCK_UNAVAILABLE');
  try {
    return await action();
  } finally {
    await client.query('select pg_advisory_unlock($1::bigint) as unlocked', [migrationLockKey]);
  }
}

export function assertCompatibleMigrationHistory(applied: string[], local: string[]): void {
  for (let index = 0; index < applied.length; index += 1) {
    const appliedVersion = applied[index];
    if (!local.includes(appliedVersion ?? '')) {
      if (appliedVersion && appliedVersion > (local.at(-1) ?? '')) {
        throw new Error('MIGRATION_SCHEMA_AHEAD');
      }
      throw new Error('MIGRATION_HISTORY_INVALID');
    }
    if (appliedVersion !== local[index]) throw new Error('MIGRATION_HISTORY_INVALID');
  }
}

export async function applyPendingMigrations(
  client: MigrationClient,
  migrations: MigrationFile[],
  appliedVersions: string[],
  statementTimeoutMs: number,
): Promise<void> {
  const applied = new Set(appliedVersions);
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await client.query('begin');
    try {
      await client.query("select set_config('statement_timeout', $1, true)", [
        `${String(statementTimeoutMs)}ms`,
      ]);
      await client.query(migration.sql);
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, statements, name)
         values ($1, $2, $3)`,
        [migration.version, [migration.sql], migration.name],
      );
      await client.query('commit');
    } catch {
      await client.query('rollback');
      throw new Error('MIGRATION_APPLY_FAILED');
    }
  }
}

@Injectable()
export class MigrationRunner {
  constructor(
    private readonly database: PoolService,
    private readonly config: PlatformConfigService,
  ) {}

  async run(
    repositoryRoot = existsSync(resolve(process.cwd(), 'supabase', 'migration-checksums.sha256'))
      ? process.cwd()
      : resolve(process.cwd(), '..', '..'),
  ): Promise<void> {
    const supabaseDirectory = resolve(repositoryRoot, 'supabase');
    const migrationsDirectory = resolve(supabaseDirectory, 'migrations');
    verifyMigrationManifest(
      migrationsDirectory,
      resolve(supabaseDirectory, 'migration-checksums.sha256'),
    );
    const migrations = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort()
      .map((fileName) => ({
        version: fileName.slice(0, 14),
        name: fileName.slice(15, -4),
        sql: readFileSync(resolve(migrationsDirectory, fileName), 'utf8'),
      }));
    const localVersions = migrations.map((migration) => migration.version);

    await this.database.withClient(async (client) =>
      withMigrationLock(client, async () => {
        const history = await client.query<{ version: string }>(
          'select version from supabase_migrations.schema_migrations order by version',
        );
        assertCompatibleMigrationHistory(
          history.rows.map((row) => row.version),
          localVersions,
        );

        await applyPendingMigrations(
          client,
          migrations,
          history.rows.map((row) => row.version),
          this.config.get('MASARIFI_MIGRATION_STATEMENT_TIMEOUT_MS'),
        );

        const smoke = await client.query<{ outbox: boolean; queue: boolean }>(
          `select
             to_regclass('private.outbox_events') is not null as outbox,
             to_regclass('pgmq."q_platform-events"') is not null as queue`,
        );
        if (!smoke.rows[0]?.outbox || !smoke.rows[0].queue) {
          throw new Error('MIGRATION_SMOKE_FAILED');
        }
      }),
    );
  }
}
