import { createHash } from 'node:crypto';
import { Readable, Transform, type Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';

import archiver from 'archiver';

import type { ExportEntry } from './privacy-handlers';

export interface ExportPackageLimits {
  maxBytes: number;
  maxEntries: number;
}
export interface ExportPackageEntry {
  path: string;
  mediaType: ExportEntry['mediaType'];
  bytes: number;
  sha256: string;
}
export interface ExportPackageResult {
  bytes: number;
  entries: readonly ExportPackageEntry[];
}

const safePath =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:json|ndjson)$/;

export async function writeExportPackage(
  entries: Iterable<ExportEntry>,
  destination: Writable,
  limits: ExportPackageLimits,
): Promise<ExportPackageResult> {
  if (
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 1 ||
    !Number.isSafeInteger(limits.maxEntries) ||
    limits.maxEntries < 1
  ) {
    throw new Error('EXPORT_LIMIT_INVALID');
  }
  const selected = [...entries];
  if (selected.length < 1 || selected.length > limits.maxEntries)
    throw new Error('EXPORT_ENTRY_COUNT_INVALID');
  const paths = new Set<string>();
  for (const entry of selected) {
    if (
      !safePath.test(entry.path) ||
      !['application/json', 'application/x-ndjson'].includes(entry.mediaType)
    ) {
      throw new Error('EXPORT_ENTRY_INVALID');
    }
    if (paths.has(entry.path) || entry.path === 'manifest.json')
      throw new Error('EXPORT_ENTRY_DUPLICATE');
    paths.add(entry.path);
  }

  const archive = archiver('zip', { zlib: { level: 6 } });
  let archiveBytes = 0;
  const boundedDestination = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      archiveBytes += chunk.length;
      callback(archiveBytes > limits.maxBytes ? new Error('EXPORT_SIZE_EXCEEDED') : null, chunk);
    },
  });
  archive.on('warning', (error) => archive.destroy(error));
  const completed = pipeline(archive, boundedDestination, destination);
  const manifest: ExportPackageEntry[] = [];
  let sourceBytes = 0;
  try {
    for (const entry of selected.sort((left, right) => left.path.localeCompare(right.path))) {
      const hash = createHash('sha256');
      let bytes = 0;
      const counted = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          sourceBytes += chunk.length;
          hash.update(chunk);
          callback(sourceBytes > limits.maxBytes ? new Error('EXPORT_SIZE_EXCEEDED') : null, chunk);
        },
      });
      const source = Readable.from(entry.stream);
      source.once('error', (error) => {
        counted.destroy(error);
        archive.destroy(error);
      });
      source.pipe(counted);
      archive.append(counted, { name: entry.path, date: new Date(0), mode: 0o600 });
      await finished(counted);
      manifest.push({
        path: entry.path,
        mediaType: entry.mediaType,
        bytes,
        sha256: `sha256:${hash.digest('hex')}`,
      });
    }
    archive.append(JSON.stringify({ schemaVersion: 1, entries: manifest }), {
      name: 'manifest.json',
      date: new Date(0),
      mode: 0o600,
    });
    await archive.finalize();
    await completed;
    return { bytes: archiveBytes, entries: manifest };
  } catch (error) {
    archive.abort();
    destination.destroy(error instanceof Error ? error : new Error('EXPORT_PACKAGE_FAILED'));
    try {
      await completed;
    } catch {
      /* preserve the originating safe error */
    }
    throw error;
  }
}
