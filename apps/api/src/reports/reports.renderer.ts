import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';

import PDFDocument from 'pdfkit';

import { parseReportSnapshot, type ReportFormat, type ReportSnapshot } from './reports.schemas';

const CSV_COLUMNS = ['occurredAt', 'kind', 'amountMinor', 'currencyCode', 'categoryLabel'] as const;

export interface RenderedReport {
  contentType: 'application/json' | 'text/csv; charset=utf-8' | 'application/pdf';
  extension: ReportFormat;
  body: NodeJS.ReadableStream;
  byteCounter: Promise<{ bytes: number; sha256: string }>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function neutralizeCsvCell(value: string): string {
  const normalized = value.normalize('NFKC');
  return /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(canonical(value))
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? value.toString()
            : '';
  const safe = neutralizeCsvCell(text);
  return `"${safe.replaceAll('"', '""')}"`;
}

function* csv(snapshot: ReportSnapshot): Generator<string> {
  yield `\uFEFF${CSV_COLUMNS.join(',')}\r\n`;
  for (const row of snapshot.detailedRows)
    yield `${CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')}\r\n`;
}

function pdf(snapshot: ReportSnapshot, font: Buffer): NodeJS.ReadableStream & { end(): void } {
  const document = new PDFDocument({
    autoFirstPage: true,
    compress: true,
    info: {
      Title: 'Masarifi report',
      Creator: 'Masarifi',
      CreationDate: new Date(snapshot.generatedAt),
    },
  });
  document
    .registerFont('report', font)
    .font('report')
    .fontSize(18)
    .text('Masarifi | مصاريفي', { align: 'center' });
  document.moveDown().fontSize(11);
  document.text(`${snapshot.period.startDate} — ${snapshot.period.endDate}`);
  document.text(
    `${snapshot.reportType} · ${snapshot.currencyCode} · ledger ${String(snapshot.ledgerVersion)}`,
  );
  document.moveDown().text(JSON.stringify(canonical(snapshot.summary)));
  for (const row of snapshot.detailedRows)
    document.text(JSON.stringify(canonical(row)), { width: 500 });
  return document;
}

function bounded(
  source: NodeJS.ReadableStream,
  maximumBytes: number,
): Pick<RenderedReport, 'body' | 'byteCounter'> {
  let bytes = 0;
  const hash = createHash('sha256');
  let resolveCount!: (count: { bytes: number; sha256: string }) => void;
  let rejectCount!: (error: Error) => void;
  const byteCounter = new Promise<{ bytes: number; sha256: string }>((resolve, reject) => {
    resolveCount = resolve;
    rejectCount = reject;
  });
  const output = new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        callback(new Error('REPORT_LIMIT_EXCEEDED'));
        return;
      }
      hash.update(value);
      callback(null, value);
    },
    flush(callback) {
      resolveCount({ bytes, sha256: hash.digest('hex') });
      callback();
    },
  });
  output.once('error', (error: Error) => {
    rejectCount(error);
  });
  source.once('error', (error: Error) => {
    output.destroy(error);
  });
  source.pipe(output);
  return { body: output, byteCounter };
}

export function renderReport(
  input: ReportSnapshot,
  format: ReportFormat,
  maximumBytes: number,
  arabicFont?: Buffer,
): RenderedReport {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error('REPORT_LIMIT_EXCEEDED');
  let snapshot: ReportSnapshot;
  try {
    snapshot = parseReportSnapshot(input, maximumBytes);
  } catch (error) {
    if (error instanceof Error && error.message === 'REPORT_SNAPSHOT_TOO_LARGE')
      throw new Error('REPORT_LIMIT_EXCEEDED');
    throw error;
  }
  let source: NodeJS.ReadableStream;
  let pdfDocument: (NodeJS.ReadableStream & { end(): void }) | undefined;
  let contentType: RenderedReport['contentType'];
  if (format === 'json') {
    source = Readable.from([`${JSON.stringify(canonical(snapshot))}\n`]);
    contentType = 'application/json';
  } else if (format === 'csv') {
    source = Readable.from(csv(snapshot));
    contentType = 'text/csv; charset=utf-8';
  } else {
    if (!arabicFont) throw new Error('REPORT_FONT_UNAVAILABLE');
    pdfDocument = pdf(snapshot, arabicFont);
    source = pdfDocument;
    contentType = 'application/pdf';
  }
  const output = bounded(source, maximumBytes);
  pdfDocument?.end();
  return {
    contentType,
    extension: format,
    ...output,
  };
}
