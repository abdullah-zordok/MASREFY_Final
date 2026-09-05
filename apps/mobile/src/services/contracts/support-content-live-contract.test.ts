import { createEngagementApi, createLiveSupportService } from '../live/engagement-service';

const ok = (value: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(value) }) as Response;

test('support and published-content routes are server backed and bounded', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(ok({ items: [], nextCursor: null, hasMore: false }));
  const api = createEngagementApi({ baseUrl: 'https://api.example/', token: () => Promise.resolve('session'), request });
  await api.listTickets('next/one');
  await api.listContent('ar', 'faq', 'بطاقة');
  expect(request.mock.calls[0]?.[0]).toBe('https://api.example/api/v1/support/tickets?limit=50&cursor=next%2Fone');
  expect(request.mock.calls[1]?.[0]).toBe('https://api.example/api/v1/content?locale=ar&type=faq&query=%D8%A8%D8%B7%D8%A7%D9%82%D8%A9&limit=100');
});

test('support writes carry caller-stable idempotency keys', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(ok({ resourceId: 'ticket' }));
  const api = createEngagementApi({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });
  await api.createTicket({ categoryId: 'category', subject: 'Help', message: 'Please help' }, 'operation-2');
  expect(request).toHaveBeenCalledWith('https://api.example/api/v1/support/tickets', expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'operation-2' }) }));
});

test('support attachment initialize, finalize, and download use protected server routes', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(ok({ uploadId: 'upload-1', uploadUrl: 'https://storage.example/upload' }));
  const api = createEngagementApi({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request });

  await api.initializeUpload('ticket/1', { fileName: 'proof.pdf', contentType: 'application/pdf', sizeBytes: 42 }, 'upload-op-1');
  await api.finalizeUpload('ticket/1', { uploadId: 'upload-1', checksum: 'abc' }, 'upload-op-2');
  await api.downloadAttachment('attachment/1');

  expect(request.mock.calls.map(([url]) => url)).toEqual([
    'https://api.example/api/v1/support/tickets/ticket%2F1/attachments/uploads',
    'https://api.example/api/v1/support/tickets/ticket%2F1/attachments/finalize',
    'https://api.example/api/v1/support/attachments/attachment%2F1/download'
  ]);
  expect(request.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'upload-op-1' }) }));
  expect(request.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'upload-op-2' }) }));
});

test('live support provider maps tickets and published content into existing screens', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(ok({ items: [{ id: '10000000-0000-4000-8000-000000000001', categoryId: '20000000-0000-4000-8000-000000000001', subject: 'Help', status: 'waiting_customer', priority: 'normal', version: 3, lastMessageAt: '2026-09-05T08:00:00Z', createdAt: '2026-09-05T07:00:00Z' }], nextCursor: null, hasMore: false }))
    .mockResolvedValueOnce(ok({ items: [{ key: 'card-help', type: 'faq', locale: 'en', title: 'Card help', body: 'How to get help', version: 2, publishedAt: '2026-09-05T07:00:00Z' }], nextCursor: null, hasMore: false }));
  const drafts = { saveDraft: jest.fn(), loadDraft: jest.fn(), discardDraft: jest.fn() };
  const service = createLiveSupportService({ baseUrl: 'https://api.example', token: () => Promise.resolve('session'), request, drafts });

  const tickets = await service.listTickets();
  const articles = await service.searchArticles({ query: 'card', category: 'faq' });

  expect(tickets.items[0]).toMatchObject({ subject: 'Help', status: 'waiting_user', version: 3 });
  expect(articles[0]).toMatchObject({ id: 'card-help', kind: 'faq', titleKey: 'Card help', bodyKey: 'How to get help' });
});
