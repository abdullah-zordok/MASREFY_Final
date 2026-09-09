import { createHash } from 'node:crypto';
import * as Crypto from 'expo-crypto';
import { compareShadow } from './shadow-comparison';
import { createLiveAccountService } from '@/services/live/account-service';
import { createLiveCategoryLifecycleService } from '@/services/live/category-lifecycle-service';
import { registerLiveClerkBridge } from '@/services/live/auth-service';
import { createLiveLedgerService } from '@/services/live/core-finance-service';
import { createLiveFinancialPlanningService } from '@/services/live/financial-planning-service';
import { savingsGoalWireFixture } from '@/test-utils/financial-planning-api-fixtures';

jest.mock('@/storage/database', () => ({
  runExclusiveDatabaseTransaction: async (
    database: unknown,
    action: (database: unknown) => Promise<void>
  ) => action(database),
  openDatabase: async () => ({
    getAllAsync: async () => [],
    execAsync: async () => undefined,
    runAsync: async () => undefined
  })
}));

jest
  .spyOn(Crypto, 'digestStringAsync')
  .mockImplementation(async (_algorithm, value) =>
    createHash('sha256').update(value).digest('hex')
  );

const metadata = {
  operationId: 'mobile.accounts.list',
  contractVersion: 'be004-v1',
  clientVersion: 'mobile-v1',
  cohort: 'internal',
  durationMs: 12,
  observedAt: '2026-09-08T00:00:00.000Z'
};

