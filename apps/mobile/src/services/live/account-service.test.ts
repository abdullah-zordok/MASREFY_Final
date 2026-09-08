import { createLiveAccountService } from './account-service';
import { registerLiveClerkBridge, type LiveClerkBridge } from './auth-service';

let session = {
  id: 'session-a',
  userId: 'user_owner-a',
  method: 'google' as const,
  issuedAt: 1,
  expiresAt: 9999999999999
};
const bridge = {
  getSession: async () => session,
  getToken: jest.fn(async () => 'owner'),
  startPhone: jest.fn(),
  verifyPhone: jest.fn(),
  resendPhone: jest.fn(),
  signInWithGoogle: jest.fn(),
  reverifyConflict: jest.fn(),
  signOut: jest.fn()
} satisfies LiveClerkBridge;
beforeEach(() => {
  session = { ...session, id: 'session-a', userId: 'user_owner-a' };
  bridge.getToken.mockReset().mockResolvedValue('owner');
  registerLiveClerkBridge(bridge);
});

const terms = {
  statementDay: 7,
  paymentDueDay: 21,
  monthlyInterestRateBasisPoints: 125,
  minimumPaymentMinor: 5_000
};
const account = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Card',
  type: 'credit_card',
  currency: 'SAR',
  institutionName: 'Bank',
  lastFour: '4242',
  creditLimitMinor: 100_000,
  ...terms,
  automaticTrackingEnabled: false,
  version: 2,
  status: 'active',
  isDefault: false,
  iconKey: 'card',
  colorKey: 'blue',
  notes: null,
  sortOrder: 4,
  includeInTotals: false,
  openedAt: '2026-09-01',
  closedAt: null,
  createdAt: '2026-09-06T00:00:00Z',
  updatedAt: '2026-09-06T00:00:00Z'
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

describe.each([
  'list',
  'paginated-list',
  'read',
  'summary',
  'create',
  'update',
  'archive',
  'restore',
  'close',
  'payoff'
] as const)('%s owner-bound operation', (operation) => {
  it.each([false, true])(
    'rejects a delayed owner transition and preserves same-owner behavior (switch: %s)',
    async (switchOwner) => {
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockImplementation(async () => {
          if (switchOwner)
            session = { ...session, id: 'session-b', userId: 'user_owner-b' };
          if (operation === 'archive')
            return new Response(null, { status: 204 });
          if (operation === 'list' || operation === 'paginated-list')
            return response({ items: [account], nextCursor: null });
          if (operation === 'create') return response({ account }, 201);
          if (operation === 'summary')
            return response({
              accountId: account.id,
              currency: 'SAR',
              balance: {
                accountId: account.id,
                currency: 'SAR',
                confirmedMinor: 12_345,
                pendingMinor: 0,
                ledgerVersion: 1
              },
              recentTransactions: [],
              ledgerVersion: 1,
              requestId: 'summary-a'
            });
          if (operation === 'payoff')
            return response({
              status: 'payoff',
              months: 1,
              totalInterestMinor: 0,
              totalPaidMinor: 100,
              finalPaymentMinor: 100
            });
          return response(account);
        });
      if (operation === 'paginated-list')
        request.mockResolvedValueOnce(
          response({ items: [], nextCursor: 'next-page' })
        );
      const service = createLiveAccountService({
        baseUrl: 'https://api.test',
        request
      });
      const input = {
        name: 'Owner A cash',
        type: 'cash' as const,
        currencyCode: 'SAR' as const,
        openingBalanceMinor: 123
      };
      const operations = {
        list: () => service.listAccounts(),
        'paginated-list': () => service.listAccounts(),
        read: () => service.getAccount(account.id),
        summary: () => service.getAccountBalance(account.id, 'SAR'),
        create: () => service.createAccount(input, 'create-key'),
        update: () => service.updateAccount(account.id, input, 2, 'update-key'),
        archive: () => service.archiveAccount(account.id, 2, 'archive-key'),
        restore: () => service.restoreAccount(account.id, 2, 'restore-key'),
        close: () =>
          service.closeAccount(account.id, '2026-09-08', 2, 'close-key'),
        payoff: () =>
          service.calculateCreditCardPayoff({
            balanceMinor: 100,
            monthlyInterestRateBasisPoints: 0,
            paymentMinor: 100
          })
      };
      if (switchOwner)
        await expect(operations[operation]()).rejects.toMatchObject({
          code: 'session_expired'
        });
      else if (operation === 'archive')
        await expect(operations[operation]()).resolves.toBeUndefined();
      else await expect(operations[operation]()).resolves.toBeDefined();
      expect(
        request.mock.calls.every(
          ([, init]) =>
            new Headers(init?.headers).get('Authorization') === 'Bearer owner'
        )
      ).toBe(true);
    }
  );
});

