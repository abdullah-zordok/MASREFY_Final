import {
  financialPlanningSeed,
  fixtureMovement,
  fixturePayment,
  fixturePaymentMatch,
  fixtureSalaryReceipt
} from '@/test-utils/financial-planning-fixtures';

type NativeDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    get(...values: unknown[]): unknown;
    run(...values: unknown[]): { changes: number | bigint };
  };
};

const { DatabaseSync } = jest.requireActual('node:sqlite') as {
  DatabaseSync: new (filename: string) => NativeDatabase;
};

class TestDatabase {
  readonly native = new DatabaseSync(':memory:');

  async execAsync(sql: string) {
    this.native.exec(sql);
  }

  async runAsync(sql: string, ...values: unknown[]) {
    const result = this.native.prepare(sql).run(...values);
    return { changes: Number(result.changes) };
  }

  async getAllAsync<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    return this.native.prepare(sql).all(...values) as T[];
  }

  async getFirstAsync<T>(sql: string, ...values: unknown[]): Promise<T | null> {
    return (this.native.prepare(sql).get(...values) as T | undefined) ?? null;
  }

  async withExclusiveTransactionAsync(
    operation: (database: TestDatabase) => Promise<void>
  ) {
    this.native.exec('BEGIN');
    try {
      await operation(this);
      this.native.exec('COMMIT');
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }

  async closeAsync() {
    this.native.close();
  }
}

let mockDatabase: TestDatabase;
const mockOpenDatabaseAsync = jest.fn(async () => mockDatabase);

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: mockOpenDatabaseAsync,
  defaultDatabaseDirectory: ''
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { openDatabase, resetDatabaseForTests } =
  require('./database') as typeof import('./database');
const { FinancialPlanningRepository } =
  require('./financial-planning-repository') as typeof import('./financial-planning-repository');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(async () => {
  mockDatabase = new TestDatabase();
  resetDatabaseForTests();
  await openDatabase();
  await mockDatabase.execAsync('PRAGMA foreign_keys = ON');
});

afterEach(async () => {
  resetDatabaseForTests();
  await mockDatabase.closeAsync();
});

it('round-trips every planning record and durably quarantines orphan ledger links', async () => {
  const movementTransactionId = 'transaction-goal-movement';
  const orphanMovement = {
    ...fixtureMovement,
    linkedTransactionId: movementTransactionId
  };
  for (const transactionId of [
    fixtureSalaryReceipt.transactionId,
    fixturePayment.transactionId,
    movementTransactionId
  ]) {
    await insertLedgerTransaction(transactionId);
  }
  for (const { categoryId } of financialPlanningSeed.categoryBudgets) {
    await mockDatabase.runAsync(
      "INSERT INTO finance_categories (id, payload, status, updated_at) VALUES (?, '{}', 'active', 1)",
      categoryId
    );
  }

  const original = new FinancialPlanningRepository({
    ...financialPlanningSeed,
    goalMovements: [orphanMovement]
  });
  await original.persistAll();

  const restarted = new FinancialPlanningRepository();
  await restarted.hydrate();
  expect(restarted.activeSalaryProfile()).toEqual(
    financialPlanningSeed.salaryProfiles[0]
  );
  expect(restarted.listPayments()).toEqual([fixturePayment]);
  expect(restarted.listGoalMovements()).toEqual([orphanMovement]);

  await mockDatabase.execAsync('PRAGMA foreign_keys = OFF');
  await mockDatabase.runAsync(
    'DELETE FROM finance_transactions WHERE id IN (?, ?)',
    fixturePayment.transactionId,
    movementTransactionId
  );
  await mockDatabase.execAsync('PRAGMA foreign_keys = ON');

  const quarantined = new FinancialPlanningRepository();
  await quarantined.hydrate();
  expect(quarantined.listQuarantinedLedgerEffects()).toEqual([
    {
      kind: 'obligation-payment',
      id: fixturePayment.id,
      transactionId: fixturePayment.transactionId
    },
    {
      kind: 'goal-movement',
      id: orphanMovement.id,
      transactionId: movementTransactionId
    }
  ]);
  await expect(
    mockDatabase.getFirstAsync(
      'SELECT id FROM planning_obligation_payments WHERE id = ?',
      fixturePayment.id
    )
  ).resolves.toBeNull();
  await expect(
    mockDatabase.getFirstAsync(
      'SELECT id FROM planning_goal_movements WHERE id = ?',
      orphanMovement.id
    )
  ).resolves.toBeNull();
  const storedConflicts = await mockDatabase.getAllAsync<{ payload: string }>(
    "SELECT payload FROM planning_sync_conflicts WHERE entity_kind LIKE 'orphan-%' ORDER BY entity_kind"
  );
  expect(storedConflicts.map(({ payload }) => JSON.parse(payload))).toEqual([
    expect.objectContaining({
      entityKind: 'orphan-goal-movement',
      localSnapshot: orphanMovement
    }),
    expect.objectContaining({
      entityKind: 'orphan-obligation-payment',
      localSnapshot: fixturePayment
    }),
    expect.objectContaining({
      entityKind: 'orphan-payment-match',
      localSnapshot: fixturePaymentMatch
    })
  ]);

  const secondRestart = new FinancialPlanningRepository();
  await secondRestart.hydrate();
  expect(secondRestart.listPayments()).toEqual([]);
  expect(secondRestart.listGoalMovements()).toEqual([]);
  expect(secondRestart.listQuarantinedLedgerEffects()).toEqual(
    quarantined.listQuarantinedLedgerEffects()
  );
  expect(
    secondRestart.requireConflict(
      `orphan-obligation-payment:${fixturePayment.id}`
    )
  ).toMatchObject({ localSnapshot: fixturePayment, status: 'pending' });

  const conflictId = `orphan-obligation-payment:${fixturePayment.id}`;
  expect(() => secondRestart.resolveConflict(conflictId, 'keep_local')).toThrow(
    'offline_unavailable'
  );
  expect(secondRestart.resolveConflict(conflictId, 'keep_later')).toBeNull();
  await secondRestart.persistAll();

  const thirdRestart = new FinancialPlanningRepository();
  await thirdRestart.hydrate();
  expect(thirdRestart.listQuarantinedLedgerEffects()).toEqual([
    {
      kind: 'goal-movement',
      id: orphanMovement.id,
      transactionId: movementTransactionId
    }
  ]);
  expect(thirdRestart.requireConflict(conflictId)).toMatchObject({
    status: 'resolved',
    resolution: 'keep_later'
  });
});

async function insertLedgerTransaction(id: string) {
  const accountId = 'planning-test-account';
  await mockDatabase.runAsync(
    "INSERT OR IGNORE INTO finance_accounts (id, payload, status, is_default, updated_at) VALUES (?, '{}', 'active', 1, 1)",
    accountId
  );
  await mockDatabase.runAsync(
    "INSERT INTO finance_transactions (id, payload, account_id, occurred_at, type, source, status, sync_status, review_status, normalized_title, amount_minor, updated_at) VALUES (?, '{}', ?, 1, 'expense', 'manual', 'posted', 'synced', 'reviewed', 'planning test', 1, 1)",
    id,
    accountId
  );
}
