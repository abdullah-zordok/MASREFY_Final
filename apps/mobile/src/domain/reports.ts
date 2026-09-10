import { z } from 'zod';

import { getCurrencyMinorUnitScale } from './currencies';
import {
  addLocalDays,
  buildFinancialPeriod,
  localDateInTimeZone,
  localDateTimeInstant,
  type FinancialPeriodPreset
} from './financial-period';

import type {
  Category,
  ExchangeRateEstimate,
  MoneyValue,
  Transaction,
  TransactionEffect,
  TransactionFilterSet,
  TransactionType
} from '@/domain/core-finance';
import {
  emptyTransactionFilters,
  isConfirmedTransaction,
  projectTransactionEffects
} from '@/domain/core-finance';
import type {
  Budget,
  CategoryBudget,
  GoalMovement,
  LocalDate,
  Obligation,
  ObligationPayment,
  SalaryReceiptLink,
  SavingsGoal
} from '@/domain/financial-planning';

export type ReportPeriodKind =
  'monthly' | 'three_months' | 'half_year' | 'annual';
export type ReportDataState =
  | 'complete'
  | 'empty'
  | 'insufficient_data'
  | 'partial'
  | 'estimated'
  | 'stale'
  | 'offline';
export type ReportMetricKind =
  | 'income'
  | 'expense'
  | 'net_cash_flow'
  | 'savings_rate'
  | 'obligation_payment'
  | 'category_spend'
  | 'budget_performance'
  | 'debt_progress'
  | 'savings_progress'
  | 'account_activity'
  | 'merchant_spend';
export type CompletenessReason =
  | 'missing_rate'
  | 'review_required'
  | 'unresolved_conflict'
  | 'insufficient_history'
  | 'zero_denominator'
  | 'no_prior_data'
  | 'source_incomplete'
  | 'unsupported_by_server';
export type ReportOutputKind =
  'send_test' | 'send_now' | 'scheduled' | 'retry' | 'download' | 'share';

export type ReportValue<T> =
  | { status: 'available'; value: T }
  | {
      status: 'estimated';
      value: T;
      asOf: number;
      originalValues: MoneyValue[];
    }
  | { status: 'incomplete'; value: T | null; reasons: CompletenessReason[] }
  | { status: 'unavailable'; value: null; reason: CompletenessReason };

export interface ReportPeriod {
  kind: ReportPeriodKind;
  anchorDate: LocalDate;
  startDate: LocalDate;
  endDate: LocalDate;
  startInstant: number;
  endExclusiveInstant: number;
  timeZone: string;
  inProgress: boolean;
  comparisonStartDate: LocalDate;
  comparisonEndDate: LocalDate;
  comparisonStartInstant: number;
  comparisonEndExclusiveInstant: number;
}

export interface ReportComparison {
  metricKind: ReportMetricKind;
  current: ReportValue<MoneyValue | number>;
  previous: ReportValue<MoneyValue | number>;
  absoluteChange: number | null;
  percentageBasisPoints: number | null;
  currentRange: string;
  previousRange: string;
  direction: 'higher' | 'lower' | 'unchanged';
  interpretation: 'favorable' | 'unfavorable' | 'neutral' | 'not_applicable';
  unavailableReason?: CompletenessReason;
}

export interface ReportBreakdownItem {
  id: string;
  label: string;
  value: ReportValue<MoneyValue>;
  metricKind: ReportMetricKind;
  transactionIds: string[];
  memberIds?: string[];
  memberLabels?: string[];
  drillDown: ReportDrillDown;
}

export interface ReportBreakdown {
  dimension:
    | 'category'
    | 'account'
    | 'merchant'
    | 'month'
    | 'budget'
    | 'obligation'
    | 'savings'
    | 'salary';
  questionKey: string;
  summaryKey: string;
  items: ReportBreakdownItem[];
  dataState: ReportDataState;
}

export type ReportDrillDown =
  | {
      kind: 'transactions';
      filters: TransactionFilterSet;
      returnContext: ReportReturnContext;
    }
  | {
      kind: 'obligation';
      obligationId: string;
      returnContext: ReportReturnContext;
    }
  | {
      kind: 'other_categories';
      memberIds: string[];
      filters: TransactionFilterSet;
      returnContext: ReportReturnContext;
    };

export interface ReportReturnContext {
  reportKey: string;
  period: ReportPeriod;
  dimension?: string;
}

