import { createLiveCategoryLifecycleService } from './category-lifecycle-service';
import { createDefaultCategories } from '@/domain/core-finance-seeds';
import { registerLiveClerkBridge, type LiveClerkBridge } from './auth-service';

const mockCategoryPayloads = new Map<string, string>();
const mockOtherOwnerPayloads = new Map<string, string>();
const mockDatabaseFor = (payloads: Map<string, string>) => ({
  execAsync: async () => undefined,
  getAllAsync: jest.fn(async (sql: string) =>
    sql.includes('finance_categories')
      ? Array.from(payloads.values(), (payload) => ({ payload }))
      : []
  ),
  runAsync: jest.fn(async (_sql: string, id: string, payload: string) => {
    payloads.set(id, payload);
  })
});
const mockOwnerDatabase = mockDatabaseFor(mockCategoryPayloads);
const mockOtherOwnerDatabase = mockDatabaseFor(mockOtherOwnerPayloads);
let mockActiveDatabase = mockOwnerDatabase;
let mockSession = {
  id: 'session-a',
  userId: 'user_owner-a',
  method: 'google' as const,
  issuedAt: 1,
  expiresAt: 9999999999999
};
let mockToken = 'owner-token';
const mockBridge = {
  getSession: async () => mockSession,
  getToken: jest.fn(async () => mockToken),
  startPhone: jest.fn(),
  verifyPhone: jest.fn(),
  resendPhone: jest.fn(),
  signInWithGoogle: jest.fn(),
  reverifyConflict: jest.fn(),
  signOut: jest.fn()
} satisfies LiveClerkBridge;
jest.mock('@/storage/database', () => ({
  runExclusiveDatabaseTransaction: async (
    database: unknown,
    action: (database: unknown) => Promise<void>
  ) => {
    if (database !== mockActiveDatabase)
      throw new Error('stale database owner');
    await action(database);
  },
  openDatabase: async (userId?: string) => {
    const owner =
      mockActiveDatabase === mockOwnerDatabase
        ? 'user_owner-a'
        : 'user_owner-b';
    if (userId && userId !== owner) throw new Error('stale database owner');
    return mockActiveDatabase;
  }
}));
beforeEach(() => {
  mockCategoryPayloads.clear();
  mockOtherOwnerPayloads.clear();
  mockActiveDatabase = mockOwnerDatabase;
  jest.clearAllMocks();
  mockSession = { ...mockSession, id: 'session-a', userId: 'user_owner-a' };
  mockToken = 'owner-token';
  mockBridge.getToken.mockImplementation(async () => mockToken);
  registerLiveClerkBridge(mockBridge);
});

jest.mock('expo-crypto', () => ({ randomUUID: () => 'operation-key' }));

const response = (value: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(value), { status });
const mergedCategory = {
  id: '10000000-0000-4000-8000-000000000001',
  scope: 'custom',
  kind: 'expense',
  labelAr: 'سفر',
  labelEn: 'Travel',
  icon: null,
  color: null,
  systemKey: null,
  parentId: null,
  mergedIntoId: '10000000-0000-4000-8000-000000000002',
  sortOrder: 2,
  active: false,
  status: 'merged',
  version: 8,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z'
};

