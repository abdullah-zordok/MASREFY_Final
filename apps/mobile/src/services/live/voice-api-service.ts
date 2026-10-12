import { voiceRecorderService } from '@/services/platform/voice-recorder-service';
import { createVoiceBatchApi } from './voice-batch-api-service';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { randomUUID } from 'expo-crypto';
import { z } from 'zod';
import {
  sessionSchema,
  uploadResponseSchema,
  acceptedWorkSchema,
  fieldSchema,
  proposalSchema,
  executedActionSchema,
  recoverySchema,
  uploadReceiptSchema
} from './voice-api-contract';

import {
  assessment,
  type VoiceField,
  type VoiceProposalGroup,
  type VoiceTranscript,
  type VoiceTransactionProposal
} from '@/domain/voice-capture';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import {
  VoiceCaptureError,
  voiceAnalyzerServiceCapability,
  type VoiceAnalyzerService
} from '@/services/contracts/voice-capture-service';
import {
  clearPendingVoiceSession,
  loadPendingVoiceSession,
  loadVoiceOperation,
  saveVoiceOperation,
  clearVoiceOperation,
  type VoiceOperation
} from '@/storage/voice-pending-session';

type TokenProvider = () => Promise<string>;
type OwnerProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () =>
  Promise.reject(new VoiceCaptureError('session_expired'));
let ownerProvider: OwnerProvider = () =>
  Promise.reject(new VoiceCaptureError('session_expired'));
let providerRevision = 0;

export function configureVoiceApiTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
  providerRevision += 1;
}

export function configureVoiceApiOwnerProvider(provider: OwnerProvider): void {
  ownerProvider = provider;
  providerRevision += 1;
}

type ServerProposal = z.infer<typeof proposalSchema>;
const pollIntervalMs = 1_000;
const maxPollAttempts = 125;

function hasPendingVoiceConfirmation(operation: VoiceOperation): boolean {
  return Boolean(
    operation.confirmationKey ||
      operation.confirmationBody ||
      ['confirming', 'confirmation_unknown'].includes(operation.phase)
  );
}

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
  const optional = value.name === 'merchant' || value.name === 'note';
  if (
    (optional && value.value == null) ||
    (value.confidence === null && value.value != null)
  )
    return {
      field,
      confidence: 0,
      status: 'clear',
      reasonCode: `voice.confidence.${field}`,
      confirmed: true
    };
  const confidence = Math.round((value.confidence ?? 0) * 100);
  return assessment(
    field,
    confidence,
    `voice.confidence.${field}`,
    value.value == null
  );
}

function localDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function mapProposal(value: ServerProposal): VoiceTransactionProposal {
  if (value.status !== 'validated')
    throw new VoiceCaptureError('analysis_unavailable');
  const amount = Number(value.payload.amountMinor);
  if (!Number.isSafeInteger(amount) || amount === 0)
    throw new VoiceCaptureError('invalid_proposal');
  const [year, month, day] = value.payload.date.split('-').map(Number);
  const occurredAt = new Date(year!, month! - 1, day!).getTime();
  if (localDate(new Date(occurredAt)) !== value.payload.date)
    throw new VoiceCaptureError('invalid_proposal');
  const type = amount < 0 ? 'income' : 'expense';
  const assessments = value.fields
    .filter(
      (field) =>
        !(
          type === 'income' &&
          field.name === 'categoryId' &&
          field.value == null
        )
    )
    .map(mapField);
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
  if (status === 401) return new VoiceCaptureError('session_expired');
  if (code === 'AI_UNAVAILABLE' || code === 'AI_TEMPORARILY_UNAVAILABLE')
    return new VoiceCaptureError('provider_unavailable');
  if (status === 503 && code === 'PROVIDER_UNAVAILABLE')
    return new VoiceCaptureError('auth_unavailable');
  if (status === 503) return new VoiceCaptureError('analysis_unavailable');
  if (status === 422) return new VoiceCaptureError('invalid_proposal');
  if (status === 429) return new VoiceCaptureError('quota_exhausted');
  if (status === 404) return new VoiceCaptureError('analysis_failed');
  return new VoiceCaptureError('analysis_failed');
}

