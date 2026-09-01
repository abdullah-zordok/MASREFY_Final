import {
  decodePlanningCursor,
  encodePlanningCursor,
  minorString,
  normalizeLifecycle,
  normalizeMinor,
  normalizePlanningDate,
  normalizePlanningId,
  normalizePlanningList,
  normalizePlanningPeriod,
  normalizeStringArray,
  normalizeVersionedPatch,
} from '../../../src/planning/planning.dto';

const id = '70000000-0000-4000-8000-000000000001';

describe('planning DTO primitives', () => {
  it('keeps UUIDs, dates, periods, versions, and exact bigint money canonical', () => {
    expect(normalizePlanningId(id)).toBe(id);
    expect(normalizePlanningDate('2026-09-01')).toBe('2026-09-01');
    expect(normalizePlanningPeriod('2026-09')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(normalizeMinor('9007199254740993', 'positive')).toBe(9007199254740993n);
    expect(normalizeMinor('-125', 'signed-nonzero')).toBe(-125n);
    expect(minorString(9007199254740993n)).toBe('9007199254740993');
  });

  it('round-trips one bounded opaque keyset cursor and normalizes list defaults', () => {
    const cursor = encodePlanningCursor({ at: '2026-09-01T00:00:00.000Z', id });
    expect(decodePlanningCursor(cursor)).toEqual({ at: '2026-09-01T00:00:00.000Z', id });
    expect(normalizePlanningList({ cursor, limit: '100' })).toEqual({ cursor, limit: 100 });
    expect(normalizePlanningList({})).toEqual({ cursor: null, limit: 25 });
  });

  it('allows only route-owned patch fields and separates expectedVersion', () => {
    expect(
      normalizeVersionedPatch({ expectedVersion: 3, name: '  September  ', status: 'paused' }, [
        'name',
        'status',
      ]),
    ).toEqual({ expectedVersion: 3, patch: { name: 'September', status: 'paused' } });
  });

  it('normalizes bounded unique arrays and explicit lifecycle allowlists', () => {
    expect(normalizeStringArray([' rent ', 'utilities'], 2, 20)).toEqual(['rent', 'utilities']);
    expect(normalizeLifecycle('paused', ['active', 'paused'] as const)).toBe('paused');
  });

  it.each([
    () => normalizePlanningId('not-a-uuid'),
    () => normalizePlanningDate('2026-02-30'),
    () => normalizePlanningPeriod('2026-13'),
    () => normalizeMinor('01', 'positive'),
    () => normalizeMinor('+1', 'positive'),
    () => normalizeMinor('0', 'positive'),
    () => normalizeMinor('-1', 'nonnegative'),
    () => normalizeMinor('0', 'signed-nonzero'),
    () => normalizeMinor(1, 'positive'),
    () => decodePlanningCursor('not-a-cursor'),
    () => normalizePlanningList({ limit: 101 }),
    () => normalizePlanningList({ surprise: true }),
    () => normalizeVersionedPatch({ expectedVersion: 1, userId: 'other' }, ['name']),
    () => normalizeVersionedPatch({ expectedVersion: 0, name: 'x' }, ['name']),
    () => normalizeVersionedPatch({ expectedVersion: 1 }, ['name']),
    () => normalizeVersionedPatch({ expectedVersion: 1, name: 'bad\u202etext' }, ['name']),
    () => normalizeStringArray(['same', 'same'], 2, 20),
    () => normalizeStringArray(['one', 'two', 'three'], 2, 20),
    () => normalizeLifecycle('deleted', ['active', 'paused'] as const),
  ])('rejects malformed, unsafe, unbounded, or mass-assigned input %#', (run) => {
    expect(run).toThrow('VALIDATION_FAILED');
  });
});
