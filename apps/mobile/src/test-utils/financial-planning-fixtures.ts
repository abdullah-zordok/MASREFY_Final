import type {
  Budget,
  CategoryBudget,
  GoalMovement,
  Obligation,
  ObligationPayment,
  ObligationScheduleItem,
  PaymentMatch,
  PlanningConflict,
  SalaryProfile,
  SalaryReceiptLink,
  SavingsGoal
} from '@/domain/financial-planning';
import type { Transaction } from '@/domain/core-finance';
import { fixtureAccounts, fixtureCategories } from './core-finance-fixtures';

const now = Date.UTC(2026, 0, 15);

export const planningToday = '2026-01-15';

export const fixtureSalaryProfile: SalaryProfile = {
  id: 'salary-primary',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  expectedAmountMinor: 12_000_00,
  currencyCode: 'SAR',
  salaryDay: 31,
  sourceName: 'Masarifi Demo Employer',
  receivingAccountId: fixtureAccounts[0].id,
  nextExpectedDate: '2026-01-31',
  automaticDetectionEnabled: true,
  status: 'active'
};

export const fixtureSalaryTransaction: Transaction = {
  id: 'transaction-salary-jan',
  type: 'income',
  amountMinor: 12_000_00,
  currencyCode: 'SAR',
  accountId: fixtureAccounts[0].id,
  destinationAccountId: null,
  feeMinor: 0,
  categoryId: fixtureCategories[0].id,
  title: 'Salary',
  merchant: 'Masarifi Demo Employer',
  paymentMethod: null,
  occurredAt: Date.UTC(2026, 0, 1),
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
  createdAt: now,
  updatedAt: now
};

export const fixtureSalaryReceipt: SalaryReceiptLink = {
  id: 'receipt-jan',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  salaryProfileId: fixtureSalaryProfile.id,
  transactionId: fixtureSalaryTransaction.id,
  expectedOccurrenceDate: '2026-01-31',
  receivedDate: '2026-01-01',
  status: 'linked',
  operationId: 'op-receipt-jan',
  replacesReceiptId: null
};

export const fixtureBudget: Budget = {
  id: 'budget-jan',
  name: null,
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  periodKey: '2026-01',
  currencyCode: 'SAR',
  configuredExpenseLimitMinor: 5_000_00,
  incomeTargetMinor: 12_000_00,
  savingsTargetMinor: 2_000_00,
  rolloverEnabled: true,
  rolloverCreditMinor: 250_00,
  status: 'active',
  copiedFromBudgetId: null
};

export const fixtureCategoryBudget: CategoryBudget = {
  id: 'category-budget-food',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  budgetId: fixtureBudget.id,
  categoryId: fixtureCategories[0].id,
  limitMinor: 1_500_00,
  alertThresholds: [50, 80, 90, 100],
  status: 'active'
};

export const fixtureSecondCategoryBudget: CategoryBudget = {
  ...fixtureCategoryBudget,
  id: 'category-budget-dining',
  categoryId: fixtureCategories[1].id,
  limitMinor: 1_000_00
};

export const fixtureObligation: Obligation = {
  id: 'obligation-car',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  direction: 'payable',
  type: 'car_installment',
  scheduleKind: 'fixed_term',
  title: 'Car installment',
  provider: 'Demo Auto',
  currencyCode: 'SAR',
  contractedTotalMinor: 60_000_00,
  openingPaidMinor: 10_000_00,
  installmentAmountMinor: 2_000_00,
  installmentCount: 25,
  dueDay: 25,
  startDate: '2026-01-25',
  endDate: '2028-01-25',
  fundingAccountId: fixtureAccounts[0].id,
  automaticMatchingEnabled: true,
  providerKeywords: ['demo auto', 'car'],
  reminderTiming: null,
  notes: null,
  status: 'active'
};

export const fixtureSchedule: ObligationScheduleItem[] = [
  {
    id: 'schedule-car-1',
    obligationId: fixtureObligation.id,
    sequence: 1,
    dueDate: '2026-01-25',
    scheduledMinor: 2_000_00,
    kind: 'installment',
    status: 'upcoming'
  },
  {
    id: 'schedule-car-2',
    obligationId: fixtureObligation.id,
    sequence: 2,
    dueDate: '2026-02-25',
    scheduledMinor: 2_000_00,
    kind: 'installment',
    status: 'upcoming'
  }
];

