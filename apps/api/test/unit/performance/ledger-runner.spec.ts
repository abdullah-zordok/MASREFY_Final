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
});
