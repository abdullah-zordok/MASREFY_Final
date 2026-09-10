import { createLivePlatformOperationsService } from './platform-operations-service';
import { selectPlatformOperationsService } from '../platform-operations-service';
import { compareShadow } from '../cutover/shadow-comparison';

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
  it('keeps explicit fixture selection separate from the production live service', () => {
    const live = { get: jest.fn() };
    const fixture = { get: jest.fn() };
    expect(selectPlatformOperationsService(false, live, fixture)).toBe(live);
    expect(selectPlatformOperationsService(true, live, fixture)).toBe(fixture);
  });

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
      apiVersion: safe.apiVersion,
      serverTime: safe.serverTime,
      minMobileVersion: safe.minMobileVersion,
      minAdminVersion: safe.minAdminVersion,
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

  it('matches the strict Wave 9 metadata projection without retaining values', async () => {
    const service = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: async () => safe
      }) as unknown as typeof fetch
    });
    const live = await service.get();

    await expect(compareShadow({
      operationId: 'mobile.operations.get',
      contractVersion: 'be013-wave-9-v1',
      clientVersion: 'mobile-wave-9',
      cohort: 'percent-09',
      baseline: [safe],
      live: [live],
      financialDifferenceMinor: 0,
      durationMs: 1,
      observedAt: safe.serverTime
    })).resolves.toMatchObject({
      baselineCount: 1,
      liveCount: 1,
      differenceCodes: [],
      outcome: 'match'
    });
  });

  it('uses fresh cache entries and revalidates stale metadata with its ETag', async () => {
    let now = 1_000;
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
      request: request as unknown as typeof fetch,
      now: () => now
    });

    const first = await service.get();
    await expect(service.get()).resolves.toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
    now += 30_001;
    await expect(service.get()).resolves.toEqual(first);
    expect(request).toHaveBeenLastCalledWith(
      'https://api.example.test/api/v1/meta',
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"meta-v1"' })
      })
    );
  });

  it('does not reuse cohort metadata after the authenticated token changes', async () => {
    const token = jest
      .fn()
      .mockResolvedValueOnce('owner-a-token')
      .mockResolvedValueOnce('owner-b-token');
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => '"owner-a"' },
        json: async () => safe
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => '"owner-b"' },
        json: async () => ({ ...safe, featureFlags: { 'mobile.safe-demo': false } })
      });
    const service = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token,
      request: request as unknown as typeof fetch
    });

    await expect(service.get()).resolves.toMatchObject({
      featureFlags: { 'mobile.safe-demo': true }
    });
    await expect(service.get()).resolves.toMatchObject({
      featureFlags: { 'mobile.safe-demo': false }
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns explicit unavailable errors instead of fabricated metadata', async () => {
    const unavailable = createLivePlatformOperationsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'signed-token',
      request: jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    });
    await expect(unavailable.get()).rejects.toMatchObject({
      name: 'PlatformOperationsUnavailableError'
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

    await expect(service.get()).rejects.toMatchObject({
      name: 'PlatformOperationsUnavailableError'
    });
  });

  it('rejects minimum-version, free-only literal, and unknown-field drift', async () => {
    for (const body of [
      { ...safe, minMobileVersion: '' },
      { ...safe, capabilities: { ...safe.capabilities, billingAvailable: true } },
      { ...safe, stripeAvailable: false }
    ]) {
      const service = createLivePlatformOperationsService({
        baseUrl: 'https://api.example.test',
        token: async () => 'signed-token',
        request: jest.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          json: async () => body
        }) as unknown as typeof fetch
      });
      await expect(service.get()).rejects.toMatchObject({
        name: 'PlatformOperationsUnavailableError'
      });
    }
  });
});
