import { OPERATIONS_ROUTES } from '../../../src/operations/operations.controller';

describe('operations incident contract', () => {
  it('guards incident and maintenance lifecycle mutations consistently', () => {
    const routes = OPERATIONS_ROUTES.filter(({ operation }) =>
      /Incident|Maintenance/u.test(operation),
    );
    expect(routes).toHaveLength(6);
    for (const route of routes.filter(({ method }) => method !== 'GET')) {
      expect(route.recentMfa).toBe(true);
      expect(route.permission).toMatch(/^operations\.(?:incidents|maintenance)\.manage$/u);
    }
  });
});
