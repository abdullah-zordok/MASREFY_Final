import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import type { OperationCommand } from './operations.schemas';
import { OperationsService } from './operations.service';

type Operation =
  | 'getOperationsHealthOverview'
  | 'listProviderHealth'
  | 'getQueueWorkerHealth'
  | 'listScheduledJobs'
  | 'listJobRuns'
  | 'getJobRun'
  | 'retryJobRun'
  | 'cancelJobRun'
  | 'listSystemIncidents'
  | 'createSystemIncident'
  | 'updateSystemIncident'
  | 'listSystemSettings'
  | 'getSystemSetting'
  | 'updateSystemSetting'
  | 'listFeatureFlags'
  | 'createFeatureFlag'
  | 'updateFeatureFlag'
  | 'previewFeatureFlag'
  | 'listMaintenanceWindows'
  | 'createMaintenanceWindow'
  | 'updateMaintenanceWindow'
  | 'getPerformanceStatus'
  | 'getRecoveryEvidence';

export type OperationsRoute = Readonly<{
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  operation: Operation;
  status: 200 | 201 | 202;
  permission: string;
  recentMfa: boolean;
}>;

export const OPERATIONS_ROUTES: readonly OperationsRoute[] = Object.freeze([
  {
    method: 'GET',
    path: 'api/v1/admin/system-health/overview',
    operation: 'getOperationsHealthOverview',
    status: 200,
    permission: 'operations.health.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/system-health/providers',
    operation: 'listProviderHealth',
    status: 200,
    permission: 'operations.providers.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/jobs/queues',
    operation: 'getQueueWorkerHealth',
    status: 200,
    permission: 'operations.jobs.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/jobs/scheduled',
    operation: 'listScheduledJobs',
    status: 200,
    permission: 'operations.jobs.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/jobs/runs',
    operation: 'listJobRuns',
    status: 200,
    permission: 'operations.jobs.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/jobs/runs/:runId',
    operation: 'getJobRun',
    status: 200,
    permission: 'operations.jobs.read',
    recentMfa: false,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/jobs/runs/:runId/retry',
    operation: 'retryJobRun',
    status: 202,
    permission: 'operations.jobs.manage',
    recentMfa: true,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/jobs/runs/:runId/cancel',
    operation: 'cancelJobRun',
    status: 202,
    permission: 'operations.jobs.manage',
    recentMfa: true,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/incidents',
    operation: 'listSystemIncidents',
    status: 200,
    permission: 'operations.incidents.read',
    recentMfa: false,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/incidents',
    operation: 'createSystemIncident',
    status: 201,
    permission: 'operations.incidents.manage',
    recentMfa: true,
  },
  {
    method: 'PATCH',
    path: 'api/v1/admin/incidents/:incidentId',
    operation: 'updateSystemIncident',
    status: 200,
    permission: 'operations.incidents.manage',
    recentMfa: true,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/settings',
    operation: 'listSystemSettings',
    status: 200,
    permission: 'operations.settings.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/settings/:settingKey',
    operation: 'getSystemSetting',
    status: 200,
    permission: 'operations.settings.read',
    recentMfa: false,
  },
  {
    method: 'PATCH',
    path: 'api/v1/admin/settings/:settingKey',
    operation: 'updateSystemSetting',
    status: 200,
    permission: 'operations.settings.manage',
    recentMfa: true,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/feature-flags',
    operation: 'listFeatureFlags',
    status: 200,
    permission: 'operations.flags.read',
    recentMfa: false,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/feature-flags',
    operation: 'createFeatureFlag',
    status: 201,
    permission: 'operations.flags.manage',
    recentMfa: true,
  },
  {
    method: 'PATCH',
    path: 'api/v1/admin/feature-flags/:flagKey',
    operation: 'updateFeatureFlag',
    status: 200,
    permission: 'operations.flags.manage',
    recentMfa: true,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/feature-flags/:flagKey/preview',
    operation: 'previewFeatureFlag',
    status: 200,
    permission: 'operations.flags.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/maintenance',
    operation: 'listMaintenanceWindows',
    status: 200,
    permission: 'operations.maintenance.read',
    recentMfa: false,
  },
  {
    method: 'POST',
    path: 'api/v1/admin/maintenance',
    operation: 'createMaintenanceWindow',
    status: 201,
    permission: 'operations.maintenance.manage',
    recentMfa: true,
  },
  {
    method: 'PATCH',
    path: 'api/v1/admin/maintenance/:windowId',
    operation: 'updateMaintenanceWindow',
    status: 200,
    permission: 'operations.maintenance.manage',
    recentMfa: true,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/performance',
    operation: 'getPerformanceStatus',
    status: 200,
    permission: 'operations.performance.read',
    recentMfa: false,
  },
  {
    method: 'GET',
    path: 'api/v1/admin/recovery',
    operation: 'getRecoveryEvidence',
    status: 200,
    permission: 'operations.recovery.read',
    recentMfa: false,
  },
]);

