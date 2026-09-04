import type { Response } from 'express';

import { REPORT_ROUTES, ReportsController } from '../../../src/reports/reports.controller';

describe('report schedule HTTP contract', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
  const response = { setHeader: jest.fn(), status: jest.fn() } as unknown as Response;

  it('registers verification and full versioned schedule lifecycle routes', () => {
    expect(REPORT_ROUTES.filter(({ path }) => path.includes('report-schedules'))).toHaveLength(6);
    expect(REPORT_ROUTES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'createReportSchedule', method: 'POST', status: 201 }),
        expect.objectContaining({
          operation: 'updateReportSchedule',
          method: 'PATCH',
          status: 200,
        }),
        expect.objectContaining({
          operation: 'deleteReportSchedule',
          method: 'DELETE',
          status: 204,
        }),
        expect.objectContaining({
          operation: 'verifyReportRecipient',
          method: 'POST',
          status: 200,
        }),
      ]),
    );
  });

  it('passes the optimistic version and idempotency key to the service', async () => {
    const service = {
      updateReportSchedule: jest.fn().mockResolvedValue({ id: 'schedule', version: 2 }),
    };
    const controller = new ReportsController(service as never);
    await controller.execute({
      operation: 'updateReportSchedule',
      request: { clerkPrincipal: principal, requestId: 'request' } as never,
      body: { expectedVersion: 1, enabled: false },
      query: {},
      params: { scheduleId: '99000000-0000-4000-8000-000000000001' },
      idempotencyKey: 'schedule-key',
      response,
    });
    expect(service.updateReportSchedule).toHaveBeenCalledWith(
      principal,
      '99000000-0000-4000-8000-000000000001',
      { expectedVersion: 1, enabled: false },
      'schedule-key',
      'request',
    );
  });
});
