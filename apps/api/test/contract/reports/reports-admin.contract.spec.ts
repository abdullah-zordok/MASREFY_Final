import { ReportsService } from '../../../src/reports/reports.service';

const principal = { userId: 'admin', sessionId: 'session', factorAgeSeconds: 0 };
const counts = {
  totalUsers: 12,
  newUsers: 2,
  iosUsers: 7,
  androidUsers: 6,
  bothUsers: 1,
  iosDevices: 8,
  androidDevices: 6,
};

describe('Admin reports contract', () => {
  const repository = {
    getAdminReportCounts: jest.fn().mockResolvedValue(counts),
    getAdminOverviewActivity: jest.fn().mockResolvedValue({
      items: [
        {
          id: 'activity-1',
          eventType: 'parser-rule-update',
          summary: 'Parser configuration changed.',
          occurredAt: '2026-09-04T00:00:00.000Z',
          platformScope: 'global',
          permission: 'imports.read',
          destination: '/admin/imports',
        },
      ],
      totalItems: 1,
    }),
    getSupportedFinancialReport: jest
      .fn()
      .mockResolvedValue({ adminAggregate: true, supportGrantId: 'grant', summaries: [] }),
    captureAdminExport: jest.fn().mockResolvedValue({
      attemptId: '99000000-0000-4000-8000-000000000001',
      status: 'queued',
      schemaVersion: 1,
    }),
    getAttempt: jest.fn().mockResolvedValue({
      id: '99000000-0000-4000-8000-000000000001',
      status: 'queued',
      expiresAt: '2026-09-05T00:00:00.000Z',
    }),
  };
  const config = {
    get: jest.fn((key: string) => (key === 'MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS' ? 300 : 300)),
  };
  const reports = new ReportsService(repository as never, undefined, config as never);

  it('returns bounded exact overview and platform aggregate shapes', async () => {
    await expect(
      reports.getAdminOverview(principal, { platform: 'all', period: '30d', locale: 'en' }),
    ).resolves.toMatchObject({
      query: { platform: 'all', period: '30d', locale: 'en' },
      metrics: [{ numericValue: 12 }],
      freshness: { state: 'fresh' },
    });
    await expect(
      reports.getAdminPlatformAnalytics(principal, { platform: 'all', period: '30d' }),
    ).resolves.toMatchObject({
      customers: {
        uniqueCustomersTotal: 12,
        iosOnlyCustomers: 6,
        androidOnlyCustomers: 5,
        multiPlatformCustomers: 1,
      },
      versions: [],
      capabilities: [],
    });
    await expect(
      reports.getAdminOverviewActivity(principal, { page: '1', pageSize: '25' }),
    ).resolves.toMatchObject({
      items: [{ eventType: 'parser-rule-update' }],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('creates an idempotent aggregate export and polls through the owner-safe attempt path', async () => {
    const accepted = await reports.createAdminExport(
      principal,
      { exportType: 'overview', period: '7d', platform: 'ios', format: 'csv' },
      'admin-export-key',
      'request',
      new Date('2026-09-04T00:00:00.000Z'),
    );
    expect(accepted).toMatchObject({ status: 'queued' });
    expect(repository.captureAdminExport).toHaveBeenCalledWith(
      principal,
      expect.anything(),
      expect.objectContaining({ format: 'csv', summary: { adminAggregate: true, counts } }),
      'admin-export-key',
      'request',
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
    try {
      await reports.getAdminExport(principal, '99000000-0000-4000-8000-000000000001', 'request');
    } finally {
      jest.useRealTimers();
    }
    expect(repository.getAttempt).toHaveBeenCalled();
  });

  it('rejects excessive filters and stale authentication', async () => {
    await expect(
      reports.getAdminOverviewActivity(principal, { page: 1, pageSize: 26 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      reports.createAdminExport(
        { ...principal, factorAgeSeconds: 301 },
        { exportType: 'overview', period: '30d', format: 'json' },
        'key',
        'request',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
