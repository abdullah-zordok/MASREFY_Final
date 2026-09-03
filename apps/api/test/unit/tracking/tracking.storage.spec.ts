import { TrackingStorage } from '../../../src/tracking/tracking.storage';

describe('tracking private storage', () => {
  it('uses a private generated key, no upsert, and server-only authorization', async () => {
    const calls: RequestInit[] = [];
    const fetcher = ((_input: RequestInfo | URL, request?: RequestInit) => {
      if (request) calls.push(request);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
    const storage = new TrackingStorage(
      {
        getRequired: (key: string) =>
          key === 'SUPABASE_URL' ? 'http://storage.local' : 'service-secret',
      } as never,
      fetcher,
    );
    const key =
      'tracking/80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000002';
    await expect(storage.upload(key, Buffer.from('a,b\n1,2'), 'text/csv')).resolves.toBe(true);
    const headers = new Headers(calls[0]?.headers);
    expect(headers.get('authorization')).toBe('Bearer service-secret');
    expect(headers.get('x-upsert')).toBe('false');
    await expect(storage.delete('../escape')).rejects.toThrow('TRACKING_STORAGE_INVALID');
  });

  it('reports an existing content-addressed object without claiming ownership', async () => {
    const storage = new TrackingStorage(
      {
        getRequired: (key: string) =>
          key === 'SUPABASE_URL' ? 'http://storage.local' : 'service-secret',
      } as never,
      () => Promise.resolve(new Response(null, { status: 409 })),
    );
    const key =
      'tracking/80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000002';

    await expect(storage.upload(key, Buffer.from('{}'), 'application/json')).resolves.toBe(false);
  });

  it('treats a missing object as an idempotent delete but propagates storage outages', async () => {
    const responses = [new Response(null, { status: 404 }), new Response(null, { status: 503 })];
    const storage = new TrackingStorage(
      {
        getRequired: (key: string) =>
          key === 'SUPABASE_URL' ? 'http://storage.local' : 'service-secret',
      } as never,
      (() => Promise.resolve(responses.shift())) as typeof fetch,
    );
    const key =
      'tracking/80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000002';
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.delete(key)).rejects.toThrow('TRACKING_STORAGE_UNAVAILABLE');
  });
});
