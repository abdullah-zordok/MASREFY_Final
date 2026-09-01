jest.mock('../../../src/platform/observability/platform-metrics', () => ({
  PLANNING_METRICS: { job: 'planning_job', reconciliation: 'planning_reconciliation' },
  recordPlatformMetric: jest.fn(),
}));

import {
  recordPlanningJob,
  recordPlanningReconciliation,
} from '../../../src/planning/planning.observability';

describe('planning observability cardinality', () => {
  it('accepts only bounded job/outcome dimensions and counts', () => {
    expect(() => {
      recordPlanningJob('planning.overdue.mark', 'success');
    }).not.toThrow();
    expect(() => {
      recordPlanningReconciliation('clean', 0);
    }).not.toThrow();
    expect(() => {
      recordPlanningJob('user_70000000-0000-4000-8000-000000000001', 'success');
    }).toThrow('PLANNING_METRIC_INVALID');
    expect(() => {
      recordPlanningReconciliation('owner', 1);
    }).toThrow('PLANNING_METRIC_INVALID');
    expect(() => {
      recordPlanningReconciliation('repaired', 501);
    }).toThrow('PLANNING_METRIC_INVALID');
  });
});
