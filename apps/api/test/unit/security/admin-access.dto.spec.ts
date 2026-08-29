import { SecurityService } from '../../../src/security/security.service';

describe('admin access boundary DTOs', () => {
  const principal = {
    userId: 'admin_1',
    sessionId: 'session_1',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };

  it('keeps invitation entropy process-local and returns only masked data', async () => {
    const execute = jest
      .fn<Promise<unknown>, [{ body: Record<string, unknown> }]>()
      .mockResolvedValue({ id: 'invitation-1', emailMasked: 'ad***@example.test' });
    const repository = {
      consumeRateLimit: jest.fn().mockResolvedValue(true),
      execute,
    };
    const clerk = { deliverAdminInvitation: jest.fn().mockResolvedValue(undefined) };
    const service = new SecurityService(
      repository as never,
      { get: jest.fn(() => 600), getRequired: jest.fn(() => 72) } as never,
      clerk as never,
      {} as never,
    );

    const result = await service.execute({
      operation: 'createAdminInvitation',
      permission: 'access.invites.write',
      principal,
      body: { email: 'admin@example.test', roleId: 'role-1', expiresInHours: 24 },
      query: {},
      params: {},
      requestId: 'request-1',
      idempotencyKey: 'invitation-request-1',
    });

    const persisted = execute.mock.calls[0]?.[0];
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error('PERSISTED_INPUT_MISSING');
    expect(persisted.body.tokenHash).toMatch(/^h1:[0-9a-f]{64}$/);
    expect(persisted.body).not.toHaveProperty('deliveryToken');
    expect(clerk.deliverAdminInvitation).toHaveBeenCalledWith(
      'admin@example.test',
      expect.stringMatching(/^[A-Za-z0-9_-]{32,}$/),
    );
    expect(JSON.stringify(result)).not.toMatch(/admin@example\.test|token/i);
  });

  it('rejects unknown and client-authority fields before persistence', async () => {
    const repository = { consumeRateLimit: jest.fn().mockResolvedValue(true), execute: jest.fn() };
    const service = new SecurityService(
      repository as never,
      { get: jest.fn(() => 600) } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.execute({
        operation: 'createRole',
        permission: 'access.roles.write',
        principal,
        body: {
          key: 'role',
          name: 'Role',
          permissionKeys: ['audit.read'],
          reason: 'Approved role creation',
          role: 'super-admin',
        },
        query: {},
        params: {},
        requestId: 'request-1',
        idempotencyKey: 'role-request-1',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.execute).not.toHaveBeenCalled();
  });
});
