import {
  assertGoalMovementAllowed,
  deriveSavingsProgress,
  FinancialPlanningError,
  type Budget,
  type CategoryBudget,
  type GoalMovement,
  type Obligation,
  type ObligationLifecycle,
  type ObligationPayment,
  type ObligationScheduleItem,
  type PaymentMatch,
  type PlanningConflict,
  type PlanningDraft,
  type SalaryProfile,
  type SalaryReceiptLink,
  type SavingsGoal
} from '@/domain/financial-planning';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

export interface FinancialPlanningSeed {
  salaryProfiles?: SalaryProfile[];
  salaryReceipts?: SalaryReceiptLink[];
  budgets?: Budget[];
  categoryBudgets?: CategoryBudget[];
  obligations?: Obligation[];
  scheduleItems?: ObligationScheduleItem[];
  payments?: ObligationPayment[];
  paymentMatches?: PaymentMatch[];
  savingsGoals?: SavingsGoal[];
  goalMovements?: GoalMovement[];
  drafts?: PlanningDraft[];
  conflicts?: PlanningConflict[];
}

export class FinancialPlanningRepository {
  private readonly seed: FinancialPlanningSeed;
  private salaryProfiles: SalaryProfile[];
  private salaryReceipts: SalaryReceiptLink[];
  private budgets: Budget[];
  private categoryBudgets: CategoryBudget[];
  private obligations: Obligation[];
  private scheduleItems: ObligationScheduleItem[];
  private payments: ObligationPayment[];
  private paymentMatches: PaymentMatch[];
  private savingsGoals: SavingsGoal[];
  private goalMovements: GoalMovement[];
  private drafts: PlanningDraft[];
  private conflicts: PlanningConflict[];
  private operationResults = new Map<string, unknown>();
  private sequence = 0;

  constructor(seed: FinancialPlanningSeed = {}) {
    this.seed = copy(seed);
    this.salaryProfiles = seed.salaryProfiles?.map(copy) ?? [];
    this.salaryReceipts = seed.salaryReceipts?.map(copy) ?? [];
    this.budgets = seed.budgets?.map(normalizeBudget) ?? [];
    this.categoryBudgets = seed.categoryBudgets?.map(copy) ?? [];
    this.obligations = seed.obligations?.map(copy) ?? [];
    this.scheduleItems = seed.scheduleItems?.map(copy) ?? [];
    this.payments = seed.payments?.map(copy) ?? [];
    this.paymentMatches = seed.paymentMatches?.map(copy) ?? [];
    this.savingsGoals = seed.savingsGoals?.map(copy) ?? [];
    this.goalMovements = seed.goalMovements?.map(copy) ?? [];
    this.drafts = seed.drafts?.map(copy) ?? [];
    this.conflicts = seed.conflicts?.map(copy) ?? [];
  }

  reset(): void {
    const seed = this.seed;
    this.salaryProfiles = seed.salaryProfiles?.map(copy) ?? [];
    this.salaryReceipts = seed.salaryReceipts?.map(copy) ?? [];
    this.budgets = seed.budgets?.map(normalizeBudget) ?? [];
    this.categoryBudgets = seed.categoryBudgets?.map(copy) ?? [];
    this.obligations = seed.obligations?.map(copy) ?? [];
    this.scheduleItems = seed.scheduleItems?.map(copy) ?? [];
    this.payments = seed.payments?.map(copy) ?? [];
    this.paymentMatches = seed.paymentMatches?.map(copy) ?? [];
    this.savingsGoals = seed.savingsGoals?.map(copy) ?? [];
    this.goalMovements = seed.goalMovements?.map(copy) ?? [];
    this.drafts = seed.drafts?.map(copy) ?? [];
    this.conflicts = seed.conflicts?.map(copy) ?? [];
    this.operationResults.clear();
    this.sequence = 0;
  }

