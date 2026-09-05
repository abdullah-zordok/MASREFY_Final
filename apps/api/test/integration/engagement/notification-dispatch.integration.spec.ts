import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';

test('claims and fence-completes an in-app delivery without a provider call', async () => {
  const repository = {
    claimSourceEvents: jest.fn().mockResolvedValue([]),
    expireNotifications: jest.fn().mockResolvedValue(0),
    expandCampaigns: jest.fn().mockResolvedValue(0),
    claimNotificationDeliveries: jest.fn().mockResolvedValue([
      {
        id: '20000000-0000-4000-8000-000000000001',
        claim_token: '30000000-0000-4000-8000-000000000001',
        user_id: 'user-1',
        channel: 'in_app',
        provider: 'database',
        attempt_count: 1,
        event_id: '10000000-0000-4000-8000-000000000001',
        title: 'Safe',
        body_safe: 'Safe body',
        data: {},
        token_ciphertext: null,
        token_device_id: null,
        token_provider: null,
      },
    ]),
    finishNotificationDelivery: jest.fn().mockResolvedValue(true),
    claimAttachments: jest.fn().mockResolvedValue([]),
    removeOrphanedAttachmentUploads: jest.fn().mockResolvedValue([]),
  };
  const config = {
    getRequired: jest.fn(
      (key: string) =>
        ({
          MASARIFI_NOTIFICATION_BATCH_SIZE: 100,
          MASARIFI_CAMPAIGN_BATCH_SIZE: 500,
          MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE: 25,
          MASARIFI_ENGAGEMENT_PROVIDER_MODE: 'disabled',
          MASARIFI_NOTIFICATION_MAX_ATTEMPTS: 5,
        })[key],
    ),
  };
  const worker = new EngagementWorker(
    repository as unknown as EngagementRepository,
    {} as SupportStorage,
    {} as ClerkClientService,
    config as unknown as PlatformConfigService,
  );
  await worker.runOnce();
  expect(repository.finishNotificationDelivery).toHaveBeenCalledWith(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'delivered',
    undefined,
    '10000000-0000-4000-8000-000000000001',
  );
});
