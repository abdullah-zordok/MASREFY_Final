import type { Server } from 'node:http';

import { HttpException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { LedgerService } from '../../../src/ledger/ledger.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { ReferenceController } from '../../../src/reference/reference.controller';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { ReferenceService } from '../../../src/reference/reference.service';
import { AdminAuthGuard } from '../../../src/security/admin-auth.guard';

export interface ReferenceE2eHarness {
  app: INestApplication;
  server: Server;
  auth: { user: boolean; admin: boolean; recent: boolean };
  execute: jest.Mock;
}

export async function createReferenceE2eHarness(): Promise<ReferenceE2eHarness> {
  const auth = { user: true, admin: true, recent: true };
  const execute = jest.fn((input: { operation: string }) => {
    const responses: Record<string, unknown> = {
      listCurrencies: [{ code: 'SAR', name: 'Saudi Riyal', minorUnit: 2, version: 1 }],
      listCountries: [{ code: 'SA', name: 'Saudi Arabia', defaultCurrency: 'SAR', version: 1 }],
      listSystemCategories: [],
      listUserCategories: [],
      createCategory: { id: '10000000-0000-4000-8000-000000000001', version: 1 },
      getCategoryUsage: { linkedTransactionCount: 0, version: 1 },
      archiveCategory: null,
      createAccount: {
        account: { id: '20000000-0000-4000-8000-000000000001', status: 'active', version: 1 },
        openingTransactionId: null,
      },
      updateAccount: { id: '20000000-0000-4000-8000-000000000001', status: 'active', version: 2 },
      archiveAccount: null,
      restoreAccount: { id: '20000000-0000-4000-8000-000000000001', status: 'active', version: 3 },
      closeAccount: { id: '20000000-0000-4000-8000-000000000001', status: 'closed', version: 4 },
      getExchangeRate: { base: 'SAR', quote: 'SAR', rate: 1, provider: 'identity' },
      listAdminCurrencies: { items: [], nextCursor: null },
      updateAdminCurrency: { code: 'SAR', enabled: true, version: 2 },
    };
    return Promise.resolve(responses[input.operation]);
  });
  const principal = {
    userId: 'e2e_user',
    sessionId: 'e2e_session',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const setPrincipal = (context: ExecutionContext): void => {
    Object.assign(context.switchToHttp().getRequest<object>(), { clerkPrincipal: principal });
  };
  const module = await Test.createTestingModule({
    controllers: [ReferenceController],
    providers: [
      ReferenceService,
      {
        provide: LedgerService,
        useValue: {
          createAccount: jest.fn((input: { body: Record<string, unknown> }) =>
            execute({ operation: 'createAccount' }).then((value) => ({
              ...(value as object),
              openingTransactionId:
                Number(input.body.openingBalanceMinor ?? 0) === 0
                  ? null
                  : '30000000-0000-4000-8000-000000000001',
            })),
          ),
        },
      },
      {
        provide: ReferenceRepository,
        useValue: { sharedHash: jest.fn().mockResolvedValue('hash'), execute },
      },
    ],
  })
    .overrideGuard(ClerkAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!auth.user) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
        setPrincipal(context);
        return true;
      },
    })
    .overrideGuard(AdminAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!auth.admin) throw new HttpException({ code: 'ADMIN_PERMISSION_DENIED' }, 403);
        if (!auth.recent) throw new HttpException({ code: 'RECENT_AUTH_REQUIRED' }, 403);
        setPrincipal(context);
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication();
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.init();
  return { app, server: app.getHttpServer() as Server, auth, execute };
}
