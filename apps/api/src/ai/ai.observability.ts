import { AI_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';

export function recordAiResult(operation: string, outcome: string, durationMs: number): void {
  recordPlatformMetric(AI_METRICS.request, 1, { operation, outcome });
  recordPlatformMetric(AI_METRICS.duration, Math.max(0, durationMs), { operation, outcome });
}

export function recordAiJob(job: string, outcome: string): void {
  recordPlatformMetric(AI_METRICS.job, 1, { job, outcome });
}
