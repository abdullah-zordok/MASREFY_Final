import { randomUUID } from 'expo-crypto';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { z } from 'zod';
import { recordVoiceDiagnostic } from '@/services/platform/voice-diagnostics';
import {
  loadVoiceBatches,
  pruneVoiceBatches,
  saveVoiceBatch,
  type VoiceBatchOperation
} from '@/storage/voice-batch-journal';
import {
  VoiceCaptureError,
  type VoiceCapturedAudio
} from '@/services/contracts/voice-capture-service';

export const voiceBatchResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    batchId: z.string().uuid().nullable(),
    status: z.enum([
      'uploading',
      'queued',
      'analyzing',
      'finalizing',
      'completed',
      'cancelled',
      'failed'
    ]),
    transactionIds: z.array(z.string().uuid()).max(10),
    addedCount: z.number().int().min(0).max(10),
    ledgerVersion: z.number().int().nonnegative(),
    outcomes: z
      .array(
        z
          .object({
            ordinal: z.number().int().min(0).max(9),
            kind: z.enum(['expense', 'income']).nullable(),
            status: z.enum([
              'eligible',
              'committed',
              'skipped',
              'cancelled',
              'execution_failed'
            ]),
            reason: z
              .enum([
                'missing_amount',
                'ambiguous_account',
                'invalid_category',
                'invalid_date',
                'currency_mismatch',
                'unsupported_event',
                'authorization_required',
                'invalid_event'
              ])
              .nullable(),
            transactionId: z.string().uuid().nullable()
          })
          .strict()
      )
      .max(10)
      .optional(),
    analysis: z
      .object({
        mode: z.literal('analysis_only'),
        persisted: z.literal(false),
        expiresAt: z.string().datetime({ offset: true }),
        events: z
          .array(
            z
              .object({
                ordinal: z.number().int().min(0).max(9),
                kind: z.enum(['expense', 'income']),
                amountMinor: z.number().int().positive().safe(),
                currency: z.string().regex(/^[A-Z]{3}$/),
                accountId: z.string().uuid(),
                categoryId: z.string().uuid().nullable(),
                title: z.string().min(1).max(40),
                merchant: z.string().max(40).nullable(),
                occurredAt: z.string().datetime({ offset: true })
              })
              .strict()
          )
          .max(10)
      })
      .strict()
      .optional()
  })
  .strict()
  .refine((value) => {
    const outcomes = value.outcomes;
    const committed =
      outcomes?.filter((event) => event.status === 'committed') ?? [];
    return (
      value.addedCount === value.transactionIds.length &&
      new Set(value.transactionIds).size === value.addedCount &&
      (!outcomes ||
        (outcomes.every(
          (event, index) =>
            (index === 0 || event.ordinal > outcomes[index - 1].ordinal) &&
            (event.status === 'committed') === (event.transactionId !== null) &&
            (event.status === 'skipped') === (event.reason !== null) &&
            (event.status !== 'committed' ||
              (event.kind !== null && value.ledgerVersion > 0))
        ) &&
          committed.length === value.addedCount &&
          committed.every(
            (event) =>
              event.transactionId !== null &&
              value.transactionIds.includes(event.transactionId)
          ) &&
          new Set(committed.map((event) => event.transactionId)).size ===
            value.addedCount)) &&
      (!value.analysis ||
        (value.status === 'completed' &&
          value.addedCount === 0 &&
          value.ledgerVersion === 0 &&
          new Set(value.analysis.events.map((event) => event.ordinal)).size ===
            value.analysis.events.length))
    );
  });
export type VoiceBatchResult = z.infer<typeof voiceBatchResultSchema>;
export class VoiceBatchLocalTerminalError extends VoiceCaptureError {
  constructor(
    public readonly phase: 'failed' | 'cancelled',
    failureCode?: 'voice_canary_restricted'
  ) {
    super(
      phase === 'cancelled'
        ? 'operation_cancelled'
        : (failureCode ?? 'analysis_failed')
    );
  }
}
class VoiceBatchRequestRejected extends VoiceCaptureError {}
class VoiceBatchRateLimited extends VoiceCaptureError {
  constructor(public readonly retryAfterAt: number) {
    super('quota_exceeded');
  }
}
export interface VoiceBatchApi {
  queueBatch(
    audio: VoiceCapturedAudio,
    locale: 'ar' | 'en',
    offset: number
  ): Promise<string>;
  runBatch(id: string): Promise<VoiceBatchResult>;
  recoverBatches(onLocalPending?: (ids: string[]) => void): Promise<{
    results: VoiceBatchResult[];
    uncertain: boolean;
    pendingIds: string[];
    localFailure: boolean;
    localFailureCode?: 'voice_canary_restricted';
    localSessions?: Record<string, string>;
  }>;
  cancelBatch(id: string): Promise<VoiceBatchResult | null>;
  pauseBatches(): void;
}
const terminal = (status: string) =>
  ['completed', 'cancelled', 'failed'].includes(status);
