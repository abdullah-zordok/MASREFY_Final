import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { SupportStorage } from '../../../src/engagement/support.storage';

it('ingests daily reminder candidates without dispatching a provider', async () => {
  const repository = {
    listReminderCandidates: jest.fn().mockResolvedValue([{
      kind: 'app',
      userId: 'user-1',
      locale: 'en',
      timeZone: 'Asia/Riyadh',
      baselineAt: '2026-09-01T00:00:00.000Z',
      evaluatedAt: '2026-09-05T00:00:00.000Z',
      inactiveDays: 4,
    }]),
    loadSourceTemplates: jest.fn().mockResolvedValue([
      {
        id: 'template-1',
        key: 'reminder.app_inactive.3d',
        locale: 'en',
        channel: 'in_app',
        template_version: 1,
        subject: 'How is your spending going?',
        body: 'Open Masarifi for a quick look.',
        enabled: true,
        quiet_hours: {},
      },
    ]),
    createNotificationFromSource: jest.fn().mockResolvedValue(true),
    claimNotificationDeliveries: jest.fn(),
  };
  const worker = new EngagementWorker(
    repository as unknown as EngagementRepository,
    {} as SupportStorage,
    {} as ClerkClientService,
    { getRequired: () => 100 } as unknown as PlatformConfigService,
  );

  await expect(worker.runJob('notification.reminders.evaluate')).resolves.toBe(1);

  expect(repository.loadSourceTemplates).toHaveBeenCalledWith(
    expect.objectContaining({ event_type: 'reminder.app_inactive.3d' }),
  );
  expect(repository.createNotificationFromSource).toHaveBeenCalledTimes(1);
  expect(repository.createNotificationFromSource).toHaveBeenCalledWith(
    expect.objectContaining({
      target_kind: 'home',
      cycle_baseline: '2026-09-01T00:00:00.000Z',
    }),
    expect.any(Array),
  );
  expect(repository.claimNotificationDeliveries).not.toHaveBeenCalled();
});
