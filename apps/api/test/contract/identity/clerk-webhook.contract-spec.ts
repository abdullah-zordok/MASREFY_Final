import { createHmac } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkWebhookController } from '../../../src/identity/clerk-webhook.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

describe('Clerk webhook HTTP contract', () => {
  let app: INestApplication;
  const secretBytes = Buffer.alloc(32, 31);
  const signingSecret = ['whsec', secretBytes.toString('base64')].join('_');
  const repository = { receiveClerkWebhook: jest.fn().mockResolvedValue('inserted') };

  function signedHeaders(body: string, id: string, timestamp = Math.floor(Date.now() / 1000)) {
    const signature = createHmac('sha256', secretBytes)
      .update(`${id}.${String(timestamp)}.${body}`)
      .digest('base64');
    return {
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': `v1,${signature}`,
    };
  }

  beforeAll(async () => {
    const config = {
      get: jest.fn((key: string) => key === 'MASARIFI_HTTP_BODY_LIMIT_BYTES' ? 262_144 : undefined),
      getRequired: jest.fn().mockReturnValue(signingSecret),
    };
    const module = await Test.createTestingModule({
      controllers: [ClerkWebhookController],
      providers: [
        { provide: IdentityRepository, useValue: repository },
        { provide: PlatformConfigService, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    configureValidation(app as never, 262_144, ['/webhooks/clerk']);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => repository.receiveClerkWebhook.mockResolvedValue('inserted'));

  it('verifies exact signed bytes before a durable 202 receipt', async () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'user_fixture_a' } });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk')
      .set(signedHeaders(body, 'msg_fixture_a'))
      .set('content-type', 'application/json')
      .send(body)
      .expect(202, { accepted: true });
    expect(repository.receiveClerkWebhook).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'msg_fixture_a', eventType: 'user.created', payload: JSON.parse(body) as unknown,
    }));
  });

  it.each([
    ['missing signature', {}, 401],
    ['bad signature', { 'svix-id': 'msg_bad', 'svix-timestamp': '1', 'svix-signature': 'v1,bad' }, 401],
  ])('rejects %s without storing it', async (_name, headers, status) => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'user_fixture_a' } });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(headers).set('content-type', 'application/json').send(body).expect(status);
    expect(repository.receiveClerkWebhook).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed but stale timestamp', async () => {
    const body = JSON.stringify({ type: 'user.updated', data: { id: 'user_fixture_a' } });
    const stale = Math.floor(Date.now() / 1000) - 601;
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(signedHeaders(body, 'msg_stale', stale))
      .set('content-type', 'application/json').send(body).expect(401);
  });

  it('acknowledges a signed unsupported type without storage', async () => {
    const body = JSON.stringify({ type: 'session.created', data: { id: 'session_fixture_a' } });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(signedHeaders(body, 'msg_unsupported'))
      .set('content-type', 'application/json').send(body).expect(204);
    expect(repository.receiveClerkWebhook).not.toHaveBeenCalled();
  });

  it('validates the supported event schema only after signature verification', async () => {
    const body = JSON.stringify({ type: 'user.deleted', data: {} });
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(signedHeaders(body, 'msg_invalid_schema'))
      .set('content-type', 'application/json').send(body).expect(400);
    expect(response.body).toEqual(expect.objectContaining({ code: 'INVALID_WEBHOOK' }));
  });

  it('returns 202 for an identical duplicate and 409 for a hash conflict', async () => {
    const body = JSON.stringify({ type: 'user.updated', data: { id: 'user_fixture_a' } });
    repository.receiveClerkWebhook.mockResolvedValueOnce('duplicate');
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(signedHeaders(body, 'msg_duplicate'))
      .set('content-type', 'application/json').send(body).expect(202);
    repository.receiveClerkWebhook.mockResolvedValueOnce('conflict');
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set(signedHeaders(body, 'msg_conflict'))
      .set('content-type', 'application/json').send(body).expect(409);
  });

  it('rejects non-JSON content before signature handling', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk').set('content-type', 'text/plain').send('fixture').expect(415);
  });
});
