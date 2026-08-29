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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../identity/clerk-auth.guard';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { AdminAuthGuard, adminPermission, type AdminPrincipalRequest } from './admin-auth.guard';
import { SecurityService } from './security.service';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export interface SecurityRouteDefinition {
  method: HttpMethod;
  path: string;
  operation: string;
  status: number;
  permission?: string;
  recentMfa?: boolean;
}

export const SECURITY_ROUTES: readonly SecurityRouteDefinition[] = Object.freeze(
  [
    ['GET', 'api/v1/admin/access/admins', 'listAdmins', 200, 'admin-team.read'],
    ['GET', 'api/v1/admin/access/admins/:userId', 'getAdmin', 200, 'admin-team.read'],
    [
      'POST',
      'api/v1/admin/access/admins/:userId/disable',
      'disableAdmin',
      200,
      'admin-team.disable',
      true,
    ],
    [
      'POST',
      'api/v1/admin/access/admins/:userId/sessions/revoke',
      'revokeAdminSessions',
      200,
      'admin-team.sessions.revoke',
      true,
    ],
    ['GET', 'api/v1/admin/access/invitations', 'listAdminInvitations', 200, 'admin-team.read'],
    [
      'POST',
      'api/v1/admin/access/invitations',
      'createAdminInvitation',
      201,
      'access.invites.write',
      true,
    ],
    ['POST', 'api/v1/admin/access/invitations/accept', 'acceptAdminInvitation', 200],
    ['GET', 'api/v1/admin/access/roles', 'listRoles', 200, 'access.roles.read'],
    ['POST', 'api/v1/admin/access/roles', 'createRole', 201, 'access.roles.write', true],
    ['GET', 'api/v1/admin/access/roles/:roleId', 'getRole', 200, 'access.roles.read'],
    ['PATCH', 'api/v1/admin/access/roles/:roleId', 'updateRole', 200, 'access.roles.write', true],
    [
      'POST',
      'api/v1/admin/access/assignments',
      'assignAdminRole',
      201,
      'access.assignments.write',
      true,
    ],
    [
      'DELETE',
      'api/v1/admin/access/assignments/:assignmentId',
      'revokeAdminRole',
      204,
      'access.assignments.write',
      true,
    ],
    ['GET', 'api/v1/admin/access/permissions', 'listPermissions', 200, 'permissions.read'],
    [
      'GET',
      'api/v1/admin/support-access/requests',
      'listSupportAccessRequests',
      200,
      'support.access.read',
    ],
    [
      'POST',
      'api/v1/admin/support-access/requests',
      'createSupportAccessRequest',
      201,
      'support.access.request',
    ],
    [
      'GET',
      'api/v1/admin/support-access/requests/:requestId',
      'getSupportAccessRequest',
      200,
      'support.access.read',
    ],
    [
      'POST',
      'api/v1/admin/support-access/requests/:requestId/decision',
      'decideSupportAccessRequest',
      200,
      'support.access.approve',
      true,
    ],
    [
      'POST',
      'api/v1/admin/support-access/requests/:requestId/revoke',
      'revokeSupportAccess',
      200,
      'support.access.revoke',
      true,
    ],
    [
      'GET',
      'api/v1/admin/support-access/requests/:requestId/workspace',
      'getSupportWorkspace',
      200,
      'support.access.use',
    ],
    [
      'POST',
      'api/v1/admin/support-access/requests/:requestId/end',
      'endSupportAccess',
      200,
      'support.access.use',
    ],
    ['GET', 'api/v1/me/support-access/requests', 'listMySupportAccessRequests', 200],
    [
      'POST',
      'api/v1/me/support-access/requests/:requestId/decision',
      'decideMySupportAccessRequest',
      200,
    ],
    ['GET', 'api/v1/me/security/events', 'listMySecurityEvents', 200],
    ['GET', 'api/v1/admin/security/overview', 'getSecurityOverview', 200, 'security.events.read'],
    ['GET', 'api/v1/admin/security/events', 'listAdminSecurityEvents', 200, 'security.events.read'],
    [
      'GET',
      'api/v1/admin/security/incidents',
      'listSecurityIncidents',
      200,
      'security.incidents.manage',
    ],
    [
      'POST',
      'api/v1/admin/security/incidents',
      'createSecurityIncident',
      201,
      'security.incidents.manage',
      true,
    ],
    [
      'GET',
      'api/v1/admin/security/incidents/:incidentId',
      'getSecurityIncident',
      200,
      'security.incidents.manage',
    ],
    [
      'PATCH',
      'api/v1/admin/security/incidents/:incidentId',
      'updateSecurityIncident',
      200,
      'security.incidents.manage',
      true,
    ],
    ['GET', 'api/v1/admin/audit/events', 'listAuditEvents', 200, 'audit.read'],
    ['GET', 'api/v1/admin/audit/events/:eventId', 'getAuditEvent', 200, 'audit.read'],
    ['POST', 'api/v1/me/privacy/exports', 'createMyPrivacyExport', 202, undefined, true],
    ['GET', 'api/v1/me/privacy/exports/:exportId', 'getMyPrivacyExport', 200],
    ['POST', 'api/v1/me/deletion-requests', 'createMyDeletionRequest', 202, undefined, true],
    ['GET', 'api/v1/me/deletion-requests/:deletionId', 'getMyDeletionRequest', 200],
    ['DELETE', 'api/v1/me/deletion-requests/:deletionId', 'cancelMyDeletionRequest', 204],
    ['GET', 'api/v1/admin/privacy/exports', 'listPrivacyExports', 200, 'privacy.exports.read'],
    [
      'POST',
      'api/v1/admin/privacy/exports/:exportId/actions',
      'actOnPrivacyExport',
      200,
      'privacy.exports.manage',
      true,
    ],
    [
      'GET',
      'api/v1/admin/privacy/deletions',
      'listDeletionRequests',
      200,
      'privacy.deletions.read',
    ],
    [
      'POST',
      'api/v1/admin/privacy/deletions/:deletionId/actions',
      'actOnDeletionRequest',
      200,
      'privacy.deletions.manage',
      true,
    ],
    ['GET', 'api/v1/admin/retention/policies', 'listRetentionPolicies', 200, 'retention.read'],
    [
      'PATCH',
      'api/v1/admin/retention/policies/:policyId',
      'updateRetentionPolicy',
      200,
      'retention.write',
      true,
    ],
    ['POST', 'api/v1/admin/retention/holds', 'createRetentionHold', 201, 'retention.write', true],
    [
      'DELETE',
      'api/v1/admin/retention/holds/:holdId',
      'releaseRetentionHold',
      204,
      'retention.write',
      true,
    ],
  ].map(
    ([method, path, operation, status, permission, recentMfa]) =>
      ({
        method,
        path,
        operation,
        status,
        permission,
        recentMfa,
      }) as SecurityRouteDefinition,
  ),
);

