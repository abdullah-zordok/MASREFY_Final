import {
  createVoiceBatchApi,
  VoiceBatchLocalTerminalError
} from './voice-batch-api-service';
import {
  loadVoiceBatches,
  saveVoiceBatch
} from '@/storage/voice-batch-journal';
import { waitFor } from '@testing-library/react-native';

jest.mock('@/storage/voice-batch-journal', () => ({
  loadVoiceBatches: jest.fn(),
  pruneVoiceBatches: jest.fn().mockResolvedValue(undefined),
  saveVoiceBatch: jest.fn()
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest
    .fn()
    .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
    .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
}));

it('durably queues separate captures without waiting for upload or provider processing', async () => {
  const request = jest.fn();
  const save = jest.mocked(saveVoiceBatch).mockResolvedValue(undefined);
  jest.mocked(loadVoiceBatches).mockResolvedValue([]);
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request
  });
  const audio = {
    uri: 'file://capture.m4a',
    durationMs: 3000,
    contentType: 'audio/m4a' as const,
    recordedAt: Date.now()
  };
  const a = await api.queueBatch(audio, 'ar', -180);
  const b = await api.queueBatch(audio, 'en', -180);
  expect(a).not.toEqual(b);
  expect(request).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[0][1]).toMatchObject({
    id: a,
    revision: 0,
    phase: 'captured',
    audioReference: audio.uri
  });
});

it('rediscovers an unexpired terminal receipt after the same owner resumes a new runtime', async () => {
  jest.mocked(loadVoiceBatches).mockResolvedValue([]);
  const value = {
    sessionId: '55555555-5555-4555-8555-555555555555',
    batchId: null,
    status: 'completed',
    transactionIds: [],
    addedCount: 0,
    ledgerVersion: 0,
    createdAt: '2026-10-05T00:00:00.000Z'
  };
  const request = jest.fn(
    async (url: string | URL | Request, _init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          items: String(url).includes('?after=') ? [] : [value]
        })
      }) as Response
  );
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request: request as typeof fetch
  });
  expect((await api.recoverBatches()).results).toHaveLength(1);
  expect(request.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({
      headers: expect.objectContaining({
        accept: 'application/json; voice-event-results=1'
      })
    })
  );
  api.pauseBatches();
  expect((await api.recoverBatches()).results).toHaveLength(1);
});

it('keeps unresolved local transport visible even when server recovery returns no batches', async () => {
  jest.mocked(loadVoiceBatches).mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      revision: 0,
      phase: 'captured',
      audioReference: 'file://capture',
      locale: 'en',
      durationMs: 1000,
      recordedAt: Date.now(),
      timezoneOffsetMinutes: 0,
      createBody: null,
      sessionId: null,
      version: null,
      processBody: null
    }
  ]);
  const request = jest.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/recovery'))
      return { ok: true, json: async () => ({ items: [] }) } as Response;
    throw new Error('network unavailable');
  });
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request: request as typeof fetch
  });
  await api.recoverBatches();
  await expect(
    api.runBatch('11111111-1111-4111-8111-111111111111')
  ).rejects.toThrow('network unavailable');
  expect(await api.recoverBatches()).toEqual({
    results: [],
    uncertain: true,
    localFailure: false,
    pendingIds: ['11111111-1111-4111-8111-111111111111']
  });
});

it.each(['cancelled', 'failed'] as const)(
  'retires a pre-submission %s capture without waiting for a network response',
  async (phase) => {
    const operation = {
      id: '11111111-1111-4111-8111-111111111111',
      revision: 0,
      phase: 'captured' as const,
      audioReference: 'file://private.m4a',
      locale: 'en' as const,
      durationMs: 1000,
      recordedAt: phase === 'failed' ? Date.now() - 86400001 : Date.now(),
      timezoneOffsetMinutes: 0,
      createBody: null,
      sessionId: null,
      version: null,
      processBody: null
    };
    let saved =
      operation as import('@/storage/voice-batch-journal').VoiceBatchOperation;
    jest.mocked(loadVoiceBatches).mockImplementation(async () => [saved]);
    jest.mocked(saveVoiceBatch).mockImplementation(async (_owner, value) => {
      saved = value;
    });
    const request = jest.fn();
    const removeAudio = jest.fn().mockResolvedValue(undefined);
    const api = createVoiceBatchApi({
      baseUrl: 'https://example.test',
      owner: async () => 'owner',
      token: async () => 'token',
      request,
      removeAudio
    });
    await expect(
      phase === 'cancelled'
        ? api.cancelBatch(operation.id)
        : api.runBatch(operation.id)
    ).rejects.toBeInstanceOf(VoiceBatchLocalTerminalError);
    expect(request).not.toHaveBeenCalled();
    expect(removeAudio).toHaveBeenCalledWith(operation.audioReference);
    await waitFor(() =>
      expect(saved).toMatchObject({
        phase,
        audioReference: null,
        createBody: null,
        processBody: null
      })
    );
  }
);

