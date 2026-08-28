import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const migrationName = /^\d{14}_[a-z0-9_]+\.sql$/;

export function buildMigrationManifest(migrationsDirectory: string): string {
  const files = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (files.some((name) => !migrationName.test(name))) {
    throw new Error('MIGRATION_FILENAME_INVALID');
  }
  return `${files
    .map((name) => {
      const digest = createHash('sha256')
        .update(readFileSync(join(migrationsDirectory, name), 'utf8').replaceAll('\r\n', '\n'))
        .digest('hex');
      return `${digest}  migrations/${name}`;
    })
    .join('\n')}\n`;
}

export function verifyMigrationManifest(migrationsDirectory: string, manifestPath: string): void {
  let expected: string;
  try {
    expected = readFileSync(manifestPath, 'utf8').replaceAll('\r\n', '\n');
  } catch {
    throw new Error('MIGRATION_MANIFEST_MISSING');
  }
  if (buildMigrationManifest(migrationsDirectory) !== expected) {
    throw new Error('MIGRATION_CHECKSUM_MISMATCH');
  }
}

if (require.main === module) {
  const supabaseDirectory = join(process.cwd(), '..', '..', 'supabase');
  const migrationsDirectory = join(supabaseDirectory, 'migrations');
  const manifestPath = join(supabaseDirectory, 'migration-checksums.sha256');
  try {
    if (process.argv.includes('--write')) {
      writeFileSync(manifestPath, buildMigrationManifest(migrationsDirectory));
      process.stdout.write(`${basename(manifestPath)} updated\n`);
    } else {
      verifyMigrationManifest(migrationsDirectory, manifestPath);
      process.stdout.write('migration checksums verified\n');
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'MIGRATION_CHECKSUM_FAILED'}\n`,
    );
    process.exitCode = 1;
  }
}
