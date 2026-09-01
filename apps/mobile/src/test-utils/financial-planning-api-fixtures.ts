export const planningApiOperationParity = {
  listSalaryProfiles: 'getSalaryOverview',
  createSalaryProfile: 'saveSalaryProfile',
  listBudgets: 'listBudgets',
  createBudget: 'saveBudget',
  listObligations: 'listObligations',
  createObligation: 'createObligation',
  listPaymentMatches: 'listPaymentMatches',
  decidePaymentMatch: 'resolvePaymentMatch',
  listSavingsGoals: 'listGoals',
  createSavingsGoal: 'createGoal',
  getPlanningSummary: 'getPlanningOverview'
} as const;

export const salaryProfileWireFixture = {
  id: '70000000-0000-4000-8000-000000000091',
  name: 'Employer',
  amountMinor: '1200000',
  currencyCode: 'SAR',
  frequency: 'monthly',
  expectedDay: 31,
  customIntervalDays: null,
  accountId: '70000000-0000-4000-8000-000000000092',
  automaticDetectionEnabled: true,
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: 1
} as const;

export const budgetWireFixture = {
  id: '70000000-0000-4000-8000-000000000093',
  name: 'September',
  currencyCode: 'SAR',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  totalMinor: '500000',
  incomeTargetMinor: '1200000',
  savingsTargetMinor: '200000',
  rolloverEnabled: true,
  rolloverMinor: '25000',
  status: 'active',
  copiedFromBudgetId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: 1
} as const;

export const savingsGoalWireFixture = {
  id: '70000000-0000-4000-8000-000000000094',
  name: 'Emergency',
  currencyCode: 'SAR',
  targetMinor: '2000000',
  openingTrackedMinor: '500000',
  progressMinor: '550000',
  remainingMinor: '1450000',
  progressBps: 2750,
  targetDate: '2026-12-31',
  linkedAccountId: salaryProfileWireFixture.accountId,
  iconKey: null,
  emergencyFund: true,
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: 1
} as const;
