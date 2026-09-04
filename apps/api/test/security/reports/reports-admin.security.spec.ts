import { ReportsService } from '../../../src/reports/reports.service';

describe('Admin reports security', () => {
  it('requires the existing support-grant path for user-level exports and exposes no financial rows in overview', async () => {
    const denied = Object.assign(new Error('SUPPORT_GRANT_DENIED'), { code: '42501' });
    const repository = {
      getSupportedFinancialReport: jest.fn().mockRejectedValue(denied),
      getAdminReportCounts: jest.fn().mockResolvedValue({
        totalUsers: 1,
        newUsers: 0,
        iosUsers: 0,
        androidUsers: 0,
        bothUsers: 0,
        iosDevices: 0,
        androidDevices: 0,
      }),
    };
    const service = new ReportsService(repository as never, undefined, {
      get: jest.fn().mockReturnValue(300),
    } as never);
    const principal = { userId: 'admin', sessionId: 'session', factorAgeSeconds: 0 };
    await expect(
      service.createAdminExport(
        principal,
        {
          exportType: 'user_report',
          period: '30d',
          format: 'json',
          userId: 'target',
          supportReason: 'Investigating customer issue',
        },
        'export-key',
        'request',
      ),
    ).rejects.toBe(denied);
    const overview = await service.getAdminOverview(principal, {});
    expect(JSON.stringify(overview)).not.toMatch(/amountMinor|income|expense|balance|target/);
  });
});
