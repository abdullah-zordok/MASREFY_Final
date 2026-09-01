import { z } from 'zod';

import { getCurrencyMinorUnitScale } from './currencies';
import { localDateInTimeZone } from './financial-period';

import {
  projectTransactionEffects,
  type MoneyValue,
  type SyncStatus,
  type Transaction,
  type TransactionInput
} from './core-finance';

export type LocalDate = `${number}-${number}-${number}`;
export type PlanningDataState =
  'ready' | 'empty' | 'partial' | 'stale' | 'offline';
export type CalculationReason =
  | 'missing_data'
  | 'missing_rate'
  | 'insufficient_history'
  | 'salary_overdue'
  | 'cycle_elapsed'
  | 'balance_negative';
export type Calculation<T> =
  | { status: 'available'; value: T; estimated: boolean; asOf: number | null }
  | { status: 'unavailable'; reason: CalculationReason };
export type PlanningLifecycle = 'active' | 'paused' | 'archived';
export type BudgetLifecycle = 'draft' | 'active' | 'paused' | 'closed' | 'deleted';
export type ObligationLifecycle =
  'active' | 'paused' | 'completed' | 'closed' | 'archived';
export type SavingsLifecycle = 'active' | 'paused' | 'completed' | 'archived';
export type PlanningErrorCode =
  | 'validation'
  | 'not_found'
  | 'archived'
  | 'read_only'
  | 'review_required'
  | 'duplicate'
  | 'conflict'
  | 'offline_unavailable'
  | 'stale_preview'
  | 'unknown';

