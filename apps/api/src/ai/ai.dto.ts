import { HttpException } from '@nestjs/common';
import { normalizeCreateTransaction } from '../ledger/ledger.dto';

import { assertSafeAiInput, hasForbiddenKey } from './ai.schemas';
import { ASSISTANT_INTENTS, type AssistantContextScope, type AssistantIntent } from './ai-routing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTENT_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

/** New clients explicitly request the additive projection; legacy receipts stay exact. */
export function wantsVoiceEventResults(accept?: string): boolean {
  return (accept ?? '')
    .split(',')
    .some(
      (media) =>
        /^\s*application\/json\s*(?:;|$)/i.test(media) &&
        /;\s*voice-event-results\s*=\s*(?:1|"1")\s*(?:;|$)/i.test(media),
    );
}
const SCOPES = new Set([
  'accounts_summary',
  'recent_transactions',
  'budgets',
  'obligations',
  'tracking_reviews',
]);

function bad(): never {
  throw new HttpException({ code: 'VALIDATION_FAILED' }, 422);
}

function text(input: unknown, fallback?: string): string {
  if (input === undefined || input === null) {
    if (fallback !== undefined) return fallback;
    bad();
  }
  if (typeof input !== 'string') bad();
  return input;
}

export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad();
  return input as Record<string, unknown>;
}

export function exact(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) bad();
}

export function uuid(input: unknown): string {
  if (typeof input !== 'string' || !UUID.test(input)) bad();
  return input;
}

export function positiveVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 1) bad();
  return Number(input);
}

export function idempotencyKey(input: unknown): string {
  if (typeof input !== 'string' || !/^[\x21-\x7e]{16,128}$/.test(input)) bad();
  return input;
}

export function createVoice(input: unknown) {
  const value = record(input);
  exact(value, ['locale', 'durationMs', 'contentType', 'sizeBytes']);
  if (
    typeof value.locale !== 'string' ||
    !['ar', 'en'].includes(value.locale) ||
    !Number.isInteger(value.durationMs) ||
    Number(value.durationMs) < 1 ||
    Number(value.durationMs) > 120_000 ||
    typeof value.contentType !== 'string' ||
    !CONTENT_TYPES.has(value.contentType) ||
    !Number.isInteger(value.sizeBytes) ||
    Number(value.sizeBytes) < 1 ||
    Number(value.sizeBytes) > 12_582_912
  )
    bad();
  return {
    locale: value.locale as 'ar' | 'en',
    durationMs: Number(value.durationMs),
    contentType: value.contentType,
    sizeBytes: Number(value.sizeBytes),
  };
}

export function createVoiceV2(input: unknown) {
  const value = record(input);
  exact(value, [
    'locale',
    'durationMs',
    'contentType',
    'sizeBytes',
    'contentHash',
    'recordedAt',
    'timezoneOffsetMinutes',
  ]);
  const media = createVoice({
    locale: value.locale,
    durationMs: value.durationMs,
    contentType: value.contentType,
    sizeBytes: value.sizeBytes,
  });
  const recordedAt = typeof value.recordedAt === 'string' ? Date.parse(value.recordedAt) : NaN;
  if (
    media.durationMs > 60_000 ||
    typeof value.contentHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.contentHash) ||
    !Number.isFinite(recordedAt) ||
    new Date(recordedAt).toISOString() !== value.recordedAt ||
    recordedAt > Date.now() + 300_000 ||
    recordedAt < Date.now() - 86_400_000 ||
    !Number.isInteger(value.timezoneOffsetMinutes) ||
    Math.abs(Number(value.timezoneOffsetMinutes)) > 840
  )
    bad();
  return {
    ...media,
    contentHash: value.contentHash,
    recordedAt: value.recordedAt,
    timezoneOffsetMinutes: Number(value.timezoneOffsetMinutes),
  };
}

