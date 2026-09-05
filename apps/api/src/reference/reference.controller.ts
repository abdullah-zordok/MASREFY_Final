import { createHash } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
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

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import { ReferenceService } from './reference.service';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
interface Route {
  method: Method;
  path: string;
  operation: string;
  status: number;
  permission?: 'reference.read' | 'reference.write';
  recentMfa?: boolean;
}
interface ReferenceHttpRequest {
  operation: string;
  request: (ClerkPrincipalRequest | AdminPrincipalRequest) & { requestId?: string };
  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
  idempotencyKey?: string;
  ifNoneMatch?: string;
  response: Response;
}
type RouteArguments = [
  request: ReferenceHttpRequest['request'],
  body: unknown,
  query: Record<string, unknown>,
  params: Record<string, string>,
  idempotencyKey: string | undefined,
  ifNoneMatch: string | undefined,
  response: Response,
];
export const REFERENCE_ROUTES: readonly Route[] = Object.freeze(
  [
    ['GET', 'api/v1/reference/currencies', 'listCurrencies', 200],
    ['GET', 'api/v1/reference/countries', 'listCountries', 200],
    ['GET', 'api/v1/exchange-rates', 'getExchangeRate', 200],
    ['GET', 'api/v1/categories', 'listCategories', 200],
    ['GET', 'api/v1/categories/:categoryId/usage', 'getCategoryUsage', 200],
    ['POST', 'api/v1/categories', 'createCategory', 201],
    ['PATCH', 'api/v1/categories/:categoryId', 'updateCategory', 200],
    ['DELETE', 'api/v1/categories/:categoryId', 'archiveCategory', 204],
    ['POST', 'api/v1/categories/:categoryId/restore', 'restoreCategory', 200],
    ['POST', 'api/v1/categories/:categoryId/merge', 'mergeCategory', 200],
    ['GET', 'api/v1/accounts', 'listAccounts', 200],
    ['POST', 'api/v1/accounts', 'createAccount', 201],
    ['GET', 'api/v1/accounts/:accountId', 'getAccount', 200],
    ['PATCH', 'api/v1/accounts/:accountId', 'updateAccount', 200],
    ['DELETE', 'api/v1/accounts/:accountId', 'archiveAccount', 204],
    ['POST', 'api/v1/accounts/:accountId/restore', 'restoreAccount', 200],
    ['POST', 'api/v1/accounts/:accountId/close', 'closeAccount', 200],
    ['GET', 'api/v1/admin/reference/currencies', 'listAdminCurrencies', 200, 'reference.read'],
    [
      'PATCH',
      'api/v1/admin/reference/currencies/:currencyCode',
      'updateAdminCurrency',
      200,
      'reference.write',
      true,
    ],
    ['GET', 'api/v1/admin/reference/countries', 'listAdminCountries', 200, 'reference.read'],
    [
      'PATCH',
      'api/v1/admin/reference/countries/:countryCode',
      'updateAdminCountry',
      200,
      'reference.write',
      true,
    ],
    [
      'GET',
      'api/v1/admin/reference/categories',
      'listAdminSystemCategories',
      200,
      'reference.read',
    ],
    [
      'PATCH',
      'api/v1/admin/reference/categories/:categoryId',
      'updateAdminSystemCategory',
      200,
      'reference.write',
      true,
    ],
    [
      'GET',
      'api/v1/admin/reference/exchange-rates',
      'listAdminExchangeRates',
      200,
      'reference.read',
    ],
    [
      'POST',
      'api/v1/admin/reference/exchange-rates',
      'createAdminExchangeRate',
      201,
      'reference.write',
      true,
    ],
  ].map(
    ([method, path, operation, status, permission, recentMfa]) =>
      ({ method, path, operation, status, permission, recentMfa }) as Route,
  ),
);

@Controller()
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}
  async execute(input: ReferenceHttpRequest): Promise<unknown> {
    const { operation, request, body, query, params, idempotencyKey, ifNoneMatch, response } =
      input;
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const route = REFERENCE_ROUTES.find((candidate) => candidate.operation === operation);
    if (!route) throw new HttpException({ code: 'NOT_FOUND' }, 404);
    const result = await this.reference.execute({
      operation,
      principal: request.clerkPrincipal,
      body,
      query,
      params,
      requestId: request.requestId ?? 'missing-request-id',
      idempotencyKey,
      permission: route.permission,
    });
    if (operation === 'listCurrencies' || operation === 'listCountries') {
      const etag = `"${createHash('sha256').update(JSON.stringify(result)).digest('hex')}"`;
      response.setHeader('ETag', etag);
      if (ifNoneMatch === etag) {
        response.status(304);
        return undefined;
      }
    }
    return result;
  }
}

const decorators = { GET: Get, POST: Post, PATCH: Patch, DELETE: Delete } as const;
for (const route of REFERENCE_ROUTES) {
  const handler = async function (
    this: ReferenceController,
    ...[request, body, query, params, idempotencyKey, ifNoneMatch, response]: RouteArguments
  ): Promise<unknown> {
    return this.execute({
      operation: route.operation,
      request,
      body,
      query,
      params,
      idempotencyKey,
      ifNoneMatch,
      response,
    });
  };
  Object.defineProperty(ReferenceController.prototype, route.operation, {
    value: handler,
    writable: false,
    configurable: false,
  });
  const descriptor = Object.getOwnPropertyDescriptor(
    ReferenceController.prototype,
    route.operation,
  );
  if (!descriptor) throw new Error('REFERENCE_ROUTE_REGISTRATION_FAILED');
  Req()(ReferenceController.prototype, route.operation, 0);
  Body()(ReferenceController.prototype, route.operation, 1);
  Query()(ReferenceController.prototype, route.operation, 2);
  Param()(ReferenceController.prototype, route.operation, 3);
  Headers('idempotency-key')(ReferenceController.prototype, route.operation, 4);
  Headers('if-none-match')(ReferenceController.prototype, route.operation, 5);
  Res({ passthrough: true })(ReferenceController.prototype, route.operation, 6);
  decorators[route.method](route.path)(ReferenceController.prototype, route.operation, descriptor);
  HttpCode(route.status)(ReferenceController.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(
    ReferenceController.prototype,
    route.operation,
    descriptor,
  );
  ApiBearerAuth('ClerkBearer')(ReferenceController.prototype, route.operation, descriptor);
  if (route.permission) {
    adminPermission(route.permission, { recentMfa: route.recentMfa })(
      ReferenceController.prototype,
      route.operation,
      descriptor,
    );
    UseGuards(AdminAuthGuard)(ReferenceController.prototype, route.operation, descriptor);
  } else UseGuards(ClerkAuthGuard)(ReferenceController.prototype, route.operation, descriptor);
}
