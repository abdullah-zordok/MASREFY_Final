import type { Server } from 'node:http';

import { HttpException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { LedgerController } from '../../../src/ledger/ledger.controller';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { LedgerService } from '../../../src/ledger/ledger.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { SecurityRepository } from '../../../src/security/security.repository';

describe('POST /api/v1/transactions', () => {
  let app: INestApplication, server: Server;
  const auth = { enabled: true };
  const result = {
    transaction: { transaction: { id: '10000000-0000-4000-8000-000000000003' } },
    balances: [],
    ledgerVersion: 1,
    requestId: 'request-e2e',
  };
  const mutate = jest.fn().mockResolvedValue(result);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [
        LedgerService,
        { provide: LedgerRepository, useValue: { mutate, replayCompleted: () => undefined } },
        {
          provide: SecurityRepository,
          useValue: { consumeRateLimit: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: PlatformConfigService,
          useValue: { get: () => undefined, getRequired: () => 600 },
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!auth.enabled) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
          Object.assign(context.switchToHttp().getRequest<object>(), {
            clerkPrincipal: { userId: 'e2e_user', sessionId: 'e2e_session', factorAgeSeconds: 0 },
            requestId: 'request-e2e',
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(() => app.close());

  const valid = {
    kind: 'income',
    amountMinor: 100,
    currency: 'SAR',
    accountId: '10000000-0000-4000-8000-000000000001',
    title: 'Salary',
    occurredAt: new Date().toISOString(),
  };

  it('requires authentication and a valid idempotency key', async () => {
    auth.enabled = false;
    await request(server).post('/api/v1/transactions').send(valid).expect(401);
    auth.enabled = true;
    await request(server)
      .post('/api/v1/transactions')
      .send(valid)
      .expect(400)
      .expect(({ body }: { body: unknown }) => {
        expect((body as { code: unknown }).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      });
  });

  it('rejects unknown/invalid input and returns the exact stable response shape', async () => {
    await request(server)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', 'e2e-key-1234')
      .send({ ...valid, extra: true })
      .expect(400);
    await request(server)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', 'e2e-key-1234')
      .send(valid)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(result);
      });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