export interface RecordMetadata {
  id: string;
  version: number;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SalaryProfile extends RecordMetadata {
  expectedAmountMinor: number;
  currencyCode: string;
  salaryDay: number;
  sourceName: string;
  receivingAccountId: string | null;
  nextExpectedDate: LocalDate;
  automaticDetectionEnabled: boolean;
  status: PlanningLifecycle;
}

export interface SalaryReceiptLink extends RecordMetadata {
  salaryProfileId: string;
  transactionId: string;
  expectedOccurrenceDate: LocalDate;
  receivedDate: LocalDate;
  status: 'linked' | 'corrected' | 'undone';
  operationId: string;
  replacesReceiptId: string | null;
}

export interface SalaryCycle {
  profileId: string | null;
  startReceiptId: string | null;
  startDate: LocalDate | null;
  projectedNextSalaryDate: LocalDate | null;
  daysRemaining: number;
  income: Calculation<MoneyValue>;
  expenses: Calculation<MoneyValue>;
  reservedObligations: Calculation<MoneyValue>;
  remaining: Calculation<MoneyValue>;
  suggestedDaily: Calculation<MoneyValue>;
  previousCycleComparison: Calculation<{ deltaMinor: number }>;
  salaryState: 'on_time' | 'early' | 'late' | 'overdue' | 'unconfigured';
  dataState: PlanningDataState;
}

export interface Budget extends RecordMetadata {
  name: string | null;
  periodKey: string;
  currencyCode: string;
  configuredExpenseLimitMinor: number;
  incomeTargetMinor: number;
  savingsTargetMinor: number;
  rolloverEnabled: boolean;
  rolloverCreditMinor: number;
  status: BudgetLifecycle;
  copiedFromBudgetId: string | null;
}

export interface CategoryBudget extends RecordMetadata {
  budgetId: string;
  categoryId: string;
  limitMinor: number;
  alertThresholds: number[];
  status: 'active' | 'paused' | 'deleted';
}

export interface BudgetProgress {
  budgetId: string;
  eligibleSpendMinor: Calculation<number>;
  remainingMinor: Calculation<number>;
  percentage: Calculation<number>;
  forecastMinor: Calculation<number>;
  comparison: Calculation<{ deltaMinor: number }>;
  state:
    | 'healthy'
    | 'threshold'
    | 'near_limit'
    | 'exceeded'
    | 'paused'
    | 'incomplete';
  excludedTransactionIds: string[];
}

export interface Obligation extends RecordMetadata {
  direction: 'payable' | 'receivable';
  type:
    | 'car_installment'
    | 'personal_loan'
    | 'buy_now_pay_later'
    | 'credit_card_installment'
    | 'rent'
    | 'utility'
    | 'subscription'
    | 'debt'
    | 'custom';
  scheduleKind: 'fixed_term' | 'open_ended' | 'irregular';
  title: string;
  provider: string | null;
  currencyCode: string;
  contractedTotalMinor: number | null;
  openingPaidMinor: number;
  installmentAmountMinor: number | null;
  installmentCount: number | null;
  dueDay: number | null;
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  fundingAccountId: string | null;
  automaticMatchingEnabled: boolean;
  providerKeywords: string[];
  reminderTiming: string | null;
  notes: string | null;
  status: ObligationLifecycle;
}

export interface ObligationScheduleItem {
  id: string;
  obligationId: string;
  sequence: number;
  dueDate: LocalDate;
  scheduledMinor: number;
  kind: 'installment' | 'balloon' | 'confirmed_occurrence';
  status: 'upcoming' | 'partial' | 'paid' | 'overdue' | 'cancelled';
}

export interface PaymentAllocation {
  scheduleItemId: string;
  amountMinor: number;
}

export interface ObligationPayment extends RecordMetadata {
  obligationId: string;
  transactionId: string;
  amountMinor: number;
  currencyCode: string;
  paidDate: LocalDate;
  case: 'partial' | 'full' | 'over' | 'early' | 'settlement' | 'correction';
  allocationIntent:
    | 'current'
    | 'later_installments'
    | 'principal'
    | 'correction'
    | 'settlement';
  allocations: PaymentAllocation[];
  principalReductionMinor: number;
  settlementAdjustmentMinor: number;
  source: 'manual' | 'automatic' | 'voice' | 'platform_assisted';
  transactionOwnership: 'created' | 'linked_existing';
  status: 'pending' | 'posted' | 'reversed' | 'undone' | 'conflict';
  operationId: string;
  replacesPaymentId: string | null;
}

export interface PaymentMatch {
  id: string;
  transactionId: string | null;
  candidateObligationIds: string[];
  duplicatePaymentIds: string[];
  status: 'clear' | 'review_required' | 'resolved' | 'ignored';
  resolution: string | null;
}

export interface SavingsGoal extends RecordMetadata {
  title: string;
  targetMinor: number;
  openingTrackedMinor: number;
  currencyCode: string;
  targetDate: LocalDate;
  linkedAccountId: string | null;
  iconKey: string | null;
  emergencyFund: boolean;
  status: SavingsLifecycle;
}

export interface GoalMovement extends RecordMetadata {
  goalId: string;
  kind: 'contribution' | 'withdrawal' | 'reversal' | 'correction';
  amountMinor: number;
  movementDate: LocalDate;
  linkedTransactionId: string | null;
  conversionEstimate: { convertedMinor: number; asOf: number } | null;
  status: 'pending' | 'posted' | 'reversed' | 'conflict';
  operationId: string;
  replacesMovementId: string | null;
}

export interface SavingsProgress {
  goalId: string;
  currentMinor: Calculation<number>;
  remainingMinor: Calculation<number>;
  percentage: Calculation<number>;
  requiredMonthlyMinor: Calculation<number>;
  state: 'active' | 'paused' | 'target_reached' | 'completed' | 'archived';
}

export interface PlanningDraft {
  id: string;
  kind:
    | 'salary'
    | 'budget'
    | 'obligation'
    | 'payment'
    | 'goal'
    | 'goal_movement'
    | 'report_schedule';
  entityId: string | null;
  payload: unknown;
  status: 'editing' | 'valid' | 'saving' | 'saved' | 'discarded';
  updatedAt: number;
}

export interface PlanningConflict {
  id: string;
  entityKind: string;
  entityId: string;
  localSnapshot: unknown;
  laterSnapshot: unknown;
  resolution: 'keep_local' | 'keep_later' | null;
  status: 'pending' | 'resolving' | 'resolved' | 'failed';
  createdAt: number;
  resolvedAt: number | null;
}

export interface PlanningOverview {
  dataState: PlanningDataState;
  salary: SalaryCycle;
  budget: BudgetProgress | null;
  obligationsDueMinor: Calculation<MoneyValue>;
  savings: SavingsProgress[];
}

export interface PaymentTransactionCreate {
  kind: 'create';
  input: TransactionInput;
}

export interface PaymentTransactionLink {
  kind: 'link';
  transactionId: string;
}

export type PaymentTransaction =
  PaymentTransactionCreate | PaymentTransactionLink;

export class FinancialPlanningError extends Error {
  constructor(
    public readonly code: PlanningErrorCode,
    public readonly details?: Readonly<Record<string, string>>
  ) {
    super(code);
    this.name = 'FinancialPlanningError';
  }
}

export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);
export const positiveMinorSchema = z.number().int().safe().positive();
export const nonnegativeMinorSchema = z.number().int().safe().nonnegative();
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function money(minorUnits: number, currencyCode: string): MoneyValue {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new FinancialPlanningError('validation');
  }
  currencyCodeSchema.parse(currencyCode);
  return {
    minorUnits,
    currencyCode,
    scale: getCurrencyMinorUnitScale(currencyCode)
  };
}

