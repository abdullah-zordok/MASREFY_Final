import { CoreFinanceSyncAdapter } from './core-finance-sync-adapter';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as databaseModule from './database';
import { CoreFinanceRepository } from './core-finance-repository';
import { createDefaultCategories } from '@/domain/core-finance-seeds';
import { createLiveCategoryLifecycleService } from '@/services/live/category-lifecycle-service';
import { registerLiveClerkBridge } from '@/services/live/auth-service';

type NativeSqlite = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    get(...values: unknown[]): unknown;
    run(...values: unknown[]): { changes: number | bigint };
  };
};

const { DatabaseSync } = jest.requireActual('node:sqlite') as {
  DatabaseSync: new (filename: string) => NativeSqlite;
};

function mobileMigrations(): string[] {
  const source = readFileSync(join(__dirname, 'database.ts'), 'utf8');
  const start = source.indexOf('const migrations = parseMigrations(`');
  const end = source.indexOf('`);', start);
  if (start < 0 || end < 0) throw new Error('MOBILE_MIGRATIONS_NOT_FOUND');
  const parts = source
    .slice(start + 'const migrations = parseMigrations(`'.length, end)
    .split(/-- migration:(\d+)\s*/);
  const migrations = new Map<number, string>();
  for (let index = 1; index < parts.length; index += 2)
    migrations.set(Number(parts[index]), parts[index + 1]!.trim());
  return Array.from({ length: 11 }, (_, index) => migrations.get(index + 1)!);
}

class SyncSqlite {
  private readonly database = new DatabaseSync(':memory:');

  exec(sql: string): void {
    this.database.exec(sql);
  }

  async execAsync(sql: string): Promise<void> {
    this.exec(sql);
  }

