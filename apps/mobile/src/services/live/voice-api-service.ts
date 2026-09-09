import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import {
  assessment,
  type VoiceField,
  type VoiceProposalGroup,
  type VoiceScenario,
  type VoiceTranscript,
  type VoiceTransactionProposal
} from '@/domain/voice-capture';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import {
  VoiceCaptureError,
  voiceAnalyzerServiceCapability,
  type VoiceAnalyzerService
} from '@/services/contracts/voice-capture-service';

type TokenProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () =>
  Promise.reject(new VoiceCaptureError('analysis_unavailable'));
let tokenProviderConfigured = false;

export function configureVoiceApiTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
  tokenProviderConfigured = true;
}

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sessionSchema = z
  .object({
    id: uuid,
    locale: z.enum(['ar', 'en']),
    status: z.enum([
      'uploaded',
      'processing',
      'proposed',
      'confirmed',
      'expired',
      'failed'
    ]),
    durationMs: z.number().int().min(1).max(120_000),
    expiresAt: timestamp,
    confirmedAt: timestamp.nullable().optional(),
    failureCode: z.string().max(64).nullable().optional(),
    version: z.number().int().positive(),
    createdAt: timestamp
  })
  .strict();
const uploadResponseSchema = z
  .object({
    session: sessionSchema,
    upload: z
      .object({
        url: z.string().url(),
        token: z.string().min(1),
        expiresAt: timestamp,
        headers: z.record(z.string(), z.string())
      })
      .strict()
  })
  .strict();
const acceptedWorkSchema = z
  .object({
    id: uuid,
    status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled'])
  })
  .strict();
const payloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal('transaction.create'),
    amountMinor: z.string().regex(/^-?[1-9][0-9]{0,18}$/u),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    categoryId: uuid.nullable(),
    accountId: uuid.nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    merchant: z.string().max(160).nullable(),
    note: z.string().max(500).nullable(),
    confidence: z.number().min(0).max(1)
  })
  .strict();
const fieldSchema = z
  .object({
    name: z.enum([
      'amountMinor',
      'currency',
      'categoryId',
      'accountId',
      'date',
      'merchant',
      'note'
    ]),
    value: z.unknown(),
    confidence: z.number().min(0).max(1).nullable(),
    sourceSpan: z.string().max(160).nullable().optional()
  })
  .strict();
const proposalSchema = z
  .object({
    id: uuid,
    redactedTranscript: z.string().max(16_384),
    schemaVersion: z.literal(1),
    type: z.literal('transaction.create'),
    payload: payloadSchema,
    fields: z.array(fieldSchema).max(10),
    status: z.enum([
      'draft',
      'validated',
      'confirmed',
      'executed',
      'rejected',
      'expired'
    ]),
    expiresAt: timestamp,
    confirmedAt: timestamp.nullable().optional(),
    executedTransactionId: uuid.nullable().optional(),
    version: z.number().int().positive()
  })
  .strict();
const executedActionSchema = z
  .object({
    sourceId: uuid,
    actionType: z.literal('transaction.create'),
    resourceId: uuid,
    status: z.literal('executed'),
    replayed: z.boolean()
  })
  .strict();

type ServerProposal = z.infer<typeof proposalSchema>;
const unsupportedScenarios = new Set<VoiceScenario>([
  'multiple',
  'transfer',
  'obligation'
]);

function failClosed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new VoiceCaptureError('analysis_failed');
  return result.data;
}

function mapField(
  value: z.infer<typeof fieldSchema>
): ReturnType<typeof assessment> {
  const names: Record<z.infer<typeof fieldSchema>['name'], VoiceField> = {
    amountMinor: 'amount',
    currency: 'currency',
    categoryId: 'category',
    accountId: 'account',
    date: 'date',
    merchant: 'merchant',
    note: 'notes'
  };
  const field = names[value.name];
  const confidence = Math.round((value.confidence ?? 0) * 100);
  return assessment(
    field,
    confidence,
    `voice.confidence.${field}`,
    value.value == null
  );
}

