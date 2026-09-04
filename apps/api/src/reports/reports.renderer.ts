import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

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

function csv(snapshot: ReportSnapshot): Buffer {
  const rows = snapshot.detailedRows.map((item) =>
    CSV_COLUMNS.map((column) => csvCell(item[column])).join(','),
  );
  return Buffer.from(`\uFEFF${CSV_COLUMNS.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`, 'utf8');
}

function pdf(snapshot: ReportSnapshot, font: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: true, compress: true, info: {
      Title: 'Masarifi report', Creator: 'Masarifi', CreationDate: new Date(snapshot.generatedAt),
    } });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    document.on('error', reject);
    document.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    document.registerFont('report', font).font('report').fontSize(18).text('Masarifi | مصاريفي', { align: 'center' });
    document.moveDown().fontSize(11);
    document.text(`${snapshot.period.startDate} — ${snapshot.period.endDate}`);
    document.text(`${snapshot.reportType} · ${snapshot.currencyCode} · ledger ${String(snapshot.ledgerVersion)}`);
    document.moveDown().text(JSON.stringify(canonical(snapshot.summary)));
    for (const row of snapshot.detailedRows) document.text(JSON.stringify(canonical(row)), { width: 500 });
    document.end();
  });
}

export async function renderReport(
  input: ReportSnapshot,
  format: ReportFormat,
  maximumBytes: number,
  arabicFont?: Buffer,
): Promise<RenderedReport> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('REPORT_LIMIT_EXCEEDED');
  let snapshot: ReportSnapshot;
  try {
    snapshot = parseReportSnapshot(input, maximumBytes);
  } catch (error) {
    if (error instanceof Error && error.message === 'REPORT_SNAPSHOT_TOO_LARGE')
      throw new Error('REPORT_LIMIT_EXCEEDED');
    throw error;
  }
  let body: Buffer;
  let contentType: RenderedReport['contentType'];
  if (format === 'json') {
    body = Buffer.from(`${JSON.stringify(canonical(snapshot))}\n`, 'utf8');
    contentType = 'application/json';
  } else if (format === 'csv') {
    body = csv(snapshot);
    contentType = 'text/csv; charset=utf-8';
  } else {
    if (!arabicFont) throw new Error('REPORT_FONT_UNAVAILABLE');
    body = await pdf(snapshot, arabicFont);
    contentType = 'application/pdf';
  }
  if (body.byteLength > maximumBytes) throw new Error('REPORT_LIMIT_EXCEEDED');
  const counted = { bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') };
  return { contentType, extension: format, body: Readable.from([body]), byteCounter: Promise.resolve(counted) };
}
