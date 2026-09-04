import { createHash } from 'node:crypto';

import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import { ReportsService } from './reports.service';

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  operation: 'getDashboardHome' | 'getReportSummary' | 'listReportAttempts' | 'createReport' | 'getReportAttempt' | 'retryReportDelivery' | 'listReportSchedules' | 'createReportSchedule' | 'verifyReportRecipient' | 'getReportSchedule' | 'updateReportSchedule' | 'deleteReportSchedule';
  status: 200 | 201 | 202 | 204;
}

export const REPORT_ROUTES: readonly Route[] = Object.freeze([
  { method: 'GET', path: 'api/v1/dashboard/home', operation: 'getDashboardHome', status: 200 },
  { method: 'GET', path: 'api/v1/reports/summary', operation: 'getReportSummary', status: 200 },
  { method: 'GET', path: 'api/v1/reports', operation: 'listReportAttempts', status: 200 },
  { method: 'POST', path: 'api/v1/reports', operation: 'createReport', status: 202 },
  { method: 'GET', path: 'api/v1/reports/:attemptId', operation: 'getReportAttempt', status: 200 },
  { method: 'POST', path: 'api/v1/reports/:attemptId/retry-delivery', operation: 'retryReportDelivery', status: 202 },
  { method: 'GET', path: 'api/v1/report-schedules', operation: 'listReportSchedules', status: 200 },
  { method: 'POST', path: 'api/v1/report-schedules', operation: 'createReportSchedule', status: 201 },
  { method: 'POST', path: 'api/v1/report-schedules/verify-recipient', operation: 'verifyReportRecipient', status: 200 },
  { method: 'GET', path: 'api/v1/report-schedules/:scheduleId', operation: 'getReportSchedule', status: 200 },
  { method: 'PATCH', path: 'api/v1/report-schedules/:scheduleId', operation: 'updateReportSchedule', status: 200 },
  { method: 'DELETE', path: 'api/v1/report-schedules/:scheduleId', operation: 'deleteReportSchedule', status: 204 },
]);

export interface ReportsHttpRequest {
  operation: Route['operation'];
  request: ClerkPrincipalRequest & { requestId?: string };
  body?: unknown;
  query: unknown;
  params?: Record<string, string>;
  idempotencyKey?: string;
  ifNoneMatch?: string;
  response: Response;
}

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  async execute(input: ReportsHttpRequest): Promise<unknown> {
    const { operation, request, body, query, params = {}, idempotencyKey, ifNoneMatch, response } = input;
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const requestId = request.requestId ?? 'missing-request-id';
    let result: unknown;
    if (operation === 'getDashboardHome' || operation === 'getReportSummary')
      result = await this.reports[operation](request.clerkPrincipal, query, requestId);
    else if (operation === 'listReportAttempts')
      result = await this.reports.listReportAttempts(request.clerkPrincipal, query, requestId);
    else if (operation === 'createReport')
      result = await this.reports.createReport(request.clerkPrincipal, body, idempotencyKey ?? '', requestId);
    else if (operation === 'getReportAttempt')
      result = await this.reports.getReportAttempt(request.clerkPrincipal, params.attemptId ?? '', requestId);
    else if (operation === 'retryReportDelivery')
      result = await this.reports.retryReportDelivery(request.clerkPrincipal, params.attemptId ?? '', idempotencyKey ?? '', requestId);
    else if (operation === 'listReportSchedules')
      result = await this.reports.listReportSchedules(request.clerkPrincipal, query, requestId);
    else if (operation === 'createReportSchedule')
      result = await this.reports.createReportSchedule(request.clerkPrincipal, body, idempotencyKey ?? '', requestId);
    else if (operation === 'verifyReportRecipient')
      result = await this.reports.verifyReportRecipient(request.clerkPrincipal, body, idempotencyKey ?? '');
    else if (operation === 'getReportSchedule')
      result = await this.reports.getReportSchedule(request.clerkPrincipal, params.scheduleId ?? '', requestId);
    else if (operation === 'updateReportSchedule')
      result = await this.reports.updateReportSchedule(request.clerkPrincipal, params.scheduleId ?? '', body, idempotencyKey ?? '', requestId);
    else {
      await this.reports.deleteReportSchedule(request.clerkPrincipal, params.scheduleId ?? '', (query as Record<string, unknown>).expectedVersion, idempotencyKey ?? '', requestId);
      result = undefined;
    }
    if (operation !== 'getDashboardHome' && operation !== 'getReportSummary') {
      response.setHeader('Cache-Control', 'private, no-store');
      return result;
    }
    const etag = `"${createHash('sha256').update(JSON.stringify(result)).digest('hex')}"`;
    response.setHeader('Cache-Control', 'private, max-age=30');
    response.setHeader('ETag', etag);
    if (ifNoneMatch === etag) {
      response.status(304);
      return undefined;
    }
    return result;
  }
}

for (const route of REPORT_ROUTES) {
  const handler = async function (
    this: ReportsController,
    request: ReportsHttpRequest['request'],
    body: unknown,
    query: unknown,
    params: Record<string, string>,
    idempotencyKey: string | undefined,
    ifNoneMatch: string | undefined,
    response: Response,
  ): Promise<unknown> {
    return this.execute({ operation: route.operation, request, body, query, params, idempotencyKey, ifNoneMatch, response });
  };
  Object.defineProperty(ReportsController.prototype, route.operation, { value: handler });
  const descriptor = Object.getOwnPropertyDescriptor(ReportsController.prototype, route.operation);
  if (!descriptor) throw new Error('REPORT_ROUTE_REGISTRATION_FAILED');
  Req()(ReportsController.prototype, route.operation, 0);
  Body()(ReportsController.prototype, route.operation, 1);
  Query()(ReportsController.prototype, route.operation, 2);
  Param()(ReportsController.prototype, route.operation, 3);
  Headers('idempotency-key')(ReportsController.prototype, route.operation, 4);
  Headers('if-none-match')(ReportsController.prototype, route.operation, 5);
  Res({ passthrough: true })(ReportsController.prototype, route.operation, 6);
  ({ GET: Get, POST: Post, PATCH: Patch, DELETE: Delete } as const)[route.method](route.path)(ReportsController.prototype, route.operation, descriptor);
  HttpCode(route.status)(ReportsController.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(ReportsController.prototype, route.operation, descriptor);
  ApiBearerAuth('ClerkBearer')(ReportsController.prototype, route.operation, descriptor);
  UseGuards(ClerkAuthGuard)(ReportsController.prototype, route.operation, descriptor);
}
