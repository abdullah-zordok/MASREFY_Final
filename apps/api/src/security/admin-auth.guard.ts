import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { recordPlatformMetric, SECURITY_METRICS } from '../platform/observability/platform-metrics';
import { PERMISSION_KEYS } from './permission-manifest';
import { SecurityRepository } from './security.repository';

const ADMIN_ACCESS = Symbol('masarifi.admin-access');
const canonicalPermissions = new Set<string>(PERMISSION_KEYS);

export interface AdminAccessRequirement {
  permission: string;
  recentMfa: boolean;
}

export interface AdminPrincipalRequest extends ClerkPrincipalRequest {
  adminAuthorizations?: Set<string>;
}

export function adminPermission(
  permission: string,
  options: { recentMfa?: boolean } = {},
): MethodDecorator & ClassDecorator {
  if (!canonicalPermissions.has(permission)) throw new Error('ADMIN_PERMISSION_INVALID');
  return SetMetadata(ADMIN_ACCESS, {
    permission,
    recentMfa: options.recentMfa ?? false,
  } satisfies AdminAccessRequirement);
}

function forbidden(code: string): HttpException {
  return new HttpException({ code }, 403);
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly clerk: ClerkAuthGuard,
    private readonly repository: SecurityRepository,
    private readonly reflector: Reflector,
    private readonly config: PlatformConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const startedAt = performance.now();
    if (!this.config.get('MASARIFI_ADMIN_ROUTES_ENABLED')) {
      throw new HttpException({ code: 'NOT_FOUND' }, 404);
    }
    await this.clerk.canActivate(context);
    const request = context.switchToHttp().getRequest<AdminPrincipalRequest>();
    const requirement = this.reflector.getAllAndOverride<AdminAccessRequirement | undefined>(
      ADMIN_ACCESS,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement || !canonicalPermissions.has(requirement.permission)) {
      throw forbidden('ADMIN_PERMISSION_DENIED');
    }
    const principal = request.clerkPrincipal;
    if (!principal) throw forbidden('ADMIN_PERMISSION_DENIED');
    if (requirement.recentMfa) {
      const maximumAge = this.config.get('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS');
      if (
        principal.mfaAgeSeconds === null ||
        principal.mfaAgeSeconds === undefined ||
        principal.mfaAgeSeconds > maximumAge
      ) {
        throw forbidden('RECENT_AUTH_REQUIRED');
      }
    }

    const cacheKey = `${principal.userId}\u0000${requirement.permission}`;
    request.adminAuthorizations ??= new Set<string>();
    if (request.adminAuthorizations.has(cacheKey)) return true;
    try {
      await this.repository.assertAdminPermission(principal, requirement.permission);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('code' in error && Reflect.get(error, 'code') === '42501') ||
          ('message' in error && Reflect.get(error, 'message') === 'ADMIN_PERMISSION_DENIED'))
      ) {
        recordPlatformMetric(SECURITY_METRICS.permissionDecision, 1, {
          outcome: 'denied',
          permission: requirement.permission,
        });
        throw forbidden('ADMIN_PERMISSION_DENIED');
      }
      recordPlatformMetric(SECURITY_METRICS.permissionDecision, 1, {
        outcome: 'unavailable',
        permission: requirement.permission,
      });
      throw new HttpException({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
    }
    request.adminAuthorizations.add(cacheKey);
    recordPlatformMetric(SECURITY_METRICS.permissionDecision, 1, {
      outcome: 'allowed',
      permission: requirement.permission,
    });
    recordPlatformMetric(SECURITY_METRICS.permissionDuration, performance.now() - startedAt, {
      outcome: 'allowed',
      permission: requirement.permission,
    });
    return true;
  }
}