  relocalizeDemoFixtures(seed: FinancialPlanningSeed): void {
    const salaryProfiles = new Map(
      seed.salaryProfiles?.map((profile) => [profile.id, profile])
    );
    const budgets = new Map(seed.budgets?.map((budget) => [budget.id, budget]));
    const obligations = new Map(
      seed.obligations?.map((obligation) => [obligation.id, obligation])
    );
    const savingsGoals = new Map(
      seed.savingsGoals?.map((goal) => [goal.id, goal])
    );
    this.salaryProfiles = this.salaryProfiles.map((profile) => {
      const localized = salaryProfiles.get(profile.id);
      return localized ? { ...profile, sourceName: localized.sourceName } : profile;
    });
    this.budgets = this.budgets.map((budget) => {
      const localized = budgets.get(budget.id);
      return localized ? { ...budget, name: localized.name } : budget;
    });
    this.obligations = this.obligations.map((obligation) => {
      const localized = obligations.get(obligation.id);
      return localized
        ? {
            ...obligation,
            title: localized.title,
            provider: localized.provider,
            providerKeywords: localized.providerKeywords
          }
        : obligation;
    });
    this.savingsGoals = this.savingsGoals.map((goal) => {
      const localized = savingsGoals.get(goal.id);
      return localized ? { ...goal, title: localized.title } : goal;
    });
  }

  async hydrate(): Promise<void> {
    const database = await openDatabase();
    const [
      salaryProfiles,
      salaryReceipts,
      budgets,
      categoryBudgets,
      obligations,
      scheduleItems,
      payments,
      savingsGoals,
      goalMovements,
      drafts,
      conflicts,
      operations
    ] = await Promise.all([
      readPayloads<SalaryProfile>(database, 'planning_salary_profiles'),
      readPayloads<SalaryReceiptLink>(database, 'planning_salary_receipts'),
      readPayloads<Budget>(database, 'planning_budgets'),
      readPayloads<CategoryBudget>(database, 'planning_category_budgets'),
      readPayloads<Obligation>(database, 'planning_obligations'),
      readPayloads<ObligationScheduleItem>(
        database,
        'planning_obligation_schedule_items'
      ),
      readPayloads<ObligationPayment>(
        database,
        'planning_obligation_payments'
      ),
      readPayloads<SavingsGoal>(database, 'planning_savings_goals'),
      readPayloads<GoalMovement>(database, 'planning_goal_movements'),
      readPlanningDrafts(database),
      readPayloads<PlanningConflict>(database, 'planning_sync_conflicts'),
      readOperationPayloads(database)
    ]);
    if (
      salaryProfiles.length ||
      salaryReceipts.length ||
      budgets.length ||
      obligations.length ||
      savingsGoals.length
    ) {
      this.salaryProfiles = salaryProfiles;
      this.salaryReceipts = salaryReceipts;
      this.budgets = budgets.map(normalizeBudget);
      this.categoryBudgets = categoryBudgets;
      this.obligations = obligations;
      this.scheduleItems = scheduleItems;
      this.payments = payments;
      this.savingsGoals = savingsGoals;
      this.goalMovements = goalMovements;
      this.drafts = drafts;
      this.conflicts = conflicts;
      this.operationResults = operations;
    } else {
      await this.persistAll();
    }
  }

