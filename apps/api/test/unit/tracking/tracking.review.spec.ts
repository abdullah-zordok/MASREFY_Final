import { TrackingService } from '../../../src/tracking/tracking.service';

const reviewId = '80000000-0000-4000-8000-000000000001';
const itemId = '80000000-0000-4000-8000-000000000002';
const sessionId = '80000000-0000-4000-8000-000000000003';
const transactionId = '80000000-0000-4000-8000-000000000004';
const accountId = '80000000-0000-4000-8000-000000000005';
const sourceHash = 'a'.repeat(64);
const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };

describe('tracking review orchestration', () => {
  it('edit-accepts through LedgerService with stable import identity', async () => {
    const repository = {
      listOwner: jest.fn((_principal, resource: string) =>
        Promise.resolve(
          resource === 'reviews'
            ? [
                {
                  id: reviewId,
                  importItemId: itemId,
                  proposedValues: {
                    kind: 'expense',
                    amountMinor: 120,
                    currency: 'SAR',
                    accountId,
                    occurredAt: '2026-09-02T08:00:00.000Z',
                  },
                },
              ]
            : [{ id: itemId, sessionId }],
        ),
      ),
      getImportSourceIdentityHash: jest.fn(() => Promise.resolve(sourceHash)),
      claimReview: jest.fn(() => Promise.resolve({})),
      decideReview: jest.fn(() => Promise.resolve({ resource: { id: reviewId } })),
    };
    const ledger = {
      createTransaction: jest.fn<
        Promise<{
          operationId: string;
          transaction: { transaction: { id: string } };
        }>,
        [unknown]
      >(() =>
        Promise.resolve({
          operationId: '80000000-0000-4000-8000-000000000006',
          transaction: { transaction: { id: transactionId } },
        }),
      ),
    };
    const service = new TrackingService(repository as never, ledger as never, {} as never);

    await service.decideReview(reviewId, {
      principal,
      body: {
        decision: 'edit_accept',
        expectedVersion: 1,
        edit: { amountMinor: 200, currency: 'USD', merchant: 'Fictional', note: 'Corrected' },
      },
      idempotencyKey: 'review-key-1234',
      requestId: 'request-1',
    });

    const create = ledger.createTransaction.mock.calls[0]?.[0] as
      { body: Record<string, unknown>; idempotencyKey: string } | undefined;
    expect(create?.body).toMatchObject({
      source: 'tracking-import',
      externalRef: `tracking:${sourceHash}`,
      amountMinor: 200,
      currency: 'USD',
      merchant: 'Fictional',
      note: 'Corrected',
    });
    expect(create?.idempotencyKey).toBe(`tracking:${sourceHash}`);
    expect(repository.decideReview).toHaveBeenCalledWith(
      principal,
      reviewId,
      expect.objectContaining({ decision: 'edit_accept' }),
      expect.any(String),
      expect.any(String),
      transactionId,
      'review-key-1234',
      'request-1',
    );
  });

  it('records corrected-category feedback and rejects it for other feedback kinds', async () => {
    const categoryId = '80000000-0000-4000-8000-000000000007';
    const repository = { feedback: jest.fn(() => Promise.resolve({})) };
    const service = new TrackingService(repository as never, {} as never, {} as never);

    await service.feedback({
      principal,
      body: { historyId: reviewId, kind: 'wrong_category', correctedCategoryId: categoryId },
      idempotencyKey: 'feedback-key-1234',
      requestId: 'request-feedback',
    });

    expect(repository.feedback).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ correctedCategoryId: categoryId }),
      'feedback-key-1234',
      'request-feedback',
    );
    expect(() =>
      service.feedback({
        principal,
        body: { historyId: reviewId, kind: 'wrong_merchant', correctedCategoryId: categoryId },
        idempotencyKey: 'feedback-key-5678',
        requestId: 'request-invalid-feedback',
      }),
    ).toThrow();
  });

  it('rejects without invoking a ledger mutation', async () => {
    const repository = {
      claimReview: jest.fn(() => Promise.resolve({})),
      decideReview: jest.fn(() => Promise.resolve({})),
    };
    const ledger = { createTransaction: jest.fn() };
    const service = new TrackingService(repository as never, ledger as never, {} as never);
    await service.decideReview(reviewId, {
      principal,
      body: { decision: 'reject', expectedVersion: 1 },
      idempotencyKey: 'review-key-5678',
      requestId: 'request-2',
    });
    expect(ledger.createTransaction).not.toHaveBeenCalled();
  });

  it('reserves a decision before any ledger mutation and rejects forbidden edits', async () => {
    const repository = {
      claimReview: jest.fn(() => Promise.reject(new Error('REVIEW_VERSION_CONFLICT'))),
    };
    const ledger = { createTransaction: jest.fn() };
    const service = new TrackingService(repository as never, ledger as never, {} as never);
    await expect(
      service.decideReview(reviewId, {
        principal,
        body: { decision: 'accept', expectedVersion: 1 },
        idempotencyKey: 'review-key-9012',
        requestId: 'request-3',
      }),
    ).rejects.toThrow('REVIEW_VERSION_CONFLICT');
    expect(ledger.createTransaction).not.toHaveBeenCalled();
    await expect(
      service.decideReview(reviewId, {
        principal,
        body: { decision: 'edit_accept', expectedVersion: 1, edit: { userId: 'other' } },
        idempotencyKey: 'review-key-3456',
        requestId: 'request-4',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
