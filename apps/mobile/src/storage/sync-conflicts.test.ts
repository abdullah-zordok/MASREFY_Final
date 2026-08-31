import { CoreFinanceSyncAdapter } from './core-finance-sync-adapter';

it('maps financial conflict strategies without any keep-both option', async () => {
  let storedPayload = '';
  const runAsync = jest.fn(async (...args: unknown[]) => {
    storedPayload = String(args[3]);
  });
  const adapter = new CoreFinanceSyncAdapter({ runAsync } as never);
  const transaction = {
    id: 'transaction-one',
    kind: 'expense',
    amount_minor: 100,
    fee_minor: 0,
    currency_code: 'SAR',
    title: 'Coffee',
    occurred_at: '2026-08-31T00:00:00.000Z',
    source: 'manual',
    status: 'confirmed',
    version: 2,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    postings: [{ account_id: 'account-one', posting_role: 'source' }]
  };
  await adapter.storeConflict({
    id: 'conflict-one',
    transactionId: 'transaction-one',
    serverSnapshot: transaction,
    clientSnapshot: { ...transaction, title: 'Tea' },
    status: 'resolved',
    resolution: 'duplicate',
    createdAt: '2026-08-31T00:00:00.000Z',
    resolvedAt: '2026-08-31T00:01:00.000Z'
  });
  const payload = storedPayload;
  expect(JSON.parse(payload)).toMatchObject({ resolution: 'keep_later' });
  expect(payload).not.toContain('keep_both');
});