describe('Mobile redacted shadow comparison', () => {
  it('produces stable hashes and counts without retaining source content', async () => {
    const baseline = [
      { id: 'account-private', amountMinor: 1250, label: 'Secret Salary' }
    ];
    const live = [
      { label: 'Secret Salary', amountMinor: 1250, id: 'account-private' }
    ];

    const result = await compareShadow({
      ...metadata,
      baseline,
      live,
      financialDifferenceMinor: 0
    });

    expect(result).toMatchObject({
      operationId: metadata.operationId,
      contractVersion: metadata.contractVersion,
      clientVersion: metadata.clientVersion,
      cohort: metadata.cohort,
      baselineCount: 1,
      liveCount: 1,
      differenceCodes: [],
      financialDifferenceMinor: 0,
      outcome: 'match'
    });
    expect(result.baselineHash).toHaveLength(64);
    expect(result.liveHash).toBe(result.baselineHash);
    expect(JSON.stringify(result)).not.toMatch(
      /account-private|Secret Salary|1250/
    );
  });

  it('blocks structural and financial differences with allowlisted codes', async () => {
    const result = await compareShadow({
      ...metadata,
      baseline: [{ amountMinor: 100 }],
      live: [{ amountMinor: 101 }, { amountMinor: 0 }],
      financialDifferenceMinor: 1
    });

    expect(result.outcome).toBe('blocked');
    expect(result.differenceCodes).toEqual([
      'COUNT_MISMATCH',
      'HASH_MISMATCH',
      'FINANCIAL_MISMATCH'
    ]);
  });

  it('bounds comparison inputs and emitted timing', async () => {
    await expect(
      compareShadow({
        ...metadata,
        baseline: Array.from({ length: 10_001 }, () => null),
        live: []
      })
    ).rejects.toThrow('shadow payload exceeds record limit');
    await expect(
      compareShadow({
        ...metadata,
        durationMs: 600_001,
        baseline: [],
        live: []
      })
    ).rejects.toThrow('invalid shadow duration');
  });

  it('records an explicit not-comparable outcome', async () => {
    await expect(
      compareShadow({ ...metadata, comparable: false, baseline: [], live: [] })
    ).resolves.toMatchObject({
      outcome: 'not-comparable',
      differenceCodes: ['NOT_COMPARABLE']
    });
  });

  it('compares every Wave 2 account, card, and category field exactly', async () => {
    const apiAccount = {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Redacted account',
      type: 'credit_card',
      currency: 'SAR',
      institutionName: 'Redacted institution',
      lastFour: '4242',
      status: 'closed',
      creditLimitMinor: 100_000,
      isDefault: false,
      iconKey: 'card',
      colorKey: 'blue',
      notes: null,
      sortOrder: 4,
      statementDay: 7,
      paymentDueDay: 21,
      monthlyInterestRateBasisPoints: 125,
      minimumPaymentMinor: 5_000,
      automaticTrackingEnabled: false,
      includeInTotals: false,
      openedAt: '2026-09-01',
      closedAt: '2026-09-08',
      version: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z'
    };
    const apiCategory = {
      id: '10000000-0000-4000-8000-000000000001',
      scope: 'custom',
      kind: 'expense',
      labelAr: 'مصروف',
      labelEn: 'Expense',
      icon: null,
      color: null,
      systemKey: null,
      parentId: null,
      mergedIntoId: null,
      sortOrder: 2,
      active: true,
      status: 'active',
      version: 8,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z'
    };
    const response = (value: unknown) =>
      new Response(JSON.stringify(value), { status: 200 });
    const accountService = createLiveAccountService({
      baseUrl: 'https://api.test',
      token: async () => 'owner-token',
      request: jest
        .fn()
        .mockResolvedValue(response({ items: [apiAccount], nextCursor: null }))
    });
    registerLiveClerkBridge({
      getSession: async () => ({
        id: 'session-owner',
        userId: 'user_owner',
        method: 'google',
        issuedAt: 1,
        expiresAt: 9999999999999
      }),
      getToken: async () => 'owner-token',
      startPhone: jest.fn(),
      verifyPhone: jest.fn(),
      resendPhone: jest.fn(),
      signInWithGoogle: jest.fn(),
      reverifyConflict: jest.fn(),
      signOut: jest.fn()
    });
    const categoryService = createLiveCategoryLifecycleService({
      baseUrl: 'https://api.test',
      token: async () => 'owner-token',
      request: jest
        .fn()
        .mockResolvedValueOnce(
          response({ items: [apiCategory], nextCursor: null })
        )
        .mockResolvedValueOnce(
          response({ linkedTransactionCount: 4, version: 8 })
        )
    });
    const [accounts, categories] = await Promise.all([
      accountService.listAccounts(true),
      categoryService.listCategories(true)
    ]);
    const usage = await categoryService.getCategoryUsage(apiCategory.id);
    const live = [...accounts, { ...categories[0], ...usage }];
    const baseline = [
      {
        id: apiAccount.id,
        name: apiAccount.name,
        type: apiAccount.type,
        currencyCode: apiAccount.currency,
        institution: apiAccount.institutionName,
        lastFour: apiAccount.lastFour,
        creditLimitMinor: apiAccount.creditLimitMinor,
        statementDay: apiAccount.statementDay,
        paymentDueDay: apiAccount.paymentDueDay,
        monthlyInterestRateBasisPoints:
          apiAccount.monthlyInterestRateBasisPoints,
        minimumPaymentMinor: apiAccount.minimumPaymentMinor,
        automaticTrackingEnabled: apiAccount.automaticTrackingEnabled,
        isDefault: apiAccount.isDefault,
        iconKey: apiAccount.iconKey,
        colorKey: apiAccount.colorKey,
        notes: apiAccount.notes,
        status: apiAccount.status,
        sortOrder: apiAccount.sortOrder,
        includeInTotals: apiAccount.includeInTotals,
        openedAt: Date.parse(apiAccount.openedAt),
        closedAt: Date.parse(apiAccount.closedAt),
        version: apiAccount.version,
        createdAt: Date.parse(apiAccount.createdAt),
        updatedAt: Date.parse(apiAccount.updatedAt)
      },
      {
        id: apiCategory.id,
        kind: 'custom',
        systemKey: null,
        financialType: 'expense',
        parentId: null,
        labelAr: apiCategory.labelAr,
        labelEn: apiCategory.labelEn,
        iconKey: null,
        colorKey: null,
        isFavorite: false,
        status: 'active',
        mergedIntoId: null,
        sortOrder: 2,
        version: 8,
        createdAt: Date.parse(apiCategory.createdAt),
        updatedAt: Date.parse(apiCategory.updatedAt),
        linkedTransactionCount: 4
      }
    ];
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.reference.wave-2',
        contractVersion: 'be004-wave-2-v1',
        baseline,
        live
      })
    ).resolves.toMatchObject({ outcome: 'match', differenceCodes: [] });
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.reference.wave-2',
        contractVersion: 'be004-wave-2-v1',
        baseline,
        live: [{ ...live[0], automaticTrackingEnabled: true }, live[1]]
      })
    ).resolves.toMatchObject({
      outcome: 'blocked',
      differenceCodes: ['HASH_MISMATCH']
    });
  });

  it('reconciles the Wave 3 live ledger mapper with zero financial tolerance', async () => {
    registerLiveClerkBridge({
      getSession: async () => ({
        id: 'session-owner',
        userId: 'user_owner',
        method: 'google',
        issuedAt: 1,
        expiresAt: 9999999999999
      }),
      getToken: async () => 'owner-token',
      startPhone: jest.fn(),
      verifyPhone: jest.fn(),
      resendPhone: jest.fn(),
      signInWithGoogle: jest.fn(),
      reverifyConflict: jest.fn(),
      signOut: jest.fn()
    });
    const transaction = {
      id: '30000000-0000-4000-8000-000000000001',
      kind: 'expense',
      status: 'confirmed',
      amountMinor: 12_345,
      currency: 'SAR',
      accountIds: ['10000000-0000-4000-8000-000000000001'],
      sourceAccountId: '10000000-0000-4000-8000-000000000001',
      destinationAccountId: null,
      feeMinor: 0,
      categoryId: '20000000-0000-4000-8000-000000000001',
      title: 'Redacted expense',
      merchant: null,
      paymentMethod: null,
      note: null,
      occurredAt: '2026-09-08T00:00:00.000Z',
      source: 'manual',
      originalTransactionId: null,
      version: 4,
      deletedAt: null,
      undoExpiresAt: null
    };
    const service = createLiveLedgerService({
      baseUrl: 'https://api.test',
      request: jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [transaction],
            nextCursor: null,
            ledgerVersion: 9,
            requestId: 'wave-3-shadow'
          })
        )
      )
    });
    const live = (
      await service.listTransactions({
        search: '',
        periodStart: null,
        periodEnd: null,
        accountIds: [],
        categoryIds: [],
        types: [],
        sources: [],
        statuses: [],
        syncStatuses: [],
        reviewRequired: null,
        amountCurrencyCode: null,
        minMinor: null,
        maxMinor: null,
        sort: 'newest'
      })
    ).items;
    const baseline = [
      {
        id: transaction.id,
        type: 'expense',
        amountMinor: 12_345,
        currencyCode: 'SAR',
        accountId: transaction.accountIds[0],
        destinationAccountId: null,
        transferPurpose: null,
        feeMinor: 0,
        categoryId: transaction.categoryId,
        title: transaction.title,
        merchant: null,
        paymentMethod: null,
        occurredAt: Date.parse(transaction.occurredAt),
        source: 'manual',
        status: 'posted',
        reviewStatus: 'none',
        syncStatus: 'synced',
        originalTransactionId: null,
        obligationId: null,
        notes: null,
        version: 4,
        adjustmentSign: 1,
        deletedAt: null,
        undoExpiresAt: null,
        createdAt: Date.parse(transaction.occurredAt),
        updatedAt: Date.parse(transaction.occurredAt)
      }
    ];
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.finance.wave-3',
        contractVersion: 'be005-be006-wave-3-v1',
        baseline,
        live,
        financialDifferenceMinor: 0
      })
    ).resolves.toMatchObject({ outcome: 'match', differenceCodes: [] });
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.finance.wave-3',
        contractVersion: 'be005-be006-wave-3-v1',
        baseline,
        live: [{ ...live[0]!, amountMinor: 12_346 }],
        financialDifferenceMinor: 1
      })
    ).resolves.toMatchObject({
      outcome: 'blocked',
      differenceCodes: ['HASH_MISMATCH', 'FINANCIAL_MISMATCH']
    });
  });

  it('reconciles the Wave 4 planning mapper with zero financial tolerance', async () => {
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request: jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [savingsGoalWireFixture],
            nextCursor: null,
            requestId: 'wave-4-shadow'
          }),
          { status: 200 }
        )
      )
    });
    const live = await service.listGoals({ status: 'active' });
    const baseline = [
      {
        id: savingsGoalWireFixture.id,
        title: savingsGoalWireFixture.name,
        targetMinor: 2_000_000,
        openingTrackedMinor: 500_000,
        currencyCode: 'SAR',
        targetDate: '2026-12-31',
        linkedAccountId: savingsGoalWireFixture.linkedAccountId,
        iconKey: null,
        emergencyFund: true,
        status: 'active',
        version: 1,
        syncStatus: 'synced',
        createdAt: Date.parse(savingsGoalWireFixture.createdAt),
        updatedAt: Date.parse(savingsGoalWireFixture.updatedAt)
      }
    ];
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.planning.wave-4',
        contractVersion: 'be007-wave-4-v1',
        baseline,
        live,
        financialDifferenceMinor: 0
      })
    ).resolves.toMatchObject({ outcome: 'match', differenceCodes: [] });
    await expect(
      compareShadow({
        ...metadata,
        operationId: 'mobile.planning.wave-4',
        contractVersion: 'be007-wave-4-v1',
        baseline,
        live: [{ ...live[0]!, targetMinor: 2_000_001 }],
        financialDifferenceMinor: 1
      })
    ).resolves.toMatchObject({
      outcome: 'blocked',
      differenceCodes: ['HASH_MISMATCH', 'FINANCIAL_MISMATCH']
    });
  });
});
