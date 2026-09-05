import { buildEngagementEvent } from '../../../src/engagement/engagement.events';

test('Realtime envelopes allow identifiers and state but reject payload-bearing field names', () => {
  expect(
    buildEngagementEvent('notification.read', {
      notificationId: '10000000-0000-4000-8000-000000000001',
      version: 2,
    }),
  ).toEqual(expect.objectContaining({ schemaVersion: 1 }));
  for (const field of ['body', 'note', 'token', 'filename', 'audience'])
    expect(() => buildEngagementEvent('notification.read', { [field]: 'secret' })).toThrow(
      'ENGAGEMENT_EVENT_INVALID',
    );
});
