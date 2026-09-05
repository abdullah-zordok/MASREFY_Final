import { readFileSync } from 'node:fs';

import { safeError } from '../../../src/platform/http/safe-exception.filter';
import {
  normalizeCreateAccount,
  normalizeCreateCategory,
} from '../../../src/reference/reference.dto';
import { REFERENCE_ROUTES } from '../../../src/reference/reference.controller';
import { PERMISSION_KEYS } from '../../../src/security/permission-manifest';

describe('Phase 04 security boundaries', () => {
  const migration = readFileSync(
    '../../supabase/migrations/20260829080200_reference_runtime_access.sql',
    'utf8',
  );
  const repository = readFileSync('src/reference/reference.repository.ts', 'utf8');
  const remediationMigration = readFileSync(
    '../../supabase/migrations/20260905080000_client_category_usage.sql',
    'utf8',
  );
  const accountTrackingMigration = readFileSync(
    '../../supabase/migrations/20260905081000_account_automatic_tracking.sql',
    'utf8',
  );

  it('forces RLS, revokes anonymous access, and keeps mutation functions server-only', () => {
    for (const table of [
      'currencies',
      'supported_countries',
      'categories',
      'accounts',
      'exchange_rates',
    ]) {
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toContain('from public,anon,authenticated,service_role');
    expect(migration).toContain('revoke all on function private.resolve_category');
    expect(migration).toContain('private.resolve_exchange_rate');
  });

  it('rejects BOLA and property authority supplied through DTOs', () => {
    expect(() =>
      normalizeCreateCategory({ labelAr: 'خاص', labelEn: 'Private', userId: 'other' }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeCreateAccount({ name: 'Cash', type: 'cash', currency: 'SAR', status: 'closed' }),
    ).toThrow('VALIDATION_FAILED');
    expect(repository).toContain('where id=$1 and user_id=$2');
    expect(remediationMigration).toContain(
      'public.current_clerk_user_id() is distinct from p_user_id',
    );
    expect(remediationMigration).toContain('revoke all on function private.get_category_usage');
    expect(remediationMigration).toContain(
      'revoke all on function private.reassign_category_transactions',
    );
    expect(accountTrackingMigration).toContain(
      'revoke all on function private.assert_automatic_tracking_account',
    );
    expect(accountTrackingMigration).toContain("message='TRACKING_ACCOUNT_BLOCKED'");
    expect(accountTrackingMigration).toContain('transaction_postings_tracking_account_gate');
  });

  it('uses exact BFLA permissions and no generic Admin resource route', () => {
    expect(PERMISSION_KEYS).toEqual(expect.arrayContaining(['reference.read', 'reference.write']));
    expect(PERMISSION_KEYS).not.toEqual(expect.arrayContaining(['reference.*', 'reference']));
    expect(
      REFERENCE_ROUTES.filter((route) => route.permission).every(
        (route) => route.permission === 'reference.read' || route.permission === 'reference.write',
      ),
    ).toBe(true);
    expect(REFERENCE_ROUTES.some((route) => route.path.includes(':resource'))).toBe(false);
  });

  it('does not expose database details or sensitive event fields', () => {
    expect(safeError(503, 'request-1', [], 'password=secret SQLSTATE 42501')).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service unavailable',
      requestId: 'request-1',
    });
    expect(repository).not.toMatch(/console\.|logger\..*\b(name|notes|lastFour|rate|reason)\b/);
  });
});
