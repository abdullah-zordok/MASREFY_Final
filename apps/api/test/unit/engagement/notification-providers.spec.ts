import {
  ApnsPushProvider,
  DeterministicNotificationProvider,
  ExpoPushProvider,
  NotificationEmailProvider,
  safePushPayload,
  type HttpTransport,
} from '../../../src/engagement/notification.providers';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';
import type { ClerkClientService } from '../../../src/identity/clerk-client.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import type { MailTransport } from '../../../src/reports/reports.smtp';

const input = {
  token: 'ExponentPushToken[test]',
  eventId: '10000000-0000-4000-8000-000000000001',
  title: 'Safe title',
  body: 'Safe body',
  route: 'notification_detail',
};

describe('notification providers', () => {
  it('builds an exact safe push payload without protected fields', () => {
    expect(safePushPayload(input)).toEqual({
      to: input.token,
      title: 'Safe title',
      body: 'Safe body',
      data: { eventId: input.eventId, route: 'notification_detail' },
    });
  });

  it.each([
    ['success', { status: 'accepted', providerRef: 'deterministic-accepted' }],
    ['retryable', { status: 'retryable', code: 'PROVIDER_TEMPORARY' }],
    ['terminal', { status: 'terminal', code: 'TOKEN_INVALID' }],
    ['ambiguous', { status: 'ambiguous', code: 'PROVIDER_ACCEPTANCE_UNKNOWN' }],
  ] as const)('returns the deterministic %s result', async (mode, expected) => {
    await expect(new DeterministicNotificationProvider(mode).send(input)).resolves.toEqual(
      expected,
    );
  });

  it('maps Expo HTTP responses without leaking tokens into results', async () => {
    const transport = jest
      .fn()
      .mockResolvedValue({ status: 200, json: { data: { status: 'ok', id: 'expo-id' } } });
    const result = await new ExpoPushProvider(transport, 'fixture-access-token').send(input);
    expect(result).toEqual({ status: 'accepted', providerRef: 'expo-id' });
    expect(JSON.stringify(result)).not.toContain(input.token);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://exp.host/--/api/v2/push/send',
        body: safePushPayload(input),
      }),
    );
  });

  it('sends APNs alerts without leaking credentials into payloads', async () => {
    let request: Parameters<HttpTransport>[0] | undefined;
    const transport: HttpTransport = (value) => {
      request = value;
      return Promise.resolve({ status: 200, json: {} });
    };
    const result = await new ApnsPushProvider(transport, 'team-key', 'com.masarifi.app').send(
      input,
    );
    expect(result).toEqual({ status: 'accepted', providerRef: input.eventId });
    expect(request?.headers['apns-topic']).toBe('com.masarifi.app');
    expect(request?.body).toEqual({
      aps: { alert: { title: input.title, body: input.body } },
      eventId: input.eventId,
      route: input.route,
    });
    expect(JSON.stringify(request?.body)).not.toContain('team-key');
  });

  it('reuses the TLS mail transport contract for notification email', async () => {
    let mail: Record<string, unknown> | undefined;
    const transport: MailTransport = {
      sendMail: (value) => {
        mail = value;
        return Promise.resolve({ accepted: ['user@example.com'] });
      },
    };
    const result = await new NotificationEmailProvider(transport, 'notice@masarifi.app').send(
      input.eventId,
      'user@example.com',
      'Hello',
      'Safe body',
    );
    expect(result).toEqual({
      status: 'accepted',
      providerRef: `<notification-${input.eventId}@masarifi.app>`,
    });
    expect(mail).toMatchObject({ attachments: undefined });
  });
});

test('provider circuit opens after repeated transient failures and resets on acceptance', () => {
  const worker = new EngagementWorker(
    {} as EngagementRepository,
    {} as SupportStorage,
    {} as ClerkClientService,
    {} as PlatformConfigService,
  );
  const circuit = worker as unknown as {
    recordProviderResult(
      provider: string,
      result: { status: 'retryable'; code: string } | { status: 'accepted'; providerRef: string },
      now: number,
    ): void;
    circuitOpen(provider: string, now: number): boolean;
  };
  for (let attempt = 0; attempt < 5; attempt += 1)
    circuit.recordProviderResult('fcm', { status: 'retryable', code: 'PROVIDER_TEMPORARY' }, 1_000);
  expect(circuit.circuitOpen('fcm', 1_001)).toBe(true);
  expect(circuit.circuitOpen('apns', 1_001)).toBe(false);
  circuit.recordProviderResult('fcm', { status: 'accepted', providerRef: 'message-1' }, 1_002);
  expect(circuit.circuitOpen('fcm', 1_003)).toBe(false);
});
