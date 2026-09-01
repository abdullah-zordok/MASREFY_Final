import type {
  Budget,
  SalaryProfile,
  SavingsGoal
} from '@/domain/financial-planning';
import { supportedCurrencies } from '@/domain/currencies';

type ApiRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
type ApiSalary = ApiRecord & {
  name: string;
  amountMinor: string;
  currencyCode: string;
  expectedDay: number | null;
  accountId: string | null;
  automaticDetectionEnabled: boolean;
  status: 'active' | 'paused' | 'archived';
};
type ApiBudget = ApiRecord & {
  name: string;
  currencyCode: string;
  periodStart: string;
  totalMinor: string;
  incomeTargetMinor: string;
  savingsTargetMinor: string;
  rolloverEnabled: boolean;
  rolloverMinor: string;
  status: 'draft' | 'active' | 'paused' | 'closed' | 'deleted';
  copiedFromBudgetId: string | null;
};
type ApiSavingsGoal = ApiRecord & {
  name: string;
  targetMinor: string;
  openingTrackedMinor: string;
  currencyCode: string;
  targetDate: string | null;
  linkedAccountId: string | null;
  iconKey: string | null;
  emergencyFund: boolean;
  status: 'active' | 'paused' | 'completed' | 'deleted';
};

export function parsePlanningMinor(value: string): number {
  if (!/^-?(?:0|[1-9]\d*)$/.test(value))
    throw new Error('PLANNING_MINOR_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('PLANNING_MINOR_UNSAFE');
  return parsed;
}

function metadata(value: ApiRecord) {
  const createdAt = Date.parse(value.createdAt);
  const updatedAt = Date.parse(value.updatedAt);
  if (
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  )
    throw new Error('PLANNING_RECORD_INVALID');
  return {
    id: value.id,
    version: value.version,
    syncStatus: 'synced' as const,
    createdAt,
    updatedAt
  };
}

function expectedDate(value: ApiSalary): SalaryProfile['nextExpectedDate'] {
  if (value.expectedDay === null)
    throw new Error('PLANNING_SALARY_DAY_UNAVAILABLE');
  const date = new Date(value.updatedAt);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = Math.min(
    value.expectedDay,
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  );
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` as SalaryProfile['nextExpectedDate'];
}

export function mapSalaryProfileFromApi(value: ApiSalary): SalaryProfile {
  return {
    ...metadata(value),
    expectedAmountMinor: parsePlanningMinor(value.amountMinor),
    currencyCode: value.currencyCode,
    salaryDay: value.expectedDay ?? 0,
    sourceName: value.name,
    receivingAccountId: value.accountId,
    nextExpectedDate: expectedDate(value),
    automaticDetectionEnabled: value.automaticDetectionEnabled,
    status: value.status
  };
}

export function mapBudgetFromApi(value: ApiBudget): Budget {
  return {
    ...metadata(value),
    name: value.name,
    periodKey: value.periodStart.slice(0, 7),
    currencyCode: value.currencyCode,
    configuredExpenseLimitMinor: parsePlanningMinor(value.totalMinor),
    incomeTargetMinor: parsePlanningMinor(value.incomeTargetMinor),
    savingsTargetMinor: parsePlanningMinor(value.savingsTargetMinor),
    rolloverEnabled: value.rolloverEnabled,
    rolloverCreditMinor: parsePlanningMinor(value.rolloverMinor),
    status: value.status,
    copiedFromBudgetId: value.copiedFromBudgetId
  };
}

export function mapSavingsGoalFromApi(value: ApiSavingsGoal): SavingsGoal {
  if (value.targetDate === null)
    throw new Error('PLANNING_TARGET_DATE_UNAVAILABLE');
  return {
    ...metadata(value),
    title: value.name,
    targetMinor: parsePlanningMinor(value.targetMinor),
    openingTrackedMinor: parsePlanningMinor(value.openingTrackedMinor),
    currencyCode: value.currencyCode,
    targetDate: value.targetDate as SavingsGoal['targetDate'],
    linkedAccountId: value.linkedAccountId,
    iconKey: value.iconKey,
    emergencyFund: value.emergencyFund,
    status: value.status === 'deleted' ? 'archived' : value.status
  };
}

type SalaryMigrationCandidate = {
  kind: 'salary-profile';
  ownerId: string;
  expectedOwnerId: string;
  payload: SalaryProfile;
};
type BudgetMigrationCandidate = {
  kind: 'budget';
  ownerId: string;
  expectedOwnerId: string;
  payload: Pick<
    Budget,
    | 'id'
    | 'version'
    | 'name'
    | 'periodKey'
    | 'currencyCode'
    | 'configuredExpenseLimitMinor'
    | 'incomeTargetMinor'
    | 'savingsTargetMinor'
    | 'rolloverEnabled'
    | 'rolloverCreditMinor'
    | 'status'
    | 'copiedFromBudgetId'
  >;
};
type CategoryBudgetMigrationCandidate = {
  kind: 'category-budget';
  ownerId: string;
  expectedOwnerId: string;
  payload: {
    id: string;
    version: number;
    budgetId: string;
    categoryId: string;
    limitMinor: number;
    alertThresholds: number[];
    status: 'active' | 'paused' | 'deleted';
  };
};
type GoalMovementMigrationCandidate = {
  kind: 'goal-movement';
  ownerId: string;
  expectedOwnerId: string;
  payload: {
    id: string;
    version: number;
    goalId: string;
    kind: 'contribution' | 'withdrawal' | 'correction';
    amountMinor: number;
    linkedTransactionId: string | null;
    status: 'pending' | 'posted' | 'reversed' | 'conflict';
    replacesMovementId: string | null;
  };
};
type PlanningMigrationCandidate =
  | SalaryMigrationCandidate
  | BudgetMigrationCandidate
  | CategoryBudgetMigrationCandidate
  | GoalMovementMigrationCandidate;
type PlanningMigrationResult =
  | {
      status: 'ready';
      resourceId: string;
      payload: Record<string, unknown>;
    }
  | {
      status: 'quarantined';
      resourceId: string;
      errorCode:
        | 'PLANNING_IMPORT_OWNERSHIP'
        | 'PLANNING_IMPORT_CURRENCY'
        | 'PLANNING_IMPORT_PRECISION'
        | 'PLANNING_IMPORT_LINK';
    };

export function preparePlanningMigrationMutation(
  candidate: PlanningMigrationCandidate
): PlanningMigrationResult {
  if (candidate.ownerId !== candidate.expectedOwnerId)
    return {
      status: 'quarantined',
      resourceId: candidate.payload.id,
      errorCode: 'PLANNING_IMPORT_OWNERSHIP'
    };
  const currencyCode =
    'currencyCode' in candidate.payload
      ? candidate.payload.currencyCode
      : null;
  if (
    currencyCode !== null &&
    !supportedCurrencies.some(({ code }) => code === currencyCode)
  )
    return {
      status: 'quarantined',
      resourceId: candidate.payload.id,
      errorCode: 'PLANNING_IMPORT_CURRENCY'
    };
  const amounts = Object.entries(candidate.payload)
    .filter(([key]) => key.endsWith('Minor'))
    .map(([, amount]) => amount);
  if (amounts.some((amount) => !Number.isSafeInteger(amount)))
    return {
      status: 'quarantined',
      resourceId: candidate.payload.id,
      errorCode: 'PLANNING_IMPORT_PRECISION'
    };
  if (candidate.kind === 'salary-profile') {
    const value = candidate.payload;
    return {
      status: 'ready',
      resourceId: value.id,
      payload: {
        name: value.sourceName,
        amountMinor: String(value.expectedAmountMinor),
        currencyCode: value.currencyCode,
        expectedDay: value.salaryDay,
        accountId: value.receivingAccountId,
        automaticDetectionEnabled: value.automaticDetectionEnabled,
        status: value.status,
        expectedVersion: value.version
      }
    };
  }
  if (candidate.kind === 'budget') {
    const value = candidate.payload;
    const [year, month] = value.periodKey.split('-').map(Number);
    if (!year || !month || month > 12)
      return {
        status: 'quarantined',
        resourceId: value.id,
        errorCode: 'PLANNING_IMPORT_LINK'
      };
    const periodEnd = new Date(Date.UTC(year, month, 0))
      .toISOString()
      .slice(0, 10);
    return {
      status: 'ready',
      resourceId: value.id,
      payload: {
        name: value.name,
        currencyCode: value.currencyCode,
        periodStart: `${value.periodKey}-01`,
        periodEnd,
        totalMinor: String(value.configuredExpenseLimitMinor),
        incomeTargetMinor: String(value.incomeTargetMinor),
        savingsTargetMinor: String(value.savingsTargetMinor),
        rolloverEnabled: value.rolloverEnabled,
        rolloverMinor: String(value.rolloverCreditMinor),
        status: value.status,
        copiedFromBudgetId: value.copiedFromBudgetId,
        expectedVersion: value.version
      }
    };
  }
  if (candidate.kind === 'category-budget') {
    const value = candidate.payload;
    if (!value.budgetId || !value.categoryId)
      return {
        status: 'quarantined',
        resourceId: value.id,
        errorCode: 'PLANNING_IMPORT_LINK'
      };
    return {
      status: 'ready',
      resourceId: value.id,
      payload: {
        budgetId: value.budgetId,
        categoryId: value.categoryId,
        limitMinor: String(value.limitMinor),
        alertThresholds: value.alertThresholds,
        status: value.status,
        expectedVersion: value.version
      }
    };
  }
  const value = candidate.payload;
  if (!value.goalId || !value.linkedTransactionId)
    return {
      status: 'quarantined',
      resourceId: value.id,
      errorCode: 'PLANNING_IMPORT_LINK'
    };
  return {
    status: 'ready',
    resourceId: value.id,
    payload: {
      goalId: value.goalId,
      kind: value.kind === 'correction' ? 'adjustment' : value.kind,
      amountMinor: String(value.amountMinor),
      transactionId: value.linkedTransactionId,
      status: value.status,
      replacesMovementId: value.replacesMovementId,
      expectedVersion: value.version
    }
  };
}
