import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

export const PLATFORM_METRICS = {
  processStarted: 'masarifi_process_started_total',
  httpDuration: 'masarifi_http_request_duration_ms',
  databaseDuration: 'masarifi_database_query_duration_ms',
  readinessState: 'masarifi_readiness_state',
  shutdownDuration: 'masarifi_shutdown_duration_ms',
} as const;

export const OUTBOX_METRICS = {
  depth: 'masarifi_outbox_depth',
  oldestAge: 'masarifi_outbox_oldest_unpublished_age_seconds',
  claimDuration: 'masarifi_outbox_claim_duration_ms',
  claimBatchSize: 'masarifi_outbox_claim_batch_size',
  activeLeases: 'masarifi_outbox_active_leases',
  leaseExpired: 'masarifi_outbox_lease_expired_total',
  attempt: 'masarifi_outbox_attempt_count',
  publicationDuration: 'masarifi_outbox_publication_duration_ms',
  retry: 'masarifi_outbox_retry_total',
  deliveryFailed: 'masarifi_outbox_delivery_failed_total',
  published: 'masarifi_outbox_published_total',
} as const;

export const IDENTITY_METRICS = {
  auth: 'masarifi_identity_auth_total',
  webhookReceipt: 'masarifi_clerk_webhook_receipt_total',
  webhookProcess: 'masarifi_clerk_webhook_process_total',
  reconciliation: 'masarifi_clerk_reconciliation_count',
  redaction: 'masarifi_clerk_webhook_redaction_count',
  deviceSessionRetry: 'masarifi_device_session_retry_total',
} as const;

type MetricName =
  | (typeof PLATFORM_METRICS)[keyof typeof PLATFORM_METRICS]
  | (typeof OUTBOX_METRICS)[keyof typeof OUTBOX_METRICS]
  | (typeof IDENTITY_METRICS)[keyof typeof IDENTITY_METRICS];
export type MetricSink = (name: MetricName, value: number, labels: Record<string, string>) => void;

const allowedLabels = new Set([
  'process_kind',
  'route',
  'method',
  'status_class',
  'dependency',
  'outcome',
  'operation',
  'reason',
]);
const safeLabelValue = /^[A-Za-z0-9_./:-]{1,128}$/;
const counterNames = new Set<MetricName>([
  PLATFORM_METRICS.processStarted,
  OUTBOX_METRICS.leaseExpired,
  OUTBOX_METRICS.retry,
  OUTBOX_METRICS.deliveryFailed,
  OUTBOX_METRICS.published,
  IDENTITY_METRICS.auth,
  IDENTITY_METRICS.webhookReceipt,
  IDENTITY_METRICS.webhookProcess,
  IDENTITY_METRICS.deviceSessionRetry,
]);
const meter = metrics.getMeter('masarifi-platform');
const counters = new Map<MetricName, Counter>();
const histograms = new Map<MetricName, Histogram>();

export function assertMetricLabels(labels: Record<string, string>): void {
  if (
    Object.entries(labels).some(
      ([key, value]) => !allowedLabels.has(key) || !safeLabelValue.test(value),
    )
  ) {
    throw new Error('METRIC_LABEL_INVALID');
  }
}

const otelSink: MetricSink = (name, value, labels) => {
  if (counterNames.has(name)) {
    const counter = counters.get(name) ?? meter.createCounter(name);
    counters.set(name, counter);
    counter.add(value, labels);
    return;
  }
  const histogram = histograms.get(name) ?? meter.createHistogram(name);
  histograms.set(name, histogram);
  histogram.record(value, labels);
};

export function recordPlatformMetric(
  name: MetricName,
  value: number,
  labels: Record<string, string> = {},
  sink: MetricSink = otelSink,
): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('METRIC_VALUE_INVALID');
  assertMetricLabels(labels);
  sink(name, value, labels);
}