function failedSession(code: string | null | undefined): VoiceCaptureError {
  if (code?.startsWith('VOICE_INTENT_UNSUPPORTED_'))
    return new VoiceCaptureError('unsupported_intent');
  if (code === 'AI_UNAVAILABLE' || code === 'AI_TEMPORARILY_UNAVAILABLE')
    return new VoiceCaptureError('provider_unavailable');
  if (code?.includes('QUOTA') || code?.includes('BUDGET'))
    return new VoiceCaptureError('quota_exhausted');
  return new VoiceCaptureError('analysis_failed');
}

type Recovery = z.infer<typeof recoverySchema>;
export function createLiveVoiceApiService(
  options: {
    baseUrl?: string;
    token?: TokenProvider;
    owner?: OwnerProvider;
    request?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  } = {}
): CapabilityProviderHandle<VoiceAnalyzerService> {
  const baseUrl = (
    options.baseUrl ??
    process.env.EXPO_PUBLIC_API_URL ??
    ''
  ).replace(/\/$/u, '');
  // Activate with the verified Staging financial cohort. This selects transport;
  // server authorization, Posting and transaction validation remain authoritative.
  const automaticCapture = (
    baseUrl === 'https://api.staging.masarifiratibi.com' &&
    process.env.EXPO_PUBLIC_VOICE_AUTOMATIC_POSTING === 'true'
  );
  const token = options.token ?? (() => tokenProvider());
  const readOwner = options.owner ?? (() => ownerProvider());
  const owner = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        readOwner(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new VoiceCaptureError('offline')),
            10_000
          );
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const request = options.request ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const analyzed = new Map<string, ServerProposal>();
  const serverProposals = new Map<string, ServerProposal>();
  const controllers = new Set<AbortController>();
  let epoch = 0;
  let cachedOwner: string | null = null;
  type Binding = { ownerId: string; epoch: number; providerRevision: number };
  const pause = () => {
    epoch += 1;
    controllers.forEach((controller) => controller.abort());
  };
  const bind = async (): Promise<Binding> => {
    const revision = providerRevision;
    const operationEpoch = epoch;
    const ownerId = await owner();
    if (!ownerId) throw new VoiceCaptureError('session_expired');
    if (operationEpoch !== epoch || revision !== providerRevision)
      throw new VoiceCaptureError('operation_cancelled');
    if (cachedOwner !== ownerId) {
      analyzed.clear();
      serverProposals.clear();
      cachedOwner = ownerId;
    }
    return { ownerId, epoch, providerRevision: revision };
  };
  const check = async (binding: Binding) => {
    if (
      binding.epoch !== epoch ||
      binding.providerRevision !== providerRevision ||
      binding.ownerId !== (await owner())
    )
      throw new VoiceCaptureError('operation_cancelled');
  };
  const send = async (
    binding: Binding,
    method: string,
    path: string,
    body?: unknown,
    key?: string,
    audio?: ArrayBuffer
  ): Promise<unknown> => {
    if (!baseUrl) throw new VoiceCaptureError('analysis_unavailable');
    const controller = new AbortController();
    controllers.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          await check(binding);
          let authToken: string;
          try {
            authToken = await token();
          } catch (error) {
            await check(binding);
            if (
              error &&
              typeof error === 'object' &&
              (Reflect.get(error, 'status') === 401 ||
                Reflect.get(error, 'code') === 'session_expired')
            )
              throw new VoiceCaptureError('session_expired');
            throw new VoiceCaptureError('auth_unavailable');
          }
          await check(binding);
          if (controller.signal.aborted)
            throw new VoiceCaptureError('operation_cancelled');
          const response = await request(baseUrl + path, {
            method,
            signal: controller.signal,
            headers: {
              Authorization: 'Bearer ' + authToken,
              'X-Voice-Contract': '2',
              ...(body === undefined && !audio
                ? {}
                : {
                    'Content-Type': audio ? String(body) : 'application/json'
                  }),
              ...(audio ? { 'Content-Length': String(audio.byteLength) } : {}),
              ...(key ? { 'Idempotency-Key': key } : {})
            },
            body:
              audio ?? (body === undefined ? undefined : JSON.stringify(body))
          });
          const value: unknown =
            response.status === 204 ? null : await response.json();
          await check(binding);
          if (!response.ok) throw apiError(response.status, value);
          return value;
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => {
              controller.abort();
              reject(new VoiceCaptureError('processing_timed_out'));
            },
            audio ? 30_000 : 10_000
          );
        })
      ]);
    } catch (error) {
      await check(binding);
      if (error instanceof VoiceCaptureError) throw error;
      throw new VoiceCaptureError('offline');
    } finally {
      if (timeout) clearTimeout(timeout);
      controllers.delete(controller);
    }
  };
  const update = async (
    binding: Binding,
    operation: VoiceOperation,
    patch: Partial<VoiceOperation>
  ) => {
    await check(binding);
    const next = { ...operation, ...patch, revision: operation.revision + 1 };
    await saveVoiceOperation(binding.ownerId, next);
    await check(binding);
    return next;
  };
  const recovery = async (binding: Binding, sessionId: string) =>
    failClosed(
      recoverySchema,
      await send(
        binding,
        'GET',
        '/api/v1/voice/sessions/' + sessionId + '/recovery'
      )
    );
  const create = async (binding: Binding, operation: VoiceOperation) => {
    if (operation.sessionId) return operation;
    if (!operation.createBody)
      throw new VoiceCaptureError('re_record_required');
    if (operation.phase === 'captured')
      operation = await update(binding, operation, { phase: 'creating' });
    const created = failClosed(
      uploadResponseSchema,
      await send(
        binding,
        'POST',
        '/api/v1/voice/sessions',
        operation.createBody,
        operation.createKey
      )
    );
    if (
      created.upload.path !==
      '/api/v1/voice/sessions/' + created.session.id + '/audio'
    )
      throw new VoiceCaptureError('analysis_failed');
    return update(binding, operation, {
      phase: 'created',
      sessionId: created.session.id,
      sessionVersion: created.session.version
    });
  };
  const readAudio = async (binding: Binding, reference: string) => {
    await check(binding);
    const controller = new AbortController();
    controllers.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const bytes = await Promise.race([
        (async () => {
          const response = await request(reference, {
            signal: controller.signal
          });
          if (!response.ok)
            throw new VoiceCaptureError('recording_interrupted');
          return response.arrayBuffer();
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new VoiceCaptureError('recording_interrupted'));
          }, 10_000);
        })
      ]);
      await check(binding);
      if (bytes.byteLength < 1 || bytes.byteLength > 12_582_912)
        throw new VoiceCaptureError('recording_interrupted');
      return bytes;
    } finally {
      if (timeout) clearTimeout(timeout);
      controllers.delete(controller);
    }
  };
  const uploadAndProcess = async (
    binding: Binding,
    operation: VoiceOperation,
    bytes?: ArrayBuffer
  ) => {
    operation = await create(binding, operation);
    if (!operation.sessionId || !operation.createBody)
      throw new VoiceCaptureError('re_record_required');
    if (operation.phase === 'created') {
      if (!bytes && operation.audioReference)
        bytes = await readAudio(binding, operation.audioReference);
      const captureBody = operation.createBody;
      if (
        !bytes ||
        !captureBody ||
        bytesToHex(sha256(new Uint8Array(bytes))) !== captureBody.contentHash
      )
        throw new VoiceCaptureError('recording_interrupted');
      const receipt = failClosed(
        uploadReceiptSchema,
        await send(
          binding,
          'PUT',
          '/api/v1/voice/sessions/' + operation.sessionId + '/audio',
          captureBody.contentType,
          undefined,
          bytes
        )
      );
      if (
        receipt.id !== operation.sessionId ||
        receipt.contentHash !== captureBody.contentHash ||
        receipt.sizeBytes !== bytes.byteLength
      )
        throw new VoiceCaptureError('analysis_failed');
      operation = await update(binding, operation, {
        phase: 'uploaded',
        sessionVersion: receipt.version
      });
    }
    if (operation.phase === 'uploaded' && operation.createBody) {
      const contentHash = operation.createBody.contentHash;
      operation = await update(binding, operation, {
        phase: 'processing',
        processBody: {
          uploadCompleted: true,
          expectedVersion: operation.sessionVersion!,
          contentHash
        }
      });
    }
    if (!operation.processBody) throw new VoiceCaptureError('analysis_failed');
    const accepted = failClosed(
      acceptedWorkSchema,
      await send(
        binding,
        'POST',
        '/api/v1/voice/sessions/' + operation.sessionId + '/process',
        operation.processBody,
        operation.processKey
      )
    );
    if (
      accepted.id !== operation.sessionId ||
      !['queued', 'processing', 'completed'].includes(accepted.status)
    )
      throw new VoiceCaptureError('analysis_failed');
    return operation;
  };
  const remember = async (
    binding: Binding,
    operation: VoiceOperation,
    result: Recovery
  ) => {
    if (!result.proposal || result.proposal.status !== 'validated')
      throw new VoiceCaptureError('analysis_unavailable');
    operation = await update(binding, operation, {
      phase: 'reviewing',
      proposalId: result.proposal.id,
      proposalVersion: result.proposal.version
    });
    analyzed.set(result.proposal.id, result.proposal);
    return {
      transcript: {
        text: result.proposal.redactedTranscript,
        language: result.transcriptLanguage ?? result.session.locale,
        confidence: Math.round((result.transcriptConfidence ?? 0) * 100),
        capturedAt: Date.parse(result.recordedAt),
        editedByUser: false,
        analysisReference: {
          sessionId: result.session.id,
          sessionVersion: operation.sessionVersion!,
          proposalId: result.proposal.id,
          proposalVersion: result.proposal.version
        }
      } satisfies VoiceTranscript,
      recordedAt: Date.parse(result.recordedAt),
      timezoneOffsetMinutes: result.timezoneOffsetMinutes
    };
  };
  const poll = async (binding: Binding, operation: VoiceOperation) => {
    const deadline = now() + maxPollAttempts * pollIntervalMs;
    for (
      let attempt = 0;
      attempt < maxPollAttempts && now() <= deadline;
      attempt += 1
    ) {
      const session = failClosed(
        sessionSchema,
        await send(
          binding,
          'GET',
          '/api/v1/voice/sessions/' + operation.sessionId
        )
      );
      if (session.status === 'failed' || session.status === 'expired') {
        await update(binding, operation, {
          phase:
            session.failureCode === 'VOICE_CANCELLED' ? 'cancelled' : 'terminal'
        });
        throw session.status === 'expired'
          ? new VoiceCaptureError('processing_timed_out')
          : failedSession(session.failureCode);
      }
      if (session.status === 'proposed' || session.status === 'confirmed')
        return remember(
          binding,
          operation,
          await recovery(binding, session.id)
        );
      if (attempt + 1 < maxPollAttempts) await sleep(pollIntervalMs);
      await check(binding);
    }
    throw new VoiceCaptureError('processing_timed_out');
  };
  const pending = async (binding: Binding) => {
    const existing = await loadVoiceOperation(binding.ownerId);
    if (existing) return existing;
    const legacy = await loadPendingVoiceSession(binding.ownerId);
    if (!legacy) return null;
    const operation: VoiceOperation = {
      attemptId: randomUUID(),
      revision: 0,
      phase: 'processing',
      createKey: randomUUID(),
      processKey: randomUUID(),
      cancelKey: randomUUID(),
      createBody: null,
      sessionId: legacy.sessionId,
      sessionVersion: legacy.sessionVersion,
      processBody: null,
      proposalId: null,
      proposalVersion: null,
      confirmationKey: null,
      confirmationBody: null,
      transactionId: null,
      audioReference: null,
      createdAt: legacy.createdAt
    };
    await check(binding);
    await saveVoiceOperation(binding.ownerId, operation, true);
    await clearPendingVoiceSession(binding.ownerId);
    return operation;
  };
  const receipt = (id: string) => ({
    transactionIds: [id],
    affectedScopes: [
      'home.summary',
      'accounts.list',
      'transactions.list',
      'transactions.detail.' + id,
      'reports.live',
      'assistant.context'
    ]
  });
  const executeConfirmation = async (
    binding: Binding,
    operation: VoiceOperation
  ) => {
    let result: z.infer<typeof executedActionSchema>;
    try {
      result = failClosed(
        executedActionSchema,
        await send(
          binding,
          'POST',
          '/api/v1/voice/proposals/' + operation.proposalId + '/confirm',
          operation.confirmationBody,
          operation.confirmationKey!
        )
      );
      if (result.sourceId !== operation.proposalId)
        throw new VoiceCaptureError('analysis_failed');
    } catch (error) {
      if (
        error instanceof VoiceCaptureError &&
        error.code === 'invalid_proposal'
      ) {
        const authoritative = await recovery(
          binding,
          operation.sessionId!
        ).catch(() => null);
        if (
          authoritative?.phase === 'proposed' &&
          authoritative.proposal?.status === 'validated' &&
          !authoritative.transactionId
        ) {
          await update(binding, operation, {
            phase: 'reviewing',
            confirmationBody: null,
            confirmationKey: null,
            proposalVersion: authoritative.proposal.version
          });
          serverProposals.set(
            authoritative.proposal.id,
            authoritative.proposal
          );
          throw error;
        }
      }
      await update(binding, operation, { phase: 'confirmation_unknown' });
      throw new VoiceCaptureError('recovery_required');
    }
    try {
      await update(binding, operation, {
        phase: 'saved',
        transactionId: result.resourceId,
        audioReference: null
      });
    } catch {
      /* receipt wins */
    }
    return receipt(result.resourceId);
  };
  const discard = async (binding: Binding, operation: VoiceOperation) => {
    if (['saved', 'cancelled', 'terminal'].includes(operation.phase)) {
      await check(binding);
      await clearVoiceOperation(binding.ownerId, operation.attemptId);
      return;
    }
    if (['confirming', 'confirmation_unknown'].includes(operation.phase))
      throw new VoiceCaptureError('recovery_required');
    if (!operation.sessionId && operation.phase !== 'captured')
      operation = await create(binding, operation);
    operation = await update(binding, operation, { phase: 'cancel_requested' });
    if (operation.sessionId) {
      const result = await send(
        binding,
        'POST',
        '/api/v1/voice/sessions/' + operation.sessionId + '/cancel',
        {},
        operation.cancelKey
      );
      if (
        !result ||
        typeof result !== 'object' ||
        !['cancelled', 'expired', 'failed'].includes(
          String(Reflect.get(result, 'status'))
        )
      )
        throw new VoiceCaptureError('recovery_required');
    }
    await check(binding);
    await clearVoiceOperation(binding.ownerId, operation.attemptId);
  };

  const batchApi = createVoiceBatchApi({
      baseUrl,
      owner,
      token,
      request,
      sleep,
      removeAudio: voiceRecorderService.remove
    });
  return {
    ...batchApi,
    // Keep legacy proposal recovery; new financial captures use the existing
    // durable batch and normal transaction refresh, with no review route.
    queueBatch: automaticCapture ? batchApi.queueBatch : undefined,
    metadata: {
      id: 'phase09-voice-http',
      capability: voiceAnalyzerServiceCapability.capability,
      majorVersion: voiceAnalyzerServiceCapability.majorVersion,
      kind: 'live',
      availability: baseUrl ? 'available' : 'unavailable'
    },
    pausePending: pause,
    async transcribe(
      audioReference,
      _scenario,
      durationMs,
      locale = 'en',
      capture
    ) {
      if (!baseUrl) throw new VoiceCaptureError('analysis_unavailable');
      if (
        !Number.isSafeInteger(durationMs) ||
        Number(durationMs) < 1 ||
        Number(durationMs) > 60_000
      )
        throw new VoiceCaptureError('recording_interrupted');
      const binding = await bind();
      const existing = await pending(binding);
      if (
        existing &&
        !['saved', 'cancelled', 'terminal'].includes(existing.phase)
      )
        throw new VoiceCaptureError('recovery_required');
      const bytes = await readAudio(binding, audioReference);
      const recordedAt = capture?.recordedAt ?? now();
      const operation: VoiceOperation = {
        attemptId: randomUUID(),
        revision: 0,
        phase: 'captured',
        createKey: randomUUID(),
        processKey: randomUUID(),
        cancelKey: randomUUID(),
        createBody: {
          locale,
          durationMs: durationMs!,
          contentType: (capture?.contentType ??
            (audioReference.endsWith('.wav')
              ? 'audio/wav'
              : 'audio/m4a')) as NonNullable<
            VoiceOperation['createBody']
          >['contentType'],
          sizeBytes: bytes.byteLength,
          contentHash: bytesToHex(sha256(new Uint8Array(bytes))),
          recordedAt: new Date(recordedAt).toISOString(),
          timezoneOffsetMinutes:
            capture?.timezoneOffsetMinutes ??
            new Date(recordedAt).getTimezoneOffset()
        },
        sessionId: null,
        sessionVersion: null,
        processBody: null,
        proposalId: null,
        proposalVersion: null,
        confirmationKey: null,
        confirmationBody: null,
        transactionId: null,
        audioReference,
        createdAt: now()
      };
      await check(binding);
      await saveVoiceOperation(binding.ownerId, operation, true);
      return (
        await poll(binding, await uploadAndProcess(binding, operation, bytes))
      ).transcript;
    },
    async recoverPending(retryAudio = false) {
      const binding = await bind();
      // Legacy Async sessions have no frozen confirmation to resume.
      // Automatic startup must leave their original storage untouched.
      let operation = automaticCapture
        ? await loadVoiceOperation(binding.ownerId)
        : await pending(binding);
      if (!operation || ['cancelled', 'terminal'].includes(operation.phase))
        return null;
      if (operation.phase === 'saved' && operation.transactionId)
        return { saved: receipt(operation.transactionId) };
      if (operation.phase === 'cancel_requested') {
        await discard(binding, operation);
        return null;
      }
      if (automaticCapture && !hasPendingVoiceConfirmation(operation)) {
        // Recovery GET can expire or reconcile the legacy server session.
        // Preserve unconfirmed evidence before any remote recovery or audio replay.
        return null;
      }
      if (!operation.sessionId) {
        if (retryAudio) operation = await uploadAndProcess(binding, operation);
        else {
          await discard(binding, operation);
          throw new VoiceCaptureError('re_record_required');
        }
      }
      const result = await recovery(binding, operation.sessionId!);
      if (
        result.phase === 'cancelled' ||
        result.phase === 'expired' ||
        result.phase === 'failed'
      ) {
        await update(binding, operation, {
          phase: result.phase === 'cancelled' ? 'cancelled' : 'terminal'
        });
        throw failedSession(result.session.failureCode);
      }
      if (result.phase === 'awaiting_audio') {
        if (retryAudio) operation = await uploadAndProcess(binding, operation);
        else {
          await discard(binding, operation);
          throw new VoiceCaptureError('re_record_required');
        }
      }
      if (result.transactionId && result.phase === 'confirmed') {
        try {
          await update(binding, operation, {
            phase: 'saved',
            transactionId: result.transactionId,
            audioReference: null
          });
        } catch {
          /* receipt wins */
        }
        return { saved: receipt(result.transactionId) };
      }
      if (
        operation.confirmationBody &&
        operation.confirmationKey &&
        operation.proposalId
      ) {
        return { saved: await executeConfirmation(binding, operation) };
      }
      if (result.phase === 'proposed') {
        // Preserve pre-switch, unconfirmed v2 evidence without reopening its
        // review UI or migrating it into the automatic financial pipeline.
        // Frozen confirmations are recovered above using their original key.
        if (automaticCapture) return null;
        return remember(binding, operation, result);
      }
      if (result.phase === 'uploaded')
        operation = await uploadAndProcess(binding, operation);
      if (result.phase === 'confirming' || result.phase === 'confirmed')
        throw new VoiceCaptureError('recovery_required');
      return poll(binding, operation);
    },
    async discardPending() {
      pause();
      const binding = await bind();
      const operation = await pending(binding);
      if (operation) await discard(binding, operation);
      analyzed.clear();
      serverProposals.clear();
    },
    async analyze(input) {
      const binding = await bind();
      const reference = input.transcript.analysisReference;
      if (input.transcript.editedByUser || !reference)
        throw new VoiceCaptureError('analysis_unavailable');
      const proposal =
        analyzed.get(reference.proposalId) ??
        failClosed(
          proposalSchema,
          await send(
            binding,
            'GET',
            '/api/v1/voice/sessions/' + reference.sessionId + '/proposal'
          )
        );
      if (
        proposal.id !== reference.proposalId ||
        proposal.version !== reference.proposalVersion ||
        proposal.redactedTranscript !== input.transcript.text
      )
        throw new VoiceCaptureError('analysis_unavailable');
      const mapped = mapProposal(proposal);
      analyzed.delete(proposal.id);
      serverProposals.set(proposal.id, proposal);
      return {
        id: proposal.id,
        sessionId: input.sessionId,
        proposals: [mapped],
        status: 'reviewing',
        saveErrorCode: null
      } satisfies VoiceProposalGroup;
    },
    async confirm(input) {
      const binding = await bind();
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
      let operation = await pending(binding);
      if (!operation || operation.proposalId !== proposal.id)
        throw new VoiceCaptureError('analysis_unavailable');
      const body = {
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
          date: localDate(new Date(proposal.occurredAt)),
          merchant: proposal.merchant,
          note: proposal.notes
        },
        reason: null,
        occurredAt: new Date(proposal.occurredAt).toISOString(),
        timezoneOffsetMinutes: new Date(proposal.occurredAt).getTimezoneOffset()
      };
      operation = await update(binding, operation, {
        phase: 'confirming',
        confirmationKey: input.operationId,
        confirmationBody: body
      });
      const result = await executeConfirmation(binding, operation);
      serverProposals.delete(proposal.id);
      return result;
    }
  };
}