it('does not dispatch an owner-A create body when token retrieval changes the Clerk owner', async () => {
  bridge.getToken.mockImplementation(async () => {
    session = { ...session, id: 'session-b', userId: 'user_owner-b' };
    return 'owner-b-token';
  });
  const request = jest.fn().mockResolvedValue(response({ account }, 201));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    request
  });
  await expect(
    service.createAccount(
      {
        name: 'Owner A cash',
        type: 'cash',
        currencyCode: 'SAR',
        openingBalanceMinor: 123
      },
      'create-a-key'
    )
  ).rejects.toMatchObject({ code: 'session_expired' });
  expect(request).not.toHaveBeenCalled();
});

it('keeps one bearer across account pages when the global provider is replaced', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementationOnce(async () => {
      createLiveAccountService({ token: async () => 'owner-b-token' });
      return response({ items: [], nextCursor: 'next-page' });
    })
    .mockResolvedValueOnce(response({ items: [account], nextCursor: null }));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    request
  });
  await expect(service.listAccounts()).resolves.toHaveLength(1);
  expect(
    request.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('Authorization')
    )
  ).toEqual(['Bearer owner', 'Bearer owner']);
});

it.each([
  { openedAt: '2026-02-30' },
  { closedAt: '2026-13-01' },
  { openedAt: '2026-02-29' }
])('rejects impossible live account calendar dates %#', async (dates) => {
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request: jest.fn().mockResolvedValue(response({ ...account, ...dates }))
  });
  await expect(service.getAccount(account.id)).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});

it('preserves valid leap days in both live account dates', async () => {
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request: jest
      .fn()
      .mockResolvedValue(
        response({ ...account, openedAt: '2024-02-29', closedAt: '2024-02-29' })
      )
  });
  await expect(service.getAccount(account.id)).resolves.toMatchObject({
    openedAt: 1709164800000,
    closedAt: 1709164800000
  });
});

it('maps card terms through authenticated create and read', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      response(
        {
          account,
          openingTransactionId: '30000000-0000-4000-8000-000000000001'
        },
        201
      )
    )
    .mockResolvedValueOnce(response(account));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  const created = await service.createAccount(
    {
      name: 'Card',
      type: 'credit_card',
      currencyCode: 'SAR',
      openingBalanceMinor: 0,
      ...terms,
      automaticTrackingEnabled: false,
      iconKey: 'card',
      colorKey: 'blue',
      sortOrder: 4,
      includeInTotals: false,
      openedAt: Date.parse('2026-09-01')
    },
    'create-key'
  );
  expect(created).toMatchObject({
    ...terms,
    currencyCode: 'SAR',
    version: 2,
    automaticTrackingEnabled: false,
    sortOrder: 4,
    includeInTotals: false,
    openedAt: Date.parse('2026-09-01'),
    closedAt: null
  });
  expect(created.openingTransactionId).toBe(
    '30000000-0000-4000-8000-000000000001'
  );
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
    ...terms,
    currency: 'SAR',
    iconKey: 'card',
    colorKey: 'blue',
    sortOrder: 4,
    includeInTotals: false,
    openedAt: '2026-09-01'
  });
  expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: 'Bearer owner',
    'Idempotency-Key': 'create-key'
  });
  const { openingTransactionId: _openingTransactionId, ...createdAccount } =
    created;
  await expect(service.getAccount('card-1')).resolves.toEqual(createdAccount);
});

it('reads the BE005 balance projection without inventing a local balance', async () => {
  const summary = {
    accountId: account.id,
    currency: 'SAR',
    balance: {
      accountId: account.id,
      currency: 'SAR',
      confirmedMinor: 12_345,
      pendingMinor: -500,
      ledgerVersion: 9,
      reconciledAt: null
    },
    recentTransactions: [],
    ledgerVersion: 9,
    requestId: 'request-1'
  };
  const request = jest.fn().mockResolvedValue(response(summary));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getAccountBalance(account.id, 'SAR')).resolves.toEqual({
    accountId: account.id,
    balanceMinor: 12_345,
    currencyCode: 'SAR',
    asOf: null
  });
  expect(request).toHaveBeenCalledWith(
    `https://api.test/api/v1/accounts/${account.id}/summary`,
    expect.any(Object)
  );

  request.mockResolvedValueOnce(
    response({ ...summary, accountId: '20000000-0000-4000-8000-000000000099' })
  );
  await expect(
    service.getAccountBalance(account.id, 'SAR')
  ).rejects.toMatchObject({ code: 'contract_mismatch' });
});

