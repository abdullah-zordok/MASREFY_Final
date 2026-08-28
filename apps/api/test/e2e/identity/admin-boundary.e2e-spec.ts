import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { IdentityController } from '../../../src/identity/identity.controller';
import { IdentityService } from '../../../src/identity/identity.service';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Admin identity boundary E2E', () => {
  let app: INestApplication | undefined;
  let pool: PoolService;
  const owner = 'admin_e2e_owner';
  const other = 'admin_e2e_other';

  async function transaction<T>(role: 'masarifi_migration' | 'authenticated', action: (client: PoolClient) => Promise<T>) {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`set local role ${role}`);
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  beforeAll(async () => {
    pool = createLivePool();
    await transaction('masarifi_migration', async (client) => {
      await client.query('delete from public.user_devices where user_id in ($1,$2)', [owner, other]);
      await client.query('delete from public.profiles where id in ($1,$2)', [owner, other]);
      await client.query(
        `insert into public.profiles(id,status) values($1,'active'),($2,'active')`, [owner, other],
      );
      await client.query(
        `insert into public.user_devices(id,user_id,device_fingerprint,platform,app_version)
         values('0198f79d-98f3-7bb4-a820-f43bb4d0e190',$1,'h1:'||repeat('f',64),'web','1.0.0')`,
        [other],
      );
    });
    const module = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [{ provide: IdentityService, useValue: {} }],
    }).overrideGuard(ClerkAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await transaction('masarifi_migration', async (client) => {
      await client.query('delete from public.user_devices where user_id in ($1,$2)', [owner, other]);
      await client.query('delete from public.profiles where id in ($1,$2)', [owner, other]);
    });
    await pool.onModuleDestroy();
  });

  it('has no Admin route and simulated Admin claims cannot read another user', async () => {
    if (!app) throw new Error('ADMIN_E2E_APP_UNAVAILABLE');
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/admin/users').set('x-admin-role', 'super-admin').expect(404);
    const rows = await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`select set_config('request.jwt.claims',$1,true)`, [
          JSON.stringify({ sub: owner, role: 'super-admin' }),
        ]);
        await client.query('set local role authenticated');
        const result = await client.query<{ count: string }>(
          `select count(id)::text from public.user_devices
           where id='0198f79d-98f3-7bb4-a820-f43bb4d0e190'`,
        );
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
    expect(rows.rows[0]?.count).toBe('0');
  });
});