export const fixturePayment: ObligationPayment = {
  id: 'payment-car-1',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  obligationId: fixtureObligation.id,
  transactionId: 'transaction-payment-car',
  amountMinor: 2_000_00,
  currencyCode: 'SAR',
  paidDate: '2026-01-25',
  case: 'full',
  allocationIntent: 'current',
  allocations: [{ scheduleItemId: 'schedule-car-1', amountMinor: 2_000_00 }],
  principalReductionMinor: 0,
  settlementAdjustmentMinor: 0,
  source: 'manual',
  transactionOwnership: 'created',
  status: 'posted',
  operationId: 'op-payment-car-1',
  replacesPaymentId: null
};

export const fixtureGoal: SavingsGoal = {
  id: 'goal-emergency',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  title: 'Emergency fund',
  targetMinor: 20_000_00,
  openingTrackedMinor: 5_000_00,
  currencyCode: 'SAR',
  targetDate: '2026-12-31',
  linkedAccountId: fixtureAccounts[0].id,
  iconKey: null,
  emergencyFund: true,
  status: 'active'
};

export const fixtureMovement: GoalMovement = {
  id: 'movement-emergency-1',
  version: 1,
  syncStatus: 'synced',
  createdAt: now,
  updatedAt: now,
  goalId: fixtureGoal.id,
  kind: 'contribution',
  amountMinor: 500_00,
  movementDate: '2026-01-10',
  linkedTransactionId: null,
  conversionEstimate: null,
  status: 'posted',
  operationId: 'op-goal-movement-1',
  replacesMovementId: null
};

export const fixturePaymentMatch: PaymentMatch = {
  id: 'match-payment-car',
  transactionId: fixturePayment.transactionId,
  candidateObligationIds: [fixtureObligation.id],
  duplicatePaymentIds: [],
  status: 'clear',
  resolution: null,
  advisoryConfidence: 0.95,
  reasonCodes: ['amount_match', 'keyword_match'],
  version: 1,
  transaction: {
    id: fixturePayment.transactionId,
    amountMinor: fixturePayment.amountMinor,
    currencyCode: fixturePayment.currencyCode,
    occurredAt: now,
    title: fixtureObligation.provider ?? fixtureObligation.title,
    merchant: fixtureObligation.provider,
    sourceAccountId: fixtureAccounts[0].id,
    sourceAccountName: fixtureAccounts[0].name
  },
  candidate: {
    id: fixtureObligation.id,
    title: fixtureObligation.title,
    provider: fixtureObligation.provider,
    type: fixtureObligation.type,
    direction: fixtureObligation.direction,
    currencyCode: fixtureObligation.currencyCode,
    remainingMinor: 48_000_00,
    nextDueDate: fixtureSchedule[0].dueDate,
    nextDueAmountMinor: fixtureSchedule[0].scheduledMinor,
    obligationVersion: fixtureObligation.version
  },
  suggestedAllocation: {
    scheduleItemId: fixtureSchedule[0].id,
    amountMinor: fixturePayment.amountMinor
  }
};

export const fixturePlanningConflict: PlanningConflict = {
  id: 'conflict-budget-jan',
  entityKind: 'budget',
  entityId: fixtureBudget.id,
  localSnapshot: fixtureBudget,
  laterSnapshot: { ...fixtureBudget, version: 2, configuredExpenseLimitMinor: 4_500_00 },
  resolution: null,
  status: 'pending',
  createdAt: now,
  resolvedAt: null
};

export const financialPlanningSeed = {
  salaryProfiles: [fixtureSalaryProfile],
  salaryReceipts: [fixtureSalaryReceipt],
  budgets: [fixtureBudget],
  categoryBudgets: [fixtureCategoryBudget, fixtureSecondCategoryBudget],
  obligations: [fixtureObligation],
  scheduleItems: fixtureSchedule,
  payments: [fixturePayment],
  paymentMatches: [fixturePaymentMatch],
  savingsGoals: [fixtureGoal],
  goalMovements: [fixtureMovement],
  conflicts: [fixturePlanningConflict]
};
