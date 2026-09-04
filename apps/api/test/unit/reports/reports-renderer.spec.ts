import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { neutralizeCsvCell, renderReport } from '../../../src/reports/reports.renderer';
import type { ReportSnapshot } from '../../../src/reports/reports.schemas';

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const snapshot: ReportSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-04T00:00:00.000Z',
  ledgerVersion: 9,
  reportType: 'financial_summary',
  period: { startDate: '2026-08-01', endDate: '2026-08-31', timezone: 'Asia/Riyadh', kind: 'monthly' },
  format: 'json',
  delivery: 'download',
  currencyCode: 'SAR',
  dataState: 'complete',
  evidence: [{ kind: 'ledger', version: 9, asOf: '2026-09-04T00:00:00.000Z' }],
  summary: { incomeMinor: 100, expenseMinor: 40, netCashFlowMinor: 60 },
  breakdowns: [],
  detailedRows: [{ occurredAt: '2026-08-01T00:00:00.000Z', kind: '=cmd', amountMinor: 100, currencyCode: 'SAR', categoryLabel: 'طعام' }],
};

describe('report renderer', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])('neutralizes dangerous CSV prefix %s', (prefix) => {
    expect(neutralizeCsvCell(`${prefix}payload`)).toBe(`'${prefix}payload`);
  });

  it('renders stable bounded JSON and CSV from the immutable snapshot', async () => {
    const json = await renderReport(snapshot, 'json', 1_000_000);
    expect(json.contentType).toBe('application/json');
    expect((await readAll(json.body)).toString('utf8')).toContain('"ledgerVersion":9');
    expect((await json.byteCounter).sha256).toMatch(/^[a-f0-9]{64}$/);

    const csv = await renderReport(snapshot, 'csv', 1_000_000);
    expect(csv.contentType).toBe('text/csv; charset=utf-8');
    const csvBody = await readAll(csv.body);
    expect(csvBody.toString('utf8')).toContain("'=cmd");
    expect(csvBody.toString('utf8')).toContain('طعام');
    expect(await readAll((await renderReport(snapshot, 'csv', 1_000_000)).body)).toEqual(csvBody);
  });

  it('embeds the packaged Arabic font and rejects output overflow', async () => {
    const font = readFileSync(join(process.cwd(), '../mobile/assets/fonts/NotoSansArabicUI-Regular.ttf'));
    const pdf = await renderReport(snapshot, 'pdf', 1_000_000, font);
    const pdfBody = await readAll(pdf.body);
    expect(pdf.contentType).toBe('application/pdf');
    expect(pdfBody.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBody.length).toBeGreaterThan(1_000);
    await expect(renderReport(snapshot, 'json', 20)).rejects.toThrow('REPORT_LIMIT_EXCEEDED');
  });

  it('does not create filenames or headers from snapshot content', async () => {
    const report = await renderReport({ ...snapshot, reportType: 'account_activity' }, 'json', 1_000_000);
    expect(report.extension).toBe('json');
    expect(report.contentType).not.toMatch(/[\r\n]/);
  });
});
