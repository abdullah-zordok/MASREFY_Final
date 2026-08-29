import { SecurityService } from '../../../src/security/security.service';

describe('security operation abuse boundaries', () => {
  const cases = [
    'listAdmins', 'createAdminInvitation', 'listSupportAccessRequests', 'listAuditEvents',
    'createMyPrivacyExport', 'createMyDeletionRequest', 'listRetentionPolicies',
    'listSecurityIncidents',
  ];

  it.each(cases)('uses immutable database evidence to limit %s', async (operation) => {
    const repository = { consumeRateLimit: jest.fn().mockResolvedValue(false), execute: jest.fn() };
    const service = new SecurityService(
      repository as never,
      { get: jest.fn(() => 600) } as never,
      {} as never,
      {} as never,
    );
    await expect(service.execute({
      operation, principal: { userId: 'admin_1', sessionId: 'session_1', factorAgeSeconds: 0 },
      body: {}, query: { role: 'super-admin' }, params: {}, requestId: 'request-1',
    })).rejects.toMatchObject({ status: 429 });
    expect(repository.execute).not.toHaveBeenCalled();
  });
});