function mapProposal(value: ServerProposal): VoiceTransactionProposal {
  if (value.status !== 'validated')
    throw new VoiceCaptureError('analysis_unavailable');
  const amount = Number(value.payload.amountMinor);
  if (!Number.isSafeInteger(amount) || amount === 0)
    throw new VoiceCaptureError('invalid_proposal');
  const occurredAt = Date.parse(`${value.payload.date}T12:00:00.000Z`);
  const assessments = value.fields.map(mapField);
  const type = amount < 0 ? 'income' : 'expense';
  return {
    id: value.id,
    type,
    amountMinor: Math.abs(amount),
    currencyCode: value.payload.currency,
    merchant: value.payload.merchant,
    title: value.payload.merchant ?? 'Voice transaction',
    categoryId: value.payload.categoryId,
    paymentMethod: null,
    accountId: value.payload.accountId,
    destinationAccountId: null,
    occurredAt,
    beneficiary: null,
    obligationId: null,
    duplicateOfTransactionId: null,
    notes: value.payload.note,
    assessments,
    recurringSuggestion: null,
    selected: true,
    status:
      value.payload.accountId && (value.payload.categoryId || type === 'income')
        ? 'ready'
        : 'proposed',
    categoryPreference: 'not_now'
  };
}

function apiError(status: number, value: unknown): VoiceCaptureError {
  const code =
    value && typeof value === 'object' ? Reflect.get(value, 'code') : undefined;
  if (
    status === 503 ||
    code === 'AI_UNAVAILABLE' ||
    code === 'AI_TEMPORARILY_UNAVAILABLE'
  )
    return new VoiceCaptureError('analysis_unavailable');
  if (status === 422) return new VoiceCaptureError('invalid_proposal');
  if (status === 429) return new VoiceCaptureError('analysis_unavailable');
  if (status === 404) return new VoiceCaptureError('proposal_pending');
  return new VoiceCaptureError('analysis_failed');
}

