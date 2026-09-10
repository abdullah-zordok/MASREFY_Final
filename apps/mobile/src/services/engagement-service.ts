import type { NotificationService, SupportService } from './contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from './contracts/capability-contract';
import { notificationServiceCapability, supportServiceCapability } from './contracts/assistant-notifications-service';
import { isFixtureModeEnabled } from '@/config/demo-mode';
import { assistantNotificationsService as fixtureNotificationService } from './mocks/assistant-notifications-service';
import { supportService as fixtureSupportService } from './mocks/support-service';
import { createLiveNotificationService, createLiveSupportService } from './live/engagement-service';
import { getLiveClerkToken } from './live/auth-service';

function unavailable<T>(capability: typeof notificationServiceCapability | typeof supportServiceCapability): CapabilityProviderHandle<T> {
  return new Proxy({ metadata: { id: `unavailable-${capability.owner}`, capability: capability.capability, majorVersion: capability.majorVersion, kind: 'live' as const, availability: 'unavailable' as const } } as CapabilityProviderHandle<T>, {
    get(target, property) {
      if (property === 'metadata') return target.metadata;
      return async () => { throw new Error(capability.unavailableOutcome ?? 'unavailable'); };
    }
  });
}

const liveNotifications = createLiveNotificationService({ token: getLiveClerkToken });
const liveSupport = createLiveSupportService({ token: getLiveClerkToken });

export const notificationService: CapabilityProviderHandle<NotificationService> = isFixtureModeEnabled()
  ? fixtureNotificationService
  : liveNotifications.metadata.availability === 'available' ? liveNotifications : unavailable<NotificationService>(notificationServiceCapability);

export const supportService: CapabilityProviderHandle<SupportService> = isFixtureModeEnabled()
  ? fixtureSupportService
  : liveSupport.metadata.availability === 'available' ? liveSupport : unavailable<SupportService>(supportServiceCapability);

export { configureEngagementApiTokenProvider, createEngagementApi, createLiveNotificationService, createLiveSupportService, EngagementApiError } from './live/engagement-service';
