import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';

import { ClerkAuthGuard, type ClerkPrincipal, type ClerkPrincipalRequest } from '../../../src/identity/clerk-auth.guard';
import { ClerkClientService } from '../../../src/identity/clerk-client.service';
import { IdentityController } from '../../../src/identity/identity.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { IdentityService } from '../../../src/identity/identity.service';
import { PushTokenCrypto } from '../../../src/identity/push-token.crypto';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('device owner HTTP flow', () => {
  let app: INestApplication;
  let pool: PoolService;
  let active: ClerkPrincipal;
  const owner = { userId: 'device_e2e_owner', sessionId: 'device_e2e_session', factorAgeSeconds: 30 };
  const other = { userId: 'device_e2e_other', sessionId: 'device_e2e_other_session', factorAgeSeconds: 30 };

  async function asMigration<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
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
    active = owner;
    await asMigration((client) => client.query(
      `insert into public.profiles(id,status) values($1,'active'),($2,'active')`, [owner.userId, other.userId],
    ));
    const repository = new IdentityRepository(
      pool, new PushTokenCrypto(Buffer.alloc(32, 41), [{ id: 'active', key: Buffer.alloc(32, 42) }]),
    );
    const module = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        IdentityService,
        { provide: IdentityRepository, useValue: repository },
        { provide: ClerkClientService, useValue: { revokeSession: jest.fn().mockResolvedValue('revoked') } },
        { provide: PlatformConfigService, useValue: { get: jest.fn().mockReturnValue(600) } },
      ],
    }).overrideGuard(ClerkAuthGuard).useValue({
      canActivate: (context: ExecutionContext) => {
        context.switchToHttp().getRequest<ClerkPrincipalRequest>().clerkPrincipal = active;
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    configureValidation(app as never, 50_000);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await asMigration(async (client) => {
      await client.query(`delete from private.outbox_events where payload->>'profileId' in ($1,$2)`, [owner.userId, other.userId]);
      await client.query('delete from public.user_devices where user_id in ($1,$2)', [owner.userId, other.userId]);
      await client.query('delete from public.profiles where id in ($1,$2)', [owner.userId, other.userId]);
    });
    await pool.onModuleDestroy();
  });

  it('registers, lists, isolates, and revokes one owner device', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const registration = await request(server).post('/api/v1/me/devices/register')
      .set('Idempotency-Key', 'device-e2e-register')
      .send({ deviceFingerprint: 'device-e2e-fingerprint', platform: 'android', appVersion: '1.0.0' })
      .expect(201);
    const deviceId = (registration.body as { deviceId: string }).deviceId;
    await request(server).get('/api/v1/me/devices').expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          items: [expect.objectContaining({ id: deviceId, current: true })],
        }));
      });
    active = other;
    await request(server).delete(`/api/v1/me/devices/${deviceId}`)
      .set('Idempotency-Key', 'device-e2e-other').expect(404);
    active = owner;
    await request(server).delete(`/api/v1/me/devices/${deviceId}`)
      .set('Idempotency-Key', 'device-e2e-revoke').expect(204);
    await request(server).delete(`/api/v1/me/devices/${deviceId}`)
      .set('Idempotency-Key', 'device-e2e-repeat').expect(204);
  });
});
