import {
  emptyTransactionFilters,
  type Transaction
} from '@/domain/core-finance';
import { registerLiveClerkBridge, type LiveClerkBridge } from './auth-service';
import {
  createLiveCoreFinanceSync,
  createLiveLedgerService
} from './core-finance-service';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '90000000-0000-4000-8000-000000000001'
}));

const accountId = '10000000-0000-4000-8000-000000000001';
const destinationId = '10000000-0000-4000-8000-000000000002';
const categoryId = '20000000-0000-4000-8000-000000000001';
const transactionId = '30000000-0000-4000-8000-000000000001';
const linkedId = '30000000-0000-4000-8000-000000000002';
const occurredAt = '2026-09-08T12:00:00.000Z';

const bridge = {
  getSession: async () => ({
    id: 'session-a',
    userId: 'user_owner-a',
    method: 'google' as const,
    issuedAt: 1,
    expiresAt: 9_999_999_999_999
  }),
  getToken: jest.fn(async () => 'owner-token'),
  startPhone: jest.fn(),
  verifyPhone: jest.fn(),
  resendPhone: jest.fn(),
  signInWithGoogle: jest.fn(),
  reverifyConflict: jest.fn(),
  signOut: jest.fn()
} satisfies LiveClerkBridge;

beforeEach(() => {
  jest.clearAllMocks();
  registerLiveClerkBridge(bridge);
});

const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function summary(id = transactionId, patch: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'expense',
    status: 'confirmed',
    amountMinor: 1_000,
    currency: 'SAR',
    accountIds: [accountId],
    sourceAccountId: accountId,
    destinationAccountId: null,
    feeMinor: 0,
    categoryId,
    title: 'Groceries',
    merchant: null,
    paymentMethod: null,
    note: null,
    occurredAt,
    source: 'manual',
    originalTransactionId: null,
    version: 2,
    deletedAt: null,
    undoExpiresAt: null,
    ...patch
  };
}

function detail(
  transaction = summary(),
  postings: Record<string, unknown>[] = [
    {
      id: '40000000-0000-4000-8000-000000000001',
      accountId,
      amountMinor: -1_000,
      clearingState: 'confirmed',
      postingRole: 'source',
      occurredAt
    }
  ]
) {
  return {
    transaction,
    postings,
    revisions: [],
    ledgerVersion: 2,
    requestId: 'request-detail'
  };
}

function mutation(
  transaction = summary(),
  postings?: Record<string, unknown>[]
) {
  return {
    transaction: detail(transaction, postings),
    balances: [
      {
        accountId,
        currency: 'SAR',
        confirmedMinor: 9_000,
        pendingMinor: 0,
        ledgerVersion: 2,
        reconciledAt: occurredAt
      }
    ],
    ledgerVersion: 2,
    requestId: 'request-mutation'
  };
}

it('maps filtered transaction pages and preserves the server cursor', async () => {
  const request = jest.fn().mockResolvedValue(
    response({
      items: [summary()],
      nextCursor: 'next-page',
      ledgerVersion: 2,
      requestId: 'request-list'
    })
  );
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request
  });
  const page = await service.listTransactions(
    {
      ...emptyTransactionFilters,
      search: 'Groceries',
      periodStart: Date.parse('2026-09-01T00:00:00.000Z'),
      periodEnd: Date.parse('2026-09-30T23:59:59.999Z'),
      accountIds: [accountId],
      categoryIds: [categoryId],
      types: ['expense'],
      sources: ['manual'],
      statuses: ['posted']
    },
    'current-page',
    40
  );
  expect(page).toMatchObject({
    nextCursor: 'next-page',
    items: [
      {
        id: transactionId,
        type: 'expense',
        status: 'posted',
        amountMinor: 1_000,
        accountId,
        categoryId,
        version: 2
      }
    ]
  });
  expect(page).not.toHaveProperty('total');
  const url = new URL(String(request.mock.calls[0]?.[0]));
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    cursor: 'current-page',
    limit: '40',
    accountId,
    categoryId,
    kind: 'expense',
    status: 'confirmed',
    source: 'manual',
    query: 'Groceries',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z'
  });
});

