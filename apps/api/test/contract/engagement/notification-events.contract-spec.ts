import {
  buildEngagementEvent,
  ENGAGEMENT_SOURCE_EVENTS,
} from '../../../src/engagement/engagement.events';

describe('engagement event contracts', () => {
  it('publishes versioned ID-only safe metadata', () => {
    expect(
      buildEngagementEvent('notification.delivered', {
        notificationId: '10000000-0000-4000-8000-000000000001',
        channel: 'push',
      }),
    ).toEqual({
      type: 'notification.delivered',
      schemaVersion: 1,
      data: { notificationId: '10000000-0000-4000-8000-000000000001', channel: 'push' },
    });
    expect(() =>
      buildEngagementEvent('notification.delivered', { notificationId: 'id', body: 'private' }),
    ).toThrow('ENGAGEMENT_EVENT_INVALID');
    expect(() => buildEngagementEvent('billing.payment_failed', { billingId: 'id' })).toThrow(
      'ENGAGEMENT_EVENT_INVALID',
    );
  });

  it('does not register a future-owned event', () => {
    expect(ENGAGEMENT_SOURCE_EVENTS.has('subscription.renewed')).toBe(false);
  });

  it('routes credit-card due dates through the existing engagement source set', () => {
    expect(ENGAGEMENT_SOURCE_EVENTS.has('account.credit_card_payment_due')).toBe(true);
  });
});
