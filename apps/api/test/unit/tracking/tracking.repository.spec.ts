import { TrackingRepository } from '../../../src/tracking/tracking.repository';
import type { NormalizedImport } from '../../../src/tracking/tracking.dto';

const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
const base: NormalizedImport = {
  schemaVersion: 1 as const,
  sourceType: 'manual' as const,
  events: [{ sourceItemKey: 'source-1', receivedAt: '2026-09-03T10:00:00.000Z', body: 'Paid 12' }],
};

describe('tracking import repository replay', () => {
  it('ignores delivery-only receivedAt drift and marks a stored response as replayed', async () => {
    const requestHashes: unknown[] = [];
    let claims = 0;
    const stored = {
      operationId: 'operation-1',
      replayed: false,
      resource: { id: '80000000-0000-4000-8000-000000000001' },
      requestId: 'request-1',
    };
    const client = {
      query: jest.fn((sql: string, values?: unknown[]) => {
        if (sql.includes('claim_sync_idempotency_key')) {
          requestHashes.push(values?.[3]);
          claims += 1;
          return Promise.resolve({
            rows: [
              claims === 1
                ? { outcome: 'new', lease_token: '80000000-0000-4000-8000-000000000002' }
                : { outcome: 'replay', lease_token: null, response_body: stored },
            ],
          });
        }
        if (sql.includes('create_import_session'))
          return Promise.resolve({ rows: [{ result: stored.resource }] });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repository = new TrackingRepository({
      withClient: (action: (value: typeof client) => Promise<unknown>) => action(client),
    } as never);
    const request = { sourceName: null, key: 'stable-import-key', requestId: 'request-1' };

    await repository.createImport(principal, base, request);
    const replay = await repository.createImport(
      principal,
      {
        ...base,
        events: [
          {
            sourceItemKey: 'source-1',
            receivedAt: '2026-09-03T10:01:00.000Z',
            body: 'Paid 12',
          },
        ],
      },
      request,
    );

    expect(requestHashes[1]).toBe(requestHashes[0]);
    expect(replay).toEqual({ ...stored, replayed: true });
  });
});
