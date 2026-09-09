import { createLiveVoiceApiService } from './voice-api-service';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000001'
}));

const id = (suffix: number) =>
  `99000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-03T00:00:00.000Z';
const wav = Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: id(2),
    redactedTranscript: 'Paid [redacted-number]',
    schemaVersion: 1,
    type: 'transaction.create',
    payload: {
      schemaVersion: 1,
      type: 'transaction.create',
      amountMinor: '1250',
      currency: 'SAR',
      accountId: id(3),
      categoryId: id(4),
      date: '2026-09-03',
      merchant: 'Shop',
      note: null,
      confidence: 0.9
    },
    fields: [],
    status: 'validated',
    expiresAt: '2026-09-03T01:00:00.000Z',
    confirmedAt: null,
    executedTransactionId: null,
    version: 4,
    ...overrides
  };
}

function successfulRequest(
  process: unknown = { id: id(1), status: 'queued' },
  poll: unknown = proposal()
) {
  return jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      new Response(wav, { headers: { 'content-type': 'audio/wav' } })
    )
    .mockResolvedValueOnce(
      json(
        {
          session: {
            id: id(1),
            locale: 'en',
            status: 'uploaded',
            durationMs: 1_234,
            expiresAt: '2026-09-03T01:00:00.000Z',
            confirmedAt: null,
            failureCode: null,
            version: 7,
            createdAt: at
          },
          upload: {
            url: 'https://storage.test/upload',
            token: 'signed',
            expiresAt: '2026-09-03T00:05:00.000Z',
            headers: { 'content-type': 'audio/wav' }
          }
        },
        201
      )
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(json(process, 202))
    .mockResolvedValueOnce(json(poll))
    .mockResolvedValueOnce(
      json({
        sourceId: id(2),
        actionType: 'transaction.create',
        resourceId: id(5),
        status: 'executed',
        replayed: false
      })
    );
}

it('uses the actual duration and preserves server session, proposal, and version identifiers', async () => {
  const request = successfulRequest();
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request,
    sleep: async () => {},
    now: () => 1
  });
  const transcript = await service.transcribe(
    'file:///voice.wav',
    'clear_en',
    1_234
  );
  const group = await service.analyze({
    transcript,
    scenario: 'clear_en',
    sessionId: 'local-session',
    recordedAt: 1,
    timezoneOffsetMinutes: 0
  });

  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
    durationMs: 1_234
  });
  expect(transcript).toMatchObject({
    text: 'Paid [redacted-number]',
    analysisReference: {
      sessionId: id(1),
      sessionVersion: 7,
      proposalId: id(2),
      proposalVersion: 4
    }
  });
  expect(group).toMatchObject({
    id: id(2),
    proposals: [
      { id: id(2), amountMinor: 1250, currencyCode: 'SAR', status: 'ready' }
    ]
  });

  await expect(
    service.confirm({
      group,
      proposals: group.proposals,
      operationId: 'voice-confirm-1'
    })
  ).resolves.toMatchObject({ transactionIds: [id(5)] });
  expect(JSON.parse(String(request.mock.calls[3]?.[1]?.body))).toMatchObject({
    uploadCompleted: true,
    expectedVersion: 7,
    contentHash: expect.stringMatching(/^[0-9a-f]{64}$/)
  });
  expect(JSON.parse(String(request.mock.calls[5]?.[1]?.body))).toMatchObject({
    expectedVersion: 4,
    editedFields: { amountMinor: '1250', accountId: id(3) }
  });
  expect(JSON.stringify(request.mock.calls)).not.toMatch(
    /openrouter|provider|model/i
  );
});

it('restores a proposal from its server reference after the live service is recreated', async () => {
  const firstRequest = successfulRequest();
  const first = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request: firstRequest,
    sleep: async () => {},
    now: () => 1
  });
  const transcript = await first.transcribe(
    'file:///voice.wav',
    'clear_en',
    1_234
  );
  const restoredRequest = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(proposal()));
  const restored = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request: restoredRequest
  });

  await expect(
    restored.analyze({
      transcript,
      scenario: 'clear_en',
      sessionId: 'local-session',
      recordedAt: 1,
      timezoneOffsetMinutes: 0
    })
  ).resolves.toMatchObject({ id: id(2), proposals: [{ id: id(2) }] });
  expect(restoredRequest).toHaveBeenCalledWith(
    `https://api.test/api/v1/voice/sessions/${id(1)}/proposal`,
    expect.objectContaining({ headers: { Authorization: 'Bearer owner' } })
  );
});

it.each(['multiple', 'transfer', 'obligation'] as const)(
  'exposes unsupported %s voice analysis without creating an expense',
  async (scenario) => {
    const request = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const service = createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request
    });
    await expect(
      service.transcribe('file:///voice.wav', scenario, 1_000)
    ).rejects.toMatchObject({ code: 'analysis_unavailable' });
    expect(request).not.toHaveBeenCalled();
  }
);

it('rejects an edited server transcript instead of confirming stale proposal meaning', async () => {
  const request = successfulRequest();
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request,
    sleep: async () => {},
    now: () => 1
  });
  const transcript = await service.transcribe(
    'file:///voice.wav',
    'clear_en',
    1_234
  );
  await expect(
    service.analyze({
      transcript: {
        ...transcript,
        text: 'Changed meaning',
        editedByUser: true
      },
      scenario: 'clear_en',
      sessionId: 'local-session',
      recordedAt: 1,
      timezoneOffsetMinutes: 0
    })
  ).rejects.toMatchObject({ code: 'analysis_unavailable' });
});

it('fails closed on an unexpected upload session state', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      new Response(wav, { headers: { 'content-type': 'audio/wav' } })
    )
    .mockResolvedValueOnce(
      json(
        {
          session: {
            id: id(1),
            locale: 'en',
            status: 'future',
            durationMs: 1_000,
            expiresAt: at,
            confirmedAt: null,
            failureCode: null,
            version: 1,
            createdAt: at
          },
          upload: {
            url: 'https://storage.test/upload',
            token: 'signed',
            expiresAt: at,
            headers: { 'content-type': 'audio/wav' }
          }
        },
        201
      )
    );
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  await expect(
    service.transcribe('file:///voice.wav', 'clear_en', 1_000)
  ).rejects.toMatchObject({ code: 'analysis_failed' });
});

it('fails closed on unexpected process and malformed poll states', async () => {
  const processRequest = successfulRequest({ id: id(1), status: 'future' });
  await expect(
    createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request: processRequest
    }).transcribe('file:///voice.wav', 'clear_en', 1_000)
  ).rejects.toMatchObject({ code: 'analysis_failed' });
  expect(processRequest).toHaveBeenCalledTimes(4);

  const pollRequest = successfulRequest(undefined, {
    ...proposal(),
    providerPayload: 'private'
  });
  await expect(
    createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request: pollRequest,
      sleep: async () => {}
    }).transcribe('file:///voice.wav', 'clear_en', 1_000)
  ).rejects.toMatchObject({ code: 'analysis_failed' });
  expect(pollRequest).toHaveBeenCalledTimes(5);
});
