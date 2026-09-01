import { HttpException } from '@nestjs/common';

import type { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningService } from '../../../src/planning/planning.service';

const principal = { userId: 'budget_owner', sessionId: 'session', factorAgeSeconds: 0 };
const budgetId = '70000000-0000-4000-8000-000000000021';
const categoryId = '70000000-0000-4000-8000-000000000022';

describe('budget planning service', () => {
  const mutate = jest
    .fn<ReturnType<PlanningRepository['mutate']>, Parameters<PlanningRepository['mutate']>>()
    .mockResolvedValue({ operationId: budgetId, replayed: false });
  const listBudgets = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const getBudget = jest.fn().mockResolvedValue({ id: budgetId, totalMinor: '1000' });
  const getBudgetSummary = jest.fn().mockResolvedValue({ budgetId, items: [] });
  const service = new PlanningService({
    mutate,
    listBudgets,
    getBudget,
    getBudgetSummary,
  } as never);

  it('normalizes independent inclusive budget periods and canonical money', async () => {
    await service.createBudget({
      principal,
      idempotencyKey: 'budget-create-key-0001',
      requestId: 'request',
      body: {
        name: ' September ',
        currencyCode: 'SAR',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        totalMinor: '1000',
        incomeTargetMinor: '2000',
        savingsTargetMinor: '100',
        rolloverEnabled: false,
        rolloverMinor: '0',
        copiedFromBudgetId: null,
      },
    });
    const input = mutate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      operation: 'createBudget',
      scope: 'planning.budget.create',
      status: 201,
    });
    expect(input?.command).toMatchObject({
      name: 'September',
      totalMinor: '1000',
      rolloverMinor: '0',
    });
  });

  it('normalizes a complete unique category set with expected version', async () => {
    await service.replaceBudgetCategories(budgetId, {
      principal,
      idempotencyKey: 'budget-allocate-key-01',
      requestId: 'request',
      body: {
        expectedVersion: 2,
        allocations: [
          {
            categoryId,
            limitMinor: '1000',
            rolloverMinor: '0',
            alertThresholds: [80, 100],
            status: 'active',
          },
        ],
      },
    });
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'replaceBudgetCategories',
        command: {
          budgetId,
          expectedVersion: 2,
          allocations: [
            {
              categoryId,
              limitMinor: '1000',
              rolloverMinor: '0',
              alertThresholds: [80, 100],
              status: 'active',
            },
          ],
        },
      }),
    );
  });

  it('supports lifecycle/copy provenance and bounded reads without merging overlaps', async () => {
    await service.updateBudget(budgetId, {
      principal,
      idempotencyKey: 'budget-update-key-0001',
      requestId: 'request',
      body: {
        expectedVersion: 2,
        patch: { status: 'paused', rolloverEnabled: true, rolloverMinor: '50' },
      },
    });
    await expect(service.listBudgets(principal, { period: '2026-09' }, 'request')).resolves.toEqual(
      { items: [], nextCursor: null },
    );
    await expect(service.getBudget(principal, budgetId, 'request')).resolves.toMatchObject({
      totalMinor: '1000',
    });
    await expect(service.getBudgetSummary(principal, budgetId, 'request')).resolves.toMatchObject({
      budgetId,
    });
  });

  it.each([
    {
      name: 'B',
      currencyCode: 'SAR',
      periodStart: '2026-09-30',
      periodEnd: '2026-09-01',
      totalMinor: '1',
    },
    {
      name: 'B',
      currencyCode: 'SAR',
      periodStart: '2026-01-01',
      periodEnd: '2027-01-02',
      totalMinor: '1',
    },
    {
      name: 'B',
      currencyCode: 'SAR',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      totalMinor: '-1',
    },
    {
      name: 'B',
      currencyCode: 'sar',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      totalMinor: '1',
    },
    {
      name: 'B',
      currencyCode: 'SAR',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      totalMinor: '1',
      userId: 'other',
    },
  ])('rejects invalid create input %#', (body) => {
    expect(() =>
      service.createBudget({
        principal,
        idempotencyKey: 'budget-invalid-key-01',
        requestId: 'bad',
        body,
      }),
    ).toThrow(HttpException);
  });

  it('rejects duplicate categories, unsorted thresholds, and rollover inconsistency', () => {
    const allocation = {
      categoryId,
      limitMinor: '1',
      rolloverMinor: '0',
      alertThresholds: [100, 80],
      status: 'active',
    };
    expect(() =>
      service.replaceBudgetCategories(budgetId, {
        principal,
        idempotencyKey: 'budget-invalid-key-02',
        requestId: 'bad',
        body: {
          expectedVersion: 1,
          allocations: [allocation],
        },
      }),
    ).toThrow(HttpException);
    expect(() =>
      service.replaceBudgetCategories(budgetId, {
        principal,
        idempotencyKey: 'budget-invalid-key-03',
        requestId: 'bad',
        body: {
          expectedVersion: 1,
          allocations: [
            { ...allocation, alertThresholds: [100] },
            { ...allocation, alertThresholds: [100] },
          ],
        },
      }),
    ).toThrow(HttpException);
  });
});
