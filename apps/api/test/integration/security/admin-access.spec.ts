import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Admin access integration', () => {
  let pool: PoolService;
  beforeAll(() => {
    pool = createLivePool();
  });
  afterAll(async () => pool.onModuleDestroy());

  it('keeps the approved seven-role and 159-key authorization seed coherent', async () => {
    const result = await pool.query<{ roles: number; permissions: number; invalid: number }>(`select
      (select count(*)::int from public.roles where system_role) roles,
      (select count(*)::int from public.permissions) permissions,
      (select count(*)::int from public.role_permissions rp left join public.roles r on r.id=rp.role_id
        left join public.permissions p on p.id=rp.permission_id where r.id is null or p.id is null) invalid`);
    expect(result.rows[0]).toEqual({ roles: 7, permissions: 159, invalid: 0 });
  });
});
