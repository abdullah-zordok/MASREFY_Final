import {
  mapSalaryProfileFromApi,
  preparePlanningMigrationMutation
} from '@/services/live/financial-planning-api-mapping';
import { salaryProfileWireFixture } from '@/test-utils/financial-planning-api-fixtures';

describe('financial planning backend migration mapping', () => {
  const ownerId = 'user_700000000000000000000001';
  const salary = mapSalaryProfileFromApi(salaryProfileWireFixture);

  it('preserves SQLite JSON identity, exact money, lifecycle, and account links', () => {
    const sqlitePayload = JSON.parse(JSON.stringify(salary));
    expect(
      preparePlanningMigrationMutation({
        kind: 'salary-profile',
        ownerId,
        expectedOwnerId: ownerId,
        payload: sqlitePayload
      })
    ).toEqual({
      status: 'ready',
      resourceId: salary.id,
      payload: {
        name: 'Employer',
        amountMinor: '1200000',
        currencyCode: 'SAR',
        expectedDay: 31,
        accountId: salary.receivingAccountId,
        automaticDetectionEnabled: true,
        status: 'active',
        expectedVersion: 1
      }
    });
  });

  it.each([
    ['ownership', { ownerId: 'user_other' }, 'PLANNING_IMPORT_OWNERSHIP'],
    [
      'currency',
      { payload: { ...salary, currencyCode: 'XXX' } },
      'PLANNING_IMPORT_CURRENCY'
    ],
    [
      'precision',
      {
        payload: { ...salary, expectedAmountMinor: Number.MAX_SAFE_INTEGER + 1 }
      },
      'PLANNING_IMPORT_PRECISION'
    ]
  ])('quarantines invalid %s without coercion', (_case, change, errorCode) => {
    expect(
      preparePlanningMigrationMutation({
        kind: 'salary-profile',
        ownerId,
        expectedOwnerId: ownerId,
        payload: salary,
        ...change
      })
    ).toEqual({ status: 'quarantined', resourceId: salary.id, errorCode });
  });

  it('preserves representative root and dependent lifecycle/link mappings', () => {
    const base = {
      ownerId,
      expectedOwnerId: ownerId
    };
    expect(
      preparePlanningMigrationMutation({
        ...base,
        kind: 'budget',
        payload: {
          id: '70000000-0000-4000-8000-000000000093',
          version: 2,
          name: 'September',
          periodKey: '2026-09',
          currencyCode: 'SAR',
          configuredExpenseLimitMinor: 500000,
          incomeTargetMinor: 1200000,
          savingsTargetMinor: 200000,
          rolloverEnabled: true,
          rolloverCreditMinor: 25000,
          status: 'paused',
          copiedFromBudgetId: '70000000-0000-4000-8000-000000000099'
        }
      })
    ).toEqual({
      status: 'ready',
      resourceId: '70000000-0000-4000-8000-000000000093',
      payload: expect.objectContaining({
        totalMinor: '500000',
        status: 'paused',
        copiedFromBudgetId: '70000000-0000-4000-8000-000000000099',
        expectedVersion: 2
      })
    });
    expect(
      preparePlanningMigrationMutation({
        ...base,
        kind: 'category-budget',
        payload: {
          id: '70000000-0000-4000-8000-000000000095',
          version: 3,
          budgetId: '70000000-0000-4000-8000-000000000093',
          categoryId: '70000000-0000-4000-8000-000000000096',
          limitMinor: 100000,
          alertThresholds: [50, 80],
          status: 'active'
        }
      })
    ).toEqual({
      status: 'ready',
      resourceId: '70000000-0000-4000-8000-000000000095',
      payload: {
        budgetId: '70000000-0000-4000-8000-000000000093',
        categoryId: '70000000-0000-4000-8000-000000000096',
        limitMinor: '100000',
        alertThresholds: [50, 80],
        status: 'active',
        expectedVersion: 3
      }
    });
    expect(
      preparePlanningMigrationMutation({
        ...base,
        kind: 'goal-movement',
        payload: {
          id: '70000000-0000-4000-8000-000000000097',
          version: 4,
          goalId: '70000000-0000-4000-8000-000000000094',
          kind: 'correction',
          amountMinor: -2500,
          linkedTransactionId: '70000000-0000-4000-8000-000000000098',
          status: 'posted',
          replacesMovementId: '70000000-0000-4000-8000-000000000090'
        }
      })
    ).toEqual({
      status: 'ready',
      resourceId: '70000000-0000-4000-8000-000000000097',
      payload: expect.objectContaining({
        goalId: '70000000-0000-4000-8000-000000000094',
        amountMinor: '-2500',
        transactionId: '70000000-0000-4000-8000-000000000098',
        status: 'posted',
        replacesMovementId: '70000000-0000-4000-8000-000000000090',
        expectedVersion: 4
      })
    });
  });
});
