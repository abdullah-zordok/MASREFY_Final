import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { ClerkPrincipal } from '../../../src/identity/clerk-auth.guard';
import { createLivePool, describeLiveDatabase } from '../../live-database';
import type { PoolService } from '../../../src/platform/database/pool.service';
import type { PoolClient } from 'pg';

describeLiveDatabase('profile and preferences repository', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const owner: ClerkPrincipal = {
    userId: 'profile_preferences_owner',
    sessionId: 'profile_preferences_session',
    factorAgeSeconds: 30,
  };

  async function asRole<T>(
    role: 'masarifi_worker' | 'masarifi_migration',
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`set local role ${role}`);
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
    repository = new IdentityRepository(pool);
    await asRole('masarifi_worker', (client) => client.query(`
        insert into public.profiles (id, primary_email, phone_e164, display_name, status)
        values ('profile_preferences_owner', 'owner@example.test', '+966500000012', 'Owner', 'active'),
               ('profile_preferences_other', null, null, 'Other', 'active');
        insert into public.user_preferences (user_id)
        values ('profile_preferences_owner'), ('profile_preferences_other');
      `));
  });

  afterAll(async () => {
    await asRole('masarifi_migration', (client) => client.query(`
        delete from private.outbox_events
        where aggregate_type = 'profile'
          and payload ->> 'profileId' in ('profile_preferences_owner', 'profile_preferences_other');
        delete from public.user_preferences
        where user_id in ('profile_preferences_owner', 'profile_preferences_other');
        delete from public.profiles
        where id in ('profile_preferences_owner', 'profile_preferences_other');
      `));
    await pool.onModuleDestroy();
  });

  it('reads and updates only the active owner with one conditional statement', async () => {
    const before = await repository.getProfile(owner);
    expect(before?.id).toBe(owner.userId);
    if (!before) throw new Error('PROFILE_FIXTURE_MISSING');
    const updated = await repository.updateProfile(owner, {
      displayName: 'Updated Owner',
      locale: 'en',
      expectedVersion: before.version,
    });
    expect(updated).toMatchObject({ id: owner.userId, displayName: 'Updated Owner', locale: 'en' });
    await expect(repository.updateProfile(owner, { locale: 'ar', expectedVersion: before.version }))
      .resolves.toBeNull();
  });

  it('fully replaces preferences and allows only one concurrent winner', async () => {
    const before = await repository.getPreferences(owner);
    const input = {
      defaultCurrency: 'EGP',
      language: 'en' as const,
      theme: 'dark' as const,
      calendar: 'hijri' as const,
      weekStart: 0,
      privacySettings: { hideBalances: true },
      expectedVersion: before.version,
    };
    const results = await Promise.all([
      repository.replacePreferences(owner, input),
      repository.replacePreferences(owner, { ...input, theme: 'light' as const }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    expect(await repository.getPreferences(owner)).toMatchObject({
      defaultCurrency: 'EGP',
      language: 'en',
      calendar: 'hijri',
      weekStart: 0,
      privacySettings: { hideBalances: true },
    });
  });

  it('enqueues one safe profile event and none for the stale retry', async () => {
    const events = await asRole(
      'masarifi_migration',
      (client) =>
        client.query<{ aggregate_id: string | null; payload: Record<string, unknown> }>(
          `select aggregate_id, payload from private.outbox_events
           where event_type = 'profile.updated' and payload ->> 'profileId' = $1`,
          [owner.userId],
        ),
    );
    expect(events.rows).toHaveLength(1);
    const event = events.rows[0];
    if (!event) throw new Error('PROFILE_EVENT_MISSING');
    expect(typeof event.payload.profileVersion).toBe('number');
    expect(event).toEqual({
      aggregate_id: null,
      payload: {
        payloadVersion: 1,
        profileId: owner.userId,
        profileVersion: event.payload.profileVersion,
        changedFields: ['display_name', 'locale'],
        source: 'customer_api',
        sourceEventId: null,
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/email|phone|session|token/i);
  });
});
