import { buildAssistantContextSnapshot } from '@/features/assistant/assistant-context';
import { buildNetWorthTrend } from '@/features/reports/report-net-worth';
import { emptyTransactionFilters } from './core-finance';
import { createMockCoreFinanceService } from '@/services/mocks/core-finance-service';
import { createMockFinancialPlanningService } from '@/services/mocks/financial-planning-service';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import { FinancialPlanningRepository } from '@/storage/financial-planning-repository';
import { clientRemediationFinancialFixture as fixture } from '@/test-utils/client-remediation-financial-fixture';
import { buildFinancialReport, resolveReportPeriod } from './reports';

test('one canonical scenario has identical finance, report, assistant, balance, and source-version meaning', async () => {
  const repository = new CoreFinanceRepository({
    accounts: [...fixture.accounts],
    categories: [...fixture.categories],
    transactions: [...fixture.transactions]
  });
  const finance = createMockCoreFinanceService(repository);
  const transactions = (
    await finance.listTransactions(emptyTransactionFilters, null, 100)
  ).items;
  const planning = createMockFinancialPlanningService(
    new FinancialPlanningRepository({
      obligations: [...fixture.obligations]
    }),
    false,
    async () => transactions,
    { now: () => fixture.at }
  );
  const obligations = (await planning.listObligations({})).items;
  const obligationOverview = await planning.getObligationsOverview({});
  const home = await finance.getHomeSummary('SAR');
  const period = resolveReportPeriod({
    kind: 'monthly',
    anchorDate: '2026-08-09',
    timeZone: 'Asia/Riyadh',
    now: fixture.at
  });
  const report = buildFinancialReport({
    period,
    currencyCode: 'SAR',
    categories: fixture.categories,
    transactions,
    generatedAt: fixture.at
  });
  const balances = new Map(
    (await finance.listAccountBalances()).map((item) => [
      item.accountId,
      item.balanceMinor
    ])
  );
  const trend = buildNetWorthTrend({
    accounts: fixture.accounts,
    accountIds: [],
    currencyCode: 'SAR',
    pointInstants: [fixture.at],
    ratesByAccount: new Map(),
    transactions
  });
  const assistant = await buildAssistantContextSnapshot({
    finance,
    reports: { getReport: async () => report },
    planning,
    asOf: fixture.at,
    period: { kind: 'monthly', anchorDate: '2026-08-09' },
    profile: { currencyCode: 'SAR', timeZone: 'Asia/Riyadh' }
  });

  expect(home).toMatchObject({
    totalBalanceMinor: fixture.expected.netWorthMinor,
    periodIncomeMinor: fixture.expected.incomeMinor,
    periodExpenseMinor: fixture.expected.expenseMinor
  });
  expect(report.summary.income.value?.minorUnits).toBe(
    fixture.expected.incomeMinor
  );
  expect(report.summary.expense.value?.minorUnits).toBe(
    fixture.expected.expenseMinor
  );
  expect(balances.get(fixture.ids.bank)).toBe(
    fixture.expected.bankBalanceMinor
  );
  expect(balances.get(fixture.ids.card)).toBe(
    fixture.expected.cardBalanceMinor
  );
  expect(trend).toEqual([
    { at: fixture.at, minorUnits: fixture.expected.netWorthMinor }
  ]);
  expect(transactions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: fixture.ids.refund,
        originalTransactionId: fixture.ids.expense
      }),
      expect.objectContaining({
        id: fixture.ids.transfer,
        categoryId: null,
        transferPurpose: 'internal'
      }),
      expect.objectContaining({
        id: fixture.ids.payoff,
        categoryId: null,
        transferPurpose: 'card_payoff'
      })
    ])
  );
  expect(obligationOverview).toMatchObject({
    payablesByCurrency: { SAR: fixture.expected.payablesMinor },
    receivablesByCurrency: { SAR: fixture.expected.receivablesMinor },
    remainingByObligationId: {
      [fixture.ids.payable]: fixture.expected.payablesMinor,
      [fixture.ids.receivable]: fixture.expected.receivablesMinor
    }
  });
  expect(assistant.snapshot.values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'assistant.context.report.income',
        minor: fixture.expected.incomeMinor
      }),
      expect.objectContaining({
        key: 'assistant.context.report.expense',
        minor: fixture.expected.expenseMinor
      }),
      expect.objectContaining({
        key: 'assistant.context.obligation.payables',
        minor: fixture.expected.payablesMinor,
        currency: 'SAR'
      }),
      expect.objectContaining({
        key: 'assistant.context.obligation.receivables',
        minor: fixture.expected.receivablesMinor,
        currency: 'SAR'
      })
    ])
  );
  const transactionSources = assistant.snapshot.sources
    .filter((source) => source.kind === 'transaction')
    .map(({ id, version }) => ({ id, version }));
  expect(transactionSources).toHaveLength(transactions.length);
  expect(transactionSources).toEqual(
    expect.arrayContaining(
      transactions.map(({ id, version }) => ({ id, version }))
    )
  );
  const obligationSources = assistant.snapshot.sources
    .filter((source) => source.kind === 'obligation')
    .map(({ id, version }) => ({ id, version }));
  expect(obligationSources).toEqual(
    obligations.map(({ id, version }) => ({ id, version }))
  );
});
