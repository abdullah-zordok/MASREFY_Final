import { PoolService } from '../../../src/platform/database/pool.service';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { describeLiveDatabase } from '../../live-database';
import type { PoolClient } from 'pg';

describeLiveDatabase('identity RLS request context', () => {
  let pool: PoolService;
  let repository: IdentityRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => {
        if (key === 'DATABASE_URL') return process.env.DATABASE_URL;
        if (key === 'MASARIFI_DATABASE_POOL_MAX') return 1;
        throw new Error(`UNEXPECTED_CONFIG_KEY:${key}`);
      },
    } as never);
    repository = new IdentityRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_worker');
      await client.query(
        `insert into public.profiles (id, status) values
         ('integration_owner_1', 'active'),
         ('integration_owner_2', 'active'),
         ('integration_inactive', 'suspended')
         on conflict (id) do update set status = excluded.status`,
      );
      await client.query('commit');
    });
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `delete from public.profiles
         where id in ('integration_owner_1', 'integration_owner_2', 'integration_inactive')`,
      );
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  it('sets claims and the API role only for the customer transaction', async () => {
    const result = await repository.withCustomerTransaction(
      { userId: 'integration_owner_1', sessionId: 'integration_session_1', factorAgeSeconds: 60 },
      async (client: PoolClient) => {
        const value = await client.query<{
          role_name: string;
          subject: string;
          visible: string;
        }>(
          `select current_user as role_name,
                  public.current_clerk_user_id() as subject,
                  count(*)::text as visible
           from public.profiles`,
        );
        return value.rows[0];
      },
    );

    expect(result).toEqual({
      role_name: 'masarifi_api',
      subject: 'integration_owner_1',
      visible: '1',
    });
    const after = await pool.query<{ claims: string | null; role_name: string }>(
      `select nullif(current_setting('request.jwt.claims', true), '') as claims,
              current_user as role_name`,
    );
    expect(after.rows[0]).toEqual({ claims: null, role_name: 'postgres' });
  });

  it('isolates consecutive subjects on the same pooled connection', async () => {
    for (const userId of ['integration_owner_1', 'integration_owner_2']) {
      const visible = await repository.withCustomerTransaction(
        { userId, sessionId: `session_${userId}`, factorAgeSeconds: null },
        async (client: PoolClient) =>
          client.query<{ id: string }>('select id from public.profiles order by id'),
      );
      expect(visible.rows.map((row) => row.id)).toEqual([userId]);
    }
  });

  it('rolls back and resets the connection after handler failure', async () => {
    await expect(
      repository.withCustomerTransaction(
        { userId: 'integration_owner_1', sessionId: 'integration_session_1', factorAgeSeconds: 0 },
        async (client: PoolClient) => {
          await client.query("update public.profiles set display_name = 'Should Roll Back'");
          throw new Error('HANDLER_FAILURE');
        },
      ),
    ).rejects.toThrow('HANDLER_FAILURE');

    const row = await pool.query<{ display_name: string | null }>(
      "select display_name from public.profiles where id = 'integration_owner_1'",
    );
    expect(row.rows[0]?.display_name).toBeNull();
  });

  it.each(['integration_inactive', 'integration_missing'])(
    'denies unusable profile %s before domain handling',
    async (userId) => {
      await expect(
        repository.withCustomerTransaction(
          { userId, sessionId: 'integration_session', factorAgeSeconds: null },
          () => Promise.resolve('unreachable'),
        ),
      ).rejects.toThrow('PROFILE_INACTIVE');
    },
  );
});
