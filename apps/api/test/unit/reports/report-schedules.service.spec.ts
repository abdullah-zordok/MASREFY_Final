import { ReportsService } from '../../../src/reports/reports.service';

describe('report schedule service', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 10 };
  const command = { reportType: 'financial_summary', frequency: 'monthly', timezone: 'Asia/Riyadh', deliveryChannel: 'email', recipient: 'reports@example.test', enabled: true };

  it('verifies the authenticated primary email and calculates the next local boundary', async () => {
    const repository = { createSchedule: jest.fn().mockResolvedValue({ id: 'id' }) };
    const identity = { getIdentityUser: jest.fn().mockResolvedValue({ id: 'owner', primaryEmail: 'reports@example.test' }) };
    const service = new ReportsService(repository as never, undefined, undefined, identity as never);
    await service.createReportSchedule(principal, command, 'schedule-key', 'request', new Date('2026-09-04T00:00:00Z'));
    expect(repository.createSchedule).toHaveBeenCalledWith(principal, expect.objectContaining({ nextRunAt: '2026-10-01T05:00:00.000Z' }), 'schedule-key', 'request');
  });

  it('fails closed for a foreign/unverified recipient and stale authentication', async () => {
    const repository = { createSchedule: jest.fn() };
    const identity = { getIdentityUser: jest.fn().mockResolvedValue({ id: 'owner', primaryEmail: 'other@example.test' }) };
    const service = new ReportsService(repository as never, undefined, undefined, identity as never);
    await expect(service.createReportSchedule(principal, command, 'schedule-key', 'request')).rejects.toMatchObject({ status: 403 });
    await expect(service.createReportSchedule({ ...principal, factorAgeSeconds: null }, { ...command, deliveryChannel: 'download', recipient: null }, 'schedule-key', 'request')).rejects.toMatchObject({ status: 403 });
  });
});
