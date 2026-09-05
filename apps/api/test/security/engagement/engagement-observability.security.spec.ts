import { EngagementObservability } from '../../../src/engagement/engagement.observability';
import type { MetricSink } from '../../../src/platform/observability/platform-metrics';

test('engagement metrics accept only fixed-cardinality labels and never payload fields', () => {
  const sink = jest.fn() as jest.MockedFunction<MetricSink>;
  const metrics = new EngagementObservability(sink);
  metrics.job('notification.delivery.retry', 'retry', 'push', 'fcm', 1, 12);
  expect(sink).toHaveBeenCalledWith('masarifi_engagement_job_total', 1, {
    job: 'notification.delivery.retry',
    outcome: 'retry',
    channel: 'push',
    provider: 'fcm',
  });
  expect(sink).toHaveBeenCalledWith('masarifi_engagement_job_duration_ms', 12, {
    job: 'notification.delivery.retry',
    outcome: 'retry',
    channel: 'push',
    provider: 'fcm',
  });
  metrics.backlog('notification.dispatch', 10);
  expect(() => {
    metrics.job('user-123', 'retry');
  }).toThrow('ENGAGEMENT_METRIC_LABEL_INVALID');
  expect(() => {
    metrics.job('notification.dispatch', 'token-secret');
  }).toThrow('ENGAGEMENT_METRIC_LABEL_INVALID');
  expect(() => {
    metrics.backlog('notification.dispatch', -1);
  }).toThrow('ENGAGEMENT_METRIC_LABEL_INVALID');
});
