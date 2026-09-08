import type { PoolService } from '../../../src/platform/database/pool.service';
import { SecurityRepository } from '../../../src/security/security.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Admin self-context integration', () => {
  const activeAdminId = 'integration_admin_self_active';
  const expiredAdminId = 'integration_admin_self_expired';
  const suspendedAdminId = 'integration_admin_self_suspended';
  const ids = [activeAdminId, expiredAdminId, suspendedAdminId];
  let pool: PoolService;
  let repository: SecurityRepository;

  beforeAll(async () => {
    pool = createLivePool();
    repository = new SecurityRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.profiles(id,status,display_name) values
          ($1,'active','Active self'),($2,'active','Expired self'),($3,'active','Suspended self')
        on conflict(id) do update set status='active',display_name=excluded.display_name`,
        ids,
      );
      await client.query(
        `insert into public.admin_profiles(user_id,status) values
          ($1,'active'),($2,'active'),($3,'suspended')
        on conflict(user_id) do update set status=excluded.status`,
        ids,
      );
      await client.query(
        `insert into public.admin_role_assignments(user_id,role_id,assigned_by,starts_at,ends_at,reason)
        select candidate.user_id,role.id,$1,candidate.starts_at,candidate.ends_at,'Integration self context role'
        from (values
          ($1::text,clock_timestamp()-interval '1 day',null::timestamptz),
          ($2::text,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'),
          ($3::text,clock_timestamp()-interval '1 day',null::timestamptz)
        ) candidate(user_id,starts_at,ends_at)
        cross join public.roles role where role.key='support-agent'`,
        ids,
      );
      await client.query('commit');
    });
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query('delete from public.admin_role_assignments where user_id=any($1)', [ids]);
      await client.query('delete from public.admin_profiles where user_id=any($1)', [ids]);
      await client.query('delete from public.profiles where id=any($1)', [ids]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  function getSelf(userId: string) {
    return repository.execute({
      operation: 'getAdminSelf',
      permission: 'admin.overview.read',
      principal: { userId, sessionId: `${userId}_session`, factorAgeSeconds: 0 },
      body: {},
      query: {},
      params: {},
      requestId: `${userId}_request`,
    });
  }

  it('returns only the caller active roles and effective permissions', async () => {
    const result = (await getSelf(activeAdminId)) as {
      id: string;
      displayName: string;
      roleKeys: string[];
      effectivePermissionKeys: string[];
    };
    expect(result).toMatchObject({
      id: activeAdminId,
      displayName: 'Active self',
      roleKeys: ['support-agent'],
    });
    expect(result.effectivePermissionKeys).toEqual(
      expect.arrayContaining(['admin.overview.read', 'users.read']),
    );
  });

  it.each([expiredAdminId, suspendedAdminId])(
    'denies %s when the Admin profile or role is not active',
    async (userId) => {
      await expect(getSelf(userId)).rejects.toMatchObject({ code: '42501' });
    },
  );
});
