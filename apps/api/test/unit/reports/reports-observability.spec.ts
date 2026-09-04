import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';

import { recordReportBacklog, safeReportLog } from '../../../src/reports/reports.observability';

describe('report observability', () => {
  it('keeps labels fixed-cardinality and log fields free of user content', () => {
    expect(safeReportLog('report.email.deliver', 'failure', 'REPORT_SMTP_REJECTED')).toEqual({
      job: 'report.email.deliver',
      outcome: 'failure',
      errorCode: 'REPORT_SMTP_REJECTED',
    });
    expect(() => safeReportLog('report.owner@example.test', 'failure')).toThrow(
      'REPORT_LOG_INVALID',
    );
    expect(() => safeReportLog('report.generate', 'failure', 'secret=value')).toThrow(
      'REPORT_LOG_INVALID',
    );
    expect(() => {
      recordReportBacklog('report.generate', -1);
    }).toThrow('REPORT_METRIC_INVALID');
  });

  it('binds bounded dashboard panels and alerts to actionable runbooks', () => {
    const dashboard = JSON.parse(
      readFileSync('../../ops/observability/reports-dashboard.json', 'utf8'),
    ) as { panels: unknown[] };
    const alerts = load(readFileSync('../../ops/alerts/reports-alerts.yml', 'utf8')) as {
      groups: Array<{ rules: unknown[] }>;
    };
    expect(dashboard.panels).toHaveLength(4);
    expect(alerts.groups.flatMap((group) => group.rules)).toHaveLength(4);
    for (const path of ['reports-generation.md', 'reports-email.md', 'reports-schedules.md'])
      expect(readFileSync(`../../ops/runbooks/${path}`, 'utf8')).toMatch(/^# Report/m);
    expect(JSON.stringify({ dashboard, alerts })).not.toMatch(/userId|recipient|token|storageRef/);
  });
});
