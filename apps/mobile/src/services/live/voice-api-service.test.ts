import { createLiveVoiceApiService as createService } from './voice-api-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPendingVoiceSession, loadVoiceOperation, savePendingVoiceSession, saveVoiceOperation } from '@/storage/voice-pending-session';

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

const mockDatabases = new Map<string, ReturnType<typeof mockMakeDatabase>>();
const originalAutomaticPosting = process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING;
function mockMakeDatabase() {
  const { DatabaseSync } = require('node:sqlite');
  const native = new DatabaseSync(':memory:');
  native.exec(
    'CREATE TABLE voice_operation_journal(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL)'
  );
  native.exec(
    'CREATE TABLE voice_batch_operations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)'
  );
  return {
    native,
    getFirstAsync: async (sql: string, ...args: string[]) =>
      native.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql: string, ...args: (string | number)[]) =>
      native.prepare(sql).all(...args),
    runAsync: async (sql: string, ...args: (string | number)[]) =>
      native.prepare(sql).run(...args)
  };
}
jest.mock('@/storage/database', () => ({
  openDatabase: async (ownerId: string) => {
    if (!mockDatabases.has(ownerId))
      mockDatabases.set(ownerId, mockMakeDatabase());
    return mockDatabases.get(ownerId);
  },
  runExclusiveDatabaseTransaction: async (
    db: ReturnType<typeof mockMakeDatabase>,
    operation: (db: unknown) => Promise<void>
  ) => {
    db.native.exec('BEGIN IMMEDIATE');
    try {
      await operation(db);
      db.native.exec('COMMIT');
    } catch (error) {
      db.native.exec('ROLLBACK');
      throw error;
    }
  }
}));
const createLiveVoiceApiService = (
  options: Parameters<typeof createService>[0]
) => createService({ owner: async () => 'owner-a', ...options });
beforeEach(async () => {
  delete process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING;
  for (const db of mockDatabases.values()) db.native.close();
  mockDatabases.clear();
  await AsyncStorage.clear();
});
afterAll(() => {
  for (const db of mockDatabases.values()) db.native.close();
  if (originalAutomaticPosting === undefined) delete process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING;
  else process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = originalAutomaticPosting;
});
function recovery(value: unknown = proposal()) {
  return {
    phase: 'proposed',
    session: {
      id: id(1),
      locale: 'en',
      status: 'proposed',
      durationMs: 1234,
      expiresAt: '2026-09-03T01:00:00.000Z',
      confirmedAt: null,
      failureCode: null,
      version: 8,
      createdAt: at
    },
    proposal: value,
    recordedAt: at,
    timezoneOffsetMinutes: 0,
    captureContextLegacy: false,
    transcriptLanguage: 'en',
    transcriptConfidence: 0.95,
    transactionId: null
  };
}
function uploadReceipt(bytes = wav) {
  const { sha256 } = require('@noble/hashes/sha256');
  const { bytesToHex } = require('@noble/hashes/utils');
  return {
    id: id(1),
    version: 7,
    contentHash: bytesToHex(sha256(bytes)),
    sizeBytes: bytes.byteLength
  };
}

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
  poll: unknown = proposal(),
  audio = { bytes: wav, contentType: 'audio/wav', inferredType: 'audio/wav' }
) {
  return jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      new Response(audio.bytes, {
        headers: { 'content-type': audio.inferredType }
      })
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
            method: 'PUT',
            path: `/api/v1/voice/sessions/${id(1)}/audio`,
            expiresAt: '2026-09-03T00:05:00.000Z'
          }
        },
        201
      )
    )
    .mockResolvedValueOnce(json(uploadReceipt(audio.bytes)))
    .mockResolvedValueOnce(json(process, 202))
    .mockResolvedValueOnce(
      json({
        id: id(1),
        locale: 'en',
        status: 'proposed',
        durationMs: 1_234,
        expiresAt: '2026-09-03T01:00:00.000Z',
        confirmedAt: null,
        failureCode: null,
        version: 8,
        createdAt: at
      })
    )
    .mockResolvedValueOnce(json(recovery(poll)))
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

