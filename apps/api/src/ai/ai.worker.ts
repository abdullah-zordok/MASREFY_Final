import {
  VOICE_BATCH_OUTPUT_SCHEMA,
  VOICE_BATCH_PROMPT,
  VOICE_BATCH_POLICY,
  parseVoiceBatchProviderOutput,
  decideVoiceBatch,
  type SkipReason,
} from './voice-batch';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { withAiAbort } from './ai.abort';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { PlatformLogger } from '../platform/observability/platform-logger';
import { workerErrorFields } from '../platform/observability/worker-error';
import { recordAiJob, recordAiResult } from './ai.observability';
import { AiGateway, AiGatewayError, type EffectiveAiRoute } from './ai.gateway';
import { AiRepository, type AiWorkClaim } from './ai.repository';
import {
  ASSISTANT_OUTPUT_SCHEMA,
  ASSISTANT_ADVICE_OUTPUT_SCHEMA,
  VOICE_OUTPUT_SCHEMA,
  assertSafeAiInput,
  parseAssistantOutput,
  parseAssistantWorkerOutput,
  parseAssistantAdviceWorkerOutput,
  parseVoiceWorkerOutput,
  redactAiContext,
  redactAiText,
  type AssistantOutput,
  type VoiceProposalOutput,
} from './ai.schemas';
import { AiStorage } from './ai.storage';
import type { AiWorkerHealthState } from './ai-worker-health';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AI_WORK_INPUT_INVALID');
  return value as Record<string, unknown>;
}

function audioFormat(contentType: string): string {
  return (
    (
      {
        'audio/m4a': 'm4a',
        'audio/mp4': 'mp4',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
      } as Record<string, string>
    )[contentType] ?? 'unknown'
  );
}

function validMagic(body: Buffer, contentType: string): boolean {
  if (body.length < 12) return false;
  if (contentType === 'audio/wav')
    return (
      body.subarray(0, 4).toString('ascii') === 'RIFF' &&
      body.subarray(8, 12).toString('ascii') === 'WAVE'
    );
  if (contentType === 'audio/ogg') return body.subarray(0, 4).toString('ascii') === 'OggS';
  if (contentType === 'audio/mpeg')
    return (
      body.subarray(0, 3).toString('ascii') === 'ID3' ||
      (body[0] === 0xff && (body[1] ?? 0) >= 0xe0)
    );
  if (contentType === 'audio/webm')
    return body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return body.subarray(4, 8).toString('ascii') === 'ftyp';
}

interface AliasReference {
  alias: string;
  kind: string;
  id: string;
  version: number;
  data: Record<string, unknown>;
}

function aliasReferences(value: unknown): AliasReference[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('AI_WORK_INPUT_INVALID');
  const references = value.map((item) => {
    const row = object(item);
    if (
      typeof row.alias !== 'string' ||
      typeof row.kind !== 'string' ||
      typeof row.id !== 'string' ||
      typeof row.version !== 'number'
    )
      throw new Error('AI_WORK_INPUT_INVALID');
    return {
      alias: row.alias,
      kind: row.kind,
      id: row.id,
      version: row.version,
      data:
        row.data && typeof row.data === 'object' && !Array.isArray(row.data)
          ? (row.data as Record<string, unknown>)
          : {},
    };
  });
  if (new Set(references.map(({ alias }) => alias)).size !== references.length)
    throw new Error('AI_WORK_INPUT_INVALID');
  return references;
}

function resolveId(
  value: unknown,
  kind: string,
  references: AliasReference[],
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') throw new Error('AI_SCHEMA_INVALID');
  const match = references.find(
    (item) => item.kind === kind && (item.alias === value || item.id === value),
  );
  if (!match) throw new Error('AI_SCHEMA_INVALID');
  return match.id;
}

function resolveVoiceProposal(
  proposal: VoiceProposalOutput,
  references: AliasReference[],
): VoiceProposalOutput {
  return {
    ...proposal,
    accountId: resolveId(proposal.accountId, 'account', references),
    categoryId: resolveId(proposal.categoryId, 'category', references, true),
  };
}

