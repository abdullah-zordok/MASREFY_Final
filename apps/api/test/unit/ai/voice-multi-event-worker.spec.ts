import { createHash } from 'node:crypto';
import { AiGateway, type EffectiveAiRoute } from '../../../src/ai/ai.gateway';
import { AiWorker } from '../../../src/ai/ai.worker';
import type { VoiceEventDecision } from '../../../src/ai/voice-batch';

const route: EffectiveAiRoute = {
  workload: 'voice_transcription',
  primary: { modelId: 'openai/gpt-audio-mini', provider: 'openai' },
  fallbacks: [],
  providerAllowlist: ['openai'],
  zdrRequired: true,
  maxPrice: { prompt: '0.1', completion: '0.1' },
  limits: { inputTokens: 4000, outputTokens: 1200, timeoutMs: 1000 },
  prompt: { template: 'safe', schemaVersion: 3 },
  safetyRules: [
    {
      key: 'input',
      type: 'input_block',
      configuration: { denyControl: true, denyBidiControls: true, maxUtf8Bytes: 8192 },
    },
    {
      key: 'output',
      type: 'output_block',
      configuration: {
        forbiddenKeys: ['tool', 'tools', 'sql', 'url', 'callback', 'authorization', 'secret'],
      },
    },
  ],
};
const cash = '11000000-0000-4000-8000-000000000001';
const bank = '11000000-0000-4000-8000-000000000002';
const category = '11000000-0000-4000-8000-000000000003';
const compact = (patch = {}) => ({
  s: 1,
  k: 'e',
  a: '1000',
  c: 'e:SAR',
  b: 'e:ACCOUNT-1',
  g: 'CATEGORY-1',
  d: 'o:',
  m: '',
  i: true,
  q: 1,
  ...patch,
});

