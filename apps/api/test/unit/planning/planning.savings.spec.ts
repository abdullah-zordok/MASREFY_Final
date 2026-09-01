import { HttpException } from '@nestjs/common';

import type { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningService } from '../../../src/planning/planning.service';

const principal = { userId: 'savings_owner', sessionId: 'session', factorAgeSeconds: 0 };
const goalId = '70000000-0000-4000-8000-000000000051';
const accountId = '70000000-0000-4000-8000-000000000052';
const transactionId = '70000000-0000-4000-8000-000000000053';
const movementId = '70000000-0000-4000-8000-000000000054';

describe('savings planning service', () => {
  const mutate = jest
    .fn<ReturnType<PlanningRepository['mutate']>, Parameters<PlanningRepository['mutate']>>()
    .mockResolvedValue({ operationId: goalId, replayed: false });
  const listSavingsGoals = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const getSavingsGoal = jest.fn().mockResolvedValue({ id: goalId, progressMinor: '500' });
  const service = new PlanningService({ mutate, listSavingsGoals, getSavingsGoal } as never);

  it('normalizes a positive exact target and owned optional account metadata', async () => {
    await service.createSavingsGoal({
      principal,
      idempotencyKey: 'savings-goal-create-key1',
      requestId: 'request',
      body: {
        name: ' Emergency ',
        targetMinor: '1000',
        openingTrackedMinor: '100',
        currencyCode: 'SAR',
        targetDate: '2027-09-01',
        linkedAccountId: accountId,
        iconKey: 'shield.safe',
        emergencyFund: true,
      },
    });
    const input = mutate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      operation: 'createSavingsGoal',
      scope: 'planning.savings-goal.create',
      status: 201,
    });
    expect(input?.command).toMatchObject({
      name: 'Emergency',
      targetMinor: '1000',
      openingTrackedMinor: '100',
    });
  });

  it('keeps target-below-progress lifecycle decision explicit in a versioned patch', async () => {
    await service.updateSavingsGoal(goalId, {
      principal,
      idempotencyKey: 'savings-goal-update-key1',
      requestId: 'request',
      body: {
        expectedVersion: 2,
        patch: { targetMinor: '400', status: 'completed' },
      },
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { goalId, expectedVersion: 2, patch: { targetMinor: '400', status: 'completed' } },
      }),
    );
  });

  it('normalizes signed movement kinds, corrections, and versioned reversal', async () => {
    await service.recordSavingsMovement(goalId, {
      principal,
      idempotencyKey: 'savings-movement-key-001',
      requestId: 'request',
      body: {
        transactionId,
        expectedVersion: 2,
        kind: 'contribution',
        amountMinor: '500',
        replacesMovementId: null,
      },
    });
    await service.recordSavingsMovement(goalId, {
      principal,
      idempotencyKey: 'savings-adjustment-key-01',
      requestId: 'request',
      body: {
        transactionId,
        expectedVersion: 3,
        kind: 'adjustment',
        amountMinor: '-1',
        replacesMovementId: movementId,
      },
    });
    await service.reverseSavingsMovement(goalId, movementId, {
      principal,
      idempotencyKey: 'savings-reversal-key-001',
      requestId: 'request',
      body: { expectedVersion: 4 },
    });
    expect(mutate).toHaveBeenCalledTimes(3);
  });

  it('serves bounded status-filtered exact progress reads', async () => {
    await expect(
      service.listSavingsGoals(principal, { status: 'active', limit: '10' }, 'request'),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.getSavingsGoal(principal, goalId, 'request')).resolves.toMatchObject({
      progressMinor: '500',
    });
  });

  it.each([
    { kind: 'contribution', amountMinor: '-1', replacesMovementId: null },
    { kind: 'withdrawal', amountMinor: '1', replacesMovementId: null },
    { kind: 'adjustment', amountMinor: '1', replacesMovementId: null },
    { kind: 'adjustment', amountMinor: '0', replacesMovementId: movementId },
  ])('rejects invalid signed movement %#', (movement) => {
    expect(() =>
      service.recordSavingsMovement(goalId, {
        principal,
        idempotencyKey: 'savings-invalid-key-001',
        requestId: 'bad',
        body: { transactionId, expectedVersion: 1, ...movement },
      }),
    ).toThrow(HttpException);
  });

  it('rejects zero targets, unsafe icon keys, invalid dates, and mass assignment', () => {
    const base = { name: 'Goal', targetMinor: '100', currencyCode: 'SAR' };
    for (const body of [
      { ...base, targetMinor: '0' },
      { ...base, iconKey: 'bad icon' },
      { ...base, targetDate: 'bad' },
      { ...base, userId: 'other' },
    ])
      expect(() =>
        service.createSavingsGoal({
          principal,
          idempotencyKey: 'savings-invalid-key-002',
          requestId: 'bad',
          body,
        }),
      ).toThrow(HttpException);
  });
});
