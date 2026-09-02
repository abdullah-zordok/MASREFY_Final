import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';

import type { LocalDate, SavingsLifecycle } from '@/domain/financial-planning';
import { financialPlanningService } from '@/services/mocks/financial-planning-service';

export const financialPlanningKeys = {
  overview: (currencyCode: string, today: LocalDate, timeZone: string) =>
    ['planning', 'overview', currencyCode, today, timeZone] as const,
  salary: (today: LocalDate, timeZone: string) =>
    ['planning', 'salary', today, timeZone] as const,
  salaryReview: (id: string) => ['planning', 'salary-review', id] as const,
  budget: (periodKey: string) => ['planning', 'budget', periodKey] as const,
  budgetList: (periodKey: string) =>
    ['planning', 'budgets', periodKey] as const,
  budgetById: (id: string) => ['planning', 'budget-id', id] as const,
  obligations: (filters: unknown = {}) =>
    ['planning', 'obligations', filters] as const,
  obligation: (id: string) => ['planning', 'obligation', id] as const,
  paymentMatches: (filters: unknown = {}) =>
    ['planning', 'payment-matches', filters] as const,
  paymentMatch: (id: string) => ['planning', 'payment-match', id] as const,
  goals: (status?: string) => ['planning', 'goals', status ?? 'all'] as const,
  goal: (id: string) => ['planning', 'goal', id] as const,
  conflict: (id: string) => ['planning', 'conflict', id] as const
};

export function usePlanningOverview(
  currencyCode: string,
  today: LocalDate,
  timeZone: string
) {
  return useQuery({
    queryKey: financialPlanningKeys.overview(currencyCode, today, timeZone),
    queryFn: () =>
      financialPlanningService.getPlanningOverview({
        currencyCode,
        today,
        timeZone
      })
  });
}

export function useSalaryOverview(today: LocalDate, timeZone: string) {
  return useQuery({
    queryKey: financialPlanningKeys.salary(today, timeZone),
    queryFn: () =>
      financialPlanningService.getSalaryOverview({ today, timeZone })
  });
}

export function useSalaryReceiptReview(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.salaryReview(id),
    queryFn: () => financialPlanningService.getSalaryReceiptReview(id),
    enabled: Boolean(id)
  });
}

export function usePaymentMatch(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.paymentMatch(id),
    queryFn: () => financialPlanningService.getPaymentMatch(id),
    enabled: Boolean(id)
  });
}

export function useBudget(periodKey: string) {
  return useQuery({
    queryKey: financialPlanningKeys.budget(periodKey),
    queryFn: () => financialPlanningService.getBudget(periodKey)
  });
}

export function useBudgets(periodKey: string) {
  return useQuery({
    queryKey: financialPlanningKeys.budgetList(periodKey),
    queryFn: () => financialPlanningService.listBudgets(periodKey)
  });
}

export function useBudgetById(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.budgetById(id),
    queryFn: () => financialPlanningService.getBudgetById(id),
    enabled: Boolean(id)
  });
}

export function useObligations() {
  return useQuery({
    queryKey: financialPlanningKeys.obligations(),
    queryFn: () => financialPlanningService.listObligations({})
  });
}

export function useObligationsOverview() {
  return useQuery({
    queryKey: [...financialPlanningKeys.obligations(), 'overview'],
    queryFn: () =>
      financialPlanningService.getObligationsOverview({ status: 'active' })
  });
}

export function useObligation(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.obligation(id),
    queryFn: () => financialPlanningService.getObligation(id),
    enabled: Boolean(id)
  });
}

export function useSavingsGoals(status?: SavingsLifecycle) {
  return useQuery({
    queryKey: financialPlanningKeys.goals(status),
    queryFn: () => financialPlanningService.listGoals({ status })
  });
}

export function useSavingsGoal(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.goal(id),
    queryFn: () => financialPlanningService.getGoal(id),
    enabled: Boolean(id)
  });
}

export function usePlanningConflict(id: string) {
  return useQuery({
    queryKey: financialPlanningKeys.conflict(id),
    queryFn: () => financialPlanningService.getConflict(id),
    enabled: Boolean(id)
  });
}

export function usePlanningMutation<TVariables, TResult>(
  mutationFn: (
    variables: TVariables
  ) => Promise<{ value: TResult; affectedScopes: readonly string[] }>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await invalidatePlanningScopes(client, result.affectedScopes);
    }
  });
}

export function scopeToKey(scope: string): readonly unknown[] {
  const parts = scope.split('.');
  if (scope.startsWith('planning.salary')) {
    return ['planning', 'salary'];
  }
  if (scope.startsWith('planning.budget')) {
    return ['planning'];
  }
  if (scope.startsWith('planning.obligation') && parts[2]) {
    return financialPlanningKeys.obligation(parts[2]);
  }
  if (scope.startsWith('planning.obligations')) {
    return ['planning', 'obligations'];
  }
  if (scope.startsWith('planning.goal') && parts[2]) {
    return financialPlanningKeys.goal(parts[2]);
  }
  if (scope.startsWith('planning.goals')) {
    return ['planning', 'goals'];
  }
  if (scope.startsWith('planning.paymentMatch.')) {
    return financialPlanningKeys.paymentMatch(parts[2]);
  }
  if (scope.startsWith('planning.paymentMatches')) {
    return ['planning', 'payment-matches'];
  }
  if (scope.startsWith('planning.conflict')) {
    return ['planning', 'conflict'];
  }
  if (scope === 'reports.live') return ['reports', 'live'];
  if (scope === 'assistant.context') return ['assistant', 'context', 'current'];
  if (scope.startsWith('home')) return ['core-finance', 'home'];
  if (scope.startsWith('transactions')) return ['core-finance', 'transactions'];
  return ['planning'];
}

export async function invalidatePlanningScopes(
  client: QueryClient,
  scopes: readonly string[]
): Promise<void> {
  await Promise.all(
    scopes.map((scope) =>
      client.invalidateQueries({ queryKey: scopeToKey(scope) })
    )
  );
}