export function processVoice(input: unknown) {
  const value = record(input);
  exact(value, ['uploadCompleted', 'expectedVersion', 'contentHash']);
  if (
    value.uploadCompleted !== true ||
    typeof value.contentHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.contentHash)
  )
    bad();
  return {
    expectedVersion: positiveVersion(value.expectedVersion),
    contentHash: value.contentHash,
  };
}

export function voicePreference(input: unknown) {
  const value = record(input);
  exact(value, ['id', 'expectedVersion', 'merchantPattern', 'categoryId', 'confidence']);
  const merchantPattern = assertSafeAiInput(text(value.merchantPattern, ''), 640);
  if (
    merchantPattern.length > 160 ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  )
    bad();
  return {
    id: value.id === undefined ? null : uuid(value.id),
    expectedVersion: value.id === undefined ? null : positiveVersion(value.expectedVersion),
    merchantPattern,
    categoryId: uuid(value.categoryId),
    confidence: value.confidence,
  };
}

export function actionDecision(input: unknown, editable: boolean) {
  const value = record(input);
  exact(
    value,
    editable ? ['expectedVersion', 'editedFields', 'reason'] : ['expectedVersion', 'reason'],
  );
  const reason = value.reason == null ? null : assertSafeAiInput(text(value.reason), 500);
  const editedFields = value.editedFields == null ? undefined : record(value.editedFields);
  if (!editable && editedFields) bad();
  if (editedFields) {
    exact(editedFields, [
      'amountMinor',
      'currency',
      'categoryId',
      'accountId',
      'date',
      'merchant',
      'note',
    ]);
    if (Object.keys(editedFields).length === 0 || hasForbiddenKey(editedFields)) bad();
  }
  return { expectedVersion: positiveVersion(value.expectedVersion), reason, editedFields };
}

export function voiceDecision(input: unknown, operationId: string, now = new Date()) {
  const value = record(input);
  exact(value, [
    'expectedVersion',
    'editedFields',
    'reason',
    'occurredAt',
    'timezoneOffsetMinutes',
  ]);
  const { occurredAt, timezoneOffsetMinutes, ...decisionBody } = value;
  const decision = actionDecision(decisionBody, true);
  const patch = decision.editedFields;
  if (
    !patch ||
    Object.keys(patch).length !== 7 ||
    typeof occurredAt !== 'string' ||
    !Number.isInteger(timezoneOffsetMinutes) ||
    Number(timezoneOffsetMinutes) < -840 ||
    Number(timezoneOffsetMinutes) > 840 ||
    typeof patch.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(patch.date) ||
    Number.isNaN(Date.parse(patch.date + 'T00:00:00Z')) ||
    new Date(patch.date + 'T00:00:00Z').toISOString().slice(0, 10) !== patch.date ||
    typeof patch.amountMinor !== 'string' ||
    !/^-?[1-9][0-9]{0,15}$/u.test(patch.amountMinor)
  )
    bad();
  const amount = Number(patch.amountMinor);
  if (amount > 0 && patch.categoryId == null) bad();
  let command;
  try {
    command = normalizeCreateTransaction(
      {
        kind: amount < 0 ? 'income' : 'expense',
        amountMinor: Math.abs(amount),
        currency: patch.currency,
        accountId: patch.accountId,
        categoryId: patch.categoryId,
        merchant: patch.merchant,
        note: patch.note,
        title: patch.merchant ?? 'Voice transaction',
        paymentMethod: null,
        occurredAt,
        source: 'voice',
        externalRef: 'voice:' + uuid(operationId),
      },
      now,
    );
  } catch {
    bad();
  }
  if (
    new Date(Date.parse(command.occurredAt) - Number(timezoneOffsetMinutes) * 60_000)
      .toISOString()
      .slice(0, 10) !== patch.date
  )
    bad();
  return {
    ...decision,
    editedFields: { ...patch, merchant: command.merchant, note: command.note },
    command,
    timezoneOffsetMinutes: Number(timezoneOffsetMinutes),
  };
}

