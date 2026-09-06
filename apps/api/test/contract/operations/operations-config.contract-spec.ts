import {
  parseFlagContext,
  parseOperationCommand,
} from '../../../src/operations/operations.schemas';

describe('operations configuration contract', () => {
  it('rejects security-control flags and forged evaluation attributes', () => {
    for (const key of ['auth.disable', 'billing.checkout', 'ledger.skip'])
      expect(() =>
        parseOperationCommand('createFeatureFlag', {
          key,
          description: 'This control must never be created.',
          defaultEnabled: false,
          reason: 'Security invariant test request.',
        }),
      ).toThrow();
    expect(() => parseFlagContext({ role: 'super-admin' })).toThrow('OPERATIONS_INPUT_INVALID');
  });
});
