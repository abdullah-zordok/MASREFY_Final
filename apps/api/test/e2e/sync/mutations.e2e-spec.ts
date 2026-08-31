import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { SyncController } from '../../../src/sync/sync.controller';
import { SyncHandlers } from '../../../src/sync/sync.handlers';
import { SyncRepository } from '../../../src/sync/sync.repository';
import { SyncService } from '../../../src/sync/sync.service';

describe('sync mutation HTTP contract', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const auth = { enabled: true };
  const deviceId = '63000000-0000-4000-8000-000000000009';
  const response = {
    data: {
      receipts: [{ operationId: '63000000-0000-4000-8000-000000000001', status: 'received' }],
    },
    meta: { requestId: 'sync-request' },
  };
  const repository = {
    assertActiveDevice: jest.fn(),
    claimBatch: jest.fn().mockResolvedValue({
      outcome: 'new',
      responseStatus: null,
      responseBody: null,
      retryAfterSeconds: null,
      leaseToken: '73000000-0000-4000-8000-000000000001',
    }),
    receiveMutation: jest.fn().mockResolvedValue({
      outcome: 'received',
      mutationId: '73000000-0000-4000-8000-000000000002',
      status: 'received',
      result: null,
      error: null,
    }),
    completeBatch: jest.fn(),
  };
  const body = {
    mutations: [
      {
        operationId: '63000000-0000-4000-8000-000000000001',
        domain: 'accounts',
        resourceType: 'account',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'create',
        payload: { name: 'Cash' },
      },
    ],
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
            getRequired: (key: string) => (key === 'MASARIFI_SYNC_LEASE_SECONDS' ? 60 : 524_288),
          },
        },
        { provide: SyncHandlers, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!auth.enabled) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
          Object.assign(context.switchToHttp().getRequest<object>(), {
            clerkPrincipal: { userId: 'owner-one', sessionId: 'session', factorAgeSeconds: 0 },
            requestId: 'sync-request',
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

  it('requires authentication and stable device/idempotency headers', async () => {
    auth.enabled = false;
    await request(server).post('/api/v1/sync/mutations').send(body).expect(401);
    auth.enabled = true;
    await request(server).post('/api/v1/sync/mutations').send(body).expect(400);
    await request(server)
      .post('/api/v1/sync/mutations')
      .set('X-Device-Id', deviceId)
      .set('Idempotency-Key', 'batch-key')
      .send(body)
      .expect(200)
      .expect(response);
    expect(repository.claimBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'owner-one' }),
      expect.stringMatching(/^sha256:/),
      expect.stringMatching(/^sha256:/),
      60,
    );
  });

  it('does not accept owner identity from the request body', async () => {
    await request(server)
      .post('/api/v1/sync/mutations')
      .set('X-Device-Id', deviceId)
      .set('Idempotency-Key', 'batch-key')
      .send({ ...body, userId: 'other-owner' })
      .expect(400);
  });
});
