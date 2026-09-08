import { HttpException } from '@nestjs/common';

import { SecurityService } from '../../../src/security/security.service';

describe('SecurityService boundaries', () => {
  const principal = {
    userId: 'user_1',
    sessionId: 'session_1',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const repository = {
    consumeRateLimit: jest.fn(() => Promise.resolve(true)),
    execute: jest.fn(() => Promise.resolve({ id: 'opaque' })),
    getReadyExportReference: jest.fn(() => Promise.resolve('private/export.zip')),
  };
  const config = {
    get: jest.fn(() => 600),
    getRequired: jest.fn((key: string) =>
      key.includes('IP_HASH')
        ? `active:${Buffer.alloc(32, 7).toString('base64url')}`
        : key.includes('MANIFEST')
          ? ['identity@1']
          : key.includes('COOLING')
            ? 72
            : 300,
    ),
  };
  const clerk = {
    getIdentityUser: jest.fn(),
    deliverAdminInvitation: jest.fn(),
    countActiveSessions: jest.fn(),
  };
  const storage = { sign: jest.fn() };
  const service = new SecurityService(
    repository as never,
    config as never,
    clerk as never,
    storage as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each(['role', 'permissions', '__scenario', 'confirmationToken'])(
    'rejects mass-assigned authority field %s',
    async (field) => {
      await expect(
        service.execute({
          operation: 'createRole',
          permission: 'access.roles.write',
          principal,
          body: {
            key: 'custom-role',
            name: 'Custom',
            permissionKeys: ['audit.read'],
            reason: 'Approved role creation',
            [field]: 'super-admin',
          },
          query: {},
          params: {},
          requestId: 'request-1',
          idempotencyKey: 'request-key',
        }),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.execute).not.toHaveBeenCalled();
    },
  );

  it('requires idempotency, recent MFA, and a bounded reason', async () => {
    const base = {
      operation: 'createRole',
      permission: 'access.roles.write',
      principal,
      body: {
        key: 'custom-role',
        name: 'Custom',
        permissionKeys: ['audit.read'],
        reason: 'Approved role creation',
      },
      query: {},
      params: {},
      requestId: 'request-1',
    };
    await expect(service.execute(base)).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute({
        ...base,
        idempotencyKey: 'request-key',
        principal: { ...principal, mfaAgeSeconds: null },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.execute({
        ...base,
        idempotencyKey: 'request-key',
        body: { ...base.body, reason: 'short' },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns a stable 429 when immutable database evidence reaches its bound', async () => {
    repository.consumeRateLimit.mockResolvedValueOnce(false);
    await expect(
      service.execute({
        operation: 'listAdmins',
        permission: 'admin-team.read',
        principal,
        body: {},
        query: {},
        params: {},
        requestId: 'request-1',
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('stores only a keyed network hash in rate-limit evidence', async () => {
    await service.execute({
      operation: 'listAdmins',
      permission: 'admin-team.read',
      principal,
      body: {},
      query: {},
      params: {},
      requestId: 'request-1',
      networkAddress: '192.0.2.10',
    });
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      principal,
      'rbac',
      60,
      60,
      expect.stringMatching(/^h1:active:[0-9a-f]{64}$/),
    );
    expect(JSON.stringify(repository.consumeRateLimit.mock.calls)).not.toContain('192.0.2.10');
  });

  it('requires recent authentication before returning a ready export download URL', async () => {
    repository.execute.mockResolvedValueOnce({ id: 'export-1', status: 'ready' } as never);
    await expect(
      service.execute({
        operation: 'getMyPrivacyExport',
        principal: { ...principal, factorAgeSeconds: null },
        body: {},
        query: {},
        params: { exportId: 'export-1' },
        requestId: 'request-1',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it('rejects unknown privacy export domains and invalid support scopes as client errors', async () => {
    await expect(
      service.execute({
        operation: 'createMyPrivacyExport',
        principal,
        body: { scope: ['unknown@1'] },
        query: {},
        params: {},
        requestId: 'request-1',
        idempotencyKey: 'request-key',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute({
        operation: 'createSupportAccessRequest',
        permission: 'support.access.request',
        principal,
        body: { resourceScopes: [{ resource: 'payments', actions: ['write'] }] },
        query: {},
        params: {},
        requestId: 'request-1',
        idempotencyKey: 'request-key',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('requires a reason for session revocation', async () => {
    await expect(
      service.execute({
        operation: 'revokeAdminSessions',
        permission: 'admin-team.sessions.revoke',
        principal,
        body: { revokeAllEligible: true, expectedVersion: 1 },
        query: {},
        params: { userId: 'admin-2' },
        requestId: 'request-1',
        idempotencyKey: 'request-key',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    'person@example.test',
    'https://internal.example/path',
    'Bearer opaque-value',
    '192.0.2.10',
  ])('rejects unsafe evidence text %s', async (reason) => {
    await expect(
      service.execute({
        operation: 'createRole',
        permission: 'access.roles.write',
        principal,
        body: {
          key: 'custom-role',
          name: 'Custom',
          permissionKeys: ['audit.read'],
          reason,
        },
        query: {},
        params: {},
        requestId: 'request-1',
        idempotencyKey: 'request-key',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('projects database evidence into the approved safe response contract', async () => {
    repository.execute.mockResolvedValueOnce({
      items: [
        {
          id: 'event-1',
          actor: 'admin-123456',
          actorType: 'admin',
          action: 'security.role-updated',
          resourceType: 'role',
          requestId: 'request-1',
          occurredAt: new Date(),
          safeMetadata: { operation: 'updateRole' },
        },
      ],
      nextCursor: null,
    } as never);

    await expect(
      service.execute({
        operation: 'listAuditEvents',
        permission: 'audit.read',
        principal,
        body: {},
        query: {},
        params: {},
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({
      items: [
        {
          actor: { id: 'admin-123456', kind: 'admin', label: 'admin 123456' },
          result: 'success',
          safeMetadata: [{ key: 'operation', label: 'operation', value: 'updateRole' }],
        },
      ],
    });
  });

  it('uses Clerk rather than device links for the live self-session count', async () => {
    repository.execute.mockResolvedValueOnce({
      id: 'admin-1',
      activeSessionCount: 99,
    } as never);
    clerk.countActiveSessions.mockResolvedValueOnce(2);

    await expect(
      service.execute({
        operation: 'getAdminSelf',
        permission: 'admin.overview.read',
        principal,
        body: {},
        query: {},
        params: {},
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({ activeSessionCount: 2 });
  });
});
