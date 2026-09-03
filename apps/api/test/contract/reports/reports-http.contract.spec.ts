import { HttpException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';
import { REPORT_ROUTES, ReportsController } from '../../../src/reports/reports.controller';

describe('Phase 10 summary HTTP contract', () => {
  const principal = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
  const result = {
    metadata: { schemaVersion: 1, generatedAt: '2026-09-04T00:00:00.000Z', ledgerVersion: 1 },
    summaries: [],
    breakdowns: [],
  };

  function response(): { value: Response; setHeader: jest.Mock; status: jest.Mock } {
    const setHeader = jest.fn();
    const status = jest.fn();
    const value = { setHeader, status } as unknown as Response;
    status.mockReturnValue(value);
    return { value, setHeader, status };
  }

  it('registers canonical authenticated summary operations', () => {
    expect(REPORT_ROUTES).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: 'api/v1/dashboard/home', operation: 'getDashboardHome', status: 200 }),
      expect.objectContaining({ method: 'GET', path: 'api/v1/reports/summary', operation: 'getReportSummary', status: 200 }),
    ]));
  });

  it('publishes both operations in the runtime OpenAPI document', async () => {
    const app: INestApplication = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    try {
      const paths = generateOpenApi(app).paths;
      expect(paths['/api/v1/dashboard/home']?.get?.operationId).toBe('getDashboardHome');
      expect(paths['/api/v1/reports/summary']?.get?.operationId).toBe('getReportSummary');
    } finally {
      await app.close();
    }
  });

  it('sets private caching headers and returns 304 for the exact ETag', async () => {
    const service = { getReportSummary: jest.fn().mockResolvedValue(result), getDashboardHome: jest.fn() };
    const controller = new ReportsController(service as never);
    const firstResponse = response();
    const first = await controller.execute({
      operation: 'getReportSummary',
      request: { clerkPrincipal: principal, requestId: 'request' } as never,
      query: { type: 'financial_summary', period: 'monthly' },
      ifNoneMatch: undefined,
      response: firstResponse.value,
    });
    expect(first).toEqual(result);
    expect(firstResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=30');
    const etag = (firstResponse.setHeader.mock.calls as unknown[][]).find(([name]) => name === 'ETag')?.[1] as string;
    const secondResponse = response();
    expect(await controller.execute({
      operation: 'getReportSummary',
      request: { clerkPrincipal: principal, requestId: 'request' } as never,
      query: { type: 'financial_summary', period: 'monthly' },
      ifNoneMatch: etag,
      response: secondResponse.value,
    })).toBeUndefined();
    expect(secondResponse.status).toHaveBeenCalledWith(304);
  });

  it('rejects missing authentication without calling the service', async () => {
    const service = { getReportSummary: jest.fn(), getDashboardHome: jest.fn() };
    const controller = new ReportsController(service as never);
    await expect(controller.execute({
      operation: 'getReportSummary', request: {} as never, query: {}, response: response().value,
    })).rejects.toEqual(expect.any(HttpException));
    expect(service.getReportSummary).not.toHaveBeenCalled();
  });
});
