import { SyncService } from '../../../src/sync/sync.service';

const principal = { userId: 'owner', sessionId: 'session' } as never;
const deviceId = '63000000-0000-4000-8000-000000000009';
const conflict = {
  id: '73000000-0000-4000-8000-000000000001',
  transactionId: '73000000-0000-4000-8000-000000000002',
  clientMutationId: '73000000-0000-4000-8000-000000000003',
  serverVersion: 3,
  clientVersion: 2,
  conflictFields: ['title'],
  serverSnapshot: { title: 'Server' },
  clientSnapshot: { title: 'Client' },
  status: 'open',
  resolution: null,
  resolutionPayload: null,
  createdAt: '2026-08-31T00:00:00.000Z',
  resolvedAt: null,
} as const;

describe('SyncService conflicts', () => {
  it('lists and inspects only repository owner records', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      listConflicts: jest.fn().mockResolvedValue([conflict]),
      getConflict: jest.fn().mockResolvedValue(conflict),
    };
    const service = new SyncService(repository as never, {} as never);
    await expect(
      service.listConflicts(principal, deviceId, { status: 'open' }, 'request'),
    ).resolves.toMatchObject({
      data: { items: [conflict], nextCursor: null },
    });
    await expect(
      service.getConflict(principal, deviceId, conflict.id, 'request'),
    ).resolves.toMatchObject({
      data: conflict,
    });
  });

  it.each(['client', 'merged'] as const)(
    'delegates %s through the existing ledger command before locking the decision',
    async (resolution) => {
      const resolved = { ...conflict, status: 'resolved', resolution };
      const repository = {
        assertActiveDevice: jest.fn(),
        resolveConflict: jest.fn().mockResolvedValue(resolved),
      };
      const service = new SyncService(repository as never, {} as never);
      await service.resolveConflict(
        principal,
        deviceId,
        conflict.id,
        'resolve-key',
        { resolution, payload: { title: 'Chosen' } },
        'request',
      );
      expect(repository.resolveConflict).toHaveBeenCalledWith(
        principal,
        conflict.id,
        resolution,
        { title: 'Chosen' },
        'request',
        expect.stringMatching(/^sha256:/),
        expect.stringMatching(/^sha256:/),
      );
    },
  );

  it('never offers financial keep-both or cross-owner absence as a visible record', async () => {
    const service = new SyncService(
      { assertActiveDevice: jest.fn(), getConflict: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    await expect(
      service.resolveConflict(
        principal,
        deviceId,
        conflict.id,
        'resolve-key',
        { resolution: 'keep_both' },
        'request',
      ),
    ).rejects.toThrow('VALIDATION_FAILED');
    await expect(
      service.getConflict(principal, deviceId, conflict.id, 'request'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
