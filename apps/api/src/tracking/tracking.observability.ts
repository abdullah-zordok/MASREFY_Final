import { recordPlatformMetric, TRACKING_METRICS } from '../platform/observability/platform-metrics';

const jobs = new Set(['import.parse', 'parser.corpus', 'raw.purge', 'tracking.reconcile']);
const sources = new Set(['sms', 'manual', 'file']);

export function recordTrackingJob(job: string, outcome: string, count = 1): void {
  if (
    !jobs.has(job) ||
    !['success', 'failure', 'empty'].includes(outcome) ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 1000
  )
    throw new Error('TRACKING_METRIC_INVALID');
  recordPlatformMetric(
    job === 'tracking.reconcile' ? TRACKING_METRICS.reconciliation : TRACKING_METRICS.job,
    count,
    { job, outcome },
  );
}

export function recordTrackingIntake(source: string, outcome: 'accepted' | 'rejected'): void {
  if (!sources.has(source)) throw new Error('TRACKING_METRIC_INVALID');
  recordPlatformMetric(TRACKING_METRICS.intake, 1, { source_type: source, outcome });
}

export function recordTrackingDuration(
  job: string,
  outcome: 'success' | 'failure',
  ms: number,
): void {
  if (!jobs.has(job) || !Number.isFinite(ms) || ms < 0) throw new Error('TRACKING_METRIC_INVALID');
  recordPlatformMetric(TRACKING_METRICS.duration, ms, { job, outcome });
}

export function recordTrackingConfidence(
  outcome: 'review' | 'accepted',
  basisPoints: number,
): void {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000)
    throw new Error('TRACKING_METRIC_INVALID');
  recordPlatformMetric(TRACKING_METRICS.confidence, basisPoints, { outcome });
}

export function recordTrackingOperational(
  metric: 'backlog' | 'oldestAge' | 'rawPurgeLag',
  job: 'import.parse' | 'review' | 'duplicate' | 'raw.purge',
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('TRACKING_METRIC_INVALID');
  recordPlatformMetric(TRACKING_METRICS[metric], value, { job });
}
