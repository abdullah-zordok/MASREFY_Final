import { createImmutableSnapshot } from '@/domain/assistant';
import {
  emptyTransactionFilters,
  safeMinorSum,
  type Transaction,
  type TransactionFilterSet
} from '@/domain/core-finance';
import type {
  BudgetDetail,
  FinancialPlanningService,
  ObligationsOverview
} from '@/services/contracts/financial-planning-service';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import type { ReportsService } from '@/services/contracts/reports-service';
import type { FinancialReport, ReportValue } from '@/domain/reports';
import type { MoneyValue } from '@/domain/core-finance';

type ContextInput = {
  finance: Pick<CoreFinanceService, 'listTransactions'>;
  planning: Pick<
    FinancialPlanningService,
    'getBudget' | 'listGoals' | 'getObligationsOverview'
  >;
  reports: Pick<ReportsService, 'getReport'>;
  asOf: number;
  period: {
    kind: Parameters<ReportsService['getReport']>[0]['kind'];
    anchorDate: Parameters<ReportsService['getReport']>[0]['anchorDate'];
  };
  profile: { currencyCode: string; timeZone: string };
};

export async function buildAssistantContextSnapshot(input: ContextInput) {
  const report = await input.reports.getReport({
    kind: input.period.kind,
    anchorDate: input.period.anchorDate,
    currencyCode: input.profile.currencyCode,
    timeZone: input.profile.timeZone
  });
  const [transactions, budget, goals, obligations] = await Promise.all([
    listPeriodTransactions(input.finance, {
      ...emptyTransactionFilters,
      periodStart: report.period.startInstant,
      periodEnd: report.period.endExclusiveInstant - 1,
      sort: 'newest'
    }),
    input.planning.getBudget(input.period.anchorDate.slice(0, 7)),
    input.planning.listGoals({ status: 'active' }),
    input.planning.getObligationsOverview({ status: 'active' })
  ]);
  const reviewRequired = transactions.filter(
    (item) => item.reviewStatus === 'required'
  ).length;
  const conflicts =
    transactions.filter((item) => item.syncStatus === 'conflict').length +
    planningConflicts(budget, goals, obligations);
  const pendingLocal = transactions.filter((item) => isPendingLocal(item));
  const pendingPlanning = planningPending(budget, goals, obligations);
  const confirmedTransactions = transactions.filter(
    (item) =>
      item.reviewStatus !== 'required' &&
      item.syncStatus !== 'conflict' &&
      (item.status === 'posted' || isPendingLocal(item))
  );
  const confirmedBudget =
    budget?.budget.status === 'active' && budget.budget.syncStatus === 'synced'
      ? budget
      : null;
  const confirmedGoals = goals.filter(
    (item) => item.status === 'active' && item.syncStatus === 'synced'
  );
  const confirmedObligations = obligations.items.filter(
    (item) => item.status === 'active' && item.syncStatus === 'synced'
  );
  const obligationTotals = confirmedObligationTotals(
    confirmedObligations,
    obligations.remainingByObligationId
  );
  const sources = [
    ...confirmedTransactions.map((item) => ({
      kind: 'transaction' as const,
      id: item.id,
      version: item.version
    })),
    ...(confirmedBudget
      ? [
          {
            kind: 'budget' as const,
            id: confirmedBudget.budget.id,
            version: confirmedBudget.budget.version
          }
        ]
      : []),
    ...confirmedGoals.map((item) => ({
      kind: 'goal' as const,
      id: item.id,
      version: item.version
    })),
    ...confirmedObligations.map((item) => ({
      kind: 'obligation' as const,
      id: item.id,
      version: item.version
    })),
    { kind: 'report' as const, id: report.key, version: report.generatedAt }
  ];
  const values = [
    ...reportMoneyValues(report),
    ...(pendingLocal.length
      ? [{ key: 'assistant.context.transaction.pendingLocalConfirmed.count' }]
      : []),
    ...(confirmedBudget ? budgetValues(confirmedBudget) : []),
    ...confirmedGoals.map((goal) => ({
      key: 'assistant.context.goal.target',
      minor: goal.targetMinor,
      currency: goal.currencyCode
    })),
    ...obligationMoneyValues(
      'assistant.context.obligation.payables',
      obligationTotals.payables
    ),
    ...obligationMoneyValues(
      'assistant.context.obligation.receivables',
      obligationTotals.receivables
    )
  ];
  const reasons = [
    ...(reviewRequired ? ['review_required_excluded'] : []),
    ...(conflicts ? ['conflict_excluded'] : []),
    ...(pendingLocal.length || pendingPlanning
      ? ['pending_local_labeled']
      : []),
    ...(obligationTotalsUnavailable(obligationTotals)
      ? ['obligation_total_unavailable']
      : []),
    ...report.completenessReasons.map((reason) => `report_${reason}`)
  ];

  return {
    dataAsOf: report.dataAsOf,
    period: `${input.period.kind}:${input.period.anchorDate}`,
    snapshot: createImmutableSnapshot({
      sources,
      values,
      completeness: {
        confirmed: sources.length,
        reviewRequired,
        conflicts,
        reasons
      },
      reportReference: report.key
    })
  };
}

