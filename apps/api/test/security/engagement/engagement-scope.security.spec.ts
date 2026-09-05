import {
  ENGAGEMENT_JOB_NAMES,
  ENGAGEMENT_SOURCE_EVENTS,
} from '../../../src/engagement/engagement.events';

describe('Phase 11 ownership boundary', () => {
  it('accepts current owner events and rejects future billing-shaped events', () => {
    expect(ENGAGEMENT_SOURCE_EVENTS.has('transaction.created')).toBe(true);
    expect(ENGAGEMENT_SOURCE_EVENTS.has('planning.obligation_overdue')).toBe(true);
    expect(ENGAGEMENT_SOURCE_EVENTS.has('subscription.renewed')).toBe(false);
    expect(ENGAGEMENT_SOURCE_EVENTS.has('billing.payment_failed')).toBe(false);
  });

  it('registers only the five owned jobs', () => {
    expect([...ENGAGEMENT_JOB_NAMES]).toEqual([
      'notification.dispatch',
      'notification.delivery.retry',
      'notification.campaign.expand',
      'notification.expire',
      'support-attachment.scan',
    ]);
    expect(ENGAGEMENT_JOB_NAMES.has('content.publish.schedule' as never)).toBe(false);
  });
});
