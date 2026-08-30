import { addMonthsClamped, expectedDateForMonth } from './financial-planning';
import { localDateInTimeZone } from './financial-period';
import type { Locale } from './foundation';

const demoPlanningCopy = {
  en: {
    employer: 'Demo Employer',
    budget: 'Monthly budget',
    obligation: 'Car installment',
    provider: 'Demo Auto',
    providerKeywords: ['demo auto', 'car'],
    goal: 'Emergency fund'
  },
  ar: {
    employer: 'جهة العمل التجريبية',
    budget: 'الميزانية الشهرية',
    obligation: 'قسط السيارة',
    provider: 'معرض السيارات التجريبي',
    providerKeywords: ['معرض السيارات', 'سيارة'],
    goal: 'صندوق الطوارئ'
  }
} as const;

export function createDemoFinancialPlanningSeed(
  now = Date.now(),
  timeZone = 'Asia/Riyadh',
  locale: Locale = 'en'
) {
  const copy = demoPlanningCopy[locale];
  const today = localDateInTimeZone(now, timeZone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const periodKey = today.slice(0, 7);
  const monthStart = expectedDateForMonth(year, month, 1);
  const nextSalary = expectedDateForMonth(year, month + 1, 1);
  const dueDate = expectedDateForMonth(year, month, 25);
  const metadata = {
    version: 1,
    syncStatus: 'synced' as const,
    createdAt: now,
    updatedAt: now
  };

  return {
    salaryProfiles: [
      {
        ...metadata,
        id: 'demo-salary-profile',
        expectedAmountMinor: 1_250_000,
        currencyCode: 'SAR',
        salaryDay: 1,
        sourceName: copy.employer,
        receivingAccountId: 'account-default',
        nextExpectedDate: nextSalary,
        automaticDetectionEnabled: true,
        status: 'active' as const
      }
    ],
    salaryReceipts: [
      {
        ...metadata,
        id: 'demo-salary-receipt',
        salaryProfileId: 'demo-salary-profile',
        transactionId: 'demo-transaction-1',
        expectedOccurrenceDate: monthStart,
        receivedDate: monthStart,
        status: 'linked' as const,
        operationId: 'demo-salary-receipt-v1',
        replacesReceiptId: null
      }
    ],
    budgets: [
      {
        ...metadata,
        id: 'demo-budget-current',
        name: copy.budget,
        periodKey,
        currencyCode: 'SAR',
        configuredExpenseLimitMinor: 500_000,
        incomeTargetMinor: 1_250_000,
        savingsTargetMinor: 250_000,
        rolloverEnabled: true,
        rolloverCreditMinor: 25_000,
        status: 'active' as const,
        copiedFromBudgetId: null
      }
    ],
    categoryBudgets: [
      ['food', 120_000],
      ['restaurants', 60_000],
      ['shopping', 90_000]
    ].map(([categoryId, limitMinor], index) => ({
      ...metadata,
      id: `demo-category-budget-${index + 1}`,
      budgetId: 'demo-budget-current',
      categoryId: String(categoryId),
      limitMinor: Number(limitMinor),
      alertThresholds: [50, 80, 100],
      status: 'active' as const
    })),
    obligations: [
      {
        ...metadata,
        id: 'demo-obligation-car',
        direction: 'payable' as const,
        type: 'car_installment' as const,
        scheduleKind: 'fixed_term' as const,
        title: copy.obligation,
        provider: copy.provider,
        currencyCode: 'SAR',
        contractedTotalMinor: 6_000_000,
        openingPaidMinor: 1_000_000,
        installmentAmountMinor: 200_000,
        installmentCount: 25,
        dueDay: 25,
        startDate: dueDate,
        endDate: addMonthsClamped(dueDate, 24, 25),
        fundingAccountId: 'account-default',
        automaticMatchingEnabled: true,
        providerKeywords: [...copy.providerKeywords],
        reminderTiming: null,
        notes: null,
        status: 'active' as const
      }
    ],
    scheduleItems: Array.from({ length: 4 }, (_, index) => ({
      id: `demo-obligation-schedule-${index + 1}`,
      obligationId: 'demo-obligation-car',
      sequence: index + 1,
      dueDate: addMonthsClamped(dueDate, index, 25),
      scheduledMinor: 200_000,
      kind: 'installment' as const,
      status: 'upcoming' as const
    })),
    savingsGoals: [
      {
        ...metadata,
        id: 'demo-goal-emergency',
        title: copy.goal,
        targetMinor: 2_000_000,
        openingTrackedMinor: 500_000,
        currencyCode: 'SAR',
        targetDate: addMonthsClamped(today, 10, Number(today.slice(8, 10))),
        linkedAccountId: 'demo-account-cash',
        iconKey: null,
        emergencyFund: true,
        status: 'active' as const
      }
    ],
    goalMovements: [
      {
        ...metadata,
        id: 'demo-goal-movement-1',
        goalId: 'demo-goal-emergency',
        kind: 'contribution' as const,
        amountMinor: 50_000,
        movementDate: today,
        linkedTransactionId: null,
        conversionEstimate: null,
        status: 'posted' as const,
        operationId: 'demo-goal-movement-v1',
        replacesMovementId: null
      }
    ],
    payments: []
  };
}