  async persistAll(): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await transaction.execAsync(
        "DELETE FROM planning_sync_conflicts; DELETE FROM planning_goal_movements; DELETE FROM planning_savings_goals; DELETE FROM planning_obligation_payments; DELETE FROM planning_obligation_schedule_items; DELETE FROM planning_obligations; DELETE FROM planning_category_budgets; DELETE FROM planning_budgets; DELETE FROM planning_salary_receipts; DELETE FROM planning_salary_profiles; DELETE FROM planning_drafts WHERE kind != 'report_schedule';"
      );
      await Promise.all([
        ...this.salaryProfiles.map((item) =>
          persistPayload(transaction, 'planning_salary_profiles', item.id, item)
        ),
        ...this.salaryReceipts.map((item) =>
          persistPayload(transaction, 'planning_salary_receipts', item.id, item)
        ),
        ...this.budgets.map((item) =>
          persistPayload(transaction, 'planning_budgets', item.id, item)
        ),
        ...this.categoryBudgets.map((item) =>
          persistPayload(transaction, 'planning_category_budgets', item.id, item)
        ),
        ...this.obligations.map((item) =>
          persistPayload(transaction, 'planning_obligations', item.id, item)
        ),
        ...this.scheduleItems.map((item) =>
          persistPayload(
            transaction,
            'planning_obligation_schedule_items',
            item.id,
            item
          )
        ),
        ...this.payments.map((item) =>
          persistPayload(transaction, 'planning_obligation_payments', item.id, item)
        ),
        ...this.savingsGoals.map((item) =>
          persistPayload(transaction, 'planning_savings_goals', item.id, item)
        ),
        ...this.goalMovements.map((item) =>
          persistPayload(transaction, 'planning_goal_movements', item.id, item)
        ),
        ...this.drafts.map((item) =>
          persistPayload(transaction, 'planning_drafts', item.id, item)
        ),
        ...this.conflicts.map((item) =>
          persistPayload(transaction, 'planning_sync_conflicts', item.id, item)
        )
      ]);
    });
  }

  activeSalaryProfile(): SalaryProfile | null {
    return (
      this.salaryProfiles.find((profile) => profile.status !== 'archived') ??
      null
    );
  }

  listSalaryReceipts(): SalaryReceiptLink[] {
    return this.salaryReceipts.map(copy);
  }

  saveSalaryProfile(
    input: Omit<
      SalaryProfile,
      keyof ReturnType<typeof metadata> | 'nextExpectedDate' | 'status'
    > & { id?: string; nextExpectedDate: SalaryProfile['nextExpectedDate'] },
    operationId: string
  ): SalaryProfile {
    const existing = this.getOperation<SalaryProfile>(operationId);
    if (existing) return existing;
    const now = Date.now();
    const index = input.id
      ? this.salaryProfiles.findIndex((item) => item.id === input.id)
      : this.salaryProfiles.findIndex((item) => item.status !== 'archived');
    const next: SalaryProfile =
      index >= 0
        ? {
            ...this.salaryProfiles[index],
            ...input,
            version: this.salaryProfiles[index].version + 1,
            updatedAt: now
          }
        : {
            ...metadata(this.nextId('salary-profile'), now),
            ...input,
            status: 'active'
          };
    if (index >= 0) this.salaryProfiles[index] = next;
    else this.salaryProfiles.push(next);
    return this.setOperation(operationId, next);
  }

  confirmSalaryReceipt(
    receipt: Omit<SalaryReceiptLink, keyof ReturnType<typeof metadata> | 'status'>,
    operationId: string
  ): SalaryReceiptLink {
    const existing = this.getOperation<SalaryReceiptLink>(operationId);
    if (existing) return existing;
    if (
      this.salaryReceipts.some(
        (item) => item.transactionId === receipt.transactionId && item.status === 'linked'
      )
    ) {
      throw new FinancialPlanningError('duplicate');
    }
    const now = Date.now();
    const next: SalaryReceiptLink = {
      ...metadata(this.nextId('salary-receipt'), now),
      ...receipt,
      status: 'linked',
      operationId
    };
    this.salaryReceipts.push(next);
    return this.setOperation(operationId, next);
  }

  undoSalaryReceipt(id: string, operationId: string): SalaryReceiptLink {
    const existing = this.getOperation<SalaryReceiptLink>(operationId);
    if (existing) return existing;
    const index = this.salaryReceipts.findIndex((item) => item.id === id);
    if (index < 0) throw new FinancialPlanningError('not_found');
    const next = {
      ...this.salaryReceipts[index],
      status: 'undone' as const,
      version: this.salaryReceipts[index].version + 1,
      updatedAt: Date.now()
    };
    this.salaryReceipts[index] = next;
    return this.setOperation(operationId, next);
  }

  listBudgets(periodKey?: string): Budget[] {
    return this.budgets
      .filter(
        (budget) => periodKey === undefined || budget.periodKey === periodKey
      )
      .map(copy);
  }

  getBudgetByPeriod(periodKey: string): Budget | null {
    return (
      this.budgets
        .filter(
          (budget) =>
            budget.periodKey === periodKey && budget.status !== 'deleted'
        )
        .sort(
          (a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id)
        )[0] ?? null
    );
  }

  requireBudget(id: string): Budget {
    const budget = this.budgets.find((item) => item.id === id);
    if (!budget) throw new FinancialPlanningError('not_found');
    return copy(budget);
  }

  operationResult<T>(operationId: string): T | null {
    return this.getOperation<T>(operationId);
  }

  saveBudget(
    input: Omit<Budget, keyof ReturnType<typeof metadata> | 'status'> & {
      id?: string;
      expectedVersion?: number;
      status?: Budget['status'];
    },
    operationId: string
  ): Budget {
    const existing = this.getOperation<Budget>(operationId);
    if (existing) return existing;
    const index = input.id
      ? this.budgets.findIndex((item) => item.id === input.id)
      : -1;
    if (index >= 0 && input.expectedVersion !== undefined)
      assertVersion(this.budgets[index].version, input.expectedVersion);
    const normalizedName = normalizeBudgetName(input.name);
    if (
      normalizedName &&
      this.budgets.some(
        (budget) =>
          budget.id !== input.id &&
          budget.periodKey === input.periodKey &&
          budget.status !== 'deleted' &&
          normalizeBudgetName(budget.name) === normalizedName
      )
    ) {
      throw new FinancialPlanningError('duplicate', { kind: 'name' });
    }
    const now = Date.now();
    const values = { ...input };
    delete values.id;
    delete values.expectedVersion;
    const next: Budget =
      index >= 0
        ? {
            ...this.budgets[index],
            ...values,
            version: this.budgets[index].version + 1,
            updatedAt: now
          }
        : {
            ...metadata(this.nextId('budget'), now),
            ...values,
            status: input.status ?? 'active'
          };
    if (index >= 0) this.budgets[index] = next;
    else this.budgets.push(next);
    return this.setOperation(operationId, next);
  }

  assertCategoriesAvailable(
    periodKey: string,
    categoryIds: readonly string[],
    excludingBudgetId?: string
  ): void {
    const requested = new Set(categoryIds);
    const conflict = this.categoryBudgets.find((category) => {
      if (category.status === 'deleted' || !requested.has(category.categoryId))
        return false;
      const budget = this.budgets.find((item) => item.id === category.budgetId);
      return Boolean(
        budget &&
          budget.id !== excludingBudgetId &&
          budget.periodKey === periodKey &&
          budget.status !== 'deleted'
      );
    });
    if (conflict) {
      const owner = this.budgets.find(
        (budget) => budget.id === conflict.budgetId
      );
      throw new FinancialPlanningError('duplicate', {
        kind: 'category',
        owner: owner?.name ?? ''
      });
    }
  }

  listCategoryBudgets(budgetId: string): CategoryBudget[] {
    return this.categoryBudgets
      .filter((item) => item.budgetId === budgetId && item.status !== 'deleted')
      .map(copy);
  }

  replaceCategoryBudgets(
    budgetId: string,
    categories: readonly CategoryBudget[]
  ): void {
    this.categoryBudgets = this.categoryBudgets.filter(
      (item) => item.budgetId !== budgetId
    );
    this.categoryBudgets.push(...categories.map(copy));
  }

  setBudgetStatus(
    id: string,
    expectedVersion: number,
    status: Budget['status'],
    operationId: string
  ): Budget {
    const budget = this.requireBudget(id);
    assertVersion(budget.version, expectedVersion);
    return this.saveBudget({ ...budget, status }, operationId);
  }

  listObligations(status?: ObligationLifecycle): Obligation[] {
    return this.obligations
      .filter((item) => !status || item.status === status)
      .map(copy);
  }

  requireObligation(id: string): Obligation {
    const obligation = this.obligations.find((item) => item.id === id);
    if (!obligation) throw new FinancialPlanningError('not_found');
    return copy(obligation);
  }

  saveObligation(
    input: Omit<Obligation, keyof ReturnType<typeof metadata> | 'status'> & {
      id?: string;
      status?: Obligation['status'];
    },
    operationId: string
  ): Obligation {
    const existing = this.getOperation<Obligation>(operationId);
    if (existing) return existing;
    const now = Date.now();
    const index = input.id
      ? this.obligations.findIndex((item) => item.id === input.id)
      : -1;
    const next: Obligation =
      index >= 0
        ? {
            ...this.obligations[index],
            ...input,
            version: this.obligations[index].version + 1,
            updatedAt: now
          }
        : {
            ...metadata(this.nextId('obligation'), now),
            ...input,
            status: input.status ?? 'active'
          };
    if (index >= 0) this.obligations[index] = next;
    else this.obligations.push(next);
    return this.setOperation(operationId, next);
  }

  setObligationStatus(
    id: string,
    expectedVersion: number,
    status: ObligationLifecycle,
    operationId: string
  ): Obligation {
    const obligation = this.requireObligation(id);
    assertVersion(obligation.version, expectedVersion);
    return this.saveObligation({ ...obligation, status }, operationId);
  }

  listSchedule(obligationId: string): ObligationScheduleItem[] {
    return this.scheduleItems
      .filter((item) => item.obligationId === obligationId)
      .map(copy);
  }

  replaceSchedule(
    obligationId: string,
    schedule: readonly ObligationScheduleItem[]
  ): void {
    this.scheduleItems = this.scheduleItems.filter(
      (item) => item.obligationId !== obligationId
    );
    this.scheduleItems.push(...schedule.map(copy));
  }

  listPayments(obligationId?: string): ObligationPayment[] {
    return this.payments
      .filter((item) => !obligationId || item.obligationId === obligationId)
      .map(copy);
  }

  savePayment(
    input: Omit<ObligationPayment, keyof ReturnType<typeof metadata>>,
    operationId: string
  ): ObligationPayment {
    const existing = this.getOperation<ObligationPayment>(operationId);
    if (existing) return existing;
    if (
      this.payments.some(
        (item) =>
          item.transactionId === input.transactionId && item.status === 'posted'
      )
    ) {
      throw new FinancialPlanningError('duplicate');
    }
    const next: ObligationPayment = {
      ...metadata(this.nextId('payment'), Date.now()),
      ...input
    };
    this.payments.push(next);
    return this.setOperation(operationId, next);
  }

  reversePayment(id: string, operationId: string): ObligationPayment {
    const existing = this.getOperation<ObligationPayment>(operationId);
    if (existing) return existing;
    const index = this.payments.findIndex((item) => item.id === id);
    if (index < 0) throw new FinancialPlanningError('not_found');
    const next = {
      ...this.payments[index],
      status: 'undone' as const,
      version: this.payments[index].version + 1,
      updatedAt: Date.now()
    };
    this.payments[index] = next;
    return this.setOperation(operationId, next);
  }

  listPaymentMatches(status?: PaymentMatch['status']): PaymentMatch[] {
    return this.paymentMatches
      .filter((item) => !status || item.status === status)
      .map(copy);
  }

  requirePaymentMatch(id: string): PaymentMatch {
    const match = this.paymentMatches.find((item) => item.id === id);
    if (!match) throw new FinancialPlanningError('not_found');
    return copy(match);
  }

  savePaymentMatch(match: PaymentMatch, operationId: string): PaymentMatch {
    const existing = this.getOperation<PaymentMatch>(operationId);
    if (existing) return existing;
    const index = this.paymentMatches.findIndex((item) => item.id === match.id);
    if (index >= 0) this.paymentMatches[index] = copy(match);
    else this.paymentMatches.push(copy(match));
    return this.setOperation(operationId, match);
  }

  listGoals(status?: SavingsGoal['status']): SavingsGoal[] {
    return this.savingsGoals
      .filter((item) => !status || item.status === status)
      .map(copy);
  }

  requireGoal(id: string): SavingsGoal {
    const goal = this.savingsGoals.find((item) => item.id === id);
    if (!goal) throw new FinancialPlanningError('not_found');
    return copy(goal);
  }

  saveGoal(
    input: Omit<SavingsGoal, keyof ReturnType<typeof metadata> | 'status'> & {
      id?: string;
      status?: SavingsGoal['status'];
    },
    operationId: string
  ): SavingsGoal {
    const existing = this.getOperation<SavingsGoal>(operationId);
    if (existing) return existing;
    const now = Date.now();
    const index = input.id
      ? this.savingsGoals.findIndex((item) => item.id === input.id)
      : -1;
    const next: SavingsGoal =
      index >= 0
        ? {
            ...this.savingsGoals[index],
            ...input,
            version: this.savingsGoals[index].version + 1,
            updatedAt: now
          }
        : {
            ...metadata(this.nextId('goal'), now),
            ...input,
            status: input.status ?? 'active'
          };
    if (index >= 0) this.savingsGoals[index] = next;
    else this.savingsGoals.push(next);
    return this.setOperation(operationId, next);
  }

  setGoalStatus(
    id: string,
    expectedVersion: number,
    status: SavingsGoal['status'],
    operationId: string
  ): SavingsGoal {
    const goal = this.requireGoal(id);
    assertVersion(goal.version, expectedVersion);
    return this.saveGoal({ ...goal, status }, operationId);
  }

  listGoalMovements(goalId?: string): GoalMovement[] {
    return this.goalMovements
      .filter((item) => !goalId || item.goalId === goalId)
      .map(copy);
  }

  saveGoalMovement(
    input: Omit<GoalMovement, keyof ReturnType<typeof metadata>>,
    operationId: string
  ): GoalMovement {
    const existing = this.getOperation<GoalMovement>(operationId);
    if (existing) return existing;
    const goal = this.requireGoal(input.goalId);
    const current = deriveSavingsProgress({
      goal,
      movements: this.listGoalMovements(goal.id),
      today: input.movementDate
    }).currentMinor;
    assertGoalMovementAllowed(
      goal,
      input.amountMinor,
      input.kind,
      current.status === 'available' ? current.value : 0
    );
    const next = {
      ...metadata(this.nextId('goal-movement'), Date.now()),
      ...input
    };
    this.goalMovements.push(next);
    return this.setOperation(operationId, next);
  }

  reverseGoalMovement(id: string, operationId: string): GoalMovement {
    const existing = this.getOperation<GoalMovement>(operationId);
    if (existing) return existing;
    const index = this.goalMovements.findIndex((item) => item.id === id);
    if (index < 0) throw new FinancialPlanningError('not_found');
    const next = {
      ...this.goalMovements[index],
      status: 'reversed' as const,
      version: this.goalMovements[index].version + 1,
      updatedAt: Date.now()
    };
    this.goalMovements[index] = next;
    return this.setOperation(operationId, next);
  }

  saveDraft(draft: PlanningDraft): PlanningDraft {
    const saved = { ...draft, updatedAt: Date.now() };
    const index = this.drafts.findIndex((item) => item.id === draft.id);
    if (index >= 0) this.drafts[index] = saved;
    else this.drafts.push(saved);
    return copy(saved);
  }

  loadDraft(id: string): PlanningDraft | null {
    const draft = this.drafts.find((item) => item.id === id);
    return draft ? copy(draft) : null;
  }

  discardDraft(id: string): void {
    this.drafts = this.drafts.filter((item) => item.id !== id);
  }

  requireConflict(id: string): PlanningConflict {
    const conflict = this.conflicts.find((item) => item.id === id);
    if (!conflict) throw new FinancialPlanningError('not_found');
    return copy(conflict);
  }

  resolveConflict(
    id: string,
    resolution: 'keep_local' | 'keep_later'
  ): unknown {
    const index = this.conflicts.findIndex((item) => item.id === id);
    if (index < 0) throw new FinancialPlanningError('not_found');
    if (resolution !== 'keep_local' && resolution !== 'keep_later')
      throw new FinancialPlanningError('validation');
    const selected =
      resolution === 'keep_local'
        ? this.conflicts[index].localSnapshot
        : this.conflicts[index].laterSnapshot;
    this.conflicts[index] = {
      ...this.conflicts[index],
      resolution,
      status: 'resolved',
      resolvedAt: Date.now()
    };
    return copy(selected);
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now()}-${this.sequence}`;
  }

  private getOperation<T>(operationId: string): T | null {
    const existing = this.operationResults.get(operationId);
    return existing ? copy(existing as T) : null;
  }

  private setOperation<T>(operationId: string, value: T): T {
    this.operationResults.set(operationId, copy(value));
    return copy(value);
  }
}

type SqlRunner = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync'>;

async function readPayloads<T>(
  database: Pick<SQLiteDatabase, 'getAllAsync'>,
  table: string
): Promise<T[]> {
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM ${table}`
  );
  return rows.map((row) => JSON.parse(row.payload) as T);
}

