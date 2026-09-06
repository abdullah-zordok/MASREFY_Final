import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

import { OPERATIONS_METRICS } from '../../../src/platform/observability/platform-metrics';

describe('operations observability assets', () => {
  const root = resolve(__dirname, '../../../../..');

  it('uses documented metrics and actionable runbook anchors', () => {
    const dashboard = JSON.parse(
      readFileSync(resolve(root, 'ops/observability/operations-dashboard.json'), 'utf8'),
    ) as { panels: Array<{ metric: string }> };
    const alerts = load(
      readFileSync(resolve(root, 'ops/alerts/operations-alerts.yml'), 'utf8'),
    ) as {
      groups: Array<{ rules: Array<{ expr: string; annotations: { runbook_url: string } }> }>;
    };
    const metrics = new Set(Object.values(OPERATIONS_METRICS));
    for (const panel of dashboard.panels) expect(metrics).toContain(panel.metric);
    for (const rule of alerts.groups.flatMap((group) => group.rules)) {
      expect([...metrics].some((metric) => rule.expr.includes(metric))).toBe(true);
      const anchor = rule.annotations.runbook_url.split('#')[1];
      expect(anchor).toBeTruthy();
      if (!anchor) throw new Error('RUNBOOK_ANCHOR_REQUIRED');
      expect(readFileSync(resolve(root, 'ops/runbooks/operations-triage.md'), 'utf8')).toContain(
        `id="${anchor}"`,
      );
      expect(rule.expr).toMatch(/^increase\(/u);
    }
    expect(JSON.stringify({ dashboard, alerts })).not.toMatch(
      /billing|stripe|subscription|payment|entitlement/iu,
    );
  });
});