export interface PlanningReportingSnapshot {
  salaryReceipts: SalaryReceiptLink[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
  obligations: Obligation[];
  obligationPayments: ObligationPayment[];
  savingsGoals: SavingsGoal[];
  goalMovements: GoalMovement[];
  dataState: ReportDataState;
  completenessReasons: CompletenessReason[];
}

export type ReportInsightKind =
  | 'budget_performance'
  | 'month_comparison'
  | 'average_monthly_expense'
  | 'category_movement'
  | 'recurring_payments'
  | 'spending_volatility'
  | 'savings_consistency'
  | 'highest_spending_month'
  | 'lowest_spending_month'
  | 'debt_progress'
  | 'budget_consistency'
  | 'savings_progression'
  | 'subscription_impact'
  | 'salary_overview'
  | 'obligation_overview'
  | 'savings_achievement'
  | 'annual_mock_summary';

export interface ReportInsight {
  kind: ReportInsightKind;
  value: ReportValue<MoneyValue | number>;
}

export interface FinancialReport {
  key: string;
  period: ReportPeriod;
  currencyCode: string;
  language?: 'ar' | 'en';
  generatedAt: number;
  dataAsOf: number;
  dataState: ReportDataState;
  completenessReasons: CompletenessReason[];
  summary: ReportSummary;
  breakdowns: ReportBreakdown[];
  insights: ReportInsight[];
}

export interface ReportSummary {
  income: ReportValue<MoneyValue>;
  expense: ReportValue<MoneyValue>;
  netCashFlow: ReportValue<MoneyValue>;
  savingsRateBasisPoints: ReportValue<number>;
  obligationPayments: ReportValue<MoneyValue>;
  largestCategory: ReportValue<ReportBreakdownItem>;
  largestTransaction: ReportValue<ReportTransactionReference>;
  comparisons: ReportComparison[];
}

export interface ReportTransactionReference {
  id: string;
  title: string;
  amount: MoneyValue;
  occurredAt: number;
}

export interface RecipientVerification {
  normalizedEmail: string;
  status: 'unverified' | 'verifying' | 'verified' | 'failed';
  verifiedAt: number | null;
  failureCategory: 'validation' | 'temporary' | null;
}

export interface ReportSchedule {
  id: string;
  version: number;
  status: 'verification_required' | 'active' | 'paused' | 'disabled';
  recipient: RecipientVerification;
  frequency: ReportPeriodKind;
  language: 'ar' | 'en';
  currencyCode: string;
  deliveryDay: number;
  timeZone: string;
  includeAssistantSummary: boolean;
  detailLevel: 'summary' | 'detailed';
  lastSuccessfulAttemptId: string | null;
  nextDeliveryAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReportScheduleInput {
  recipientEmail: string;
  frequency: ReportPeriodKind;
  language: 'ar' | 'en';
  currencyCode: string;
  deliveryDay: number;
  timeZone: string;
  includeAssistantSummary: boolean;
  detailLevel: 'summary' | 'detailed';
  status?: ReportSchedule['status'];
}

export interface ReportScheduleDraft {
  id: 'report_schedule';
  payload: ReportScheduleInput;
  baseVersion: number | null;
  status: 'editing' | 'valid' | 'saving' | 'saved' | 'discarded';
  updatedAt: number;
}

export interface DetailedReportRow {
  date: LocalDate;
  transactionType: TransactionType;
  categoryLabel: string;
  merchantLabel: string | null;
  amount: MoneyValue;
  maskedAccountLabel: string;
}

export interface ReportSnapshot {
  period: ReportPeriod;
  generatedAt: number;
  dataAsOf: number;
  language: 'ar' | 'en';
  currencyCode: string;
  detailLevel: 'summary' | 'detailed';
  dataState: ReportDataState;
  notices: string[];
  summary: ReportSummary;
  breakdowns: ReportBreakdown[];
  detailedRows: DetailedReportRow[];
}

export interface ReportPreview {
  previewId: string;
  snapshot: ReportSnapshot;
  recipientEmail: string | null;
}

export interface ReportOutputAttempt {
  id: string;
  operationId: string;
  scheduleId: string | null;
  kind: ReportOutputKind;
  status: 'ready' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'simulated';
  snapshot: ReportSnapshot;
  retryOfAttemptId: string | null;
  failureCategory:
    'temporary' | 'recipient' | 'configuration' | 'unknown' | null;
  requestedAt: number;
  completedAt: number | null;
  scheduleStatusAtCompletion: ReportSchedule['status'] | null;
}

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLocaleLowerCase('en'));
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export function money(minorUnits: number, currencyCode: string): MoneyValue {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('invalid_money');
  return {
    minorUnits,
    currencyCode,
    scale: getCurrencyMinorUnitScale(currencyCode)
  };
}

export function available<T>(value: T): ReportValue<T> {
  return { status: 'available', value };
}

export function unavailable<T>(reason: CompletenessReason): ReportValue<T> {
  return { status: 'unavailable', value: null, reason };
}

export function resolveReportPeriod(input: {
  kind: ReportPeriodKind;
  anchorDate: LocalDate;
  timeZone: string;
  now?: number;
}): ReportPeriod {
  const nowDate = localDateInTimeZone(input.now ?? Date.now(), input.timeZone);
  const monthSpan =
    input.kind === 'annual'
      ? 12
      : input.kind === 'half_year'
        ? 6
        : input.kind === 'three_months'
          ? 3
          : 1;
  const current = buildFinancialPeriod({
    preset: reportPeriodPreset(input.kind),
    anchorDate: input.anchorDate,
    timeZone: input.timeZone,
    monthStartDay: 1
  });
  const previous = buildFinancialPeriod({
    preset: reportPeriodPreset(input.kind),
    anchorDate: shiftedAnchorMonth(input.anchorDate, -monthSpan),
    timeZone: input.timeZone,
    monthStartDay: 1
  });
  const { startDate, endDate } = current;
  const inProgress = startDate <= nowDate && nowDate <= endDate;
  const elapsedDays = inProgress
    ? Math.max(0, daysBetween(startDate, nowDate))
    : null;
  const comparisonStartDate = previous.startDate;
  const elapsedComparisonEnd =
    elapsedDays === null
      ? previous.endDate
      : addLocalDays(previous.startDate, elapsedDays);
  const comparisonEndDate =
    elapsedComparisonEnd < previous.endDate
      ? elapsedComparisonEnd
      : previous.endDate;
  return {
    kind: input.kind,
    anchorDate: input.anchorDate,
    startDate,
    endDate,
    startInstant: current.startInstant,
    endExclusiveInstant: current.endInstant + 1,
    timeZone: input.timeZone,
    inProgress,
    comparisonStartDate,
    comparisonEndDate,
    comparisonStartInstant: localDateTimeInstant(
      comparisonStartDate,
      input.timeZone
    ),
    comparisonEndExclusiveInstant: localDateTimeInstant(
      addLocalDays(comparisonEndDate, 1),
      input.timeZone
    )
  };
}

function reportPeriodPreset(kind: ReportPeriodKind): FinancialPeriodPreset {
  if (kind === 'annual') return 'twelve_months';
  if (kind === 'half_year') return 'six_months';
  if (kind === 'three_months') return 'three_months';
  return 'calendar_month';
}

function shiftedAnchorMonth(anchorDate: LocalDate, months: number): LocalDate {
  const anchor = parseDate(anchorDate);
  return toLocalDate(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1)
  );
}

