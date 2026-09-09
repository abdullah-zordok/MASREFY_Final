import { HttpException } from '@nestjs/common';

import { assertSafeAiInput, hasForbiddenKey } from './ai.schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTENT_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);
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
  exact(value, ['content', 'contextScope', 'responseMode']);
  const content = assertSafeAiInput(text(value.content, ''));
  if (
    !Array.isArray(value.contextScope) ||
    value.contextScope.length < 1 ||
    value.contextScope.length > 5
  )
    bad();
  const contextScope = value.contextScope.map((scope) => text(scope));
  if (
    new Set(contextScope).size !== contextScope.length ||
    contextScope.some((scope) => !SCOPES.has(scope))
  )
    bad();
  if (typeof value.responseMode !== 'string' || !['async', 'stream'].includes(value.responseMode))
    bad();
  return { content, contextScope, responseMode: value.responseMode as 'async' | 'stream' };
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
