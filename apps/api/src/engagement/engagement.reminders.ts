import { createHash } from 'node:crypto';

import type { SourceNotificationClaim } from './engagement.repository';

export interface ReminderCandidate {
  kind: 'app' | 'financial';
  userId: string;
  locale: 'ar' | 'en';
  timeZone: string;
  baselineAt: string;
  evaluatedAt: string;
  inactiveDays: number;
}

export function reminderSource(candidate: ReminderCandidate): SourceNotificationClaim {
  const eventType = candidate.kind === 'financial'
    ? 'reminder.financial_inactive.7d'
    : candidate.inactiveDays >= 7
      ? 'reminder.app_inactive.7d'
      : 'reminder.app_inactive.3d';
  return {
    source_event_id: stableUuid(`${candidate.userId}:${eventType}:${candidate.baselineAt}`),
    source_id: null,
    event_type: eventType,
    user_id: candidate.userId,
    locale: candidate.locale,
    time_zone: candidate.timeZone,
    occurred_at: candidate.evaluatedAt,
    expires_at: null,
    target_kind: candidate.kind === 'financial' ? 'tracking' : 'home',
    cycle_baseline: candidate.baselineAt,
  };
}

function stableUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