describe.each(['usage', 'archive', 'restore', 'merge'] as const)(
  '%s remote category operation',
  (operation) => {
    it.each([false, true])(
      'rejects a delayed owner transition and keeps same-owner behavior (switch: %s)',
      async (switchOwner) => {
        const request = jest.fn(async () => {
          if (switchOwner)
            mockSession = {
              ...mockSession,
              id: 'session-b',
              userId: 'user_owner-b'
            };
          if (operation === 'usage')
            return response({ linkedTransactionCount: 3, version: 8 });
          if (operation === 'archive') return response(null, 204);
          if (operation === 'merge')
            return response({
              source: mergedCategory,
              targetId: mergedCategory.mergedIntoId
            });
          return response({
            ...mergedCategory,
            status: 'active',
            active: true,
            mergedIntoId: null
          });
        });
        const service = createLiveCategoryLifecycleService({
          baseUrl: 'https://api.test',
          request
        });
        const preview = { linkedTransactionCount: 3, version: 8 };
        const pending =
          operation === 'usage'
            ? service.getCategoryUsage('source')
            : operation === 'merge'
              ? service.mergeCategory('source', 'target', preview)
              : service.setCategoryStatus(
                  'source',
                  operation === 'archive' ? 'archived' : 'active',
                  preview
                );
        if (switchOwner)
          await expect(pending).rejects.toMatchObject({
            code: 'session_expired'
          });
        else await expect(pending).resolves.toBeDefined();
        expect(mockOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
        expect(mockOwnerDatabase.runAsync).not.toHaveBeenCalled();
      }
    );
  }
);

describe.each(['list', 'paginated list', 'create', 'update'] as const)(
  'delayed %s response',
  (operation) => {
    it.each([false, true])(
      'keeps the captured owner boundary (owner switched: %s)',
      async (switchOwner) => {
        mockToken = 'owner-a-token';
        const custom = {
          ...mergedCategory,
          mergedIntoId: null,
          status: 'active',
          active: true
        };
        const system = {
          ...custom,
          id: '10000000-0000-4000-8000-000000000010',
          scope: 'system',
          systemKey: 'food'
        };
        const food = createDefaultCategories().find(
          (category) => category.id === 'food'
        )!;
        mockCategoryPayloads.set(
          'food',
          JSON.stringify({ ...food, isFavorite: false })
        );
        mockOtherOwnerPayloads.set(
          'food',
          JSON.stringify({ ...food, isFavorite: true })
        );
        const otherOwnerBefore = [...mockOtherOwnerPayloads];
        let completeResponse!: (value: Response) => void;
        const delayedResponse = new Promise<Response>((resolve) => {
          completeResponse = resolve;
        });
        let signalRequest!: () => void;
        const requestStarted = new Promise<void>((resolve) => {
          signalRequest = resolve;
        });
        const request = jest.fn<
          ReturnType<typeof fetch>,
          Parameters<typeof fetch>
        >(async (url) => {
          if (String(url).endsWith('/usage'))
            return response({ linkedTransactionCount: 0, version: 8 });
          if (
            operation === 'paginated list' &&
            !String(url).includes('cursor=')
          )
            return response({ items: [system], nextCursor: 'next-page' });
          signalRequest();
          return delayedResponse;
        });
        const service = createLiveCategoryLifecycleService({
          baseUrl: 'https://api.test',
          token: async () => 'owner-a-token',
          request
        });
        const input = {
          labelAr: 'سفر',
          labelEn: 'Travel',
          financialType: 'expense' as const,
          isFavorite: true
        };
        const isList = operation === 'list' || operation === 'paginated list';
        const pending = isList
          ? service.listCategories(true)
          : operation === 'create'
            ? service.createCategory(input, 'owner-a-operation')
            : service.updateCategory(custom.id, input, 8, 'owner-a-operation');
        await requestStarted;
        expect(request.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
          Authorization: 'Bearer owner-a-token'
        });
        if (switchOwner) mockActiveDatabase = mockOtherOwnerDatabase;
        completeResponse(
          response(
            isList
              ? {
                  items:
                    operation === 'paginated list'
                      ? [custom]
                      : [system, custom],
                  nextCursor: null
                }
              : custom
          )
        );

        if (switchOwner) {
          if (isList)
            await expect(pending).rejects.toThrow('stale database owner');
          else
            await expect(pending).rejects.toMatchObject({
              code: 'provider_unavailable',
              status: 503
            });
          expect(mockOtherOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
          expect(mockOtherOwnerDatabase.runAsync).not.toHaveBeenCalled();
          expect([...mockOtherOwnerPayloads]).toEqual(otherOwnerBefore);
          await service.getCategoryUsage('food');
          expect(request.mock.calls.at(-1)?.[0]).toBe(
            'https://api.test/api/v1/categories/food/usage'
          );
        } else {
          await expect(pending).resolves.toBeDefined();
          expect(
            JSON.parse(mockCategoryPayloads.get(custom.id)!)
          ).toMatchObject({
            id: custom.id,
            isFavorite: !isList
          });
          expect(JSON.parse(mockCategoryPayloads.get('food')!)).toMatchObject({
            id: 'food',
            isFavorite: false
          });
          if (!isList)
            expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
              'Idempotency-Key': 'owner-a-operation'
            });
        }
      }
    );
  }
);

