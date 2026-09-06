import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('operations N-1 compatibility', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../../../../supabase/migrations/20260906130000_phase13_operations.sql'),
    'utf8',
  );

  it('is additive and uses forward correction rather than destructive rollback SQL', () => {
    expect(migration).not.toMatch(/\b(drop|truncate)\s+(table|schema)\b/iu);
    expect(migration).not.toMatch(/alter\s+table\s+(public|audit)\./iu);
    expect(migration).toContain('create table private.scheduled_jobs');
    expect(migration).toContain("set search_path=''");
  });
});