it('routes ordinary live capture to transcript and proposal review without automatic financial submission', async () => {
  const request = successfulRequest(undefined, proposal({
    redactedTranscript: 'I spent 25 Saudi riyals on food from Voice Staging Test today',
    payload: { ...proposal().payload, amountMinor: '2500' }
  }));
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test', token: async () => 'owner', request,
    sleep: async () => {}, now: () => Date.parse(at)
  });
  // The capture runtime selects automatic processing only when this method is
  // advertised. Ordinary capture must use the existing explicit review flow.
  expect(service.queueBatch).toBeUndefined();
  const transcript = await service.transcribe('file:///voice.wav', 'clear_en', 1234, 'en');
  expect(transcript.text).toBe('I spent 25 Saudi riyals on food from Voice Staging Test today');
  const group = await service.analyze({ transcript, scenario: 'clear_en', sessionId: id(1),
    recordedAt: Date.parse(at), timezoneOffsetMinutes: 0 });
  expect(group.proposals[0]).toMatchObject({ type: 'expense', amountMinor: 2500,
    currencyCode: 'SAR', accountId: id(3), categoryId: id(4) });
  expect(request.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
});

it.each(['ar', 'en'] as const)(
  'hands %s automatic capture to the durable batch without a confirmation request',
  async (locale) => {
    process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
    const request = jest.fn().mockRejectedValue(new Error('network must not be needed to journal'));
    const service = createLiveVoiceApiService({
      baseUrl: 'https://api.staging.masarifiratibi.com',
      token: async () => 'owner', request
    });
    expect(service.queueBatch).toEqual(expect.any(Function));
    const operation = await service.queueBatch!({
      uri: 'file:///automatic.m4a', contentType: 'audio/m4a',
      durationMs: 3000, recordedAt: Date.parse(at)
    }, locale, -180);
    const stored = mockDatabases.get('owner-a')!.native.prepare(
      'SELECT payload FROM voice_batch_operations WHERE id=?'
    ).get(operation);
    expect(JSON.parse(stored.payload)).toMatchObject({
      id: operation, phase: 'captured', locale, timezoneOffsetMinutes: -180,
      audioReference: 'file:///automatic.m4a', createBody: null, sessionId: null
    });
    expect(service.runBatch).toEqual(expect.any(Function));
    expect(request).not.toHaveBeenCalled();
  }
);

it('enables the deployment switch only for the Staging API, leaving other environments on their existing flow', () => {
  const previous = process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING;
  process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  try {
    expect(createLiveVoiceApiService({ baseUrl: 'https://api.staging.masarifiratibi.com' }).queueBatch)
      .toEqual(expect.any(Function));
    for (const baseUrl of ['https://api.masarifiratibi.com', 'https://api.staging.masarifiratibi.com.evil.test'])
      expect(createLiveVoiceApiService({ baseUrl }).queueBatch).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING;
    else process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = previous;
  }
});

it.each(['ar', 'en'] as const)(
  'recovers a committed %s automatic capture after response loss without another financial submission',
  async (locale) => {
    process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
    const result = { sessionId: id(1), batchId: id(2), status: 'completed',
      transactionIds: [id(5)], addedCount: 1, ledgerVersion: 12 };
    let processed = false;
    const request = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      if (path.startsWith('file:')) return new Response(wav);
      if (path.endsWith('/sessions')) return json({ session: { id: id(1), version: 1 },
        upload: { path: `/api/v1/voice/sessions/${id(1)}/audio` } }, 201);
      if (path.endsWith('/audio')) return json({ ...uploadReceipt(), version: 2 });
      if (path.endsWith('/process')) {
        processed = true;
        throw new Error('response lost after commit');
      }
      if (path.endsWith('/batch')) return json(processed ? result : {
        ...result, batchId: null, status: 'uploading', transactionIds: [], addedCount: 0, ledgerVersion: 0
      });
      throw new Error(`Unexpected ${init?.method} endpoint`);
    });
    const options = { baseUrl: 'https://api.staging.masarifiratibi.com',
      token: async () => 'owner', request, sleep: async () => {} };
    const service = createLiveVoiceApiService(options);
    const operation = await service.queueBatch!({ uri: 'file:///automatic.m4a',
      contentType: 'audio/m4a', durationMs: 3000, recordedAt: Date.now() }, locale, -180);
    await expect(Promise.all([service.runBatch!(operation), service.runBatch!(operation)]))
      .rejects.toThrow('response lost after commit');
    service.pauseBatches!();
    const restarted = createLiveVoiceApiService(options);
    await expect(restarted.runBatch!(operation)).resolves.toEqual(result);
    await expect(restarted.runBatch!(operation)).resolves.toEqual(result);
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/sessions'))).toHaveLength(1);
    const processes = request.mock.calls.filter(([url]) => String(url).endsWith('/process'));
    expect(processes).toHaveLength(1);
    expect(processes[0]?.[1]?.headers).toMatchObject({ 'idempotency-key': 'voice-process:' + operation });
    expect(request.mock.calls.some(([url]) => /\/(confirm|proposal)$/.test(String(url)))).toBe(false);
  }
);

