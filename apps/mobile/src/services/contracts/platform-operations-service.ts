export interface PlatformOperations {
  capabilities: {
    coreFinanceAvailable: true;
    billingAvailable: false;
    paidEntitlement: false;
    checkoutAvailable: false;
    subscriptionManagementAvailable: false;
    promotionsAvailable: false;
    aiAvailable: boolean;
    aiAllowancePerRolling24Hours: 5;
  };
  maintenance: {
    active: boolean;
    scopes: string[];
    message: { ar: string; en: string } | null;
  };
  featureFlags: Record<string, boolean>;
  configurationVersion: number;
}

export interface PlatformOperationsService {
  get(): Promise<PlatformOperations>;
}
