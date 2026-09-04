import { Readable } from 'node:stream';

import { ReportsStorage } from '../../../src/reports/reports.storage';

describe('ReportsStorage security', () => {
  const config = {
    getRequired: jest.fn((key: string) =>
      key === 'SUPABASE_URL'
        ? 'http://storage.local'
        : key === 'NODE_ENV'
          ? 'test'
          : 'service-secret',
    ),
  };
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const attemptId = '99000000-0000-4000-8000-000000000001';

  beforeEach(() => fetcher.mockReset());

  it('uses an owner-hashed fixed key, exact content type, no upsert, and verifies bytes', async () => {
    fetcher
      .mockImplementationOnce(async (_url, init) => {
        for await (const _chunk of init?.body as unknown as NodeJS.ReadableStream) void _chunk;
        return new Response(null, { status: 200 });
      })
      .mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { 'content-length': '3' } }),
      );
    const storage = new ReportsStorage(config as never, fetcher);
    const stored = await storage.upload(
      attemptId,
      'owner-private',
      'json',
      'application/json',
      Readable.from('abc'),
      100,
    );
    expect(stored.key).not.toContain('owner-private');
    expect(stored).toMatchObject({ bytes: 3 });
    await expect(storage.verify(stored.key, 3)).resolves.toBeUndefined();
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-upsert')).toBe('false');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('accepts only short owner-scoped signed URLs and treats missing deletion as success', async () => {
    const storage = new ReportsStorage(config as never, fetcher);
    const key = storage.key(attemptId, 'owner-private', 'pdf');
    fetcher
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedURL: `/storage/v1/object/sign/report-exports/${key}?token=opaque`,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(storage.sign(key, 120)).resolves.toContain('token=opaque');
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.sign(key, 59)).rejects.toThrow('REPORT_STORAGE_INVALID');
    await expect(storage.sign(key, 901)).rejects.toThrow('REPORT_STORAGE_INVALID');
  });

  it.each([
    '../file.pdf',
    'reports/hash/file.pdf',
    'reports/' + 'a'.repeat(64) + '/../../file.pdf',
  ])('rejects traversal or malformed keys %s', async (key) => {
    const storage = new ReportsStorage(config as never, fetcher);
    await expect(storage.delete(key)).rejects.toThrow('REPORT_STORAGE_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects foreign origins and redacts storage responses and credentials', async () => {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ signedURL: 'https://evil.example/file' }), { status: 200 }),
    );
    const storage = new ReportsStorage(config as never, fetcher);
    const key = storage.key(attemptId, 'owner-private', 'csv');
    const error = await storage.sign(key, 120).then(
      () => new Error('unexpected'),
      (value: unknown) => value as Error,
    );
    expect(error.message).toBe('REPORT_STORAGE_UNAVAILABLE');
    expect(error.message).not.toContain('service-secret');
    expect(error.message).not.toContain(key);
  });
});