export function buildFinancialReport(input: {
  period: ReportPeriod;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  planning?: PlanningReportingSnapshot;
  exchangeRates?: readonly ExchangeRateEstimate[];
  currencyCode: string;
  language?: 'ar' | 'en';
  generatedAt?: number;
}): FinancialReport {
  currencySchema.parse(input.currencyCode);
  const generatedAt = input.generatedAt ?? Date.now();
  const current = summarizeRange(
    input.transactions,
    input.period.startInstant,
    input.period.endExclusiveInstant,
    input.currencyCode,
    input.exchangeRates ?? []
  );
  const previous = summarizeRange(
    input.transactions,
    input.period.comparisonStartInstant,
    input.period.comparisonEndExclusiveInstant,
    input.currencyCode,
    input.exchangeRates ?? []
  );
  const categoryBreakdown = buildCategoryBreakdown(
    current.entries,
    input.categories,
    input.period,
    input.currencyCode,
    current
  );
  const largestCategory = categoryBreakdown.items[0]
    ? available(categoryBreakdown.items[0])
    : unavailable<ReportBreakdownItem>('insufficient_history');
  const largestTransactionValue = [...current.entries]
    .filter((entry) => entry.expenseMinor > 0)
    .sort(
      (a, b) =>
        b.expenseMinor - a.expenseMinor ||
        a.transaction.id.localeCompare(b.transaction.id)
    )[0];
  const largestTransaction = largestTransactionValue
    ? available({
        id: largestTransactionValue.transaction.id,
        title: largestTransactionValue.transaction.title,
        amount: money(largestTransactionValue.expenseMinor, input.currencyCode),
        occurredAt: largestTransactionValue.transaction.occurredAt
      })
    : unavailable<ReportTransactionReference>('insufficient_history');
  const reasons = [
    ...new Set([
      ...current.reasons,
      ...(input.planning?.completenessReasons ?? [])
    ])
  ];
  const dataState: ReportDataState =
    current.entries.length === 0
      ? 'empty'
      : reasons.length
        ? 'partial'
        : current.estimated
          ? 'estimated'
          : (input.planning?.dataState ?? 'complete');
  const summary: ReportSummary = {
    income: reportMoney(
      current.incomeMinor,
      input.currencyCode,
      reasons,
      current.incomeOriginals,
      current.fxAsOf
    ),
    expense: reportMoney(
      current.expenseMinor,
      input.currencyCode,
      reasons,
      current.expenseOriginals,
      current.fxAsOf
    ),
    netCashFlow: reportMoney(
      current.incomeMinor - current.expenseMinor,
      input.currencyCode,
      reasons,
      [...current.incomeOriginals, ...current.expenseOriginals],
      current.fxAsOf
    ),
    savingsRateBasisPoints:
      current.incomeMinor > 0 && !reasons.length
        ? available(
            Math.round(
              ((current.incomeMinor - current.expenseMinor) * 10_000) /
                current.incomeMinor
            )
          )
        : unavailable(reasons[0] ?? 'zero_denominator'),
    obligationPayments: reportMoney(
      current.obligationMinor,
      input.currencyCode,
      reasons,
      current.obligationOriginals,
      current.fxAsOf
    ),
    largestCategory,
    largestTransaction,
    comparisons: [
      compareMoney(
        'income',
        current.incomeMinor,
        previous.incomeMinor,
        input.period,
        input.currencyCode
      ),
      compareMoney(
        'expense',
        current.expenseMinor,
        previous.expenseMinor,
        input.period,
        input.currencyCode
      ),
      compareMoney(
        'net_cash_flow',
        current.incomeMinor - current.expenseMinor,
        previous.incomeMinor - previous.expenseMinor,
        input.period,
        input.currencyCode
      )
    ]
  };
  const monthBreakdown = buildSimpleBreakdown(
    'month',
    current.entries,
    input.period,
    input.currencyCode,
    current
  );
  const planningBreakdowns = input.planning
    ? buildPlanningBreakdowns(
        input.planning,
        current.entries,
        input.period,
        input.currencyCode
      )
    : [];
  return {
    key: `${input.period.kind}:${input.period.anchorDate}:${input.currencyCode}:${input.period.timeZone}`,
    period: input.period,
    currencyCode: input.currencyCode,
    language: input.language,
    generatedAt,
    dataAsOf: Math.max(
      0,
      ...current.entries.map((entry) => entry.transaction.updatedAt)
    ),
    dataState,
    completenessReasons: reasons,
    summary,
    breakdowns: [
      categoryBreakdown,
      buildSimpleBreakdown(
        'account',
        current.entries,
        input.period,
        input.currencyCode,
        current
      ),
      buildSimpleBreakdown(
        'merchant',
        current.entries,
        input.period,
        input.currencyCode,
        current
      ),
      monthBreakdown,
      ...planningBreakdowns
    ],
    insights: buildReportInsights(
      input.period.kind,
      input.period,
      current,
      previous,
      monthBreakdown,
      input.planning,
      input.currencyCode,
      input.exchangeRates ?? []
    )
  };
}

