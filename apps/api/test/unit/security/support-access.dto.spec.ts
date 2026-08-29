import {
  normalizeSupportScope,
  SUPPORT_ACTIONS,
  SUPPORT_RESOURCES,
} from '../../../src/security/privacy-handlers';

describe('support access boundary DTOs', () => {
  it('normalizes only registered resources/actions and removes duplicates', () => {
    expect(
      normalizeSupportScope([
        { resource: SUPPORT_RESOURCES[1], actions: [SUPPORT_ACTIONS[1], SUPPORT_ACTIONS[1]] },
        { resource: SUPPORT_RESOURCES[0], actions: [SUPPORT_ACTIONS[0]] },
      ]),
    ).toEqual(
      [
        { resource: SUPPORT_RESOURCES[1], actions: [SUPPORT_ACTIONS[1]] },
        { resource: SUPPORT_RESOURCES[0], actions: [SUPPORT_ACTIONS[0]] },
      ].sort((left, right) => left.resource.localeCompare(right.resource)),
    );
  });

  it.each([
    { resource: 'payments', actions: ['read-masked'] },
    { resource: 'account-status', actions: ['write'] },
    { resource: 'account-status', actions: [] },
  ])('rejects an unregistered or empty scope', (entry) => {
    expect(() => normalizeSupportScope([entry])).toThrow('SUPPORT_SCOPE_INVALID');
  });
});
