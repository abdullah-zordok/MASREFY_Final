import { buildAssistantContextSnapshot } from './assistant-context';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import type { FinancialPlanningService } from '@/services/contracts/financial-planning-service';
import type { ReportsService } from '@/services/contracts/reports-service';
import type { FinancialReport, ReportValue } from '@/domain/reports';
import type { MoneyValue, Transaction } from '@/domain/core-finance';

const asOf = Date.UTC(2026, 0, 15, 12);

describe('assistant canonical context', () => {
  it('uses confirmed owner data, labels pending-local data, and excludes review/conflict/raw fields', async () => {
    const finance: Pick<CoreFinanceService, 'listTransactions'> = {
      listTransactions: jest.fn().mockResolvedValue({
        items: [
          tx('confirmed-expense', { amountMinor: 12500, version: 3 }),
          tx('pending-local', {
            status: 'pending',
            syncStatus: 'pending',
            version: 1
          }),
          tx('needs-review', {
            reviewStatus: 'required',
            notes: 'raw sms note'
          }),
          tx('sync-conflict', {
            syncStatus: 'conflict',
            merchant: 'Raw Merchant'
          }),
          tx('failed-transaction', { status: 'failed' })
        ],
        nextCursor: null,
        total: 5
      })
    };
    const planning: Pick<
      FinancialPlanningService,
      'getBudget' | 'listGoals' | 'getObligationsOverview'
    > = {
      getBudget: jest.fn().mockResolvedValue({
        budget: {
          id: 'budget-jan',
          version: 2,
          syncStatus: 'synced',
          periodKey: '2026-01',
          configuredExpenseLimitMinor: 200000,
          incomeTargetMinor: 300000,
          savingsTargetMinor: 50000,
          currencyCode: 'SAR',
          rolloverEnabled: false,
          rolloverCreditMinor: 0,
          status: 'active',
          copiedFromBudgetId: null,
          createdAt: asOf,
          updatedAt: asOf
        },
        categories: [],
        progress: {
          budgetId: 'budget-jan',
          eligibleSpendMinor: calculation(12500),
          remainingMinor: calculation(187500),
          percentage: calculation(625),
          forecastMinor: calculation(50000),
          comparison: calculation({ deltaMinor: 0 }),
          state: 'healthy',
          excludedTransactionIds: []
        }
      }),
      listGoals: jest.fn().mockResolvedValue([
        {
          id: 'goal-emergency',
          version: 4,
          syncStatus: 'synced',
          title: 'Emergency account-hidden',
          targetMinor: 500000,
          openingTrackedMinor: 120000,
          currencyCode: 'SAR',
          targetDate: '2026-12-31',
          linkedAccountId: 'planning-account-hidden',
          iconKey: null,
          emergencyFund: true,
          status: 'active',
          createdAt: asOf,
          updatedAt: asOf
        },
        {
          id: 'goal-conflict',
          version: 1,
          syncStatus: 'conflict',
          title: 'Conflict',
          targetMinor: 1,
          openingTrackedMinor: 0,
          currencyCode: 'SAR',
          targetDate: '2026-12-31',
          linkedAccountId: null,
          iconKey: null,
          emergencyFund: false,
          status: 'active',
          createdAt: asOf,
          updatedAt: asOf
        }
      ]),
      getObligationsOverview: jest.fn().mockResolvedValue({
        payablesByCurrency: { SAR: 140000 },
        receivablesByCurrency: {},
        remainingByObligationId: {
          'obligation-rent': 90000,
          'obligation-conflict': 50000
        },
        nextDueDate: '2026-01-20',
        items: [
          {
            id: 'obligation-rent',
            version: 5,
            syncStatus: 'synced',
            direction: 'payable',
            type: 'rent',
            scheduleKind: 'open_ended',
            title: 'Rent provider hidden',
            provider: 'Provider Hidden',
            currencyCode: 'SAR',
            contractedTotalMinor: null,
            openingPaidMinor: 0,
            installmentAmountMinor: 999999,
            installmentCount: null,
            dueDay: 20,
            startDate: '2026-01-01',
            endDate: null,
            fundingAccountId: 'planning-account-hidden',
            automaticMatchingEnabled: false,
            providerKeywords: [],
            reminderTiming: null,
            notes: 'private planning note',
            status: 'active',
            createdAt: asOf,
            updatedAt: asOf
          },
          {
            id: 'obligation-conflict',
            version: 1,
            syncStatus: 'conflict',
            direction: 'payable',
            type: 'custom',
            scheduleKind: 'open_ended',
            title: 'Conflict obligation',
            provider: null,
            currencyCode: 'SAR',
            contractedTotalMinor: null,
            openingPaidMinor: 0,
            installmentAmountMinor: 999999,
            installmentCount: null,
            dueDay: null,
            startDate: '2026-01-01',
            endDate: null,
            fundingAccountId: null,
            automaticMatchingEnabled: false,
            providerKeywords: [],
            reminderTiming: null,
            notes: null,
            status: 'active',
            createdAt: asOf,
            updatedAt: asOf
          }
        ]
      })
    };
    const reports: Pick<ReportsService, 'getReport'> = {
      getReport: jest.fn().mockResolvedValue(report())
    };

    const context = await buildAssistantContextSnapshot({
      finance,
      planning,
      reports,
      asOf,
      period: { kind: 'monthly', anchorDate: '2026-01-01' },
      profile: { currencyCode: 'SAR', timeZone: 'Asia/Riyadh' }
    });

    expect(finance.listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart: Date.UTC(2026, 0, 1),
        periodEnd: Date.UTC(2026, 1, 1) - 1,
        accountIds: [],
        categoryIds: []
      }),
      null,
      100
    );
    expect(context.dataAsOf).toBe(asOf - 60_000);
    expect(context.period).toBe('monthly:2026-01-01');
    expect(context.snapshot.sources).toEqual(
      expect.arrayContaining([
        { kind: 'transaction', id: 'confirmed-expense', version: 3 },
        { kind: 'transaction', id: 'pending-local', version: 1 },
        { kind: 'budget', id: 'budget-jan', version: 2 },
        { kind: 'goal', id: 'goal-emergency', version: 4 },
        { kind: 'obligation', id: 'obligation-rent', version: 5 },
        { kind: 'report', id: 'report-monthly-2026-01', version: asOf }
      ])
    );
    expect(context.snapshot.sources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'needs-review' }),
        expect.objectContaining({ id: 'sync-conflict' }),
        expect.objectContaining({ id: 'failed-transaction' }),
        expect.objectContaining({ id: 'goal-conflict' }),
        expect.objectContaining({ id: 'obligation-conflict' })
      ])
    );
    expect(context.snapshot.values).toEqual(
      expect.arrayContaining([
        { key: 'assistant.context.transaction.pendingLocalConfirmed.count' },
        {
          key: 'assistant.context.report.income',
          minor: 300000,
          currency: 'SAR',
          status: 'available'
        },
        {
          key: 'assistant.context.budget.limit',
          minor: 200000,
          currency: 'SAR'
        },
        {
          key: 'assistant.context.budget.remaining',
          minor: 187500,
          currency: 'SAR'
        },
        {
          key: 'assistant.context.goal.target',
          minor: 500000,
          currency: 'SAR'
        },
        {
          key: 'assistant.context.obligation.payables',
          minor: 90000,
          currency: 'SAR'
        }
      ])
    );
    expect(context.snapshot.values).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'assistant.context.transaction.confirmed.total'
        })
      ])
    );
    expect(context.snapshot.completeness).toEqual({
      confirmed: 6,
      reviewRequired: 1,
      conflicts: 3,
      reasons: [
        'review_required_excluded',
        'conflict_excluded',
        'pending_local_labeled'
      ]
    });
    expect(context.snapshot.reportReference).toBe('report-monthly-2026-01');
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('raw sms note');
    expect(serialized).not.toContain('Raw Merchant');
    expect(serialized).not.toContain('account-hidden');
    expect(serialized).not.toContain('planning-account-hidden');
    expect(serialized).not.toContain('Provider Hidden');
    expect(serialized).not.toContain('private planning note');
  });

  it('returns an immutable snapshot so historical responses cannot drift', async () => {
    const context = await buildAssistantContextSnapshot({
      finance: {
        listTransactions: jest.fn().mockResolvedValue({
          items: [tx('confirmed-expense')],
          nextCursor: null,
          total: 1
        })
      },
      planning: {
        getBudget: jest.fn().mockResolvedValue(null),
        listGoals: jest.fn().mockResolvedValue([]),
        getObligationsOverview: jest.fn().mockResolvedValue({
          payablesByCurrency: {},
          receivablesByCurrency: {},
          remainingByObligationId: {},
          nextDueDate: null,
          items: []
        })
      },
      reports: {
        getReport: jest.fn().mockResolvedValue(report({ key: 'report-empty' }))
      },
      asOf,
      period: { kind: 'monthly', anchorDate: '2026-01-01' },
      profile: { currencyCode: 'SAR', timeZone: 'Asia/Riyadh' }
    });

    expect(() => {
      (context.snapshot.sources as unknown[]).push({
        kind: 'report',
        id: 'mutated',
        version: 1
      });
    }).toThrow();
  });

  it('preserves estimated report values and derives confirmed obligation totals', async () => {
    const context = await buildAssistantContextSnapshot({
      finance: {
        listTransactions: jest
          .fn()
          .mockResolvedValue({ items: [], nextCursor: null, total: 0 })
      },
      planning: {
        getBudget: jest.fn().mockResolvedValue(null),
        listGoals: jest.fn().mockResolvedValue([]),
        getObligationsOverview: jest.fn().mockResolvedValue({
          payablesByCurrency: { SAR: 999999 },
          receivablesByCurrency: { SAR: 999999 },
          remainingByObligationId: {
            'payable-raw': 7000,
            'receivable-raw': 5000,
            'large-payable': Number.MAX_SAFE_INTEGER,
            'overflow-payable': 1
          },
          nextDueDate: null,
          items: [
            txObligation('payable-raw', 999999, 'payable'),
            txObligation('receivable-raw', 5000, 'receivable'),
            txObligation(
              'large-payable',
              Number.MAX_SAFE_INTEGER,
              'payable',
              'BHD'
            ),
            txObligation('overflow-payable', 1, 'payable', 'BHD')
          ]
        })
      },
      reports: {
        getReport: jest.fn().mockResolvedValue(
          report({
            summary: { ...report().summary, income: estimatedMoney(12345) }
          })
        )
      },
      asOf,
      period: { kind: 'monthly', anchorDate: '2026-01-01' },
      profile: { currencyCode: 'SAR', timeZone: 'Asia/Riyadh' }
    });

    expect(context.snapshot.values).toEqual(
      expect.arrayContaining([
        {
          key: 'assistant.context.report.income',
          minor: 12345,
          currency: 'SAR',
          status: 'estimated'
        },
        {
          key: 'assistant.context.obligation.payables',
          minor: 7000,
          currency: 'SAR'
        },
        {
          key: 'assistant.context.obligation.receivables',
          minor: 5000,
          currency: 'SAR'
        }
      ])
    );
    expect(context.snapshot.values).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minor: 999999 }),
        expect.objectContaining({ currency: 'BHD' })
      ])
    );
    expect(context.snapshot.completeness.reasons).toContain(
      'obligation_total_unavailable'
    );
  });
});

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'expense',
    amountMinor: 1000,
    currencyCode: 'SAR',
    accountId: 'account-hidden',
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: 'category-food',
    title: 'Safe title must not be copied',
    merchant: null,
    paymentMethod: null,
    occurredAt: asOf,
    source: 'manual',
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced',
    originalTransactionId: null,
    obligationId: null,
    notes: null,
    version: 1,
    adjustmentSign: 1,
    deletedAt: null,
    undoExpiresAt: null,
    createdAt: asOf,
    updatedAt: asOf,
    ...overrides
  };
}

