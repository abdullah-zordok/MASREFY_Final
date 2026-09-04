import { renderReport } from '../../../src/reports/reports.renderer';
import type { ReportSnapshot } from '../../../src/reports/reports.schemas';

describe('report stress budgets', () => {
  it('renders 100k transaction rows inside the bounded output and time budgets', async () => {
    const detailedRows = Array.from({ length: 100_000 }, (_, index) => ({
      occurredAt: '2026-08-01T00:00:00.000Z',
      kind: 'expense',
      amountMinor: index,
      currencyCode: 'SAR',
      categoryLabel: `category-${String(index % 20)}`,
    }));
    const snapshot: ReportSnapshot = {
      schemaVersion: 1,
      generatedAt: '2026-09-04T00:00:00.000Z',
      ledgerVersion: 1,
      reportType: 'account_activity',
      period: {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        timezone: 'Asia/Riyadh',
        kind: 'monthly',
      },
      format: 'csv',
      delivery: 'download',
      currencyCode: 'SAR',
      dataState: 'complete',
      evidence: [],
      summary: {},
      breakdowns: [],
      detailedRows,
    };
    const startedAt = performance.now();
    const rendered = renderReport(snapshot, 'csv', 20_000_000);
    let chunks = 0;
    for await (const _chunk of rendered.body) {
      void _chunk;
      chunks += 1;
    }
    const count = await rendered.byteCounter;
    expect(count.bytes).toBeLessThan(20_000_000);
    expect(chunks).toBeGreaterThan(1);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  }, 15_000);
});
