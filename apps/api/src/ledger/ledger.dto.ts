const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
// eslint-disable-next-line no-control-regex -- public money input rejects control and bidi text
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const MAX_MINOR = Number.MAX_SAFE_INTEGER;

function invalid(): never {
  throw Object.assign(new Error('VALIDATION_FAILED'), { code: 'VALIDATION_FAILED' });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exact(input: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(input).some((key) => !keys.includes(key))) invalid();
}

function text(value: unknown, max: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) invalid();
  return normalized;
}

function optionalText(value: unknown, max: number): string | null {
  return value === undefined ? null : text(value, max, true);
}

function timestamp(value: unknown, now: Date): string {
  if (typeof value !== 'string') invalid();
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.valueOf() < Date.parse('1900-01-01T00:00:00.000Z') ||
    parsed.valueOf() > now.valueOf() + 300_000
  )
    invalid();
  return parsed.toISOString();
}

export function normalizeTransactionId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid();
  return value;
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid();
  return value;
}

export interface CreateTransactionCommand extends Record<string, unknown> {
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
  title: string;
  merchant: string | null;
  paymentMethod: string | null;
  note: string | null;
  occurredAt: string;
  source: string;
  externalRef: string | null;
}

export function normalizeCreateTransaction(
  value: unknown,
  now = new Date(),
): CreateTransactionCommand {
  const input = record(value);
  exact(input, [
    'kind',
    'amountMinor',
    'currency',
    'accountId',
    'categoryId',
    'title',
    'merchant',
    'paymentMethod',
    'note',
    'occurredAt',
    'source',
    'externalRef',
  ]);
  if (
    (input.kind !== 'income' && input.kind !== 'expense') ||
    typeof input.amountMinor !== 'number' ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.amountMinor > MAX_MINOR ||
    typeof input.currency !== 'string' ||
    !CURRENCY.test(input.currency) ||
    typeof input.accountId !== 'string' ||
    !UUID.test(input.accountId) ||
    (input.categoryId !== undefined &&
      input.categoryId !== null &&
      (typeof input.categoryId !== 'string' || !UUID.test(input.categoryId)))
  )
    invalid();
  return {
    kind: input.kind,
    amountMinor: input.amountMinor,
    currency: input.currency,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    title: text(input.title, 160) as string,
    merchant: optionalText(input.merchant, 160),
    paymentMethod: optionalText(input.paymentMethod, 80),
    note: optionalText(input.note, 500),
    occurredAt: timestamp(input.occurredAt, now),
    source: input.source === undefined ? 'manual' : (text(input.source, 64) as string),
    externalRef: optionalText(input.externalRef, 200),
  };
}

export function normalizeTransfer(value: unknown, now = new Date()): Record<string, unknown> {
  const input = record(value);
  exact(input, [
    'sourceAccountId',
    'destinationAccountId',
    'amountMinor',
    'currency',
    'feeMinor',
    'feeAccountId',
    'occurredAt',
    'title',
    'note',
  ]);
  const amount = input.amountMinor;
  const fee = input.feeMinor ?? 0;
  if (
    typeof input.sourceAccountId !== 'string' ||
    !UUID.test(input.sourceAccountId) ||
    typeof input.destinationAccountId !== 'string' ||
    !UUID.test(input.destinationAccountId) ||
    input.sourceAccountId === input.destinationAccountId ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > MAX_MINOR ||
    typeof fee !== 'number' ||
    !Number.isSafeInteger(fee) ||
    fee < 0 ||
    fee > amount ||
    typeof input.currency !== 'string' ||
    !CURRENCY.test(input.currency) ||
    (input.feeAccountId !== undefined &&
      (typeof input.feeAccountId !== 'string' || !UUID.test(input.feeAccountId)))
  )
    invalid();
  return {
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    amountMinor: amount,
    currency: input.currency,
    feeMinor: fee,
    feeAccountId: input.feeAccountId ?? input.sourceAccountId,
    occurredAt: timestamp(input.occurredAt, now),
    title: text(input.title, 160),
    note: optionalText(input.note, 500),
  };
}

export function normalizeRevision(
  value: unknown,
  now = new Date(),
): {
  expectedVersion: number;
  reason: string;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  const fields = [
    'amountMinor',
    'accountId',
    'categoryId',
    'title',
    'merchant',
    'paymentMethod',
    'note',
    'occurredAt',
  ];
  exact(input, ['expectedVersion', 'reason', ...fields]);
  if (!fields.some((field) => field in input)) invalid();
  const patch: Record<string, unknown> = {};
  if ('amountMinor' in input) {
    if (
      typeof input.amountMinor !== 'number' ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor < 1 ||
      input.amountMinor > MAX_MINOR
    )
      invalid();
    patch.amountMinor = input.amountMinor;
  }
  if ('accountId' in input) patch.accountId = normalizeTransactionId(input.accountId);
  if ('categoryId' in input) {
    if (input.categoryId !== null) normalizeTransactionId(input.categoryId);
    patch.categoryId = input.categoryId;
  }
  if ('title' in input) patch.title = text(input.title, 160);
  for (const [field, max] of [
    ['merchant', 160],
    ['paymentMethod', 80],
    ['note', 500],
  ] as const)
    if (field in input) patch[field] = text(input[field], max, true);
  if ('occurredAt' in input) patch.occurredAt = timestamp(input.occurredAt, now);
  return {
    expectedVersion: version(input.expectedVersion),
    reason: text(input.reason, 500) as string,
    patch,
  };
}

