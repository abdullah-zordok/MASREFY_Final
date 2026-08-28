import { createHmac } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';

import { ClerkWebhookController } from '../../../src/identity/clerk-webhook.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('signed Clerk webhook flow', () => {
  let app: INestApplication;
  let pool: PoolService;
  let repository: IdentityRepository;
  const secretBytes = Buffer.alloc(32, 51);
  const secret = ['whsec', secretBytes.toString('base64')].join('_');
  const subject = 'webhook_e2e_owner';
  const eventId = 'msg_webhook_e2e_owner';
  const subjects = [subject, 'webhook_e2e_conflict', 'webhook_e2e_ordered',
    'webhook_e2e_retry', 'webhook_e2e_reconciled'];
  const eventIds = [eventId, 'msg_webhook_e2e_conflict', 'msg_webhook_e2e_order_a',
    'msg_webhook_e2e_order_b', 'msg_webhook_e2e_retry', 'msg_webhook_e2e_retention'];

  function headers(body: string, deliveryId = eventId) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secretBytes)
      .update(`${deliveryId}.${String(timestamp)}.${body}`).digest('base64');
    return { 'svix-id': deliveryId, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` };
  }

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
    repository = new IdentityRepository(pool);
    const module = await Test.createTestingModule({
      controllers: [ClerkWebhookController],
      providers: [
        { provide: IdentityRepository, useValue: repository },
        { provide: PlatformConfigService, useValue: {
          get: jest.fn().mockReturnValue(262_144), getRequired: jest.fn().mockReturnValue(secret),
        } },
      ],
    }).compile();
    app = module.createNestApplication();
    configureValidation(app as never, 262_144, ['/webhooks/clerk']);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await asMigration(async (client) => {
      await client.query(`delete from private.outbox_events where payload->>'profileId'=any($1::text[])`, [subjects]);
      await client.query('delete from public.user_preferences where user_id=any($1::text[])', [subjects]);
      await client.query('delete from public.onboarding_progress where user_id=any($1::text[])', [subjects]);
      await client.query('delete from public.profiles where id=any($1::text[])', [subjects]);
      await client.query('delete from private.clerk_webhook_events where clerk_event_id=any($1::text[])', [eventIds]);
    });
    await pool.onModuleDestroy();
  });

  it('durably accepts a signed duplicate and produces one converged effect', async () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: subject } });
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).post('/webhooks/clerk').set(headers(body)).set('content-type', 'application/json').send(body).expect(202);
    await request(server).post('/webhooks/clerk').set(headers(body)).set('content-type', 'application/json').send(body).expect(202);
    await repository.processNextClerkWebhook(() => Promise.resolve({
      id: subject, primaryEmail: null, primaryPhone: null, displayName: null,
    }), 3);
    const evidence = await asMigration((client) => client.query<{ inbox: string; profiles: string; events: string }>(
      `select
        (select count(*) from private.clerk_webhook_events where clerk_event_id=$1)::text inbox,
        (select count(*) from public.profiles where id=$2)::text profiles,
        (select count(*) from private.outbox_events where event_type='profile.created' and payload->>'profileId'=$2)::text events`,
      [eventId, subject],
    ));
    expect(evidence.rows[0]).toEqual({ inbox: '1', profiles: '1', events: '1' });
  });

  it('rejects a signed delivery-ID conflict without duplicating durable evidence', async () => {
    const deliveryId = 'msg_webhook_e2e_conflict';
    const created = JSON.stringify({ type: 'user.created', data: { id: 'webhook_e2e_conflict' } });
    const deleted = JSON.stringify({ type: 'user.deleted', data: { id: 'webhook_e2e_conflict' } });
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).post('/webhooks/clerk').set(headers(created, deliveryId))
      .set('content-type', 'application/json').send(created).expect(202);
    await request(server).post('/webhooks/clerk').set(headers(deleted, deliveryId))
      .set('content-type', 'application/json').send(deleted).expect(409);
    await repository.processNextClerkWebhook(() => Promise.resolve(null), 3);
    const inbox = await asMigration((client) => client.query<{ count: string }>(
      'select count(*)::text as count from private.clerk_webhook_events where clerk_event_id=$1',
      [deliveryId],
    ));
    expect(inbox.rows[0]?.count).toBe('1');
  });

  it('converges out-of-order signed signals on current Clerk state and retries a crash', async () => {
    const orderedSubject = 'webhook_e2e_ordered';
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    for (const [deliveryId, type] of [
      ['msg_webhook_e2e_order_a', 'user.deleted'],
      ['msg_webhook_e2e_order_b', 'user.updated'],
    ] as const) {
      const body = JSON.stringify({ type, data: { id: orderedSubject } });
      await request(server).post('/webhooks/clerk').set(headers(body, deliveryId))
        .set('content-type', 'application/json').send(body).expect(202);
    }
    await repository.processNextClerkWebhook(() => Promise.resolve({
      id: orderedSubject, primaryEmail: null, primaryPhone: null, displayName: null,
    }), 3);
    await repository.processNextClerkWebhook(() => Promise.resolve(null), 3);

    const retrySubject = 'webhook_e2e_retry';
    const retryBody = JSON.stringify({ type: 'user.created', data: { id: retrySubject } });
    await request(server).post('/webhooks/clerk').set(headers(retryBody, 'msg_webhook_e2e_retry'))
      .set('content-type', 'application/json').send(retryBody).expect(202);
    await expect(repository.processNextClerkWebhook(
      () => Promise.reject(new Error('simulated crash')), 3,
    )).resolves.toMatchObject({ status: 'failed' });
    await expect(repository.processNextClerkWebhook(() => Promise.resolve({
      id: retrySubject, primaryEmail: null, primaryPhone: null, displayName: null,
    }), 3)).resolves.toMatchObject({ status: 'processed' });

    const profiles = await asMigration((client) => client.query<{
      id: string; status: string;
    }>('select id,status from public.profiles where id=any($1::text[]) order by id', [
      [orderedSubject, retrySubject],
    ]));
    expect(profiles.rows).toEqual([
      { id: orderedSubject, status: 'deletion_pending' },
      { id: retrySubject, status: 'active' },
    ]);
  });

  it('repairs a lost delivery through reconciliation and redacts terminal payload', async () => {
    const reconciledSubject = 'webhook_e2e_reconciled';
    await repository.synchronizeClerkIdentity({
      id: reconciledSubject, primaryEmail: null, primaryPhone: null, displayName: null,
    }, reconciledSubject);
    await asMigration((client) => client.query(
      `insert into private.clerk_webhook_events(
         clerk_event_id,event_type,signature_verified_at,payload_hash,payload,
         status,processed_at,created_at
       ) values($1,'user.updated',now(),$2,$3::jsonb,'processed',now(),now()-interval '8 days')`,
      ['msg_webhook_e2e_retention', 'a'.repeat(64), JSON.stringify({
        type: 'user.updated', data: { id: reconciledSubject },
      })],
    ));
    await expect(repository.redactClerkWebhookPayloads(100)).resolves.toBeGreaterThanOrEqual(1);
    const evidence = await asMigration((client) => client.query<{
      profiles: string; payload: Record<string, unknown>;
    }>(
      `select
         (select count(*) from public.profiles where id=$1)::text profiles,
         payload
       from private.clerk_webhook_events where clerk_event_id=$2`,
      [reconciledSubject, 'msg_webhook_e2e_retention'],
    ));
    expect(evidence.rows[0]).toEqual({ profiles: '1', payload: {} });
  });
});
