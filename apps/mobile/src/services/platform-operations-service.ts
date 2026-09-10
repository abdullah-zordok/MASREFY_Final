import { isFixtureModeEnabled } from '@/config/demo-mode';
import type {
  PlatformOperationsService
} from '@/services/contracts/platform-operations-service';
import { getLiveClerkToken } from '@/services/live/auth-service';
import { createLivePlatformOperationsService } from '@/services/live/platform-operations-service';

const fixtureService: PlatformOperationsService = {
  get: async () => ({
    apiVersion: 'v1',
    serverTime: '2026-01-01T00:00:00.000Z',
    minMobileVersion: null,
    minAdminVersion: null,
    capabilities: {
      coreFinanceAvailable: true,
      billingAvailable: false,
      paidEntitlement: false,
      checkoutAvailable: false,
      subscriptionManagementAvailable: false,
      promotionsAvailable: false,
      aiAvailable: false,
      aiAllowancePerRolling24Hours: 5
    },
    maintenance: { active: false, scopes: [], message: null },
    featureFlags: {},
    configurationVersion: 1
  })
};

export function selectPlatformOperationsService(
  fixtureMode: boolean,
  live: PlatformOperationsService,
  fixture: PlatformOperationsService
): PlatformOperationsService {
  return fixtureMode ? fixture : live;
}

export const platformOperationsService = selectPlatformOperationsService(
  isFixtureModeEnabled(),
  createLivePlatformOperationsService({ token: getLiveClerkToken }),
  fixtureService
);

export function refreshPlatformOperations() {
  return platformOperationsService.get();
}
