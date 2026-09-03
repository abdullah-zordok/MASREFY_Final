import { createLiveAssistantApiService } from './assistant-api-service';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

it('uses the owner API and maps a completed assistant response without fixtures or route controls', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json({ id: 'c1', title: 'Spend?', status: 'active', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z', version: 1 }, 201))
    .mockResolvedValueOnce(json({ id: 'u1', status: 'queued' }, 202))
    .mockResolvedValueOnce(json({ items: [
      { id: 'a1', conversationId: 'c1', replyToMessageId: 'u1', role: 'assistant', content: 'Safe answer', createdAt: '2026-09-03T00:00:01.000Z', snapshot: { evidenceRefs: [{ alias: 'TX-1', version: 2 }] }, preview: null },
      { id: 'u1', conversationId: 'c1', role: 'user', content: 'Spend?', createdAt: '2026-09-03T00:00:00.000Z' }
    ], nextCursor: null }));
  const service = createLiveAssistantApiService({ baseUrl: 'https://api.test', token: async () => 'owner', request, sleep: async () => {} });
  const result = await service.createConversation({ question: 'Spend?' }, 'operation-00000001');
  expect(result.value).toMatchObject({ id: 'c1', lastResponseId: 'a1' });
  await expect(service.getResponse('a1')).resolves.toMatchObject({ question: 'Spend?', blocks: [{ key: 'Safe answer' }] });
  expect(request.mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer owner', 'Idempotency-Key': 'operation-00000001-message' }));
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ title: null });
  expect(JSON.stringify(request.mock.calls)).not.toMatch(/openrouter|provider|model|maxPrice|zdr/i);
});
