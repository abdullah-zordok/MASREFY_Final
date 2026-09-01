import { HttpException } from '@nestjs/common';

import type { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningService } from '../../../src/planning/planning.service';

const principal = { userId: 'obligation_owner', sessionId: 'session', factorAgeSeconds: 0 };
const obligationId = '70000000-0000-4000-8000-000000000031';
const accountId = '70000000-0000-4000-8000-000000000032';

describe('obligation planning service', () => {
  const mutate = jest
    .fn<ReturnType<PlanningRepository['mutate']>, Parameters<PlanningRepository['mutate']>>()
    .mockResolvedValue({ operationId: obligationId, replayed: false });
  const listObligations = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const getObligation = jest.fn().mockResolvedValue({ id: obligationId, principalMinor: '1000' });
  const listObligationSchedule = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const service = new PlanningService({
    mutate,
    listObligations,
    getObligation,
    listObligationSchedule,
  } as never);

  it('normalizes fixed-term money, schedule, ownership references, notes, and unique keywords', async () => {
    await service.createObligation({
      principal,
      idempotencyKey: 'obligation-create-key-0001',
      requestId: 'request',
      body: {
        name: ' Car loan ',
        direction: 'payable',
        type: 'car_installment',
        scheduleKind: 'fixed_term',
        currencyCode: 'SAR',
        principalMinor: '1000',
        openingPaidMinor: '100',
        installmentAmountMinor: '300',
        installmentCount: 3,
        frequency: 'monthly',
        expectedDay: 31,
        customIntervalDays: null,
        startDate: '2026-09-01',
        endDate: null,
        defaultAccountId: accountId,
        automaticMatchingEnabled: true,
        provider: ' Bank ',
        providerKeywords: ['bank', 'car'],
        reminderTiming: 'due.before_3d',
        notes: ' Contract ',
      },
    });
    const input = mutate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      operation: 'createObligation',
      scope: 'planning.obligation.create',
      status: 201,
    });
    expect(input?.command).toMatchObject({
      name: 'Car loan',
      principalMinor: '1000',
      openingPaidMinor: '100',
      provider: 'Bank',
      notes: 'Contract',
    });
  });

  it('accepts open-ended and irregular schedules without inventing fixed-term fields', async () => {
    const base = {
      name: 'Utility',
      direction: 'payable',
      type: 'utility',
      currencyCode: 'SAR',
      principalMinor: '0',
      openingPaidMinor: '0',
      defaultAccountId: null,
      automaticMatchingEnabled: false,
      provider: null,
      providerKeywords: [],
      reminderTiming: null,
      notes: null,
      startDate: '2026-09-01',
      endDate: null,
    };
    await service.createObligation({
      principal,
      idempotencyKey: 'obligation-open-key-00001',
      requestId: 'request',
      body: {
        ...base,
        scheduleKind: 'open_ended',
        installmentAmountMinor: '50',
        installmentCount: null,
        frequency: 'weekly',
        expectedDay: 1,
        customIntervalDays: null,
      },
    });
    await service.createObligation({
      principal,
      idempotencyKey: 'obligation-irregular-key1',
      requestId: 'request',
      body: {
        ...base,
        scheduleKind: 'irregular',
        installmentAmountMinor: null,
        installmentCount: null,
        frequency: 'irregular',
        expectedDay: null,
        customIntervalDays: null,
      },
    });
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('normalizes versioned lifecycle updates and bounded status/schedule reads', async () => {
    await service.updateObligation(obligationId, {
      principal,
      idempotencyKey: 'obligation-update-key-0001',
      requestId: 'request',
      body: {
        expectedVersion: 2,
        patch: { status: 'paused', notes: null, providerKeywords: ['one'] },
      },
    });
    await expect(
      service.listObligations(principal, { status: 'active', limit: '10' }, 'request'),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.getObligation(principal, obligationId, 'request')).resolves.toMatchObject({
      principalMinor: '1000',
    });
    await expect(
      service.listObligationSchedule(principal, obligationId, { limit: '10' }, 'request'),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it.each([
    {
      scheduleKind: 'fixed_term',
      principalMinor: '0',
      installmentAmountMinor: '1',
      installmentCount: 1,
      frequency: 'monthly',
      expectedDay: 1,
    },
    {
      scheduleKind: 'fixed_term',
      principalMinor: '10',
      openingPaidMinor: '11',
      installmentAmountMinor: '1',
      installmentCount: 1,
      frequency: 'monthly',
      expectedDay: 1,
    },
    {
      scheduleKind: 'open_ended',
      principalMinor: '0',
      installmentAmountMinor: null,
      installmentCount: null,
      frequency: 'monthly',
      expectedDay: 1,
    },
    {
      scheduleKind: 'irregular',
      principalMinor: '0',
      installmentAmountMinor: null,
      installmentCount: null,
      frequency: 'monthly',
      expectedDay: 1,
    },
    {
      scheduleKind: 'open_ended',
      principalMinor: '0',
      installmentAmountMinor: '1',
      installmentCount: null,
      frequency: 'custom',
      customIntervalDays: 367,
    },
  ])('rejects invalid schedule combinations %#', (schedule) => {
    expect(() =>
      service.createObligation({
        principal,
        idempotencyKey: 'obligation-invalid-key-01',
        requestId: 'bad',
        body: {
          name: 'Bad',
          direction: 'payable',
          type: 'bill',
          currencyCode: 'SAR',
          startDate: '2026-09-01',
          ...schedule,
        },
      }),
    ).toThrow(HttpException);
  });

  it('rejects invalid dates, duplicate keywords, unsafe notes, and mass assignment', () => {
    const base = {
      name: 'Bad',
      direction: 'payable',
      type: 'bill',
      scheduleKind: 'open_ended',
      currencyCode: 'SAR',
      principalMinor: '0',
      installmentAmountMinor: '1',
      installmentCount: null,
      frequency: 'monthly',
      expectedDay: 1,
      startDate: '2026-10-01',
    };
    for (const body of [
      { ...base, endDate: '2026-09-01' },
      { ...base, providerKeywords: ['same', 'same'] },
      { ...base, notes: 'bad\u0000note' },
      { ...base, userId: 'other' },
    ])
      expect(() =>
        service.createObligation({
          principal,
          idempotencyKey: 'obligation-invalid-key-02',
          requestId: 'bad',
          body,
        }),
      ).toThrow(HttpException);
  });
});
