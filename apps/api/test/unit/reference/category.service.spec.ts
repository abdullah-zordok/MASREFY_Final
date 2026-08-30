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
});
