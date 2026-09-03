const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

type JsonObject = Record<string, unknown>;

export interface TrackingCursor {
  at: string;
  id: string;
}

export interface NormalizedTrackingEvent {
  sourceItemKey: string;
  sender?: string;
  body?: string;
  amountMinor?: number;
  currency?: string;
  merchant?: string;
  receivedAt: string;
  occurredAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
  kind?: 'income' | 'expense' | 'transfer' | 'refund' | 'fee';
  accountId?: string;
  categoryId?: string;
}

export interface NormalizedImport {
  schemaVersion: 1;
  sourceType: 'sms' | 'manual';
  sourceChannel?:
    | 'android_sms'
    | 'android_notification'
    | 'ios_shortcut'
    | 'ios_app_intent'
    | 'ios_share_extension'
    | 'manual';
  events: NormalizedTrackingEvent[];
}

function invalid(): never {
  throw new Error('VALIDATION_FAILED');
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as JsonObject;
}

function keys(value: JsonObject, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized.length < min ||
    Buffer.byteLength(normalized, 'utf8') > max ||
    unsafeText(normalized)
  )
    invalid();
  return normalized;
}

function unsafeText(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return true;
  }
  return false;
}

function instant(value: unknown): string {
  const normalized = text(value, 1, 64);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf()) || !/[zZ]|[+-]\d\d:\d\d$/.test(normalized)) invalid();
  return parsed.toISOString();
}

export function normalizeTrackingId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!UUID.test(id)) invalid();
  return id.toLowerCase();
}

export function normalizeVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}

export function encodeTrackingCursor(cursor: TrackingCursor): string {
  return Buffer.from(
    JSON.stringify({ at: instant(cursor.at), id: normalizeTrackingId(cursor.id) }),
  ).toString('base64url');
}

export function decodeTrackingCursor(value: unknown): TrackingCursor {
  try {
    if (typeof value !== 'string' || value.length > 512) invalid();
    const parsed = object(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown);
    keys(parsed, ['at', 'id']);
    return { at: instant(parsed.at), id: normalizeTrackingId(parsed.id) };
  } catch {
    invalid();
  }
}

export function normalizeTrackingList(value: unknown): { cursor: string | null; limit: number } {
  const input = object(value ?? {});
  keys(input, ['cursor', 'limit']);
  const cursor =
    input.cursor == null ? null : encodeTrackingCursor(decodeTrackingCursor(input.cursor));
  const rawLimit = input.limit ?? 25;
  const limit =
    typeof rawLimit === 'string' && /^\d+$/.test(rawLimit) ? Number(rawLimit) : rawLimit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) invalid();
  return { cursor, limit: limit as number };
}

export function normalizeTrackingOwnerFilters(
  resource: string,
  value: unknown,
): Record<string, string | number> {
  const input = object(value ?? {});
  const allowed: Record<string, readonly string[]> = {
    sessions: ['status', 'sourceType'],
    items: ['status'],
    reviews: ['status'],
    duplicates: ['status', 'minScore'],
    history: ['outcome', 'sourceType'],
  };
  const filterKeys = allowed[resource] ?? [];
  keys(input, ['cursor', 'limit', ...filterKeys]);
  const result: Record<string, string | number> = {};
  const enums: Record<string, readonly string[]> = {
    'sessions.status': ['received', 'processing', 'review', 'complete', 'failed', 'cancelled'],
    'sessions.sourceType': ['sms', 'file', 'manual', 'provider'],
    'items.status': ['parsed', 'review', 'accepted', 'rejected', 'duplicate', 'failed'],
    'reviews.status': ['pending', 'accepted', 'rejected', 'edited'],
    'duplicates.status': ['proposed', 'duplicate', 'not_duplicate'],
    'history.outcome': [
      'received',
      'parsed',
      'reviewed',
      'accepted',
      'rejected',
      'duplicate',
      'failed',
      'purged',
      'feedback',
    ],
    'history.sourceType': ['sms', 'file', 'manual', 'provider'],
  };
  for (const key of filterKeys) {
    const value = input[key];
    if (value == null) continue;
    if (key === 'minScore') {
      const score = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      if (!Number.isInteger(score) || Number(score) < 0 || Number(score) > 10000) invalid();
      result[key] = Number(score);
    } else {
      const normalized = text(value, 1, 32);
      if (!(enums[`${resource}.${key}`] ?? []).includes(normalized)) invalid();
      result[key] = normalized;
    }
  }
  return result;
}

function normalizeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  const input = object(value);
  if (Object.keys(input).length > 12) invalid();
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(input)) {
    const safeKey = text(key, 1, 40);
    if (item === null || typeof item === 'boolean') result[safeKey] = item;
    else if (typeof item === 'number' && Number.isSafeInteger(item)) result[safeKey] = item;
    else if (typeof item === 'string') result[safeKey] = text(item, 0, 200);
    else invalid();
  }
  return result;
}

function normalizeEvent(value: unknown): NormalizedTrackingEvent {
  const input = object(value);
  keys(input, [
    'sourceItemKey',
    'sender',
    'body',
    'amountMinor',
    'currency',
    'merchant',
    'receivedAt',
    'occurredAt',
    'metadata',
    'kind',
    'accountId',
    'categoryId',
  ]);
  const result: NormalizedTrackingEvent = {
    sourceItemKey: text(input.sourceItemKey, 1, 160),
    receivedAt: instant(input.receivedAt),
  };
  if (input.sender != null) result.sender = text(input.sender, 1, 200);
  if (input.body != null) result.body = text(input.body, 1, 2000);
  if (input.amountMinor != null) {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) invalid();
    result.amountMinor = input.amountMinor as number;
  }
  if (!result.body && result.amountMinor == null) invalid();
  if (input.currency != null) {
    const currency = text(input.currency, 3, 3);
    if (!CURRENCY.test(currency)) invalid();
    result.currency = currency;
  }
  if (input.merchant != null) result.merchant = text(input.merchant, 1, 200);
  if (input.occurredAt != null) result.occurredAt = instant(input.occurredAt);
  if (input.metadata != null) result.metadata = normalizeMetadata(input.metadata);
  if (input.kind != null) {
    if (
      typeof input.kind !== 'string' ||
      !['income', 'expense', 'transfer', 'refund', 'fee'].includes(input.kind)
    )
      invalid();
    result.kind = input.kind as NormalizedTrackingEvent['kind'];
  }
  if (input.accountId != null) result.accountId = normalizeTrackingId(input.accountId);
  if (input.categoryId != null) result.categoryId = normalizeTrackingId(input.categoryId);
  return result;
}

export function normalizeNormalizedImport(value: unknown): NormalizedImport {
  const input = object(value);
  keys(input, ['schemaVersion', 'sourceType', 'sourceChannel', 'events']);
  if (
    input.schemaVersion !== 1 ||
    typeof input.sourceType !== 'string' ||
    !['sms', 'manual'].includes(input.sourceType)
  )
    invalid();
  const channels = [
    'android_sms',
    'android_notification',
    'ios_shortcut',
    'ios_app_intent',
    'ios_share_extension',
    'manual',
  ];
  if (
    input.sourceChannel != null &&
    (typeof input.sourceChannel !== 'string' || !channels.includes(input.sourceChannel))
  )
    invalid();
  if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 100)
    invalid();
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 512 * 1024) invalid();
  return {
    schemaVersion: 1,
    sourceType: input.sourceType as 'sms' | 'manual',
    ...(input.sourceChannel == null
      ? {}
      : { sourceChannel: input.sourceChannel as NormalizedImport['sourceChannel'] }),
    events: input.events.map(normalizeEvent),
  };
}

export function normalizeAdminTrackingAction(value: unknown): {
  action: string;
  reason: string;
  expectedVersion: number;
  patch: JsonObject;
} {
  const input = object(value);
  keys(input, ['action', 'reason', 'expectedVersion', 'patch']);
  const patch = input.patch == null ? {} : object(input.patch);
  if (Object.keys(patch).length > 12) invalid();
  return {
    action: text(input.action, 1, 64),
    reason: text(input.reason, 10, 500),
    expectedVersion: normalizeVersion(input.expectedVersion),
    patch,
  };
}
