import { HttpException } from '@nestjs/common';

import { PlanningRepository } from '../../../src/planning/planning.repository';

const principal = { userId: 'owner', sessionId: 'session' } as never;

describe('PlanningRepository safe domain errors', () => {
  it.each([
    ['BUDGET_NOT_FOUND', undefined, 'PLANNING_NOT_FOUND'],
    ['SALARY_REFERENCE_INVALID', undefined, 'PLANNING_LEDGER_STATE_INVALID'],
    ['PAYMENT_ALLOCATION_SUM_MISMATCH', undefined, 'PLANNING_ALLOCATION_INVALID'],
    ['PAYMENT_TRANSACTION_USED', undefined, 'PLANNING_TRANSACTION_DUPLICATE'],
    ['PLANNING_PROGRESS_INSUFFICIENT', undefined, 'PLANNING_PROGRESS_INSUFFICIENT'],
    ['SAVINGS_TARGET_DECISION_REQUIRED', undefined, 'PLANNING_REVIEW_REQUIRED'],
    ['VERSION_CONFLICT', '7', 'PLANNING_VERSION_CONFLICT'],
  ])('maps %s without leaking database details', async (message, detail, code) => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('claim_sync_idempotency_key')) {
        const error = Object.assign(new Error(message), { code: 'P0001', detail });
        return Promise.reject(error);
      }
      return Promise.resolve({ rows: [] });
    });
    const repository = new PlanningRepository({
      withClient: (action: (client: unknown) => Promise<unknown>) => action({ query }),
    } as never);

    let thrown: unknown;
    try {
      await repository.mutate({
        operation: 'createSalaryProfile',
        scope: 'planning.salary-profile.create',
        status: 201,
        principal,
        command: {},
        idempotencyKey: 'planning-key-001',
        requestId: 'request',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getResponse()).toMatchObject({ code });
  });
});