it.each([
  { language: 'ar', empty: false, allSkipped: false, rejectAcceptance: false },
  { language: 'en', empty: false, allSkipped: false, rejectAcceptance: false },
  { language: 'ar', empty: true, allSkipped: false, rejectAcceptance: false },
  { language: 'ar', empty: false, allSkipped: true, rejectAcceptance: false },
  { language: 'ar', empty: false, allSkipped: false, rejectAcceptance: true },
])(
  'preserves event decisions and private diagnostic counts for %j',
  async ({ language, empty, allSkipped, rejectAcceptance }) => {
    const lines: string[] = [];
    const diagnostic = jest.spyOn(process.stdout, 'write').mockImplementation((line) => {
      lines.push(String(line));
      return true;
    });
    const records = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    try {
      const audio = Buffer.alloc(44);
      audio.write('RIFF');
      audio.write('WAVE', 8);
      const claim = {
        kind: 'voice.transcribe_extract' as const,
        id: '11000000-0000-4000-8000-000000000004',
        user_id: 'local-owner',
        claim_token: '11000000-0000-4000-8000-000000000005',
        attempt_count: 1,
      };
      const accepted: VoiceEventDecision[][] = [];
      const failures: string[] = [];
      const repository = {
        renewVoiceWork: () => Promise.resolve(true),
        getRoute: () => Promise.resolve(route),
        workInput: () =>
          Promise.resolve({
            contractVersion: 3,
            storageRef: 'local-audio',
            sizeBytes: audio.length,
            contentHash: createHash('sha256').update(audio).digest('hex'),
            contentType: 'audio/wav',
            locale: language,
            recordedAt: '2026-10-10T10:00:00.000Z',
            timezoneOffsetMinutes: -180,
            operationId: 'local-operation',
            defaultAccountId: cash,
            aliases: [
              {
                alias: 'ACCOUNT-1',
                id: cash,
                kind: 'account',
                version: 1,
                data: { name: 'النقدية / Cash', currency: 'SAR' },
              },
              {
                alias: 'ACCOUNT-2',
                id: bank,
                kind: 'account',
                version: 1,
                data: { name: 'الراجحي / Al Rajhi', currency: 'SAR' },
              },
              {
                alias: 'CATEGORY-1',
                id: category,
                kind: 'category',
                version: 1,
                data: { kind: 'expense' },
              },
            ],
          }),
        authorizeVoiceDispatch: () =>
          Promise.resolve({ operationId: 'local-operation', attemptNo: 1 }),
        recordVoiceAttempt: () => Promise.resolve(),
        acceptVoiceBatch: (_id: string, _token: string, decisions: VoiceEventDecision[]) => {
          accepted.push(decisions);
          return Promise.resolve({ accepted: !rejectAcceptance });
        },
        recordFailure: (_owner: string, _workload: string, code: string) => {
          failures.push(code);
          return Promise.resolve();
        },
        completeWork: () => Promise.resolve(),
      };
      let request = '';
      const gateway = new AiGateway({
        apiKey: 'local-nonfunctional-key',
        fetcher: (_url, init) => {
          if (typeof init?.body !== 'string') throw new Error('LOCAL_REQUEST_BODY_INVALID');
          request = init.body;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'local-generation',
                model: route.primary.modelId,
                usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: JSON.stringify({
                        complete: true,
                        language,
                        events: empty
                          ? []
                          : allSkipped
                            ? [compact({ a: '' })]
                            : [
                                compact({ s: 2, b: 'e:ACCOUNT-2', a: '2000' }),
                                compact(),
                                compact({ s: 3, k: 'i', a: '-10000', b: 'o:', g: '' }),
                                compact({ s: 4, a: '' }),
                              ],
                      }),
                    },
                  },
                ],
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          );
        },
      });
      const config = { get: () => undefined, getRequired: () => 120 };
      const worker = new AiWorker(
        repository as never,
        { download: () => Promise.resolve(audio), delete: () => Promise.resolve() } as never,
        gateway,
        config as never,
      );
      const processed = await worker.processVoiceClaim(claim);
      expect(failures).toEqual(rejectAcceptance ? ['VOICE_SCOPE_INVALID'] : []);
      expect(processed).toBe(!rejectAcceptance);
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toMatchObject(
        empty
          ? []
          : allSkipped
            ? [{ status: 'skipped', reason: 'missing_amount' }]
            : [
                {
                  status: 'eligible',
                  command: { kind: 'expense', amountMinor: 1000, accountId: cash },
                },
                {
                  status: 'eligible',
                  command: { kind: 'expense', amountMinor: 2000, accountId: bank },
                },
                {
                  status: 'eligible',
                  command: { kind: 'income', amountMinor: 10000, accountId: cash },
                },
                { status: 'skipped', reason: 'missing_amount' },
              ],
      );
      expect(request).toContain('النقدية / Cash');
      expect(request).toContain('الراجحي / Al Rajhi');
      expect(records()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'VOICE_EXTRACTION_DECIDED',
            context: 'AiWorker',
            eventName: 'voice.extraction_decided',
            state: empty ? 'empty' : allSkipped ? 'all_skipped' : 'eligible',
            extractedEventCount: empty ? 0 : allSkipped ? 1 : 4,
            eligibleEventCount: empty || allSkipped ? 0 : 3,
            skippedEventCount: empty ? 0 : 1,
            skipReasonCounts: empty ? {} : { missing_amount: 1 },
          }),
        ]),
      );
      if (rejectAcceptance) {
        expect(records().some((record) => record.message === 'VOICE_BATCH_ACCEPTED')).toBe(false);
      } else {
        expect(records()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: 'VOICE_BATCH_ACCEPTED',
              state: 'accepted',
              extractedEventCount: empty ? 0 : allSkipped ? 1 : 4,
            }),
          ]),
        );
      }
      for (const privateValue of [
        cash,
        bank,
        category,
        claim.id,
        claim.user_id,
        claim.claim_token,
        'local-audio',
        'local-operation',
        'النقدية',
        'الراجحي',
        '1000',
        '10000',
      ]) {
        expect(lines.join('')).not.toContain(privateValue);
      }
    } finally {
      diagnostic.mockRestore();
    }
  },
);
