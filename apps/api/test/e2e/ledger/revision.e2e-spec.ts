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

describe('PATCH /api/v1/transactions/:transactionId', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const mutate = jest.fn().mockResolvedValue({
    transaction: {},
    balances: [],
    ledgerVersion: 2,
    requestId: 'revision-e2e',
  });
  const effect = jest
    .fn()
    .mockResolvedValue({ amountMinor: 10, feeMinor: 0, currency: 'SAR', version: 1 });
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
            effect,
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
            requestId: 'revision-e2e',
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
  it('requires key, path UUID, expected version, reason, and one changed field', async () => {
    const id = '10000000-0000-4000-8000-000000000003';
    await request(server)
      .patch(`/api/v1/transactions/${id}`)
      .send({ expectedVersion: 1, reason: 'x', title: 'New' })
      .expect(400);
    await request(server)
      .patch('/api/v1/transactions/bad')
      .set('Idempotency-Key', 'revision-key')
      .send({ expectedVersion: 1, reason: 'x', title: 'New' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/transactions/${id}`)
      .set('Idempotency-Key', 'revision-key')
      .send({ expectedVersion: 1, reason: 'x' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/transactions/${id}`)
      .set('Idempotency-Key', 'revision-key')
      .send({ expectedVersion: 1, reason: 'x', title: 'New' })
      .expect(200);

    effect.mockResolvedValueOnce({ amountMinor: 10, feeMinor: 0, currency: 'SAR', version: 2 });
    await request(server)
      .patch(`/api/v1/transactions/${id}`)
      .set('Idempotency-Key', 'revision-stale-key')
      .send({ expectedVersion: 1, reason: 'x', title: 'Stale' })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2 });
      });
  });
});