export function normalizeRefund(value: unknown, now = new Date()): Record<string, unknown> {
  const input = record(value);
  exact(input, ['expectedVersion', 'amountMinor', 'accountId', 'occurredAt', 'reason']);
  if (
    typeof input.amountMinor !== 'number' ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.amountMinor > MAX_MINOR
  )
    invalid();
  return {
    expectedVersion: version(input.expectedVersion),
    amountMinor: input.amountMinor,
    accountId: input.accountId === undefined ? null : normalizeTransactionId(input.accountId),
    occurredAt: timestamp(input.occurredAt, now),
    reason: text(input.reason, 500),
  };
}

export function normalizeReverse(value: unknown, now = new Date()): Record<string, unknown> {
  const input = record(value);
  exact(input, ['expectedVersion', 'occurredAt', 'reason']);
  return {
    expectedVersion: version(input.expectedVersion),
    occurredAt:
      input.occurredAt === undefined ? now.toISOString() : timestamp(input.occurredAt, now),
    reason: text(input.reason, 500),
  };
}

export function normalizeDelete(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['expectedVersion', 'reason']);
  return { expectedVersion: version(input.expectedVersion), reason: text(input.reason, 500) };
}

export function normalizeRestore(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['expectedVersion']);
  return { expectedVersion: version(input.expectedVersion) };
}

const KINDS = new Set([
  'income',
  'expense',
  'transfer',
  'opening',
  'refund',
  'reversal',
  'adjustment',
]);
const STATUSES = new Set(['draft', 'pending', 'confirmed', 'reversed', 'deleted']);

export interface LedgerReadQuery {
  cursor: string | null;
  limit: number;
  accountId: string | null;
  categoryId: string | null;
  kind: string | null;
  status: string | null;
  source: string | null;
  from: string | null;
  to: string | null;
  query: string | null;
}

export function encodeLedgerCursor(value: { occurredAt: string; id: string }): string {
  const occurredAt = readTimestamp(value.occurredAt);
  const id = normalizeTransactionId(value.id);
  return Buffer.from(JSON.stringify([occurredAt, id])).toString('base64url');
}

export function decodeLedgerCursor(value: string): { occurredAt: string; id: string } {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    invalid();
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) invalid();
    return { occurredAt: readTimestamp(decoded[0]), id: normalizeTransactionId(decoded[1]) };
  } catch {
    invalid();
  }
}

function readTimestamp(value: unknown): string {
  if (typeof value !== 'string') invalid();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) invalid();
  return value;
}

function optionalUuid(value: unknown): string | null {
  return value === undefined ? null : normalizeTransactionId(value);
}

function optionalReadText(value: unknown, max: number): string | null {
  if (value === undefined) return null;
  return text(value, max);
}

export function normalizeLedgerRead(value: unknown): LedgerReadQuery {
  const input = record(value);
  exact(input, [
    'cursor',
    'limit',
    'accountId',
    'categoryId',
    'kind',
    'status',
    'source',
    'from',
    'to',
    'query',
  ]);
  const limitValue = input.limit === undefined ? 25 : Number(input.limit);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) invalid();
  const from = input.from === undefined ? null : readTimestamp(input.from);
  const to = input.to === undefined ? null : readTimestamp(input.to);
  if (from && to && from > to) invalid();
  if (input.kind !== undefined && (typeof input.kind !== 'string' || !KINDS.has(input.kind)))
    invalid();
  if (
    input.status !== undefined &&
    (typeof input.status !== 'string' || !STATUSES.has(input.status))
  )
    invalid();
  const cursor = input.cursor === undefined ? null : readCursor(input.cursor);
  if (cursor !== null) decodeLedgerCursor(cursor);
  return {
    cursor,
    limit: limitValue,
    accountId: optionalUuid(input.accountId),
    categoryId: optionalUuid(input.categoryId),
    kind: input.kind ?? null,
    status: input.status ?? null,
    source: optionalReadText(input.source, 64),
    from,
    to,
    query: optionalReadText(input.query, 100),
  };
}

function readCursor(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

export function assertTransactionDetail(value: unknown): void {
  const input = record(value);
  const transaction = record(input.transaction);
  normalizeTransactionId(transaction.id);
  if (
    !Array.isArray(input.postings) ||
    input.postings.length > 1000 ||
    !Array.isArray(input.revisions) ||
    input.revisions.length > 1000 ||
    typeof input.ledgerVersion !== 'number' ||
    !Number.isSafeInteger(input.ledgerVersion) ||
    input.ledgerVersion < 0
  )
    invalid();
  text(input.requestId, 128);
}

export function assertAccountSummary(value: unknown): void {
  const input = record(value);
  normalizeTransactionId(input.accountId);
  if (
    typeof input.currency !== 'string' ||
    !CURRENCY.test(input.currency) ||
    !Array.isArray(input.recentTransactions) ||
    input.recentTransactions.length > 25 ||
    typeof input.ledgerVersion !== 'number' ||
    !Number.isSafeInteger(input.ledgerVersion) ||
    input.ledgerVersion < 0
  )
    invalid();
  record(input.balance);
  text(input.requestId, 128);
}