it('uses explicit transfer roles when membership account IDs are UUID-sorted', async () => {
  const request = jest.fn().mockResolvedValue(
    response({
      items: [
        summary(transactionId, {
          kind: 'transfer',
          accountIds: [accountId, destinationId],
          sourceAccountId: destinationId,
          destinationAccountId: accountId,
          categoryId: null
        })
      ],
      nextCursor: null,
      ledgerVersion: 2,
      requestId: 'request-transfer-list'
    })
  );

  const page = await createLiveLedgerService({
    baseUrl: 'https://api.test',
    request
  }).listTransactions(emptyTransactionFilters);

  expect(page.items[0]).toMatchObject({
    accountId: destinationId,
    destinationAccountId: accountId
  });
});

it('keeps client-only filter values out of the BE005 query', async () => {
  const request = jest.fn().mockResolvedValue(
    response({
      items: [],
      nextCursor: null,
      ledgerVersion: 2,
      requestId: 'request-list'
    })
  );
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request
  });

  await service.listTransactions({
    ...emptyTransactionFilters,
    types: ['obligation_payment'],
    statuses: ['failed']
  });

  const url = new URL(String(request.mock.calls[0]?.[0]));
  expect(url.searchParams.has('kind')).toBe(false);
  expect(url.searchParams.has('status')).toBe(false);
});

it('uses posting roles, signs, and declared account membership for transfers', async () => {
  const transfer = summary(transactionId, {
    kind: 'transfer',
    accountIds: [accountId, destinationId],
    categoryId: null,
    feeMinor: 25
  });
  const postings = [
    {
      id: '40000000-0000-4000-8000-000000000002',
      accountId: destinationId,
      amountMinor: 1_000,
      clearingState: 'confirmed',
      postingRole: 'destination',
      occurredAt
    },
    {
      id: '40000000-0000-4000-8000-000000000001',
      accountId,
      amountMinor: -1_000,
      clearingState: 'confirmed',
      postingRole: 'source',
      occurredAt
    },
    {
      id: '40000000-0000-4000-8000-000000000003',
      accountId,
      amountMinor: -25,
      clearingState: 'confirmed',
      postingRole: 'fee',
      occurredAt
    }
  ];
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request: jest.fn().mockResolvedValue(response(detail(transfer, postings)))
  });
  await expect(service.getTransaction(transactionId)).resolves.toMatchObject({
    accountId,
    destinationAccountId: destinationId,
    amountMinor: 1_000,
    feeMinor: 25
  });

  const invalid = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request: jest
      .fn()
      .mockResolvedValue(
        response(detail(transfer, [{ ...postings[1], accountId: categoryId }]))
      )
  });
  await expect(invalid.getTransaction(transactionId)).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});