it('strictly maps the BE004 credit-card payoff response', async () => {
  const request = jest.fn().mockResolvedValue(
    response({
      status: 'payoff',
      months: 4,
      totalInterestMinor: 225,
      totalPaidMinor: 10_225,
      finalPaymentMinor: 1_225
    })
  );
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(
    service.calculateCreditCardPayoff({
      balanceMinor: 10_000,
      monthlyInterestRateBasisPoints: 100,
      paymentMinor: 3_000
    })
  ).resolves.toEqual({
    status: 'payoff',
    months: 4,
    totalInterestMinor: 225,
    totalPaidMinor: 10_225,
    finalPaymentMinor: 1_225
  });
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    balanceMinor: 10_000,
    monthlyInterestRateBasisPoints: 100,
    paymentMinor: 3_000
  });
});

it('keeps the complete draft after a conflict and sends an explicitly resolved retry', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      response(
        {
          code: 'VERSION_CONFLICT',
          message: 'stale',
          requestId: 'request-1'
        },
        409
      )
    )
    .mockResolvedValueOnce(response({ ...account, version: 3 }))
    .mockResolvedValueOnce(response({ ...account, ...terms, version: 4 }));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  const draft = {
    name: 'Card',
    type: 'credit_card' as const,
    currencyCode: 'SAR',
    openingBalanceMinor: 0,
    ...terms
  };
  await expect(
    service.updateAccount('card-1', draft, 2, 'edit-1')
  ).rejects.toThrow('conflict');
  const latest = await service.getAccount('card-1');
  await expect(
    service.updateAccount('card-1', draft, latest.version, 'edit-2')
  ).resolves.toMatchObject({ ...terms, version: 4 });
  expect(draft).toMatchObject(terms);
  expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body))).toMatchObject({
    ...terms,
    expectedVersion: 3
  });
  expect(
    JSON.parse(String(request.mock.calls[2]?.[1]?.body))
  ).not.toHaveProperty('currency');
});

it.each([
  'bank',
  'debit_card',
  'credit_card',
  'wallet',
  'cash',
  'savings',
  'other'
] as const)(
  'round-trips the %s account type without fallback',
  async (type) => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response({ ...account, type }));
    const service = createLiveAccountService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request
    });

    await expect(service.getAccount('account-1')).resolves.toMatchObject({
      type
    });
  }
);

it('preserves closed state, totals, tracking, dates, ordering, and every card term', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(
      response({ ...account, status: 'closed', closedAt: '2026-09-08' })
    );
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getAccount('card-1')).resolves.toMatchObject({
    status: 'closed',
    sortOrder: 4,
    includeInTotals: false,
    automaticTrackingEnabled: false,
    openedAt: Date.parse('2026-09-01'),
    closedAt: Date.parse('2026-09-08'),
    ...terms
  });
});

it('accepts an OpenAPI-valid response with omitted optional account fields', async () => {
  const {
    institutionName: _institutionName,
    lastFour: _lastFour,
    creditLimitMinor: _creditLimitMinor,
    iconKey: _iconKey,
    colorKey: _colorKey,
    notes: _notes,
    openedAt: _openedAt,
    closedAt: _closedAt,
    ...required
  } = account;
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request: jest.fn().mockResolvedValue(response(required))
  });

  await expect(service.getAccount('account-1')).resolves.toMatchObject({
    institution: null,
    lastFour: null,
    creditLimitMinor: null,
    iconKey: null,
    colorKey: null,
    notes: null,
    openedAt: null,
    closedAt: null
  });
});

it.each([
  { type: 'future_account' },
  { status: 'suspended' },
  { unexpected: true }
])('rejects unknown account contract values %#', async (change) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(response({ ...account, ...change }));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getAccount('card-1')).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});

it('lists and round-trips archive, restore, and close lifecycle responses', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ items: [account], nextCursor: null }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      response({ ...account, status: 'active', version: 3 })
    )
    .mockResolvedValueOnce(
      response({
        ...account,
        status: 'closed',
        closedAt: '2026-09-08',
        version: 4
      })
    );
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.listAccounts()).resolves.toHaveLength(1);
  await expect(
    service.archiveAccount(account.id, 2, 'archive-key')
  ).resolves.toBe(undefined);
  await expect(
    service.restoreAccount(account.id, 2, 'restore-key')
  ).resolves.toMatchObject({ status: 'active', version: 3 });
  await expect(
    service.closeAccount(account.id, '2026-09-08', 3, 'close-key')
  ).resolves.toMatchObject({
    status: 'closed',
    closedAt: Date.parse('2026-09-08'),
    version: 4
  });
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    'https://api.test/api/v1/accounts?limit=100&status=active',
    `https://api.test/api/v1/accounts/${account.id}?expectedVersion=2`,
    `https://api.test/api/v1/accounts/${account.id}/restore`,
    `https://api.test/api/v1/accounts/${account.id}/close`
  ]);
});
