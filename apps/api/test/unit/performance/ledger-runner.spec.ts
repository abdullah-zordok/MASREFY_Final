import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hasUnboundedLedgerPlan } from '../../performance/run-ledger';

describe('ledger performance plan guard', () => {
  it('rejects sequential scans of the large immutable fact tables', () => {
    expect(
      hasUnboundedLedgerPlan('"Node Type": "Seq Scan", "Relation Name": "transaction_postings"'),
    ).toBe(true);
  });

  it('allows planner-selected scans of bounded dimension tables', () => {
    expect(hasUnboundedLedgerPlan('"Node Type": "Seq Scan", "Relation Name": "accounts"')).toBe(
      false,
    );
  });

  it('isolates resource classes while enforcing the published write budgets', () => {
    const script = readFileSync(
      join(process.cwd(), 'test/performance/ledger.k6.js'),
      'utf8',
    ).replace(/\s+/g, ' ');
    expect(script).toContain(
      "mutations: { executor: 'constant-vus', vus: 5, duration: '30s', startTime: '30s'",
    );
    expect(script).toContain(
      "contention: { executor: 'constant-vus', vus: 8, duration: '30s', startTime: '60s'",
    );
    expect(script).toContain(
      "reconciliation: { executor: 'constant-vus', vus: 2, duration: '30s', startTime: '90s'",
    );
    expect(script).toContain("ledger_create_duration_ms: ['p(50)<150', 'p(95)<350', 'p(99)<800']");
    expect(script).toContain(
      "ledger_transfer_duration_ms: ['p(50)<200', 'p(95)<500', 'p(99)<1000']",
    );
  });
});
