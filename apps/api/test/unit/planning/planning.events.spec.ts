import { buildPlanningEvent, PLANNING_EVENT_NAMES } from '../../../src/planning/planning.events';

const base = {
  userId: 'user_7',
  requestId: 'request_7',
  budgetId: '70000000-0000-4000-8000-000000000001',
  aggregateVersion: 2,
  status: 'active',
  currencyCode: 'SAR',
};

describe('planning event safety', () => {
  it('owns the complete bounded event inventory and accepts safe invalidation fields', () => {
    expect(PLANNING_EVENT_NAMES).toHaveLength(32);
    expect(buildPlanningEvent('planning.budget_updated', base)).toEqual(base);
  });

  it.each([
    { ...base, amountMinor: '1000' },
    { ...base, name: 'September' },
    { ...base, notes: 'private' },
    { ...base, evidence: { reason: 'merchant' } },
    { ...base, budgetId: 'bad-id' },
    { ...base, aggregateVersion: -1 },
    { ...base, extra: true },
  ])('rejects sensitive, malformed, or unknown event payload %#', (payload) => {
    expect(() => buildPlanningEvent('planning.budget_updated', payload)).toThrow(
      'PLANNING_EVENT_INVALID',
    );
  });
});
