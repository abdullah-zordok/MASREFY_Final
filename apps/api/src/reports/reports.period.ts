export type ReportPeriod = 'monthly' | 'three_months' | 'half_year' | 'annual';

export interface ReportPeriodRange {
  kind: ReportPeriod;
  timezone: string;
  startDate: string;
  endDate: string;
  startInstant: Date;
  endExclusiveInstant: Date;
}

export interface ReportScheduleClock {
  frequency: ReportPeriod;
  timezone: string;
  nextRunAt: Date;
}

export interface ScheduleOccurrence {
  period: ReportPeriodRange;
  scheduledFor: Date;
  nextRunAt: Date;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const spans: Record<ReportPeriod, number> = {
  monthly: 1,
  three_months: 3,
  half_year: 6,
  annual: 12,
};

function formatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new Error('REPORT_TIMEZONE_INVALID');
  }
}

function partsAt(instant: Date | number, timezone: string): LocalParts {
  const values: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error('REPORT_TIMEZONE_INVALID');
  }
  return { year, month, day, hour, minute, second };
}

function localDate(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function localDateAt(instant: Date, timezone: string): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('REPORT_PERIOD_INVALID');
  return localDate(partsAt(instant, timezone));
}

function parseDate(value: string): Pick<LocalParts, 'year' | 'month' | 'day'> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('REPORT_PERIOD_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('REPORT_PERIOD_INVALID');
  }
  return { year, month, day };
}

function shiftMonth(value: string, months: number, day = 1): string {
  const source = parseDate(value);
  const monthStart = new Date(Date.UTC(source.year, source.month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return localDate({
    year: monthStart.getUTCFullYear(),
    month: monthStart.getUTCMonth() + 1,
    day: Math.min(day, lastDay),
  });
}

function addDays(value: string, days: number): string {
  const source = parseDate(value);
  const date = new Date(Date.UTC(source.year, source.month - 1, source.day + days));
  return localDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function tuple(parts: LocalParts): readonly number[] {
  return [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second];
}

function compare(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined || rightPart === undefined) throw new Error('REPORT_PERIOD_INVALID');
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

export function zonedDateTimeToInstant(
  date: string,
  time: string,
  timezone: string,
): Date {
  const day = parseDate(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) throw new Error('REPORT_PERIOD_INVALID');
  formatter(timezone);

  const target: LocalParts = { ...day, hour, minute, second: 0 };
  const targetUtc = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  const matches = new Set<number>();
  for (const sampleHours of [-12, -6, 0, 6, 12]) {
    const sample = targetUtc + sampleHours * 3_600_000;
    const local = partsAt(sample, timezone);
    const offset =
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
      sample;
    const candidate = targetUtc - offset;
    if (compare(tuple(partsAt(candidate, timezone)), tuple(target)) === 0) matches.add(candidate);
  }
  if (matches.size > 0) return new Date(Math.min(...matches));

  // A DST gap has no exact instant. Select the first valid local minute after it.
  for (let candidate = targetUtc - 14 * 3_600_000; candidate <= targetUtc + 14 * 3_600_000; candidate += 60_000) {
    if (compare(tuple(partsAt(candidate, timezone)), tuple(target)) >= 0) return new Date(candidate);
  }
  throw new Error('REPORT_TIMEZONE_INVALID');
}

export function resolveReportPeriod(
  kind: ReportPeriod,
  anchorDate: string,
  timezone: string,
): ReportPeriodRange {
  if (!(kind in spans)) throw new Error('REPORT_PERIOD_INVALID');
  parseDate(anchorDate);
  formatter(timezone);
  const startDate = shiftMonth(anchorDate, 1 - spans[kind]);
  const endDate = addDays(shiftMonth(anchorDate, 1), -1);
  return {
    kind,
    timezone,
    startDate,
    endDate,
    startInstant: zonedDateTimeToInstant(startDate, '00:00', timezone),
    endExclusiveInstant: zonedDateTimeToInstant(addDays(endDate, 1), '00:00', timezone),
  };
}

export function firstScheduleRun(
  frequency: ReportPeriod,
  timezone: string,
  after: Date,
): Date {
  if (!(frequency in spans)) throw new Error('REPORT_PERIOD_INVALID');
  const nextDate = shiftMonth(localDateAt(after, timezone), spans[frequency], 1);
  return zonedDateTimeToInstant(nextDate, '08:00', timezone);
}

export function nextScheduleOccurrence(
  schedule: ReportScheduleClock,
  after: Date,
): ScheduleOccurrence {
  if (
    !Number.isFinite(schedule.nextRunAt.getTime()) ||
    !Number.isFinite(after.getTime()) ||
    schedule.nextRunAt.getTime() > after.getTime()
  ) {
    throw new Error('REPORT_SCHEDULE_NOT_DUE');
  }
  const scheduled = partsAt(schedule.nextRunAt, schedule.timezone);
  const scheduledDate = localDate(scheduled);
  const nextDate = shiftMonth(scheduledDate, spans[schedule.frequency], scheduled.day);
  return {
    period: resolveReportPeriod(
      schedule.frequency,
      addDays(scheduledDate, -1),
      schedule.timezone,
    ),
    scheduledFor: new Date(schedule.nextRunAt),
    nextRunAt: zonedDateTimeToInstant(
      nextDate,
      `${String(scheduled.hour).padStart(2, '0')}:${String(scheduled.minute).padStart(2, '0')}`,
      schedule.timezone,
    ),
  };
}
