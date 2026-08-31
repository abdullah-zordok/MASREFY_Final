import { CoreFinanceSyncAdapter } from './core-finance-sync-adapter';

describe('transactional Mobile delta apply', () => {
  it('does not overwrite a pending local edit mapped to a server ID', async () => {
    const statements: string[] = [];
    const transaction = {
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ local_id: 'local-one' })
        .mockResolvedValueOnce({ present: 1 }),
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
    await adapter.applyBootstrap(
      'accounts',
      [
        {
          id: 'server-one',
          version: 1,
          name: 'Server value',
          type: 'cash',
          currency_code: 'SAR',
          status: 'active',
          created_at: '2026-08-31T00:00:00.000Z',
          updated_at: '2026-08-31T00:00:00.000Z'
        }
      ],
      'cursor-one'
    );
    expect(statements.some((sql) => sql.includes('finance_accounts'))).toBe(
      false
    );
    expect(statements.some((sql) => sql.includes('sync_state'))).toBe(true);
  });

  it('advances the cursor only after every local apply succeeds', async () => {
    const events: string[] = [];
    const transaction = {
      getFirstAsync: jest.fn(async () => null),
      runAsync: jest.fn(async (sql: string) => {
        events.push(sql.includes('sync_state') ? 'cursor' : 'apply');
      })
    };
    const database = {
      ...transaction,
      withExclusiveTransactionAsync: jest.fn(
        async (action: (value: unknown) => Promise<void>) => {
          events.push('begin');
          await action(transaction);
          events.push('commit');
        }
      )
    };
    const adapter = new CoreFinanceSyncAdapter(database as never);
    await adapter.applyDelta(
      'accounts',
      [
        {
          resourceId: 'account-one',
          operation: 'upsert',
          version: 1,
          deletedAt: null,
          snapshot: {
            id: 'account-one',
            name: 'Cash',
            type: 'cash',
            currency_code: 'SAR',
            status: 'active',
            created_at: '2026-08-31T00:00:00.000Z',
            updated_at: '2026-08-31T00:00:00.000Z'
          }
        }
      ],
      'cursor-one',
      null
    );
    expect(events.at(-2)).toBe('cursor');
    expect(events.at(-1)).toBe('commit');
  });

  it('does not advance a cursor when apply fails', async () => {
    const runAsync = jest.fn(async (sql: string) => {
      if (sql.includes('finance_accounts')) throw new Error('disk full');
    });
    const transaction = {
      getFirstAsync: jest.fn(async () => null),
      runAsync
    };
    const database = {
      ...transaction,
      withExclusiveTransactionAsync: jest.fn(
        async (action: (value: unknown) => Promise<void>) => action(transaction)
      )
    };
    const adapter = new CoreFinanceSyncAdapter(database as never);
    await expect(
      adapter.applyDelta(
        'accounts',
        [
          {
            resourceId: 'account-one',
            operation: 'upsert',
            version: 1,
            deletedAt: null,
            snapshot: {
              id: 'account-one',
              name: 'Cash',
              type: 'cash',
              currency_code: 'SAR',
              status: 'active',
              created_at: '2026-08-31T00:00:00.000Z',
              updated_at: '2026-08-31T00:00:00.000Z'
            }
          }
        ],
        'cursor-one',
        null
      )
    ).rejects.toThrow('disk full');
    expect(
      runAsync.mock.calls.some(([sql]) => String(sql).includes('sync_state'))
    ).toBe(false);
  });
});
