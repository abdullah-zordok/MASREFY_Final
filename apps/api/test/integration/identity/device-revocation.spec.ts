import { HttpException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { ClerkPrincipal } from '../../../src/identity/clerk-auth.guard';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { IdentityService } from '../../../src/identity/identity.service';
import { PushTokenCrypto } from '../../../src/identity/push-token.crypto';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('device revocation', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const owner: ClerkPrincipal = {
    userId: 'device_revocation_owner', sessionId: 'device_revocation_session', factorAgeSeconds: 30,
  };
  const other: ClerkPrincipal = {
    userId: 'device_revocation_other', sessionId: 'device_revocation_other_session', factorAgeSeconds: 30,
  };
  const input = {
    deviceFingerprint: 'device-revocation-fingerprint', platform: 'ios' as const,
    appVersion: '1.0.0', pushToken: 'device-revocation-push-token', pushProvider: 'apns' as const,
  };

  async function asMigration<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        const value = await action(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  beforeAll(async () => {
    pool = createLivePool();
    repository = new IdentityRepository(
      pool,
      new PushTokenCrypto(Buffer.alloc(32, 21), [{ id: 'active', key: Buffer.alloc(32, 22) }]),
    );
    await asMigration((client) => client.query(
      `insert into public.profiles (id, status) values ($1, 'active'), ($2, 'active')`,
      [owner.userId, other.userId],
    ));
  });

  afterAll(async () => {
    await asMigration(async (client) => {
      await client.query(
        `delete from private.outbox_events
         where aggregate_type = 'device' and payload ->> 'profileId' in ($1, $2)`,
        [owner.userId, other.userId],
      );
      await client.query('delete from public.user_devices where user_id in ($1, $2)', [owner.userId, other.userId]);
      await client.query('delete from public.profiles where id in ($1, $2)', [owner.userId, other.userId]);
    });
    await pool.onModuleDestroy();
  });

  it('requires recent auth before changing the current device', async () => {
    const registered = await repository.registerDevice(owner, input);
    const stale = new IdentityService(repository, { revokeSession: jest.fn() } as never, {
      get: jest.fn().mockReturnValue(600),
    } as never);
    await expect(stale.revokeDevice(
      { ...owner, factorAgeSeconds: 601 }, registered.device.id, 'device-revoke-stale',
    )).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
    expect((await repository.listDevices(owner, null, 50))[0]?.revokedAt).toBeNull();
  });

  it('commits local denial before Clerk, survives outage, and retries naturally', async () => {
    const registered = await repository.registerDevice(owner, input);
    const clerk = { revokeSession: jest.fn().mockRejectedValueOnce(new Error('CLERK_PROVIDER_UNAVAILABLE'))
      .mockResolvedValue('revoked') };
    const service = new IdentityService(repository, clerk as never, { get: jest.fn().mockReturnValue(600) } as never);
    await expect(service.revokeDevice(owner, registered.device.id, 'device-revoke-outage'))
      .rejects.toMatchObject({ response: { code: 'PROVIDER_UNAVAILABLE' } });
    const denied = (await repository.listDevices(owner, null, 50))[0];
    expect(denied?.revokedAt).toBeInstanceOf(Date);
    expect(denied?.clerkSessionId).toBe(owner.sessionId);
    await service.revokeDevice({ ...owner, factorAgeSeconds: null }, registered.device.id, 'device-revoke-retry');
    const completed = (await repository.listDevices(owner, null, 50))[0];
    expect(completed?.revokedAt).toBeInstanceOf(Date);
    expect(completed?.clerkSessionId).toBeNull();
    await expect(service.revokeDevice(owner, registered.device.id, 'device-revoke-repeat')).resolves.toBeUndefined();
  });

  it('returns a non-owner-safe not found result', async () => {
    const registered = await repository.registerDevice(owner, {
      ...input, deviceFingerprint: 'device-revocation-fingerprint-other-case', pushToken: undefined, pushProvider: undefined,
    });
    const service = new IdentityService(repository);
    const promise = service.revokeDevice(other, registered.device.id, 'device-revoke-other');
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ response: { code: 'DEVICE_NOT_FOUND' } });
  });
});
