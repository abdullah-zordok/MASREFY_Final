import type { ExecutionContext } from '@nestjs/common';

import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../../../src/identity/clerk-auth.guard';
import { ClerkClientService } from '../../../src/identity/clerk-client.service';

const authenticateRequest = jest.fn();

jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ authenticateRequest }),
}));

const config = {
  get: (key: string) => {
    if (key === 'MASARIFI_CLERK_API_TIMEOUT_MS') return 500;
    if (key === 'CLERK_PUBLISHABLE_KEY') return ['pk', 'test', 'boundaryfixture'].join('_');
    if (key === 'CLERK_INSTANCE_DOMAIN') return 'example.clerk.accounts.dev';
    if (key === 'CLERK_AUTHORIZED_PARTIES') return ['https://admin.example.test'];
    throw new Error(`UNEXPECTED_CONFIG:${key}`);
  },
  getRequired: (key: string) => {
    const values: Record<string, string | readonly string[]> = {
      CLERK_PUBLISHABLE_KEY: ['pk', 'test', 'boundaryfixture'].join('_'),
      CLERK_SECRET_KEY: ['sk', 'test', 'boundaryfixture'].join('_'),
      CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
      CLERK_AUTHORIZED_PARTIES: ['https://admin.example.test'],
    };
    return values[key];
  },
} as unknown as PlatformConfigService;

function context(): ExecutionContext {
  const request = {
    method: 'GET',
    originalUrl: '/api/v1/me',
    headers: { authorization: 'Bearer opaque-boundary-token' },
  } as ClerkPrincipalRequest;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function signedIn(azp?: string): unknown {
  return {
    isAuthenticated: true,
    toAuth: () => ({
      isAuthenticated: true,
      userId: 'user_boundary_1',
      sessionId: 'sess_boundary_1',
      sessionStatus: 'active',
      factorVerificationAge: [1, 2],
      sessionClaims: {
        role: 'authenticated',
        sub: 'user_boundary_1',
        sid: 'sess_boundary_1',
        ...(azp ? { azp } : {}),
      },
    }),
  };
}

describe('Clerk token security boundary', () => {
  let service: ClerkClientService;
  let guard: ClerkAuthGuard;

  beforeEach(() => {
    authenticateRequest.mockReset();
    service = new ClerkClientService(config);
    guard = new ClerkAuthGuard(service, config);
  });

  it('passes only session tokens to the official SDK', async () => {
    authenticateRequest.mockResolvedValue(signedIn('https://admin.example.test'));

    await expect(guard.canActivate(context())).resolves.toBe(true);
    const [webRequest, options] = authenticateRequest.mock.calls[0] as [
      Request,
      { acceptsToken: string },
    ];
    expect(webRequest.headers.get('authorization')).toBe('Bearer opaque-boundary-token');
    expect(options).toEqual({ acceptsToken: 'session_token' });
  });

  it('accepts a verified native session without azp', async () => {
    authenticateRequest.mockImplementation(
      (_request: Request, options: { authorizedParties?: string[] }) =>
        Promise.resolve(
          options.authorizedParties
            ? { isAuthenticated: false, reason: 'token-invalid-authorized-parties' }
            : signedIn(),
        ),
    );
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it.each([
    'wrong issuer',
    'wrong configured audience',
    'wrong present azp',
    'wrong role',
    'bad signature',
    'algorithm confusion',
    'unknown kid',
    'expired exp',
    'premature nbf',
    'missing sub',
    'missing sid',
  ])('returns one account-agnostic denial for SDK rejection: %s', async (_case) => {
    authenticateRequest.mockResolvedValue({ isAuthenticated: false, reason: _case });

    const error = await guard.canActivate(context()).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ status: 401, response: { code: 'AUTH_TOKEN_INVALID' } });
    expect(JSON.stringify(error)).not.toMatch(
      /opaque-boundary-token|user_boundary|account exists|wrong issuer|signature|kid/i,
    );
  });

  it('fails closed and hides Clerk/JWKS outage detail', async () => {
    authenticateRequest.mockRejectedValue(new Error('jwks host response and key detail'));

    const error = await guard.canActivate(context()).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ status: 503, response: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(JSON.stringify(error)).not.toMatch(/jwks host|opaque-boundary-token|key detail/i);
  });
});
