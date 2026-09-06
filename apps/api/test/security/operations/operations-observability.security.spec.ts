import { parseOperationsReadQuery, safeRecord } from '../../../src/operations/operations.schemas';

describe('operations observability boundary', () => {
  it('accepts only fixed provider destinations and bounded labels', () => {
    for (const provider of ['database', 'storage', 'identity', 'ai', 'email', 'push'])
      expect(parseOperationsReadQuery('providers', { provider })).toMatchObject({ provider });
    expect(() =>
      parseOperationsReadQuery('providers', { provider: 'https://attacker.invalid' }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
  });

  it('rejects raw bodies, credentials, identifiers, and nested metadata', () => {
    for (const value of [
      { token: 'abc' },
      { summary: 'operator@example.test' },
      { summary: 'https://provider.invalid/raw' },
      { nested: { raw: 'response' } },
    ])
      expect(() => safeRecord(value)).toThrow('OPERATIONS_INPUT_INVALID');
  });
});
