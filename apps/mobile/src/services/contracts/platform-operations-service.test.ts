import type { PlatformOperations } from './platform-operations-service';

describe('platform operations contract', () => {
  it('represents only resolved Free-only client state', () => {
    const value: PlatformOperations = {
      apiVersion: 'v1',
      serverTime: '2026-09-10T08:00:00.000Z',
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
      featureFlags: {},
      configurationVersion: 1
    };
    expect(JSON.stringify(value)).not.toMatch(/job|metric|permission|backup|secret/iu);
  });
});