it.each(['missing audio', 'invalid audio', 'rejected creation'])(
  'retires a definitive pre-submission failure: %s',
  async (failure) => {
    let operation = {
      id: '11111111-1111-4111-8111-111111111111',
      revision: 0,
      phase: 'captured',
      audioReference: 'file://private.m4a',
      locale: 'en',
      durationMs: 1000,
      recordedAt: Date.now(),
      timezoneOffsetMinutes: 0,
      createBody: failure === 'rejected creation' ? {} : null,
      sessionId: null,
      version: null,
      processBody: null
    } as import('@/storage/voice-batch-journal').VoiceBatchOperation;
    jest.mocked(loadVoiceBatches).mockImplementation(async () => [operation]);
    jest.mocked(saveVoiceBatch).mockImplementation(async (_owner, value) => {
      operation = value;
    });
    const request = jest.fn().mockResolvedValue({
      ok: failure === 'invalid audio',
      status: failure === 'rejected creation' ? 422 : 404,
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    const removeAudio = jest.fn().mockResolvedValue(undefined);
    const api = createVoiceBatchApi({
      baseUrl: 'https://example.test',
      owner: async () => 'owner',
      token: async () => 'token',
      request,
      removeAudio
    });
    await expect(api.runBatch(operation.id)).rejects.toBeInstanceOf(
      VoiceBatchLocalTerminalError
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(removeAudio).toHaveBeenCalledWith('file://private.m4a');
    await waitFor(() =>
      expect(operation).toMatchObject({
        phase: 'failed',
        audioReference: null,
        createBody: null,
        processBody: null,
        sessionId: null
      })
    );
  }
);

it('persists cancellation after a concurrent journal revision without losing intent', async () => {
  let operation = {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 1,
    phase: 'created' as const,
    audioReference: 'file://private.m4a',
    locale: 'en' as const,
    durationMs: 1000,
    recordedAt: Date.now(),
    timezoneOffsetMinutes: 0,
    createBody: {},
    sessionId: '22222222-2222-4222-8222-222222222222',
    version: 1,
    processBody: null
  } as import('@/storage/voice-batch-journal').VoiceBatchOperation;
  jest.mocked(loadVoiceBatches).mockImplementation(async () => [operation]);
  let raced = false;
  jest.mocked(saveVoiceBatch).mockImplementation(async (_owner, value) => {
    if (!raced) {
      raced = true;
      operation = { ...operation, revision: 2, phase: 'uploaded' };
      throw new Error('voice batch revision conflict');
    }
    operation = value;
  });
  const request = jest.fn().mockRejectedValue(new Error('offline'));
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request
  });
  await expect(api.cancelBatch(operation.id)).rejects.toThrow('offline');
  expect(operation).toMatchObject({ revision: 3, phase: 'cancel_requested' });
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining('/cancel'),
    expect.objectContaining({
      headers: expect.objectContaining({
        'idempotency-key': 'voice-cancel:11111111-1111-4111-8111-111111111111'
      })
    })
  );
});

it('publishes restored cancellation controls before server recovery answers', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  jest.mocked(loadVoiceBatches).mockResolvedValue([
    {
      id,
      revision: 0,
      phase: 'captured',
      audioReference: 'file://private',
      locale: 'en',
      durationMs: 1000,
      recordedAt: Date.now(),
      timezoneOffsetMinutes: 0,
      createBody: null,
      sessionId: null,
      version: null,
      processBody: null
    }
  ]);
  let release: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const request = jest.fn((url: string | URL | Request) =>
    String(url).includes('/recovery')
      ? response
      : Promise.reject(new Error('offline'))
  );
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request: request as typeof fetch
  });
  const pending = jest.fn();
  const recovering = api.recoverBatches(pending);
  await waitFor(() => expect(pending).toHaveBeenCalledWith([id]));
  release({ ok: true, json: async () => ({ items: [] }) } as Response);
  expect((await recovering).pendingIds).toEqual([id]);
});

