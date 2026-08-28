import { type ExecutionContext, type INestApplication, type Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../../../src/identity/clerk-auth.guard';
import { ClerkClientService } from '../../../src/identity/clerk-client.service';
import { IdentityController } from '../../../src/identity/identity.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { IdentityService } from '../../../src/identity/identity.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

describe('device HTTP contract', () => {
  let app: INestApplication;
  const deviceId = '4e971c69-210a-4c21-b535-5ad290d057df';
  const first = {
    id: deviceId,
    platform: 'android' as const,
    appVersion: '1.0.0',
    deviceName: 'Phone',
    trustedAt: null,
    lastSeenAt: new Date('2026-08-28T10:00:00.000Z'),
    revokedAt: null,
    clerkSessionId: 'session_fixture_a',
    createdAt: new Date('2026-08-28T09:00:00.000Z'),
    version: 1,
  };
  const second = {
    ...first,
    id: '6f84dc32-bc50-46a1-8fa7-4bf7dbeed2e1',
    clerkSessionId: 'session_fixture_b',
    lastSeenAt: new Date('2026-08-28T08:00:00.000Z'),
  };
  const repository = {
    listDevices: jest.fn().mockResolvedValue([first, second]),
    registerDevice: jest.fn()
      .mockResolvedValueOnce({ device: first, created: true, registrationResult: 'created' })
      .mockResolvedValue({ device: { ...first, version: 2 }, created: false, registrationResult: 'refreshed' }),
    revokeDevice: jest.fn().mockResolvedValue({ status: 'revoked', device: first, sessionId: first.clerkSessionId }),
    completeSessionRevoke: jest.fn().mockResolvedValue(undefined),
  };
  const clerk = { revokeSession: jest.fn().mockResolvedValue('revoked') };

  beforeAll(async () => {
    const guard = {
      canActivate: jest.fn((context: ExecutionContext) => {
        context.switchToHttp().getRequest<ClerkPrincipalRequest>().clerkPrincipal = {
          userId: 'user_fixture_a', sessionId: first.clerkSessionId, factorAgeSeconds: 30,
        };
        return true;
      }),
    };
    const config = { get: jest.fn().mockReturnValue(600) };
    const providers: Provider[] = [
      IdentityService,
      { provide: IdentityRepository, useValue: repository },
      { provide: ClerkClientService, useValue: clerk },
      { provide: PlatformConfigService, useValue: config },
    ];
    const module = await Test.createTestingModule({ controllers: [IdentityController], providers })
      .overrideGuard(ClerkAuthGuard)
      .useValue(guard)
      .compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    configureValidation(app as never, 50_000);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('lists a bounded cursor page without private device evidence', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/me/devices?limit=1')
      .expect(200);
    const body = response.body as { items: unknown[]; nextCursor: unknown };
    expect(body.items).toEqual([{
      id: deviceId,
      platform: 'android',
      appVersion: '1.0.0',
      deviceName: 'Phone',
      trusted: false,
      lastSeenAt: '2026-08-28T10:00:00.000Z',
      current: true,
      revokedAt: null,
      version: 1,
    }]);
    expect(body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(body)).not.toMatch(/fingerprint|session|token|cipher|hash/i);
  });

  it('rejects malformed cursors and limits', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/me/devices?cursor=e30&limit=101')
      .expect(400);
  });

  it('returns 201 for create and 200 for a natural retry', async () => {
    const body = {
      deviceFingerprint: 'device-fingerprint-fixture',
      platform: 'android',
      appVersion: '1.0.0',
      pushToken: 'push-token-fixture-value',
      pushProvider: 'fcm',
    };
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/me/devices/register')
      .set('Idempotency-Key', 'device-register-01')
      .send(body)
      .expect(201, { deviceId, registeredAt: '2026-08-28T09:00:00.000Z', version: 1 });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/me/devices/register')
      .set('Idempotency-Key', 'device-register-02')
      .send(body)
      .expect(200, { deviceId, registeredAt: '2026-08-28T09:00:00.000Z', version: 2 });
  });

  it('requires a complete push pair and an idempotency key', async () => {
    const body = {
      deviceFingerprint: 'device-fingerprint-fixture', platform: 'android', appVersion: '1.0.0',
      pushToken: 'push-token-fixture-value',
    };
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/me/devices/register').set('Idempotency-Key', 'device-register-03')
      .send(body).expect(400);
    delete (body as { pushToken?: string }).pushToken;
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/me/devices/register').send(body).expect(400);
  });

  it('revokes the linked provider session after the local commit', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .delete(`/api/v1/me/devices/${deviceId}`)
      .set('Idempotency-Key', 'device-revoke-01')
      .expect(204);
    expect(clerk.revokeSession).toHaveBeenCalledWith(first.clerkSessionId);
    expect(repository.completeSessionRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_fixture_a' }), deviceId, first.clerkSessionId,
    );
  });

  it('rejects a malformed device path before repository access', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .delete('/api/v1/me/devices/not-a-uuid')
      .set('Idempotency-Key', 'device-revoke-02')
      .expect(400);
  });
});
