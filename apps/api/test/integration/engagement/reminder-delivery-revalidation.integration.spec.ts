import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { SupportStorage } from '../../../src/engagement/support.storage';

function delivery(eventType: string) {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    claim_token: '30000000-0000-4000-8000-000000000001',
    user_id: 'user-1',
    channel: 'push',
    provider: 'push',
    attempt_count: 1,
    event_id: '10000000-0000-4000-8000-000000000001',
    event_type: eventType,
    title: 'Safe reminder',
    body_safe: 'Open Masarifi.',
    data: { cycleBaseline: '2026-09-01T00:00:00.000Z' },
    token_ciphertext: null,
    token_device_id: null,
    token_provider: null,
  } as const;
}

function workerFor(eventType: string, eligible: boolean) {
  const repository = {
    claimNotificationDeliveries: jest.fn().mockResolvedValue([delivery(eventType)]),
    reminderDeliveryEligible: jest.fn().mockResolvedValue(eligible),
    finishNotificationDelivery: jest.fn().mockResolvedValue(true),
  };
  const worker = new EngagementWorker(
    repository as unknown as EngagementRepository,
    {} as SupportStorage,
    {} as ClerkClientService,
    {
      getRequired: jest.fn((key: string) => ({
        MASARIFI_NOTIFICATION_BATCH_SIZE: 100,
        MASARIFI_ENGAGEMENT_PROVIDER_MODE: 'disabled',
        MASARIFI_NOTIFICATION_MAX_ATTEMPTS: 5,
      })[key]),
    } as unknown as PlatformConfigService,
  );
  return { repository, worker };
}

it.each([
  'reminder.app_inactive.3d',
  'reminder.financial_inactive.7d',
])('suppresses a stale %s push before provider dispatch', async (eventType) => {
  const { repository, worker } = workerFor(eventType, false);

  await worker.runJob('notification.dispatch');

  expect(repository.finishNotificationDelivery).toHaveBeenCalledWith(
    delivery(eventType).id,
    delivery(eventType).claim_token,
    'suppressed',
    'REMINDER_STALE',
  );
});

it('does not revalidate an ordinary transaction notification', async () => {
  const { repository, worker } = workerFor('transaction.created', false);

  await worker.runJob('notification.dispatch');

  expect(repository.reminderDeliveryEligible).not.toHaveBeenCalled();
  expect(repository.finishNotificationDelivery).toHaveBeenCalledWith(
    delivery('transaction.created').id,
    delivery('transaction.created').claim_token,
    'suppressed',
    'DELIVERY_DISABLED',
    undefined,
  );
});
