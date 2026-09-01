import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { CoreFinanceRepository } from './core-finance-repository';

type NativeSqlite = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    run(...values: unknown[]): { changes: number | bigint };
  };
};

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (filename: string) => NativeSqlite;
};

class ForeignKeySqlite {
  private readonly database = new DatabaseSync(':memory:');

  constructor() {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE finance_accounts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        status TEXT,
        is_default INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE finance_categories (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        parent_id TEXT,
        status TEXT,
        merged_into_id TEXT,
        updated_at INTEGER
      );
      CREATE TABLE finance_transactions (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES finance_accounts(id),
        destination_account_id TEXT REFERENCES finance_accounts(id),
        category_id TEXT REFERENCES finance_categories(id),
        occurred_at INTEGER,
        type TEXT,
        source TEXT,
        status TEXT,
        sync_status TEXT,
        review_status TEXT,
        normalized_title TEXT,
        amount_minor INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE finance_drafts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE finance_sync_conflicts (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id),
        payload TEXT NOT NULL
      );
      CREATE TABLE finance_corrections (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id),
        payload TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE finance_operations (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id),
        payload TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE planning_salary_receipts (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id)
      );
      CREATE TABLE planning_obligation_payments (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id)
      );
      CREATE TABLE planning_goal_movements (
        id TEXT PRIMARY KEY,
        linked_transaction_id TEXT REFERENCES finance_transactions(id)
      );
      CREATE TABLE tracking_feedback (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES finance_transactions(id)
      );
    `);
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
  ) {
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

let mockDatabase: ForeignKeySqlite;

jest.mock('./database', () => ({
  openDatabase: jest.fn(async () => mockDatabase),
  runExclusiveDatabaseTransaction: jest.fn(
    async (
      sqlite: ForeignKeySqlite,
      operation: (transaction: ForeignKeySqlite) => Promise<void>
    ) => sqlite.withExclusiveTransactionAsync(operation)
  )
}));

beforeEach(async () => {
  mockDatabase = new ForeignKeySqlite();
  await mockDatabase.runAsync(
    'INSERT INTO finance_accounts (id, payload) VALUES (?, ?)',
    fixtureAccounts[0].id,
    JSON.stringify(fixtureAccounts[0])
  );
  await mockDatabase.runAsync(
    'INSERT INTO finance_categories (id, payload) VALUES (?, ?)',
    fixtureTransactions[0].categoryId,
    JSON.stringify(
      fixtureCategories.find(
        (category) => category.id === fixtureTransactions[0].categoryId
      )
    )
  );
  await mockDatabase.runAsync(
    'INSERT INTO finance_transactions (id, payload, account_id, category_id) VALUES (?, ?, ?, ?)',
    fixtureTransactions[0].id,
    JSON.stringify(fixtureTransactions[0]),
    fixtureTransactions[0].accountId,
    fixtureTransactions[0].categoryId
  );
});

afterEach(() => mockDatabase.close());

test.each([
  [
    'finance correction',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO finance_corrections (id, transaction_id, payload, status) VALUES (?, ?, ?, ?)',
        'correction-legacy',
        fixtureTransactions[0].id,
        JSON.stringify({ priorStatus: 'posted' }),
        'undoable'
      )
  ],
  [
    'finance operation',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO finance_operations (id, operation_id, transaction_id, payload, status) VALUES (?, ?, ?, ?, ?)',
        'operation-legacy',
        'operation-legacy',
        fixtureTransactions[0].id,
        JSON.stringify(fixtureTransactions[0]),
        'succeeded'
      )
  ],
  [
    'sync conflict',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO finance_sync_conflicts (id, transaction_id, payload) VALUES (?, ?, ?)',
        'conflict-legacy',
        fixtureTransactions[0].id,
        JSON.stringify({})
      )
  ],
  [
    'salary receipt',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO planning_salary_receipts (id, transaction_id) VALUES (?, ?)',
        'salary-legacy',
        fixtureTransactions[0].id
      )
  ],
  [
    'obligation payment',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO planning_obligation_payments (id, transaction_id) VALUES (?, ?)',
        'payment-legacy',
        fixtureTransactions[0].id
      )
  ],
  [
    'goal movement',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO planning_goal_movements (id, linked_transaction_id) VALUES (?, ?)',
        'movement-legacy',
        fixtureTransactions[0].id
      )
  ],
  [
    'tracking feedback',
    () =>
      mockDatabase.runAsync(
        'INSERT INTO tracking_feedback (id, transaction_id) VALUES (?, ?)',
        'feedback-legacy',
        fixtureTransactions[0].id
      )
  ]
])(
  'retains an exact fixture transaction referenced by a persisted %s',
  async (_name, seedDependency) => {
    await seedDependency();

    const repository = new CoreFinanceRepository({
      cleanupLegacyFixtures: true
    });
    await repository.hydrate();

    expect(repository.requireTransaction(fixtureTransactions[0].id)).toEqual(
      fixtureTransactions[0]
    );
    expect(repository.requireAccount(fixtureAccounts[0].id)).toEqual(
      fixtureAccounts[0]
    );
  }
);
