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
      'cursor-one',
      false
    );
    expect(statements.some((sql) => sql.includes('finance_accounts'))).toBe(
      false
    );
    expect(statements.some((sql) => sql.includes('sync_state'))).toBe(true);
  });

  it('persists bootstrap data per page but advances the delta cursor only after the final page', async () => {
    const runAsync = jest.fn(async (..._args: unknown[]) => undefined);
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

    await adapter.applyBootstrap(
      'accounts',
      [
        {
          id: 'account-page-one',
          version: 1,
          name: 'Cash',
          type: 'cash',
          currency_code: 'SAR',
          status: 'active',
          created_at: '2026-08-31T00:00:00.000Z',
          updated_at: '2026-08-31T00:00:00.000Z'
        }
      ],
      'starting-cursor',
      true
    );

    expect(
      runAsync.mock.calls.some(([sql]) =>
        String(sql).includes('finance_accounts')
      )
    ).toBe(true);
    expect(
      runAsync.mock.calls.some(([sql]) => String(sql).includes('sync_state'))
    ).toBe(false);

    runAsync.mockClear();
    await adapter.applyBootstrap('accounts', [], 'final-cursor', false);

    const cursorWrite = runAsync.mock.calls.find(([sql]) =>
      String(sql).includes('sync_state')
    );
    expect(cursorWrite?.[2]).toBe('final-cursor');
  });

  it.each([
    [undefined, true],
    [false, false]
  ] as const)(
    'maps account automatic tracking from sync snapshots (%s)',
    async (automaticTrackingEnabled, expected) => {
      const transaction = {
        getFirstAsync: jest.fn(async () => null),
        runAsync: jest.fn(async (..._args: unknown[]) => undefined)
      };
      const database = {
        ...transaction,
        withExclusiveTransactionAsync: jest.fn(
          async (action: (value: unknown) => Promise<void>) => action(transaction)
        )
      };
      await new CoreFinanceSyncAdapter(database as never).applyDelta(
        'accounts',
        [
          {
            resourceId: 'account-tracking',
            operation: 'upsert',
            version: 1,
            deletedAt: null,
            snapshot: {
              id: 'account-tracking',
              name: 'Card',
              type: 'credit_card',
              currency_code: 'SAR',
              status: 'active',
              ...(automaticTrackingEnabled === undefined
                ? {}
                : { automatic_tracking_enabled: automaticTrackingEnabled }),
              created_at: '2026-08-31T00:00:00.000Z',
              updated_at: '2026-08-31T00:00:00.000Z'
            }
          }
        ],
        'cursor-tracking',
        null
      );
      const write = transaction.runAsync.mock.calls.find(([sql]) =>
        String(sql).includes('finance_accounts')
      );
      expect(JSON.parse(String(write?.[2])).automaticTrackingEnabled).toBe(
        expected
      );
    }
  );

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

  it.each([
    ['income', 'income', 'active'],
    ['expense', 'expense', 'active'],
    ['transfer', 'expense', 'archived']
  ] as const)(
    'persists synced %s categories with a valid %s financial type and %s status',
    async (kind, financialType, status) => {
      const transaction = {
        getFirstAsync: jest.fn(async () => null),
        runAsync: jest.fn(async (..._args: unknown[]) => undefined)
      };
      const database = {
        ...transaction,
        withExclusiveTransactionAsync: jest.fn(
          async (action: (value: unknown) => Promise<void>) =>
            action(transaction)
        )
      };

      await new CoreFinanceSyncAdapter(database as never).applyDelta(
        'categories',
        [
          {
            resourceId: `category-${kind}`,
            operation: 'upsert',
            version: 1,
            deletedAt: null,
            snapshot: {
              id: `category-${kind}`,
              kind,
              label_ar: 'فئة',
              label_en: 'Category',
              active: true,
              created_at: '2026-08-31T00:00:00.000Z',
              updated_at: '2026-08-31T00:00:00.000Z'
            }
          }
        ],
        `cursor-${kind}`,
        null
      );

      const categoryWrite = transaction.runAsync.mock.calls.find(([sql]) =>
        String(sql).includes('finance_categories')
      );
      expect(JSON.parse(String(categoryWrite?.[2]))).toMatchObject({
        financialType,
        status
      });
    }
  );

  it.each([
    [undefined, 'internal'],
    ['card_payoff', 'card_payoff']
  ] as const)(
    'normalizes synced transfers to no category and %s purpose',
    async (serverPurpose, expectedPurpose) => {
      const transaction = {
        getFirstAsync: jest.fn(async () => null),
        runAsync: jest.fn(async (..._args: unknown[]) => undefined)
      };
      const database = {
        ...transaction,
        withExclusiveTransactionAsync: jest.fn(
          async (action: (value: unknown) => Promise<void>) =>
            action(transaction)
        )
      };
      const snapshot = {
        id: `transfer-${expectedPurpose}`,
        kind: 'transfer',
        transfer_purpose: serverPurpose,
        amount_minor: 1_000,
        currency_code: 'SAR',
        category_id: 'legacy-transfer-category',
        title: 'Transfer',
        source: 'manual',
        status: 'confirmed',
        postings: [
          { posting_role: 'source', account_id: 'source-account' },
          { posting_role: 'destination', account_id: 'card-account' }
        ],
        version: 1,
        occurred_at: '2026-08-31T00:00:00.000Z',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z'
      };

      await new CoreFinanceSyncAdapter(database as never).applyDelta(
        'transactions',
        [
          {
            resourceId: snapshot.id,
            operation: 'upsert',
            version: 1,
            deletedAt: null,
            snapshot
          }
        ],
        `cursor-${expectedPurpose}`,
        null
      );

      const write = transaction.runAsync.mock.calls.find(([sql]) =>
        String(sql).includes('finance_transactions')
      );
      expect(JSON.parse(String(write?.[2]))).toMatchObject({
        categoryId: null,
        transferPurpose: expectedPurpose
      });
      expect(write?.[5]).toBeNull();
    }
  );
});
