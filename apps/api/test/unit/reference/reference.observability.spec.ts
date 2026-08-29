import { readFileSync } from 'node:fs';

import {
  assertMetricLabels,
  recordPlatformMetric,
  REFERENCE_METRICS,
} from '../../../src/platform/observability/platform-metrics';

describe('reference observability', () => {
  it('uses only bounded operation and outcome labels', () => {
    const sink = jest.fn();
    recordPlatformMetric(
      REFERENCE_METRICS.operation,
      1,
      { operation: 'listCurrencies', outcome: 'success' },
      sink,
    );
    expect(sink).toHaveBeenCalledWith(REFERENCE_METRICS.operation, 1, {
      operation: 'listCurrencies',
      outcome: 'success',
    });
    expect(() => {
      assertMetricLabels({ user_id: 'customer_1' });
    }).toThrow('METRIC_LABEL_INVALID');
  });

  it('defines the route, cache, and duration signals used by Phase 04 alerts', () => {
    expect(Object.values(REFERENCE_METRICS)).toEqual([
      'masarifi_reference_operation_total',
      'masarifi_reference_operation_duration_ms',
      'masarifi_reference_cache_total',
      'masarifi_reference_result_count',
      'masarifi_reference_payload_bytes',
      'masarifi_reference_fx_age_seconds',
    ]);
    const alerts = readFileSync('docs/runbooks/platform-alerts.md', 'utf8');
    for (const metric of Object.values(REFERENCE_METRICS)) expect(alerts).toContain(metric);
    expect(alerts).toContain('reference-account-recovery.md');
  });
});
