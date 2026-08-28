import { HttpException } from '@nestjs/common';

import { IdentityService } from '../../../src/identity/identity.service';
import { PushTokenCrypto } from '../../../src/identity/push-token.crypto';

describe('device and push exposure boundaries', () => {
  const principal = { userId: 'user_fixture_a', sessionId: 'session_fixture_a', factorAgeSeconds: 30 };

  it('returns only the public device projection', async () => {
    const repository = { listDevices: jest.fn().mockResolvedValue([{
      id: '4e971c69-210a-4c21-b535-5ad290d057df',
      platform: 'android', appVersion: '1.0.0', deviceName: null, trustedAt: null,
      lastSeenAt: new Date('2026-08-28T10:00:00.000Z'), revokedAt: null,
      clerkSessionId: principal.sessionId, createdAt: new Date(), version: 1,
    }]) };
    const response = await new IdentityService(repository as never).listDevices(principal, { limit: 50 });
    expect(response.items[0]).toEqual(expect.objectContaining({ current: true }));
    expect(JSON.stringify(response)).not.toMatch(/fingerprint|sessionId|push|token|cipher|hash/i);
  });

  it('maps provider details to one safe error after retaining local revocation', async () => {
    const repository = {
      revokeDevice: jest.fn().mockResolvedValue({
        status: 'revoked', sessionId: principal.sessionId, device: {},
      }),
      completeSessionRevoke: jest.fn(),
    };
    const clerk = { revokeSession: jest.fn().mockRejectedValue(new Error('CLERK_PROVIDER_UNAVAILABLE private detail')) };
    const promise = new IdentityService(repository as never, clerk as never).revokeDevice(
      principal, '4e971c69-210a-4c21-b535-5ad290d057df', 'device-revoke-01',
    );
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ response: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(repository.completeSessionRevoke).not.toHaveBeenCalled();
  });

  it('fails closed when ciphertext or AAD is changed', () => {
    const crypto = new PushTokenCrypto(Buffer.alloc(32, 1), [{ id: 'active', key: Buffer.alloc(32, 2) }]);
    const aad = {
      provider: 'fcm' as const,
      userId: principal.userId,
      deviceId: '4e971c69-210a-4c21-b535-5ad290d057df',
    };
    const envelope = crypto.encrypt('push-token-fixture-value', aad);
    expect(() => crypto.decrypt(`${envelope.slice(0, -1)}A`, aad)).toThrow('PUSH_CRYPTO_INVALID');
    expect(() => crypto.decrypt(envelope, { ...aad, provider: 'expo' })).toThrow('PUSH_CRYPTO_INVALID');
  });
});
