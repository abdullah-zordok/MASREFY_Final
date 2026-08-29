import { PoolService } from '../../../src/platform/database/pool.service';
import { SecurityRepository } from '../../../src/security/security.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Admin exact permission transaction', () => {
  const adminId = 'integration_security_admin_role';
  const customerId = 'integration_security_customer';
  let pool: PoolService;
  let repository: SecurityRepository;

  beforeAll(async () => {
    pool = new PoolService({ get: (key: string) => key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2 } as never);
    repository = new SecurityRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query('insert into public.profiles(id,status) values($1,\'active\'),($2,\'active\') on conflict(id) do update set status=\'active\'', [adminId, customerId]);
      await client.query('insert into public.admin_profiles(user_id,status) values($1,\'active\') on conflict(user_id) do update set status=\'active\'', [adminId]);
      await client.query(`insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
        select $1,id,$1,'Integration exact permission assignment' from public.roles where key='security-administrator'
        on conflict(user_id,role_id) where revoked_at is null do nothing`, [adminId]);
      await client.query('commit');
    });
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query('delete from public.admin_role_assignments where user_id=$1', [adminId]);
      await client.query('delete from public.admin_profiles where user_id=$1', [adminId]);
      await client.query('delete from public.profiles where id=any($1)', [[adminId, customerId]]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  it('allows only the exact canonical key', async () => {
    const principal = { userId: adminId, sessionId: 'integration_session', factorAgeSeconds: 0 };
    await expect(repository.assertAdminPermission(principal, 'audit.read')).resolves.toBeUndefined();
    await expect(repository.assertAdminPermission(principal, 'audit.logs.read')).rejects.toMatchObject({ code: '42501' });
    await expect(repository.assertAdminPermission(principal, 'audit.*')).rejects.toMatchObject({ code: '42501' });
  });

  it('does not let a customer or an evaluator failure become an allow', async () => {
    await expect(repository.assertAdminPermission(
      { userId: customerId, sessionId: 'customer_session', factorAgeSeconds: 0 },
      'audit.read',
    )).rejects.toMatchObject({ code: '42501' });
    await expect(repository.assertAdminPermission(
      { userId: adminId, sessionId: 'integration_session', factorAgeSeconds: 0 },
      'not valid',
    )).rejects.toBeDefined();
  });

  it('removes permission immediately after assignment revoke', async () => {
    await pool.query('update public.admin_role_assignments set revoked_at=clock_timestamp() where user_id=$1', [adminId]);
    await expect(repository.assertAdminPermission(
      { userId: adminId, sessionId: 'integration_session', factorAgeSeconds: 0 },
      'audit.read',
    )).rejects.toMatchObject({ code: '42501' });
  });
});
