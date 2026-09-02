import { PLANNING_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';

const jobs = new Set([
  'planning.salary-cycle.generate',
  'planning.obligation-schedule.generate',
  'planning.payment-match.propose',
  'planning.overdue.mark',
  'planning.reminders.emit',
]);

export function recordPlanningJob(job: string, outcome: string): void {
  if (!jobs.has(job) || !['success', 'failure'].includes(outcome))
    throw new Error('PLANNING_METRIC_INVALID');
  recordPlatformMetric(PLANNING_METRICS.job, 1, { job, outcome });
}

export function recordPlanningReconciliation(outcome: string, count: number): void {
  if (
    !['clean', 'repaired', 'failure'].includes(outcome) ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 500
  )
    throw new Error('PLANNING_METRIC_INVALID');
  recordPlatformMetric(PLANNING_METRICS.reconciliation, count, { outcome });
}
