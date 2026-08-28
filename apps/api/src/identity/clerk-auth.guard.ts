import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { IDENTITY_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { ClerkClientService, type ClerkAuthentication } from './clerk-client.service';

export interface ClerkPrincipal {
  userId: string;
  sessionId: string;
  factorAgeSeconds: number | null;
}

export interface ClerkPrincipalRequest extends Request {
  clerkPrincipal?: ClerkPrincipal;
}

function authError(code: 'AUTH_TOKEN_INVALID' | 'PROVIDER_UNAVAILABLE', status: 401 | 503): HttpException {
  return new HttpException({ code }, status);
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly authorizedParties: ReadonlySet<string>;

  constructor(
    private readonly clerk: ClerkClientService,
    config: PlatformConfigService,
  ) {
    this.authorizedParties = new Set(config.getRequired('CLERK_AUTHORIZED_PARTIES'));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClerkPrincipalRequest>();
    request.clerkPrincipal = await this.authenticate(request);
    return true;
  }

  async verifyToken(token: string): Promise<boolean> {
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/meta',
      headers: { authorization: `Bearer ${token}` },
    } as ClerkPrincipalRequest;
    await this.authenticate(request);
    return true;
  }

  private async authenticate(request: ClerkPrincipalRequest): Promise<ClerkPrincipal> {
    let auth: ClerkAuthentication;
    try {
      auth = await this.clerk.authenticateRequest(request);
    } catch {
      recordPlatformMetric(IDENTITY_METRICS.auth, 1, { outcome: 'provider_unavailable' });
      throw authError('PROVIDER_UNAVAILABLE', 503);
    }
    if (!auth.isAuthenticated || auth.sessionStatus !== 'active') {
      recordPlatformMetric(IDENTITY_METRICS.auth, 1, { outcome: 'invalid' });
      throw authError('AUTH_TOKEN_INVALID', 401);
    }

    const role = auth.role;
    const azp = auth.azp;
    if (
      role !== 'authenticated' ||
      auth.userId.trim().length === 0 ||
      auth.userId.length > 128 ||
      auth.sessionId.trim().length === 0 ||
      auth.sessionId.length > 128 ||
      (typeof azp === 'string' && !this.authorizedParties.has(azp)) ||
      (azp !== undefined && typeof azp !== 'string')
    ) {
      recordPlatformMetric(IDENTITY_METRICS.auth, 1, { outcome: 'invalid' });
      throw authError('AUTH_TOKEN_INVALID', 401);
    }

    recordPlatformMetric(IDENTITY_METRICS.auth, 1, { outcome: 'success' });
    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      factorAgeSeconds: auth.factorVerificationAge?.[0] === undefined
        ? null
        : auth.factorVerificationAge[0] * 60,
    };
  }
}
