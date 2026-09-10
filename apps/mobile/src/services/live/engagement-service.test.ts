import { createNotificationPreferences, notificationCategorySchema } from '@/domain/notifications';
import type { SupportDraft } from '@/domain/support';
import {
  createLiveNotificationService,
  createLiveSupportService,
} from './engagement-service';

const id = (suffix: number) => `11000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-10T08:00:00.000Z';

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notification(
  suffix: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: id(suffix),
    type: 'transaction.created',
    title: 'Transaction detected',
    body: 'Review the detected transaction.',
    dataSafe: { targetKind: 'transaction', targetId: id(90) },
    readAt: null,
    actedAt: null,
    expiresAt: '2026-09-11T08:00:00.000Z',
    actions: [{ key: 'view', expiresAt: '2026-09-10T09:00:00.000Z' }],
    version: 1,
    createdAt: at,
    ...overrides,
  };
}

function ticket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: id(20),
    categoryId: id(21),
    subject: 'Card payment needs review',
    status: 'waiting_support',
    priority: 'high',
    lastMessageAt: at,
    closedAt: null,
    version: 2,
    createdAt: at,
    messages: [
      {
        id: id(22),
        senderType: 'customer',
        body: 'Please review the receipt.',
        attachments: [
          {
            id: id(23),
            filename: 'receipt.png',
            contentType: 'image/png',
            sizeBytes: 2048,
            status: 'clean',
          },
        ],
        createdAt: at,
      },
    ],
    nextCursor: null,
    hasMore: false,
    ...overrides,
  };
}

it('decodes notification enums/actions strictly and uses each action expiry', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      response({ items: [notification(1)], nextCursor: null, hasMore: false, unreadCount: 1 }),
    )
    .mockResolvedValueOnce(
      response({
        items: [notification(2, { actions: [{ key: 'archive', expiresAt: null }] })],
        nextCursor: null,
        hasMore: false,
        unreadCount: 1,
      }),
    )
    .mockResolvedValueOnce(
      response({
        items: [notification(3, { type: 'mystery.created' })],
        nextCursor: null,
        hasMore: false,
        unreadCount: 1,
      }),
    ) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  const page = await service.list({});
  expect(page.items[0]?.availableActions).toEqual([
    { kind: 'view', expiresAt: Date.parse('2026-09-10T09:00:00.000Z'), sourceVersion: null },
  ]);
  await expect(service.list({})).rejects.toBeDefined();
  await expect(service.list({})).rejects.toBeDefined();
});

it('traverses every unread notification page before marking all read', async () => {
  const request = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') return response(notification(url.includes(id(1)) ? 1 : 2));
    if (url.includes('cursor=next'))
      return response({ items: [notification(2)], nextCursor: null, hasMore: false, unreadCount: 2 });
    return response({ items: [notification(1)], nextCursor: 'next', hasMore: true, unreadCount: 2 });
  }) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  await expect(service.markAllRead({}, 'mark-all')).resolves.toMatchObject({ value: 2 });
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  expect(request.mock.calls.some(([url]) => String(url).includes('cursor=next'))).toBe(true);
});

it('returns the authoritative notification after marking it read', async () => {
  const readAt = '2026-09-10T08:45:00.000Z';
  const request = jest
    .fn()
    .mockResolvedValueOnce(response(notification(1)))
    .mockResolvedValueOnce(
      response({
        resourceId: id(1),
        outcome: 'success',
        currentState: 'read',
        version: 2,
        requestId: 'request-1',
      }),
    )
    .mockResolvedValueOnce(response(notification(1, { version: 2, readAt }))) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  const mutation = await service.markRead(id(1), true);

  expect(mutation.value).toMatchObject({
    eventKey: `server:${id(1)}:2`,
    readAt: Date.parse(readAt),
  });
  expect(request).toHaveBeenCalledTimes(3);
});

it('round-trips the full preference matrix while retaining device-only settings', async () => {
  const local = {
    ...createNotificationPreferences(100),
    dailySummary: { enabled: true, time: '08:30' },
    weeklySummary: { enabled: true, weekday: 4, time: '10:15' },
    hideAmountsOnLockScreen: false,
    permissionState: 'granted' as const,
  };
  const preferences = {
    getNotificationPreferences: jest.fn().mockResolvedValue(local),
    saveNotificationPreferences: jest.fn(async (value: unknown) => value),
  };
  const serverItems = notificationCategorySchema.options.map((category, index) => ({
    channel: 'push',
    eventType: `${category}.event`,
    enabled: category !== 'budget',
    quietHours: {
      enabled: true,
      start: '23:00',
      end: '06:00',
      weekdays: [0, 1, 2, 3, 4],
      timeZone: 'Asia/Riyadh',
    },
    version: index + 1,
  }));
  const request = jest
    .fn()
    .mockResolvedValueOnce(response({ items: serverItems, version: 6 }))
    .mockResolvedValueOnce(response({ items: serverItems, version: 7 })) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
    preferences,
  } as never);

  const loaded = await service.getPreferences();
  expect(loaded).toMatchObject({
    version: 6,
    phoneEnabled: true,
    categoryEnabled: { budget: false, transaction: true, system: true },
    dailySummary: local.dailySummary,
    weeklySummary: local.weeklySummary,
    hideAmountsOnLockScreen: false,
    permissionState: 'granted',
  });
  const input = {
    ...loaded,
    categoryEnabled: { ...loaded.categoryEnabled, budget: true, security: false },
  };
  const saved = await service.savePreferences(input, 6, 'preferences-6');
  expect(saved.value.version).toBe(7);
  const putBody = JSON.parse(String((request.mock.calls[1]?.[1] as RequestInit).body)) as {
    items: { eventType: string; enabled: boolean }[];
  };
  expect(putBody.items.find((item) => item.eventType === 'budget.event')?.enabled).toBe(true);
  expect(putBody.items.find((item) => item.eventType === 'security.event')?.enabled).toBe(false);
  expect(preferences.saveNotificationPreferences).toHaveBeenCalled();
});

it('does not erase device-only preferences when local storage fails', async () => {
  const storageFailure = new Error('database_locked');
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request: jest.fn().mockResolvedValue(
      response({
        items: [],
        version: 1,
      }),
    ) as unknown as jest.MockedFunction<typeof fetch>,
    preferences: {
      getNotificationPreferences: jest.fn().mockRejectedValue(storageFailure),
      saveNotificationPreferences: jest.fn(),
    },
  } as never);

  await expect(service.getPreferences()).rejects.toBe(storageFailure);
});

it('connects permission education to native registration and the owner device endpoint', async () => {
  const phone = {
    getPermission: jest.fn().mockResolvedValue('denied'),
    requestPermission: jest.fn().mockResolvedValue('granted'),
    registerCategories: jest.fn().mockResolvedValue(undefined),
  };
  const registration = {
    deviceFingerprint: '11000000-0000-4000-8000-000000000099',
    platform: 'android' as const,
    appVersion: '0.0.1',
    pushToken: 'ExponentPushToken[device-registration]',
    pushProvider: 'expo' as const,
  };
  const request = jest
    .fn()
    .mockResolvedValue(
      response({ deviceId: id(99), registeredAt: at, version: 1 }),
    ) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveNotificationService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
    phone,
    pushRegistration: async () => registration,
  } as never);

  await expect(service.refreshPermission()).resolves.toBe('denied');
  await expect(service.requestPermissionAfterEducation()).resolves.toBe('granted');
  expect(phone.registerCategories).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    'https://api.example.test/api/v1/me/devices/register',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Idempotency-Key': expect.not.stringContaining('device-registration'),
      }),
      body: JSON.stringify(registration),
    }),
  );
});

it('preserves exact ticket status and attachment metadata and rejects unknown status', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(response(ticket()))
    .mockResolvedValueOnce(response(ticket({ status: 'queued_somewhere' }))) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveSupportService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  const loaded = await service.getTicket(id(20));
  expect(loaded.status).toBe('waiting_support');
  expect(loaded.messages[0]).toMatchObject({
    id: id(22),
    attachments: [
      {
        id: id(23),
        filename: 'receipt.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        status: 'clean',
      },
    ],
  });
  await expect(service.getTicket(id(20))).rejects.toBeDefined();
});

it('traverses every ticket-message cursor without dropping history', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(response(ticket({ nextCursor: 'messages-2', hasMore: true })))
    .mockResolvedValueOnce(
      response(
        ticket({
          messages: [
            {
              id: id(24),
              senderType: 'admin',
              body: 'We are reviewing it.',
              attachments: [],
              createdAt: '2026-09-10T09:00:00.000Z',
            },
          ],
        }),
      ),
    ) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveSupportService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  const loaded = await service.getTicket(id(20));
  expect(loaded.messages.map((message) => message.id)).toEqual([id(22), id(24)]);
  expect(request.mock.calls[1]?.[0]).toBe(
    `https://api.example.test/api/v1/support/tickets/${id(20)}?cursor=messages-2&limit=100`,
  );
});

