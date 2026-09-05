import type { NotificationChannel } from './notification.renderer';

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  weekdays: readonly number[];
  timeZone: string;
}

type DeliveryDecision =
  | { outcome: 'deliver' }
  | { outcome: 'defer'; until: Date }
  | { outcome: 'suppress'; reason: 'disabled' | 'expired' | 'expires_in_quiet_hours' };

function localClock(at: Date, timeZone: string): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    throw new Error('NOTIFICATION_TIMEZONE_INVALID');
  }
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value('year'),
    month = value('month'),
    day = value('day');
  return {
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutes: value('hour') * 60 + value('minute'),
  };
}

function parseMinute(value: string): number {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match) throw new Error('NOTIFICATION_QUIET_HOURS_INVALID');
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isQuietAt(at: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled || quiet.weekdays.length === 0) return false;
  if (
    quiet.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(quiet.weekdays).size !== quiet.weekdays.length
  )
    throw new Error('NOTIFICATION_QUIET_HOURS_INVALID');
  const start = parseMinute(quiet.start),
    end = parseMinute(quiet.end);
  const local = localClock(at, quiet.timeZone);
  if (start === end) return quiet.weekdays.includes(local.weekday);
  if (start < end)
    return quiet.weekdays.includes(local.weekday) && local.minutes >= start && local.minutes < end;
  return (
    (quiet.weekdays.includes(local.weekday) && local.minutes >= start) ||
    (quiet.weekdays.includes((local.weekday + 6) % 7) && local.minutes < end)
  );
}

export function evaluateDelivery(input: {
  channel: NotificationChannel;
  enabled: boolean;
  quietHours?: QuietHours;
  now: Date;
  expiresAt?: Date;
  securityCritical?: boolean;
}): DeliveryDecision {
  if (input.expiresAt && input.expiresAt <= input.now)
    return { outcome: 'suppress', reason: 'expired' };
  if (input.channel === 'in_app' || input.securityCritical) return { outcome: 'deliver' };
  if (!input.enabled) return { outcome: 'suppress', reason: 'disabled' };
  if (!input.quietHours || !isQuietAt(input.now, input.quietHours)) return { outcome: 'deliver' };
  const until = new Date(input.now);
  until.setUTCSeconds(0, 0);
  for (let minute = 1; minute <= 8 * 24 * 60; minute += 1) {
    until.setTime(until.getTime() + 60_000);
    if (!isQuietAt(until, input.quietHours)) {
      return input.expiresAt && until >= input.expiresAt
        ? { outcome: 'suppress', reason: 'expires_in_quiet_hours' }
        : { outcome: 'defer', until: new Date(until) };
    }
  }
  return { outcome: 'suppress', reason: 'expires_in_quiet_hours' };
}
