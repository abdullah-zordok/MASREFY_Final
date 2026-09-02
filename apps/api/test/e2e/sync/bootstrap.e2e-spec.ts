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

describe('sync bootstrap HTTP boundary', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const auth = { enabled: true };
  const deviceId = '63000000-0000-4000-8000-000000000009';
  const repository = {
    assertActiveDevice: jest.fn(),
    recordIssuedCursor: jest.fn(),
    bootstrap: jest
      .fn()
      .mockResolvedValue([{ domain: 'accounts', position: 0n, items: [], hasMore: false }]),
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
              name === 'MASARIFI_PUSH_TOKEN_HASH_KEY'
                ? Buffer.alloc(32, 1).toString('base64url')
                : 524_288,
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
            requestId: 'request-one',
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

  it('requires authentication/device identity and derives ownership only from the principal', async () => {
    auth.enabled = false;
    await request(server).get('/api/v1/sync/bootstrap').expect(401);
    auth.enabled = true;
    await request(server).get('/api/v1/sync/bootstrap').expect(400);
    await request(server)
      .get('/api/v1/sync/bootstrap?domains=accounts')
      .set('X-Device-Id', deviceId)
      .expect(200);
    expect(repository.bootstrap).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'owner-one' }),
      ['accounts'],
      null,
      500,
      null,
    );
    await request(server)
      .get('/api/v1/sync/bootstrap?ownerId=other-owner')
      .set('X-Device-Id', deviceId)
      .expect(400);
  });
});
