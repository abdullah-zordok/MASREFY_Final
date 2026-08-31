import { normalizeAckRequest, normalizeDeltaQuery } from '../../../src/sync/sync.dto';

describe('sync delta and ack contract', () => {
  it('bounds delta pages at 500 and accepts opaque cursors', () => {
    expect(normalizeDeltaQuery({ domain: 'transactions', cursor: 'opaque' })).toEqual({
      domain: 'transactions',
      cursor: 'opaque',
      limit: 500,
    });
    expect(() =>
      normalizeDeltaQuery({ domain: 'transactions', cursor: 'opaque', limit: 501 }),
    ).toThrow('VALIDATION_FAILED');
  });

  it('accepts only domain cursor and optional mutation acknowledgement', () => {
    expect(normalizeAckRequest({ domain: 'accounts', cursor: 'opaque' })).toEqual({
      domain: 'accounts',
      cursor: 'opaque',
      lastMutationId: null,
    });
    expect(() =>
      normalizeAckRequest({ domain: 'accounts', cursor: 'opaque', ownerId: 'spoof' }),
    ).toThrow('VALIDATION_FAILED');
  });
});