export function validateScheduleInput(
  input: ReportScheduleInput
): ReportScheduleInput {
  if (input.deliveryDay < 1 || input.deliveryDay > 28)
    throw new Error('validation');
  currencySchema.parse(input.currencyCode);
  emailSchema.parse(input.recipientEmail);
  return input;
}

export function verifyRecipient(
  email: string,
  now = Date.now()
): RecipientVerification {
  const parsed = emailSchema.safeParse(email);
  return parsed.success
    ? {
        normalizedEmail: parsed.data,
        status: 'verified',
        verifiedAt: now,
        failureCategory: null
      }
    : {
        normalizedEmail: email.trim().toLocaleLowerCase('en'),
        status: 'failed',
        verifiedAt: null,
        failureCategory: 'validation'
      };
}

export function buildSchedule(
  input: ReportScheduleInput,
  expectedVersion: number | null,
  now = Date.now(),
  verification?: RecipientVerification
): ReportSchedule {
  validateScheduleInput(input);
  const normalizedEmail = emailSchema.parse(input.recipientEmail);
  const recipient =
    verification?.status === 'verified' &&
    verification.normalizedEmail === normalizedEmail
      ? verification
      : {
          normalizedEmail,
          status: 'unverified' as const,
          verifiedAt: null,
          failureCategory: null
        };
  const status =
    recipient.status === 'verified'
      ? (input.status ?? 'active')
      : 'verification_required';
  return {
    id: 'report-schedule',
    version: (expectedVersion ?? 0) + 1,
    status,
    recipient,
    frequency: input.frequency,
    language: input.language,
    currencyCode: input.currencyCode,
    deliveryDay: input.deliveryDay,
    timeZone: input.timeZone,
    includeAssistantSummary: input.includeAssistantSummary,
    detailLevel: input.detailLevel,
    lastSuccessfulAttemptId: null,
    nextDeliveryAt:
      status === 'active' ? projectNextDelivery(input, now) : null,
    createdAt: now,
    updatedAt: now
  };
}

export function projectNextDelivery(
  input: Pick<ReportScheduleInput, 'deliveryDay' | 'frequency' | 'timeZone'>,
  now = Date.now()
): number {
  const months =
    input.frequency === 'annual'
      ? 12
      : input.frequency === 'half_year'
        ? 6
        : input.frequency === 'three_months'
          ? 3
          : 1;
  const nowDate = parseDate(localDateInTimeZone(now, input.timeZone));
  let candidateDate = utcDate(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    input.deliveryDay
  );
  let candidate = localDateTimeInstant(
    toLocalDate(candidateDate.getTime()),
    input.timeZone,
    9
  );
  while (candidate <= now) {
    candidateDate = utcDate(
      candidateDate.getUTCFullYear(),
      candidateDate.getUTCMonth() + months,
      input.deliveryDay
    );
    candidate = localDateTimeInstant(
      toLocalDate(candidateDate.getTime()),
      input.timeZone,
      9
    );
  }
  return candidate;
}

export function buildSnapshot(input: {
  report: FinancialReport;
  detailLevel: 'summary' | 'detailed';
  language: 'ar' | 'en';
  transactions: readonly Transaction[];
  categoryLabel: (id: string | null) => string;
}): ReportSnapshot {
  const rows =
    input.detailLevel === 'detailed'
      ? input.transactions
          .filter(
            (transaction) =>
              isEligible(transaction) &&
              transaction.occurredAt >= input.report.period.startInstant &&
              transaction.occurredAt < input.report.period.endExclusiveInstant
          )
          .map((transaction) => ({
            date: localDateInTimeZone(
              transaction.occurredAt,
              input.report.period.timeZone
            ),
            transactionType: transaction.type,
            categoryLabel: input.categoryLabel(transaction.categoryId),
            merchantLabel: transaction.merchant,
            amount: money(transaction.amountMinor, transaction.currencyCode),
            maskedAccountLabel: 'Account ****'
          }))
      : [];
  return {
    period: input.report.period,
    generatedAt: input.report.generatedAt,
    dataAsOf: input.report.dataAsOf,
    language: input.language,
    currencyCode: input.report.currencyCode,
    detailLevel: input.detailLevel,
    dataState: input.report.dataState,
    notices: ['mock_output', ...input.report.completenessReasons],
    summary: input.report.summary,
    breakdowns: input.report.breakdowns,
    detailedRows: rows
  };
}

interface ConvertedReportEntry {
  transaction: Transaction;
  incomeMinor: number;
  expenseMinor: number;
  obligationMinor: number;
  incomeOriginal: MoneyValue | null;
  expenseOriginal: MoneyValue | null;
  obligationOriginal: MoneyValue | null;
  fxAsOf: number | null;
}

interface ReportRangeSummary {
  entries: ConvertedReportEntry[];
  incomeMinor: number;
  expenseMinor: number;
  obligationMinor: number;
  estimated: boolean;
  reasons: CompletenessReason[];
  incomeOriginals: MoneyValue[];
  expenseOriginals: MoneyValue[];
  obligationOriginals: MoneyValue[];
  fxAsOf: number;
}

