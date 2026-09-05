import { evaluateDelivery, isQuietAt } from '../../../src/engagement/notification.policy';

const quietHours = {
  enabled: true,
  start: '22:00',
  end: '07:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  timeZone: 'Asia/Riyadh',
};

describe('notification delivery policy', () => {
  it('never suppresses in-app and suppresses a disabled remote channel', () => {
    expect(
      evaluateDelivery({
        channel: 'in_app',
        enabled: false,
        now: new Date('2026-09-05T20:00:00Z'),
      }),
    ).toEqual({ outcome: 'deliver' });
    expect(
      evaluateDelivery({ channel: 'push', enabled: false, now: new Date('2026-09-05T20:00:00Z') }),
    ).toEqual({ outcome: 'suppress', reason: 'disabled' });
  });

  it('handles a midnight quiet interval in the configured IANA timezone', () => {
    expect(isQuietAt(new Date('2026-09-05T20:00:00Z'), quietHours)).toBe(true);
    expect(isQuietAt(new Date('2026-09-05T10:00:00Z'), quietHours)).toBe(false);
    expect(
      evaluateDelivery({
        channel: 'push',
        enabled: true,
        quietHours,
        now: new Date('2026-09-05T20:00:00Z'),
        expiresAt: new Date('2026-09-06T08:00:00Z'),
      }),
    ).toEqual({ outcome: 'defer', until: new Date('2026-09-06T04:00:00.000Z') });
  });

  it('fails closed for invalid zones and suppresses when deferral exceeds expiry', () => {
    expect(() => isQuietAt(new Date(), { ...quietHours, timeZone: 'Invalid/Zone' })).toThrow(
      'NOTIFICATION_TIMEZONE_INVALID',
    );
    expect(
      evaluateDelivery({
        channel: 'email',
        enabled: true,
        quietHours,
        now: new Date('2026-09-05T20:00:00Z'),
        expiresAt: new Date('2026-09-05T21:00:00Z'),
      }),
    ).toEqual({ outcome: 'suppress', reason: 'expires_in_quiet_hours' });
  });
});
