import { recordPlatformMetric, REPORT_METRICS } from '../platform/observability/platform-metrics';

const jobs = new Set(['report.generate', 'report.email.deliver', 'report.schedule.enqueue', 'report.output.expire']);
const outcomes = new Set(['success', 'failure', 'retry', 'empty', 'locked']);

export function recordReportJob(job: string, outcome: string, durationMs?: number): void {
  if (!jobs.has(job) || !outcomes.has(outcome) || (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0)))
    throw new Error('REPORT_METRIC_INVALID');
  recordPlatformMetric(REPORT_METRICS.job, 1, { job, outcome });
  if (durationMs !== undefined) recordPlatformMetric(REPORT_METRICS.duration, durationMs, { job, outcome });
}

export function recordReportBytes(job: 'report.generate', bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('REPORT_METRIC_INVALID');
  recordPlatformMetric(REPORT_METRICS.bytes, bytes, { job });
}

export function recordReportBacklog(job: string, count: number): void {
  if (!jobs.has(job) || !Number.isSafeInteger(count) || count < 0) throw new Error('REPORT_METRIC_INVALID');
  recordPlatformMetric(REPORT_METRICS.backlog, count, { job });
}

export function safeReportLog(job: string, outcome: string, errorCode?: string): Record<string, string> {
  if (!jobs.has(job) || !outcomes.has(outcome) || (errorCode !== undefined && !/^[A-Z][A-Z0-9_]{1,79}$/.test(errorCode)))
    throw new Error('REPORT_LOG_INVALID');
  return { job, outcome, ...(errorCode ? { errorCode } : {}) };
}
