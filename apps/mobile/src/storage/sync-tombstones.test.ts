import { CoreFinanceSyncAdapter } from './core-finance-sync-adapter';

it('keeps a pending edit and exposes a delete conflict instead of resurrecting or discarding it', async () => {
  const statements: string[] = [];
  const runAsync = jest.fn(async (sql: string) => {
    statements.push(sql);
  });
  const transaction = {
    getFirstAsync: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ present: 1 }),
    runAsync
  };
  const database = {
    ...transaction,
    withExclusiveTransactionAsync: jest.fn(
      async (action: (value: unknown) => Promise<void>) => action(transaction)
    )
  };
  const adapter = new CoreFinanceSyncAdapter(database as never);
  await adapter.applyDelta(
    'transactions',
    [
      {
        resourceId: 'transaction-one',
        operation: 'delete',
        version: 2,
        deletedAt: '2026-08-31T00:00:00.000Z'
      }
    ],
    'cursor-two',
    null
  );
  const sql = statements.join('\n');
  expect(sql).toContain('finance_sync_conflicts');
  expect(sql).not.toContain('UPDATE finance_transactions SET status=?');
});

it('applies a repeated tombstone to a missing row without failing cursor progress', async () => {
  const statements: string[] = [];
  const transaction = {
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async (sql: string) => {
      statements.push(sql);
    })
  };
  const database = {
    ...transaction,
    withExclusiveTransactionAsync: jest.fn(
      async (action: (value: unknown) => Promise<void>) => action(transaction)
    )
  };
  const adapter = new CoreFinanceSyncAdapter(database as never);
  await adapter.applyDelta(
    'accounts',
    [
      {
        resourceId: 'missing-account',
        operation: 'delete',
        version: 3,
        deletedAt: '2026-08-31T00:00:00.000Z'
      }
    ],
    'cursor-three',
    null
  );
  expect(
    statements.some((sql) => sql.includes('UPDATE finance_accounts'))
  ).toBe(true);
  expect(statements.at(-1)).toContain('sync_state');
});
