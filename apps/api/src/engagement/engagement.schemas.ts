const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[a-z][a-z0-9_.-]{1,95}$/;
// eslint-disable-next-line no-control-regex -- trust-boundary validation rejects controls and bidi overrides
const CONTROL_OR_BIDI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function engagementRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = [],
): void {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => value[key] === undefined)
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
}

export function engagementUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('ENGAGEMENT_INPUT_INVALID');
  return value;
}

export function safeText(value: unknown, maximum: number, optional = false): string | null {
  if (optional && (value === undefined || value === null)) return null;
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximum ||
    CONTROL_OR_BIDI.test(value) ||
    value.includes('\r')
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return value;
}

export function safeKey(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_KEY.test(value))
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return value;
}

export function safeVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return Number(value);
}

export function safePageQuery(value: unknown): { limit: number; cursor?: string } {
  const query = value === undefined ? {} : engagementRecord(value);
  exactKeys(query, ['limit', 'cursor', 'locale', 'type', 'query', 'status', 'unread']);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || query.cursor.length > 512))
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (
    query.locale !== undefined &&
    (typeof query.locale !== 'string' || !['ar', 'en'].includes(query.locale))
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (query.unread !== undefined && typeof query.unread !== 'boolean')
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (
    query.status !== undefined &&
    (typeof query.status !== 'string' || !/^[a-z][a-z_]{1,31}$/.test(query.status))
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (
    query.type !== undefined &&
    (typeof query.type !== 'string' || !/^[a-z][a-z0-9_.-]{1,95}$/.test(query.type))
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (
    query.query !== undefined &&
    (typeof query.query !== 'string' ||
      query.query.length > 120 ||
      CONTROL_OR_BIDI.test(query.query))
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return { limit, ...(query.cursor ? { cursor: query.cursor } : {}) };
}

export function safeJsonObject(value: unknown, maximumBytes = 8_192): Record<string, unknown> {
  const result = engagementRecord(value);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maximumBytes)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  return structuredClone(result);
}
