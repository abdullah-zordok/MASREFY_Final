import { SyncService } from '../../../src/sync/sync.service';

const principal = { userId: 'owner-one', sessionId: 'session-one' } as never;
const deviceId = '63000000-0000-4000-8000-000000000009';
const mutation = {
  operationId: '63000000-0000-4000-8000-000000000001',
  domain: 'transactions',
  resourceType: 'transaction',
  schemaVersion: 1,
  dependsOn: [],
  operation: 'update',
  resourceId: 'transaction-one',
  baseVersion: 2,
  payload: { memo: 'coffee', amountMinor: 1200 },
} as const;

describe('SyncService mutation idempotency', () => {
  const config = { getRequired: jest.fn(() => 60) } as never;

  it('stores ordered receipts and replays the byte-equivalent completed batch', async () => {
    const response = {
      data: { receipts: [{ operationId: mutation.operationId, status: 'received' }] },
      meta: { requestId: 'request-one' },
    };
    const repository = {
      assertActiveDevice: jest.fn(),
      claimBatch: jest
        .fn()
        .mockResolvedValueOnce({ outcome: 'new', leaseToken: 'lease-one' })
        .mockResolvedValueOnce({ outcome: 'replay', responseBody: response }),
      receiveMutation: jest.fn().mockResolvedValue({
        outcome: 'received',
        mutationId: mutation.operationId,
        status: 'received',
        result: null,
        error: null,
      }),
      completeBatch: jest.fn(),
    };
    const service = new SyncService(repository as never, config);

    await expect(
      service.submitMutations(
        principal,
        deviceId,
        'batch-key',
        { mutations: [mutation] },
        'request-one',
      ),
    ).resolves.toEqual(response);
    await expect(
      service.submitMutations(
        principal,
        deviceId,
        'batch-key',
        { mutations: [mutation] },
        'request-two',
      ),
    ).resolves.toEqual(response);
    expect(repository.receiveMutation).toHaveBeenCalledTimes(1);
    expect(repository.completeBatch).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ leaseToken: 'lease-one' }),
      200,
      response,
    );
  });

  it.each([
    ['hash_mismatch', 'IDEMPOTENCY_KEY_REUSED', 409],
    ['in_progress', 'IDEMPOTENCY_IN_PROGRESS', 409],
  ])('rejects %s without receiving operations', async (outcome, code, status) => {
    const repository = {
      assertActiveDevice: jest.fn(),
      claimBatch: jest.fn().mockResolvedValue({ outcome, retryAfterSeconds: 1 }),
      receiveMutation: jest.fn(),
    };
    const service = new SyncService(repository as never, config);

    const promise = service.submitMutations(
      principal,
      deviceId,
      'batch-key',
      { mutations: [mutation] },
      'request-one',
    );
    await expect(promise).rejects.toMatchObject({ status });
    await expect(promise).rejects.toMatchObject({ response: { code } });
    expect(repository.receiveMutation).not.toHaveBeenCalled();
  });

  it('canonicalizes object key order for batch and operation hashes', async () => {
    let batchHash: unknown;
    let operationHash: unknown;
    const repository = {
      assertActiveDevice: jest.fn(),
      claimBatch: jest.fn((_principal: unknown, _key: unknown, hash: unknown) => {
        batchHash = hash;
        return Promise.resolve({ outcome: 'new', leaseToken: 'lease-one' });
      }),
      receiveMutation: jest.fn(
        (_principal: unknown, _device: unknown, _mutation: unknown, hash: unknown) => {
          operationHash = hash;
          return Promise.resolve({
            outcome: 'received',
            mutationId: mutation.operationId,
            status: 'received',
            result: null,
            error: null,
          });
        },
      ),
      completeBatch: jest.fn(),
    };
    const service = new SyncService(repository as never, config);
    await service.submitMutations(
      principal,
      deviceId,
      'batch-key',
      { mutations: [{ ...mutation, payload: { amountMinor: 1200, memo: 'coffee' } }] },
      'request-one',
    );
    const first = batchHash;
    const firstOperationHash = operationHash;

    repository.claimBatch.mockClear();
    repository.receiveMutation.mockClear();
    await service.submitMutations(
      principal,
      deviceId,
      'batch-key-2',
      { mutations: [mutation] },
      'request-two',
    );
    expect(batchHash).toBe(first);
    expect(operationHash).toBe(firstOperationHash);
  });

  it('returns an operation-id mismatch as one rejected receipt', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      claimBatch: jest.fn().mockResolvedValue({ outcome: 'new', leaseToken: 'lease-one' }),
      receiveMutation: jest.fn().mockResolvedValue({
        outcome: 'hash_mismatch',
        mutationId: mutation.operationId,
        status: 'received',
        result: null,
        error: null,
      }),
      completeBatch: jest.fn(),
    };
    const service = new SyncService(repository as never, config);
    await expect(
      service.submitMutations(
        principal,
        deviceId,
        'batch-key',
        { mutations: [mutation] },
        'request',
      ),
    ).resolves.toMatchObject({
      data: {
        receipts: [
          {
            operationId: mutation.operationId,
            status: 'rejected',
            error: { code: 'SYNC_OPERATION_ID_REUSED' },
          },
        ],
      },
    });
    expect(repository.completeBatch).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ leaseToken: 'lease-one' }),
      200,
      expect.objectContaining({
        data: {
          receipts: [
            {
              operationId: mutation.operationId,
              status: 'rejected',
              error: { code: 'SYNC_OPERATION_ID_REUSED' },
            },
          ],
        },
      }),
    );
    expect(repository.receiveMutation).toHaveBeenCalledTimes(1);
  });
});
