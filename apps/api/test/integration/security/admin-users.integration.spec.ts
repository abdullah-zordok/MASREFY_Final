import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PoolService } from '../../../src/platform/database/pool.service';
import { SecurityRepository } from '../../../src/security/security.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describe('Admin projection implementation guard', () => {
  it('does not substitute literal session counts or eligible actions', () => {
    const repository = readFileSync(
      resolve(__dirname, '../../../src/security/security.repository.ts'),
      'utf8',
    );
    expect(repository).not.toContain('0 as "activeSessionCount"');
    expect(repository).not.toContain('\'{}\'::text[] as "eligibleActions"');
  });
});

describeLiveDatabase('Admin authoritative projections', () => {
  const superAdminId = 'integration_admin_projection_super';
  const readAdminId = 'integration_admin_projection_read';
  const targetAdminId = 'integration_admin_projection_target';
  const ids = [superAdminId, readAdminId, targetAdminId];
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
          ($1,'active','Projection super'),($2,'active','Projection reader'),($3,'active','Projection target')
        on conflict(id) do update set status='active',display_name=excluded.display_name`,
        ids,
      );
      await client.query(
        `insert into public.admin_profiles(user_id,status) values
          ($1,'active'),($2,'active'),($3,'active')
        on conflict(user_id) do update set status='active'`,
        ids,
      );
      await client.query(
        `insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
        select assignment.user_id,role.id,$1,'Integration authoritative projection'
        from (values ($1::text,'super-admin'),($2::text,'security-administrator'),($3::text,'support-agent')) assignment(user_id,role_key)
        join public.roles role on role.key=assignment.role_key`,
        ids,
      );
      await client.query(
        `insert into public.user_devices(user_id,device_fingerprint,clerk_session_id,platform,app_version,revoked_at) values
          ($3,'h1:'||repeat('1',64),'target_session_a','web','1.0.0',null),
          ($3,'h1:'||repeat('2',64),'target_session_a','web','1.0.0',null),
          ($3,'h1:'||repeat('3',64),'target_session_b','web','1.0.0',null),
          ($3,'h1:'||repeat('4',64),'target_session_c','web','1.0.0',clock_timestamp())`,
        ids,
      );
      await client.query('commit');
    });
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query('delete from public.user_devices where user_id=any($1)', [ids]);
      await client.query('delete from public.admin_role_assignments where user_id=any($1)', [ids]);
      await client.query('delete from public.admin_profiles where user_id=any($1)', [ids]);
      await client.query('delete from public.profiles where id=any($1)', [ids]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  function getAdmin(actorId: string) {
    return repository.execute({
      operation: 'getAdmin',
      permission: 'admin-team.read',
      principal: { userId: actorId, sessionId: `${actorId}_session`, factorAgeSeconds: 0 },
      body: {},
      query: {},
      params: { userId: targetAdminId },
      requestId: `${actorId}_request`,
    });
  }

  it('counts distinct active provider sessions and derives actions from exact actor permissions', async () => {
    await expect(getAdmin(superAdminId)).resolves.toMatchObject({
      id: targetAdminId,
      activeSessionCount: 2,
      eligibleActions: ['assign_roles', 'revoke_sessions', 'disable'],
    });
    await expect(getAdmin(readAdminId)).resolves.toMatchObject({
      id: targetAdminId,
      activeSessionCount: 2,
      eligibleActions: [],
    });
  });
});
