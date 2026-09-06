import { OPERATIONS_ROUTES } from '../../../src/operations/operations.controller';

describe('operations action contract', () => {
  it('requires exact manage permissions, recent MFA, and bounded action routes', () => {
    const mutations = OPERATIONS_ROUTES.filter(({ method }) => method !== 'GET');
    expect(mutations).toHaveLength(10);
    for (const route of mutations) {
      expect(route.permission).toMatch(/^operations\.[a-z]+\.(?:manage|read)$/u);
      expect(route.recentMfa).toBe(route.operation !== 'previewFeatureFlag');
      expect(route.path).not.toMatch(/execute|payload|command/iu);
    }
  });
});
