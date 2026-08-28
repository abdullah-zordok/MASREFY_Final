import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { Injectable } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { PlatformConfigService } from '../platform/config/platform-config.service';

export type ClerkAuthentication =
  | { isAuthenticated: false }
  | {
      isAuthenticated: true;
      userId: string;
      sessionId: string;
      sessionStatus: string | null;
      role: unknown;
      azp: unknown;
      factorVerificationAge: readonly [number, number] | null;
    };

export class ClerkProviderUnavailableError extends Error {
  constructor() {
    super('CLERK_PROVIDER_UNAVAILABLE');
  }
}

export interface ClerkIdentityUser {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  displayName: string | null;
}

export interface ClerkIdentityPage {
  users: ClerkIdentityUser[];
  nextOffset: number | null;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as Record<string, unknown>).status;
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSignedInState(
  value: unknown,
): value is Record<string, unknown> & { isAuthenticated: true; toAuth: (options: unknown) => unknown } {
  return isRecord(value) && value.isAuthenticated === true && typeof value.toAuth === 'function';
}

@Injectable()
export class ClerkClientService {
  private readonly client: ClerkClient;
  private readonly timeoutMs: number;
  private readonly instanceDomain: string | undefined;

  constructor(config: PlatformConfigService) {
    this.client = createClerkClient({
      secretKey: config.getRequired('CLERK_SECRET_KEY'),
      ...(config.get('CLERK_PUBLISHABLE_KEY')
        ? { publishableKey: config.get('CLERK_PUBLISHABLE_KEY') }
        : {}),
      telemetry: { disabled: true, debug: false, samplingRate: 0 },
    });
    this.timeoutMs = config.get('MASARIFI_CLERK_API_TIMEOUT_MS');
    this.instanceDomain = config.get('CLERK_INSTANCE_DOMAIN');
  }

  async authenticateRequest(request: ExpressRequest): Promise<ClerkAuthentication> {
    if (!this.instanceDomain) {
      throw new ClerkProviderUnavailableError();
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(','));
      else if (value !== undefined) headers.set(name, value);
    }
    const webRequest = new Request(
      new URL(request.originalUrl || '/', `https://${this.instanceDomain}`),
      { method: request.method || 'GET', headers },
    );

    try {
      const state: unknown = await this.withTimeout(
        this.client.authenticateRequest<'session_token'>(webRequest, {
          acceptsToken: 'session_token',
        }),
      );
      if (!isSignedInState(state)) return { isAuthenticated: false };
      const auth = state.toAuth({ treatPendingAsSignedOut: true });
      if (!isRecord(auth) || auth.isAuthenticated !== true || !isRecord(auth.sessionClaims)) {
        return { isAuthenticated: false };
      }
      const { userId, sessionId, sessionStatus, factorVerificationAge, sessionClaims } = auth;
      if (
        typeof userId !== 'string' ||
        typeof sessionId !== 'string' ||
        (sessionStatus !== null && typeof sessionStatus !== 'string') ||
        (factorVerificationAge !== null &&
          (!Array.isArray(factorVerificationAge) ||
            factorVerificationAge.length !== 2 ||
            !factorVerificationAge.every((age) => typeof age === 'number')))
      ) {
        return { isAuthenticated: false };
      }
      return {
        isAuthenticated: true,
        userId,
        sessionId,
        sessionStatus,
        role: sessionClaims.role,
        azp: sessionClaims.azp,
        factorVerificationAge: factorVerificationAge as [number, number] | null,
      };
    } catch {
      throw new ClerkProviderUnavailableError();
    }
  }

  async revokeSession(sessionId: string): Promise<'revoked' | 'not_found'> {
    if (sessionId.trim() !== sessionId || sessionId.length < 1 || sessionId.length > 255) {
      throw new ClerkProviderUnavailableError();
    }
    try {
      await this.withTimeout(this.client.sessions.revokeSession(sessionId));
      return 'revoked';
    } catch (error) {
      if (statusCode(error) === 404) return 'not_found';
      throw new ClerkProviderUnavailableError();
    }
  }

  async getIdentityUser(userId: string): Promise<ClerkIdentityUser | null> {
    if (userId.trim() !== userId || userId.length < 1 || userId.length > 128) {
      throw new ClerkProviderUnavailableError();
    }
    try {
      const user = await this.withTimeout(this.client.users.getUser(userId));
      return this.identityUser(user);
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw new ClerkProviderUnavailableError();
    }
  }

  async listIdentityUsers(offset: number, limit: number): Promise<ClerkIdentityPage> {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ClerkProviderUnavailableError();
    }
    try {
      const page = await this.withTimeout(this.client.users.getUserList({
        offset, limit, orderBy: '+created_at',
      }));
      const nextOffset = offset + page.data.length < page.totalCount
        ? offset + page.data.length
        : null;
      return { users: page.data.map((user) => this.identityUser(user)), nextOffset };
    } catch {
      throw new ClerkProviderUnavailableError();
    }
  }

  private identityUser(user: Awaited<ReturnType<ClerkClient['users']['getUser']>>): ClerkIdentityUser {
    if (user.id.trim() !== user.id || user.id.length < 1 || user.id.length > 128) {
      throw new ClerkProviderUnavailableError();
    }
    const emailValue = user.emailAddresses.find(
      (entry) => entry.id === user.primaryEmailAddressId,
    )?.emailAddress.trim().toLowerCase();
    const phoneValue = user.phoneNumbers.find(
      (entry) => entry.id === user.primaryPhoneNumberId,
    )?.phoneNumber.trim();
    const name = [user.firstName, user.lastName]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join(' ');
    return {
      id: user.id,
      primaryEmail: emailValue && emailValue.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(emailValue)
        ? emailValue
        : null,
      primaryPhone: phoneValue && /^\+[1-9][0-9]{7,14}$/.test(phoneValue) ? phoneValue : null,
      displayName: name.length >= 1 && name.length <= 100 ? name : null,
    };
  }

  private async withTimeout<T>(task: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ClerkProviderUnavailableError());
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
