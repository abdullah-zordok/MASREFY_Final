import { HttpException } from '@nestjs/common';
import { AiService } from '../../../src/ai/ai.service';

const owner = { userId: 'assistant-action-owner', sessionId: 'session', factorAgeSeconds: 0 };
const previewId = '99000000-0000-4000-8000-000000000001';
const resourceId = '99000000-0000-4000-8000-000000000002';
const referencedId = '99000000-0000-4000-8000-000000000003';

describe('assistant action command bridge', () => {
  const repository = {
    operationId: jest.fn(() => '99000000-0000-4000-8000-000000000004'),
    claimAction: jest.fn(),
    completeAction: jest.fn(),
  };
  const ledger = { createTransaction: jest.fn(), reviseTransaction: jest.fn() };
  const planning = {
    updateBudget: jest.fn(),
    createSavingsGoal: jest.fn(),
    allocateObligationPayment: jest.fn(),
  };
  const tracking = { decideReview: jest.fn() };
  const service = new AiService(
    repository as never,
    {} as never,
    ledger as never,
    planning as never,
    tracking as never,
    {} as never,
  );

  beforeEach(() => {
    repository.completeAction.mockResolvedValue({});
    ledger.createTransaction.mockResolvedValue({
      transaction: { transaction: { id: resourceId } },
    });
    ledger.reviseTransaction.mockResolvedValue({ transaction: { id: resourceId } });
    planning.updateBudget.mockResolvedValue({ budget: { id: resourceId } });
    planning.createSavingsGoal.mockResolvedValue({ goal: { id: resourceId } });
    planning.allocateObligationPayment.mockResolvedValue({ payment: { id: resourceId } });
    tracking.decideReview.mockResolvedValue({ resourceId });
  });

  it.each([
    [
      'transaction.create',
      {
        amountMinor: '1250',
        currency: 'SAR',
        accountId: referencedId,
        categoryId: null,
        date: '2026-09-03',
        merchant: 'Shop',
        note: null,
      },
      ledger.createTransaction,
    ],
    [
      'transaction.update',
      { transactionId: referencedId, note: 'Reviewed' },
      ledger.reviseTransaction,
    ],
    ['budget.update', { budgetId: referencedId, name: 'Current' }, planning.updateBudget],
    [
      'savings_goal.create',
      { name: 'Emergency', targetMinor: '10000', currencyCode: 'SAR' },
      planning.createSavingsGoal,
    ],
    [
      'obligation.payment.record',
      { obligationId: referencedId, amountMinor: '500' },
      planning.allocateObligationPayment,
    ],
    [
      'tracking.review.resolve',
      { reviewId: referencedId, decision: 'accept' },
      tracking.decideReview,
    ],
  ] as const)('maps %s to one existing domain command', async (actionType, payload, command) => {
    repository.claimAction.mockResolvedValueOnce({
      actionType,
      payload,
      decisionToken: '99000000-0000-4000-8000-000000000005',
      replayed: false,
    });
    await expect(
      service.confirmPreview(owner, previewId, { expectedVersion: 1 }, 'assistant-action-key-0001'),
    ).resolves.toMatchObject({ actionType, resourceId, status: 'executed' });
    expect(command).toHaveBeenCalledTimes(1);
    expect(repository.completeAction).toHaveBeenCalledWith(
      owner,
      previewId,
      expect.any(String),
      resourceId,
    );
  });

  it('rejects an unknown action without completing or invoking a domain command', async () => {
    repository.claimAction.mockResolvedValueOnce({
      actionType: 'system.execute',
      payload: {},
      decisionToken: '99000000-0000-4000-8000-000000000005',
      replayed: false,
    });
    await expect(
      service.confirmPreview(owner, previewId, { expectedVersion: 1 }, 'assistant-action-key-0002'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(repository.completeAction).not.toHaveBeenCalled();
  });
});
