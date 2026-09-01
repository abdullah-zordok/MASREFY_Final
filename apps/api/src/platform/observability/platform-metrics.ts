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

export const SECURITY_METRICS = {
  permissionDecision: 'masarifi_security_permission_decision_total',
  permissionDuration: 'masarifi_security_permission_duration_ms',
  auditAppend: 'masarifi_security_audit_append_total',
  supportGrant: 'masarifi_security_support_grant_total',
  incident: 'masarifi_security_incident_total',
  privacyJob: 'masarifi_security_privacy_job_total',
  retentionJob: 'masarifi_security_retention_job_total',
  jobRun: 'masarifi_security_job_run_total',
  jobDuration: 'masarifi_security_job_duration_ms',
} as const;

export const REFERENCE_METRICS = {
  operation: 'masarifi_reference_operation_total',
  duration: 'masarifi_reference_operation_duration_ms',
  cache: 'masarifi_reference_cache_total',
  resultCount: 'masarifi_reference_result_count',
  payloadBytes: 'masarifi_reference_payload_bytes',
  fxAge: 'masarifi_reference_fx_age_seconds',
} as const;

export const LEDGER_METRICS = {
  command: 'masarifi_ledger_command_total',
  commandDuration: 'masarifi_ledger_command_duration_ms',
  read: 'masarifi_ledger_read_total',
  readDuration: 'masarifi_ledger_read_duration_ms',
  readResultCount: 'masarifi_ledger_read_result_count',
  payloadBytes: 'masarifi_ledger_payload_bytes',
  idempotency: 'masarifi_ledger_idempotency_total',
  idempotencyReplay: 'masarifi_ledger_idempotency_replay_total',
  conflict: 'masarifi_ledger_conflict_total',
  error: 'masarifi_ledger_error_total',
  rateLimitDenied: 'masarifi_ledger_rate_limit_denied_total',
  lockWaitDuration: 'masarifi_ledger_lock_wait_duration_ms',
  postingCount: 'masarifi_ledger_posting_count',
  touchedAccountCount: 'masarifi_ledger_touched_account_count',
  projectionUpdate: 'masarifi_ledger_projection_update_total',
  appendFailure: 'masarifi_ledger_append_failure_total',
  reconciliationChecked: 'masarifi_ledger_reconciliation_checked_total',
  reconciliationMismatch: 'masarifi_ledger_reconciliation_mismatch_total',
  reconciliationFailure: 'masarifi_ledger_reconciliation_failure_total',
  reconciliationRetry: 'masarifi_ledger_reconciliation_retry_total',
  reconciliationBatchSize: 'masarifi_ledger_reconciliation_batch_size',
  reconciliationAge: 'masarifi_ledger_reconciliation_age_seconds',
  reconciliationDuration: 'masarifi_ledger_reconciliation_duration_ms',
} as const;

export const SYNC_METRICS = {
  mutation: 'masarifi_sync_mutation_total',
  replay: 'masarifi_sync_replay_total',
  conflict: 'masarifi_sync_conflict_total',
  worker: 'masarifi_sync_worker_total',
  cursorLag: 'masarifi_sync_cursor_lag',
  retry: 'masarifi_sync_retry_total',
} as const;

export const PLANNING_METRICS = {
  job: 'masarifi_planning_job_total',
  reconciliation: 'masarifi_planning_reconciliation_total',
} as const;

type MetricName =
  | (typeof PLATFORM_METRICS)[keyof typeof PLATFORM_METRICS]
  | (typeof OUTBOX_METRICS)[keyof typeof OUTBOX_METRICS]
  | (typeof IDENTITY_METRICS)[keyof typeof IDENTITY_METRICS]
  | (typeof SECURITY_METRICS)[keyof typeof SECURITY_METRICS]
  | (typeof REFERENCE_METRICS)[keyof typeof REFERENCE_METRICS]
  | (typeof LEDGER_METRICS)[keyof typeof LEDGER_METRICS]
  | (typeof SYNC_METRICS)[keyof typeof SYNC_METRICS]
  | (typeof PLANNING_METRICS)[keyof typeof PLANNING_METRICS];
export type MetricSink = (name: MetricName, value: number, labels: Record<string, string>) => void;

const allowedLabels = new Set([
  'process_kind',
  'route',
  'method',
  'status_class',
  'dependency',
  'outcome',
  'operation',
  'scope',
  'reason',
  'permission',
  'severity',
  'job',
  'mismatch_kind',
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
  SECURITY_METRICS.permissionDecision,
  SECURITY_METRICS.auditAppend,
  SECURITY_METRICS.supportGrant,
  SECURITY_METRICS.incident,
  SECURITY_METRICS.privacyJob,
  SECURITY_METRICS.retentionJob,
  SECURITY_METRICS.jobRun,
  REFERENCE_METRICS.operation,
  REFERENCE_METRICS.cache,
  LEDGER_METRICS.command,
  LEDGER_METRICS.read,
  LEDGER_METRICS.idempotency,
  LEDGER_METRICS.idempotencyReplay,
  LEDGER_METRICS.conflict,
  LEDGER_METRICS.error,
  LEDGER_METRICS.rateLimitDenied,
  LEDGER_METRICS.projectionUpdate,
  LEDGER_METRICS.appendFailure,
  LEDGER_METRICS.reconciliationChecked,
  LEDGER_METRICS.reconciliationMismatch,
  LEDGER_METRICS.reconciliationFailure,
  LEDGER_METRICS.reconciliationRetry,
  SYNC_METRICS.mutation,
  SYNC_METRICS.replay,
  SYNC_METRICS.conflict,
  SYNC_METRICS.worker,
  SYNC_METRICS.retry,
  PLANNING_METRICS.job,
  PLANNING_METRICS.reconciliation,
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