type Request = AdminPrincipalRequest & { requestId?: string };

function principal(request: Request): ClerkPrincipal {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  return request.clerkPrincipal;
}

const READ_KIND: Partial<Record<Operation, string>> = {
  getOperationsHealthOverview: 'health',
  listProviderHealth: 'providers',
  getQueueWorkerHealth: 'queues',
  listScheduledJobs: 'scheduled-jobs',
  listJobRuns: 'job-runs',
  getJobRun: 'job-run',
  listSystemIncidents: 'incidents',
  listSystemSettings: 'settings',
  getSystemSetting: 'setting',
  listFeatureFlags: 'flags',
  listMaintenanceWindows: 'maintenance',
  getPerformanceStatus: 'performance',
  getRecoveryEvidence: 'recovery',
};

const COMMAND: Partial<Record<Operation, OperationCommand>> = {
  createSystemIncident: 'createIncident',
  updateSystemIncident: 'updateIncident',
  updateSystemSetting: 'updateSetting',
  createFeatureFlag: 'createFeatureFlag',
  updateFeatureFlag: 'updateFeatureFlag',
  createMaintenanceWindow: 'createMaintenance',
  updateMaintenanceWindow: 'updateMaintenance',
};

@Controller()
@ApiBearerAuth('ClerkBearer')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  execute(
    operation: Operation,
    request: Request,
    body: unknown,
    query: Record<string, unknown>,
    params: Record<string, string>,
    idempotencyKey: string | undefined,
    response: Response,
  ): Promise<unknown> {
    response.setHeader('Cache-Control', 'private, no-store');
    const actor = principal(request);
    const requestId = request.requestId ?? 'missing-request-id';
    if (operation === 'retryJobRun' || operation === 'cancelJobRun')
      return this.operations.jobAction(
        actor,
        params.runId ?? '',
        operation === 'retryJobRun' ? 'retry' : 'cancel',
        body,
        idempotencyKey ?? '',
        requestId,
      );
    if (operation === 'previewFeatureFlag')
      return this.operations.previewFlag(actor, params.flagKey ?? '', body);
    const command = COMMAND[operation];
    if (command)
      return this.operations.command(
        actor,
        command,
        params.incidentId ?? params.settingKey ?? params.flagKey ?? params.windowId ?? null,
        body,
        idempotencyKey ?? '',
        requestId,
      );
    const kind = READ_KIND[operation];
    if (!kind) throw new HttpException({ code: 'OPERATIONS_ROUTE_INVALID' }, 500);
    return this.operations.list(actor, kind, { ...query, ...params });
  }
}

for (const route of OPERATIONS_ROUTES) {
  const handler = function (
    this: OperationsController,
    request: Request,
    body: unknown,
    query: Record<string, unknown>,
    params: Record<string, string>,
    idempotencyKey: string | undefined,
    response: Response,
  ): Promise<unknown> {
    return this.execute(route.operation, request, body, query, params, idempotencyKey, response);
  };
  Object.defineProperty(OperationsController.prototype, route.operation, { value: handler });
  const descriptor = Object.getOwnPropertyDescriptor(
    OperationsController.prototype,
    route.operation,
  );
  if (!descriptor) throw new Error('OPERATIONS_ROUTE_REGISTRATION_FAILED');
  Req()(OperationsController.prototype, route.operation, 0);
  Body()(OperationsController.prototype, route.operation, 1);
  Query()(OperationsController.prototype, route.operation, 2);
  Param()(OperationsController.prototype, route.operation, 3);
  Headers('idempotency-key')(OperationsController.prototype, route.operation, 4);
  Res({ passthrough: true })(OperationsController.prototype, route.operation, 5);
  (({ GET: Get, POST: Post, PATCH: Patch }) as const)[route.method](route.path)(
    OperationsController.prototype,
    route.operation,
    descriptor,
  );
  HttpCode(route.status)(OperationsController.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(
    OperationsController.prototype,
    route.operation,
    descriptor,
  );
  adminPermission(route.permission, { recentMfa: route.recentMfa })(
    OperationsController.prototype,
    route.operation,
    descriptor,
  );
  UseGuards(AdminAuthGuard)(OperationsController.prototype, route.operation, descriptor);
}
