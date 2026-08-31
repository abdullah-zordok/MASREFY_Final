import { readFileSync } from 'node:fs';

describe('sync security boundaries', () => {
  const migration = readFileSync(
    '../../supabase/migrations/20260831061405_phase06_sync_schema.sql',
    'utf8',
  );
  const observability = readFileSync('src/sync/sync.observability.ts', 'utf8');

  it('forces owner RLS and denies direct client writes/server-column mutation', () => {
    for (const table of ['client_sync_state', 'client_mutations', 'transaction_conflicts']) {
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toMatch(
        new RegExp(`revoke all on[\\s\\S]*public\\.${table}[\\s\\S]*masarifi_api`),
      );
    }
    expect(migration).toContain('SYNC_MUTATION_IMMUTABLE');
    expect(migration).toContain('SYNC_MUTATION_TERMINAL');
  });

  it('exposes private sync operations only through fixed-search-path functions', () => {
    for (const name of [
      'get_sync_bounds',
      'get_sync_delta',
      'receive_client_mutation',
      'ack_client_sync_cursor',
      'resolve_transaction_conflict',
    ]) {
      expect(migration).toMatch(
        new RegExp(`create function private\\.${name}[\\s\\S]*?set search_path=''`),
      );
      expect(migration).toMatch(new RegExp(`revoke all on function private\\.${name}`));
    }
    expect(migration).toContain("if new.payload ? 'sync'");
    expect(migration).toContain('SYNC_METADATA_RESERVED');
  });

  it('keeps financial payloads and identifiers out of metric labels', () => {
    expect(observability).not.toMatch(/labels?.*(payload|userId|resourceId|idempotency)/i);
    expect(observability).toContain('{ scope: domain }');
    expect(observability).toContain('{ job, outcome }');
  });
});
