import {
  assertMetricLabels,
  OPERATIONS_METRICS,
} from '../../../src/platform/observability/platform-metrics';
import {
  parsePageQuery,
  parseSeriesQuery,
  safeRecord,
} from '../../../src/operations/operations.schemas';

describe('operations payload and cardinality budgets', () => {
  it('keeps page, series, payload, and metric dimensions bounded', () => {
    expect(parsePageQuery({ limit: 100 })).toEqual({ limit: 100, cursor: null });
    expect(() => parsePageQuery({ limit: 101 })).toThrow('OPERATIONS_INPUT_INVALID');
    expect(
      parseSeriesQuery({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
        points: 720,
      }).points,
    ).toBe(720);
    expect(() => safeRecord({ summary: 'x'.repeat(501) })).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => {
      assertMetricLabels({ user_id: 'customer-1' });
    }).toThrow('METRIC_LABEL_INVALID');
    expect(new Set(Object.values(OPERATIONS_METRICS)).size).toBe(11);
    expect(JSON.stringify(OPERATIONS_METRICS)).not.toMatch(
      /user|session|request|correlation|run_id|attempt_id|resource_id/iu,
    );
  });
});