it('routes refunds, transfers, card payoff, delete, and undo with exact versions', async () => {
  const refund = summary(linkedId, {
    kind: 'refund',
    originalTransactionId: transactionId,
    amountMinor: 250
  });
  const transfer = summary(linkedId, {
    kind: 'transfer',
    accountIds: [accountId, destinationId],
    categoryId: null
  });
  const transferPostings = [
    {
      id: '40000000-0000-4000-8000-000000000001',
      accountId,
      amountMinor: -1_000,
      clearingState: 'confirmed',
      postingRole: 'source',
      occurredAt
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      accountId: destinationId,
      amountMinor: 1_000,
      clearingState: 'confirmed',
      postingRole: 'destination',
      occurredAt
    }
  ];
  const request = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === 'GET') return response(detail());
      if (url.endsWith('/refunds'))
        return response({ ...mutation(refund), original: summary() }, 201);
      if (url.endsWith('/restore')) return response(mutation(), 200);
      if (init.method === 'DELETE')
        return response({
          transactionId,
          deletedAt: occurredAt,
          undoExpiresAt: '2026-09-08T12:00:30.000Z',
          version: 3,
          balances: mutation().balances,
          ledgerVersion: 3,
          requestId: 'request-delete'
        });
      return response(mutation(transfer, transferPostings), 201);
    }
  );
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request
  });
  await expect(
    service.createTransaction(
      {
        type: 'refund',
        amountMinor: 250,
        currencyCode: 'SAR',
        accountId,
        categoryId,
        title: 'Refund',
        occurredAt: Date.parse(occurredAt),
        originalTransactionId: transactionId
      },
      'refund-operation'
    )
  ).resolves.toMatchObject({
    value: { type: 'refund', originalTransactionId: transactionId }
  });
  await service.createTransaction(
    {
      type: 'transfer',
      amountMinor: 1_000,
      currencyCode: 'SAR',
      accountId,
      destinationAccountId: destinationId,
      categoryId: null,
      title: 'Transfer',
      occurredAt: Date.parse(occurredAt)
    },
    'transfer-operation'
  );
  await expect(
    service.createCardPayoff(
      {
        fundingAccountId: accountId,
        cardAccountId: destinationId,
        amountMinor: 1_000,
        currencyCode: 'SAR',
        occurredAt: Date.parse(occurredAt),
        title: 'Card payoff'
      },
      'payoff-operation'
    )
  ).resolves.toMatchObject({ value: { transferPurpose: 'card_payoff' } });
  await expect(service.deleteTransaction(transactionId)).resolves.toMatchObject(
    {
      value: { status: 'deleted', version: 3 },
      undoExpiresAt: Date.parse('2026-09-08T12:00:30.000Z')
    }
  );
  await expect(service.undoDelete(transactionId)).resolves.toMatchObject({
    value: { status: 'posted' }
  });

  const writes = request.mock.calls.filter(
    ([, init]) => init?.method !== 'GET'
  );
  expect(writes.map(([url]) => String(url))).toEqual([
    `https://api.test/api/v1/transactions/${transactionId}/refunds`,
    'https://api.test/api/v1/transfers',
    'https://api.test/api/v1/transfers',
    `https://api.test/api/v1/transactions/${transactionId}`,
    `https://api.test/api/v1/transactions/${transactionId}/restore`
  ]);
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toMatchObject({
    expectedVersion: 2,
    amountMinor: 250
  });
  expect(JSON.parse(String(writes[1]?.[1]?.body))).toMatchObject({
    sourceAccountId: accountId,
    destinationAccountId: destinationId,
    feeMinor: 0
  });
});

it('reuses a generated transfer operation ID after an uncertain response', async () => {
  const transfer = summary(linkedId, {
    kind: 'transfer',
    accountIds: [accountId, destinationId],
    categoryId: null
  });
  const postings = [
    {
      id: '40000000-0000-4000-8000-000000000001',
      accountId,
      amountMinor: -1_000,
      clearingState: 'confirmed',
      postingRole: 'source',
      occurredAt
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      accountId: destinationId,
      amountMinor: 1_000,
      clearingState: 'confirmed',
      postingRole: 'destination',
      occurredAt
    }
  ];
  const request = jest
    .fn()
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(response(mutation(transfer, postings), 201));
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request
  });
  const input = {
    type: 'transfer' as const,
    amountMinor: 1_000,
    currencyCode: 'SAR',
    accountId,
    destinationAccountId: destinationId,
    categoryId: null,
    title: 'Transfer',
    occurredAt: Date.parse(occurredAt)
  };

  await expect(service.createTransaction(input)).rejects.toMatchObject({
    code: 'provider_unavailable'
  });
  await expect(service.createTransaction(input)).resolves.toBeDefined();
  const headers = request.mock.calls.map(
    ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']
  );
  expect(headers).toEqual([
    '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001'
  ]);
});

it.each([
  ['unsafe money', { amountMinor: Number.MAX_SAFE_INTEGER + 1 }],
  ['unsafe version', { version: Number.MAX_SAFE_INTEGER + 1 }],
  ['unknown status', { status: 'settled' }],
  ['unknown field', { privateOwnerId: 'user_owner-b' }]
])('rejects strict live ledger responses with %s', async (_case, patch) => {
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request: jest.fn().mockResolvedValue(
      response({
        items: [summary(transactionId, patch)],
        nextCursor: null,
        ledgerVersion: 2,
        requestId: 'request-list'
      })
    )
  });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).rejects.toMatchObject({ code: 'contract_mismatch' });
});

