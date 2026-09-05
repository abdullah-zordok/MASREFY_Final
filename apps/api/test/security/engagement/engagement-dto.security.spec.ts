import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import { ENGAGEMENT_SOURCE_EVENTS } from '../../../src/engagement/engagement.events';

const base = { requestId: 'request-1', idempotencyKey: 'idempotency-1' };

describe('engagement trust-boundary DTOs', () => {
  it.each([
    { operation: 'createFeedback', body: { type: 'bug', body: 'safe', status: 'resolved' } },
    {
      operation: 'actOnNotification',
      body: { actionKey: 'https://attacker.test', expectedVersion: 1 },
    },
    {
      operation: 'adminPreviewNotificationAudience',
      body: { platforms: ['ios'], sql: 'select 1' },
    },
    {
      operation: 'initializeSupportAttachment',
      params: { ticketId: '10000000-0000-4000-8000-000000000001' },
      body: {
        filename: '../secret.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
      },
    },
  ])(
    'rejects mass assignment, unsafe routes, audience injection, and hostile filenames',
    (input) => {
      expect(() => validateEngagementCommand({ ...base, ...input })).toThrow();
    },
  );

  it('accepts only a complete unique registered preference matrix', () => {
    const quietHours = {
      enabled: false,
      start: '22:00',
      end: '07:00',
      weekdays: [],
      timeZone: 'Asia/Riyadh',
    };
    const items = [...ENGAGEMENT_SOURCE_EVENTS].flatMap((eventType) =>
      ['in_app', 'push', 'email'].map((channel) => ({
        channel,
        eventType,
        enabled: true,
        quietHours,
      })),
    );
    expect(() =>
      validateEngagementCommand({
        ...base,
        operation: 'replaceNotificationPreferences',
        body: { items, version: 1, expectedVersion: 1 },
      }),
    ).not.toThrow();
    expect(() =>
      validateEngagementCommand({
        ...base,
        operation: 'replaceNotificationPreferences',
        body: { items: items.slice(1), version: 1, expectedVersion: 1 },
      }),
    ).toThrow();
  });

  it.each(['short', 'contains spaces', 'x'.repeat(129)])(
    'rejects an idempotency key outside the documented grammar',
    (idempotencyKey) => {
      expect(() =>
        validateEngagementCommand({
          ...base,
          idempotencyKey,
          operation: 'createFeedback',
          body: { type: 'bug', body: 'safe' },
        }),
      ).toThrow('IDEMPOTENCY_KEY_INVALID');
    },
  );
});
