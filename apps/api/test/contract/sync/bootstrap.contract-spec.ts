import { normalizeBootstrapQuery } from '../../../src/sync/sync.dto';

describe('sync bootstrap contract', () => {
  it('defaults to domains with current-state bootstrap snapshots', () => {
    expect(normalizeBootstrapQuery({})).toEqual({
      domains: ['accounts', 'categories', 'transactions'],
      after: null,
      limit: 500,
    });
  });

  it('canonicalizes an explicit bootstrap-domain subset', () => {
    expect(normalizeBootstrapQuery({ domains: 'transactions,accounts' })).toEqual({
      domains: ['accounts', 'transactions'],
      after: null,
      limit: 500,
    });
  });

  it.each([{ domains: 'unknown' }, { domains: 'planning' }, { ownerId: 'spoof' }])(
    'rejects unsupported bootstrap query input %#',
    (query) => {
      expect(() => normalizeBootstrapQuery(query)).toThrow('VALIDATION_FAILED');
    },
  );
});
