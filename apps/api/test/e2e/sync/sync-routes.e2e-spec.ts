import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { encodeSyncCursor } from '../../../src/sync/sync.codec';
import { SyncController } from '../../../src/sync/sync.controller';
import { SyncHandlers } from '../../../src/sync/sync.handlers';
import { SyncRepository } from '../../../src/sync/sync.repository';
import { SyncService } from '../../../src/sync/sync.service';

describe('sync delta, ack, and conflict HTTP routes', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const deviceId = '63000000-0000-4000-8000-000000000009';
  const principal = { userId: 'owner-one', sessionId: 'session', factorAgeSeconds: 30 };
  const cursorScope = { userId: principal.userId, deviceId };
  const cursorKey = Buffer.alloc(32, 1).toString('base64url');
  const conflict = {
    id: '73000000-0000-4000-8000-000000000001',
    transactionId: '73000000-0000-4000-8000-000000000002',
    clientMutationId: '73000000-0000-4000-8000-000000000003',
    serverVersion: 2,
    clientVersion: 1,
    conflictFields: ['title'],
    serverSnapshot: { title: 'Server' },
    clientSnapshot: { title: 'Client' },
    status: 'open',
    resolution: null,
    resolutionPayload: null,
    createdAt: '2026-08-31T00:00:00.000Z',
    resolvedAt: null,
  } as const;
  const repository = {
    assertActiveDevice: jest.fn(),
    recordIssuedCursor: jest.fn(),
    delta: jest.fn().mockResolvedValue({ oldest: 0n, current: 0n, changes: [] }),
    acknowledge: jest.fn().mockResolvedValue({
      position: 0n,
      acknowledgedAt: '2026-08-31T00:00:00.000Z',
    }),
    listConflicts: jest.fn().mockResolvedValue([]),
    getConflict: jest.fn().mockResolvedValue(conflict),
    resolveConflict: jest.fn().mockResolvedValue({
      ...conflict,
      status: 'resolved',
      resolution: 'server',
      resolvedAt: '2026-08-31T00:01:00.000Z',
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        SyncService,
        { provide: SyncRepository, useValue: repository },
        {
          provide: PlatformConfigService,
          useValue: {
            getRequired: (name: string) =>
              name === 'MASARIFI_PUSH_TOKEN_HASH_KEY' ? cursorKey : 524_288,
          },
        },
        { provide: SyncHandlers, useValue: { dispatch: jest.fn() } },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          Object.assign(context.switchToHttp().getRequest<object>(), {
            clerkPrincipal: principal,
            requestId: 'request',
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(() => app.close());

  it('registers every owner-scoped read/ack route', async () => {
    const cursor = encodeURIComponent(
      encodeSyncCursor({ domain: 'accounts', position: 0n }, cursorScope, cursorKey),
    );
    await request(server)
      .get(`/api/v1/sync/delta?domain=accounts&cursor=${cursor}`)
      .set('X-Device-Id', deviceId)
      .expect(200);
    await request(server)
      .post('/api/v1/sync/ack')
      .set('X-Device-Id', deviceId)
      .send({ domain: 'accounts', cursor: decodeURIComponent(cursor) })
      .expect(200);
    await request(server).get('/api/v1/conflicts').set('X-Device-Id', deviceId).expect(200);
    await request(server)
      .get('/api/v1/conflicts/73000000-0000-4000-8000-000000000001')
      .set('X-Device-Id', deviceId)
      .expect(200);
  });

  it('rejects owner input at the idempotent resolution boundary', async () => {
    const response = await request(server)
      .patch('/api/v1/conflicts/73000000-0000-4000-8000-000000000001')
      .set('X-Device-Id', deviceId)
      .set('Idempotency-Key', 'resolution-key')
      .send({ resolution: 'server', ownerId: 'other-owner' })
      .expect(400);
    expect(JSON.parse(response.text) as unknown).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await request(server)
      .patch('/api/v1/conflicts/73000000-0000-4000-8000-000000000001')
      .set('X-Device-Id', deviceId)
      .set('Idempotency-Key', 'resolution-key')
      .send({ resolution: 'server' })
      .expect(200);
  });
});
