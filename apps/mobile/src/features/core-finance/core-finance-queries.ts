import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';

import {
  emptyTransactionFilters,
  type TransactionFilterSet
} from '@/domain/core-finance';
import { coreFinanceService } from '@/services/mocks/core-finance-service';

export const coreFinanceKeys = {
  home: (currency: string, filters?: TransactionFilterSet) =>
    filters
      ? (['core-finance', 'home', currency, filters] as const)
      : (['core-finance', 'home', currency] as const),
  accounts: (archived = false) =>
    ['core-finance', 'accounts', archived] as const,
  accountBalances: (archived = false) =>
    ['core-finance', 'account-balances', archived] as const,
  account: (id: string) => ['core-finance', 'account', id] as const,
  transactions: (filters: TransactionFilterSet = emptyTransactionFilters) =>
    ['core-finance', 'transactions', filters] as const,
  transactionPages: (filters: TransactionFilterSet = emptyTransactionFilters) =>
    ['core-finance', 'transactions', 'pages', filters] as const,
  transaction: (id: string) => ['core-finance', 'transaction', id] as const,
  refundable: (id: string, excludedRefundId?: string) =>
    [
      'core-finance',
      'transactions',
      'refundable',
      id,
      excludedRefundId ?? null
    ] as const,
  categories: (archived = false) =>
    ['core-finance', 'categories', archived] as const,
  conflict: (id: string) => ['core-finance', 'conflict', id] as const
};

export function useHomeSummary(
  currency: string,
  filters?: TransactionFilterSet
) {
  return useQuery({
    queryKey: coreFinanceKeys.home(currency, filters),
    queryFn: () => coreFinanceService.getHomeSummary(currency, filters)
  });
}

export function useAccounts(includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: coreFinanceKeys.accounts(includeArchived),
    queryFn: () => coreFinanceService.listAccounts(includeArchived),
    enabled
  });
}

export function useAccountBalances(includeArchived = false) {
  return useQuery({
    queryKey: coreFinanceKeys.accountBalances(includeArchived),
    queryFn: () => coreFinanceService.listAccountBalances(includeArchived)
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: coreFinanceKeys.account(id),
    queryFn: () => coreFinanceService.getAccount(id),
    enabled: Boolean(id)
  });
}

export function useTransactions(
  filters: TransactionFilterSet = emptyTransactionFilters
) {
  return useQuery({
    queryKey: coreFinanceKeys.transactions(filters),
    queryFn: () => coreFinanceService.listTransactions(filters)
  });
}

export function useInfiniteTransactions(
  filters: TransactionFilterSet = emptyTransactionFilters
) {
  return useInfiniteQuery({
    queryKey: coreFinanceKeys.transactionPages(filters),
    queryFn: ({ pageParam }) =>
      coreFinanceService.listTransactions(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: coreFinanceKeys.transaction(id),
    queryFn: () => coreFinanceService.getTransaction(id),
    enabled: Boolean(id)
  });
}

export function useRemainingRefundableMinor(
  id: string,
  enabled = true,
  excludedRefundId?: string
) {
  return useQuery({
    queryKey: coreFinanceKeys.refundable(id, excludedRefundId),
    queryFn: () =>
      coreFinanceService.getRemainingRefundableMinor(id, excludedRefundId),
    enabled: Boolean(id) && enabled
  });
}

export function useCategories(includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: coreFinanceKeys.categories(includeArchived),
    queryFn: () => coreFinanceService.listCategories(includeArchived),
    enabled
  });
}

export function useCoreFinanceMutation<TVariables, TResult>(
  mutationFn: (
    variables: TVariables
  ) => Promise<{ value: TResult; affectedScopes: readonly string[] }>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await invalidateCoreFinanceScopes(client, result.affectedScopes);
    }
  });
}

export function scopeToKey(scope: string): readonly unknown[] {
  const [root, kind, id] = scope.split('.');
  if (root === 'home') return ['core-finance', 'home'];
  if (root === 'accounts' && kind === 'detail' && id)
    return ['core-finance', 'account', id];
  if (root === 'accounts' && kind === 'balances')
    return ['core-finance', 'account-balances'];
  if (root === 'accounts') return ['core-finance', 'accounts'];
  if (root === 'transactions' && kind === 'detail' && id)
    return ['core-finance', 'transaction', id];
  if (root === 'transactions') return ['core-finance', 'transactions'];
  if (root === 'categories') return ['core-finance', 'categories'];
  if (scope === 'reports.live') return ['reports', 'live'];
  if (scope === 'assistant.context') return ['assistant', 'context', 'current'];
  return ['core-finance'];
}

export async function invalidateCoreFinanceScopes(
  client: QueryClient,
  scopes: readonly string[]
): Promise<void> {
  await Promise.all(
    scopes.map((scope) =>
      client.invalidateQueries({ queryKey: scopeToKey(scope) })
    )
  );
}