function summarizeRange(
  transactions: readonly Transaction[],
  start: number,
  endExclusive: number,
  currencyCode: string,
  exchangeRates: readonly ExchangeRateEstimate[]
): ReportRangeSummary {
  const range = transactions.filter(
    (transaction) =>
      transaction.occurredAt >= start && transaction.occurredAt < endExclusive
  );
  const projections = projectTransactionEffects(transactions, null);
  const entries: ConvertedReportEntry[] = [];
  const reasons: CompletenessReason[] = [];
  for (const transaction of range) {
    if (!isEligible(transaction)) {
      if (transaction.reviewStatus === 'required')
        reasons.push('review_required');
      if (transaction.syncStatus === 'conflict')
        reasons.push('unresolved_conflict');
      continue;
    }
    const entry = convertReportEntry(
      transaction,
      currencyCode,
      exchangeRates,
      projections.get(transaction.id)!.confirmed
    );
    if (!entry) reasons.push('missing_rate');
    else entries.push(entry);
  }
  return summarizeEntries(entries, reasons);
}

function convertReportEntry(
  transaction: Transaction,
  currencyCode: string,
  exchangeRates: readonly ExchangeRateEstimate[],
  confirmed: TransactionEffect
): ConvertedReportEntry | null {
  const rawIncome = confirmed.incomeMinor;
  const rawExpense = confirmed.expenseMinor;
  const rawObligation =
    transaction.type === 'obligation_payment' ? confirmed.expenseMinor : 0;
  const foreign = transaction.currencyCode !== currencyCode;
  const rate = foreign
    ? exchangeRates.find(
        (candidate) =>
          candidate.baseCurrencyCode === currencyCode &&
          candidate.quoteCurrencyCode === transaction.currencyCode &&
          candidate.status !== 'unavailable'
      )
    : null;
  if (foreign && !rate && (rawIncome || rawExpense || rawObligation))
    return null;
  const multiplier = rate?.rate ?? 1;
  const original = (minorUnits: number) =>
    foreign && minorUnits ? money(minorUnits, transaction.currencyCode) : null;
  return {
    transaction,
    incomeMinor: Math.round(rawIncome * multiplier),
    expenseMinor: Math.round(rawExpense * multiplier),
    obligationMinor: Math.round(rawObligation * multiplier),
    incomeOriginal: original(rawIncome),
    expenseOriginal: original(rawExpense),
    obligationOriginal: original(rawObligation),
    fxAsOf: rate?.asOf ?? null
  };
}

function summarizeEntries(
  entries: ConvertedReportEntry[],
  reasons: CompletenessReason[]
): ReportRangeSummary {
  return {
    entries,
    incomeMinor: entries.reduce((sum, entry) => sum + entry.incomeMinor, 0),
    expenseMinor: entries.reduce((sum, entry) => sum + entry.expenseMinor, 0),
    obligationMinor: entries.reduce(
      (sum, entry) => sum + entry.obligationMinor,
      0
    ),
    estimated: entries.some((entry) => entry.fxAsOf !== null),
    reasons: [...new Set(reasons)],
    incomeOriginals: entries.flatMap((entry) =>
      entry.incomeOriginal ? [entry.incomeOriginal] : []
    ),
    expenseOriginals: entries.flatMap((entry) =>
      entry.expenseOriginal ? [entry.expenseOriginal] : []
    ),
    obligationOriginals: entries.flatMap((entry) =>
      entry.obligationOriginal ? [entry.obligationOriginal] : []
    ),
    fxAsOf: Math.max(0, ...entries.map((entry) => entry.fxAsOf ?? 0))
  };
}

function isEligible(transaction: Transaction): boolean {
  return isConfirmedTransaction(transaction);
}

function reportMoney(
  value: number,
  currencyCode: string,
  reasons: readonly CompletenessReason[],
  originalValues: MoneyValue[] = [],
  fxAsOf = 0
): ReportValue<MoneyValue> {
  if (reasons.length)
    return {
      status: 'incomplete',
      value: money(value, currencyCode),
      reasons: [...reasons]
    };
  return originalValues.length
    ? {
        status: 'estimated',
        value: money(value, currencyCode),
        asOf: fxAsOf,
        originalValues
      }
    : available(money(value, currencyCode));
}

function compareMoney(
  metricKind: ReportMetricKind,
  current: number,
  previous: number,
  period: ReportPeriod,
  currencyCode: string
): ReportComparison {
  const absoluteChange = current - previous;
  const direction =
    absoluteChange > 0 ? 'higher' : absoluteChange < 0 ? 'lower' : 'unchanged';
  const percentageBasisPoints =
    previous > 0 ? Math.round((absoluteChange * 10_000) / previous) : null;
  const favorable =
    metricKind === 'income' || metricKind === 'savings_progress';
  const unfavorable =
    metricKind === 'expense' ||
    metricKind === 'obligation_payment' ||
    metricKind === 'debt_progress';
  const currentEnd = period.inProgress
    ? toLocalDate(
        addDays(
          parseDate(period.startDate),
          daysBetween(period.comparisonStartDate, period.comparisonEndDate)
        ).getTime()
      )
    : period.endDate;
  return {
    metricKind,
    current: available(money(current, currencyCode)),
    previous: available(money(previous, currencyCode)),
    absoluteChange,
    percentageBasisPoints,
    currentRange: `${period.startDate} - ${currentEnd}`,
    previousRange: `${period.comparisonStartDate} - ${period.comparisonEndDate}`,
    direction,
    interpretation:
      direction === 'unchanged'
        ? 'neutral'
        : favorable
          ? direction === 'higher'
            ? 'favorable'
            : 'unfavorable'
          : unfavorable
            ? direction === 'higher'
              ? 'unfavorable'
              : 'favorable'
            : 'not_applicable',
    unavailableReason:
      percentageBasisPoints === null ? 'no_prior_data' : undefined
  };
}