it.each(['list', 'create', 'update'] as const)(
  'rejects %s when Clerk is owner B but the database is still owner A',
  async (operation) => {
    mockSession = { ...mockSession, id: 'session-b', userId: 'user_owner-b' };
    mockToken = 'owner-b-token';
    const category = {
      ...mergedCategory,
      mergedIntoId: null,
      active: true,
      status: 'active'
    };
    const request = jest
      .fn()
      .mockResolvedValue(
        response(
          operation === 'list'
            ? { items: [category], nextCursor: null }
            : category
        )
      );
    const service = createLiveCategoryLifecycleService({
      baseUrl: 'https://api.test',
      request
    });
    const input = {
      labelAr: 'سفر',
      labelEn: 'Travel',
      financialType: 'expense' as const,
      isFavorite: true
    };
    const pending =
      operation === 'list'
        ? service.listCategories(true)
        : operation === 'create'
          ? service.createCategory(input)
          : service.updateCategory(category.id, input, 8);
    await expect(pending).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(mockOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
    expect(mockOwnerDatabase.runAsync).not.toHaveBeenCalled();
    expect(mockOtherOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
    expect(mockOtherOwnerDatabase.runAsync).not.toHaveBeenCalled();
  }
);

it('rejects a session transition while obtaining the operation token', async () => {
  mockBridge.getToken.mockImplementation(async () => {
    mockSession = { ...mockSession, id: 'session-b', userId: 'user_owner-b' };
    return 'owner-b-token';
  });
  const request = jest
    .fn()
    .mockResolvedValue(response({ items: [], nextCursor: null }));
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    request
  });
  await expect(service.listCategories(true)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  expect(mockOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
});

it.each(['list', 'create', 'update'] as const)(
  'rejects a delayed %s response after Clerk changes owner but before the database switches',
  async (operation) => {
    const category = {
      ...mergedCategory,
      mergedIntoId: null,
      active: true,
      status: 'active'
    };
    const request = jest.fn(async () => {
      mockSession = { ...mockSession, id: 'session-b', userId: 'user_owner-b' };
      return response(
        operation === 'list'
          ? { items: [category], nextCursor: null }
          : category
      );
    });
    const service = createLiveCategoryLifecycleService({
      baseUrl: 'https://api.test',
      request
    });
    const input = {
      labelAr: 'سفر',
      labelEn: 'Travel',
      financialType: 'expense' as const,
      isFavorite: true
    };
    const pending =
      operation === 'list'
        ? service.listCategories(true)
        : operation === 'create'
          ? service.createCategory(input)
          : service.updateCategory(category.id, input, 8);
    await expect(pending).rejects.toThrow();
    expect(mockOwnerDatabase.getAllAsync).not.toHaveBeenCalled();
    expect(mockOwnerDatabase.runAsync).not.toHaveBeenCalled();
  }
);

it('uses the captured bearer across list pages even if another provider replaces the global token', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementationOnce(async () => {
      createLiveCategoryLifecycleService({
        token: async () => 'unrelated-owner-token'
      });
      return response({ items: [], nextCursor: 'next' });
    })
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    request
  });
  await service.listCategories(true);
  expect(
    request.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('Authorization')
    )
  ).toEqual(['Bearer owner-token', 'Bearer owner-token']);
});

