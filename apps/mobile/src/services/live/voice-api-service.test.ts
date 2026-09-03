import { createLiveVoiceApiService } from './voice-api-service';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

it('uploads private audio, requests server processing, and maps only the returned proposal', async () => {
  const wav = Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(new Response(wav, { headers: { 'content-type': 'audio/wav' } }))
    .mockResolvedValueOnce(json({ session: { id: '99000000-0000-4000-8000-000000000001', version: 1 }, upload: { url: 'https://storage.test/upload', token: 'signed', headers: { 'content-type': 'audio/wav' } } }, 201))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(json({ id: '99000000-0000-4000-8000-000000000001', status: 'queued' }, 202))
    .mockResolvedValueOnce(json({ id: '99000000-0000-4000-8000-000000000002', version: 4, redactedTranscript: 'Paid [redacted-number]', payload: { amountMinor: '1250', currency: 'SAR', accountId: '99000000-0000-4000-8000-000000000003', categoryId: '99000000-0000-4000-8000-000000000004', date: '2026-09-03', merchant: 'Shop', note: null, confidence: 0.9 }, fields: [] }))
    .mockResolvedValueOnce(json({ resourceId: '99000000-0000-4000-8000-000000000005', status: 'executed' }));
  const service = createLiveVoiceApiService({ baseUrl: 'https://api.test', token: async () => 'owner', request, sleep: async () => {}, now: () => 1 });
  const transcript = await service.transcribe('file:///voice.wav', 'clear_en');
  const group = await service.analyze({ transcript, scenario: 'clear_en', sessionId: 'local-session', recordedAt: 1, timezoneOffsetMinutes: 0 });
  expect(transcript.text).toBe('Paid [redacted-number]');
  expect(group.proposals[0]).toMatchObject({ amountMinor: 1250, currencyCode: 'SAR', merchant: 'Shop', status: 'ready' });
  await expect(service.confirm({ group, proposals: group.proposals, operationId: 'voice-confirm-1' })).resolves.toMatchObject({ transactionIds: ['99000000-0000-4000-8000-000000000005'] });
  expect(JSON.parse(String(request.mock.calls[3]?.[1]?.body))).toMatchObject({ uploadCompleted: true, expectedVersion: 1, contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(JSON.parse(String(request.mock.calls[5]?.[1]?.body))).toMatchObject({ expectedVersion: 4, editedFields: { amountMinor: '1250', accountId: '99000000-0000-4000-8000-000000000003' } });
  expect(JSON.stringify(request.mock.calls)).not.toMatch(/openrouter|provider|model/i);
});
