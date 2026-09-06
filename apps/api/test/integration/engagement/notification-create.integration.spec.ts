import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import type { SupportStorage } from '../../../src/engagement/support.storage';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';

test('turns a committed registered source event into preference-aware channel work', async () => {
  const source = {
    source_event_id: '10000000-0000-4000-8000-000000000001',
    source_id: '20000000-0000-4000-8000-000000000001',
    event_type: 'account.credit_card_payment_due',
    user_id: 'user-1',
    locale: 'en' as const,
    time_zone: 'Asia/Riyadh',
    occurred_at: '2026-09-05T07:00:00.000Z',
    expires_at: null,
  };
  const repository = {
    claimSourceEvents: jest.fn().mockResolvedValue([source]),
    loadSourceTemplates: jest.fn().mockResolvedValue(
      ['in_app', 'push', 'email'].map((channel) => ({
        id: `${channel}-template`,
        key: source.event_type,
        locale: 'en',
        channel,
        template_version: 1,
        subject: channel === 'email' ? 'Masarifi update' : null,
        body: 'A safe update is available.',
        enabled: channel !== 'email',
        quiet_hours: {},
      })),
    ),
    createNotificationFromSource: jest.fn().mockResolvedValue(true),
    expireNotifications: jest.fn().mockResolvedValue(0),
    expandCampaigns: jest.fn().mockResolvedValue(0),
    claimNotificationDeliveries: jest.fn().mockResolvedValue([]),
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
        })[key],
    ),
  };
  await new EngagementWorker(
    repository as unknown as EngagementRepository,
    {} as SupportStorage,
    {} as ClerkClientService,
    config as unknown as PlatformConfigService,
  ).runOnce();

  expect(repository.claimSourceEvents).toHaveBeenCalledWith(
    expect.arrayContaining(['planning.obligation_overdue']),
    100,
  );
  expect(repository.createNotificationFromSource).toHaveBeenCalledWith(
    source,
    expect.arrayContaining([
      expect.objectContaining({ channel: 'in_app', status: 'queued' }),
      expect.objectContaining({ channel: 'push', status: 'queued' }),
      expect.objectContaining({
        channel: 'email',
        status: 'suppressed',
        errorCode: 'PREFERENCE_DISABLED',
      }),
    ]),
  );
});
