import { readFileSync } from 'node:fs';

describe('tracking ledger ownership boundary', () => {
  it('uses LedgerService and cannot call ledger storage or private commands directly', () => {
    const service = readFileSync('src/tracking/tracking.service.ts', 'utf8');
    const worker = readFileSync('src/tracking/tracking.worker.ts', 'utf8');
    const production = `${service}\n${worker}`;
    expect(production).toContain('LedgerService');
    expect(production).not.toMatch(
      /LedgerRepository|private\.post_transaction|insert\s+into\s+public\.transactions/i,
    );
  });

  it('enforces the account preference again at the tracking ledger boundary', () => {
    const migration = readFileSync(
      '../../supabase/migrations/20260905081000_account_automatic_tracking.sql',
      'utf8',
    );
    expect(migration).toContain('private.assert_automatic_tracking_account');
    expect(migration).toContain("transaction_row.source='tracking-import'");
    expect(migration).toContain('before insert on public.transaction_postings');
  });
});
