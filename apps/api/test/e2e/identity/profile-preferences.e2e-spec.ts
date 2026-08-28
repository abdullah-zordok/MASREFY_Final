import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';

import {
  ClerkAuthGuard,
  type ClerkPrincipal,
  type ClerkPrincipalRequest,
} from '../../../src/identity/clerk-auth.guard';
import { IdentityController } from '../../../src/identity/identity.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { IdentityService } from '../../../src/identity/identity.service';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('profile and preferences owner HTTP flow', () => {
  let app: INestApplication;
  let pool: PoolService;
  let active: ClerkPrincipal;
  const owner = { userId: 'profile_e2e_owner', sessionId: 'profile_e2e_owner_session', factorAgeSeconds: 30 };
  const other = { userId: 'profile_e2e_other', sessionId: 'profile_e2e_other_session', factorAgeSeconds: 30 };

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
    await asMigration(async (client) => {
      await client.query(
        `insert into public.profiles(id, display_name, status)
         values($1, 'Owner', 'active'), ($2, 'Other', 'active')`,
        [owner.userId, other.userId],
      );
      await client.query('insert into public.user_preferences(user_id) values($1), ($2)', [
        owner.userId,
        other.userId,
      ]);
    });
    const module = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        IdentityService,
        { provide: IdentityRepository, useValue: new IdentityRepository(pool) },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<ClerkPrincipalRequest>().clerkPrincipal = active;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    configureValidation(app as never, 50_000);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await asMigration(async (client) => {
      await client.query(
        `delete from private.outbox_events where payload->>'profileId' in ($1,$2)`,
        [owner.userId, other.userId],
      );
      await client.query('delete from public.user_preferences where user_id in ($1,$2)', [
        owner.userId,
        other.userId,
      ]);
      await client.query('delete from public.profiles where id in ($1,$2)', [
        owner.userId,
        other.userId,
      ]);
    });
    await pool.onModuleDestroy();
  });

  it('isolates two owners and rejects a stale profile update without partial state', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const initial = await request(server).get('/api/v1/me').expect(200);
    expect(initial.headers['x-request-id']).toBeDefined();
    expect(initial.body).toMatchObject({ id: owner.userId, displayName: 'Owner' });
    const initialVersion = (initial.body as { version: number }).version;

    const updated = await request(server)
      .patch('/api/v1/me')
      .set('Idempotency-Key', 'profile-e2e-update')
      .send({ displayName: 'Updated Owner', locale: 'en', expectedVersion: initialVersion })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: owner.userId,
      displayName: 'Updated Owner',
      locale: 'en',
      version: initialVersion + 1,
    });

    await request(server)
      .patch('/api/v1/me')
      .set('Idempotency-Key', 'profile-e2e-stale')
      .send({ displayName: 'Must Not Persist', expectedVersion: initialVersion })
      .expect(409);
    await request(server).get('/api/v1/me').expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        displayName: 'Updated Owner',
        version: initialVersion + 1,
      });
    });

    active = other;
    await request(server).get('/api/v1/me').expect(200).expect((response) => {
      expect(response.body).toMatchObject({ id: other.userId, displayName: 'Other' });
    });
  });

  it('fully replaces preferences and keeps the other owner unchanged', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    active = owner;
    const replacement = {
      defaultCurrency: 'EGP',
      language: 'en',
      theme: 'dark',
      calendar: 'hijri',
      weekStart: 0,
      privacySettings: { hideBalances: true },
      expectedVersion: 1,
    };
    await request(server)
      .put('/api/v1/me/preferences')
      .set('Idempotency-Key', 'preferences-e2e-replace')
      .send(replacement)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          defaultCurrency: 'EGP',
          language: 'en',
          theme: 'dark',
          calendar: 'hijri',
          weekStart: 0,
          privacySettings: { hideBalances: true },
          version: 2,
        });
      });
    await request(server)
      .put('/api/v1/me/preferences')
      .set('Idempotency-Key', 'preferences-e2e-stale')
      .send({ ...replacement, theme: 'light' })
      .expect(409);

    active = other;
    await request(server).get('/api/v1/me/preferences').expect(200).expect((response) => {
      expect(response.body).toMatchObject({ defaultCurrency: 'SAR', theme: 'system', version: 1 });
    });
  });
});
