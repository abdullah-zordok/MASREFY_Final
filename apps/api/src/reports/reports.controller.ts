import { createHash } from 'node:crypto';

import { Controller, Get, Headers, HttpCode, HttpException, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import { ReportsService } from './reports.service';

interface Route {
  method: 'GET';
  path: string;
  operation: 'getDashboardHome' | 'getReportSummary';
  status: 200;
}

export const REPORT_ROUTES: readonly Route[] = Object.freeze([
  { method: 'GET', path: 'api/v1/dashboard/home', operation: 'getDashboardHome', status: 200 },
  { method: 'GET', path: 'api/v1/reports/summary', operation: 'getReportSummary', status: 200 },
]);

export interface ReportsHttpRequest {
  operation: Route['operation'];
  request: ClerkPrincipalRequest & { requestId?: string };
  query: unknown;
  ifNoneMatch?: string;
  response: Response;
}

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  async execute(input: ReportsHttpRequest): Promise<unknown> {
    const { operation, request, query, ifNoneMatch, response } = input;
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const service = this.reports[operation].bind(this.reports);
    const result = await service(request.clerkPrincipal, query, request.requestId ?? 'missing-request-id');
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
    query: unknown,
    ifNoneMatch: string | undefined,
    response: Response,
  ): Promise<unknown> {
    return this.execute({ operation: route.operation, request, query, ifNoneMatch, response });
  };
  Object.defineProperty(ReportsController.prototype, route.operation, { value: handler });
  const descriptor = Object.getOwnPropertyDescriptor(ReportsController.prototype, route.operation);
  if (!descriptor) throw new Error('REPORT_ROUTE_REGISTRATION_FAILED');
  Req()(ReportsController.prototype, route.operation, 0);
  Query()(ReportsController.prototype, route.operation, 1);
  Headers('if-none-match')(ReportsController.prototype, route.operation, 2);
  Res({ passthrough: true })(ReportsController.prototype, route.operation, 3);
  Get(route.path)(ReportsController.prototype, route.operation, descriptor);
  HttpCode(route.status)(ReportsController.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(ReportsController.prototype, route.operation, descriptor);
  ApiBearerAuth('ClerkBearer')(ReportsController.prototype, route.operation, descriptor);
  UseGuards(ClerkAuthGuard)(ReportsController.prototype, route.operation, descriptor);
}
