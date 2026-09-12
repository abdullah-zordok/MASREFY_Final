import { isFixtureModeEnabled } from '@/config/demo-mode';
import type { AutomaticTrackingService } from './contracts/automatic-tracking-service';
import type { CapabilityProviderHandle } from './contracts/capability-contract';
import { createLiveAutomaticTrackingService } from './live/automatic-tracking-service';
import { automaticTrackingService as fixtureAutomaticTrackingService } from './mocks/automatic-tracking-service';

export function selectAutomaticTrackingService(
  fixtureMode: boolean,
  live: CapabilityProviderHandle<AutomaticTrackingService>
): CapabilityProviderHandle<AutomaticTrackingService> {
  return fixtureMode ? fixtureAutomaticTrackingService : live;
}

export const automaticTrackingService = selectAutomaticTrackingService(
  isFixtureModeEnabled(),
  createLiveAutomaticTrackingService()
);

