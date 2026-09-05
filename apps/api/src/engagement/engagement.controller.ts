import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import {
  ENGAGEMENT_ADMIN_ROUTES,
  ENGAGEMENT_CUSTOMER_ROUTES,
  type EngagementRoute,
} from './engagement.routes';
import { EngagementService } from './engagement.service';

type Request = (ClerkPrincipalRequest | AdminPrincipalRequest) & { requestId?: string };

async function execute(
  controller: EngagementController | EngagementAdminController,
  route: EngagementRoute,
  request: Request,
  body: unknown,
  query: unknown,
  params: Record<string, string>,
  key: string | undefined,
  response: Response,
): Promise<unknown> {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  response.setHeader('Cache-Control', 'private, no-store');
  return controller.engagement.execute(request.clerkPrincipal, {
    operation: route.operation,
    body,
    query,
    params,
    idempotencyKey: key,
    requestId: request.requestId ?? 'missing-request-id',
  });
}

@Controller('api/v1')
export class EngagementController {
  constructor(public readonly engagement: EngagementService) {}
}

@Controller('api/v1')
export class EngagementAdminController {
  constructor(public readonly engagement: EngagementService) {}
}

function register(
  target: typeof EngagementController | typeof EngagementAdminController,
  route: EngagementRoute,
  admin: boolean,
): void {
  const handler = function (
    this: EngagementController | EngagementAdminController,
    request: Request,
    body: unknown,
    query: unknown,
    params: Record<string, string>,
    key: string | undefined,
    response: Response,
  ) {
    return execute(this, route, request, body, query, params, key, response);
  };
  Object.defineProperty(target.prototype, route.operation, { value: handler });
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, route.operation);
  if (!descriptor) throw new Error('ENGAGEMENT_ROUTE_REGISTRATION_FAILED');
  Req()(target.prototype, route.operation, 0);
  Body()(target.prototype, route.operation, 1);
  Query()(target.prototype, route.operation, 2);
  Param()(target.prototype, route.operation, 3);
  Headers('idempotency-key')(target.prototype, route.operation, 4);
  Res({ passthrough: true })(target.prototype, route.operation, 5);
  (({ GET: Get, POST: Post, PUT: Put }) as const)[route.method](route.path)(
    target.prototype,
    route.operation,
    descriptor,
  );
  HttpCode(route.status)(target.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(target.prototype, route.operation, descriptor);
  ApiBearerAuth('ClerkBearer')(target.prototype, route.operation, descriptor);
  if (admin) {
    const adminRoute = ENGAGEMENT_ADMIN_ROUTES.find((value) => value.operation === route.operation);
    if (!adminRoute) throw new Error('ENGAGEMENT_ADMIN_ROUTE_INVALID');
    adminPermission(adminRoute.permission, { recentMfa: adminRoute.recentMfa })(
      target.prototype,
      route.operation,
      descriptor,
    );
    UseGuards(AdminAuthGuard)(target.prototype, route.operation, descriptor);
  } else {
    UseGuards(ClerkAuthGuard)(target.prototype, route.operation, descriptor);
  }
}

for (const route of ENGAGEMENT_CUSTOMER_ROUTES) register(EngagementController, route, false);
for (const route of ENGAGEMENT_ADMIN_ROUTES) register(EngagementAdminController, route, true);
