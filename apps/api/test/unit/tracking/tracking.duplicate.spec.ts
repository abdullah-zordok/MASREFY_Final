import { TrackingService } from '../../../src/tracking/tracking.service';

const candidateId = '81000000-0000-4000-8000-000000000001';
const itemId = '81000000-0000-4000-8000-000000000002';
const sessionId = '81000000-0000-4000-8000-000000000003';
const existingId = '81000000-0000-4000-8000-000000000004';
const newId = '81000000-0000-4000-8000-000000000005';
const sourceHash = 'b'.repeat(64);
const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };

function setup() {
  const repository = {
    listOwner: jest.fn((_principal, resource: string) =>
      Promise.resolve(
        resource === 'duplicates'
          ? [{ id: candidateId, leftItemId: itemId, rightTransactionId: existingId }]
          : [
              {
                id: itemId,
                sessionId,
                normalizedPayload: {
                  kind: 'expense',
                  amountMinor: 100,
                  currency: 'SAR',
                  accountId: '81000000-0000-4000-8000-000000000006',
                  occurredAt: '2026-09-02T08:00:00.000Z',
                },
              },
            ],
      ),
    ),
    getImportSourceIdentityHash: jest.fn(() => Promise.resolve(sourceHash)),
    claimDuplicate: jest.fn(() => Promise.resolve({})),
    decideDuplicate: jest.fn(() => Promise.resolve({ resource: { id: candidateId } })),
  };
  const ledger = {
    createTransaction: jest.fn<
      Promise<{ transaction: { transaction: { id: string } } }>,
      [unknown]
    >(() => Promise.resolve({ transaction: { transaction: { id: newId } } })),
    getTransaction: jest.fn(() => Promise.resolve({ transaction: { version: 3 } })),
    reviseTransaction: jest.fn<Promise<Record<string, never>>, [unknown]>(() =>
      Promise.resolve({}),
    ),
  };
  return {
    repository,
    ledger,
    service: new TrackingService(repository as never, ledger as never, {} as never),
  };
}

describe('tracking duplicate decisions', () => {
  it('keeps the existing transaction without creating another posting', async () => {
    const { repository, ledger, service } = setup();
    await service.decideDuplicate(candidateId, {
      principal,
      body: { resolution: 'keep_existing', expectedVersion: 1 },
      idempotencyKey: 'duplicate-key-1',
      requestId: 'request-1',
    });
    expect(ledger.createTransaction).not.toHaveBeenCalled();
    expect(repository.decideDuplicate).toHaveBeenCalledWith(
      principal,
      candidateId,
      expect.objectContaining({ resolution: 'keep_existing' }),
      expect.any(String),
      null,
      existingId,
      'duplicate-key-1',
      'request-1',
    );
  });

  it('keeps both through a stable ledger create and merges only allowlisted details', async () => {
    const keep = setup();
    await keep.service.decideDuplicate(candidateId, {
      principal,
      body: { resolution: 'keep_both', expectedVersion: 1 },
      idempotencyKey: 'duplicate-key-2',
      requestId: 'request-2',
    });
    const create = keep.ledger.createTransaction.mock.calls[0]?.[0] as
      { body: Record<string, unknown>; idempotencyKey: string } | undefined;
    expect(create?.body).toMatchObject({
      source: 'tracking-import',
      externalRef: `tracking:${sourceHash}`,
    });
    expect(create?.idempotencyKey).toBe(`tracking:${sourceHash}`);

    const merge = setup();
    await merge.service.decideDuplicate(candidateId, {
      principal,
      body: {
        resolution: 'merge_details',
        expectedVersion: 1,
        merge: { merchant: 'Fictional' },
      },
      idempotencyKey: 'duplicate-key-3',
      requestId: 'request-3',
    });
    const revision = merge.ledger.reviseTransaction.mock.calls[0]?.[0] as
      { transactionId: string; body: Record<string, unknown> } | undefined;
    expect(revision).toMatchObject({
      transactionId: existingId,
      body: { merchant: 'Fictional', expectedVersion: 3 },
    });
    await expect(
      merge.service.decideDuplicate(candidateId, {
        principal,
        body: { resolution: 'merge_details', expectedVersion: 1, merge: { amountMinor: 1 } },
        idempotencyKey: 'duplicate-key-4',
        requestId: 'request-4',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not touch the ledger when another duplicate decision owns the lease', async () => {
    const repository = {
      claimDuplicate: jest.fn(() => Promise.reject(new Error('DUPLICATE_VERSION_CONFLICT'))),
    };
    const ledger = {
      createTransaction: jest.fn(),
      reviseTransaction: jest.fn(),
    };
    const service = new TrackingService(repository as never, ledger as never, {} as never);
    await expect(
      service.decideDuplicate(candidateId, {
        principal,
        body: { resolution: 'keep_both', expectedVersion: 1 },
        idempotencyKey: 'duplicate-key-5',
        requestId: 'request-5',
      }),
    ).rejects.toThrow('DUPLICATE_VERSION_CONFLICT');
    expect(ledger.createTransaction).not.toHaveBeenCalled();
    expect(ledger.reviseTransaction).not.toHaveBeenCalled();
  });
});