it('uploads native M4A recordings as M4A even when Android infers MP3, without confirming a transaction', async () => {
  const m4a = Uint8Array.from([
    0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32
  ]);
  const request = successfulRequest(undefined, undefined, {
    bytes: m4a,
    contentType: 'audio/m4a',
    inferredType: 'audio/mpeg'
  });
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request,
    sleep: async () => {}
  });
  await expect(
    service.transcribe('file:///recording.m4a', 'clear_en', 1_234, 'en')
  ).resolves.toMatchObject({ analysisReference: { proposalId: id(2) } });
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
    contentType: 'audio/m4a',
    sizeBytes: m4a.byteLength
  });
  expect(request.mock.calls[2]?.[1]).toMatchObject({
    body: m4a.buffer,
    headers: { 'Content-Type': 'audio/m4a' }
  });
  expect(
    request.mock.calls.some(([url]) => String(url).endsWith('/confirm'))
  ).toBe(false);
});

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
    1_234,
    'ar'
  );
  const group = await service.analyze({
    transcript,
    scenario: 'clear_en',
    sessionId: 'local-session',
    recordedAt: 1,
    timezoneOffsetMinutes: 0
  });

  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
    durationMs: 1_234,
    locale: 'ar'
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
      operationId: id(10)
    })
  ).resolves.toMatchObject({ transactionIds: [id(5)] });
  expect(JSON.parse(String(request.mock.calls[3]?.[1]?.body))).toMatchObject({
    uploadCompleted: true,
    expectedVersion: 7,
    contentHash: expect.stringMatching(/^[0-9a-f]{64}$/)
  });
  expect(JSON.parse(String(request.mock.calls[6]?.[1]?.body))).toMatchObject({
    expectedVersion: 4,
    editedFields: { amountMinor: '1250', accountId: id(3) }
  });
  expect(JSON.stringify(request.mock.calls)).not.toMatch(
    /openrouter|provider|model/i
  );
});

it.each([
  [401, { code: 'UNAUTHORIZED' }, 'session_expired'],
  [429, { code: 'AI_QUOTA_EXCEEDED' }, 'quota_exhausted'],
  [503, { code: 'AI_UNAVAILABLE' }, 'provider_unavailable'],
  [503, { code: 'AI_TEMPORARILY_UNAVAILABLE' }, 'provider_unavailable'],
  [503, { code: 'PROVIDER_UNAVAILABLE' }, 'auth_unavailable'],
  [503, {}, 'analysis_unavailable']
] as const)('maps HTTP %s to %s', async (status, body, code) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      new Response(wav, { headers: { 'content-type': 'audio/wav' } })
    )
    .mockResolvedValueOnce(json(body, status));
  await expect(
    createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request
    }).transcribe('file:///voice.wav', 'clear_en', 1_000, 'en')
  ).rejects.toMatchObject({ code });
});

it('polls at one-second intervals through the backend deadline and times out explicitly', async () => {
  const sleep = jest.fn(async () => undefined);
  let call = 0;
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => {
      call += 1;
      if (call === 1)
        return new Response(wav, { headers: { 'content-type': 'audio/wav' } });
      if (call === 2)
        return json(
          {
            session: {
              id: id(1),
              locale: 'en',
              status: 'uploaded',
              durationMs: 1_000,
              expiresAt: '2026-09-03T01:00:00.000Z',
              confirmedAt: null,
              failureCode: null,
              version: 7,
              createdAt: at
            },
            upload: {
              method: 'PUT',
              path: `/api/v1/voice/sessions/${id(1)}/audio`,
              expiresAt: at
            }
          },
          201
        );
      if (call === 3) return json(uploadReceipt());
      if (call === 4) return json({ id: id(1), status: 'queued' }, 202);
      return json({
        id: id(1),
        locale: 'en',
        status: 'processing',
        durationMs: 1_000,
        expiresAt: '2026-09-03T01:00:00.000Z',
        confirmedAt: null,
        failureCode: null,
        version: 8,
        createdAt: at
      });
    }
  );

  await expect(
    createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request,
      sleep
    }).transcribe('file:///voice.wav', 'clear_en', 1_000, 'en')
  ).rejects.toMatchObject({
    code: 'processing_timed_out'
  });
  expect(sleep).toHaveBeenCalledTimes(124);
  expect(sleep).toHaveBeenLastCalledWith(1_000);
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
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer owner',
        'X-Voice-Contract': '2'
      })
    })
  );
});