export function consent(input: unknown) {
  const value = record(input);
  exact(value, ['policyVersion', 'accepted', 'expectedVersion']);
  if (
    value.accepted !== true ||
    typeof value.policyVersion !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(value.policyVersion)
  )
    bad();
  return {
    policyVersion: value.policyVersion,
    expectedVersion: positiveVersion(value.expectedVersion),
  };
}

export function conversationCreate(input: unknown) {
  const value = record(input);
  exact(value, ['title']);
  return { title: value.title == null ? null : assertSafeAiInput(text(value.title), 480) };
}

export function conversationUpdate(input: unknown) {
  const value = record(input);
  exact(value, ['expectedVersion', 'title', 'status']);
  if (value.title === undefined && value.status === undefined) bad();
  if (
    value.status !== undefined &&
    (typeof value.status !== 'string' || !['active', 'archived', 'deleted'].includes(value.status))
  )
    bad();
  return {
    expectedVersion: positiveVersion(value.expectedVersion),
    title:
      value.title === undefined
        ? undefined
        : value.title === null
          ? null
          : assertSafeAiInput(text(value.title), 480),
    status: value.status === undefined ? undefined : text(value.status),
  };
}

export function assistantMessage(input: unknown) {
  const value = record(input);
  exact(value, ['content', 'intent', 'contextScope', 'responseMode']);
  const content = assertSafeAiInput(text(value.content, ''));
  const contextScope = value.contextScope === undefined ? [] : value.contextScope;
  if (!Array.isArray(contextScope) || contextScope.length > 5) bad();
  const normalizedScope = contextScope.map((scope) => text(scope));
  if (
    new Set(normalizedScope).size !== normalizedScope.length ||
    normalizedScope.some((scope) => !SCOPES.has(scope))
  )
    bad();
  const intent = value.intent === undefined ? undefined : text(value.intent);
  if (intent !== undefined && !ASSISTANT_INTENTS.includes(intent as AssistantIntent)) bad();
  if (typeof value.responseMode !== 'string' || !['async', 'stream'].includes(value.responseMode))
    bad();
  return {
    content,
    contextScope: normalizedScope as AssistantContextScope[],
    contextScopeProvided: value.contextScope !== undefined,
    ...(intent === undefined ? {} : { intent: intent as AssistantIntent }),
    responseMode: value.responseMode as 'async' | 'stream',
  };
}

export function feedback(input: unknown) {
  const value = record(input);
  exact(value, ['rating', 'reason']);
  if (value.rating !== -1 && value.rating !== 1) bad();
  return {
    rating: value.rating,
    reason: value.reason == null ? null : assertSafeAiInput(text(value.reason), 2_000),
  };
}

export function responseReport(input: unknown) {
  const value = record(input);
  exact(value, ['reportType', 'reason']);
  if (
    typeof value.reportType !== 'string' ||
    !['unsafe', 'inaccurate', 'irrelevant', 'privacy', 'other'].includes(value.reportType)
  )
    bad();
  return { reportType: value.reportType, reason: assertSafeAiInput(text(value.reason, ''), 4_000) };
}

export function page(input: unknown) {
  const value = record(input);
  exact(value, ['cursor', 'limit']);
  const limit = value.limit === undefined ? 25 : Number(value.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) bad();
  if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length > 512))
    bad();
  return { limit, cursor: value.cursor };
}

export function adminMutation(input: unknown) {
  const value = record(input);
  if (hasForbiddenKey(value)) bad();
  const reason = assertSafeAiInput(text(value.reason, ''), 2_000);
  if (reason.length < 10) bad();
  return { ...value, reason, expectedVersion: positiveVersion(value.expectedVersion) };
}

export function adminCreate(input: unknown, allowed: readonly string[]) {
  const value = record(input);
  exact(value, [...allowed, 'reason']);
  if (hasForbiddenKey(value)) bad();
  const reason = assertSafeAiInput(text(value.reason, ''), 2_000);
  if (reason.length < 10) bad();
  return { ...value, reason };
}
