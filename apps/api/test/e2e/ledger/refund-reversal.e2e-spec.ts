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
describe('refund/reversal HTTP contracts', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const mutate = jest.fn().mockResolvedValue({
    transaction: {},
    original: {},
    balances: [],
    ledgerVersion: 2,
    requestId: 'comp-e2e',
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [
        LedgerService,
        {
          provide: LedgerRepository,
          useValue: {
            mutate,
            replayCompleted: () => undefined,
            effect: () => ({ amountMinor: 100, feeMinor: 5, currency: 'SAR', version: 1 }),
          },
        },
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
            requestId: 'comp-e2e',
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
  it('registers and validates both linked mutation endpoints', async () => {
    const id = '10000000-0000-4000-8000-000000000003',
      key = 'compensation-key';
    await request(server)
      .post(`/api/v1/transactions/${id}/refunds`)
      .set('Idempotency-Key', key)
      .send({
        expectedVersion: 1,
        amountMinor: 50,
        occurredAt: new Date().toISOString(),
        reason: 'Return',
      })
      .expect(201);
    await request(server)
      .post(`/api/v1/transactions/${id}/reverse`)
      .set('Idempotency-Key', key)
      .send({ expectedVersion: 1, reason: 'Duplicate' })
      .expect(201);
    await request(server)
      .post(`/api/v1/transactions/${id}/refunds`)
      .set('Idempotency-Key', key)
      .send({
        expectedVersion: 1,
        amountMinor: 0,
        occurredAt: new Date().toISOString(),
        reason: 'x',
      })
      .expect(400);
  });
});
