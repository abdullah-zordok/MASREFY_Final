import {
  reminderSource,
  type ReminderCandidate,
} from '../../../src/engagement/engagement.reminders';

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    kind: 'app',
    userId: 'user-1',
    locale: 'en',
    timeZone: 'Asia/Riyadh',
    baselineAt: '2026-09-01T00:00:00.000Z',
    evaluatedAt: '2026-09-08T00:00:00.000Z',
    inactiveDays: 7,
    ...overrides,
  };
}

it.each([
  [3, 'reminder.app_inactive.3d'],
  [7, 'reminder.app_inactive.7d'],
  [30, 'reminder.app_inactive.7d'],
])('selects one inactivity stage at %i days', (inactiveDays, eventType) => {
  expect(reminderSource(candidate({ inactiveDays })).event_type).toBe(eventType);
});

it('maps financial inactivity to the tracking reminder', () => {
  expect(reminderSource(candidate({ kind: 'financial' }))).toMatchObject({
    event_type: 'reminder.financial_inactive.7d',
    target_kind: 'tracking',
  });
});

it('creates a stable source id for one cycle and a new id after reset', () => {
  const first = reminderSource(candidate()).source_event_id;
  expect(reminderSource(candidate()).source_event_id).toBe(first);
  expect(
    reminderSource(candidate({ baselineAt: '2026-09-02T00:00:00.000Z' })).source_event_id,
  ).not.toBe(first);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
});