it('uploads ready mutations before bootstrapping and applying owner-scoped deltas', async () => {
  const cursor = `cursor.${'a'.repeat(43)}`;
  const repository = {
    recoverSending: jest.fn(async () => undefined),
    ready: jest
      .fn()
      .mockResolvedValueOnce([
        {
          operationId: '90000000-0000-4000-8000-000000000010',
          domain: 'transactions' as const,
          resourceType: 'transaction' as const,
          schemaVersion: 1 as const,
          dependsOn: [],
          operation: 'create',
          resourceId: 'local-one',
          baseVersion: null,
          payload: { kind: 'expense' },
          status: 'pending' as const,
          attemptCount: 0,
          nextAttemptAt: null,
          lastErrorCode: null
        }
      ])
      .mockResolvedValueOnce([]),
    markSending: jest.fn(async () => undefined),
    complete: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    mapId: jest.fn(async () => undefined),
    cursor: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cursor)
      .mockResolvedValueOnce(cursor)
  };
  const sync = {
    mutations: jest.fn(async () => ({
      data: {
        receipts: [
          {
            operationId: '90000000-0000-4000-8000-000000000010',
            status: 'applied',
            resourceId: transactionId
          }
        ]
      },
      meta: { requestId: 'mutation-request' }
    })),
    bootstrap: jest.fn(async () => ({
      data: {
        domains: [
          {
            domain: 'accounts',
            cursor,
            items: [],
            hasMore: false,
            nextPage: null
          }
        ]
      },
      meta: { requestId: 'bootstrap-request' }
    })),
    delta: jest.fn(async (domain: string) => ({
      data: {
        domain,
        changes:
          domain === 'transactions'
            ? [
                {
                  resourceId: accountId,
                  resourceType: 'account',
                  operation: 'delete',
                  version: 0,
                  deletedAt: occurredAt
                }
              ]
            : [],
        nextCursor: cursor,
        hasMore: false
      },
      meta: { requestId: 'delta-request' }
    })),
    acknowledge: jest.fn(async () => ({
      data: {},
      meta: { requestId: 'ack' }
    })),
    conflicts: jest.fn(async () => ({
      data: { items: [], nextCursor: null },
      meta: { requestId: 'conflicts' }
    }))
  };
  const adapter = {
    applyBootstrap: jest.fn(async () => undefined),
    applyDelta: jest.fn(async () => undefined),
    storeConflict: jest.fn(async () => undefined)
  };
  const coordinator = createLiveCoreFinanceSync({
    repository: repository as never,
    sync: sync as never,
    adapter: adapter as never,
    identity: async () => ({
      userId: 'user_owner-a',
      token: 'owner-token',
      assertCurrent: async () => undefined
    })
  });

  await expect(coordinator.synchronize()).resolves.toMatchObject({
    uploaded: 1,
    bootstrapped: 1,
    deltas: 2
  });
  expect(repository.recoverSending).toHaveBeenCalledTimes(1);
  expect(repository.markSending).toHaveBeenCalledWith([
    '90000000-0000-4000-8000-000000000010'
  ]);
  expect(repository.complete).toHaveBeenCalledWith(
    '90000000-0000-4000-8000-000000000010',
    'applied',
    null
  );
  expect(repository.mapId).toHaveBeenCalledWith(
    'transactions',
    'local-one',
    transactionId
  );
  expect(sync.mutations.mock.invocationCallOrder[0]).toBeLessThan(
    sync.bootstrap.mock.invocationCallOrder[0]!
  );
  expect(adapter.applyBootstrap).toHaveBeenCalledWith(
    'accounts',
    [],
    cursor,
    false
  );
  expect(adapter.applyDelta).toHaveBeenCalledTimes(2);
  expect(adapter.applyDelta).toHaveBeenCalledWith(
    'transactions',
    [
      {
        resourceId: accountId,
        operation: 'delete',
        version: 0,
        deletedAt: occurredAt
      }
    ],
    cursor,
    null
  );
  expect(sync.acknowledge).toHaveBeenCalledTimes(2);
});

