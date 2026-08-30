import { hashIdempotencyKey, hashNormalizedCommand } from '../../../src/ledger/idempotency';

describe('ledger idempotency hashing', () => {
  it('hashes a validated raw key without storing the key', () => {
    expect(hashIdempotencyKey('abcdefgh')).toBe(
      'sha256:9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
    );
  });

  it.each(['short', 'contains space', '!!!!!!!!', 'a'.repeat(129), 'line\nbreak'])(
    'rejects the invalid raw key %j',
    (key) => {
      expect(() => hashIdempotencyKey(key)).toThrow('IDEMPOTENCY_KEY_REQUIRED');
    },
  );

  it('hashes the fixed-key validated command JSON bytes', () => {
    expect(hashNormalizedCommand({ kind: 'income', amountMinor: 100 })).toBe(
      'sha256:92a97bc24d555844bcdebb62ae4ab8e105780d1f488888ae8b8a43adf0eb450b',
    );
  });

  it('hashes semantically identical nested objects independently of key order', () => {
    expect(
      hashNormalizedCommand({ name: 'Cash', metadata: { color: 'green', icon: 'wallet' } }),
    ).toBe(hashNormalizedCommand({ metadata: { icon: 'wallet', color: 'green' }, name: 'Cash' }));
  });

  it.each([null, [], { amountMinor: Number.NaN }, { amountMinor: undefined }])(
    'rejects a non-normalized command %j',
    (command) => {
      expect(() => hashNormalizedCommand(command as never)).toThrow('IDEMPOTENCY_REQUEST_INVALID');
    },
  );
});