it('recovers only the current owner pending session and clears it after confirm', async () => {
  const first = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'token',
    owner: async () => 'user-a',
    request: successfulRequest(),
    sleep: async () => {},
    now: () => 1
  });
  await first.transcribe('file:///voice.wav', 'clear_en', 1_234, 'en');

  const other = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'token',
    owner: async () => 'user-b',
    request: jest.fn()
  });
  await expect(other.recoverPending?.()).resolves.toBeNull();

  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(recovery()))
    .mockResolvedValueOnce(
      json({
        sourceId: id(2),
        actionType: 'transaction.create',
        resourceId: id(5),
        status: 'executed',
        replayed: false
      })
    );
  const restored = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'token',
    owner: async () => 'user-a',
    request
  });
  const pending = await restored.recoverPending?.();
  if (!pending || pending.saved) throw new Error('expected review recovery');
  expect(pending?.transcript.analysisReference?.sessionId).toBe(id(1));
  const group = await restored.analyze({
    transcript: pending!.transcript,
    scenario: 'clear_en',
    sessionId: 'local-session',
    recordedAt: pending!.recordedAt,
    timezoneOffsetMinutes: pending!.timezoneOffsetMinutes
  });
  await restored.confirm({
    group,
    proposals: group.proposals,
    operationId: id(11)
  });
  await expect(restored.recoverPending?.()).resolves.toMatchObject({
    saved: { transactionIds: [id(5)] }
  });
});

it.each([false, true])('migrates Async legacy sessions only for manual recovery (automatic=%s)', async (automatic) => {
  const pending = { sessionId: id(1), sessionVersion: 1, recordedAt: 1234,
    timezoneOffsetMinutes: 0, createdAt: 1 };
  await savePendingVoiceSession('owner-a', pending);
  if (automatic) process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(json(recovery()));
  const token = jest.fn(async () => 'owner');
  const service = createLiveVoiceApiService({ baseUrl: 'https://api.staging.masarifiratibi.com', token, request });
  const result = await service.recoverPending?.();
  if (automatic) {
    expect(result).toBeNull();
    expect(await loadPendingVoiceSession('owner-a')).toEqual(pending);
    expect(await loadVoiceOperation('owner-a')).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  } else {
    expect(result).toMatchObject({ transcript: { analysisReference: { sessionId: id(1) } } });
    expect(await loadPendingVoiceSession('owner-a')).toBeNull();
    expect(await loadVoiceOperation('owner-a')).toMatchObject({ sessionId: id(1) });
    expect(request).toHaveBeenCalledTimes(1);
  }
});

it('preserves an unconfirmed legacy proposal without reopening review during automatic capture', async () => {
  const baseUrl = 'https://api.staging.masarifiratibi.com';
  const first = createLiveVoiceApiService({ baseUrl, token: async () => 'owner',
    request: successfulRequest(), sleep: async () => {}, now: () => 1 });
  await first.transcribe('file:///voice.wav', 'clear_en', 1_234, 'en');
  const previous = await loadVoiceOperation('owner-a');
  process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(recovery()));
  const automatic = createLiveVoiceApiService({ baseUrl, token: async () => 'owner', request });
  await expect(automatic.recoverPending?.()).resolves.toBeNull();
  expect(await loadVoiceOperation('owner-a')).toEqual(previous);
  expect(request).not.toHaveBeenCalled();
});

