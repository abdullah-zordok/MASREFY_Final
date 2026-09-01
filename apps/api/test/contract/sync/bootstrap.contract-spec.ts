import { normalizeBootstrapQuery } from '../../../src/sync/sync.dto';

describe('sync bootstrap contract', () => {
  it('defaults to all domains and canonicalizes an explicit subset', () => {
    expect(normalizeBootstrapQuery({})).toEqual({
      domains: ['accounts', 'categories', 'planning', 'transactions'],
      after: null,
      limit: 500,
    });
    expect(normalizeBootstrapQuery({ domains: 'transactions,accounts' })).toEqual({
      domains: ['accounts', 'transactions'],
      after: null,
      limit: 500,
    });
  });

  it('rejects unknown domains and extra input', () => {
    expect(() => normalizeBootstrapQuery({ domains: 'unknown' })).toThrow('VALIDATION_FAILED');
    expect(() => normalizeBootstrapQuery({ ownerId: 'spoof' })).toThrow('VALIDATION_FAILED');
  });
});
