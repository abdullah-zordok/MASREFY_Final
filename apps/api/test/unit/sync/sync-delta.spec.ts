import { encodeSyncCursor } from '../../../src/sync/sync.codec';
import { SyncService } from '../../../src/sync/sync.service';

const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 30 };
const deviceId = '63000000-0000-4000-8000-000000000009';
const scope = { userId: principal.userId, deviceId };
const key = Buffer.alloc(32, 1).toString('base64url');

describe('SyncService delta and acknowledgement', () => {
  const config = {
    getRequired: jest.fn((name: string) =>
      name === 'MASARIFI_PUSH_TOKEN_HASH_KEY' ? key : 524_288,
    ),
  } as never;

  it('returns a bounded keyset page and monotonic acknowledgement', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      recordIssuedCursor: jest.fn(),
      delta: jest.fn().mockResolvedValue({
        oldest: 1n,
        current: 3n,
        changes: [1n, 2n, 3n].map((position) => ({
          position,
          resourceId: `resource-${String(position)}`,
          resourceType: 'account',
          operation: 'upsert',
          version: 1,
          snapshot: { id: `resource-${String(position)}` },
          deletedAt: null,
        })),
      }),
      acknowledge: jest.fn().mockResolvedValue({
        position: 3n,
        acknowledgedAt: '2026-08-31T00:00:00.000Z',
      }),
    };
    const service = new SyncService(repository as never, config);
    const start = encodeSyncCursor({ domain: 'accounts', position: 0n }, scope, key);
    const page = await service.delta(
      principal,
      deviceId,
      { domain: 'accounts', cursor: start, limit: 2 },
      'request',
    );
    expect(page.data).toMatchObject({ domain: 'accounts', hasMore: true });
    expect((page.data as { changes: unknown[] }).changes).toHaveLength(2);
    await expect(
      service.acknowledge(
        principal,
        deviceId,
        {
          domain: 'accounts',
          cursor: encodeSyncCursor({ domain: 'accounts', position: 3n }, scope, key),
        },
        'request',
      ),
    ).resolves.toMatchObject({ data: { domain: 'accounts' } });
  });

  it.each([
    [{ oldest: 5n, current: 6n, changes: [] }, 2n, 'SYNC_CURSOR_EXPIRED'],
    [{ oldest: 1n, current: 2n, changes: [] }, 3n, 'SYNC_CURSOR_AHEAD'],
  ])('rejects invalid cursor bounds', async (page, position, code) => {
    const service = new SyncService(
      {
        assertActiveDevice: jest.fn(),
        recordIssuedCursor: jest.fn(),
        delta: jest.fn().mockResolvedValue(page),
      } as never,
      config,
    );
    await expect(
      service.delta(
        principal,
        deviceId,
        {
          domain: 'accounts',
          cursor: encodeSyncCursor({ domain: 'accounts', position }, scope, key),
        },
        'request',
      ),
    ).rejects.toMatchObject({ response: { code } });
  });

  it('rejects a single change that cannot fit the response budget', async () => {
    const service = new SyncService(
      {
        assertActiveDevice: jest.fn(),
        recordIssuedCursor: jest.fn(),
        delta: jest.fn().mockResolvedValue({
          oldest: 1n,
          current: 1n,
          changes: [
            {
              position: 1n,
              resourceId: 'resource-one',
              resourceType: 'account',
              operation: 'upsert',
              version: 1,
              snapshot: { text: 'x'.repeat(1024) },
              deletedAt: null,
            },
          ],
        }),
      } as never,
      {
        getRequired: jest.fn((name: string) =>
          name === 'MASARIFI_PUSH_TOKEN_HASH_KEY' ? key : 128,
        ),
      } as never,
    );
    await expect(
      service.delta(
        principal,
        deviceId,
        {
          domain: 'accounts',
          cursor: encodeSyncCursor({ domain: 'accounts', position: 0n }, scope, key),
        },
        'request',
      ),
    ).rejects.toMatchObject({ response: { code: 'SYNC_PAYLOAD_TOO_LARGE' }, status: 413 });
  });
});