export function createLiveVoiceApiService(
  options: {
    baseUrl?: string;
    token?: TokenProvider;
    request?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  } = {}
): CapabilityProviderHandle<VoiceAnalyzerService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';
  const token = options.token ?? (() => tokenProvider());
  const request = options.request ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;
  const analyzed = new Map<string, ServerProposal>();
  const serverProposals = new Map<string, ServerProposal>();

  const send = async (
    method: string,
    path: string,
    body?: unknown,
    key?: string
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(key ? { 'Idempotency-Key': key } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new VoiceCaptureError('offline');
    }
    const value: unknown =
      response.status === 204 ? null : await response.json();
    if (!response.ok) throw apiError(response.status, value);
    return value;
  };

  const fetchProposal = async (sessionId: string): Promise<ServerProposal> => {
    const value = await send(
      'GET',
      `/api/v1/voice/sessions/${encodeURIComponent(sessionId)}/proposal`
    );
    return failClosed(proposalSchema, value);
  };

  return {
    metadata: {
      id: 'phase09-voice-http',
      capability: voiceAnalyzerServiceCapability.capability,
      majorVersion: voiceAnalyzerServiceCapability.majorVersion,
      kind: 'live',
      availability:
        baseUrl && (Boolean(options.token) || tokenProviderConfigured)
          ? 'available'
          : 'unavailable'
    },
    async transcribe(
      audioReference: string,
      scenario: VoiceScenario,
      durationMs?: number
    ) {
      if (!baseUrl) throw new VoiceCaptureError('analysis_unavailable');
      if (unsupportedScenarios.has(scenario))
        throw new VoiceCaptureError('analysis_unavailable');
      if (
        !Number.isSafeInteger(durationMs) ||
        Number(durationMs) < 1 ||
        Number(durationMs) > 120_000
      )
        throw new VoiceCaptureError('recording_interrupted');
      let audio: Response;
      try {
        audio = await request(audioReference);
      } catch {
        throw new VoiceCaptureError('offline');
      }
      if (!audio.ok) throw new VoiceCaptureError('recording_interrupted');
      const bytes = await audio.arrayBuffer();
      const header = audio.headers.get('content-type') ?? '';
      const contentType = [
        'audio/m4a',
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/wav',
        'audio/webm'
      ].includes(header)
        ? header
        : 'audio/m4a';
      const created = failClosed(
        uploadResponseSchema,
        await send(
          'POST',
          '/api/v1/voice/sessions',
          {
            locale: scenario === 'clear_ar' ? 'ar' : 'en',
            durationMs,
            contentType,
            sizeBytes: bytes.byteLength
          },
          randomUUID()
        )
      );
      if (created.session.status !== 'uploaded')
        throw new VoiceCaptureError('analysis_failed');
      const uploadUrl = new URL(created.upload.url);
      if (!uploadUrl.searchParams.has('token'))
        uploadUrl.searchParams.set('token', created.upload.token);
      const uploaded = await request(uploadUrl.toString(), {
        method: 'PUT',
        headers: created.upload.headers,
        body: bytes
      });
      if (!uploaded.ok) throw new VoiceCaptureError('analysis_failed');
      const accepted = failClosed(
        acceptedWorkSchema,
        await send(
          'POST',
          `/api/v1/voice/sessions/${encodeURIComponent(created.session.id)}/process`,
          {
            uploadCompleted: true,
            expectedVersion: created.session.version,
            contentHash: bytesToHex(sha256(new Uint8Array(bytes)))
          },
          randomUUID()
        )
      );
      if (accepted.id !== created.session.id || accepted.status !== 'queued')
        throw new VoiceCaptureError('analysis_failed');
      let proposal: ServerProposal | null = null;
      for (let attempt = 0; attempt < 650 && !proposal; attempt += 1) {
        try {
          proposal = await fetchProposal(created.session.id);
        } catch (error) {
          if (
            !(error instanceof VoiceCaptureError) ||
            error.code !== 'proposal_pending'
          )
            throw error;
        }
        if (!proposal) await sleep(100);
      }
      if (!proposal) throw new VoiceCaptureError('analysis_unavailable');
      analyzed.set(proposal.id, proposal);
      return {
        text: proposal.redactedTranscript,
        language: created.session.locale,
        confidence: Math.round(proposal.payload.confidence * 100),
        capturedAt: now(),
        editedByUser: false,
        analysisReference: {
          sessionId: created.session.id,
          sessionVersion: created.session.version,
          proposalId: proposal.id,
          proposalVersion: proposal.version
        }
      } satisfies VoiceTranscript;
    },
    async analyze(input) {
      const reference = input.transcript.analysisReference;
      if (
        unsupportedScenarios.has(input.scenario) ||
        input.transcript.editedByUser ||
        !reference
      )
        throw new VoiceCaptureError('analysis_unavailable');
      let proposal = analyzed.get(reference.proposalId);
      if (!proposal) {
        try {
          proposal = await fetchProposal(reference.sessionId);
        } catch (error) {
          if (
            error instanceof VoiceCaptureError &&
            error.code === 'proposal_pending'
          )
            throw new VoiceCaptureError('analysis_unavailable');
          throw error;
        }
      }
      if (
        proposal.id !== reference.proposalId ||
        proposal.version !== reference.proposalVersion ||
        proposal.redactedTranscript !== input.transcript.text
      )
        throw new VoiceCaptureError('analysis_unavailable');
      analyzed.delete(reference.proposalId);
      const mapped = mapProposal(proposal);
      serverProposals.set(mapped.id, proposal);
      return {
        id: proposal.id,
        sessionId: input.sessionId,
        proposals: [mapped],
        status: 'reviewing',
        saveErrorCode: null
      } satisfies VoiceProposalGroup;
    },
    async confirm(input) {
      const proposal = input.proposals[0];
      const server = proposal ? serverProposals.get(proposal.id) : undefined;
      if (input.proposals.length !== 1 || !proposal || !server)
        throw new VoiceCaptureError('analysis_unavailable');
      if (
        (proposal.type !== 'expense' && proposal.type !== 'income') ||
        !proposal.accountId ||
        !proposal.currencyCode ||
        !proposal.occurredAt ||
        !proposal.amountMinor
      )
        throw new VoiceCaptureError('invalid_proposal');
      const result = failClosed(
        executedActionSchema,
        await send(
          'POST',
          `/api/v1/voice/proposals/${encodeURIComponent(proposal.id)}/confirm`,
          {
            expectedVersion: server.version,
            editedFields: {
              amountMinor: String(
                proposal.type === 'income'
                  ? -proposal.amountMinor
                  : proposal.amountMinor
              ),
              currency: proposal.currencyCode,
              categoryId: proposal.categoryId,
              accountId: proposal.accountId,
              date: new Date(proposal.occurredAt).toISOString().slice(0, 10),
              merchant: proposal.merchant,
              note: proposal.notes
            },
            reason: null
          },
          input.operationId
        )
      );
      if (result.sourceId !== proposal.id)
        throw new VoiceCaptureError('analysis_failed');
      serverProposals.delete(proposal.id);
      return {
        transactionIds: [result.resourceId],
        affectedScopes: [
          'home.summary',
          'accounts.list',
          'transactions.list',
          `transactions.detail.${result.resourceId}`,
          'reports.live',
          'assistant.context'
        ]
      };
    }
  };
}
