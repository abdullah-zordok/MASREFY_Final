import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../../../src/security/admin-auth.guard';

const execution = (request: AdminPrincipalRequest, handler = () => undefined): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => request }),
  getHandler: () => handler,
  getClass: () => class TestController {},
}) as unknown as ExecutionContext;

describe('AdminAuthGuard', () => {
  const principal = { userId: 'user_1', sessionId: 'sess_1', factorAgeSeconds: 30, mfaAgeSeconds: 30 };
  const clerk = { canActivate: jest.fn((context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AdminPrincipalRequest>();
    request.clerkPrincipal = principal;
    return Promise.resolve(true);
  }) };
  const repository = { assertAdminPermission: jest.fn(() => Promise.resolve()) };
  const reflector = { getAllAndOverride: jest.fn() };
  const config = { get: jest.fn<boolean | number, [string]>((key) => key === 'MASARIFI_ADMIN_ROUTES_ENABLED' ? true : 600) };

  beforeEach(() => jest.clearAllMocks());

  it('requires one exact manifest permission and ignores client assertions', async () => {
    reflector.getAllAndOverride.mockReturnValue({ permission: 'audit.read', recentMfa: false });
    const guard = new AdminAuthGuard(clerk as never, repository as never, reflector as never, config as never);
    const request = { headers: { 'x-admin-role': 'super-admin' }, query: { role: 'super-admin' } } as never;
    await expect(guard.canActivate(execution(request))).resolves.toBe(true);
    expect(repository.assertAdminPermission).toHaveBeenCalledWith(principal, 'audit.read');
  });

  it('reuses only the same subject and permission within one request', async () => {
    reflector.getAllAndOverride.mockReturnValue({ permission: 'audit.read', recentMfa: false });
    const guard = new AdminAuthGuard(clerk as never, repository as never, reflector as never, config as never);
    const request = {} as AdminPrincipalRequest;
    await guard.canActivate(execution(request));
    await guard.canActivate(execution(request));
    expect(repository.assertAdminPermission).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['routes disabled', false, { permission: 'audit.read', recentMfa: false }, principal, 404],
    ['missing metadata', true, undefined, principal, 403],
    ['unknown key', true, { permission: '*', recentMfa: false }, principal, 403],
    ['missing MFA', true, { permission: 'audit.read', recentMfa: true }, { ...principal, mfaAgeSeconds: null }, 403],
    ['stale MFA', true, { permission: 'audit.read', recentMfa: true }, { ...principal, mfaAgeSeconds: 601 }, 403],
  ])('fails closed for %s', async (_label, enabled, metadata, authPrincipal, status) => {
    config.get.mockImplementation((key: string) => key === 'MASARIFI_ADMIN_ROUTES_ENABLED' ? enabled : 600);
    reflector.getAllAndOverride.mockReturnValue(metadata);
    clerk.canActivate.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<AdminPrincipalRequest>();
      request.clerkPrincipal = authPrincipal;
      return Promise.resolve(true);
    });
    const guard = new AdminAuthGuard(clerk as never, repository as never, reflector as never, config as never);
    await expect(guard.canActivate(execution({} as AdminPrincipalRequest))).rejects.toMatchObject({ status });
  });

  it('maps evaluator failures to a safe unavailable response', async () => {
    reflector.getAllAndOverride.mockReturnValue({ permission: 'audit.read', recentMfa: false });
    repository.assertAdminPermission.mockRejectedValueOnce(new Error('database detail'));
    const guard = new AdminAuthGuard(clerk as never, repository as never, reflector as never, config as never);
    await expect(guard.canActivate(execution({} as AdminPrincipalRequest))).rejects.toEqual(
      new HttpException({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503),
    );
  });

  it('exports a decorator that writes only canonical metadata', () => {
    expect(() => adminPermission('audit.read', { recentMfa: true })).not.toThrow();
    expect(() => adminPermission('*')).toThrow('ADMIN_PERMISSION_INVALID');
  });
});
