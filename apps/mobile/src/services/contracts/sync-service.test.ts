import { SyncHttpService } from './sync-service';

describe('SyncHttpService', () => {
  it('maps every authenticated sync route and stable headers', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const request = jest.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: {}, meta: { requestId: 'r' } })
        };
      }
    );
    const service = new SyncHttpService(
      'https://api.example.test/',
      async () => 'token',
      async () => 'device',
      request as never
    );
    await service.bootstrap(['accounts'], 'next-page', 25);
    await service.delta('accounts', 'cursor');
    await service.mutations(
      [
        {
          operationId: 'operation',
          domain: 'accounts',
          resourceType: 'account',
          schemaVersion: 1,
          dependsOn: [],
          operation: 'create',
          payload: { name: 'Cash' }
        }
      ],
      'batch-key'
    );
    await service.acknowledge('accounts', 'cursor');
    await service.conflicts();
    await service.conflict('conflict-one');
    await service.resolveConflict('conflict-one', 'server', 'resolve-key');
    expect(calls.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/v1/sync/bootstrap'),
        expect.stringContaining('/api/v1/sync/delta'),
        expect.stringContaining('/api/v1/sync/mutations'),
        expect.stringContaining('/api/v1/sync/ack'),
        expect.stringContaining('/api/v1/conflicts')
      ])
    );
    expect(calls[0]?.url).toBe(
      'https://api.example.test/api/v1/sync/bootstrap?domains=accounts&after=next-page&limit=25'
    );
    expect(calls[6]).toMatchObject({
      url: 'https://api.example.test/api/v1/conflicts/conflict-one',
      init: { method: 'PATCH' }
    });
    expect(
      calls.every(
        ({ init }) =>
          (init.headers as Record<string, string>)['X-Device-Id'] === 'device'
      )
    ).toBe(true);
    expect(
      calls.some(
        ({ init }) =>
          (init.headers as Record<string, string>)['Idempotency-Key'] ===
          'batch-key'
      )
    ).toBe(true);
  });

  it('maps stable server errors and enforces the 512 KiB request budget', async () => {
    const service = new SyncHttpService(
      'https://api.example.test',
      async () => 'token',
      async () => 'device',
      jest.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'SYNC_CURSOR_EXPIRED' } })
      })) as never
    );
    await expect(service.delta('accounts', 'cursor')).rejects.toMatchObject({
      code: 'SYNC_CURSOR_EXPIRED',
      status: 409
    });
    await expect(
      service.mutations(
        [
          {
            operationId: 'operation',
            domain: 'accounts',
            resourceType: 'account',
            schemaVersion: 1,
            dependsOn: [],
            operation: 'create',
            payload: { text: 'x'.repeat(524_288) }
          }
        ],
        'batch-key'
      )
    ).rejects.toMatchObject({ code: 'SYNC_PAYLOAD_TOO_LARGE', status: 413 });
  });
});