function resolveAssistantOutput(
  output: AssistantOutput,
  references: AliasReference[],
): AssistantOutput {
  if (!output.actionPreview) return output;
  const payload = structuredClone(output.actionPreview.payload);
  const kinds: Record<string, string> = {
    accountId: 'account',
    linkedAccountId: 'account',
    categoryId: 'category',
    transactionId: 'transaction',
    budgetId: 'budget',
    obligationId: 'obligation',
    scheduleItemId: 'schedule',
    reviewId: 'review',
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const kind = kinds[key];
      if (kind)
        (value as Record<string, unknown>)[key] = resolveId(
          child,
          kind,
          references,
          key === 'categoryId' || key === 'linkedAccountId',
        );
      else visit(child);
    }
  };
  visit(payload);
  return parseAssistantOutput({ ...output, actionPreview: { ...output.actionPreview, payload } });
}

function safetyConfigurations(
  route: EffectiveAiRoute,
  type: EffectiveAiRoute['safetyRules'][number]['type'],
): Record<string, unknown>[] {
  return route.safetyRules
    .filter((rule) => rule.type === type)
    .map(({ configuration }) => configuration);
}

function inputLimit(route: EffectiveAiRoute): number {
  return Math.min(
    8_192,
    ...safetyConfigurations(route, 'input_block').map(({ maxUtf8Bytes }) => Number(maxUtf8Bytes)),
  );
}

function assertConfiguredOutput(
  route: EffectiveAiRoute,
  value: unknown,
  field: 'answer' | 'transcript',
): void {
  const maximum = Math.min(
    field === 'answer' ? 16_384 : 8_192,
    ...safetyConfigurations(route, 'field_limit')
      .filter((rule) => rule.field === field)
      .map(({ maxUtf8Bytes }) => Number(maxUtf8Bytes)),
  );
  const text = field === 'answer' ? (value as AssistantOutput).answer : String(value);
  if (new TextEncoder().encode(text).length > maximum) throw new Error('AI_SCHEMA_INVALID');
  const forbidden = new Set(
    safetyConfigurations(route, 'output_block').flatMap(({ forbiddenKeys }) =>
      Array.isArray(forbiddenKeys) ? forbiddenKeys.map((key) => String(key).toLowerCase()) : [],
    ),
  );
  const containsForbidden = (entry: unknown): boolean =>
    Array.isArray(entry)
      ? entry.some(containsForbidden)
      : Boolean(
          entry &&
          typeof entry === 'object' &&
          Object.entries(entry as Record<string, unknown>).some(
            ([key, child]) => forbidden.has(key.toLowerCase()) || containsForbidden(child),
          ),
        );
  if (containsForbidden(value)) throw new Error('AI_SCHEMA_INVALID');
  if (field === 'answer') {
    const output = value as AssistantOutput;
    const evidenceMaximum = Math.min(
      ...safetyConfigurations(route, 'evidence_limit').map(({ maxItems }) => Number(maxItems)),
    );
    if (
      output.evidenceIds.length > evidenceMaximum ||
      (output.actionPreview?.evidenceIds.length ?? 0) > evidenceMaximum
    )
      throw new Error('AI_SCHEMA_INVALID');
    const allowlists = safetyConfigurations(route, 'action_allowlist').map(
      ({ values }) => new Set(Array.isArray(values) ? values.map(String) : []),
    );
    if (
      output.actionPreview &&
      allowlists.some((allowed) => !allowed.has(output.actionPreview?.actionType ?? ''))
    )
      throw new Error('AI_SCHEMA_INVALID');
  }
}