it('replays a live voice batch from its durable operation receipt', async () => {
  let receipt: Transaction[] | null = null;
  const drafts = {
    hydrate: jest.fn(async () => undefined),
    batchOperationResult: jest.fn(() => receipt),
    persistBatchOperationResult: jest.fn(
      async (_operationId: string, transactions: Transaction[]) => {
        receipt = transactions;
      }
    )
  };
  const request = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/v1/me/devices'))
        return response({
          items: [
            {
              id: '80000000-0000-4000-8000-000000000001',
              current: true
            }
          ],
          nextCursor: null
        });
      const body = JSON.parse(String(init?.body)) as {
        mutations: { operationId: string }[];
      };
      return response({
        data: {
          receipts: body.mutations.map((item, index) => ({
            operationId: item.operationId,
            status: 'applied',
            resourceId: index === 0 ? transactionId : linkedId,
            result: mutation(
              summary(index === 0 ? transactionId : linkedId, {
                title: index === 0 ? 'One' : 'Two',
                source: 'voice'
              })
            )
          }))
        },
        meta: { requestId: 'voice-batch' }
      });
    }
  );
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request,
    drafts: drafts as never
  });
  const inputs = ['One', 'Two'].map((title) => ({
    type: 'expense' as const,
    amountMinor: 1_000,
    currencyCode: 'SAR',
    accountId,
    categoryId,
    title,
    occurredAt: Date.parse(occurredAt)
  }));
  const operationId = '90000000-0000-4000-8000-000000000020';
  const first = await service.createTransactionsAtomically(
    inputs,
    operationId,
    'voice'
  );
  const replay = await service.createTransactionsAtomically(
    inputs,
    operationId,
    'voice'
  );

  expect(first.value.map((item) => item.id)).toEqual([transactionId, linkedId]);
  expect(replay.value).toEqual(first.value);
  expect(drafts.persistBatchOperationResult).toHaveBeenCalledWith(
    operationId,
    first.value
  );
  const mutationCall = request.mock.calls.find(([url]) =>
    String(url).endsWith('/api/v1/sync/mutations')
  );
  const operationIds = (
    JSON.parse(String(mutationCall?.[1]?.body)) as {
      mutations: { operationId: string }[];
    }
  ).mutations.map((item) => item.operationId);
  expect(operationIds[0]).toBe(operationId);
  expect(operationIds).toHaveLength(new Set(operationIds).size);
  expect(operationIds.every((id) => /^[0-9a-f-]{36}$/u.test(id))).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});

it('maps and resolves BE006 conflicts without exposing keep-both', async () => {
  const conflictId = '70000000-0000-4000-8000-000000000001';
  const conflict = {
    id: conflictId,
    transactionId,
    clientMutationId: '70000000-0000-4000-8000-000000000002',
    serverVersion: 3,
    clientVersion: 2,
    conflictFields: ['title'],
    serverSnapshot: { title: 'Server title' },
    clientSnapshot: { title: 'Client title' },
    status: 'open',
    resolution: null,
    createdAt: occurredAt,
    resolvedAt: null
  };
  const request = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/me/devices'))
        return response({
          items: [
            {
              id: '80000000-0000-4000-8000-000000000001',
              current: true
            }
          ],
          nextCursor: null
        });
      if (url.endsWith(`/conflicts/${conflictId}`))
        return response({
          data:
            init?.method === 'PATCH'
              ? { ...conflict, status: 'resolved', resolution: 'client' }
              : conflict,
          meta: { requestId: 'conflict-request' }
        });
      return response(detail(summary(transactionId, { version: 3 })));
    }
  );
  const drafts = {
    hydrate: jest.fn(async () => undefined),
    saveConflict: jest.fn(),
    persistConflictRecord: jest.fn(async () => undefined),
    persistTransaction: jest.fn(async () => undefined)
  };
  const service = createLiveLedgerService({
    baseUrl: 'https://api.test',
    request,
    drafts: drafts as never
  });

  await expect(service.getConflict(conflictId)).resolves.toMatchObject({
    id: conflictId,
    localSnapshot: { title: 'Client title', syncStatus: 'conflict' },
    laterSnapshot: { title: 'Server title', version: 3 },
    status: 'pending'
  });
  await expect(
    service.resolveConflict(conflictId, 'keep_local')
  ).resolves.toMatchObject({ value: { title: 'Client title' } });
  await expect(
    service.resolveConflict(conflictId, 'keep_both')
  ).rejects.toMatchObject({ code: 'validation' });
  const patchCall = request.mock.calls.find(
    ([url, init]) =>
      String(url).endsWith(`/conflicts/${conflictId}`) &&
      init?.method === 'PATCH'
  );
  expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
    resolution: 'client',
    payload: { title: 'Client title' }
  });
});
