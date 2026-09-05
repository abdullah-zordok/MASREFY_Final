import { createEngagementApi, createLiveNotificationService, EngagementApiError } from '../live/engagement-service';

function response(status: number, value: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(value) } as Response;
}

test('notification adapter uses bearer, cursor, version and idempotency contracts', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response(200, { items: [], nextCursor: null, hasMore: false }));
  const api = createEngagementApi({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });
  await api.listNotifications({ cursor: 'opaque cursor', type: 'security', unread: true, limit: 25 });
  await api.markNotificationRead('10000000-0000-4000-8000-000000000001', 3, 'operation-1');
  expect(request).toHaveBeenNthCalledWith(1, 'https://api.example/api/v1/notifications?limit=25&cursor=opaque%20cursor&type=security&unread=true', expect.objectContaining({ method: 'GET' }));
  expect(request).toHaveBeenNthCalledWith(2, expect.stringContaining('/read'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer session', 'Idempotency-Key': 'operation-1' }), body: JSON.stringify({ read: true, expectedVersion: 3 }) }));
});

test('notification adapter maps safe errors without returning server payloads', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response(403, { detail: 'secret' }));
  const api = createEngagementApi({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });
  await expect(api.getNotification('missing')).rejects.toEqual(new EngagementApiError('forbidden'));
});

test('live notification provider maps safe server fields and unread totals', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response(200, {
    items: [{ id: '10000000-0000-4000-8000-000000000001', type: 'security.session_revoked', title: 'Security update', body: 'Review your settings', dataSafe: { targetKind: 'settings', targetId: 'notifications' }, readAt: null, actedAt: null, expiresAt: null, actions: [{ key: 'view', expiresAt: null }], version: 2, createdAt: '2026-09-05T08:00:00Z' }],
    nextCursor: null,
    hasMore: false,
    unreadCount: 1
  }));
  const service = createLiveNotificationService({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });

  const result = await service.list({ unreadOnly: true });

  expect(service.metadata).toMatchObject({ kind: 'live', availability: 'available' });
  expect(result).toMatchObject({ total: 1, items: [{ category: 'security', titleKey: 'Security update', bodyKey: 'Review your settings', readAt: null, target: { kind: 'settings', key: 'notifications' } }] });
  expect(request).toHaveBeenCalledWith(expect.stringContaining('unread=true'), expect.anything());
  expect(JSON.stringify(result)).not.toMatch(/dataSafe|provider|deviceToken/u);
});

test('protected target resolution always refetches the authenticated detail', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response(200, { id: '10000000-0000-4000-8000-000000000001', type: 'transaction.created', title: 'Update', body: 'Review details', dataSafe: { targetKind: 'transaction', targetId: '20000000-0000-4000-8000-000000000002' }, readAt: null, actedAt: null, expiresAt: null, actions: [{ key: 'view', expiresAt: null }], version: 1, createdAt: '2026-09-05T08:00:00Z' }));
  const service = createLiveNotificationService({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });
  await expect(service.resolveTarget('10000000-0000-4000-8000-000000000001')).resolves.toEqual({ status: 'exact', target: { kind: 'transaction', transactionId: '20000000-0000-4000-8000-000000000002' } });
  expect(request).toHaveBeenCalledWith(expect.stringContaining('/api/v1/notifications/10000000-0000-4000-8000-000000000001'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer session' }) }));
});