async function readPlanningDrafts(
  database: Pick<SQLiteDatabase, 'getAllAsync'>
): Promise<PlanningDraft[]> {
  const rows = await database.getAllAsync<{ payload: string }>(
    "SELECT payload FROM planning_drafts WHERE kind != 'report_schedule'"
  );
  return rows.map((row) => JSON.parse(row.payload) as PlanningDraft);
}

async function readOperationPayloads(
  database: Pick<SQLiteDatabase, 'getAllAsync'>
): Promise<Map<string, unknown>> {
  const tables = [
    'planning_salary_receipts',
    'planning_obligation_payments',
    'planning_goal_movements'
  ];
  const rows = (
    await Promise.all(
      tables.map((table) =>
        database.getAllAsync<{ operation_id: string; payload: string }>(
          `SELECT operation_id, payload FROM ${table} WHERE operation_id IS NOT NULL`
        )
      )
    )
  ).flat();
  return new Map(rows.map((row) => [row.operation_id, JSON.parse(row.payload)]));
}

async function persistPayload(
  database: SqlRunner,
  table: string,
  id: string,
  payload: unknown
): Promise<void> {
  const indexed = indexedColumns(table, payload);
  if (indexed) {
    await database.runAsync(indexed.sql, ...indexed.args);
    return;
  }
  await database.runAsync(
    `INSERT INTO ${table} (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    id,
    JSON.stringify(payload),
    'updatedAt' in Object(payload)
      ? (payload as { updatedAt: number }).updatedAt
      : Date.now()
  );
}

type BindValue = string | number | null;

function indexedColumns(
  table: string,
  payload: unknown
): { sql: string; args: BindValue[] } | null {
  const value = payload as {
    id: string;
    updatedAt?: number;
    status?: string;
    salaryProfileId?: string;
    transactionId?: string;
    operationId?: string;
    periodKey?: string;
    budgetId?: string;
    categoryId?: string;
    direction?: string;
    nextDueDate?: string | null;
    obligationId?: string;
    dueDate?: string;
    targetDate?: string;
    goalId?: string;
    linkedTransactionId?: string | null;
    kind?: string;
    entityKind?: string;
    entityId?: string;
  };
  const base = [value.id, JSON.stringify(payload)];
  const updatedAt = value.updatedAt ?? Date.now();
  if (table === 'planning_salary_profiles') {
    return upsert(table, ['status', 'updated_at'], [...base, value.status, updatedAt]);
  }
  if (table === 'planning_salary_receipts') {
    return upsert(
      table,
      [
        'salary_profile_id',
        'transaction_id',
        'operation_id',
        'status',
        'updated_at'
      ],
      [
        ...base,
        value.salaryProfileId,
        value.transactionId,
        value.operationId,
        value.status,
        updatedAt
      ]
    );
  }
  if (table === 'planning_budgets') {
    return upsert(
      table,
      ['period_key', 'status', 'updated_at'],
      [...base, value.periodKey, value.status, updatedAt]
    );
  }
  if (table === 'planning_category_budgets') {
    return upsert(
      table,
      ['budget_id', 'category_id', 'status', 'updated_at'],
      [...base, value.budgetId, value.categoryId, value.status, updatedAt]
    );
  }
  if (table === 'planning_obligations') {
    return upsert(
      table,
      ['direction', 'status', 'next_due_date', 'updated_at'],
      [...base, value.direction, value.status, value.nextDueDate ?? null, updatedAt]
    );
  }
  if (table === 'planning_obligation_schedule_items') {
    return upsert(
      table,
      ['obligation_id', 'due_date', 'updated_at'],
      [...base, value.obligationId, value.dueDate, updatedAt]
    );
  }
  if (table === 'planning_obligation_payments') {
    return upsert(
      table,
      ['obligation_id', 'transaction_id', 'operation_id', 'status', 'updated_at'],
      [
        ...base,
        value.obligationId,
        value.transactionId,
        value.operationId,
        value.status,
        updatedAt
      ]
    );
  }
  if (table === 'planning_savings_goals') {
    return upsert(
      table,
      ['status', 'target_date', 'updated_at'],
      [...base, value.status, value.targetDate, updatedAt]
    );
  }
  if (table === 'planning_goal_movements') {
    return upsert(
      table,
      ['goal_id', 'linked_transaction_id', 'operation_id', 'updated_at'],
      [
        ...base,
        value.goalId,
        value.linkedTransactionId ?? null,
        value.operationId,
        updatedAt
      ]
    );
  }
  if (table === 'planning_drafts') {
    return upsert(
      table,
      ['kind', 'status', 'updated_at'],
      [...base, value.kind, value.status, updatedAt]
    );
  }
  if (table === 'planning_sync_conflicts') {
    return upsert(
      table,
      ['entity_kind', 'entity_id', 'status', 'updated_at'],
      [...base, value.entityKind, value.entityId, value.status, updatedAt]
    );
  }
  return null;
}

function upsert(
  table: string,
  columns: readonly string[],
  args: unknown[]
): { sql: string; args: BindValue[] } {
  const allColumns = ['id', 'payload', ...columns];
  const assignments = columns.map((column) => `${column} = excluded.${column}`);
  return {
    sql: `INSERT INTO ${table} (${allColumns.join(', ')}) VALUES (${allColumns.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, ${assignments.join(', ')}`,
    args: args.map(toBind)
  };
}

function toBind(value: unknown): BindValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

function metadata(id: string, now: number) {
  return {
    id,
    version: 1,
    syncStatus: 'pending' as const,
    createdAt: now,
    updatedAt: now
  };
}

function assertVersion(current: number, expected: number): void {
  if (current !== expected) throw new FinancialPlanningError('conflict');
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeBudget(budget: Budget): Budget {
  return {
    ...copy(budget),
    name:
      typeof budget.name === 'string' && budget.name.trim()
        ? budget.name.trim()
        : null
  };
}

function normalizeBudgetName(name: string | null): string {
  return name?.trim().toLocaleLowerCase('en-US') ?? '';
}