const quotaRetryMs = 60000;

export function createVoiceBatchApi(options: {
  baseUrl: string;
  owner: () => Promise<string>;
  token: () => Promise<string>;
  request: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  removeAudio?: (uri: string) => Promise<void>;
}): VoiceBatchApi {
  const inflight = new Map<string, Promise<VoiceBatchResult>>();
  const localCleanups = new Map<string, Promise<void>>();
  const recoveryFailures = new Set<string>();
  const controllers = new Set<AbortController>();
  let epoch = 0;
  let recoveryOwner: string | null = null;
  let discoveryCursor: { createdAt: string; sessionId: string } | null = null;
  let unresolved = new Set<string>();
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const binding = async (captureId?: string) => ({
    owner: await options.owner(),
    epoch,
    captureId
  });
  const check = async (b: { owner: string; epoch: number }) => {
    const currentOwner = await options.owner();
    if (b.epoch !== epoch || b.owner !== currentOwner)
      throw new VoiceCaptureError('operation_cancelled');
  };
  const bounded = async <T>(
    action: (signal: AbortSignal) => Promise<T>,
    ms = 10000
  ): Promise<T> => {
    const controller = new AbortController();
    controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        action(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new VoiceCaptureError('offline'));
          }, ms);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      controllers.delete(controller);
    }
  };
  const send = async (
    b: { owner: string; epoch: number; captureId?: string },
    method: string,
    path: string,
    body?: unknown,
    key?: string,
    audio?: ArrayBuffer
  ): Promise<unknown> => {
    const requestId = randomUUID();
    const started = performance.now();
    const sessionId = path.match(/\/voice\/sessions\/([0-9a-f-]{36})\//i)?.[1];
    const operation =
      path === '/api/v1/voice/sessions'
        ? 'create'
        : path.startsWith('/api/v1/voice/batches/recovery')
          ? 'recovery'
          : path.endsWith('/audio')
            ? 'upload'
            : path.endsWith('/process')
              ? 'process'
              : path.endsWith('/cancel')
                ? 'cancel'
                : 'status';
    return bounded(
      async (signal) => {
        await check(b);
        const token = await options.token();
        await check(b);
        recordVoiceDiagnostic('request', {
          operation,
          captureId: b.captureId,
          sessionId,
          requestId,
          phase: 'start'
        });
        const response = await options.request(options.baseUrl + path, {
          method,
          signal,
          headers: {
            authorization: 'Bearer ' + token,
            ...(method === 'GET' &&
            (path.endsWith('/batch') ||
              path.startsWith('/api/v1/voice/batches/recovery'))
              ? { accept: 'application/json; voice-event-results=1' }
              : {}),
            'X-Voice-Contract': '3',
            'X-Request-Id': requestId,
            'content-type': audio ? 'audio/m4a' : 'application/json',
            ...(audio ? { 'content-length': String(audio.byteLength) } : {}),
            ...(key ? { 'idempotency-key': key } : {})
          },
          ...(body !== undefined || audio
            ? { body: audio ?? JSON.stringify(body) }
            : {})
        });
        recordVoiceDiagnostic('response', {
          operation,
          captureId: b.captureId,
          sessionId,
          requestId,
          status: response.status,
          elapsedMs: performance.now() - started
        });
        await check(b);
        if (response.status === 429 && operation === 'process') {
          let rejected: unknown;
          try {
            rejected = await bounded(() => response.json(), 1000);
          } catch {
            // A missing reset time still requires a bounded pause before retry.
          }
          await check(b);
          const quota = z
            .object({
              code: z.enum(['AI_QUOTA_EXCEEDED', 'AI_BUDGET_EXHAUSTED']),
              resetsAt: z.string().datetime({ offset: true })
            })
            .safeParse(rejected);
          const now = Date.now();
          const reset = quota.success ? Date.parse(quota.data.resetsAt) : NaN;
          throw new VoiceBatchRateLimited(
            reset > now
              ? Math.min(reset, now + quotaRetryMs)
              : now + quotaRetryMs
          );
        }
        if ([400, 403, 404, 410, 422].includes(response.status)) {
          if (
            response.status === 403 &&
            method === 'POST' &&
            path === '/api/v1/voice/sessions'
          ) {
            let rejected: unknown;
            try {
              rejected = await bounded(() => response.json(), 1000);
            } catch {
              // The status still proves rejection when its body cannot be decoded.
            }
            await check(b);
            if (
              rejected &&
              typeof rejected === 'object' &&
              'code' in rejected &&
              rejected.code === 'VOICE_CANARY_RESTRICTED'
            ) {
              recordVoiceDiagnostic('request-error', {
                operation,
                requestId,
                captureId: b.captureId,
                status: 403,
                domainCode: 'VOICE_CANARY_RESTRICTED'
              });
              throw new VoiceBatchRequestRejected('voice_canary_restricted');
            }
          }
          throw new VoiceBatchRequestRejected('analysis_failed');
        }
        if (
          method === 'POST' &&
          path === '/api/v1/voice/sessions' &&
          response.status === 503
        ) {
          let value: unknown;
          try {
            value = await response.json();
          } catch {
            // A missing or malformed response cannot prove creation was rejected.
          }
          await check(b);
          if (
            value &&
            typeof value === 'object' &&
            'code' in value &&
            value.code === 'VOICE_AUTOMATIC_UNAVAILABLE'
          )
            throw new VoiceBatchRequestRejected('analysis_failed');
        }
        if (!response.ok)
          throw new VoiceCaptureError(
            response.status === 401 ? 'session_expired' : 'offline'
          );
        const value = await response.json();
        await check(b);
        return value;
      },
      audio ? 30000 : 10000
    ).catch((error: unknown) => {
      recordVoiceDiagnostic('request-error', {
        operation,
        captureId: b.captureId,
        sessionId,
        requestId,
        phase: 'failure',
        elapsedMs: performance.now() - started
      });
      throw error;
    });
  };
  const update = async (
    b: { owner: string; epoch: number },
    operation: VoiceBatchOperation,
    patch: Partial<VoiceBatchOperation>
  ) => {
    await check(b);
    const next = { ...operation, ...patch, revision: operation.revision + 1 };
    await saveVoiceBatch(b.owner, next);
    await check(b);
    return next;
  };
  const result = async (b: { owner: string; epoch: number }, session: string) =>
    voiceBatchResultSchema.parse(
      await send(b, 'GET', '/api/v1/voice/sessions/' + session + '/batch')
    );
  const poll = async (b: { owner: string; epoch: number }, session: string) => {
    let current = await result(b, session);
    for (let n = 0; n < 125 && !terminal(current.status); n++) {
      await sleep(1000);
      await check(b);
      current = await result(b, session);
    }
    return current;
  };
  const readAudio = async (
    b: { owner: string; epoch: number },
    operation: VoiceBatchOperation
  ) =>
    bounded(async (signal) => {
      await check(b);
      if (!operation.audioReference)
        throw new VoiceCaptureError('re_record_required');
      const response = await options.request(operation.audioReference, {
        signal
      });
      if (!response.ok) throw new VoiceCaptureError('re_record_required');
      const bytes = await response.arrayBuffer();
      await check(b);
      if (bytes.byteLength < 12 || bytes.byteLength > 12582912)
        throw new VoiceCaptureError('analysis_failed');
      return bytes;
    }, 30000);
  const finish = async (
    b: { owner: string; epoch: number },
    operation: VoiceBatchOperation,
    value: VoiceBatchResult
  ) => {
    if (terminal(value.status)) {
      recordVoiceDiagnostic('batch-result', {
        captureId: operation.id,
        sessionId: value.sessionId,
        phase: value.status
      });
      const retired =
        operation.phase === value.status &&
        !operation.createBody &&
        !operation.processBody
          ? operation
          : await update(b, operation, {
              phase: value.status as 'completed' | 'cancelled' | 'failed',
              retryAfterAt: undefined,
              createBody: null,
              processBody: null
            });
      cleanupAudio(b, retired);
    }
    return value;
  };
  const retireLocal = async (
    b: { owner: string; epoch: number },
    operation: VoiceBatchOperation,
    phase: 'failed' | 'cancelled',
    failureCode?: 'voice_canary_restricted'
  ) => {
    // Without a durably recorded session, upload/process cannot have been dispatched.
    // A lost create response may leave an expiring upload slot, but cannot post money.
    const retired =
      operation.phase === phase &&
      !operation.createBody &&
      !operation.processBody
        ? operation
        : await update(b, operation, {
            phase,
            ...(failureCode ? { failureCode } : {}),
            createBody: null,
            processBody: null
          });
    cleanupAudio(b, retired);
    recordVoiceDiagnostic('batch-result', { captureId: retired.id, phase });
  };
  const cleanupAudio = (
    b: { owner: string; epoch: number },
    retired: VoiceBatchOperation
  ) => {
    if (!retired.audioReference || !options.removeAudio) return;
    const key = b.owner + ':' + retired.id;
    if (localCleanups.has(key)) return;
    // Native cleanup cannot delay the already durable terminal outcome.
    const cleanup = (async () => {
      await check(b);
      recordVoiceDiagnostic('cleanup', {
        captureId: retired.id,
        sessionId: retired.sessionId ?? undefined,
        phase: 'start'
      });
      await bounded(() => options.removeAudio!(retired.audioReference!));
      await update(b, retired, { audioReference: null });
      recordVoiceDiagnostic('cleanup', {
        captureId: retired.id,
        phase: 'success'
      });
    })()
      .catch(() => {
        recordVoiceDiagnostic('cleanup-error', {
          captureId: retired.id,
          phase: 'failure'
        });
        // Retain ownership solely for cleanup retry, including timeout/owner change.
      })
      .finally(() => {
        if (localCleanups.get(key) === cleanup) localCleanups.delete(key);
      });
    localCleanups.set(key, cleanup);
  };
  const submit = async (id: string) => {
    const b = await binding(id);
    let operation = (await loadVoiceBatches(b.owner)).find(
      (row) => row.id === id
    );
    await check(b);
    if (!operation) throw new VoiceCaptureError('analysis_failed');
    if (terminal(operation.phase) && !operation.sessionId) {
      const phase = operation.phase === 'cancelled' ? 'cancelled' : 'failed';
      await retireLocal(b, operation, phase);
      throw new VoiceBatchLocalTerminalError(phase, operation.failureCode);
    }
    if (
      !operation.sessionId &&
      (operation.phase === 'cancel_requested' ||
        Date.now() - operation.recordedAt >= 86400000)
    ) {
      const phase =
        operation.phase === 'cancel_requested' ? 'cancelled' : 'failed';
      await retireLocal(b, operation, phase);
      throw new VoiceBatchLocalTerminalError(phase);
    }
    if (terminal(operation.phase) && operation.sessionId)
      return finish(b, operation, await result(b, operation.sessionId));
    if (operation.phase === 'cancel_requested' && operation.sessionId) {
      const value = voiceBatchResultSchema.parse(
        await send(
          b,
          'POST',
          '/api/v1/voice/sessions/' + operation.sessionId + '/cancel',
          {},
          'voice-cancel:' + operation.id
        )
      );
      return finish(b, operation, value);
    }
    let bytes: ArrayBuffer | undefined;
    if (!operation.createBody && !operation.sessionId) {
      try {
        bytes = await readAudio(b, operation);
      } catch (error) {
        if (
          error instanceof VoiceCaptureError &&
          ['re_record_required', 'analysis_failed'].includes(error.code)
        ) {
          await retireLocal(b, operation, 'failed');
          throw new VoiceBatchLocalTerminalError('failed');
        }
        throw error;
      }
      operation = await update(b, operation, {
        createBody: {
          locale: operation.locale,
          durationMs: operation.durationMs,
          contentType: 'audio/m4a',
          sizeBytes: bytes.byteLength,
          contentHash: bytesToHex(sha256(new Uint8Array(bytes))),
          recordedAt: new Date(operation.recordedAt).toISOString(),
          timezoneOffsetMinutes: operation.timezoneOffsetMinutes
        }
      });
    }
    if (!operation.sessionId) {
      try {
        const created = z
          .object({
            session: z.object({
              id: z.string().uuid(),
              version: z.number().int().positive()
            }),
            upload: z.object({ path: z.string() })
          })
          .parse(
            await send(
              b,
              'POST',
              '/api/v1/voice/sessions',
              operation.createBody,
              'voice-create:' + operation.id
            )
          );
        operation = await update(b, operation, {
          sessionId: created.session.id,
          version: created.session.version,
          phase:
            operation.phase === 'cancel_requested'
              ? 'cancel_requested'
              : 'created'
        });
      } catch (error) {
        if (error instanceof VoiceBatchRequestRejected) {
          const failureCode =
            error.code === 'voice_canary_restricted' ? error.code : undefined;
          await retireLocal(b, operation, 'failed', failureCode);
          throw new VoiceBatchLocalTerminalError('failed', failureCode);
        }
        throw error;
      }
    }
    const session = operation.sessionId!;
    if (operation.phase === 'cancel_requested') {
      return finish(
        b,
        operation,
        voiceBatchResultSchema.parse(
          await send(
            b,
            'POST',
            '/api/v1/voice/sessions/' + session + '/cancel',
            {},
            'voice-cancel:' + id
          )
        )
      );
    }
    // Read authoritative state before resending any uncertain upload/process request.
    const server = await result(b, session);
    if (terminal(server.status)) return finish(b, operation, server);
    if (server.status === 'uploading') {
      if (operation.retryAfterAt && operation.retryAfterAt > Date.now()) {
        // Quota entitlements can change while queued. Recheck at most once a minute,
        // including journals written by the earlier reset-time-only implementation.
        if (operation.retryAfterAt > Date.now() + quotaRetryMs)
          await update(b, operation, {
            retryAfterAt: Date.now() + quotaRetryMs
          });
        return server;
      }
      if (!operation.processBody) {
        bytes = bytes ?? (await readAudio(b, operation));
        if (
          bytesToHex(sha256(new Uint8Array(bytes))) !==
          operation.createBody?.contentHash
        )
          throw new VoiceCaptureError('analysis_failed');
        const uploaded = z
          .object({
            id: z.string().uuid(),
            version: z.number().int().positive(),
            contentHash: z.string()
          })
          .parse(
            await send(
              b,
              'PUT',
              '/api/v1/voice/sessions/' + session + '/audio',
              undefined,
              undefined,
              bytes
            )
          );
        if (
          uploaded.id !== session ||
          uploaded.contentHash !== operation.createBody?.contentHash
        )
          throw new VoiceCaptureError('analysis_failed');
        operation = await update(b, operation, {
          phase: 'uploaded',
          processBody: {
            uploadCompleted: true,
            expectedVersion: uploaded.version,
            contentHash: uploaded.contentHash
          }
        });
      }
      try {
        await send(
          b,
          'POST',
          '/api/v1/voice/sessions/' + session + '/process',
          operation.processBody,
          'voice-process:' + id
        );
      } catch (error) {
        if (error instanceof VoiceBatchRateLimited)
          await update(b, operation, { retryAfterAt: error.retryAfterAt });
        throw error;
      }
    }
    operation = await update(b, operation, {
      phase: 'processing',
      retryAfterAt: undefined
    });
    return finish(b, operation, await poll(b, session));
  };
  const runBatch = (id: string) => {
    const existing = inflight.get(id);
    if (existing) return existing;
    const pending = submit(id).finally(() => {
      if (inflight.get(id) === pending) inflight.delete(id);
    });
    inflight.set(id, pending);
    return pending;
  };
  return {
    async queueBatch(audio, locale, offset) {
      const b = await binding();
      const id = randomUUID();
      recordVoiceDiagnostic('journal-handoff', {
        captureId: id,
        phase: 'start',
        durationMs: audio.durationMs
      });
      await saveVoiceBatch(b.owner, {
        id,
        revision: 0,
        phase: 'captured',
        audioReference: audio.uri,
        locale,
        durationMs: audio.durationMs,
        recordedAt: audio.recordedAt,
        timezoneOffsetMinutes: offset,
        createBody: null,
        sessionId: null,
        version: null,
        processBody: null
      });
      // Successful persistence transfers audio ownership even if auth changes during the write.
      // The captured owner can recover the operation later; the recorder must not delete it.
      recordVoiceDiagnostic('journal-handoff', {
        captureId: id,
        phase: 'success'
      });
      return id;
    },
    runBatch,
    async recoverBatches(onLocalPending) {
      const b = await binding();
      if (recoveryOwner !== b.owner) {
        recoveryOwner = b.owner;
        discoveryCursor = null;
        unresolved = new Set<string>();
      }
      await pruneVoiceBatches(b.owner);
      const local = await loadVoiceBatches(b.owner);
      await check(b);
      onLocalPending?.(
        local
          .filter((operation) => !terminal(operation.phase))
          .map((operation) => operation.id)
      );
      // Return promptly while automatic submission and reconciliation continue.
      for (const operation of local.filter(
        (row) => !terminal(row.phase) || Boolean(row.audioReference)
      )) {
        if (terminal(operation.phase) && operation.sessionId) {
          cleanupAudio(b, operation);
          continue;
        }
        void runBatch(operation.id).then(
          () => {
            if (epoch === b.epoch) recoveryFailures.delete(operation.id);
          },
          (error: unknown) => {
            if (epoch !== b.epoch) return;
            if (error instanceof VoiceBatchLocalTerminalError)
              recoveryFailures.delete(operation.id);
            else recoveryFailures.add(operation.id);
          }
        );
      }
      const values: VoiceBatchResult[] = [];
      let cursor = discoveryCursor;
      const remainingSessions = new Set(unresolved);
      const discovered = new Set<string>();
      let more: boolean;
      do {
        const page = z
          .object({
            items: z.array(
              z.object({
                createdAt: z.string(),
                ...voiceBatchResultSchema.innerType().shape
              })
            )
          })
          .parse(
            await send(
              b,
              'GET',
              '/api/v1/voice/batches/recovery' +
                (cursor
                  ? '?after=' +
                    encodeURIComponent(cursor.createdAt) +
                    '&afterId=' +
                    cursor.sessionId
                  : '')
            )
          );
        for (const entry of page.items) {
          const { createdAt: _, ...value } = entry;
          values.push(voiceBatchResultSchema.parse(value));
          discovered.add(value.sessionId);
          if (terminal(value.status)) remainingSessions.delete(value.sessionId);
          else remainingSessions.add(value.sessionId);
        }
        const last = page.items.at(-1);
        if (last)
          cursor = { createdAt: last.createdAt, sessionId: last.sessionId };
        more = page.items.length === 100;
      } while (more);
      for (const session of unresolved) {
        if (discovered.has(session)) continue;
        const value = await result(b, session);
        values.push(value);
        if (terminal(value.status)) remainingSessions.delete(session);
      }
      await check(b);
      const remaining = await loadVoiceBatches(b.owner);
      await check(b);
      const latestLocal = remaining.reduce<VoiceBatchOperation | null>(
        (latest, operation) =>
          !latest || operation.recordedAt > latest.recordedAt
            ? operation
            : latest,
        null
      );
      discoveryCursor = cursor;
      unresolved = remainingSessions;
      return {
        results: [
          ...new Map(values.map((value) => [value.sessionId, value])).values()
        ],
        uncertain: remaining.some(
          (value) => !terminal(value.phase) && recoveryFailures.has(value.id)
        ),
        pendingIds: remaining
          .filter((row) => !terminal(row.phase))
          .map((row) => row.id),
        localFailure: latestLocal?.phase === 'failed' && !latestLocal.sessionId,
        ...(latestLocal?.phase === 'failed' &&
        !latestLocal.sessionId &&
        latestLocal.failureCode
          ? { localFailureCode: latestLocal.failureCode }
          : {}),
        ...(remaining.some((row) => row.sessionId)
          ? {
              localSessions: Object.fromEntries(
                remaining
                  .filter((row) => row.sessionId)
                  .map((row) => [row.id, row.sessionId!])
              )
            }
          : {})
      };
    },
    async cancelBatch(id) {
      const b = await binding();
      let next: VoiceBatchOperation | undefined;
      for (let attempt = 0; attempt < 8; attempt++) {
        const local = await loadVoiceBatches(b.owner);
        const operation = local.find(
          (row) => row.id === id || row.sessionId === id
        );
        await check(b);
        if (!operation)
          return voiceBatchResultSchema.parse(
            await send(
              b,
              'POST',
              '/api/v1/voice/sessions/' + id + '/cancel',
              {},
              'voice-cancel:' + id
            )
          );
        if (terminal(operation.phase))
          return operation.sessionId ? result(b, operation.sessionId) : null;
        try {
          next =
            operation.phase === 'cancel_requested'
              ? operation
              : await update(b, operation, { phase: 'cancel_requested' });
          break;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== 'voice batch revision conflict'
          )
            throw error;
        }
      }
      if (!next) throw new VoiceCaptureError('recovery_required');
      if (!next.sessionId) {
        await retireLocal(b, next, 'cancelled');
        throw new VoiceBatchLocalTerminalError('cancelled');
      }
      const value = voiceBatchResultSchema.parse(
        await send(
          b,
          'POST',
          '/api/v1/voice/sessions/' + next.sessionId + '/cancel',
          {},
          'voice-cancel:' + next.id
        )
      );
      return finish(b, next, value);
    },
    pauseBatches() {
      epoch++;
      // A new UI runtime must rediscover still-visible terminal receipts.
      discoveryCursor = null;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    }
  };
}
