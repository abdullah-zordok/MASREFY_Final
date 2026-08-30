import { readFileSync } from 'node:fs';

import {
  assertMetricLabels,
  LEDGER_METRICS,
  recordPlatformMetric,
} from '../../../src/platform/observability/platform-metrics';

describe('ledger observability', () => {
  const alerts = readFileSync('docs/runbooks/platform-alerts.md', 'utf8');
  const dashboard = readFileSync('docs/runbooks/platform-observability.md', 'utf8');
  it('records fixed low-cardinality ledger operation labels', () => {
    const sink = jest.fn();
    recordPlatformMetric(
      LEDGER_METRICS.command,
      1,
      { operation: 'create_transaction', outcome: 'success' },
      sink,
    );
    expect(sink).toHaveBeenCalledWith(LEDGER_METRICS.command, 1, {
      operation: 'create_transaction',
      outcome: 'success',
    });
  });

  it.each(['user_id', 'account_id', 'transaction_id', 'request_id', 'amount_minor'])(
    'rejects the high-cardinality or financial label %s',
    (label) => {
      expect(() => {
        assertMetricLabels({ [label]: 'sensitive' });
      }).toThrow('METRIC_LABEL_INVALID');
    },
  );

  it('publishes only the bounded Phase 05 metric names', () => {
    expect(Object.values(LEDGER_METRICS)).toEqual([
      'masarifi_ledger_command_total',
      'masarifi_ledger_command_duration_ms',
      'masarifi_ledger_read_total',
      'masarifi_ledger_read_duration_ms',
      'masarifi_ledger_read_result_count',
      'masarifi_ledger_payload_bytes',
      'masarifi_ledger_idempotency_total',
      'masarifi_ledger_idempotency_replay_total',
      'masarifi_ledger_conflict_total',
      'masarifi_ledger_error_total',
      'masarifi_ledger_rate_limit_denied_total',
      'masarifi_ledger_lock_wait_duration_ms',
      'masarifi_ledger_posting_count',
      'masarifi_ledger_touched_account_count',
      'masarifi_ledger_projection_update_total',
      'masarifi_ledger_append_failure_total',
      'masarifi_ledger_reconciliation_checked_total',
      'masarifi_ledger_reconciliation_mismatch_total',
      'masarifi_ledger_reconciliation_failure_total',
      'masarifi_ledger_reconciliation_retry_total',
      'masarifi_ledger_reconciliation_batch_size',
      'masarifi_ledger_reconciliation_age_seconds',
      'masarifi_ledger_reconciliation_duration_ms',
    ]);
  });

  it('binds every ledger metric to an owned alert or dashboard query and the recovery runbook', () => {
    for (const metric of Object.values(LEDGER_METRICS))
      expect(`${alerts}\n${dashboard}`).toContain(metric);
    for (const query of [
      'sum(rate(masarifi_ledger_command_total[5m])) by (operation,outcome)',
      'sum(rate(masarifi_ledger_read_total[5m])) by (operation,outcome)',
      'sum(rate(masarifi_ledger_idempotency_total[5m])) by (scope,outcome)',
      'histogram_quantile(0.95, sum(rate(masarifi_ledger_lock_wait_duration_ms_bucket[5m])) by (le,operation))',
      'sum(increase(masarifi_ledger_reconciliation_mismatch_total[5m])) by (mismatch_kind)',
      'sum(increase(masarifi_ledger_reconciliation_failure_total[15m]))',
      'histogram_quantile(0.95, sum(rate(masarifi_ledger_reconciliation_duration_ms_bucket[5m])) by (le))',
    ])
      expect(dashboard).toContain(query);
    expect(alerts).toContain('ledger-reconciliation-recovery.md');
    expect(alerts).toContain('critical, Backend');
  });
});
