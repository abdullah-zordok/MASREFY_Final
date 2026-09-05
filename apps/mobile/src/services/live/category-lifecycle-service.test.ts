import { createLiveCategoryLifecycleService } from './category-lifecycle-service';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'operation-key' }));

const response = (value: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(value), { status });

it('uses the owner-authenticated preview for archive and merge preconditions', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ linkedTransactionCount: 3, version: 7 }))
    .mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(response({}));
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const preview = await service.getCategoryUsage('source');
  await service.setCategoryStatus('source', 'archived', preview);
  await service.mergeCategory('source', 'target', preview);

  expect(request.mock.calls[0]?.[0]).toBe(
    'https://api.test/api/v1/categories/source/usage'
  );
  expect(request.mock.calls[1]?.[0]).toContain(
    'expectedLinkedTransactionCount=3'
  );
  expect(request.mock.calls[2]?.[1]).toMatchObject({
    headers: expect.objectContaining({
      Authorization: 'Bearer owner-token',
      'Idempotency-Key': 'operation-key'
    }),
    body: JSON.stringify({
      targetId: 'target',
      expectedVersion: 7,
      expectedLinkedTransactionCount: 3
    })
  });
});
