import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { LedgerController } from '../../../src/ledger/ledger.controller';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { LedgerService } from '../../../src/ledger/ledger.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { SecurityRepository } from '../../../src/security/security.repository';

describe('POST /api/v1/transfers', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const result = { transaction: {}, balances: [], ledgerVersion: 2, requestId: 'transfer-e2e' };
  const mutate = jest.fn().mockResolvedValue(result);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [
        LedgerService,
        { provide: LedgerRepository, useValue: { mutate, replayCompleted: () => undefined } },
        { provide: SecurityRepository, useValue: { consumeRateLimit: () => true } },
        {
          provide: PlatformConfigService,
          useValue: { get: () => undefined, getRequired: () => 600 },
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          Object.assign(context.switchToHttp().getRequest<object>(), {
            clerkPrincipal: { userId: 'user', sessionId: 'session', factorAgeSeconds: 0 },
            requestId: 'transfer-e2e',
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
  const body = {
    sourceAccountId: '10000000-0000-4000-8000-000000000001',
    destinationAccountId: '10000000-0000-4000-8000-000000000002',
    amountMinor: 50,
    currency: 'SAR',
    occurredAt: new Date().toISOString(),
    title: 'Move',
  };
  it('requires a key, validates accounts, and returns the approved 201 shape', async () => {
    await request(server).post('/api/v1/transfers').send(body).expect(400);
    await request(server)
      .post('/api/v1/transfers')
      .set('Idempotency-Key', 'transfer-e2e-key')
      .send({ ...body, destinationAccountId: body.sourceAccountId })
      .expect(400);
    await request(server)
      .post('/api/v1/transfers')
      .set('Idempotency-Key', 'transfer-e2e-key')
      .send(body)
      .expect(201)
      .expect(result);
  });
});
