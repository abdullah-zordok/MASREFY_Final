import { ReportsService } from '../../../src/reports/reports.service';

describe('ReportsService summaries', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
  const response = {
    metadata: { schemaVersion: 1, generatedAt: '2026-09-04T00:00:00.000Z', ledgerVersion: 4 },
    summaries: [],
    breakdowns: [],
  };

  it('validates input, resolves the owner timezone, and caches by current ledger version', async () => {
    const repository = {
      getContext: jest.fn().mockResolvedValue({ timezone: 'Asia/Riyadh', ledgerVersion: 4 }),
      getSummary: jest.fn().mockResolvedValue(response),
      getHome: jest.fn(),
    };
    const service = new ReportsService(repository as never);
    const first = await service.getReportSummary(
      principal,
      { type: 'financial_summary', period: 'monthly', currency: 'SAR' },
      'r1',
      new Date('2026-09-04T00:00:00Z'),
    );
    const second = await service.getReportSummary(
      principal,
      { type: 'financial_summary', period: 'monthly', currency: 'SAR' },
      'r2',
      new Date('2026-09-04T00:00:00Z'),
    );
    expect(first).toEqual(response);
    expect(second).toEqual(response);
    expect(repository.getSummary).toHaveBeenCalledTimes(1);
    const calls = repository.getSummary.mock.calls as unknown[][];
    expect(calls[0]?.[2]).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timezone: 'Asia/Riyadh',
    });
  });

  it('keeps dashboard and report namespaces separate and maps validation errors safely', async () => {
    const repository = {
      getContext: jest.fn().mockResolvedValue({ timezone: 'UTC', ledgerVersion: 0 }),
      getSummary: jest.fn().mockResolvedValue(response),
      getHome: jest
        .fn()
        .mockResolvedValue({ ...response, balances: [], planning: {}, recentItems: [] }),
    };
    const service = new ReportsService(repository as never);
    await service.getReportSummary(
      principal,
      { type: 'financial_summary', period: 'annual' },
      'a',
      new Date('2026-09-04T00:00:00Z'),
    );
    await service.getDashboardHome(
      principal,
      { period: 'annual' },
      'b',
      new Date('2026-09-04T00:00:00Z'),
    );
    expect(repository.getSummary).toHaveBeenCalledTimes(1);
    expect(repository.getHome).toHaveBeenCalledTimes(1);
    await expect(
      service.getReportSummary(
        principal,
        { type: 'financial_summary', period: 'monthly', currency: 'sar' },
        'bad',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