function report(overrides: Partial<FinancialReport> = {}): FinancialReport {
  return {
    key: 'report-monthly-2026-01',
    period: {
      kind: 'monthly',
      anchorDate: '2026-01-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      startInstant: Date.UTC(2026, 0, 1),
      endExclusiveInstant: Date.UTC(2026, 1, 1),
      timeZone: 'Asia/Riyadh',
      inProgress: false,
      comparisonStartDate: '2025-12-01',
      comparisonEndDate: '2025-12-31',
      comparisonStartInstant: Date.UTC(2025, 11, 1),
      comparisonEndExclusiveInstant: Date.UTC(2026, 0, 1)
    },
    currencyCode: 'SAR',
    generatedAt: asOf,
    dataAsOf: asOf - 60_000,
    dataState: 'complete',
    completenessReasons: [],
    summary: {
      income: availableMoney(300000),
      expense: availableMoney(12500),
      netCashFlow: availableMoney(287500),
      savingsRateBasisPoints: { status: 'available', value: 1000 },
      obligationPayments: availableMoney(90000),
      largestCategory: {
        status: 'unavailable',
        value: null,
        reason: 'insufficient_history'
      },
      largestTransaction: {
        status: 'unavailable',
        value: null,
        reason: 'insufficient_history'
      },
      comparisons: []
    },
    breakdowns: [],
    insights: [],
    ...overrides
  };
}