it('sends reply attachment IDs unchanged', async () => {
  const request = jest.fn().mockResolvedValue(response(ticket())) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveSupportService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
  });

  await service.reply(
    id(20),
    { description: 'Attached is the receipt.', attachmentUploadIds: [id(30)] } as never,
    2,
    'reply-2',
  );
  expect(JSON.parse(String((request.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
    body: 'Attached is the receipt.',
    attachmentUploadIds: [id(30)],
    expectedVersion: 2,
  });
});

it('keeps the draft and refuses ticket submission when its category is unavailable', async () => {
  const draft = {
    id: 'draft-1',
    mode: 'ticket',
    category: 'missing_category',
    subject: 'Card payment needs review',
    description: 'Please review the card payment.',
    ticketId: null,
    context: null,
    attachmentUploadIds: [id(30)],
    status: 'draft',
    updatedAt: 1,
  } as unknown as SupportDraft;
  const drafts = {
    saveDraft: jest.fn(),
    loadDraft: jest.fn().mockResolvedValue(draft),
    discardDraft: jest.fn(),
  };
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      response({
        items: [{ id: id(40), key: 'other', name: 'Other', sortOrder: 1, active: true, version: 1 }],
        nextCursor: null,
        hasMore: false,
      }),
    ) as unknown as jest.MockedFunction<typeof fetch>;
  const service = createLiveSupportService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request,
    drafts,
  });

  await expect(service.submitDraft('draft-1', 'submit-1')).rejects.toBeDefined();
  expect(drafts.discardDraft).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
