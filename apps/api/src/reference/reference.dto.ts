const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const CURRENCY = /^[A-Z]{3}$/;
const SAFE_KEY = /^[A-Za-z0-9._:-]+$/;
// eslint-disable-next-line no-control-regex -- trust-boundary rejection is intentional
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const ACCOUNT_TYPES = [
  'bank',
  'debit_card',
  'credit_card',
  'wallet',
  'cash',
  'savings',
  'other',
] as const;
const CATEGORY_KINDS = ['income', 'expense', 'transfer'] as const;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function failure(code = 'VALIDATION_FAILED'): never {
  throw Object.assign(new Error(code), { code });
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) failure();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) failure();
}
function text(value: unknown, max: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') failure();
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) failure();
  return normalized;
}
function optionalText(value: unknown, max: number): string | null | undefined {
  return value === undefined ? undefined : text(value, max, true);
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    failure();
  return value;
}
function optionalBoolean(value: unknown, defaultValue?: boolean): boolean | undefined {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') failure();
  return value;
}
function optionalUuid(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || !UUID.test(value)) failure();
  return value;
}
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function assertIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !KEY.test(value)) failure('IDEMPOTENCY_KEY_REQUIRED');
  return value;
}
export function expectedVersion(value: unknown): number {
  return integer(value, 1, MAX_SAFE);
}
export function boundedLimit(value: unknown, maximum = 100, defaultValue = 25): number {
  if (value === undefined) return defaultValue;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
        ? Number(value)
        : Number.NaN;
  return integer(parsed, 1, maximum);
}
export function cursorOffset(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) failure();
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  if (
    !/^(0|[1-9][0-9]{0,6})$/.test(decoded) ||
    Buffer.from(decoded).toString('base64url') !== value
  )
    failure();
  return integer(Number(decoded), 0, 1_000_000);
}
export const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset)).toString('base64url');

