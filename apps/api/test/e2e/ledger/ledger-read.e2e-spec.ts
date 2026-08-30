import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { LedgerController } from '../../../src/ledger/ledger.controller';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { LedgerService } from '../../../src/ledger/ledger.service';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { SecurityRepository } from '../../../src/security/security.repository';

describe('ledger read HTTP contracts', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const auth = { enabled: true };
  const transactionId = '10000000-0000-4000-8000-000000000003';
  const accountId = '10000000-0000-4000-8000-000000000001';
  const page = {
    items: [
      {
        id: transactionId,
        kind: 'expense',
        status: 'confirmed',
        amountMinor: 1250,
        currency: 'SAR',
        accountIds: [accountId],
        feeMinor: 0,
        title: 'Groceries',
        merchant: null,
        paymentMethod: 'card',
        note: null,
        occurredAt: '2026-08-30T08:00:00.000Z',
        source: 'manual',
        originalTransactionId: null,
        version: 1,
        deletedAt: null,
        undoExpiresAt: null,
      },
    ],
    nextCursor: null,
    ledgerVersion: 3,
    requestId: 'ledger-read-e2e',
  };
  const detail = {
    transaction: page.items[0],
    postings: [],
    revisions: [],
    ledgerVersion: 3,
    requestId: 'ledger-read-e2e',
  };
  const summary = {
    accountId,
    currency: 'SAR',
    balance: {
      accountId,
      currency: 'SAR',
      confirmedMinor: -1250,
      pendingMinor: 0,
      ledgerVersion: 3,
      reconciledAt: null,
    },
    recentTransactions: page.items,
    ledgerVersion: 3,
    requestId: 'ledger-read-e2e',
  };
  const reads = {
    listTransactions: jest.fn().mockResolvedValue(page),
    getTransaction: jest.fn().mockResolvedValue(detail),
    getAccountSummary: jest.fn().mockResolvedValue(summary),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [
        LedgerService,
        { provide: LedgerRepository, useValue: reads },
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
            clerkPrincipal: {
              userId: 'ledger-read-owner',
              sessionId: 'session',
              factorAgeSeconds: 0,
            },
            requestId: 'ledger-read-e2e',
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

  it('returns a bounded filtered owner list and requires authentication', async () => {
    auth.enabled = false;
    await request(server).get('/api/v1/transactions').expect(401);
    auth.enabled = true;
    await request(server)
      .get(`/api/v1/transactions?accountId=${accountId}&limit=25&query=Groc`)
      .expect(200)
      .expect(page);
  });

  it('returns the complete owner detail and the account projection summary', async () => {
    await request(server).get(`/api/v1/transactions/${transactionId}`).expect(200).expect(detail);
    await request(server).get(`/api/v1/accounts/${accountId}/summary`).expect(200).expect(summary);
  });

  it('uses the stable owner-safe not-found envelope for absent transaction and account IDs', async () => {
    reads.getTransaction.mockRejectedValueOnce(new HttpException({ code: 'NOT_FOUND' }, 404));
    reads.getAccountSummary.mockRejectedValueOnce(new HttpException({ code: 'NOT_FOUND' }, 404));
    const missing = '10000000-0000-4000-8000-000000000099';
    const expected = { code: 'NOT_FOUND', message: 'Not found', requestId: 'ledger-read-e2e' };

    await request(server).get(`/api/v1/transactions/${missing}`).expect(404).expect(expected);
    await request(server).get(`/api/v1/accounts/${missing}/summary`).expect(404).expect(expected);
  });
});
