import { HttpException } from '@nestjs/common';

import type { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningService } from '../../../src/planning/planning.service';

const principal = { userId: 'payment_owner', sessionId: 'session', factorAgeSeconds: 0 };
const obligationId = '70000000-0000-4000-8000-000000000041';
const paymentId = '70000000-0000-4000-8000-000000000042';
const transactionId = '70000000-0000-4000-8000-000000000043';
const scheduleItemId = '70000000-0000-4000-8000-000000000044';
const matchId = '70000000-0000-4000-8000-000000000045';

describe('payment and match planning service', () => {
  const mutate = jest
    .fn<ReturnType<PlanningRepository['mutate']>, Parameters<PlanningRepository['mutate']>>()
    .mockResolvedValue({ operationId: paymentId, replayed: false });
  const listPaymentMatches = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const getPaymentMatch = jest.fn().mockResolvedValue({ id: matchId, status: 'proposed' });
  const service = new PlanningService({ mutate, listPaymentMatches, getPaymentMatch } as never);
  const payment = {
    transactionId,
    expectedVersion: 2,
    paymentMethod: ' Card ',
    paymentCase: 'partial',
    allocationIntent: 'current',
    source: 'manual',
    allocations: [{ scheduleItemId, amountMinor: '300' }],
  };

  it('normalizes an explicit exact payment intent and allocation set', async () => {
    await service.allocateObligationPayment(obligationId, {
      principal,
      idempotencyKey: 'payment-record-key-00001',
      requestId: 'request',
      body: payment,
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'allocateObligationPayment',
        scope: 'planning.obligation-payment.record',
        status: 201,
        command: { obligationId, ...payment, paymentMethod: 'Card' },
      }),
    );
  });

  it('normalizes versioned reversal and proposed match terminal decisions', async () => {
    await service.reverseObligationPayment(obligationId, paymentId, {
      principal,
      idempotencyKey: 'payment-reverse-key-0001',
      requestId: 'request',
      body: { expectedVersion: 1 },
    });
    await service.decidePaymentMatch(matchId, {
      principal,
      idempotencyKey: 'payment-match-reject-key1',
      requestId: 'request',
      body: { decision: 'rejected', expectedVersion: 1, allocation: null },
    });
    await service.decidePaymentMatch(matchId, {
      principal,
      idempotencyKey: 'payment-match-accept-key1',
      requestId: 'request',
      body: { decision: 'accepted', expectedVersion: 1, allocation: payment },
    });
    const input = mutate.mock.calls.find(
      ([call]) => call.operation === 'decidePaymentMatch' && call.command.decision === 'accepted',
    );
    expect(input?.[0].command).toMatchObject({ matchId, decision: 'accepted' });
  });

  it('serves bounded, status-filtered match reads without evidence authority', async () => {
    await expect(
      service.listPaymentMatches(principal, { status: 'proposed', limit: '10' }, 'request'),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.getPaymentMatch(principal, matchId, 'request')).resolves.toMatchObject({
      status: 'proposed',
    });
  });

  it.each([
    { ...payment, allocations: [] },
    { ...payment, allocations: [{ scheduleItemId, amountMinor: '0' }] },
    {
      ...payment,
      allocations: [
        { scheduleItemId, amountMinor: '1' },
        { scheduleItemId, amountMinor: '2' },
      ],
    },
    { ...payment, paymentCase: 'implicit' },
    { ...payment, allocationIntent: 'unknown' },
    { ...payment, source: 'provider' },
    { ...payment, userId: 'other' },
  ])('rejects invalid or implicit payment input %#', (body) => {
    expect(() =>
      service.allocateObligationPayment(obligationId, {
        principal,
        idempotencyKey: 'payment-invalid-key-001',
        requestId: 'bad',
        body,
      }),
    ).toThrow(HttpException);
  });

  it('rejects accepted matches without allocation and rejected matches with allocation', () => {
    expect(() =>
      service.decidePaymentMatch(matchId, {
        principal,
        idempotencyKey: 'payment-match-invalid-01',
        requestId: 'bad',
        body: { decision: 'accepted', expectedVersion: 1, allocation: null },
      }),
    ).toThrow(HttpException);
    expect(() =>
      service.decidePaymentMatch(matchId, {
        principal,
        idempotencyKey: 'payment-match-invalid-02',
        requestId: 'bad',
        body: { decision: 'rejected', expectedVersion: 1, allocation: payment },
      }),
    ).toThrow(HttpException);
  });
});
