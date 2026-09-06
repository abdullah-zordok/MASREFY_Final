import { createLivePlatformOperationsService } from './platform-operations-service';

const safe = {
  apiVersion: 'v1',
  serverTime: '2026-09-06T10:00:00.000Z',
  minMobileVersion: null,
  minAdminVersion: null,
  capabilities: {
    coreFinanceAvailable: true,
    billingAvailable: false,
    paidEntitlement: false,
    checkoutAvailable: false,
    subscriptionManagementAvailable: false,
    promotionsAvailable: false,
    aiAvailable: true,
    aiAllowancePerRolling24Hours: 5
  },
  maintenance: { active: false, scopes: [], message: null },
  featureFlags: { 'mobile.safe-demo': true },
  configurationVersion: 1
};

describe('live platform operations adapter', () => {
  it('maps the authenticated safe metadata endpoint', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true, json: async () => safe });
    const service = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: request as unknown as typeof fetch,
      platform: 'android',
      appVersion: '1.2.3',
      locale: 'en'
    });
    await expect(service.get()).resolves.toEqual({
      capabilities: safe.capabilities,
      maintenance: safe.maintenance,
      featureFlags: safe.featureFlags,
      configurationVersion: 1
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/meta',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-token',
          'X-Masarifi-Platform': 'android',
          'X-Masarifi-App-Version': '1.2.3',
          'X-Masarifi-Locale': 'en'
        })
      })
    );
  });

  it('revalidates cached metadata with its ETag', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => '"meta-v1"' },
        json: async () => safe
      })
      .mockResolvedValueOnce({ ok: false, status: 304 });
    const service = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: request as unknown as typeof fetch
    });

    const first = await service.get();
    await expect(service.get()).resolves.toEqual(first);
    expect(request).toHaveBeenLastCalledWith(
      'https://api.example.test/api/v1/meta',
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"meta-v1"' })
      })
    );
  });

  it('fails closed on unavailable or unsafe metadata', async () => {
    const unavailable = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    });
    await expect(unavailable.get()).resolves.toMatchObject({
      capabilities: { coreFinanceAvailable: true, billingAvailable: false, aiAvailable: false },
      featureFlags: {}
    });
  });

  it('fails closed when feature flags exceed the response contract', async () => {
    const oversized = {
      ...safe,
      featureFlags: Object.fromEntries(
        Array.from({ length: 51 }, (_, index) => [`mobile.safe-${index}`, true])
      )
    };
    const service = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => oversized
      }) as unknown as typeof fetch
    });

    await expect(service.get()).resolves.toMatchObject({
      capabilities: { billingAvailable: false, aiAvailable: false },
      featureFlags: {}
    });
  });
});