it.each([
  ['awaiting_audio', false], ['awaiting_audio', true],
  ['uploaded', false], ['uploaded', true],
  ['queued', false], ['queued', true],
  ['processing', false], ['processing', true],
  ['expired', false], ['expired', true],
  ['failed', false], ['failed', true],
  ['cancelled', false], ['cancelled', true],
  ['confirmed', false], ['confirmed', true]
] as const)(
  'preserves legacy %s evidence without replay or polling in automatic capture (retryAudio=%s)',
  async (phase, retryAudio) => {
    // Redmi 2026-10-10: an old uploaded v2 session blocked fresh v3 recording.
    const baseUrl = 'https://api.staging.masarifiratibi.com';
    const legacy = createLiveVoiceApiService({ baseUrl, token: async () => 'owner',
      request: successfulRequest(), sleep: async () => {}, now: () => 1 });
    await legacy.transcribe('file:///voice.wav', 'clear_en', 1234, 'en');
    const previous = (await loadVoiceOperation('owner-a'))!;
    await saveVoiceOperation('owner-a', { ...previous, revision: previous.revision + 1,
      phase: 'processing', proposalId: null, proposalVersion: null });
    const evidence = await loadVoiceOperation('owner-a');
    process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
    const recovered = { ...recovery(null), phase,
      transactionId: phase === 'confirmed' ? id(5) : null,
      session: { ...recovery().session,
        status: phase === 'confirmed' ? 'confirmed'
          : phase === 'queued' || phase === 'processing' ? 'processing'
          : phase === 'expired' ? 'expired'
          : phase === 'failed' || phase === 'cancelled' ? 'failed' : 'uploaded',
        failureCode: phase === 'cancelled' ? 'VOICE_CANCELLED' : null } };
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (url, init) => {
        if (String(url).endsWith('/recovery') && (init?.method ?? 'GET') === 'GET')
          return json(recovered);
        throw new Error('unexpected legacy replay, cancellation, or polling');
      }
    );
    const automatic = createLiveVoiceApiService({ baseUrl, token: async () => 'owner',
      request, sleep: async () => {}, now: () => 1 });
    await expect(automatic.recoverPending?.(retryAudio)).resolves.toBeNull();
    expect(await loadVoiceOperation('owner-a')).toEqual(evidence);
    expect(request).not.toHaveBeenCalled();
    expect(await automatic.queueBatch!({ uri: 'file:///fresh.m4a', contentType: 'audio/m4a',
      durationMs: 3000, recordedAt: Date.parse(at) }, 'ar', -180)).toEqual(expect.any(String));
    expect(await loadVoiceOperation('owner-a')).toEqual(evidence);
    expect(request).not.toHaveBeenCalled();
  }
);

it.each(['saved', 'cancel_requested'] as const)('retains explicit legacy %s recovery during automatic capture', async (phase) => {
  const baseUrl = 'https://api.staging.masarifiratibi.com';
  const legacy = createLiveVoiceApiService({ baseUrl, token: async () => 'owner',
    request: successfulRequest(), sleep: async () => {}, now: () => 1 });
  await legacy.transcribe('file:///voice.wav', 'clear_en', 1234, 'en');
  const previous = (await loadVoiceOperation('owner-a'))!;
  await saveVoiceOperation('owner-a', { ...previous, revision: previous.revision + 1,
    phase, transactionId: phase === 'saved' ? id(5) : null });
  const evidence = await loadVoiceOperation('owner-a');
  process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(json({ status: 'cancelled' }));
  const automatic = createLiveVoiceApiService({ baseUrl, token: async () => 'owner', request });
  if (phase === 'saved') {
    await expect(automatic.recoverPending?.()).resolves.toMatchObject({ saved: { transactionIds: [id(5)] } });
    expect(await loadVoiceOperation('owner-a')).toEqual(evidence);
    expect(request).not.toHaveBeenCalled();
  } else {
    await expect(automatic.recoverPending?.()).resolves.toBeNull();
    expect(await loadVoiceOperation('owner-a')).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(baseUrl + '/api/v1/voice/sessions/' + previous.sessionId + '/cancel');
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  }
});

it.each([false, true])('preserves unsubmitted legacy audio during automatic capture (retryAudio=%s)', async (retryAudio) => {
  const baseUrl = 'https://api.staging.masarifiratibi.com';
  const legacy = createLiveVoiceApiService({ baseUrl, token: async () => 'owner',
    request: successfulRequest(), sleep: async () => {}, now: () => 1 });
  await legacy.transcribe('file:///voice.wav', 'clear_en', 1234, 'en');
  const previous = (await loadVoiceOperation('owner-a'))!;
  await saveVoiceOperation('owner-a', { ...previous, revision: previous.revision + 1,
    phase: 'captured', sessionId: null, sessionVersion: null, processBody: null,
    proposalId: null, proposalVersion: null });
  const evidence = await loadVoiceOperation('owner-a');
  process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
    throw new Error('unexpected legacy audio submission');
  });
  const automatic = createLiveVoiceApiService({ baseUrl, token: async () => 'owner', request });
  await expect(automatic.recoverPending?.(retryAudio)).resolves.toBeNull();
  expect(await loadVoiceOperation('owner-a')).toEqual(evidence);
  expect(request).not.toHaveBeenCalled();
});

