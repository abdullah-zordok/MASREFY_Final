import { ReportsService } from '../../../src/reports/reports.service';

describe('ReportsService generation', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 10 };
  const command = {
    type: 'financial_summary', periodStart: '2026-08-01', periodEnd: '2026-08-31',
    format: 'pdf', delivery: 'download',
  };

  it('requires recent authentication and a bounded idempotency key', async () => {
    const repository = { captureSnapshot: jest.fn() };
    const service = new ReportsService(repository as never);
    await expect(service.createReport({ ...principal, factorAgeSeconds: 999 }, command, 'request-key', 'r')).rejects.toMatchObject({ status: 403 });
    await expect(service.createReport(principal, command, 'short', 'r')).rejects.toMatchObject({ status: 400 });
    expect(repository.captureSnapshot).not.toHaveBeenCalled();
  });

  it('verifies an email recipient against the authenticated identity without persisting it', async () => {
    const repository = { captureSnapshot: jest.fn().mockResolvedValue({ attemptId: 'id', status: 'queued' }) };
    const identity = { getIdentityUser: jest.fn().mockResolvedValue({ id: 'owner', primaryEmail: 'reports@example.test' }) };
    const service = new ReportsService(repository as never, undefined, undefined, identity as never);
    await service.createReport(principal, { ...command, delivery: 'email', recipient: 'REPORTS@example.test' }, 'request-key', 'r');
    expect(repository.captureSnapshot).toHaveBeenCalledWith(principal, expect.objectContaining({ recipient: null }), 'request-key', 'r');
    identity.getIdentityUser.mockResolvedValue({ id: 'owner', primaryEmail: 'other@example.test' });
    await expect(service.createReport(principal, { ...command, delivery: 'email', recipient: 'reports@example.test' }, 'request-key-2', 'r')).rejects.toMatchObject({ status: 403 });
  });

  it('signs only ready, unexpired owner output and strips its private storage key', async () => {
    const repository = { getAttempt: jest.fn().mockResolvedValue({ id: 'id', status: 'ready', storageRef: 'private-key', expiresAt: '2026-09-05T00:00:00.000Z' }) };
    const storage = { sign: jest.fn().mockResolvedValue('https://storage.test/private') };
    const service = new ReportsService(repository as never, storage as never);
    const result = await service.getReportAttempt(principal, '99000000-0000-4000-8000-000000000001', 'r', new Date('2026-09-04T00:00:00Z')) as Record<string, unknown>;
    expect(result.downloadUrl).toBe('https://storage.test/private');
    expect(result.storageRef).toBeUndefined();
  });
});