function normalizedDigits(value: string): string {
  const arabic = '٠١٢٣٤٥٦٧٨٩',
    eastern = '۰۱۲۳۴۵۶۷۸۹';
  return Array.from(value)
    .map((character) => {
      const arabicIndex = arabic.indexOf(character),
        easternIndex = eastern.indexOf(character);
      if (arabicIndex >= 0) return arabicIndex.toString();
      if (easternIndex >= 0) return easternIndex.toString();
      return character === '٫' || character === ',' ? '.' : character;
    })
    .join('');
}

export function evaluatePromptCorpus(template: string, cases: unknown[]): void {
  if (
    cases.length === 0 ||
    template.length > 32_768 ||
    !/\b(?:no|never|do not)\b[\s\S]{0,24}\btools?\b/iu.test(template)
  )
    throw new Error('AI_EVALUATION_FAILED');
  for (const item of cases) {
    const test = object(item),
      fixture = object(test.fixture),
      expected = object(test.expected);
    if (
      Object.keys(expected).some(
        (key) =>
          !['schema', 'noTools', 'blocked', 'amountMinor', 'currency', 'citations'].includes(key),
      )
    )
      throw new Error('AI_EVALUATION_FAILED');
    if (expected.noTools !== true || (expected.blocked !== true && expected.schema !== true))
      throw new Error('AI_EVALUATION_FAILED');
    const input =
      typeof fixture.question === 'string'
        ? fixture.question
        : typeof fixture.text === 'string'
          ? fixture.text
          : '';
    if (expected.blocked === true) {
      try {
        assertSafeAiInput(input);
        throw new Error('AI_EVALUATION_FAILED');
      } catch (error) {
        if (error instanceof Error && error.message === 'AI_EVALUATION_FAILED') throw error;
      }
    } else if (input) assertSafeAiInput(input);
    if (typeof expected.amountMinor === 'string') {
      const amount = normalizedDigits(input).match(/-?\d+(?:\.\d{1,2})?/u)?.[0];
      if (!amount || Math.round(Number(amount) * 100).toString() !== expected.amountMinor)
        throw new Error('AI_EVALUATION_FAILED');
    }
    if (
      typeof expected.currency === 'string' &&
      !(expected.currency === 'SAR' && /\bSAR\b|ريال/iu.test(input))
    )
      throw new Error('AI_EVALUATION_FAILED');
    if (Array.isArray(expected.citations)) {
      const aliases = Array.isArray(fixture.evidence)
        ? fixture.evidence.map((entry) => String(object(entry).alias))
        : [];
      if (expected.citations.some((alias) => typeof alias !== 'string' || !aliases.includes(alias)))
        throw new Error('AI_EVALUATION_FAILED');
    }
  }
}

export function assistantProviderPayload(input: Record<string, unknown>) {
  const references = aliasReferences(input.aliases).map(({ alias, kind, version, data }) => ({
    alias,
    kind,
    version,
    data: redactAiContext(data),
  }));
  const history = Array.isArray(input.historyPayload) ? input.historyPayload.slice(-4) : [];
  const context = object(input.contextPayload);
  const metadata =
    context.assistantMetadata && typeof context.assistantMetadata === 'object'
      ? object(context.assistantMetadata)
      : {};
  return {
    responseLanguage: context.responseLocale ?? metadata.locale ?? 'ar',
    intent: String(input.intent),
    question: redactAiText(assertSafeAiInput(String(input.content))),
    financialTruth: redactAiContext(object(input.contextPayload)),
    conversation: history.map((turn) => {
      const value = object(turn);
      return {
        role: value.role === 'assistant' ? 'assistant' : 'user',
        content: redactAiText(assertSafeAiInput(String(value.content))),
      };
    }),
    references,
  };
}

export function encodeAssistantProviderPayload(
  input: Record<string, unknown>,
  maximumBytes: number,
): string {
  const encoded = JSON.stringify(assistantProviderPayload(input));
  if (new TextEncoder().encode(encoded).length > maximumBytes) throw new Error('AI_CONTEXT_LIMIT');
  return encoded;
}