function buildCategoryBreakdown(
  entries: readonly ConvertedReportEntry[],
  categories: readonly Category[],
  period: ReportPeriod,
  currencyCode: string,
  summary: ReportRangeSummary
): ReportBreakdown {
  const labels = new Map(
    categories.map((category) => [category.id, category.labelEn])
  );
  const groups = new Map<
    string,
    { label: string; total: number; ids: string[] }
  >();
  for (const entry of entries) {
    const { transaction } = entry;
    const value = entry.expenseMinor;
    if (value <= 0) continue;
    const id = transaction.categoryId ?? 'uncategorized';
    const group = groups.get(id) ?? {
      label: labels.get(id) ?? 'Uncategorized',
      total: 0,
      ids: []
    };
    group.total += value;
    group.ids.push(transaction.id);
    groups.set(id, group);
  }
  const items = [...groups.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([id, group]) =>
      withDimensionFilter(
        breakdownItem(
          id,
          group.label,
          group.total,
          group.ids,
          period,
          currencyCode,
          'category_spend',
          summary
        ),
        'category'
      )
    );
  return {
    dimension: 'category',
    questionKey: 'reports.chart.categories',
    summaryKey: 'reports.chart.categoriesSummary',
    items: groupOther(items, period, currencyCode),
    dataState: items.length ? 'complete' : 'empty'
  };
}

function buildSimpleBreakdown(
  dimension: ReportBreakdown['dimension'],
  entries: readonly ConvertedReportEntry[],
  period: ReportPeriod,
  currencyCode: string,
  summary: ReportRangeSummary
): ReportBreakdown {
  const groups = new Map<string, { total: number; ids: string[] }>();
  for (const entry of entries) {
    const { transaction } = entry;
    const value =
      dimension === 'month'
        ? entry.expenseMinor
        : Math.abs(entry.incomeMinor - entry.expenseMinor);
    if (value <= 0) continue;
    const key =
      dimension === 'account'
        ? transaction.accountId
        : dimension === 'merchant'
          ? (transaction.merchant ?? 'No merchant')
          : localDateInTimeZone(transaction.occurredAt, period.timeZone).slice(
              0,
              7
            );
    const group = groups.get(key) ?? { total: 0, ids: [] };
    group.total += value;
    group.ids.push(transaction.id);
    groups.set(key, group);
  }
  const items = [...groups.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([id, group]) =>
      withDimensionFilter(
        breakdownItem(
          id,
          id,
          group.total,
          group.ids,
          period,
          currencyCode,
          dimension === 'merchant' ? 'merchant_spend' : 'account_activity',
          summary
        ),
        dimension
      )
    );
  return {
    dimension,
    questionKey: `reports.chart.${dimension}`,
    summaryKey: `reports.chart.${dimension}Summary`,
    items,
    dataState: items.length ? 'complete' : 'empty'
  };
}

function buildPlanningBreakdowns(
  planning: PlanningReportingSnapshot,
  entries: readonly ConvertedReportEntry[],
  period: ReportPeriod,
  currencyCode: string
): ReportBreakdown[] {
  const budgetItems = planning.budgets
    .filter(
      (budget) =>
        budget.periodKey >= period.startDate.slice(0, 7) &&
        budget.periodKey <= period.endDate.slice(0, 7) &&
        budget.status !== 'deleted'
    )
    .map((budget) =>
      breakdownItem(
        budget.id,
        budget.periodKey,
        budget.configuredExpenseLimitMinor,
        [],
        period,
        budget.currencyCode,
        'budget_performance'
      )
    );
  const obligationItems = planning.obligations.map((obligation) => {
    const payments = planning.obligationPayments.filter(
      (payment) =>
        payment.obligationId === obligation.id &&
        payment.status === 'posted' &&
        containsDate(period, payment.paidDate)
    );
    return obligationBreakdownItem(obligation, payments, period, currencyCode);
  });
  const savingsItems = planning.savingsGoals.map((goal) => {
    const movements = planning.goalMovements.filter(
      (movement) =>
        movement.goalId === goal.id &&
        movement.status === 'posted' &&
        containsDate(period, movement.movementDate)
    );
    const total = movements.reduce(
      (sum, movement) =>
        sum +
        (movement.kind === 'withdrawal' || movement.kind === 'reversal'
          ? -movement.amountMinor
          : movement.amountMinor),
      0
    );
    return breakdownItem(
      goal.id,
      goal.title,
      total,
      movements.flatMap((movement) =>
        movement.linkedTransactionId ? [movement.linkedTransactionId] : []
      ),
      period,
      goal.currencyCode,
      'savings_progress'
    );
  });
  const salaryItems = planning.salaryReceipts
    .filter(
      (receipt) =>
        receipt.status !== 'undone' &&
        containsDate(period, receipt.receivedDate)
    )
    .map((receipt) => {
      const entry = entries.find(
        (candidate) => candidate.transaction.id === receipt.transactionId
      );
      return breakdownItem(
        receipt.id,
        receipt.receivedDate,
        entry?.incomeMinor ?? 0,
        [receipt.transactionId],
        period,
        currencyCode,
        'income'
      );
    });
  return [
    planningBreakdown('budget', budgetItems),
    planningBreakdown('obligation', obligationItems),
    planningBreakdown('savings', savingsItems),
    planningBreakdown('salary', salaryItems)
  ];
}

