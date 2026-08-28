import { createHmac } from 'node:crypto';

import { PushTokenCrypto } from '../../../src/identity/push-token.crypto';

describe('push token protection', () => {
  const hashKey = Buffer.alloc(32, 1);
  const activeKey = Buffer.alloc(32, 2);
  const oldKey = Buffer.alloc(32, 3);
  const crypto = new PushTokenCrypto(hashKey, [
    { id: 'active', key: activeKey },
    { id: 'old', key: oldKey },
  ]);
  const aad = { provider: 'expo' as const, userId: 'user_fixture', deviceId: '0198f79d-98f3-7bb4-a820-f43bb4d0e17e' };

  it('uses domain-separated known-answer HMACs', () => {
    const fingerprintExpected = `h1:${createHmac('sha256', hashKey).update('fingerprint\0fixture').digest('hex')}`;
    const tokenExpected = `h1:${createHmac('sha256', hashKey).update('push-token\0fixture').digest('hex')}`;
    expect(crypto.fingerprint(' fixture ')).toBe(fingerprintExpected);
    expect(crypto.tokenHash('fixture')).toBe(tokenExpected);
    expect(fingerprintExpected).not.toBe(tokenExpected);
  });

  it('round trips with a random IV and exact AAD', () => {
    const first = crypto.encrypt('ExponentPushToken[fixture]', aad);
    const second = crypto.encrypt('ExponentPushToken[fixture]', aad);
    expect(first).not.toBe(second);
    expect(crypto.decrypt(first, aad)).toBe('ExponentPushToken[fixture]');
    expect(crypto.decrypt(second, aad)).toBe('ExponentPushToken[fixture]');
  });

  it.each([
    (value: string) => `${value.slice(0, -1)}A`,
    (value: string) => value.replace('.active.', '.missing.'),
  ])('fails closed for tampered or unknown-key envelopes', (tamper) => {
    const envelope = tamper(crypto.encrypt('private-push-value', aad));
    expect(() => crypto.decrypt(envelope, aad)).toThrow('PUSH_CRYPTO_INVALID');
  });

  it('fails closed for wrong AAD without leaking the token', () => {
    const envelope = crypto.encrypt('private-push-value', aad);
    try {
      crypto.decrypt(envelope, { ...aad, userId: 'another_owner' });
      throw new Error('EXPECTED_FAILURE');
    } catch (error) {
      expect(error).toEqual(new Error('PUSH_CRYPTO_INVALID'));
      expect(String(error)).not.toContain('private-push-value');
    }
  });

  it('decrypts an old key envelope after rotation', () => {
    const oldCrypto = new PushTokenCrypto(hashKey, [{ id: 'old', key: oldKey }]);
    const envelope = oldCrypto.encrypt('rotating-token', aad);
    expect(crypto.decrypt(envelope, aad)).toBe('rotating-token');
  });

  it('rejects invalid and duplicate key rings', () => {
    expect(() => new PushTokenCrypto(Buffer.alloc(31), [{ id: 'active', key: activeKey }]))
      .toThrow('PUSH_CRYPTO_CONFIG_INVALID');
    expect(() => new PushTokenCrypto(hashKey, [
      { id: 'active', key: activeKey }, { id: 'active', key: oldKey },
    ])).toThrow('PUSH_CRYPTO_CONFIG_INVALID');
    expect(() => new PushTokenCrypto(hashKey, [
      { id: 'active', key: activeKey }, { id: 'same', key: activeKey },
    ])).toThrow('PUSH_CRYPTO_CONFIG_INVALID');
  });
});
