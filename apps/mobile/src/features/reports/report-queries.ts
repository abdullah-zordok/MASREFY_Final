import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';

import type { ReportPeriodKind } from '@/domain/reports';
import type { LocalDate } from '@/domain/financial-planning';
import { addLocalDays, buildFinancialPeriod } from '@/domain/financial-period';
import {
  emptyTransactionFilters,
  type Transaction
} from '@/domain/core-finance';
import type {
  ReportOutputPreviewInput,
  ReportQuery
} from '@/services/contracts/reports-service';
import { reportsService } from '@/services/reports-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { buildNetWorthTrend } from './report-net-worth';

export type ReportTimeframe = 'week' | 'month' | 'quarter' | 'year' | 'all';

export const reportKeys = {
  live: (input: ReportQuery) => ['reports', 'live', input] as const,
  breakdown: (input: ReportQuery, dimension: string) =>
    ['reports', 'breakdown', input, dimension] as const,
  schedule: ['reports', 'schedule'] as const,
  draft: ['reports', 'schedule-draft'] as const,
  preview: (input: ReportOutputPreviewInput) =>
    ['reports', 'preview', input] as const,
  attempts: (filters: unknown = {}) =>
    ['reports', 'attempts', filters] as const,
  attempt: (id: string) => ['reports', 'attempt', id] as const,
  netWorth: (
    anchorDate: LocalDate,
    currencyCode: string,
    accountIds: readonly string[],
    timeframe: ReportTimeframe,
    timeZone: string
  ) =>
    [
      'reports',
      'net-worth',
      anchorDate,
      currencyCode,
      accountIds,
      timeframe,
      timeZone
    ] as const
};

export function useReport(input: ReportQuery) {
  return useQuery({
    queryKey: reportKeys.live(input),
    queryFn: () => reportsService.getReport(input)
  });
}

export function useReportInput(
  kind: ReportPeriodKind,
  anchorDate: LocalDate,
  currencyCode: string,
  accountIds?: string[]
): ReportQuery {
  return {
    kind,
    anchorDate,
    currencyCode,
    timeZone: usePreferenceStore.getState().timeZone,
    ...(accountIds?.length ? { accountIds } : {})
  };
}

export function useNetWorthTrend({
  accountIds,
  anchorDate,
  currencyCode,
  timeframe
}: {
  accountIds: string[];
  anchorDate: LocalDate;
  currencyCode: string;
  timeframe: ReportTimeframe;
}) {
  const timeZone = usePreferenceStore((state) => state.timeZone);
  return useQuery({
    queryKey: reportKeys.netWorth(
      anchorDate,
      currencyCode,
      accountIds,
      timeframe,
      timeZone
    ),
    queryFn: async () => {
      const [accounts, home, transactions] = await Promise.all([
        coreFinanceService.listAccounts(false),
        coreFinanceService.getHomeSummary(currencyCode, {
          ...emptyTransactionFilters,
          accountIds
        }),
        allTransactions()
      ]);
      const pointInstants = trendPointInstants(
        timeframe,
        anchorDate,
        timeZone,
        accounts.map((account) => account.createdAt),
        transactions.map((transaction) => transaction.occurredAt)
      );
      return buildNetWorthTrend({
        accounts,
        accountIds,
        currencyCode,
        pointInstants,
        ratesByAccount: new Map(
          home.components.map((component) => [
            component.accountId,
            component.rate
          ])
        ),
        transactions
      });
    }
  });
}

export function useReportSchedule() {
  return useQuery({
    queryKey: reportKeys.schedule,
    queryFn: () => reportsService.getSchedule()
  });
}

export function useReportPreview(input: ReportOutputPreviewInput) {
  return useQuery({
    queryKey: reportKeys.preview(input),
    queryFn: () => reportsService.previewOutput(input)
  });
}

export function useReportAttempts() {
  return useQuery({
    queryKey: reportKeys.attempts(),
    queryFn: () => reportsService.listAttempts()
  });
}

export function useReportMutation<TVariables, TResult>(
  mutationFn: (
    variables: TVariables
  ) => Promise<{ value: TResult; affectedScopes: readonly string[] }>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) =>
      invalidateReportScopes(client, result.affectedScopes)
  });
}

export async function invalidateReportScopes(
  client: QueryClient,
  scopes: readonly string[]
) {
  await Promise.all(
    scopes.map((scope) => {
      if (scope.startsWith('reports.attempt.')) {
        return client.invalidateQueries({
          queryKey: reportKeys.attempt(scope.split('.')[2])
        });
      }
      if (scope.startsWith('reports.attempts')) {
        return client.invalidateQueries({ queryKey: ['reports', 'attempts'] });
      }
      if (scope.startsWith('reports.schedule')) {
        return client.invalidateQueries({ queryKey: reportKeys.schedule });
      }
      if (scope.startsWith('reports.live')) {
        return client.invalidateQueries({ queryKey: ['reports', 'live'] });
      }
      return client.invalidateQueries({ queryKey: ['reports'] });
    })
  );
}

async function allTransactions() {
  const transactions: Transaction[] = [];
  let cursor: string | null = null;
  do {
    const page = await coreFinanceService.listTransactions(
      emptyTransactionFilters,
      cursor,
      500
    );
    transactions.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return transactions;
}

function trendPointInstants(
  timeframe: ReportTimeframe,
  anchorDate: LocalDate,
  timeZone: string,
  accountDates: readonly number[],
  transactionDates: readonly number[]
): number[] {
  const end = buildFinancialPeriod({
    anchorDate,
    monthStartDay: 1,
    preset: 'today',
    timeZone
  }).endInstant;
  const preset =
    timeframe === 'month'
      ? 'calendar_month'
      : timeframe === 'quarter'
        ? 'three_months'
        : timeframe === 'year'
          ? 'twelve_months'
          : null;
  const start =
    timeframe === 'all'
      ? Math.min(end, ...accountDates, ...transactionDates)
      : buildFinancialPeriod({
          anchorDate:
            timeframe === 'week' ? addLocalDays(anchorDate, -6) : anchorDate,
          monthStartDay: 1,
          preset: timeframe === 'week' ? 'today' : preset!,
          timeZone
        }).startInstant;
  const count = timeframe === 'week' ? 7 : 10;
  return Array.from({ length: count }, (_, index) =>
    Math.round(start + ((end - start) * index) / (count - 1))
  );
}
