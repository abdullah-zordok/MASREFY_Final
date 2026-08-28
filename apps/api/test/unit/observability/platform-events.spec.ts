import { platformEvent } from '../../../src/platform/observability/platform-events';
import {
  assertMetricLabels,
  IDENTITY_METRICS,
  OUTBOX_METRICS,
  PLATFORM_METRICS,
  recordPlatformMetric,
} from '../../../src/platform/observability/platform-metrics';

describe('platform operational contracts', () => {
  it.each(['platform.started', 'platform.ready'] as const)('formats %s safely', (name) => {
    expect(
      platformEvent(name, {
        processKind: 'api',
        version: 'v1',
        state: 'ready',
      }),
    ).toEqual({
      schemaVersion: 1,
      name,
      processKind: 'api',
      version: 'v1',
      state: 'ready',
    });
  });

  it('rejects raw errors and environment data', () => {
    expect(() => platformEvent('platform.ready', { error: 'database secret' } as never)).toThrow(
      'PLATFORM_EVENT_FIELD_INVALID',
    );
  });

  it('allows only bounded metric labels', () => {
    expect(PLATFORM_METRICS.httpDuration).toBe('masarifi_http_request_duration_ms');
    expect(() => {
      assertMetricLabels({ process_kind: 'api', outcome: 'ok' });
    }).not.toThrow();
    expect(() => {
      assertMetricLabels({ user_id: 'user-1' });
    }).toThrow('METRIC_LABEL_INVALID');
    expect(() => {
      assertMetricLabels({ sql: 'select secret' });
    }).toThrow('METRIC_LABEL_INVALID');
    expect(() => {
      assertMetricLabels({ outcome: 'x'.repeat(129) });
    }).toThrow('METRIC_LABEL_INVALID');
  });

  it('defines and records every required outbox observation without payload labels', () => {
    expect(Object.values(OUTBOX_METRICS)).toEqual(
      expect.arrayContaining([
        'masarifi_outbox_depth',
        'masarifi_outbox_oldest_unpublished_age_seconds',
        'masarifi_outbox_claim_duration_ms',
        'masarifi_outbox_active_leases',
        'masarifi_outbox_lease_expired_total',
        'masarifi_outbox_retry_total',
        'masarifi_outbox_delivery_failed_total',
        'masarifi_outbox_published_total',
      ]),
    );
    const sink = jest.fn();
    for (const name of Object.values(OUTBOX_METRICS)) {
      recordPlatformMetric(name, 1, { outcome: 'ok' }, sink);
    }
    expect(sink).toHaveBeenCalledTimes(Object.keys(OUTBOX_METRICS).length);
    expect(() => {
      recordPlatformMetric(OUTBOX_METRICS.depth, 1, { payload: 'secret' }, sink);
    }).toThrow('METRIC_LABEL_INVALID');
  });

  it('keeps identity metrics bounded and rejects identity labels', () => {
    const sink = jest.fn();
    for (const name of Object.values(IDENTITY_METRICS)) {
      recordPlatformMetric(name, 1, { outcome: 'success' }, sink);
    }
    expect(sink).toHaveBeenCalledTimes(Object.keys(IDENTITY_METRICS).length);
    expect(() => {
      assertMetricLabels({ subject: 'user_fixture_a' });
    }).toThrow('METRIC_LABEL_INVALID');
    expect(() => {
      assertMetricLabels({ session_id: 'session_fixture_a' });
    }).toThrow('METRIC_LABEL_INVALID');
  });
});