it('accepts a same-session Clerk bridge refresh while the request is in flight', async () => {
  const request = jest.fn(async () => {
    registerLiveClerkBridge({ ...mockBridge });
    return response({ items: [], nextCursor: null });
  });
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    request
  });
  await expect(service.listCategories(true)).resolves.toEqual([]);
});

it('hydrates persisted favorites and retains changes across provider recreation', async () => {
  const system = {
    ...mergedCategory,
    id: '10000000-0000-4000-8000-000000000010',
    scope: 'system',
    systemKey: 'food',
    mergedIntoId: null,
    status: 'active',
    active: true
  };
  const custom = {
    ...mergedCategory,
    mergedIntoId: null,
    status: 'active',
    active: true
  };
  const food = createDefaultCategories().find(
    (category) => category.id === 'food'
  )!;
  mockCategoryPayloads.set(
    'food',
    JSON.stringify({ ...food, isFavorite: false })
  );
  mockCategoryPayloads.set(
    custom.id,
    JSON.stringify({
      ...food,
      id: custom.id,
      kind: 'custom',
      systemKey: null,
      isFavorite: true
    })
  );
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async (_url, init) =>
      response(
        init?.method === 'GET'
          ? { items: [custom, system], nextCursor: null }
          : custom
      )
    );
  const makeService = () =>
    createLiveCategoryLifecycleService({
      baseUrl: 'https://api.test',
      token: async () => 'owner-token',
      request
    });
  const favorites = async () =>
    (await makeService().listCategories(true)).map(({ id, isFavorite }) => ({
      id,
      isFavorite
    }));

  expect(await favorites()).toEqual([
    { id: custom.id, isFavorite: true },
    { id: 'food', isFavorite: false }
  ]);
  const input = {
    labelAr: 'سفر',
    labelEn: 'Travel',
    financialType: 'expense' as const,
    isFavorite: false
  };
  await makeService().updateCategory(custom.id, input, 8);
  expect(await favorites()).toEqual([
    { id: custom.id, isFavorite: false },
    { id: 'food', isFavorite: false }
  ]);
  await makeService().updateCategory(
    custom.id,
    { ...input, isFavorite: true },
    8
  );
  expect(await favorites()).toEqual([
    { id: custom.id, isFavorite: true },
    { id: 'food', isFavorite: false }
  ]);
});

it('uses the owner-authenticated preview for archive and merge preconditions', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ linkedTransactionCount: 3, version: 7 }))
    .mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(
      response({
        source: mergedCategory,
        targetId: mergedCategory.mergedIntoId
      })
    );
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const preview = await service.getCategoryUsage('source');
  await service.setCategoryStatus('source', 'archived', preview);
  await service.mergeCategory('source', 'target', preview);

  expect(request.mock.calls[0]?.[0]).toBe(
    'https://api.test/api/v1/categories/source/usage'
  );
  expect(request.mock.calls[1]?.[0]).toContain(
    'expectedLinkedTransactionCount=3'
  );
  expect(request.mock.calls[2]?.[1]).toMatchObject({
    headers: expect.objectContaining({
      Authorization: 'Bearer owner-token',
      'Idempotency-Key': 'operation-key'
    }),
    body: JSON.stringify({
      targetId: 'target',
      expectedVersion: 7,
      expectedLinkedTransactionCount: 3
    })
  });
});

it('rejects stale usage, then accepts a fresh server-authoritative recount', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ linkedTransactionCount: 3, version: 7 }))
    .mockResolvedValueOnce(
      response(
        {
          code: 'CATEGORY_USAGE_CHANGED',
          message: 'stale',
          requestId: 'request-1'
        },
        409
      )
    )
    .mockResolvedValueOnce(response({ linkedTransactionCount: 4, version: 8 }))
    .mockResolvedValueOnce(response(null, 204));
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });

  const stale = await service.getCategoryUsage('source');
  await expect(
    service.setCategoryStatus('source', 'archived', stale)
  ).rejects.toMatchObject({ code: 'conflict' });
  const fresh = await service.getCategoryUsage('source');
  await expect(
    service.setCategoryStatus('source', 'archived', fresh)
  ).resolves.toBeDefined();
  expect(request.mock.calls[3]?.[0]).toContain(
    'expectedLinkedTransactionCount=4'
  );
  expect(request.mock.calls[3]?.[0]).toContain('expectedVersion=8');
});