@Injectable()
export class AiWorker implements OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private abortController: AbortController | undefined;
  private healthObserver: ((state: AiWorkerHealthState) => void) | undefined;

  constructor(
    private readonly repository: AiRepository,
    private readonly storage: AiStorage,
    @Inject('AI_GATEWAY') private readonly gateway: AiGateway,
    private readonly config: PlatformConfigService,
  ) {}

  observeHealth(observer: (state: AiWorkerHealthState) => void): void {
    this.healthObserver = observer;
    this.reportHealth('starting');
  }

  private reportHealth(state: AiWorkerHealthState): void {
    try {
      this.healthObserver?.(state);
    } catch {
      new PlatformLogger().error('AI_WORKER_HEALTH_UNAVAILABLE', { context: 'AiWorker' });
    }
  }

  start(): void {
    if (this.timer) return;
    this.reportHealth('starting');
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => {
        recordAiJob('ai.worker', 'failure');
      });
    }, this.config.getRequired('MASARIFI_AI_WORKER_POLL_MS'));
    if (
      !this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY') &&
      !this.config.get('MASARIFI_AI_ASSISTANT_ONLY')
    )
      this.timer.unref();
    void this.runOnce().catch(() => {
      recordAiJob('ai.worker', 'failure');
    });
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.abortController?.abort();
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
    this.reportHealth('stopped');
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    let stage = 'scope';
    let healthFailed = false;
    try {
      if (this.config.get('MASARIFI_AI_ASSISTANT_ONLY')) {
        if (this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY'))
          throw new Error('ASSISTANT_SCOPE_INVALID');
        stage = 'assistant.respond';
        await this.runJob('assistant.respond');
        return;
      }
      if (this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY')) {
        stage = 'voice.transcribe_extract';
        await this.runJob('voice.transcribe_extract');
        stage = 'voice-media.purge';
        await this.runJob('voice-media.purge');
        return;
      }
      for (const job of [
        'voice.transcribe_extract',
        'assistant.respond',
        'ai.evaluate_route',
        'voice.finalize',
        'ai.usage_rollup',
        'voice-media.purge',
        'ai.reconcile',
      ] as const) {
        stage = job;
        await this.runJob(job);
      }
    } catch (error) {
      healthFailed = true;
      this.reportHealth('failed');
      new PlatformLogger().error('AI_WORKER_RUNTIME_FAILED', {
        context: 'AiWorker',
        failureStage: stage,
        ...workerErrorFields(error),
      });
      throw error;
    } finally {
      this.abortController = undefined;
      this.running = false;
      if (!healthFailed) this.reportHealth('ready');
    }
  }

  async runJob(
    job:
      | AiWorkClaim['kind']
      | 'voice.finalize'
      | 'ai.usage_rollup'
      | 'voice-media.purge'
      | 'ai.reconcile'
      | 'financial-insights.generate',
  ): Promise<number> {
    if (this.config.get('MASARIFI_AI_ASSISTANT_ONLY') && job !== 'assistant.respond')
      throw new Error('ASSISTANT_SCOPE_INVALID');
    if (
      this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY') &&
      !['voice.transcribe_extract', 'voice-media.purge'].includes(job)
    )
      throw new Error('VOICE_ANALYSIS_JOB_FORBIDDEN');
    const limit = this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE');
    if (['voice.transcribe_extract', 'assistant.respond', 'ai.evaluate_route'].includes(job))
      return this.config.getRequired('MASARIFI_AI_PROVIDER_ENABLED')
        ? this.processKind(job as AiWorkClaim['kind'])
        : 0;
    if (job === 'voice.finalize') return this.repository.finalizeVoiceBatches(limit);
    if (job === 'ai.usage_rollup') {
      await this.repository.expire(limit);
      await this.repository.rollup(limit);
      recordAiJob(job, 'success');
      return 1;
    }
    if (job === 'voice-media.purge') return this.purge();
    if (job === 'financial-insights.generate') return this.repository.refreshInsights(limit);
    await this.repository.reconcile(limit);
    return 1;
  }

  private async processKind(kind: AiWorkClaim['kind']): Promise<number> {
    if (this.config.get('MASARIFI_AI_ASSISTANT_ONLY') && kind !== 'assistant.respond')
      throw new Error('ASSISTANT_SCOPE_INVALID');
    const concurrency = this.config.getRequired('MASARIFI_AI_MAX_CONCURRENCY');
    const limit = Math.min(concurrency, this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE'));
    const lease = this.config.getRequired('MASARIFI_AI_LEASE_SECONDS');
    const claims = this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY')
      ? kind === 'voice.transcribe_extract'
        ? await this.repository.claimAnalysisWork(this.workerId(), limit, lease)
        : []
      : await this.repository.claimWork(kind, this.workerId(), limit, lease);
    if (
      this.config.get('MASARIFI_AI_ASSISTANT_ONLY') &&
      claims.some((claim) => claim.kind !== 'assistant.respond')
    )
      throw new Error('ASSISTANT_SCOPE_INVALID');
    for (let offset = 0; offset < claims.length; offset += concurrency)
      await Promise.all(
        claims.slice(offset, offset + concurrency).map((claim) => this.process(claim)),
      );
    return claims.length;
  }

  async processVoiceClaim(claim: AiWorkClaim, signal?: AbortSignal): Promise<boolean> {
    if (claim.kind !== 'voice.transcribe_extract') throw new Error('VOICE_SCOPE_INVALID');
    return this.process(claim, signal);
  }

  private async process(claim: AiWorkClaim, externalSignal?: AbortSignal): Promise<boolean> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      ...(this.abortController ? [this.abortController.signal] : []),
      ...(externalSignal ? [externalSignal] : []),
    ]);
    let renewal: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;
    let renewing = false;
    let outcome = 'failure';
    try {
      if (claim.kind === 'voice.transcribe_extract') {
        const lease = this.config.getRequired('MASARIFI_AI_LEASE_SECONDS');
        if (!(await this.repository.renewVoiceWork(claim.id, claim.claim_token, lease)))
          throw new Error('AI_WORK_FENCE_INVALID');
        renewal = setInterval(
          () => {
            if (renewing) return;
            renewing = true;
            void this.repository
              .renewVoiceWork(claim.id, claim.claim_token, lease)
              .then((valid) => {
                if (!valid) controller.abort();
              })
              .catch(() => {
                controller.abort();
              })
              .finally(() => {
                renewing = false;
              });
          },
          Math.floor((lease * 1_000) / 3),
        );
        // Provider remains governed by its original deadline; this bounds the whole job including I/O.
        deadline = setTimeout(() => {
          controller.abort();
        }, 180_000);
        await withAiAbort(signal, () => this.voice(claim, signal));
      } else if (claim.kind === 'assistant.respond') {
        // No lease extension exists for assistant work. Bound all I/O inside the current fence.
        const leaseMs = this.config.getRequired('MASARIFI_AI_LEASE_SECONDS') * 1000;
        deadline = setTimeout(
          () => {
            controller.abort();
          },
          Math.max(1, leaseMs - Math.min(1000, leaseMs / 3)),
        );
        await withAiAbort(signal, () => this.assistant(claim, signal));
      } else await this.evaluate(claim);
      recordAiJob(claim.kind, 'success');
      outcome = 'success';
      return true;
    } catch (error) {
      if (error instanceof AiGatewayError && error.diagnostic)
        new PlatformLogger().warn('AI_PROVIDER_REQUEST_REJECTED', {
          ...error.diagnostic,
          eventName: 'ai.provider.request_rejected',
        });
      if (error instanceof Error && error.message === 'VOICE_MEDIA_INVALID')
        new PlatformLogger().warn('VOICE_MEDIA_INVALID', {
          eventName: 'voice.media.rejected',
          state:
            typeof error.cause === 'string' &&
            [
              'magic',
              'expected_size',
              'header_missing',
              'declared_length',
              'response_body',
              'stream_overflow',
              'stream_length',
            ].includes(error.cause)
              ? error.cause
              : 'unknown',
        });
      const code =
        error instanceof AiGatewayError
          ? error.code
          : error instanceof Error && /^[A-Z][A-Z0-9_]{1,79}$/.test(error.message)
            ? error.message
            : 'AI_PROCESSING_FAILED';
      const retry = error instanceof AiGatewayError && error.retryable && claim.attempt_count < 2;
      await this.repository.recordFailure(
        claim.user_id,
        claim.kind === 'voice.transcribe_extract' ? 'voice_transcription' : 'financial_assistant',
        code,
        code === 'AI_SCHEMA_INVALID',
        retry,
        Math.round(performance.now() - startedAt),
        claim.id,
      );
      await this.repository.completeWork(
        claim.kind,
        claim.id,
        claim.claim_token,
        retry ? 'retry' : 'failed',
        code,
      );
      recordAiJob(claim.kind, retry ? 'retry' : 'failure');
      outcome = retry ? 'retry' : 'failure';
      return false;
    } finally {
      if (renewal) clearInterval(renewal);
      if (deadline) clearTimeout(deadline);
      if (claim.kind === 'assistant.respond') {
        const durationMs = Math.round(performance.now() - startedAt);
        recordAiResult('assistant.respond', outcome, durationMs);
        new PlatformLogger().log('ASSISTANT_WORK_FINISHED', {
          eventName: 'assistant.work_finished',
          jobName: claim.kind,
          state: outcome,
          durationMs,
          requestId: createHash('sha256').update(claim.id).digest('hex').slice(0, 24),
        });
      }
    }
  }

  private async voice(claim: AiWorkClaim, signal: AbortSignal): Promise<void> {
    const input = object(await this.repository.workInput(claim.kind, claim.id, claim.claim_token));
    const route = await this.repository.getRoute('voice_transcription');
    if (!route) throw new AiGatewayError('AI_UNAVAILABLE');
    const audio = await this.storage.download(
      String(input.storageRef),
      Number(input.sizeBytes),
      signal,
    );
    const contentType = String(input.contentType);
    if (!validMagic(audio, contentType)) throw new Error('VOICE_MEDIA_INVALID', { cause: 'magic' });
    if (
      audio.length !== Number(input.sizeBytes) ||
      typeof input.contentHash !== 'string' ||
      createHash('sha256').update(audio).digest('hex') !== input.contentHash
    )
      throw new Error('VOICE_MEDIA_INVALID', { cause: 'hash_mismatch' });
    if (signal.aborted) throw new Error('AI_WORK_CANCELLED');
    const references = aliasReferences(input.aliases);
    const batch = input.contractVersion === 3;
    const descriptors = references.map(({ alias, kind, version, data }) => {
      if (kind === 'account' && typeof data.name === 'string') {
        data = { ...data };
        try {
          data.name = redactAiText(assertSafeAiInput(data.name as string));
        } catch {
          delete data.name;
        }
      }
      return { alias, kind, version, data };
    });
    let attemptNo = 0;
    const completion = await this.gateway.complete<unknown>({
      route: batch
        ? {
            ...route,
            limits: { ...route.limits, outputTokens: Math.min(1200, route.limits.outputTokens) },
            prompt: { template: VOICE_BATCH_PROMPT, schemaVersion: 3 },
          }
        : route,
      voiceBatch: batch,
      userContent: [
        {
          type: 'text',
          text: JSON.stringify({
            locale: String(input.locale),
            capture: {
              recordedAt: new Date(String(input.recordedAt)).toISOString(),
              timezoneOffsetMinutes: input.timezoneOffsetMinutes,
              referenceLocalDate: new Date(
                Date.parse(String(input.recordedAt)) - Number(input.timezoneOffsetMinutes) * 60_000,
              )
                .toISOString()
                .slice(0, 10),
              legacyContext: input.captureContextLegacy,
            },
            references: descriptors,
            instruction: batch
              ? VOICE_BATCH_PROMPT
              : 'Use only supplied aliases. Expenses use positive amountMinor; income uses negative amountMinor. Return unsupported for transfers, multiple operations, obligations, or unclear intent; never downgrade them to one transaction.',
          }),
        },
        {
          type: 'input_audio',
          input_audio: { data: audio.toString('base64'), format: audioFormat(contentType) },
        },
      ],
      schema: batch ? VOICE_BATCH_OUTPUT_SCHEMA : VOICE_OUTPUT_SCHEMA,
      parse: batch ? parseVoiceBatchProviderOutput : parseVoiceWorkerOutput,
      requestId: String(input.operationId),
      signal,
      beforeDispatch: async (candidate) => {
        const authorized = await this.repository.authorizeVoiceDispatch(
          claim.id,
          claim.claim_token,
          candidate.modelId,
          candidate.provider,
          route,
        );
        if (authorized.operationId !== input.operationId || !Number.isInteger(authorized.attemptNo))
          throw new Error('AI_DISPATCH_REJECTED');
        attemptNo = Number(authorized.attemptNo);
      },
      onReceipt: (receipt) =>
        this.repository
          .recordVoiceAttempt(String(input.operationId), attemptNo, receipt, true)
          .then(() => undefined),
      onDispatchFailure: (received) =>
        this.repository
          .recordVoiceAttempt(String(input.operationId), attemptNo, null, received)
          .then(() => undefined),
    });
    if (batch) {
      const decisions = decideVoiceBatch(completion.value, {
        recordedAt: String(input.recordedAt),
        timezoneOffsetMinutes: Number(input.timezoneOffsetMinutes),
        defaultAccountId:
          typeof input.defaultAccountId === 'string' ? input.defaultAccountId : null,
        references,
      });
      // Decisions are bounded by the parsed envelope and reasons are server enums.
      // Never log command bodies or infer silence from a provider's empty array.
      const skipReasonCounts: Partial<Record<SkipReason, number>> = {};
      let eligibleEventCount = 0;
      for (const decision of decisions) {
        if (decision.status === 'eligible') eligibleEventCount++;
        else skipReasonCounts[decision.reason] = (skipReasonCounts[decision.reason] ?? 0) + 1;
      }
      const diagnosticCounts = {
        extractedEventCount: decisions.length,
        eligibleEventCount,
        skippedEventCount: decisions.length - eligibleEventCount,
        skipReasonCounts,
      };
      const logger = new PlatformLogger();
      logger.info('VOICE_EXTRACTION_DECIDED', {
        context: 'AiWorker',
        eventName: 'voice.extraction_decided',
        state:
          decisions.length === 0 ? 'empty' : eligibleEventCount === 0 ? 'all_skipped' : 'eligible',
        ...diagnosticCounts,
      });
      signal.throwIfAborted();
      const acceptance = await this.repository.acceptVoiceBatch(
        claim.id,
        claim.claim_token,
        decisions,
        VOICE_BATCH_POLICY,
      );
      if (acceptance.accepted !== true) throw new Error('VOICE_SCOPE_INVALID');
      logger.info('VOICE_BATCH_ACCEPTED', {
        context: 'AiWorker',
        eventName: 'voice.batch_accepted',
        state: 'accepted',
        ...diagnosticCounts,
      });
      if (input.retainAcceptanceEvidence !== true) {
        try {
          await this.storage.delete(String(input.storageRef));
        } catch {
          recordAiJob('voice-media.purge', 'retry');
        }
      }
      return;
    }
    const output = parseVoiceWorkerOutput(completion.value);
    assertConfiguredOutput(route, output.transcript, 'transcript');
    if (output.outcome === 'unsupported')
      throw new Error(`VOICE_INTENT_UNSUPPORTED_${output.unsupportedReason.toUpperCase()}`);
    const proposal = resolveVoiceProposal(output.proposal, references);
    signal.throwIfAborted();
    await this.repository.saveVoiceResult(claim.id, claim.claim_token, {
      provider: completion.provider,
      model: completion.model,
      transcript: redactAiText(assertSafeAiInput(output.transcript)),
      confidence: output.confidence,
      language: output.language,
      payload: proposal,
    });
    try {
      await this.storage.delete(String(input.storageRef));
    } catch {
      recordAiJob('voice-media.purge', 'retry');
    }
  }

  private async assistant(claim: AiWorkClaim, signal: AbortSignal): Promise<void> {
    const input = object(await this.repository.workInput(claim.kind, claim.id, claim.claim_token));
    signal.throwIfAborted();
    const route = await this.repository.getRoute('financial_assistant');
    signal.throwIfAborted();
    if (!route) throw new AiGatewayError('AI_UNAVAILABLE');
    const evidence = Array.isArray(input.evidence) ? input.evidence : [];
    const references = aliasReferences(input.aliases);
    const completion = await this.gateway.complete({
      route,
      userContent: encodeAssistantProviderPayload(input, inputLimit(route)),
      schema:
        input.intent === 'financial_advice'
          ? ASSISTANT_ADVICE_OUTPUT_SCHEMA
          : ASSISTANT_OUTPUT_SCHEMA,
      parse:
        input.intent === 'financial_advice'
          ? parseAssistantAdviceWorkerOutput
          : parseAssistantWorkerOutput,
      requestId: String(input.operationId),
      signal,
    });
    signal.throwIfAborted();
    const allowed = new Set([
      ...evidence.map((item) => String(object(item).alias)),
      ...references.map(({ alias }) => alias),
    ]);
    if (
      completion.value.evidenceIds.some((id) => !allowed.has(id)) ||
      completion.value.actionPreview?.evidenceIds.some((id) => !allowed.has(id))
    )
      throw new AiGatewayError('AI_SCHEMA_INVALID', true);
    const refs = evidence.map((item) => {
      const value = object(item);
      return {
        kind: value.kind,
        alias: value.alias,
        version: value.version,
        ...(typeof value.asOf === 'string' ? { asOf: value.asOf } : {}),
      };
    });
    const output = resolveAssistantOutput(completion.value, references);
    assertConfiguredOutput(route, output, 'answer');
    await this.repository.recordUsage(
      claim.user_id,
      'financial_assistant',
      completion,
      String(input.operationId),
    );
    signal.throwIfAborted();
    await this.repository.saveAssistantResult(claim.id, claim.claim_token, {
      provider: completion.provider,
      model: completion.model,
      content: redactAiText(output.answer),
      evidence: refs,
      preview: output.actionPreview,
    });
  }

  private async evaluate(claim: AiWorkClaim): Promise<void> {
    const input = object(await this.repository.workInput(claim.kind, claim.id, claim.claim_token));
    const cases = Array.isArray(input.cases) ? input.cases : [];
    if (typeof input.template !== 'string') throw new Error('AI_EVALUATION_FAILED');
    evaluatePromptCorpus(input.template, cases);
    await this.repository.completeWork(claim.kind, claim.id, claim.claim_token, 'completed', null);
  }

  private async purge(): Promise<number> {
    const limit = this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE');
    const lease = this.config.getRequired('MASARIFI_AI_LEASE_SECONDS');
    const claims = this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY')
      ? await this.repository.claimAnalysisPurges(this.workerId(), limit, lease)
      : await this.repository.claimPurges(this.workerId(), limit, lease);
    for (const claim of claims) {
      try {
        await this.storage.delete(claim.storage_ref);
        await this.repository.completePurge(claim.id, claim.purge_token, true);
        recordAiJob('voice-media.purge', 'success');
      } catch {
        await this.repository.completePurge(claim.id, claim.purge_token, false);
        recordAiJob('voice-media.purge', 'failure');
      }
    }
    return claims.length;
  }

  private workerId(): string {
    return this.config.get('MASARIFI_WORKER_ID') ?? `ai-${process.pid.toString()}`;
  }
}
