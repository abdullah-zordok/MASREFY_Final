import { QueryClient } from '@tanstack/react-query';

import { assistantKeys } from '@/features/assistant/assistant-queries';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';
import {
  invalidatePlanningScopes,
  scopeToKey as planningScopeToKey
} from '@/features/financial-planning/financial-planning-queries';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { createMockCoreFinanceService } from '@/services/mocks/core-finance-service';
import { createSeededFinancialPlanningService } from '@/services/mocks/financial-planning-service';
import { fixtureCategoryBudget } from '@/services/mocks/financial-planning-fixtures';
import { invalidateReportScopes, reportKeys } from './report-queries';

test('finance and planning scopes can invalidate live report keys without touching attempts', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const liveKey = reportKeys.live({
    kind: 'monthly',
    anchorDate: '2026-08-09',
    currencyCode: 'SAR',
    timeZone: 'Asia/Riyadh'
  });
  client.setQueryData(liveKey, { stale: false });
  client.setQueryData(reportKeys.attempt('attempt-1'), { immutable: true });

  await invalidateReportScopes(client, ['reports.live']);
  expect(client.getQueryData(reportKeys.attempt('attempt-1'))).toEqual({ immutable: true });
});

test('finance and planning mutations also refresh reports and current assistant context only', async () => {
  const finance = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: fixtureTransactions.slice(0, 3)
    })
  );
  const financeResult = await finance.createTransaction(
    {
      type: 'expense',
      amountMinor: 1200,
      currencyCode: 'SAR',
      accountId: 'account-bank',
      categoryId: 'food',
      title: 'Coffee',
      occurredAt: Date.parse('2026-08-09T09:00:00+03:00')
    },
    'report-invalidates-finance'
  );
  expect(financeResult.affectedScopes).toEqual(
    expect.arrayContaining(['reports.live', 'assistant.context'])
  );

  const planning = createSeededFinancialPlanningService();
  const planningResult = await planning.saveBudget(
    {
      name: 'September budget',
      periodKey: '2026-09',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 200_00,
      incomeTargetMinor: 500_00,
      savingsTargetMinor: 100_00,
      categories: [{ ...fixtureCategoryBudget, limitMinor: 50_00 }]
    },
    'report-invalidates-planning'
  );
  expect(planningResult.affectedScopes).toEqual(
    expect.arrayContaining(['reports.live', 'assistant.context'])
  );

  const reportKey = reportKeys.live({
    kind: 'monthly',
    anchorDate: '2026-08-09',
    currencyCode: 'SAR',
    timeZone: 'Asia/Riyadh'
  });
  const contextKey = assistantKeys.context();
  const responseKey = assistantKeys.response('response-1');
  const snapshotKey = ['assistant', 'snapshot', 'snapshot-1'] as const;
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(reportKey, { live: true });
  client.setQueryData(contextKey, { current: true });
  client.setQueryData(responseKey, { immutable: true });
  client.setQueryData(snapshotKey, { immutable: true });

  await invalidateCoreFinanceScopes(client, financeResult.affectedScopes);
  await invalidatePlanningScopes(client, planningResult.affectedScopes);

  expect(client.getQueryState(reportKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(contextKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(responseKey)?.isInvalidated).toBe(false);
  expect(client.getQueryState(snapshotKey)?.isInvalidated).toBe(false);
});

test.each([
  ['accounts.balances', ['core-finance', 'accounts']],
  ['transactions.list', ['core-finance', 'transactions']],
  ['home.summary', ['core-finance', 'home']]
])('planning mutation scope %s refreshes %j', (scope, expected) => {
  expect(planningScopeToKey(scope)).toEqual(expected);
});
