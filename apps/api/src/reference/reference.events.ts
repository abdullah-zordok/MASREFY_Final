export const REFERENCE_EVENT_NAMES = Object.freeze([
  'account.archived',
  'account.closed',
  'account.created',
  'account.updated',
  'category.created',
  'category.deleted',
  'category.merged',
  'category.updated',
  'exchange-rate.refreshed',
  'reference.updated',
] as const);

const names = new Set<string>(REFERENCE_EVENT_NAMES);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subject = /^[A-Za-z0-9_:-]{1,128}$/;
const categoryFields = new Set([
  'active',
  'color',
  'icon',
  'kind',
  'labelAr',
  'labelEn',
  'parentId',
  'sortOrder',
]);
const accountFields = new Set([
  'automaticTrackingEnabled',
  'closedAt',
  'colorKey',
  'creditLimitMinor',
  'iconKey',
  'includeInTotals',
  'institutionName',
  'isDefault',
  'lastFour',
  'name',
  'notes',
  'openedAt',
  'sortOrder',
  'status',
  'type',
]);
const referenceFields = new Set(['defaultCurrency', 'enabled', 'minorUnit', 'name']);

function invalid(): never {
  throw Object.assign(new Error('EVENT_PAYLOAD_INVALID'), { code: 'EVENT_PAYLOAD_INVALID' });
}
function exact(payload: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(payload).some((key) => !allowed.includes(key))) invalid();
}
function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
function common(payload: Record<string, unknown>, idKey: string): void {
  if (
    !matches(payload[idKey], uuid) ||
    !Number.isInteger(payload.version) ||
    Number(payload.version) < 1 ||
    typeof payload.occurredAt !== 'string' ||
    Number.isNaN(Date.parse(payload.occurredAt))
  )
    invalid();
}
function changes(value: unknown, allowlist: Set<string>): void {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    !value.every((item) => typeof item === 'string')
  )
    invalid();
  const fields = value;
  if (
    fields.some((field) => !allowlist.has(field)) ||
    new Set(fields).size !== fields.length ||
    fields.some((field, index) => index > 0 && (fields[index - 1] ?? '') >= field)
  )
    invalid();
}

export function buildReferenceEvent(
  name: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!names.has(name) || Buffer.byteLength(JSON.stringify(payload)) > 4096) invalid();

  if (name.startsWith('account.')) {
    exact(payload, ['accountId', 'userId', 'version', 'occurredAt', 'changedFields']);
    common(payload, 'accountId');
    if (!matches(payload.userId, subject)) invalid();
    changes(payload.changedFields, accountFields);
  } else if (name.startsWith('category.')) {
    exact(payload, [
      'categoryId',
      'userId',
      'kind',
      'version',
      'occurredAt',
      'changedFields',
      'targetCategoryId',
      'systemKey',
    ]);
    common(payload, 'categoryId');
    if (
      typeof payload.kind !== 'string' ||
      !['income', 'expense', 'transfer'].includes(payload.kind)
    )
      invalid();
    const hasUser = matches(payload.userId, subject);
    const hasSystem = matches(payload.systemKey, /^[a-z][a-z0-9-]{1,63}$/);
    if (hasUser === hasSystem) invalid();
    if (
      name === 'category.merged'
        ? !matches(payload.targetCategoryId, uuid)
        : payload.targetCategoryId !== undefined
    )
      invalid();
    changes(payload.changedFields, categoryFields);
  } else if (name === 'exchange-rate.refreshed') {
    exact(payload, [
      'exchangeRateId',
      'baseCurrency',
      'quoteCurrency',
      'provider',
      'effectiveAt',
      'occurredAt',
    ]);
    if (
      !matches(payload.exchangeRateId, uuid) ||
      !matches(payload.baseCurrency, /^[A-Z]{3}$/) ||
      !matches(payload.quoteCurrency, /^[A-Z]{3}$/) ||
      !matches(payload.provider, /^[A-Za-z0-9._:-]{1,64}$/) ||
      typeof payload.effectiveAt !== 'string' ||
      Number.isNaN(Date.parse(payload.effectiveAt)) ||
      typeof payload.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(payload.occurredAt))
    )
      invalid();
  } else {
    exact(payload, ['resource', 'code', 'version', 'occurredAt', 'changedFields']);
    if (
      typeof payload.resource !== 'string' ||
      !['currency', 'country'].includes(payload.resource) ||
      !matches(payload.code, /^[A-Z]{2,3}$/) ||
      !Number.isInteger(payload.version) ||
      Number(payload.version) < 1 ||
      typeof payload.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(payload.occurredAt))
    )
      invalid();
    changes(payload.changedFields, referenceFields);
  }

  return Object.freeze({ ...payload });
}
