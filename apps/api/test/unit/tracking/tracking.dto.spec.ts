import {
  decodeTrackingCursor,
  encodeTrackingCursor,
  normalizeAdminTrackingAction,
  normalizeNormalizedImport,
  normalizeTrackingId,
  normalizeTrackingList,
  normalizeTrackingOwnerFilters,
  normalizeVersion,
} from '../../../src/tracking/tracking.dto';

const id = '80000000-0000-4000-8000-000000000001';

describe('tracking DTO boundaries', () => {
  it('normalizes IDs, versions, cursors, lists, and one bounded event', () => {
    expect(normalizeTrackingId(id)).toBe(id);
    expect(normalizeVersion(2)).toBe(2);
    const cursor = encodeTrackingCursor({ at: '2026-09-02T00:00:00.000Z', id });
    expect(decodeTrackingCursor(cursor)).toEqual({ at: '2026-09-02T00:00:00.000Z', id });
    expect(normalizeTrackingList({ cursor, limit: '100' })).toEqual({ cursor, limit: 100 });
    expect(
      normalizeNormalizedImport({
        schemaVersion: 1,
        sourceType: 'sms',
        sourceChannel: 'android_sms',
        events: [
          { sourceItemKey: 'msg-1', receivedAt: '2026-09-02T00:00:00Z', body: 'Paid 12 SAR' },
        ],
      }).events,
    ).toHaveLength(1);
  });

  it('requires bounded Admin reason, expected version, and action', () => {
    expect(
      normalizeAdminTrackingAction({
        action: 'retry',
        reason: 'Operator verified transient failure',
        expectedVersion: 3,
      }),
    ).toEqual({
      action: 'retry',
      reason: 'Operator verified transient failure',
      expectedVersion: 3,
      patch: {},
    });
  });

  it('allows only resource-specific owner filters', () => {
    expect(
      normalizeTrackingOwnerFilters('duplicates', { status: 'proposed', minScore: '8500' }),
    ).toEqual({ status: 'proposed', minScore: 8500 });
    expect(() => normalizeTrackingOwnerFilters('history', { minScore: 1 })).toThrow(
      'VALIDATION_FAILED',
    );
    expect(() => normalizeTrackingOwnerFilters('duplicates', { minScore: 10001 })).toThrow(
      'VALIDATION_FAILED',
    );
  });

  it.each([
    () => normalizeTrackingId('fixture-id'),
    () => normalizeVersion(0),
    () => decodeTrackingCursor('not-a-cursor'),
    () => normalizeTrackingList({ limit: 101 }),
    () => normalizeTrackingList({ unexpected: true }),
    () => normalizeNormalizedImport({ schemaVersion: 1, sourceType: 'provider', events: [] }),
    () => normalizeNormalizedImport({ schemaVersion: 2, sourceType: 'sms', events: [] }),
    () =>
      normalizeNormalizedImport({
        schemaVersion: 1,
        sourceType: 'sms',
        events: Array(101).fill({}),
      }),
    () => normalizeAdminTrackingAction({ action: 'retry', reason: 'short', expectedVersion: 1 }),
    () =>
      normalizeAdminTrackingAction({
        action: 'retry',
        reason: 'Operator verified failure',
        expectedVersion: 1,
        userId: 'other',
      }),
  ])('rejects malformed, unbounded, privileged, or unknown input %#', (run) => {
    expect(run).toThrow('VALIDATION_FAILED');
  });
});
