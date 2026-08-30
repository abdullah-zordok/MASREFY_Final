import { REFERENCE_ROUTES } from '../../../src/reference/reference.controller';
import { ReferenceService } from '../../../src/reference/reference.service';

describe('Admin reference contract', () => {
  it('uses typed resources with exact permissions and recent MFA on every write', () => {
    const admin = REFERENCE_ROUTES.filter((route) => route.path.includes('/admin/reference/'));
    expect(admin).toHaveLength(8);
    expect(
      admin
        .filter((route) => route.method === 'GET')
        .every((route) => route.permission === 'reference.read'),
    ).toBe(true);
    expect(
      admin
        .filter((route) => route.method !== 'GET')
        .every((route) => route.permission === 'reference.write' && route.recentMfa),
    ).toBe(true);
    expect(admin.some((route) => route.path.includes(':resource'))).toBe(false);
  });

  it('rejects malformed typed fields before a shared mutation', async () => {
    const repository = { sharedHash: jest.fn(), execute: jest.fn() };
    const service = new ReferenceService(
      repository as never,
      { createAccount: jest.fn() } as never,
    );
    const request = {
      principal: { userId: 'admin_1', sessionId: 's', factorAgeSeconds: 0 },
      requestId: 'request-1',
      idempotencyKey: 'valid-key',
      permission: 'reference.write' as const,
    };
    await expect(
      service.execute({
        ...request,
        operation: 'updateAdminCurrency',
        params: { currencyCode: 'SAR' },
        body: { expectedVersion: 1, reason: 'Required reason', name: { unsafe: true } },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute({
        ...request,
        operation: 'createAdminExchangeRate',
        body: {
          base: 'USD',
          quote: 'SAR',
          rate: '3.75',
          effectiveAt: '2999-01-01T00:00:00.000Z',
          providerRef: { unsafe: true },
          reason: 'Required reason',
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.execute).not.toHaveBeenCalled();
  });
});