function availableMoney(minorUnits: number): ReportValue<MoneyValue> {
  return {
    status: 'available',
    value: { minorUnits, currencyCode: 'SAR', scale: 2 }
  };
}

function estimatedMoney(minorUnits: number): ReportValue<MoneyValue> {
  return {
    status: 'estimated',
    value: { minorUnits, currencyCode: 'SAR', scale: 2 },
    asOf,
    originalValues: []
  };
}

function txObligation(
  id: string,
  installmentAmountMinor: number,
  direction: 'payable' | 'receivable',
  currencyCode = 'SAR'
) {
  return {
    id,
    version: 1,
    syncStatus: 'synced' as const,
    direction,
    type: 'custom' as const,
    scheduleKind: 'open_ended' as const,
    title: id,
    provider: null,
    currencyCode,
    contractedTotalMinor: null,
    openingPaidMinor: 0,
    installmentAmountMinor,
    installmentCount: null,
    dueDay: null,
    startDate: '2026-01-01',
    endDate: null,
    fundingAccountId: null,
    automaticMatchingEnabled: false,
    providerKeywords: [],
    reminderTiming: null,
    notes: null,
    status: 'active' as const,
    createdAt: asOf,
    updatedAt: asOf
  };
}

function calculation<T>(value: T) {
  return { status: 'available' as const, value, estimated: false, asOf };
}
