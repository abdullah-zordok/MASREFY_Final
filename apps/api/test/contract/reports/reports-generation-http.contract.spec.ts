import type { Response } from 'express';

import { REPORT_ROUTES, ReportsController } from '../../../src/reports/reports.controller';

describe('report generation HTTP contract', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
  const setHeader = jest.fn();
  const response = { setHeader, status: jest.fn() } as unknown as Response;

  it('registers request, list, status, and explicit delivery retry routes', () => {
    expect(REPORT_ROUTES).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: 'api/v1/reports', operation: 'listReportAttempts', status: 200 }),
      expect.objectContaining({ method: 'POST', path: 'api/v1/reports', operation: 'createReport', status: 202 }),
      expect.objectContaining({ method: 'GET', path: 'api/v1/reports/:attemptId', operation: 'getReportAttempt', status: 200 }),
      expect.objectContaining({ method: 'POST', path: 'api/v1/reports/:attemptId/retry-delivery', operation: 'retryReportDelivery', status: 202 }),
    ]));
  });

  it('passes only trusted principal, validated route fields, and idempotency material to the service', async () => {
    const service = {
      getReportSummary: jest.fn(), getDashboardHome: jest.fn(), listReportAttempts: jest.fn(),
      createReport: jest.fn().mockResolvedValue({ attemptId: 'id', status: 'queued' }),
      getReportAttempt: jest.fn(), retryReportDelivery: jest.fn(),
    };
    const controller = new ReportsController(service as never);
    await controller.execute({
      operation: 'createReport', request: { clerkPrincipal: principal, requestId: 'request' } as never,
      query: {}, body: { type: 'financial_summary' }, params: {}, idempotencyKey: 'key-12345',
      response,
    });
    expect(service.createReport).toHaveBeenCalledWith(principal, { type: 'financial_summary' }, 'key-12345', 'request');
  });

  it('marks status responses no-store so signed URLs cannot be cached', async () => {
    const service = {
      getReportSummary: jest.fn(), getDashboardHome: jest.fn(), listReportAttempts: jest.fn(),
      createReport: jest.fn(), getReportAttempt: jest.fn().mockResolvedValue({ id: 'attempt', status: 'ready', downloadUrl: 'https://private' }),
      retryReportDelivery: jest.fn(),
    };
    const controller = new ReportsController(service as never);
    await controller.execute({
      operation: 'getReportAttempt', request: { clerkPrincipal: principal } as never,
      query: {}, body: {}, params: { attemptId: '99000000-0000-4000-8000-000000000001' }, response,
    });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
