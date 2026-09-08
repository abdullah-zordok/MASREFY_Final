import {
  createLiveCoreFinanceService,
  createProductionCoreFinanceService
} from './core-finance-service';
import { registerLiveClerkBridge } from '@/services/live/auth-service';

let mockUuid = 0;
const mockPersistCategory = jest.fn(async () => undefined);
jest.mock('@/storage/database', () => ({
  runExclusiveDatabaseTransaction: async (
    database: unknown,
    action: (database: unknown) => Promise<void>
  ) => action(database),
  openDatabase: async () => ({
    execAsync: async () => undefined,
    getAllAsync: async () => [],
    runAsync: mockPersistCategory
  })
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `operation-key-${String(++mockUuid)}`
}));

beforeEach(() => {
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
  mockUuid = 0;
  mockPersistCategory.mockReset().mockResolvedValue(undefined);
});

const account = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Cash',
  type: 'cash',
  currency: 'SAR',
  institutionName: null,
  lastFour: null,
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  monthlyInterestRateBasisPoints: null,
  minimumPaymentMinor: null,
  automaticTrackingEnabled: false,
  version: 2,
  status: 'active',
  isDefault: false,
  iconKey: null,
  colorKey: null,
  notes: null,
  sortOrder: 1,
  includeInTotals: true,
  openedAt: null,
  closedAt: null,
  createdAt: '2026-09-06T00:00:00Z',
  updatedAt: '2026-09-06T00:00:00Z'
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const category = {
  id: '10000000-0000-4000-8000-000000000001',
  scope: 'custom',
  kind: 'expense',
  labelAr: 'سفر',
  labelEn: 'Travel',
  icon: null,
  color: null,
  systemKey: null,
  parentId: null,
  mergedIntoId: null,
  sortOrder: 2,
  active: true,
  status: 'active',
  version: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

it('fails missing production configuration explicitly before any local computation', async () => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  try {
    delete process.env.EXPO_PUBLIC_API_URL;
    const selected = createLiveCoreFinanceService();

    expect(selected.metadata).toMatchObject({
      kind: 'live',
      availability: 'unavailable'
    });
    await expect(selected.getHomeSummary('SAR')).rejects.toMatchObject({
      code: 'offline'
    });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
});

it('selects the live provider from the actual production factory', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const previousDemo = process.env.EXPO_PUBLIC_DEMO_MODE;
  try {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
    delete process.env.EXPO_PUBLIC_DEMO_MODE;

    expect(createProductionCoreFinanceService().metadata).toMatchObject({
      id: 'phase04-core-finance-http',
      kind: 'live',
      availability: 'available'
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousApiUrl;
    if (previousDemo === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
    else process.env.EXPO_PUBLIC_DEMO_MODE = previousDemo;
  }
});

it('serves account balances from the live BE005 summary endpoint', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ items: [account], nextCursor: null }))
    .mockResolvedValueOnce(
      response({
        accountId: account.id,
        currency: 'SAR',
        balance: {
          accountId: account.id,
          currency: 'SAR',
          confirmedMinor: 50_000,
          pendingMinor: 0,
          ledgerVersion: 3,
          reconciledAt: null
        },
        recentTransactions: [],
        ledgerVersion: 3,
        requestId: 'request-1'
      })
    );
  const service = createLiveCoreFinanceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });

  await expect(service.listAccountBalances(true)).resolves.toEqual([
    { accountId: account.id, balanceMinor: 50_000, currencyCode: 'SAR' }
  ]);
});

it('reuses the same account-create idempotency key after an uncertain failure', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(
      response({ account, openingTransactionId: null }, 201)
    );
  const service = createLiveCoreFinanceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const input = {
    name: 'Cash',
    type: 'cash' as const,
    currencyCode: 'SAR',
    openingBalanceMinor: 0
  };

  await expect(service.createAccount(input)).rejects.toMatchObject({
    code: 'offline'
  });
  await expect(service.createAccount(input)).resolves.toBeDefined();
  const first = request.mock.calls[0]?.[1]?.headers as Record<string, string>;
  const second = request.mock.calls[1]?.[1]?.headers as Record<string, string>;
  expect(second['Idempotency-Key']).toBe(first['Idempotency-Key']);
});

it('reuses the same category-create idempotency key after an uncertain failure', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(response(category, 201));
  const service = createLiveCoreFinanceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const input = {
    labelAr: 'سفر',
    labelEn: 'Travel',
    financialType: 'expense' as const
  };

  await expect(service.createCategory(input)).rejects.toMatchObject({
    code: 'offline'
  });
  await expect(service.createCategory(input)).resolves.toBeDefined();
  const first = request.mock.calls[0]?.[1]?.headers as Record<string, string>;
  const second = request.mock.calls[1]?.[1]?.headers as Record<string, string>;
  expect(second['Idempotency-Key']).toBe(first['Idempotency-Key']);
});

it('retains category retry identity when the server succeeds but favorite persistence fails', async () => {
  mockPersistCategory.mockRejectedValueOnce(new Error('disk unavailable'));
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async () => response(category, 201));
  const service = createLiveCoreFinanceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const input = {
    labelAr: 'سفر',
    labelEn: 'Travel',
    financialType: 'expense' as const,
    isFavorite: true
  };

  await expect(service.createCategory(input)).rejects.toMatchObject({
    code: 'offline'
  });
  await expect(service.createCategory(input)).resolves.toMatchObject({
    value: { isFavorite: true }
  });
  const first = request.mock.calls[0]?.[1]?.headers as Record<string, string>;
  const second = request.mock.calls[1]?.[1]?.headers as Record<string, string>;
  expect(second['Idempotency-Key']).toBe(first['Idempotency-Key']);
});
