import {
  firstScheduleRun,
  nextScheduleOccurrence,
  resolveReportPeriod,
  zonedDateTimeToInstant,
} from '../../../src/reports/reports.period';

describe('Phase 10 report periods', () => {
  it('selects the next deterministic 08:00 local boundary', () => {
    expect(firstScheduleRun('monthly', 'Asia/Riyadh', new Date('2026-09-04T00:00:00Z')).toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(firstScheduleRun('annual', 'UTC', new Date('2026-09-04T00:00:00Z')).toISOString()).toBe('2027-09-01T08:00:00.000Z');
  });
  it.each([
    ['monthly', '2026-08-01', '2026-08-31'],
    ['three_months', '2026-06-01', '2026-08-31'],
    ['half_year', '2026-03-01', '2026-08-31'],
    ['annual', '2025-09-01', '2026-08-31'],
  ] as const)('resolves the trailing %s calendar range', (kind, startDate, endDate) => {
    const range = resolveReportPeriod(kind, '2026-08-17', 'Asia/Riyadh');
    expect(range).toMatchObject({ kind, timezone: 'Asia/Riyadh', startDate, endDate });
    expect(range.endExclusiveInstant.getTime()).toBeGreaterThan(range.startInstant.getTime());
  });

  it('uses exact local midnight instants in a non-DST zone', () => {
    const range = resolveReportPeriod('monthly', '2026-08-17', 'Asia/Riyadh');
    expect(range.startInstant.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(range.endExclusiveInstant.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('chooses the first valid minute after a DST gap and the earlier fold instant', () => {
    expect(
      zonedDateTimeToInstant('2026-03-08', '02:30', 'America/New_York').toISOString(),
    ).toBe('2026-03-08T07:00:00.000Z');
    expect(
      zonedDateTimeToInstant('2026-11-01', '01:30', 'America/New_York').toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('advances only one due period so lag is recovered oldest first', () => {
    const occurrence = nextScheduleOccurrence(
      {
        frequency: 'monthly',
        timezone: 'Asia/Riyadh',
        nextRunAt: new Date('2026-01-31T21:00:00.000Z'),
      },
      new Date('2026-06-01T00:00:00.000Z'),
    );
    expect(occurrence.scheduledFor.toISOString()).toBe('2026-01-31T21:00:00.000Z');
    expect(occurrence.period).toMatchObject({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(occurrence.nextRunAt.toISOString()).toBe('2026-02-28T21:00:00.000Z');
  });

  it('rejects invalid dates, zones, and schedules that are not due', () => {
    expect(() => resolveReportPeriod('monthly', '2026-02-30', 'Asia/Riyadh')).toThrow(
      'REPORT_PERIOD_INVALID',
    );
    expect(() => resolveReportPeriod('monthly', '2026-02-01', 'Mars/Olympus')).toThrow(
      'REPORT_TIMEZONE_INVALID',
    );
    expect(() =>
      nextScheduleOccurrence(
        {
          frequency: 'monthly',
          timezone: 'UTC',
          nextRunAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        new Date('2026-09-01T00:00:00.000Z'),
      ),
    ).toThrow('REPORT_SCHEDULE_NOT_DUE');
  });
});
