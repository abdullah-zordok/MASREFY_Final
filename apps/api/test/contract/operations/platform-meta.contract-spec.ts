import { MetaService } from '../../../src/platform/meta/meta.service';

describe('safe Free-only platform metadata', () => {
  it('exposes only the approved capability, maintenance, and resolved-flag projection', async () => {
    const value = await new MetaService({
      get: (key: string) => (key === 'MASARIFI_AI_PROVIDER_ENABLED' ? false : undefined),
    } as never).get();
    expect(value.capabilities).toEqual({
      coreFinanceAvailable: true,
      billingAvailable: false,
      paidEntitlement: false,
      checkoutAvailable: false,
      subscriptionManagementAvailable: false,
      promotionsAvailable: false,
      aiAvailable: false,
      aiAllowancePerRolling24Hours: 5,
    });
    expect(value.maintenance).toEqual({ active: false, scopes: [], message: null });
    expect(value.featureFlags).toEqual({});
    expect(value.configurationVersion).toBe(1);
    expect(JSON.stringify(value)).not.toMatch(
      /secret|token|credential|permission|job|metric|backup|subscriptionId|planId/iu,
    );
  });
});
