import type { PoolClient } from 'pg';

import type { ClerkPrincipal } from '../../../src/identity/clerk-auth.guard';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { PushTokenCrypto } from '../../../src/identity/push-token.crypto';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('device registration repository', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const owner: ClerkPrincipal = {
    userId: 'device_registration_owner', sessionId: 'device_registration_session_a', factorAgeSeconds: 30,
  };
  const other: ClerkPrincipal = {
    userId: 'device_registration_other', sessionId: 'device_registration_session_b', factorAgeSeconds: 30,
  };
  const registration = {
    deviceFingerprint: 'device-registration-fingerprint-a',
    platform: 'android' as const,
    appVersion: '1.0.0',
    deviceName: 'Fixture Phone',
    pushToken: 'device-registration-push-token-a',
    pushProvider: 'fcm' as const,
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
      new PushTokenCrypto(Buffer.alloc(32, 11), [{ id: 'active', key: Buffer.alloc(32, 12) }]),
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

  it('serializes an owner/fingerprint upsert race to one device', async () => {
    const results = await Promise.all([
      repository.registerDevice(owner, registration),
      repository.registerDevice(owner, registration),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.device.id)).size).toBe(1);
    const rows = await asMigration((client) => client.query<{ count: string }>(
      'select count(*) from public.user_devices where user_id = $1', [owner.userId],
    ));
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('rotates push tokens, protects stored values, and rejects cross-owner reuse', async () => {
    const rotated = await repository.registerDevice(owner, {
      ...registration, pushToken: 'device-registration-push-token-b',
    });
    const evidence = await asMigration((client) => client.query<{
      device_fingerprint: string;
      token_hash: string;
      token_ciphertext: string;
      revoked_at: Date | null;
    }>(
      `select d.device_fingerprint, p.token_hash, p.token_ciphertext, p.revoked_at
       from public.user_devices d join public.push_tokens p on p.device_id = d.id
       where d.id = $1 order by p.created_at`,
      [rotated.device.id],
    ));
    expect(evidence.rows).toHaveLength(2);
    expect(evidence.rows.filter((row) => row.revoked_at === null)).toHaveLength(1);
    expect(evidence.rows.every((row) => row.device_fingerprint.startsWith('h1:'))).toBe(true);
    expect(evidence.rows.every((row) => row.token_hash.startsWith('h1:'))).toBe(true);
    expect(JSON.stringify(evidence.rows)).not.toContain('device-registration-push-token');
    await expect(repository.registerDevice(other, {
      ...registration,
      deviceFingerprint: 'device-registration-fingerprint-other',
      pushToken: 'device-registration-push-token-b',
    })).rejects.toThrow('PUSH_TOKEN_CONFLICT');
  });

  it('reactivates only with a fresh linked session and pages deterministically', async () => {
    const current = await repository.registerDevice(owner, registration);
    await repository.revokeDevice(owner, current.device.id, true);
    await expect(repository.registerDevice(owner, registration)).rejects.toThrow('PUSH_TOKEN_CONFLICT');
    const fresh = { ...owner, sessionId: 'device_registration_session_fresh' };
    const reactivated = await repository.registerDevice(fresh, registration);
    expect(reactivated.registrationResult).toBe('reactivated_with_fresh_session');
    await repository.registerDevice(fresh, {
      ...registration,
      deviceFingerprint: 'device-registration-fingerprint-second',
      pushToken: undefined,
      pushProvider: undefined,
    });
    const firstPage = await repository.listDevices(fresh, null, 1);
    expect(firstPage).toHaveLength(2);
    const next = firstPage[0];
    if (!next) throw new Error('DEVICE_PAGE_FIXTURE_MISSING');
    const secondPage = await repository.listDevices(fresh, { lastSeenAt: next.lastSeenAt, id: next.id }, 1);
    expect(secondPage[0]?.id).not.toBe(next.id);
  });
});
