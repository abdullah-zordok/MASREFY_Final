import { buildTrackingEvent } from '../../../src/tracking/tracking.events';
import { recordTrackingJob } from '../../../src/tracking/tracking.observability';

describe('tracking telemetry boundaries', () => {
  it('allows only bounded redacted event fields and metric labels', () => {
    expect(
      buildTrackingEvent('import.session.changed.v1', {
        sessionId: '80000000-0000-4000-8000-000000000001',
        status: 'review',
      }),
    ).toEqual({ sessionId: '80000000-0000-4000-8000-000000000001', status: 'review' });
    expect(() => buildTrackingEvent('import.session.changed.v1', { rawPayload: 'secret' })).toThrow(
      'TRACKING_EVENT_INVALID',
    );
    expect(() => {
      recordTrackingJob('import.parse', 'success', 1001);
    }).toThrow('TRACKING_METRIC_INVALID');
  });

  it('loads bounded tracking alert and dashboard configuration', () => {
    const alerts = load(readFileSync('../../ops/observability/tracking-alerts.yaml', 'utf8')) as {
      groups: Array<{ rules: Array<{ alert: string; expr: string }> }>;
    };
    const dashboard = JSON.parse(
      readFileSync('../../ops/observability/tracking-dashboard.json', 'utf8'),
    ) as { panels: Array<{ targets: Array<{ expr: string }> }> };
    expect(alerts.groups.flatMap(({ rules }) => rules)).toHaveLength(6);
    expect(dashboard.panels).toHaveLength(6);
    expect(JSON.stringify({ alerts, dashboard })).not.toMatch(
      /user_id|session_id|item_id|merchant|sender|payload/i,
    );
  });
});
import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';
