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
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('onboarding owner HTTP flow', () => {
  let app: INestApplication;
  let pool: PoolService;
  let active: ClerkPrincipal;
  const owner = { userId: 'onboarding_e2e_owner', sessionId: 'onboarding_e2e_session', factorAgeSeconds: 20 };
  const other = { userId: 'onboarding_e2e_other', sessionId: 'onboarding_e2e_other_session', factorAgeSeconds: 20 };

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
        `insert into public.profiles(id,status) values($1,'active'),($2,'active')`,
        [owner.userId, other.userId],
      );
      await client.query('insert into public.onboarding_progress(user_id) values($1),($2)', [
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
    configureValidation(app as never, 50_000);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await asMigration(async (client) => {
      await client.query('delete from public.onboarding_progress where user_id in ($1,$2)', [
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

  it('creates, resumes, advances, retries, completes, and isolates owner state', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get('/api/v1/me/onboarding').expect(200, {
      step: 'welcome',
      completedSteps: [],
      completedAt: null,
      version: 1,
    });

    const advance = {
      step: 'permission_education',
      completedSteps: ['welcome', 'tracking_intro'],
      complete: false,
      expectedVersion: 1,
    };
    await request(server)
      .put('/api/v1/me/onboarding')
      .set('Idempotency-Key', 'onboarding-e2e-advance')
      .send(advance)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ step: advance.step, version: 2 });
      });
    await request(server)
      .put('/api/v1/me/onboarding')
      .set('Idempotency-Key', 'onboarding-e2e-retry')
      .send({ ...advance, expectedVersion: 2 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ step: advance.step, version: 2 });
      });

    const steps = [
      'welcome',
      'tracking_intro',
      'permission_education',
      'permission_request',
      'keywords',
      'preference',
      'demo',
      'platform_explanation',
      'capture_options',
      'optional_automation',
      'manual_voice_demo',
      'complete',
    ];
    await request(server)
      .put('/api/v1/me/onboarding')
      .set('Idempotency-Key', 'onboarding-e2e-complete')
      .send({ step: 'complete', completedSteps: steps, complete: true, expectedVersion: 2 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ step: 'complete', completedSteps: steps, version: 3 });
        expect((response.body as { completedAt: unknown }).completedAt).toEqual(expect.any(String));
      });

    active = other;
    await request(server).get('/api/v1/me/onboarding').expect(200, {
      step: 'welcome',
      completedSteps: [],
      completedAt: null,
      version: 1,
    });
  });
});