  async getFirstAsync<T>(sql: string, ...values: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...values) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...values) as T[];
  }

  async runAsync(
    sql: string,
    ...values: unknown[]
  ): Promise<{ changes: number }> {
    const result = this.database.prepare(sql).run(...values);
    return { changes: Number(result.changes) };
  }

  async withExclusiveTransactionAsync(
    operation: (database: this) => Promise<void>
  ): Promise<void> {
    this.database.exec('BEGIN');
    try {
      await operation(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

describe('transactional Mobile delta apply', () => {
  it('persists a live child whose remote parent was not previously cached', async () => {
    registerLiveClerkBridge({
      getSession: async () => ({
        id: 'session-owner',
        userId: 'user_owner',
        method: 'google',
        issuedAt: 1,
        expiresAt: 9999999999999
      }),
      getToken: async () => 'owner-token',
      startPhone: jest.fn(),
      verifyPhone: jest.fn(),
      resendPhone: jest.fn(),
      signInWithGoogle: jest.fn(),
      reverifyConflict: jest.fn(),
      signOut: jest.fn()
    });
    const database = new SyncSqlite();
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of mobileMigrations()) database.exec(migration);
    const open = jest
      .spyOn(databaseModule, 'openDatabase')
      .mockResolvedValue(database as never);
    const timestamp = '2026-09-08T00:00:00Z';
    const parent = {
      id: '10000000-0000-4000-8000-000000000020',
      scope: 'custom',
      kind: 'expense',
      labelAr: 'سفر',
      labelEn: 'Travel',
      parentId: null,
      mergedIntoId: null,
      sortOrder: 1,
      active: true,
      status: 'active',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const child = {
      ...parent,
      id: '10000000-0000-4000-8000-000000000021',
      parentId: parent.id
    };
    let created = false;
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async (_url, init) => {
        if (init?.method === 'POST') {
          created = true;
          return new Response(JSON.stringify(child));
        }
        return new Response(
          JSON.stringify({
            items: created ? [child, parent] : [parent],
            nextCursor: null
          })
        );
      });
    const provider = () =>
      createLiveCategoryLifecycleService({
        baseUrl: 'https://api.test',
        token: async () => 'owner-token',
        request
      });
    try {
      await provider().createCategory(
        {
          labelAr: 'سفر',
          labelEn: 'Travel',
          financialType: 'expense',
          parentId: parent.id,
          isFavorite: true
        },
        'create-child'
      );
      expect(await provider().listCategories(true)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: child.id,
            parentId: parent.id,
            isFavorite: true
          })
        ])
      );
      expect(
        await database.getFirstAsync(
          'SELECT parent_id FROM finance_categories WHERE id=?',
          child.id
        )
      ).toEqual({ parent_id: parent.id });
    } finally {
      open.mockRestore();
      database.close();
    }
  });

  it('reloads custom true favorites and system false overrides from the existing SQLite category rows', async () => {
    const database = new SyncSqlite();
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of mobileMigrations()) database.exec(migration);
    const open = jest
      .spyOn(databaseModule, 'openDatabase')
      .mockResolvedValue(database as never);
    try {
      const food = createDefaultCategories().find(
        (category) => category.id === 'food'
      )!;
      const custom = {
        ...food,
        id: '10000000-0000-4000-8000-000000000001',
        kind: 'custom' as const,
        systemKey: null,
        parentId: 'food',
        isFavorite: true
      };
      const repository = new CoreFinanceRepository();
      await repository.persistCategory({ ...food, isFavorite: false });
      await repository.persistCategory(custom);

      const reloaded =
        await new CoreFinanceRepository().readPersistedCategories();
      expect(reloaded.find((category) => category.id === 'food')).toMatchObject(
        { isFavorite: false }
      );
      expect(
        reloaded.find((category) => category.id === custom.id)
      ).toMatchObject({ isFavorite: true, parentId: 'food' });
      await database.runAsync(
        "INSERT INTO sync_mutation_queue(operation_id,domain,resource_type,operation,resource_id,payload,created_at,updated_at) VALUES(?, 'categories', 'category', 'update', ?, '{}', 0, 0)",
        'pending-category',
        custom.id
      );
      await repository.persistCategories([
        { ...custom, labelEn: 'Remote overwrite', isFavorite: false }
      ]);
      expect(
        (await repository.readPersistedCategories()).find(
          (category) => category.id === custom.id
        )
      ).toMatchObject({
        labelEn: custom.labelEn,
        isFavorite: true
      });
      expect(
        await database.getFirstAsync(
          'SELECT status FROM sync_mutation_queue WHERE operation_id=?',
          'pending-category'
        )
      ).toEqual({ status: 'pending' });
      expect(
        await database.getFirstAsync(
          'SELECT COUNT(*) AS count FROM finance_transactions'
        )
      ).toEqual({ count: 0 });
    } finally {
      open.mockRestore();
      database.close();
    }
  });

  it.each([
    ['currency_code', 'sar'],
    ['currency_code', 'SARA'],
    ['statement_day', 0],
    ['statement_day', 29],
    ['payment_due_day', 29],
    ['monthly_interest_rate_basis_points', -1],
    ['monthly_interest_rate_basis_points', 10_001],
    ['minimum_payment_minor', 0],
    ['minimum_payment_minor', Number.MAX_SAFE_INTEGER + 1],
    ['credit_limit_minor', -1],
    ['credit_limit_minor', 0.5],
    ['opened_at', '2026-02-30'],
    ['closed_at', '2026-01-01T00:00:00Z'],
    ['closed_at', '2026-13-01'],
    ['automatic_tracking_enabled', 'true'],
    ['automatic_tracking_enabled', null],
    ['is_default', null],
    ['include_in_totals', null],
    ['version', '1'],
    ['version', 0]
  ])(
    'rejects invalid account %s=%s without committing SQLite or cursor state',
    async (field, value) => {
      const database = new SyncSqlite();
      for (const migration of mobileMigrations()) database.exec(migration);
      try {
        await expect(
          new CoreFinanceSyncAdapter(database as never).applyBootstrap(
            'accounts',
            [
              {
                id: 'invalid-account',
                name: 'Card',
                type: 'credit_card',
                currency_code: 'SAR',
                status: 'active',
                version: 1,
                created_at: '2026-08-31T00:00:00.000Z',
                updated_at: '2026-08-31T00:00:00.000Z',
                [String(field)]: value
              }
            ],
            'invalid-cursor',
            false
          )
        ).rejects.toThrow('SYNC_SNAPSHOT_INVALID');
        for (const table of [
          'finance_accounts',
          'sync_state',
          'sync_id_mappings'
        ])
          expect(
            await database.getFirstAsync(
              `SELECT COUNT(*) AS count FROM ${table}`
            )
          ).toEqual({ count: 0 });
      } finally {
        database.close();
      }
    }
  );

  it('executes account and conflict-preserving transaction sync in native SQLite', async () => {
    const database = new SyncSqlite();
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of mobileMigrations()) database.exec(migration);
    const adapter = new CoreFinanceSyncAdapter(database as never);
    const timestamp = '2026-08-31T00:00:00.000Z';
    try {
      await adapter.applyBootstrap(
        'accounts',
        [
          {
            id: 'account-one',
            version: 1,
            name: 'Card',
            type: 'credit_card',
            currency_code: 'SAR',
            status: 'active',
            created_at: timestamp,
            updated_at: timestamp
          }
        ],
        'accounts-cursor',
        false
      );
      await adapter.applyBootstrap(
        'categories',
        [
          {
            id: 'food-server',
            version: 1,
            kind: 'expense',
            system_key: 'food',
            label_ar: 'طعام',
            label_en: 'Food',
            active: true,
            created_at: timestamp,
            updated_at: timestamp
          },
          {
            id: 'category-one',
            version: 1,
            kind: 'expense',
            label_ar: 'طعام',
            label_en: 'Food',
            parent_id: 'food-server',
            active: true,
            created_at: timestamp,
            updated_at: timestamp
          }
        ],
        'categories-cursor',
        false
      );
      await adapter.applyBootstrap(
        'transactions',
        [
          {
            id: 'transaction-one',
            kind: 'expense',
            amount_minor: 100,
            currency_code: 'SAR',
            category_id: 'category-one',
            title: 'Original',
            source: 'manual',
            status: 'confirmed',
            postings: [
              {
                posting_role: 'source',
                account_id: 'account-one',
                amount_minor: -100
              }
            ],
            version: 1,
            occurred_at: timestamp,
            created_at: timestamp,
            updated_at: timestamp
          }
        ],
        'transactions-cursor',
        false
      );
      await database.runAsync(
        'INSERT INTO finance_sync_conflicts(id,transaction_id,payload,status,created_at) VALUES(?,?,?,?,?)',
        'conflict-one',
        'transaction-one',
        '{}',
        'pending',
        0
      );
      await adapter.applyDelta(
        'transactions',
        [
          {
            resourceId: 'transaction-one',
            operation: 'upsert',
            version: 2,
            deletedAt: null,
            snapshot: {
              id: 'transaction-one',
              kind: 'expense',
              amount_minor: 200,
              currency_code: 'SAR',
              category_id: 'category-one',
              title: 'Server overwrite',
              source: 'manual',
              status: 'confirmed',
              postings: [
                {
                  posting_role: 'source',
                  account_id: 'account-one',
                  amount_minor: -200
                }
              ],
              version: 2,
              occurred_at: timestamp,
              created_at: timestamp,
              updated_at: timestamp
            }
          }
        ],
        'transactions-next',
        null
      );

      const account = await database.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_accounts WHERE id=?',
        'account-one'
      );
      const transaction = await database.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_transactions WHERE id=?',
        'transaction-one'
      );
      const systemCategory = await database.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_categories WHERE id=?',
        'food'
      );
      const customCategory = await database.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_categories WHERE id=?',
        'category-one'
      );
      expect(JSON.parse(account!.payload)).toMatchObject({
        type: 'credit_card'
      });
      expect(JSON.parse(systemCategory!.payload)).toMatchObject({
        id: 'food',
        systemKey: 'food',
        isFavorite: true
      });
      expect(JSON.parse(customCategory!.payload)).toMatchObject({
        parentId: 'food'
      });
      expect(JSON.parse(transaction!.payload)).toMatchObject({
        title: 'Original',
        amountMinor: 100
      });
    } finally {
      database.close();
    }
  });
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

  it('does not overwrite an account while its local conflict is unresolved', async () => {
    const database = new SyncSqlite();
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of mobileMigrations()) database.exec(migration);
    try {
      await database.runAsync(
        'INSERT INTO finance_accounts(id,payload,status,is_default,updated_at) VALUES(?,?,?,?,?)',
        'local-one',
        JSON.stringify({ id: 'local-one', name: 'Local value' }),
        'active',
        0,
        1
      );
      await database.runAsync(
        'INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)',
        'accounts',
        'local-one',
        'server-one',
        1
      );
      await database.runAsync(
        `INSERT INTO sync_mutation_queue(operation_id,domain,resource_type,operation,resource_id,payload,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        'conflict-account',
        'accounts',
        'account',
        'update',
        'local-one',
        '{}',
        'conflict',
        1,
        1
      );

      await new CoreFinanceSyncAdapter(database as never).applyDelta(
        'accounts',
        [
          {
            resourceId: 'server-one',
            operation: 'upsert',
            version: 2,
            deletedAt: null,
            snapshot: {
              id: 'server-one',
              name: 'Server value',
              type: 'cash',
              currency_code: 'SAR',
              status: 'active',
              version: 2,
              created_at: '2026-08-31T00:00:00.000Z',
              updated_at: '2026-08-31T00:00:00.000Z'
            }
          }
        ],
        'conflict-account-cursor',
        null
      );

      const account = await database.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_accounts WHERE id=?',
        'local-one'
      );
      if (!account) throw new Error('account row missing');
      expect(JSON.parse(account.payload)).toMatchObject({
        name: 'Local value'
      });
    } finally {
      database.close();
    }
  });

  it('does not tombstone a category while its local conflict is unresolved', async () => {
    const database = new SyncSqlite();
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of mobileMigrations()) database.exec(migration);
    try {
      await database.runAsync(
        'INSERT INTO finance_categories(id,payload,parent_id,status,merged_into_id,updated_at) VALUES(?,?,?,?,?,?)',
        'local-category',
        JSON.stringify({ id: 'local-category', labelEn: 'Local category' }),
        null,
        'active',
        null,
        1
      );
      await database.runAsync(
        'INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)',
        'categories',
        'local-category',
        'server-category',
        1
      );
      await database.runAsync(
        `INSERT INTO sync_mutation_queue(operation_id,domain,resource_type,operation,resource_id,payload,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        'conflict-category',
        'categories',
        'category',
        'update',
        'local-category',
        '{}',
        'conflict',
        1,
        1
      );

      await new CoreFinanceSyncAdapter(database as never).applyDelta(
        'categories',
        [
          {
            resourceId: 'server-category',
            operation: 'delete',
            version: 2,
            deletedAt: '2026-09-01T00:00:00.000Z'
          }
        ],
        'conflict-category-cursor',
        null
      );

      const category = await database.getFirstAsync<{ status: string }>(
        'SELECT status FROM finance_categories WHERE id=?',
        'local-category'
      );
      expect(category).toEqual({ status: 'active' });
    } finally {
      database.close();
    }
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
          async (action: (value: unknown) => Promise<void>) =>
            action(transaction)
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

  it('maps credit-card terms and defaults legacy snapshots to null', async () => {
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
    const adapter = new CoreFinanceSyncAdapter(database as never);

    await adapter.applyDelta(
      'accounts',
      [
        {
          resourceId: 'terms-card',
          operation: 'upsert',
          version: 1,
          deletedAt: null,
          snapshot: {
            id: 'terms-card',
            name: 'Terms card',
            type: 'credit_card',
            currency_code: 'SAR',
            status: 'active',
            statement_day: 7,
            payment_due_day: 21,
            monthly_interest_rate_basis_points: 125,
            minimum_payment_minor: 5_000,
            created_at: '2026-08-31T00:00:00.000Z',
            updated_at: '2026-08-31T00:00:00.000Z'
          }
        },
        {
          resourceId: 'legacy-card',
          operation: 'upsert',
          version: 1,
          deletedAt: null,
          snapshot: {
            id: 'legacy-card',
            name: 'Legacy card',
            type: 'credit_card',
            currency_code: 'SAR',
            status: 'active',
            created_at: '2026-08-31T00:00:00.000Z',
            updated_at: '2026-08-31T00:00:00.000Z'
          }
        }
      ],
      'cursor-terms',
      null
    );
    const payloads = transaction.runAsync.mock.calls
      .filter(([sql]) => String(sql).includes('finance_accounts'))
      .map((call) => JSON.parse(String(call[2])));
    expect(payloads[0]).toMatchObject({
      statementDay: 7,
      paymentDueDay: 21,
      monthlyInterestRateBasisPoints: 125,
      minimumPaymentMinor: 5_000
    });
    expect(payloads[1]).toMatchObject({
      statementDay: null,
      paymentDueDay: null,
      monthlyInterestRateBasisPoints: null,
      minimumPaymentMinor: null
    });
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

  it.each([
    ['income', 'income', 'active'],
    ['expense', 'expense', 'active'],
    ['transfer', null, 'active']
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

  it.each([
    [
      'accounts',
      {
        id: 'bad-account-type',
        name: 'Bad account',
        type: 'crypto',
        currency_code: 'SAR',
        status: 'active',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z',
        version: 1
      }
    ],
    [
      'accounts',
      {
        id: 'bad-account-status',
        name: 'Bad account',
        type: 'cash',
        currency_code: 'SAR',
        status: 'pending',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z',
        version: 1
      }
    ],
    [
      'categories',
      {
        id: 'bad-category-kind',
        kind: 'liability',
        label_ar: 'فئة',
        label_en: 'Category',
        active: true,
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z',
        version: 1
      }
    ],
    [
      'categories',
      {
        id: 'bad-category-state',
        kind: 'expense',
        label_ar: 'فئة',
        label_en: 'Category',
        active: 'true',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z',
        version: 1
      }
    ],
    [
      'transactions',
      {
        id: 'bad-transaction-kind',
        kind: 'reward',
        amount_minor: 100,
        currency_code: 'SAR',
        accountId: 'account-one',
        title: 'Bad transaction',
        source: 'manual',
        status: 'confirmed',
        version: 1,
        occurred_at: '2026-08-31T00:00:00.000Z',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z'
      }
    ],
    [
      'transactions',
      {
        id: 'bad-transaction-status',
        kind: 'expense',
        amount_minor: 100,
        currency_code: 'SAR',
        accountId: 'account-one',
        title: 'Bad transaction',
        source: 'manual',
        status: 'unknown',
        version: 1,
        occurred_at: '2026-08-31T00:00:00.000Z',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z'
      }
    ],
    [
      'transactions',
      {
        id: 'bad-transaction-source',
        kind: 'expense',
        amount_minor: 100,
        currency_code: 'SAR',
        accountId: 'account-one',
        title: 'Bad transaction',
        source: 'future_source',
        status: 'confirmed',
        version: 1,
        occurred_at: '2026-08-31T00:00:00.000Z',
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z'
      }
    ]
  ] as const)(
    'rejects unknown %s snapshot values',
    async (domain, snapshot) => {
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

      await expect(
        new CoreFinanceSyncAdapter(database as never).applyBootstrap(
          domain,
          [snapshot],
          'bad-cursor',
          false
        )
      ).rejects.toThrow('SYNC_SNAPSHOT_INVALID');
      expect(
        transaction.runAsync.mock.calls.some(([sql]) =>
          String(sql).includes(`finance_${domain}`)
        )
      ).toBe(false);
    }
  );

  it('preserves closed accounts and every server-owned account field', async () => {
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

    await new CoreFinanceSyncAdapter(database as never).applyBootstrap(
      'accounts',
      [
        {
          id: 'closed-card',
          name: 'Closed card',
          type: 'credit_card',
          currency_code: 'SAR',
          institution_name: 'Bank',
          last_four: '1234',
          credit_limit_minor: 20_000,
          statement_day: 7,
          payment_due_day: 21,
          monthly_interest_rate_basis_points: 125,
          minimum_payment_minor: 500,
          automatic_tracking_enabled: false,
          is_default: false,
          icon_key: 'card',
          color_key: 'blue',
          notes: 'Kept',
          status: 'closed',
          sort_order: 4,
          include_in_totals: false,
          opened_at: '2026-01-01',
          closed_at: '2026-08-31',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-08-31T00:00:00.000Z',
          version: 3
        }
      ],
      'closed-cursor',
      false
    );

    const write = transaction.runAsync.mock.calls.find(([sql]) =>
      String(sql).includes('finance_accounts')
    );
    expect(JSON.parse(String(write?.[2]))).toMatchObject({
      institution: 'Bank',
      lastFour: '1234',
      creditLimitMinor: 20_000,
      statementDay: 7,
      paymentDueDay: 21,
      monthlyInterestRateBasisPoints: 125,
      minimumPaymentMinor: 500,
      automaticTrackingEnabled: false,
      isDefault: false,
      iconKey: 'card',
      colorKey: 'blue',
      notes: 'Kept',
      status: 'closed',
      sortOrder: 4,
      includeInTotals: false,
      openedAt: Date.parse('2026-01-01'),
      closedAt: Date.parse('2026-08-31')
    });
  });

  it.each([
    [-45_000, -1],
    [45_000, 1]
  ] as const)(
    'derives opening adjustment sign from its signed posting (%s)',
    async (postingAmount, expectedSign) => {
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

      await new CoreFinanceSyncAdapter(database as never).applyBootstrap(
        'transactions',
        [
          {
            id: `opening-${expectedSign}`,
            kind: 'opening',
            amount_minor: Math.abs(postingAmount),
            currency_code: 'SAR',
            title: 'Opening balance',
            source: 'manual',
            status: 'confirmed',
            postings: [
              {
                posting_role: 'opening',
                account_id: 'account-one',
                amount_minor: postingAmount
              }
            ],
            version: 1,
            occurred_at: '2026-08-31T00:00:00.000Z',
            created_at: '2026-08-31T00:00:00.000Z',
            updated_at: '2026-08-31T00:00:00.000Z'
          }
        ],
        `opening-cursor-${expectedSign}`,
        false
      );

      const write = transaction.runAsync.mock.calls.find(([sql]) =>
        String(sql).includes('finance_transactions')
      );
      expect(JSON.parse(String(write?.[2]))).toMatchObject({
        accountId: 'account-one',
        adjustmentSign: expectedSign,
        source: 'adjustment'
      });
    }
  );

  it('does not overwrite a transaction while its local conflict is unresolved', async () => {
    const transaction = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('sync_id_mappings')) return { local_id: 'local-one' };
        if (sql.includes('finance_sync_conflicts')) return { present: 1 };
        return null;
      }),
      runAsync: jest.fn(async (..._args: unknown[]) => undefined)
    };
    const database = {
      ...transaction,
      withExclusiveTransactionAsync: jest.fn(
        async (action: (value: unknown) => Promise<void>) => action(transaction)
      )
    };

    await new CoreFinanceSyncAdapter(database as never).applyDelta(
      'transactions',
      [
        {
          resourceId: 'server-one',
          operation: 'upsert',
          version: 2,
          deletedAt: null,
          snapshot: {
            id: 'server-one',
            kind: 'expense',
            amount_minor: 100,
            currency_code: 'SAR',
            accountId: 'account-one',
            title: 'Server update',
            source: 'manual',
            status: 'confirmed',
            version: 2,
            occurred_at: '2026-08-31T00:00:00.000Z',
            created_at: '2026-08-31T00:00:00.000Z',
            updated_at: '2026-08-31T00:00:00.000Z'
          }
        }
      ],
      'conflict-cursor',
      null
    );

    expect(
      transaction.runAsync.mock.calls.some(([sql]) =>
        String(sql).includes('finance_transactions')
      )
    ).toBe(false);
  });
});