@Controller()
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly config: PlatformConfigService,
  ) {}

  execute(
    operation: string,
    request: AdminPrincipalRequest & { requestId?: string },
    body: unknown,
    query: Record<string, unknown>,
    params: Record<string, string>,
    idempotencyKey: string | undefined,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new Error('AUTH_PRINCIPAL_MISSING');
    if (
      operation === 'acceptAdminInvitation' &&
      !this.config.get('MASARIFI_ADMIN_ROUTES_ENABLED')
    ) {
      throw new HttpException({ code: 'NOT_FOUND' }, 404);
    }
    return this.security.execute({
      operation,
      permission: SECURITY_ROUTES.find((candidate) => candidate.operation === operation)
        ?.permission,
      principal: request.clerkPrincipal,
      body,
      query,
      params,
      idempotencyKey,
      requestId: request.requestId ?? 'missing-request-id',
      networkAddress: request.socket.remoteAddress,
    });
  }
}

const methodDecorators = { GET: Get, POST: Post, PATCH: Patch, DELETE: Delete } as const;
for (const route of SECURITY_ROUTES) {
  const handler = async function (
    this: SecurityController,
    request: AdminPrincipalRequest & { requestId?: string },
    body: unknown,
    query: Record<string, unknown>,
    params: Record<string, string>,
    idempotencyKey: string | undefined,
  ): Promise<unknown> {
    return this.execute(route.operation, request, body, query, params, idempotencyKey);
  };
  Object.defineProperty(SecurityController.prototype, route.operation, {
    value: handler,
    writable: false,
    configurable: false,
  });
  const descriptor = Object.getOwnPropertyDescriptor(SecurityController.prototype, route.operation);
  if (!descriptor) throw new Error('SECURITY_ROUTE_REGISTRATION_FAILED');
  Req()(SecurityController.prototype, route.operation, 0);
  Body()(SecurityController.prototype, route.operation, 1);
  Query()(SecurityController.prototype, route.operation, 2);
  Param()(SecurityController.prototype, route.operation, 3);
  Headers('idempotency-key')(SecurityController.prototype, route.operation, 4);
  methodDecorators[route.method](route.path)(
    SecurityController.prototype,
    route.operation,
    descriptor,
  );
  HttpCode(route.status)(SecurityController.prototype, route.operation, descriptor);
  ApiOperation({ operationId: route.operation })(
    SecurityController.prototype,
    route.operation,
    descriptor,
  );
  ApiBearerAuth('ClerkBearer')(SecurityController.prototype, route.operation, descriptor);
  if (route.permission) {
    adminPermission(route.permission, { recentMfa: route.recentMfa })(
      SecurityController.prototype,
      route.operation,
      descriptor,
    );
    UseGuards(AdminAuthGuard)(SecurityController.prototype, route.operation, descriptor);
  } else {
    UseGuards(ClerkAuthGuard)(SecurityController.prototype, route.operation, descriptor);
  }
}