export function available<T>(
  value: T,
  estimated = false,
  asOf: number | null = null
): Calculation<T> {
  return { status: 'available', value, estimated, asOf };
}

export function unavailable<T>(reason: CalculationReason): Calculation<T> {
  return { status: 'unavailable', reason };
}

export function parseLocalDate(value: string): LocalDate {
  localDateSchema.parse(value);
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new FinancialPlanningError('validation');
  }
  return value as LocalDate;
}

export function localDateFromTimestamp(timestamp: number): LocalDate {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as LocalDate;
}

export function expectedDateForMonth(
  year: number,
  month: number,
  day: number
): LocalDate {
  if (day < 1 || day > 31) throw new FinancialPlanningError('validation');
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = normalized.getUTCMonth() + 1;
  const lastDay = new Date(
    Date.UTC(normalizedYear, normalizedMonth, 0)
  ).getUTCDate();
  return parseLocalDate(
    `${normalizedYear}-${String(normalizedMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  );
}

export function addMonthsClamped(
  date: LocalDate,
  months: number,
  day: number
): LocalDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  return expectedDateForMonth(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + 1 + months,
    day
  );
}

export function daysBetween(start: LocalDate, end: LocalDate): number {
  const left = Date.parse(`${start}T00:00:00Z`);
  const right = Date.parse(`${end}T00:00:00Z`);
  return Math.round((right - left) / 86_400_000);
}

export function deriveSalaryCycle(input: {
  profile: SalaryProfile | null;
  receipts: readonly SalaryReceiptLink[];
  transactions: readonly Transaction[];
  obligationsReservedMinor?: number;
  today: LocalDate;
  timeZone?: string;
}): SalaryCycle {
  if (!input.profile || input.profile.status === 'archived') {
    return emptySalaryCycle('unconfigured');
  }
  const linked = input.receipts
    .filter(
      (receipt) =>
        receipt.status === 'linked' &&
        receipt.salaryProfileId === input.profile!.id
    )
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
  if (!linked.length) {
    return {
      ...emptySalaryCycle('late'),
      profileId: input.profile.id,
      projectedNextSalaryDate: input.profile.nextExpectedDate,
      dataState: 'empty'
    };
  }
  const current = linked[0];
  const timeZone = input.timeZone ?? 'UTC';
  const nextDate = nextExpectedAfter(
    current.receivedDate,
    input.profile.salaryDay
  );
  const projections = projectTransactionEffects(input.transactions, null);
  const cycleTransactions = input.transactions.filter(
    (transaction) =>
      localDateInTimeZone(transaction.occurredAt, timeZone) >=
        current.receivedDate &&
      localDateInTimeZone(transaction.occurredAt, timeZone) < nextDate
  );
  const cycleTotals = cycleTransactions.reduce(
    (totals, transaction) => {
      const confirmed = projections.get(transaction.id)!.confirmed;
      return {
        incomeMinor: totals.incomeMinor + confirmed.incomeMinor,
        expenseMinor: totals.expenseMinor + confirmed.expenseMinor
      };
    },
    { incomeMinor: 0, expenseMinor: 0 }
  );
  const { incomeMinor, expenseMinor } = cycleTotals;
  const reservedMinor = input.obligationsReservedMinor ?? 0;
  const remainingMinor = incomeMinor - expenseMinor - reservedMinor;
  const daysRemaining = Math.max(0, daysBetween(input.today, nextDate));
  const salaryState = deriveSalaryState(
    current.expectedOccurrenceDate,
    current.receivedDate,
    input.today
  );
  const dailyReason: CalculationReason | null =
    salaryState === 'overdue'
      ? 'salary_overdue'
      : daysRemaining <= 0
        ? 'cycle_elapsed'
        : remainingMinor < 0
          ? 'balance_negative'
          : null;
  return {
    profileId: input.profile.id,
    startReceiptId: current.id,
    startDate: current.receivedDate,
    projectedNextSalaryDate: nextDate,
    daysRemaining,
    income: available(money(incomeMinor, input.profile.currencyCode)),
    expenses: available(money(expenseMinor, input.profile.currencyCode)),
    reservedObligations: available(
      money(reservedMinor, input.profile.currencyCode)
    ),
    remaining: available(money(remainingMinor, input.profile.currencyCode)),
    suggestedDaily:
      dailyReason === null
        ? available(
            money(
              Math.floor(remainingMinor / daysRemaining),
              input.profile.currencyCode
            )
          )
        : unavailable(dailyReason),
    previousCycleComparison:
      linked.length > 1
        ? available({
            deltaMinor: incomeMinor - input.profile.expectedAmountMinor
          })
        : unavailable('insufficient_history'),
    salaryState,
    dataState: 'ready'
  };
}

export function calculateBudgetProgress(input: {
  budget: Budget;
  transactions: readonly Transaction[];
  categoryIds?: readonly string[];
  missingRateTransactionIds?: readonly string[];
  today: LocalDate;
  timeZone?: string;
}): BudgetProgress {
  const timeZone =
    input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const categoryIds = input.categoryIds ? new Set(input.categoryIds) : null;
  const periodTransactions = input.transactions.filter(
    (transaction) =>
      localDateInTimeZone(transaction.occurredAt, timeZone).slice(0, 7) ===
      input.budget.periodKey
  );
  const transactions = categoryIds
    ? periodTransactions.filter(
        (transaction) =>
          Boolean(transaction.categoryId) &&
          categoryIds.has(transaction.categoryId!)
      )
    : periodTransactions;
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const excludedTransactionIds = (input.missingRateTransactionIds ?? []).filter(
    (id) => !categoryIds || transactionIds.has(id)
  );
  const effectiveLimit =
    input.budget.configuredExpenseLimitMinor + input.budget.rolloverCreditMinor;
  if (excludedTransactionIds.length) {
    return {
      budgetId: input.budget.id,
      eligibleSpendMinor: unavailable('missing_rate'),
      remainingMinor: unavailable('missing_rate'),
      percentage: unavailable('missing_rate'),
      forecastMinor: unavailable('missing_rate'),
      comparison: unavailable('missing_rate'),
      state: 'incomplete',
      excludedTransactionIds
    };
  }
  const projections = projectTransactionEffects(transactions, null);
  const spend = transactions.reduce((total, transaction) => {
    return total + projections.get(transaction.id)!.confirmed.expenseMinor;
  }, 0);
  const percentage =
    effectiveLimit > 0 ? Math.round((spend / effectiveLimit) * 100) : null;
  const elapsed = Math.max(1, Number(input.today.slice(8, 10)));
  const monthDays = new Date(
    Date.UTC(
      Number(input.budget.periodKey.slice(0, 4)),
      Number(input.budget.periodKey.slice(5, 7)),
      0
    )
  ).getUTCDate();
  const state =
    input.budget.status === 'paused'
      ? 'paused'
      : effectiveLimit === 0 && spend > 0
        ? 'exceeded'
        : percentage === null
          ? 'incomplete'
          : percentage >= 100
            ? 'exceeded'
            : percentage >= 90
              ? 'near_limit'
              : percentage >= 80
                ? 'threshold'
                : 'healthy';
  return {
    budgetId: input.budget.id,
    eligibleSpendMinor: available(spend),
    remainingMinor: available(effectiveLimit - spend),
    percentage:
      percentage === null ? unavailable('missing_data') : available(percentage),
    forecastMinor: available(Math.round((spend / elapsed) * monthDays)),
    comparison: unavailable('insufficient_history'),
    state,
    excludedTransactionIds
  };
}

export function frozenPositiveRollover(
  priorEffectiveLimitMinor: number,
  priorSpendMinor: number
): number {
  return Math.max(0, priorEffectiveLimitMinor - priorSpendMinor);
}

export function validateCategoryBudgets(
  budget: Pick<
    Budget,
    'configuredExpenseLimitMinor' | 'rolloverCreditMinor'
  >,
  categories: readonly CategoryBudget[]
): void {
  const effectiveLimit =
    budget.configuredExpenseLimitMinor + budget.rolloverCreditMinor;
  const total = categories
    .filter((category) => category.status === 'active')
    .reduce((sum, category) => sum + category.limitMinor, 0);
  if (total > effectiveLimit) throw new FinancialPlanningError('validation');
  const seen = new Set<string>();
  for (const category of categories) {
    if (category.status !== 'active') continue;
    if (seen.has(category.categoryId))
      throw new FinancialPlanningError('duplicate');
    seen.add(category.categoryId);
  }
}

export function applyPaymentEarliestFirst(input: {
  amountMinor: number;
  schedule: readonly ObligationScheduleItem[];
  payments: readonly ObligationPayment[];
  paidDate: LocalDate;
}): PaymentAllocation[] {
  positiveMinorSchema.parse(input.amountMinor);
  const alreadyPaid = new Map<string, number>();
  for (const payment of input.payments.filter(
    (item) => item.status === 'posted'
  )) {
    for (const allocation of payment.allocations) {
      alreadyPaid.set(
        allocation.scheduleItemId,
        (alreadyPaid.get(allocation.scheduleItemId) ?? 0) +
          allocation.amountMinor
      );
    }
  }
  let remaining = input.amountMinor;
  const allocations: PaymentAllocation[] = [];
  const unpaid = [...input.schedule]
    .filter((item) => item.status !== 'cancelled')
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence
    );
  for (const item of unpaid) {
    if (remaining <= 0) break;
    const due = Math.max(
      0,
      item.scheduledMinor - (alreadyPaid.get(item.id) ?? 0)
    );
    if (!due) continue;
    const amountMinor = Math.min(remaining, due);
    allocations.push({ scheduleItemId: item.id, amountMinor });
    remaining -= amountMinor;
  }
  return allocations;
}

export function deriveObligationStatus(input: {
  obligation: Obligation;
  schedule: readonly ObligationScheduleItem[];
  payments: readonly ObligationPayment[];
  today: LocalDate;
}): {
  paidMinor: number;
  remainingMinor: Calculation<number>;
  nextDueDate: LocalDate | null;
  overdue: boolean;
} {
  const paidMinor =
    input.obligation.openingPaidMinor +
    input.payments
      .filter((payment) => payment.status === 'posted')
      .reduce(
        (sum, payment) =>
          sum + payment.amountMinor + payment.settlementAdjustmentMinor,
        0
      );
  const total = input.obligation.contractedTotalMinor;
  const unpaidSchedule = input.schedule
    .filter((item) => item.status !== 'paid' && item.status !== 'cancelled')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    paidMinor,
    remainingMinor:
      total === null
        ? unavailable('missing_data')
        : available(Math.max(0, total - paidMinor)),
    nextDueDate: unpaidSchedule[0]?.dueDate ?? null,
    overdue: unpaidSchedule.some((item) => item.dueDate < input.today)
  };
}

export function scorePaymentMatch(input: {
  transaction: Transaction;
  obligations: readonly Obligation[];
  existingPayments: readonly ObligationPayment[];
}): PaymentMatch {
  const duplicatePaymentIds = input.existingPayments
    .filter(
      (payment) =>
        payment.transactionId === input.transaction.id &&
        payment.status === 'posted'
    )
    .map((payment) => payment.id);
  const normalizedTitle = input.transaction.title.toLocaleLowerCase('en');
  const candidateObligationIds = input.obligations
    .filter((obligation) =>
      obligation.providerKeywords.some((keyword) =>
        normalizedTitle.includes(keyword.toLocaleLowerCase('en'))
      )
    )
    .map((obligation) => obligation.id);
  return {
    id: `match-${input.transaction.id}`,
    transactionId: input.transaction.id,
    candidateObligationIds,
    duplicatePaymentIds,
    status:
      duplicatePaymentIds.length || candidateObligationIds.length !== 1
        ? 'review_required'
        : 'clear',
    resolution: null
  };
}

export function deriveSavingsProgress(input: {
  goal: SavingsGoal;
  movements: readonly GoalMovement[];
  today: LocalDate;
}): SavingsProgress {
  const current =
    input.goal.openingTrackedMinor +
    input.movements
      .filter((movement) => movement.status === 'posted')
      .reduce((sum, movement) => {
        if (movement.kind === 'withdrawal') return sum - movement.amountMinor;
        if (movement.kind === 'reversal') return sum - movement.amountMinor;
        return sum + movement.amountMinor;
      }, 0);
  if (current < 0) throw new FinancialPlanningError('validation');
  const remaining = Math.max(0, input.goal.targetMinor - current);
  const months = Math.max(
    1,
    Math.ceil(daysBetween(input.today, input.goal.targetDate) / 30)
  );
  const state =
    input.goal.status === 'completed'
      ? 'completed'
      : input.goal.status === 'archived'
        ? 'archived'
        : current >= input.goal.targetMinor
          ? 'target_reached'
          : input.goal.status;
  return {
    goalId: input.goal.id,
    currentMinor: available(current),
    remainingMinor: available(remaining),
    percentage: available(
      Math.min(100, Math.round((current / input.goal.targetMinor) * 100))
    ),
    requiredMonthlyMinor:
      remaining === 0
        ? available(0)
        : input.today > input.goal.targetDate
          ? unavailable('missing_data')
          : available(Math.ceil(remaining / months)),
    state
  };
}

export function assertGoalMovementAllowed(
  goal: SavingsGoal,
  amountMinor: number,
  kind: GoalMovement['kind'],
  currentMinor: number
): void {
  positiveMinorSchema.parse(amountMinor);
  if (goal.status === 'archived') throw new FinancialPlanningError('archived');
  if (kind === 'withdrawal' && amountMinor > currentMinor) {
    throw new FinancialPlanningError('validation');
  }
}

function emptySalaryCycle(
  salaryState: SalaryCycle['salaryState']
): SalaryCycle {
  return {
    profileId: null,
    startReceiptId: null,
    startDate: null,
    projectedNextSalaryDate: null,
    daysRemaining: 0,
    income: unavailable('missing_data'),
    expenses: unavailable('missing_data'),
    reservedObligations: unavailable('missing_data'),
    remaining: unavailable('missing_data'),
    suggestedDaily: unavailable('missing_data'),
    previousCycleComparison: unavailable('insufficient_history'),
    salaryState,
    dataState: 'empty'
  };
}

function nextExpectedAfter(date: LocalDate, day: number): LocalDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  const sameMonth = expectedDateForMonth(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + 1,
    day
  );
  return sameMonth > date ? sameMonth : addMonthsClamped(date, 1, day);
}

function deriveSalaryState(
  expectedDate: LocalDate,
  receivedDate: LocalDate,
  _today: LocalDate
): SalaryCycle['salaryState'] {
  if (receivedDate < expectedDate) return 'early';
  if (receivedDate > expectedDate) return 'late';
  return 'on_time';
}
