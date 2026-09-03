import { AiWorker } from '../../../src/ai/ai.worker';

const claim = {
  kind: 'voice.transcribe_extract' as const,
  id: '99000000-0000-4000-8000-000000000001',
  user_id: 'voice-owner',
  claim_token: '99000000-0000-4000-8000-000000000002',
  attempt_count: 1,
};
const route = {
  workload: 'voice_transcription',
  primary: { modelId: 'openai/gpt-audio-mini', provider: 'openai' },
  fallbacks: [],
  providerAllowlist: ['openai'],
  zdrRequired: true,
  maxPrice: { prompt: '0.1', completion: '0.1' },
  limits: { inputTokens: 100, outputTokens: 100, timeoutMs: 1000 },
  prompt: { template: 'safe', schemaVersion: 1 },
  safetyRules: [
    { kind: 'input', config: { maxBytes: 8192 } },
    { kind: 'output', config: { maxBytes: 16384 } },
  ],
};
const accountId = '99000000-0000-4000-8000-000000000009';

describe('voice transcription worker', () => {
  it.each([
    ['en', 'Paid 12.50 at Shop'],
    ['ar', 'دفعت ١٢٫٥٠ في المتجر'],
    ['en', '[noise] Paid 12.50 at Shop'],
  ] as const)(
    'validates %s/noisy output, stores a redacted proposal, and purges media',
    async (language, transcript) => {
      const repository = {
        claimWork: jest.fn((kind: string) => Promise.resolve(kind === claim.kind ? [claim] : [])),
        workInput: jest.fn(() =>
          Promise.resolve({
            storageRef:
              'voice/99000000-0000-4000-8000-000000000003/99000000-0000-4000-8000-000000000004',
            sizeBytes: 44,
            contentType: 'audio/wav',
            locale: language,
            operationId: 'request-voice-0001',
            aliases: [
              {
                alias: 'ACCOUNT-1',
                kind: 'account',
                id: accountId,
                version: 1,
                data: { currency: 'SAR' },
              },
            ],
          }),
        ),
        getRoute: jest.fn(() => Promise.resolve(route)),
        recordUsage: jest.fn(),
        saveVoiceResult: jest.fn(
          (
            id: string,
            token: string,
            result: { transcript: string; language: string; payload: { type: string } },
          ) => {
            if (!id || !token || result.payload.type !== 'transaction.create')
              return Promise.reject(new Error('AI_SAVE_ARGUMENT_MISSING'));
            return Promise.resolve();
          },
        ),
        completeWork: jest.fn(),
        recordFailure: jest.fn(),
        expire: jest.fn(),
        rollup: jest.fn(),
        claimPurges: jest.fn(() => Promise.resolve([])),
        reconcile: jest.fn(),
      };
      const audio = Buffer.alloc(44);
      audio.write('RIFF');
      audio.write('WAVE', 8);
      const storage = { download: jest.fn(() => Promise.resolve(audio)), delete: jest.fn() };
      const gateway = {
        complete: jest.fn(() =>
          Promise.resolve({
            value: {
              schemaVersion: 1,
              transcript,
              language,
              confidence: 0.9,
              proposal: {
                schemaVersion: 1,
                type: 'transaction.create',
                amountMinor: '1250',
                currency: 'SAR',
                categoryId: null,
                accountId: 'ACCOUNT-1',
                date: '2026-09-03',
                merchant: 'Shop',
                note: null,
                confidence: 0.9,
              },
            },
            model: 'openai/gpt-audio-mini',
            provider: 'openai',
            fallbackUsed: false,
            generationId: 'generation-1',
            usage: { inputTokens: 1, outputTokens: 1, cost: 0.01 },
            latencyMs: 1,
          }),
        ),
      };
      const config = {
        getRequired: jest.fn(
          (name: string) =>
            (
              ({
                MASARIFI_AI_PROVIDER_ENABLED: true,
                MASARIFI_AI_JOB_BATCH_SIZE: 1,
                MASARIFI_AI_LEASE_SECONDS: 120,
                MASARIFI_AI_MAX_CONCURRENCY: 1,
              }) as Record<string, unknown>
            )[name],
        ),
        get: jest.fn(() => 'voice-worker'),
      };
      await new AiWorker(
        repository as never,
        storage as never,
        gateway as never,
        config as never,
      ).runOnce();
      const saved = repository.saveVoiceResult.mock.calls[0]?.[2] as
        { transcript?: string; language?: string; payload?: { type?: string } } | undefined;
      expect(saved).toMatchObject({
        transcript,
        language,
        payload: { type: 'transaction.create', accountId },
      });
      expect(storage.delete).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed before provider dispatch when media magic is invalid', async () => {
    const repository = {
      claimWork: jest.fn((kind: string) => Promise.resolve(kind === claim.kind ? [claim] : [])),
      workInput: jest.fn(() =>
        Promise.resolve({
          storageRef:
            'voice/99000000-0000-4000-8000-000000000003/99000000-0000-4000-8000-000000000004',
          sizeBytes: 44,
          contentType: 'audio/wav',
        }),
      ),
      getRoute: jest.fn(() => Promise.resolve(route)),
      completeWork: jest.fn(),
      recordFailure: jest.fn(),
      expire: jest.fn(),
      rollup: jest.fn(),
      claimPurges: jest.fn(() => Promise.resolve([])),
      reconcile: jest.fn(),
    };
    const gateway = { complete: jest.fn() };
    const config = {
      getRequired: jest.fn(
        (name: string) =>
          (
            ({
              MASARIFI_AI_PROVIDER_ENABLED: true,
              MASARIFI_AI_JOB_BATCH_SIZE: 1,
              MASARIFI_AI_LEASE_SECONDS: 120,
              MASARIFI_AI_MAX_CONCURRENCY: 1,
            }) as Record<string, unknown>
          )[name],
      ),
      get: jest.fn(() => 'voice-worker'),
    };
    await new AiWorker(
      repository as never,
      { download: jest.fn(() => Promise.resolve(Buffer.alloc(44))) } as never,
      gateway as never,
      config as never,
    ).runOnce();
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(repository.completeWork).toHaveBeenCalledWith(
      claim.kind,
      claim.id,
      claim.claim_token,
      'failed',
      'VOICE_MEDIA_INVALID',
    );
  });

  it('aborts an active provider request and drains cleanly on shutdown', async () => {
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const repository = {
      claimWork: jest.fn((kind: string) => Promise.resolve(kind === claim.kind ? [claim] : [])),
      workInput: jest.fn(() =>
        Promise.resolve({
          storageRef:
            'voice/99000000-0000-4000-8000-000000000003/99000000-0000-4000-8000-000000000004',
          sizeBytes: 44,
          contentType: 'audio/wav',
          locale: 'en',
          operationId: 'request-voice-shutdown',
          aliases: [{ alias: 'ACCOUNT-1', kind: 'account', id: accountId, version: 1, data: {} }],
        }),
      ),
      getRoute: jest.fn(() => Promise.resolve(route)),
      recordUsage: jest.fn(),
      saveVoiceResult: jest.fn(),
      completeWork: jest.fn(),
      recordFailure: jest.fn(),
      expire: jest.fn(),
      rollup: jest.fn(),
      claimPurges: jest.fn(() => Promise.resolve([])),
      reconcile: jest.fn(),
    };
    const audio = Buffer.alloc(44);
    audio.write('RIFF');
    audio.write('WAVE', 8);
    const gateway = {
      complete: jest.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            dispatched();
            signal.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    };
    const config = {
      getRequired: jest.fn(
        (name: string) =>
          (
            ({
              MASARIFI_AI_PROVIDER_ENABLED: true,
              MASARIFI_AI_JOB_BATCH_SIZE: 1,
              MASARIFI_AI_LEASE_SECONDS: 120,
              MASARIFI_AI_MAX_CONCURRENCY: 1,
            }) as Record<string, unknown>
          )[name],
      ),
      get: jest.fn(() => 'voice-worker'),
    };
    const worker = new AiWorker(
      repository as never,
      { download: jest.fn(() => Promise.resolve(audio)), delete: jest.fn() } as never,
      gateway as never,
      config as never,
    );
    const running = worker.runOnce();
    await started;
    await worker.stop();
    await running;
    expect(repository.completeWork).toHaveBeenCalledWith(
      claim.kind,
      claim.id,
      claim.claim_token,
      'failed',
      'AI_PROCESSING_FAILED',
    );
  });
});
