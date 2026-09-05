import { ReferenceService } from '../../../src/reference/reference.service';

describe('category service', () => {
  const principal = { userId: 'user_1', sessionId: 'session_1', factorAgeSeconds: 0 };
  const repository = { sharedHash: jest.fn(), execute: jest.fn() };
  const service = new ReferenceService(repository as never, { createAccount: jest.fn() } as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid cursors, array coercion, and missing idempotency', async () => {
    await expect(
      service.execute({
        operation: 'listCategories',
        principal,
        requestId: 'r1',
        query: { cursor: '*' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute({
        operation: 'listCategories',
        principal,
        requestId: 'r1',
        query: { limit: ['25'] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute({
        operation: 'createCategory',
        principal,
        requestId: 'r2',
        body: { labelAr: 'طعام', labelEn: 'Food' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it.each(['CATEGORY_INVALID', 'CATEGORY_CYCLE', 'VERSION_CONFLICT'])(
    'maps %s to a stable conflict',
    async (code) => {
      repository.execute.mockRejectedValueOnce(new Error(code));
      await expect(
        service.execute({
          operation: 'restoreCategory',
          principal,
          requestId: 'r4',
          idempotencyKey: 'valid-key',
          params: { categoryId: '10000000-0000-4000-8000-000000000001' },
          body: { expectedVersion: 1 },
        }),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it('reads an owner-scoped usage preview without idempotency', async () => {
    repository.execute.mockResolvedValueOnce({ linkedTransactionCount: 3, version: 7 });

    await expect(
      service.execute({
        operation: 'getCategoryUsage',
        principal,
        requestId: 'r5',
        params: { categoryId: '10000000-0000-4000-8000-000000000001' },
      }),
    ).resolves.toEqual({ linkedTransactionCount: 3, version: 7 });

    expect(repository.execute).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'getCategoryUsage' }),
    );
  });

  it('requires a server-previewed count for archive and merge', async () => {
    repository.execute.mockResolvedValue(null);

    await service.execute({
      operation: 'archiveCategory',
      principal,
      requestId: 'r6',
      idempotencyKey: 'archive-key',
      params: { categoryId: '10000000-0000-4000-8000-000000000001' },
      query: { expectedVersion: '4', expectedLinkedTransactionCount: '0' },
    });
    await service.execute({
      operation: 'mergeCategory',
      principal,
      requestId: 'r7',
      idempotencyKey: 'merge-key',
      params: { categoryId: '10000000-0000-4000-8000-000000000001' },
      body: {
        expectedVersion: 4,
        expectedLinkedTransactionCount: 12,
        targetId: '20000000-0000-4000-8000-000000000002',
      },
    });

    expect(repository.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: { expectedVersion: 4, expectedLinkedTransactionCount: 0 },
      }),
    );
    expect(repository.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          expectedVersion: 4,
          expectedLinkedTransactionCount: 12,
          targetId: '20000000-0000-4000-8000-000000000002',
        },
      }),
    );
  });

  it('rejects a lifecycle action without a valid preview count', async () => {
    await expect(
      service.execute({
        operation: 'archiveCategory',
        principal,
        requestId: 'r8',
        idempotencyKey: 'archive-key',
        params: { categoryId: '10000000-0000-4000-8000-000000000001' },
        query: { expectedVersion: '4' },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('maps a changed authoritative count to a stable conflict', async () => {
    repository.execute.mockRejectedValueOnce(new Error('CATEGORY_USAGE_CHANGED'));
    await expect(
      service.execute({
        operation: 'mergeCategory',
        principal,
        requestId: 'r9',
        idempotencyKey: 'merge-key',
        params: { categoryId: '10000000-0000-4000-8000-000000000001' },
        body: {
          expectedVersion: 4,
          expectedLinkedTransactionCount: 1,
          targetId: '20000000-0000-4000-8000-000000000002',
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
