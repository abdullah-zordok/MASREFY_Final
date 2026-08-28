import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import {
  ClerkAuthGuard,
  type ClerkPrincipalRequest,
} from '../../../src/identity/clerk-auth.guard';

const config = {
  getRequired: jest.fn((key: string) => {
    if (key === 'CLERK_AUTHORIZED_PARTIES') return ['https://admin.example.test'];
    throw new Error(`UNEXPECTED_CONFIG:${key}`);
  }),
} as unknown as PlatformConfigService;

function state(overrides: Record<string, unknown> = {}): unknown {
  return {
    isAuthenticated: true,
    userId: 'user_phone_1',
    sessionId: 'sess_1',
    sessionStatus: 'active',
    factorVerificationAge: [2, 5],
    role: 'authenticated',
    azp: 'https://admin.example.test',
    ...overrides,
  };
}

function context(request: Partial<Request> = {}): ExecutionContext {
  const target = {
    method: 'GET',
    originalUrl: '/api/v1/me',
    protocol: 'https',
    headers: { authorization: 'Bearer opaque-session-token', host: 'api.example.test' },
    get: (name: string) => (name.toLowerCase() === 'host' ? 'api.example.test' : undefined),
    ...request,
  } as ClerkPrincipalRequest;
  return {
    switchToHttp: () => ({ getRequest: () => target }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  it('uses the official request result and extracts only the verified principal', async () => {
    const clerk = { authenticateRequest: jest.fn().mockResolvedValue(state()) };
    const guard = new ClerkAuthGuard(clerk as unknown as ClerkClientService, config);
    const execution = context();

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    const request = execution.switchToHttp().getRequest<ClerkPrincipalRequest>();
    expect(clerk.authenticateRequest).toHaveBeenCalledWith(request);
    expect(request.clerkPrincipal).toEqual({
      userId: 'user_phone_1',
      sessionId: 'sess_1',
      factorAgeSeconds: 120,
    });
  });

  it('accepts a verified native request without azp', async () => {
    const signedIn = state({
      userId: 'user_google_1',
      sessionId: 'sess_native',
      azp: undefined,
    });
    const clerk = { authenticateRequest: jest.fn().mockResolvedValue(signedIn) };
    const guard = new ClerkAuthGuard(clerk as unknown as ClerkClientService, config);

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('rejects a present azp outside the configured authorized parties', async () => {
    const signedIn = state({
      azp: 'https://untrusted.example',
    });
    const clerk = { authenticateRequest: jest.fn().mockResolvedValue(signedIn) };
    const guard = new ClerkAuthGuard(clerk as unknown as ClerkClientService, config);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_INVALID' },
    });
  });

  it.each([
    ['signed out', { isAuthenticated: false }],
    ['pending', state({ sessionStatus: 'pending' })],
    ['wrong role', state({ role: 'admin' })],
    ['missing user', state({ userId: '' })],
    ['missing session', state({ sessionId: '' })],
  ])('fails closed for %s', async (_case, signedIn) => {
    const clerk = { authenticateRequest: jest.fn().mockResolvedValue(signedIn) };
    const guard = new ClerkAuthGuard(clerk as unknown as ClerkClientService, config);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(HttpException);
  });

  it('maps provider failure safely without exposing the request token', async () => {
    const clerk = {
      authenticateRequest: jest.fn().mockRejectedValue(new Error('remote response leaked')),
    };
    const guard = new ClerkAuthGuard(clerk as unknown as ClerkClientService, config);

    const error = await guard.canActivate(context()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HttpException);
    expect(JSON.stringify(error)).not.toMatch(/opaque-session-token|remote response leaked/i);
  });
});
