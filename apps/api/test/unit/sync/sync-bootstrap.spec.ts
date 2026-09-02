import {
  decodeBootstrapCursor,
  decodeSyncCursor,
  encodeBootstrapCursor,
} from '../../../src/sync/sync.codec';
import { SyncService } from '../../../src/sync/sync.service';

const principal = { userId: 'owner-one', sessionId: 'session', factorAgeSeconds: 30 };
const deviceId = '63000000-0000-4000-8000-000000000002';
const scope = { userId: principal.userId, deviceId };
const key = Buffer.alloc(32, 1).toString('base64url');
const config = {
  getRequired: jest.fn((name: string) => (name === 'MASARIFI_PUSH_TOKEN_HASH_KEY' ? key : 524_288)),
} as never;

describe('SyncService bootstrap', () => {
  it('returns a bounded continuation page without issuing its delta cursor early', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      bootstrap: jest.fn().mockResolvedValue([
        {
          domain: 'accounts',
          position: 3n,
          items: [{ id: '63000000-0000-4000-8000-000000000003', snapshot: { id: 'account-one' } }],
          hasMore: true,
        },
      ]),
      recordIssuedCursor: jest.fn(),
    };
    const service = new SyncService(repository as never, config);
    const response = await service.bootstrap(
      principal,
      deviceId,
      { domains: 'accounts', limit: 1 },
      'request-one',
    );
    const domain = (response.data as { domains: Array<Record<string, unknown>> }).domains[0] as {
      cursor: string;
      nextPage: string;
    };
    expect(decodeSyncCursor(domain.cursor, 'accounts', scope, key).position).toBe(3n);
    expect(decodeBootstrapCursor(domain.nextPage, 'accounts', scope, key)).toMatchObject({
      position: 3n,
      after: '63000000-0000-4000-8000-000000000003',
    });
    expect(repository.recordIssuedCursor).not.toHaveBeenCalled();
  });

  it('uses the signed continuation boundary and issues only a completed valid page cursor', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      bootstrap: jest.fn().mockResolvedValue([
        {
          domain: 'accounts',
          position: 3n,
          items: [{ id: '63000000-0000-4000-8000-000000000004', snapshot: { id: 'account-two' } }],
          hasMore: false,
        },
      ]),
      recordIssuedCursor: jest.fn(),
    };
    const service = new SyncService(repository as never, config);
    const continuation = {
      domain: 'accounts' as const,
      position: 3n,
      after: '63000000-0000-4000-8000-000000000003',
    };
    await service.bootstrap(
      principal,
      deviceId,
      {
        domains: 'accounts',
        after: encodeBootstrapCursor(continuation, scope, key),
        limit: 1,
      },
      'request-two',
    );
    expect(repository.bootstrap).toHaveBeenCalledWith(
      principal,
      ['accounts'],
      continuation.after,
      1,
      3n,
    );
    expect(repository.recordIssuedCursor).toHaveBeenCalledWith(principal, deviceId, 'accounts', 3n);
  });

  it('does not issue a cursor when the response exceeds the configured ceiling', async () => {
    const repository = {
      assertActiveDevice: jest.fn(),
      bootstrap: jest.fn().mockResolvedValue([
        {
          domain: 'accounts',
          position: 0n,
          items: [
            { id: '63000000-0000-4000-8000-000000000003', snapshot: { text: 'x'.repeat(1024) } },
          ],
          hasMore: false,
        },
      ]),
      recordIssuedCursor: jest.fn(),
    };
    const service = new SyncService(
      repository as never,
      {
        getRequired: jest.fn((name: string) =>
          name === 'MASARIFI_PUSH_TOKEN_HASH_KEY' ? key : 128,
        ),
      } as never,
    );
    await expect(
      service.bootstrap(principal, deviceId, { domains: 'accounts' }, 'request'),
    ).rejects.toMatchObject({ status: 413 });
    expect(repository.recordIssuedCursor).not.toHaveBeenCalled();
  });
});