it.each(['multiple', 'transfer', 'obligation'] as const)(
  'does not let the hidden %s fixture scenario determine live semantics or locale',
  async (scenario) => {
    const request = successfulRequest();
    const service = createLiveVoiceApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request,
      sleep: async () => {}
    });
    await expect(
      service.transcribe('file:///voice.wav', scenario, 1_234, 'en')
    ).resolves.toMatchObject({ language: 'en' });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      locale: 'en'
    });
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
            method: 'PUT',
            path: `/api/v1/voice/sessions/${id(1)}/audio`,
            expiresAt: at
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

  // Finish the failed operation before starting a separate recording.
  mockDatabases
    .get('owner-a')
    ?.native.exec('DELETE FROM voice_operation_journal');
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
  expect(pollRequest).toHaveBeenCalledTimes(6);
});

it('returns a definitively rejected confirmation to editable review and uses a new key for the correction', async () => {
  const initial = successfulRequest();
  let confirmations = 0;
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (...args) => {
      const url = String(args[0]);
      if (url.endsWith('/confirm')) {
        confirmations += 1;
        return confirmations === 1
          ? json({ code: 'VOICE_PROPOSAL_INVALID' }, 422)
          : json({
              sourceId: id(2),
              actionType: 'transaction.create',
              resourceId: id(5),
              status: 'executed',
              replayed: false
            });
      }
      if (initial.mock.calls.length >= 6 && url.endsWith('/recovery'))
        return json(recovery());
      return initial(...args);
    }
  );
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.test',
    token: async () => 'token',
    request
  });
  const transcript = await service.transcribe(
    'file:///voice.wav',
    'clear_en',
    1234,
    'en'
  );
  const group = await service.analyze({
    transcript,
    scenario: 'clear_en',
    sessionId: 'local',
    recordedAt: Date.now(),
    timezoneOffsetMinutes: 0
  });
  await expect(
    service.confirm({ group, proposals: group.proposals, operationId: id(10) })
  ).rejects.toMatchObject({ code: 'invalid_proposal' });
  expect(await loadVoiceOperation('owner-a')).toMatchObject({
    phase: 'reviewing',
    confirmationBody: null,
    confirmationKey: null
  });
  const corrected = { ...group.proposals[0]!, notes: 'Reviewed correction' };
  await expect(
    service.confirm({ group, proposals: [corrected], operationId: id(11) })
  ).resolves.toMatchObject({ transactionIds: [id(5)] });
  const calls = request.mock.calls.filter(([url]) =>
    String(url).endsWith('/confirm')
  );
  expect(calls[0]?.[1]?.headers).not.toEqual(calls[1]?.[1]?.headers);
});

it.each([false, true])('replays the exact authorized confirmation after response loss and restart (automatic=%s), then discards Saved locally', async (automatic) => {
  const initial = successfulRequest();
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (...args) => {
      if (String(args[0]).endsWith('/confirm'))
        throw new Error('response lost');
      return initial(...args);
    }
  );
  const service = createLiveVoiceApiService({
    baseUrl: 'https://api.staging.masarifiratibi.com',
    token: async () => 'token',
    request
  });
  const transcript = await service.transcribe(
    'file:///voice.wav',
    'clear_en',
    1234,
    'en'
  );
  const group = await service.analyze({
    transcript,
    scenario: 'clear_en',
    sessionId: 'local',
    recordedAt: Date.now(),
    timezoneOffsetMinutes: 0
  });
  await expect(
    service.confirm({ group, proposals: group.proposals, operationId: id(10) })
  ).rejects.toMatchObject({ code: 'recovery_required' });
  const original = request.mock.calls.find(([url]) =>
    String(url).endsWith('/confirm')
  )?.[1];
  const resumedRequest = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json({ ...recovery(), phase: 'confirming' }))
    .mockResolvedValueOnce(
      json({
        sourceId: id(2),
        actionType: 'transaction.create',
        resourceId: id(5),
        status: 'executed',
        replayed: true
      })
    );
  if (automatic) process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING = 'true';
  const resumed = createLiveVoiceApiService({
    baseUrl: 'https://api.staging.masarifiratibi.com',
    token: async () => 'token',
    request: resumedRequest
  });
  await expect(resumed.recoverPending?.()).resolves.toMatchObject({
    saved: { transactionIds: [id(5)] }
  });
  expect(resumedRequest.mock.calls[1]?.[1]).toMatchObject({
    body: original?.body,
    headers: original?.headers
  });
  await resumed.discardPending?.();
  expect(resumedRequest).toHaveBeenCalledTimes(2);
  expect(await loadVoiceOperation('owner-a')).toBeNull();
});
