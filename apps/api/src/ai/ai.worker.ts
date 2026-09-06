import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { recordAiJob } from './ai.observability';
import { AiGateway, AiGatewayError, type EffectiveAiRoute } from './ai.gateway';
import { AiRepository, type AiWorkClaim } from './ai.repository';
import {
  ASSISTANT_OUTPUT_SCHEMA,
  VOICE_OUTPUT_SCHEMA,
  assertSafeAiInput,
  parseAssistantOutput,
  parseAssistantWorkerOutput,
  parseVoiceWorkerOutput,
  redactAiText,
  type AssistantOutput,
  type VoiceProposalOutput,
} from './ai.schemas';
import { AiStorage } from './ai.storage';

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

@Injectable()
export class AiWorker implements OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private abortController: AbortController | undefined;

  constructor(
    private readonly repository: AiRepository,
    private readonly storage: AiStorage,
    @Inject('AI_GATEWAY') private readonly gateway: AiGateway,
    private readonly config: PlatformConfigService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => {
        recordAiJob('ai.worker', 'failure');
      });
    }, this.config.getRequired('MASARIFI_AI_WORKER_POLL_MS'));
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
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    try {
      for (const job of [
        'voice.transcribe_extract',
        'assistant.respond',
        'ai.evaluate_route',
        'ai.usage_rollup',
        'voice-media.purge',
        'ai.reconcile',
      ] as const)
        await this.runJob(job);
    } finally {
      this.abortController = undefined;
      this.running = false;
    }
  }

  async runJob(
    job: AiWorkClaim['kind'] | 'ai.usage_rollup' | 'voice-media.purge' | 'ai.reconcile',
  ): Promise<number> {
    const limit = this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE');
    if (['voice.transcribe_extract', 'assistant.respond', 'ai.evaluate_route'].includes(job))
      return this.config.getRequired('MASARIFI_AI_PROVIDER_ENABLED')
        ? this.processKind(job as AiWorkClaim['kind'])
        : 0;
    if (job === 'ai.usage_rollup') {
      await this.repository.expire(limit);
      await this.repository.rollup(limit);
      recordAiJob(job, 'success');
      return 1;
    }
    if (job === 'voice-media.purge') return this.purge();
    await this.repository.reconcile(limit);
    return 1;
  }

  private async processKind(kind: AiWorkClaim['kind']): Promise<number> {
    const claims = await this.repository.claimWork(
      kind,
      this.workerId(),
      this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE'),
      this.config.getRequired('MASARIFI_AI_LEASE_SECONDS'),
    );
    const concurrency = this.config.getRequired('MASARIFI_AI_MAX_CONCURRENCY');
    for (let offset = 0; offset < claims.length; offset += concurrency)
      await Promise.all(
        claims.slice(offset, offset + concurrency).map((claim) => this.process(claim)),
      );
    return claims.length;
  }

  private async process(claim: AiWorkClaim): Promise<void> {
    const startedAt = performance.now();
    try {
      if (claim.kind === 'voice.transcribe_extract') await this.voice(claim);
      else if (claim.kind === 'assistant.respond') await this.assistant(claim);
      else await this.evaluate(claim);
      recordAiJob(claim.kind, 'success');
    } catch (error) {
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
    }
  }

  private async voice(claim: AiWorkClaim): Promise<void> {
    const input = object(await this.repository.workInput(claim.kind, claim.id, claim.claim_token));
    const route = await this.repository.getRoute('voice_transcription');
    if (!route) throw new AiGatewayError('AI_UNAVAILABLE');
    const audio = await this.storage.download(String(input.storageRef), Number(input.sizeBytes));
    const contentType = String(input.contentType);
    if (!validMagic(audio, contentType)) throw new Error('VOICE_MEDIA_INVALID');
    const references = aliasReferences(input.aliases);
    const descriptors = references.map(({ alias, kind, version, data }) => ({
      alias,
      kind,
      version,
      data,
    }));
    const completion = await this.gateway.complete({
      route,
      userContent: [
        {
          type: 'text',
          text: JSON.stringify({
            locale: String(input.locale),
            references: descriptors,
            instruction: 'Use only the supplied aliases for accountId and categoryId.',
          }),
        },
        {
          type: 'input_audio',
          input_audio: { data: audio.toString('base64'), format: audioFormat(contentType) },
        },
      ],
      schema: VOICE_OUTPUT_SCHEMA,
      parse: parseVoiceWorkerOutput,
      requestId: String(input.operationId),
      signal: this.abortController?.signal,
    });
    const output = completion.value,
      proposal = resolveVoiceProposal(output.proposal, references);
    assertConfiguredOutput(route, output.transcript, 'transcript');
    await this.repository.recordUsage(
      claim.user_id,
      'voice_transcription',
      completion,
      String(input.operationId),
    );
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

  private async assistant(claim: AiWorkClaim): Promise<void> {
    const input = object(await this.repository.workInput(claim.kind, claim.id, claim.claim_token));
    const route = await this.repository.getRoute('financial_assistant');
    if (!route) throw new AiGatewayError('AI_UNAVAILABLE');
    const evidence = Array.isArray(input.evidence) ? input.evidence : [];
    const references = aliasReferences(input.aliases);
    const completion = await this.gateway.complete({
      route,
      userContent: JSON.stringify({
        question: redactAiText(assertSafeAiInput(String(input.content), inputLimit(route))),
        evidence,
        references: references.map(({ alias, kind, version, data }) => ({
          alias,
          kind,
          version,
          data,
        })),
      }),
      schema: ASSISTANT_OUTPUT_SCHEMA,
      parse: parseAssistantWorkerOutput,
      requestId: String(input.operationId),
      signal: this.abortController?.signal,
    });
    const allowed = new Set(evidence.map((item) => String(object(item).alias)));
    if (
      completion.value.evidenceIds.some((id) => !allowed.has(id)) ||
      completion.value.actionPreview?.evidenceIds.some((id) => !allowed.has(id))
    )
      throw new AiGatewayError('AI_SCHEMA_INVALID', true);
    const refs = evidence.map((item) => {
      const value = object(item);
      return { kind: value.kind, alias: value.alias, version: value.version };
    });
    const output = resolveAssistantOutput(completion.value, references);
    assertConfiguredOutput(route, output, 'answer');
    await this.repository.recordUsage(
      claim.user_id,
      'financial_assistant',
      completion,
      String(input.operationId),
    );
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
    const claims = await this.repository.claimPurges(
      this.workerId(),
      this.config.getRequired('MASARIFI_AI_JOB_BATCH_SIZE'),
      this.config.getRequired('MASARIFI_AI_LEASE_SECONDS'),
    );
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
