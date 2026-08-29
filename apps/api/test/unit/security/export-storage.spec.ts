import { Readable } from 'node:stream';

import { ExportStorage } from '../../../src/security/export-storage';

describe('ExportStorage', () => {
  const config = { getRequired: jest.fn((key: string) => key === 'SUPABASE_URL' ? 'http://storage.local' : 'service-secret') };
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => fetcher.mockReset());

  it('uploads privately, validates metadata, signs briefly, and deletes', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '3', etag: '"etag"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedURL: '/storage/v1/object/sign/report-exports/exports/id/file.zip?token=opaque' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const storage = new ExportStorage(config as never, fetcher);
    await storage.upload('exports/id/file.zip', Readable.from('zip'), 3);
    await expect(storage.head('exports/id/file.zip', 3)).resolves.toEqual({ bytes: 3, etag: 'etag' });
    await expect(storage.sign('exports/id/file.zip', 120)).resolves.toContain('/storage/v1/object/sign/');
    await expect(storage.delete('exports/id/file.zip')).resolves.toBeUndefined();
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer service-secret')).toBe(true);
  });

  it.each(['../file.zip', '/file.zip', 'exports/id/file.exe', 'exports//file.zip'])('rejects unsafe keys %s', async (key) => {
    const storage = new ExportStorage(config as never, fetcher);
    await expect(storage.delete(key)).rejects.toThrow('EXPORT_STORAGE_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps malformed and failed responses without exposing body, key, or credential', async () => {
    fetcher.mockResolvedValueOnce(new Response('service-secret exports/id/file.zip', { status: 500 }));
    const storage = new ExportStorage(config as never, fetcher);
    const error = await storage.delete('exports/id/file.zip').then(
      () => new Error('unexpected success'),
      (value: unknown) => value instanceof Error ? value : new Error('unexpected value'),
    );
    expect(error.message).toBe('EXPORT_STORAGE_UNAVAILABLE');
    expect(error.message).not.toContain('service-secret');
  });

  it('rejects unsafe signed URLs and metadata mismatch', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '4' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedURL: 'https://evil.example/file' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedURL: '/storage/v1/object/sign/report-exports/exports/other/file.zip?token=opaque' }), { status: 200 }));
    const storage = new ExportStorage(config as never, fetcher);
    await expect(storage.head('exports/id/file.zip', 3)).rejects.toThrow('EXPORT_STORAGE_INTEGRITY_FAILED');
    await expect(storage.sign('exports/id/file.zip', 120)).rejects.toThrow('EXPORT_STORAGE_UNAVAILABLE');
    await expect(storage.sign('exports/id/file.zip', 120)).rejects.toThrow('EXPORT_STORAGE_UNAVAILABLE');
  });
});