function obligationMoneyValues(
  key: string,
  totals: Record<string, number | null>
) {
  return Object.entries(totals).flatMap(([currency, minor]) =>
    minor === null ? [] : [{ key, minor, currency }]
  );
}

function confirmedObligationTotals(
  items: ObligationsOverview['items'],
  remainingById: ObligationsOverview['remainingByObligationId']
) {
  const totals: {
    payables: Record<string, number | null>;
    receivables: Record<string, number | null>;
  } = { payables: {}, receivables: {} };
  for (const item of items) {
    const values =
      item.direction === 'payable' ? totals.payables : totals.receivables;
    const remaining = remainingById[item.id] ?? null;
    if (remaining === null) values[item.currencyCode] = null;
    else if (values[item.currencyCode] !== null)
      values[item.currencyCode] = safeMinorSum(
        values[item.currencyCode] ?? 0,
        remaining
      );
  }
  return totals;
}

function obligationTotalsUnavailable(totals: {
  payables: Record<string, number | null>;
  receivables: Record<string, number | null>;
}) {
  return [
    ...Object.values(totals.payables),
    ...Object.values(totals.receivables)
  ].some((minor) => minor === null);
}

async function listPeriodTransactions(
  finance: Pick<CoreFinanceService, 'listTransactions'>,
  filters: TransactionFilterSet
) {
  const items: Transaction[] = [];
  let cursor: string | null = null;
  do {
    const page = await finance.listTransactions(filters, cursor, 100);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

function isPendingLocal(transaction: Transaction) {
  return (
    transaction.reviewStatus === 'none' &&
    transaction.syncStatus === 'pending' &&
    transaction.status === 'pending'
  );
}

function planningConflicts(
  budget: BudgetDetail | null,
  goals: Awaited<ReturnType<FinancialPlanningService['listGoals']>>,
  obligations: ObligationsOverview
) {
  return [budget?.budget, ...goals, ...obligations.items].filter(
    (item) => item?.syncStatus === 'conflict'
  ).length;
}

function planningPending(
  budget: BudgetDetail | null,
  goals: Awaited<ReturnType<FinancialPlanningService['listGoals']>>,
  obligations: ObligationsOverview
) {
  return [budget?.budget, ...goals, ...obligations.items].some(
    (item) => item?.syncStatus === 'pending'
  );
}

function reportMoneyValues(report: FinancialReport) {
  return [
    reportValue('assistant.context.report.income', report.summary.income),
    reportValue('assistant.context.report.expense', report.summary.expense),
    reportValue(
      'assistant.context.report.netCashFlow',
      report.summary.netCashFlow
    )
  ].filter(
    (
      item
    ): item is {
      key: string;
      minor: number;
      currency: string;
      status: 'available' | 'estimated';
    } => item !== null
  );
}

function reportValue(key: string, value: ReportValue<MoneyValue>) {
  if (value.status !== 'available' && value.status !== 'estimated') return null;
  return {
    key,
    minor: value.value.minorUnits,
    currency: value.value.currencyCode,
    status: value.status
  };
}

function budgetValues(detail: BudgetDetail) {
  return [
    {
      key: 'assistant.context.budget.limit',
      minor: detail.budget.configuredExpenseLimitMinor,
      currency: detail.budget.currencyCode
    },
    calculationValue(
      'assistant.context.budget.remaining',
      detail.progress.remainingMinor,
      detail.budget.currencyCode
    )
  ].filter(
    (item): item is { key: string; minor: number; currency: string } =>
      item !== null
  );
}

function calculationValue(
  key: string,
  calculation: BudgetDetail['progress']['remainingMinor'],
  currency: string
) {
  return calculation.status === 'available'
    ? { key, minor: calculation.value, currency }
    : null;
}
