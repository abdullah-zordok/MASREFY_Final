import { PassThrough, Readable } from 'node:stream';

import { writeExportPackage } from '../../../src/security/export-package';

async function* bytes(value: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(value);
}

async function* failingBytes(): AsyncIterable<Uint8Array> {
  await Promise.reject(new Error('source failed'));
  yield Buffer.alloc(0);
}

describe('writeExportPackage', () => {
  it('streams approved entries and produces checksums without full-package buffering', async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    const result = await writeExportPackage(
      [
        {
          path: 'identity/profile.json',
          mediaType: 'application/json',
          stream: bytes('{"id":"opaque"}'),
        },
      ],
      output,
      { maxBytes: 1024 * 1024, maxEntries: 5 },
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ path: 'identity/profile.json', bytes: 15 });
    expect(result.bytes).toBeGreaterThan(0);
    expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe('PK');
  });

  it.each(['../secret.json', '/absolute.json', 'a\\b.json', 'script.exe', 'a//b.json'])(
    'rejects unsafe path %s',
    async (path) => {
      await expect(
        writeExportPackage(
          [{ path, mediaType: 'application/json', stream: bytes('{}') }],
          new PassThrough(),
          { maxBytes: 1000, maxEntries: 5 },
        ),
      ).rejects.toThrow('EXPORT_ENTRY_INVALID');
    },
  );

  it('rejects duplicate paths and bounded count/bytes', async () => {
    const entry = { path: 'a.json', mediaType: 'application/json' as const, stream: bytes('{}') };
    await expect(
      writeExportPackage([entry, entry], new PassThrough(), { maxBytes: 1000, maxEntries: 5 }),
    ).rejects.toThrow('EXPORT_ENTRY_DUPLICATE');
    await expect(
      writeExportPackage([entry], new PassThrough(), { maxBytes: 1, maxEntries: 5 }),
    ).rejects.toThrow('EXPORT_SIZE_EXCEEDED');
    await expect(
      writeExportPackage([entry], new PassThrough(), { maxBytes: 1000, maxEntries: 0 }),
    ).rejects.toThrow('EXPORT_LIMIT_INVALID');
  });

  it('destroys the destination when an input stream fails', async () => {
    const output = new PassThrough();
    const failing = Readable.from(failingBytes());
    await expect(
      writeExportPackage(
        [{ path: 'a.json', mediaType: 'application/json', stream: failing }],
        output,
        { maxBytes: 1000, maxEntries: 5 },
      ),
    ).rejects.toThrow();
    expect(output.destroyed).toBe(true);
  });
});