function obligationBreakdownItem(
  obligation: Obligation,
  payments: readonly ObligationPayment[],
  period: ReportPeriod,
  currencyCode: string
): ReportBreakdownItem {
  const total = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const returnContext = {
    reportKey: `${period.kind}:${period.anchorDate}`,
    period,
    dimension: obligation.id
  };
  return {
    id: obligation.id,
    label: obligation.title,
    value: available(money(total, currencyCode)),
    metricKind: 'obligation_payment',
    transactionIds: payments.map((payment) => payment.transactionId),
    drillDown: {
      kind: 'obligation',
      obligationId: obligation.id,
      returnContext
    }
  };
}

function planningBreakdown(
  dimension: 'budget' | 'obligation' | 'savings' | 'salary',
  items: ReportBreakdownItem[]
): ReportBreakdown {
  return {
    dimension,
    questionKey: `reports.chart.${dimension}`,
    summaryKey: `reports.chart.${dimension}Summary`,
    items,
    dataState: items.length ? 'complete' : 'empty'
  };
}

function buildReportInsights(
  kind: ReportPeriodKind,
  period: ReportPeriod,
  current: ReportRangeSummary,
  previous: ReportRangeSummary,
  months: ReportBreakdown,
  planning: PlanningReportingSnapshot | undefined,
  currencyCode: string,
  exchangeRates: readonly ExchangeRateEstimate[]
): ReportInsight[] {
  const monthValues = months.items.map((item) => reportMinor(item.value));
  const average = monthValues.length
    ? Math.round(
        monthValues.reduce((sum, value) => sum + value, 0) / monthValues.length
      )
    : 0;
  const volatility = monthValues.length
    ? Math.max(...monthValues) - Math.min(...monthValues)
    : 0;
  const moneyInsight = (
    insightKind: ReportInsightKind,
    minorUnits: number
  ): ReportInsight => ({
    kind: insightKind,
    value: available(money(minorUnits, currencyCode))
  });
  if (kind === 'monthly') {
    const periodKey = period.startDate.slice(0, 7);
    const activeBudgets =
      planning?.budgets.filter(
        (budget) => budget.periodKey === periodKey && budget.status === 'active'
      ) ?? [];
    const activeBudgetIds = new Set(activeBudgets.map((budget) => budget.id));
    const categoryIds = new Set(
      planning?.categoryBudgets
        .filter(
          (category) =>
            activeBudgetIds.has(category.budgetId) &&
            category.status === 'active'
        )
        .map((category) => category.categoryId) ?? []
    );
    const convertedLimits = activeBudgets.map((budget) => {
      const minorUnits =
        budget.configuredExpenseLimitMinor + budget.rolloverCreditMinor;
      if (budget.currencyCode === currencyCode) return minorUnits;
      const rate = exchangeRates.find(
        (candidate) =>
          candidate.baseCurrencyCode === currencyCode &&
          candidate.quoteCurrencyCode === budget.currencyCode &&
          candidate.status !== 'unavailable'
      );
      if (!rate) return null;
      return Math.round(
        (minorUnits / 10 ** getCurrencyMinorUnitScale(budget.currencyCode)) *
          rate.rate *
          10 ** getCurrencyMinorUnitScale(currencyCode)
      );
    });
    const limit = convertedLimits.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0
    );
    const budgetSpend = current.entries
      .filter(
        (entry) =>
          Boolean(entry.transaction.categoryId) &&
          categoryIds.has(entry.transaction.categoryId!)
      )
      .reduce((sum, entry) => sum + entry.expenseMinor, 0);
    return [
      convertedLimits.includes(null)
        ? {
            kind: 'budget_performance',
            value: {
              status: 'incomplete',
              value: null,
              reasons: ['missing_rate']
            }
          }
        : moneyInsight('budget_performance', limit - budgetSpend),
      moneyInsight(
        'month_comparison',
        current.expenseMinor - previous.expenseMinor
      )
    ];
  }
  if (kind === 'three_months')
    return [
      moneyInsight('average_monthly_expense', average),
      moneyInsight('spending_volatility', volatility),
      moneyInsight('recurring_payments', recurringTotal(current.entries)),
      moneyInsight(
        'category_movement',
        current.expenseMinor - previous.expenseMinor
      ),
      countInsight(
        'savings_consistency',
        planning?.goalMovements.filter((movement) =>
          containsDateRange(months, movement.movementDate)
        ).length ?? 0
      )
    ];
  if (kind === 'half_year')
    return [
      moneyInsight(
        'highest_spending_month',
        monthValues.length ? Math.max(...monthValues) : 0
      ),
      moneyInsight(
        'lowest_spending_month',
        monthValues.length ? Math.min(...monthValues) : 0
      ),
      moneyInsight(
        'debt_progress',
        planning?.obligationPayments.reduce(
          (sum, payment) => sum + payment.principalReductionMinor,
          0
        ) ?? 0
      ),
      countInsight(
        'budget_consistency',
        planning?.budgets.filter((budget) => budget.status === 'active')
          .length ?? 0
      ),
      moneyInsight('savings_progression', savingsMovementTotal(planning)),
      moneyInsight(
        'subscription_impact',
        subscriptionTotal(current.entries, planning)
      )
    ];
  return [
    countInsight('salary_overview', planning?.salaryReceipts.length ?? 0),
    countInsight('obligation_overview', planning?.obligations.length ?? 0),
    moneyInsight(
      'debt_progress',
      planning?.obligationPayments.reduce(
        (sum, payment) => sum + payment.principalReductionMinor,
        0
      ) ?? 0
    ),
    moneyInsight('savings_achievement', savingsMovementTotal(planning)),
    countInsight('annual_mock_summary', 1)
  ];
}

