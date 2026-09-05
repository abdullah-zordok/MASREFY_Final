import { createHash } from 'node:crypto';

import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';

test('hashes, type-checks and scans a quarantined attachment before clean state', async () => {
  const content = Buffer.from('safe text');
  const repository = {
    claimSourceEvents: jest.fn().mockResolvedValue([]),
    expireNotifications: jest.fn().mockResolvedValue(0),
    expandCampaigns: jest.fn().mockResolvedValue(0),
    claimNotificationDeliveries: jest.fn().mockResolvedValue([]),
    claimAttachments: jest.fn().mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000001',
        claim_token: '20000000-0000-4000-8000-000000000001',
        storage_ref:
          'support/30000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001',
        sha256: createHash('sha256').update(content).digest('hex'),
        size_bytes: String(content.length),
        content_type: 'text/plain',
        attempt_count: 1,
      },
    ]),
    finishAttachment: jest.fn().mockResolvedValue(true),
    removeOrphanedAttachmentUploads: jest.fn().mockResolvedValue([]),
  };
  const storage = { read: jest.fn().mockResolvedValue(content), delete: jest.fn() };
  const config = {
    getRequired: jest.fn(
      (key: string) =>
        ({
          MASARIFI_NOTIFICATION_BATCH_SIZE: 100,
          MASARIFI_CAMPAIGN_BATCH_SIZE: 500,
          MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE: 25,
          MASARIFI_ENGAGEMENT_PROVIDER_MODE: 'deterministic',
          MASARIFI_SUPPORT_ATTACHMENT_MAX_BYTES: 10_485_760,
        })[key],
    ),
  };
  const worker = new EngagementWorker(
    repository as unknown as EngagementRepository,
    storage as unknown as SupportStorage,
    {} as ClerkClientService,
    config as unknown as PlatformConfigService,
  );
  await worker.runOnce();
  expect(repository.finishAttachment).toHaveBeenCalledWith(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'clean',
    undefined,
  );
  expect(storage.delete).not.toHaveBeenCalled();
});