export function normalizeCreateCategory(value: unknown): Record<string, unknown> {
  const input = object(value);
  exact(input, ['kind', 'labelAr', 'labelEn', 'icon', 'color', 'parentId', 'sortOrder']);
  const kind = input.kind === undefined ? 'expense' : input.kind;
  if (!CATEGORY_KINDS.includes(kind as never)) failure();
  return {
    kind,
    labelAr: text(input.labelAr, 100),
    labelEn: text(input.labelEn, 100),
    icon: optionalText(input.icon, 64),
    color: optionalText(input.color, 32),
    parentId: optionalUuid(input.parentId),
    sortOrder: input.sortOrder === undefined ? 0 : integer(input.sortOrder, -100000, 100000),
  };
}
export function normalizeCategoryPatch(value: unknown): Record<string, unknown> {
  const input = object(value);
  exact(input, [
    'expectedVersion',
    'kind',
    'labelAr',
    'labelEn',
    'icon',
    'color',
    'parentId',
    'sortOrder',
  ]);
  if (Object.keys(input).length < 2) failure();
  const result: Record<string, unknown> = {
    expectedVersion: expectedVersion(input.expectedVersion),
  };
  if (input.kind !== undefined) {
    if (!CATEGORY_KINDS.includes(input.kind as never)) failure();
    result.kind = input.kind;
  }
  for (const [key, max] of [
    ['labelAr', 100],
    ['labelEn', 100],
    ['icon', 64],
    ['color', 32],
  ] as const)
    if (key in input) result[key] = optionalText(input[key], max);
  if ('parentId' in input) result.parentId = optionalUuid(input.parentId);
  if ('sortOrder' in input) result.sortOrder = integer(input.sortOrder, -100000, 100000);
  return result;
}
export function normalizeCreateAccount(value: unknown): Record<string, unknown> {
  const input = object(value);
  exact(input, [
    'name',
    'type',
    'currency',
    'institutionName',
    'lastFour',
    'creditLimitMinor',
    'isDefault',
    'iconKey',
    'colorKey',
    'notes',
    'sortOrder',
    'includeInTotals',
    'openedAt',
    'openingBalanceMinor',
  ]);
  if (
    !ACCOUNT_TYPES.includes(input.type as never) ||
    typeof input.currency !== 'string' ||
    !CURRENCY.test(input.currency)
  )
    failure();
  const opening =
    input.openingBalanceMinor === undefined
      ? 0
      : integer(input.openingBalanceMinor, -MAX_SAFE, MAX_SAFE);
  if (opening !== 0) failure('LEDGER_NOT_AVAILABLE');
  const credit =
    input.creditLimitMinor === undefined
      ? undefined
      : input.creditLimitMinor === null
        ? null
        : integer(input.creditLimitMinor, 0, MAX_SAFE);
  if (input.type !== 'credit_card' && credit !== undefined && credit !== null) failure();
  if (
    input.lastFour !== undefined &&
    input.lastFour !== null &&
    (typeof input.lastFour !== 'string' || !/^\d{4}$/.test(input.lastFour))
  )
    failure();
  if (input.openedAt !== undefined && input.openedAt !== null && !isIsoDate(input.openedAt))
    failure();
  return {
    name: text(input.name, 100),
    type: input.type,
    currency: input.currency,
    institutionName: optionalText(input.institutionName, 100),
    lastFour: input.lastFour,
    creditLimitMinor: credit,
    isDefault: optionalBoolean(input.isDefault, false),
    iconKey: optionalText(input.iconKey, 64),
    colorKey: optionalText(input.colorKey, 32),
    notes: optionalText(input.notes, 500),
    sortOrder: input.sortOrder === undefined ? 0 : integer(input.sortOrder, -100000, 100000),
    includeInTotals: optionalBoolean(input.includeInTotals, true),
    openedAt: input.openedAt,
    openingBalanceMinor: opening,
  };
}
export function normalizeAccountPatch(value: unknown): Record<string, unknown> {
  const input = object(value);
  exact(input, [
    'expectedVersion',
    'name',
    'type',
    'currency',
    'institutionName',
    'lastFour',
    'creditLimitMinor',
    'isDefault',
    'iconKey',
    'colorKey',
    'notes',
    'sortOrder',
    'includeInTotals',
    'openedAt',
  ]);
  if ('currency' in input) failure('ACCOUNT_CURRENCY_LOCKED');
  if (Object.keys(input).length < 2) failure();
  const result: Record<string, unknown> = {
    expectedVersion: expectedVersion(input.expectedVersion),
  };
  if ('name' in input) result.name = text(input.name, 100);
  if ('type' in input) {
    if (!ACCOUNT_TYPES.includes(input.type as never)) failure();
    result.type = input.type;
  }
  for (const [key, max] of [
    ['institutionName', 100],
    ['iconKey', 64],
    ['colorKey', 32],
    ['notes', 500],
  ] as const)
    if (key in input) result[key] = optionalText(input[key], max);
  if ('lastFour' in input) {
    if (
      input.lastFour !== null &&
      (typeof input.lastFour !== 'string' || !/^\d{4}$/.test(input.lastFour))
    )
      failure();
    result.lastFour = input.lastFour;
  }
  if ('creditLimitMinor' in input) {
    const credit =
      input.creditLimitMinor === null ? null : integer(input.creditLimitMinor, 0, MAX_SAFE);
    if (input.type !== undefined && input.type !== 'credit_card' && credit !== null) failure();
    result.creditLimitMinor = credit;
  }
  for (const key of ['isDefault', 'includeInTotals'] as const)
    if (key in input) result[key] = optionalBoolean(input[key]);
  if ('sortOrder' in input) result.sortOrder = integer(input.sortOrder, -100000, 100000);
  if ('openedAt' in input) {
    if (input.openedAt !== null && !isIsoDate(input.openedAt)) failure();
    result.openedAt = input.openedAt;
  }
  return result;
}
export function normalizeVersionBody(
  value: unknown,
  extra: readonly string[] = [],
): Record<string, unknown> {
  const input = object(value);
  exact(input, ['expectedVersion', ...extra]);
  return { ...input, expectedVersion: expectedVersion(input.expectedVersion) };
}
export function normalizeReason(value: unknown): string {
  const reason = text(value, 500) as string;
  if (reason.length < 10) failure();
  return reason;
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
export function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY.test(value);
}
export function isSafeKey(value: unknown, max = 64): value is string {
  return typeof value === 'string' && value.length <= max && SAFE_KEY.test(value);
}