function countInsight(kind: ReportInsightKind, value: number): ReportInsight {
  return { kind, value: available(value) };
}

function reportMinor(value: ReportValue<MoneyValue>): number {
  return value.value?.minorUnits ?? 0;
}

function recurringTotal(entries: readonly ConvertedReportEntry[]): number {
  return entries
    .filter((entry) => entry.transaction.type === 'recurring_payment')
    .reduce((sum, entry) => sum + entry.expenseMinor, 0);
}

function savingsMovementTotal(planning?: PlanningReportingSnapshot): number {
  return (
    planning?.goalMovements.reduce(
      (sum, movement) =>
        sum +
        (movement.kind === 'withdrawal' || movement.kind === 'reversal'
          ? -movement.amountMinor
          : movement.amountMinor),
      0
    ) ?? 0
  );
}

function subscriptionTotal(
  entries: readonly ConvertedReportEntry[],
  planning?: PlanningReportingSnapshot
): number {
  const recurring = recurringTotal(entries);
  const subscriptionIds = new Set(
    planning?.obligations
      .filter((obligation) => obligation.type === 'subscription')
      .map((obligation) => obligation.id)
  );
  return (
    recurring +
    (planning?.obligationPayments
      .filter((payment) => subscriptionIds.has(payment.obligationId))
      .reduce((sum, payment) => sum + payment.amountMinor, 0) ?? 0)
  );
}

function containsDate(period: ReportPeriod, date: LocalDate): boolean {
  return date >= period.startDate && date <= period.endDate;
}

function containsDateRange(months: ReportBreakdown, date: LocalDate): boolean {
  return months.items.some((month) => month.id === date.slice(0, 7));
}

function breakdownItem(
  id: string,
  label: string,
  total: number,
  transactionIds: string[],
  period: ReportPeriod,
  currencyCode: string,
  metricKind: ReportMetricKind,
  summary?: ReportRangeSummary
): ReportBreakdownItem {
  const filters = {
    ...emptyTransactionFilters,
    periodStart: period.startInstant,
    periodEnd: period.endExclusiveInstant - 1,
    sort: 'newest' as const
  };
  return {
    id,
    label,
    value: summary
      ? reportMoney(
          total,
          currencyCode,
          summary.reasons,
          summary.expenseOriginals,
          summary.fxAsOf
        )
      : available(money(total, currencyCode)),
    metricKind,
    transactionIds,
    drillDown: {
      kind: 'transactions',
      filters,
      returnContext: {
        reportKey: `${period.kind}:${period.anchorDate}`,
        period,
        dimension: id
      }
    }
  };
}

function withDimensionFilter(
  item: ReportBreakdownItem,
  dimension: ReportBreakdown['dimension']
): ReportBreakdownItem {
  if (item.drillDown.kind !== 'transactions') return item;
  const filters = { ...item.drillDown.filters };
  if (dimension === 'category') filters.categoryIds = [item.id];
  if (dimension === 'account') filters.accountIds = [item.id];
  if (dimension === 'merchant') filters.search = item.id;
  if (dimension === 'month') {
    const monthStart = `${item.id}-01` as LocalDate;
    const nextMonth = utcDate(
      Number(item.id.slice(0, 4)),
      Number(item.id.slice(5, 7)),
      1
    );
    filters.periodStart = localDateTimeInstant(
      monthStart,
      item.drillDown.returnContext.period.timeZone
    );
    filters.periodEnd =
      localDateTimeInstant(
        toLocalDate(nextMonth.getTime()),
        item.drillDown.returnContext.period.timeZone
      ) - 1;
  }
  return { ...item, drillDown: { ...item.drillDown, filters } };
}

function groupOther(
  items: ReportBreakdownItem[],
  period: ReportPeriod,
  currencyCode: string
): ReportBreakdownItem[] {
  if (items.length <= 5) return items;
  const visible = items.slice(0, 4);
  const rest = items.slice(4);
  const total = rest.reduce(
    (sum, item) => sum + (item.value.value?.minorUnits ?? 0),
    0
  );
  return [
    ...visible,
    {
      ...breakdownItem(
        'other',
        'Other',
        total,
        rest.flatMap((item) => item.transactionIds),
        period,
        currencyCode,
        'category_spend'
      ),
      memberIds: rest.map((item) => item.id),
      memberLabels: rest.map((item) => item.label),
      drillDown: {
        kind: 'other_categories',
        memberIds: rest.map((item) => item.id),
        filters: {
          ...emptyTransactionFilters,
          periodStart: period.startInstant,
          periodEnd: period.endExclusiveInstant - 1,
          categoryIds: rest.map((item) => item.id)
        },
        returnContext: {
          reportKey: `${period.kind}:${period.anchorDate}`,
          period,
          dimension: 'other'
        }
      }
    }
  ];
}

function parseDate(value: LocalDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysBetween(start: LocalDate, end: LocalDate): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`)) /
      86_400_000
  );
}

export function toLocalDate(timestamp: number): LocalDate {
  return new Date(timestamp).toISOString().slice(0, 10) as LocalDate;
}