it.each([
  { linkedTransactionCount: -1, version: 1 },
  { linkedTransactionCount: 1, version: 0 },
  { linkedTransactionCount: 1, version: 1, unexpected: true }
])('rejects unknown category usage values %#', async (value) => {
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest.fn().mockResolvedValue(response(value))
  });

  await expect(service.getCategoryUsage('source')).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});

it('round-trips every category field through list, create, and update', async () => {
  const category = {
    ...mergedCategory,
    mergedIntoId: null,
    active: true,
    status: 'active',
    version: 2
  };
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ items: [category], nextCursor: null }))
    .mockResolvedValueOnce(response(category, 201))
    .mockResolvedValueOnce(
      response({ ...category, labelEn: 'Trips', version: 3 })
    );
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  const input = {
    labelAr: 'سفر',
    labelEn: 'Travel',
    financialType: 'expense' as const,
    parentId: null,
    iconKey: null,
    colorKey: null,
    isFavorite: false,
    sortOrder: 2
  };

  await expect(service.listCategories(true)).resolves.toEqual([
    expect.objectContaining({
      id: category.id,
      kind: 'custom',
      financialType: 'expense',
      status: 'active',
      sortOrder: 2,
      version: 2
    })
  ]);
  const listUrl = new URL(String(request.mock.calls[0]?.[0]));
  expect(listUrl.pathname).toBe('/api/v1/categories');
  expect(Object.fromEntries(listUrl.searchParams)).toEqual({
    includeInactive: 'true',
    limit: '100'
  });
  await expect(service.createCategory(input)).resolves.toMatchObject({
    labelEn: 'Travel',
    version: 2
  });
  await expect(
    service.updateCategory(category.id, { ...input, labelEn: 'Trips' }, 2)
  ).resolves.toMatchObject({ labelEn: 'Trips', version: 3 });
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    kind: 'expense',
    labelAr: 'سفر',
    labelEn: 'Travel',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 2
  });
  expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body))).toMatchObject({
    expectedVersion: 2,
    labelEn: 'Trips'
  });
});

it('rejects unknown category response fields', async () => {
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest.fn().mockResolvedValue(
      response({
        items: [{ ...mergedCategory, unexpected: true }],
        nextCursor: null
      })
    )
  });

  await expect(service.listCategories(true)).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});

it('accepts an OpenAPI-valid category with omitted optional fields', async () => {
  const {
    icon: _icon,
    color: _color,
    systemKey: _systemKey,
    parentId: _parentId,
    mergedIntoId: _mergedIntoId,
    ...required
  } = mergedCategory;
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest
      .fn()
      .mockResolvedValue(response({ items: [required], nextCursor: null }))
  });

  await expect(service.listCategories(true)).resolves.toEqual([
    expect.objectContaining({
      iconKey: null,
      colorKey: null,
      parentId: null,
      mergedIntoId: null
    })
  ]);
});

it('maps system UUIDs to stable seed keys and keeps local favorite state', async () => {
  const system = {
    ...mergedCategory,
    id: '10000000-0000-4000-8000-000000000010',
    scope: 'system',
    systemKey: 'food',
    mergedIntoId: null,
    status: 'active',
    active: true
  };
  const service = createLiveCategoryLifecycleService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest
      .fn()
      .mockResolvedValue(response({ items: [system], nextCursor: null }))
  });

  await expect(service.listCategories()).resolves.toEqual([
    expect.objectContaining({
      id: 'food',
      systemKey: 'food',
      isFavorite: true
    })
  ]);
});
