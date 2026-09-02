import { hasUnboundedPlanningPlan } from '../../performance/run-planning';

describe('planning performance runner', () => {
  it('rejects an unbounded schedule scan but permits an optimizer-selected root scan', () => {
    expect(
      hasUnboundedPlanningPlan(
        '"Node Type": "Seq Scan", "Relation Name": "obligation_schedule_items"',
      ),
    ).toBe(true);
    expect(
      hasUnboundedPlanningPlan('"Node Type": "Seq Scan", "Relation Name": "obligations"'),
    ).toBe(false);
  });
});