it('discovers incrementally and polls unresolved sessions without replaying terminal history', async () => {
  jest.mocked(loadVoiceBatches).mockResolvedValue([]);
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ];
  const value = (sessionId: string, status: 'completed' | 'analyzing') => ({
    sessionId,
    batchId: null,
    status,
    transactionIds: [],
    addedCount: 0,
    ledgerVersion: 0
  });
  let discoveries = 0;
  const request = jest.fn(
    async (url: string | URL | Request) =>
      ({
        ok: true,
        json: async () =>
          String(url).endsWith('/batch')
            ? value(ids[1], 'completed')
            : {
                items:
                  discoveries++ === 0
                    ? ids.map((id, index) => ({
                        ...value(id, index === 0 ? 'completed' : 'analyzing'),
                        createdAt: `2026-10-04T00:00:0${index}.000Z`
                      }))
                    : []
              }
      }) as Response
  );
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request: request as typeof fetch
  });
  await api.recoverBatches();
  const recovered = await api.recoverBatches();
  expect(recovered.results).toContainEqual(value(ids[1], 'completed'));
  expect(request.mock.calls.map(([url]) => String(url))).toContain(
    'https://example.test/api/v1/voice/batches/recovery?after=2026-10-04T00%3A00%3A01.000Z&afterId=' +
      ids[1]
  );
  await api.recoverBatches();
  expect(
    request.mock.calls.filter(([url]) => String(url).endsWith('/batch'))
  ).toHaveLength(1);
});

it('recovers all ten committed transaction receipts without a review step', async () => {
  jest.mocked(loadVoiceBatches).mockResolvedValue([]);
  const transactionIds = Array.from(
    { length: 10 },
    (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`
  );
  const receipt = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    batchId: null,
    status: 'completed',
    transactionIds,
    addedCount: 10,
    ledgerVersion: 10
  };
  const api = createVoiceBatchApi({
    baseUrl: 'https://example.test',
    owner: async () => 'owner',
    token: async () => 'token',
    request: jest.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{ ...receipt, createdAt: '2026-10-04T00:00:00.000Z' }]
      })
    })) as unknown as typeof fetch
  });
  expect((await api.recoverBatches()).results).toEqual([receipt]);
});

it('preserves a quota-blocked recording across restart and automatically resumes after its quota changes', async () => {
  // Samsung Dev, 2026-10-07: HTTP 429 was retried every ten seconds.
  let now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const reset = now + 3600000;
  let operation: import('@/storage/voice-batch-journal').VoiceBatchOperation = {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 2,
    phase: 'uploaded',
    audioReference: 'file://retained.m4a',
    locale: 'ar',
    durationMs: 18000,
    recordedAt: now,
    timezoneOffsetMinutes: -180,
    createBody: { contentHash: 'frozen-hash' },
    sessionId: '55555555-5555-4555-8555-555555555555',
    version: 1,
    processBody: {
      uploadCompleted: true,
      expectedVersion: 2,
      contentHash: 'frozen-hash'
    }
  };
  jest.mocked(loadVoiceBatches).mockImplementation(async () => [operation]);
  jest.mocked(saveVoiceBatch).mockImplementation(async (_owner, value) => {
    operation = value;
  });
  let completed = false;
  let quotaAvailable = false;
  const request = jest.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/process')) {
      if (!quotaAvailable)
        return {
          ok: false,
          status: 429,
          json: async () => ({
            code: 'AI_QUOTA_EXCEEDED',
            resetsAt: new Date(reset).toISOString()
          })
        } as Response;
      completed = true;
      return { ok: true, status: 202, json: async () => ({}) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: operation.sessionId,
        batchId: null,
        status: completed ? 'completed' : 'uploading',
        transactionIds: [],
        addedCount: 0,
        ledgerVersion: 0
      })
    } as Response;
  });
  const create = () =>
    createVoiceBatchApi({
      baseUrl: 'https://example.test',
      owner: async () => 'owner',
      token: async () => 'token',
      request: request as typeof fetch
    });
  try {
    await expect(create().runBatch(operation.id)).rejects.toMatchObject({
      code: 'quota_exceeded'
    });
    const resumed = create();
    now += 10000;
    expect((await resumed.runBatch(operation.id)).status).toBe('uploading');
    expect(operation.audioReference).toBe('file://retained.m4a');
    const processCalls = () =>
      request.mock.calls.filter(([url]) => String(url).endsWith('/process'));
    expect(processCalls()).toHaveLength(1);
    now += 50000;
    quotaAvailable = true;
    expect((await resumed.runBatch(operation.id)).status).toBe('completed');
    expect(processCalls()).toHaveLength(2);
    const requests = request.mock.calls as unknown as [string, RequestInit][];
    const keys = requests
      .filter(([url]) => url.endsWith('/process'))
      .map(
        ([, init]) =>
          (init.headers as Record<string, string>)['idempotency-key']
      );
    expect(keys).toEqual([
      'voice-process:' + operation.id,
      'voice-process:' + operation.id
    ]);
    expect(
      requests.some(
        ([url]) => url.endsWith('/audio') || url.endsWith('/sessions')
      )
    ).toBe(false);
  } finally {
    clock.mockRestore();
  }
});
