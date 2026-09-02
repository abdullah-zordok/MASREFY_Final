const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINOR = /^(?:0|[1-9]\d{0,18}|-[1-9]\d{0,18})$/;
// eslint-disable-next-line no-control-regex -- public text rejects control and bidi characters
const UNSAFE_TEXT = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const MAX_BIGINT = 9223372036854775807n;
const MIN_BIGINT = -9223372036854775808n;

type MinorKind = 'positive' | 'nonnegative' | 'signed-nonzero';
type PlanningCursor = { at: string; id: string };

function invalid(): never {
  throw Object.assign(new Error('VALIDATION_FAILED'), { code: 'VALIDATION_FAILED' });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}

function safeText(value: unknown, maximum = 1000): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || UNSAFE_TEXT.test(normalized)) invalid();
  return normalized;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') invalid();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) invalid();
  return value;
}

export function normalizePlanningId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid();
  return value.toLowerCase();
}

export function normalizePlanningDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
}

export function normalizePlanningPeriod(value: unknown): { start: string; end: string } {
  if (typeof value !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) invalid();
  const [year, month] = value.split('-').map(Number);
  const end = new Date(Date.UTC(year as number, month as number, 0)).toISOString().slice(0, 10);
  return { start: `${value}-01`, end };
}

export function normalizeMinor(value: unknown, kind: MinorKind): bigint {
  if (typeof value !== 'string' || !MINOR.test(value)) invalid();
  const normalized = BigInt(value);
  if (
    normalized < MIN_BIGINT ||
    normalized > MAX_BIGINT ||
    (kind === 'positive' && normalized <= 0n) ||
    (kind === 'nonnegative' && normalized < 0n) ||
    (kind === 'signed-nonzero' && normalized === 0n)
  )
    invalid();
  return normalized;
}

export function minorString(value: bigint): string {
  if (typeof value !== 'bigint' || value < MIN_BIGINT || value > MAX_BIGINT) invalid();
  return value.toString();
}

export function normalizeLifecycle<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid();
  return value;
}

export function normalizeStringArray(
  value: unknown,
  maximumEntries: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maximumEntries) invalid();
  const normalized = value.map((entry) => safeText(entry, maximumLength));
  if (new Set(normalized).size !== normalized.length) invalid();
  return normalized;
}

export function encodePlanningCursor(value: PlanningCursor): string {
  return Buffer.from(JSON.stringify([timestamp(value.at), normalizePlanningId(value.id)])).toString(
    'base64url',
  );
}

export function decodePlanningCursor(value: unknown): PlanningCursor {
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
    return { at: timestamp(decoded[0]), id: normalizePlanningId(decoded[1]) };
  } catch {
    invalid();
  }
}

export function normalizePlanningList(value: unknown): { cursor: string | null; limit: number } {
  const input = record(value);
  exact(input, ['cursor', 'limit']);
  const limit = input.limit === undefined ? 25 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  const cursor = input.cursor === undefined ? null : safeText(input.cursor, 512);
  if (cursor) decodePlanningCursor(cursor);
  return { cursor, limit };
}

export function normalizeVersionedPatch(
  value: unknown,
  fields: readonly string[],
): { expectedVersion: number; patch: Record<string, unknown> } {
  const input = record(value);
  exact(input, ['expectedVersion', ...fields]);
  if (
    typeof input.expectedVersion !== 'number' ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  )
    invalid();
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in input)) continue;
    patch[field] = typeof input[field] === 'string' ? safeText(input[field]) : input[field];
  }
  if (Object.keys(patch).length === 0) invalid();
  return { expectedVersion: input.expectedVersion, patch };
}

const SALARY_FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'custom'] as const;
const SALARY_STATUSES = ['active', 'paused', 'archived'] as const;

function optionalId(value: unknown): string | null {
  return value === undefined || value === null ? null : normalizePlanningId(value);
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    invalid();
  return value;
}

function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) invalid();
  return value;
}

function salarySchedule(
  frequency: (typeof SALARY_FREQUENCIES)[number],
  expectedDay: unknown,
  customIntervalDays: unknown,
): { expectedDay: number | null; customIntervalDays: number | null } {
  if (frequency === 'monthly')
    return { expectedDay: integer(expectedDay, 1, 31), customIntervalDays: null };
  if (frequency === 'weekly' || frequency === 'biweekly')
    return { expectedDay: integer(expectedDay, 0, 6), customIntervalDays: null };
  return { expectedDay: null, customIntervalDays: integer(customIntervalDays, 1, 366) };
}

export function normalizeSalaryCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, [
    'name',
    'amountMinor',
    'currencyCode',
    'frequency',
    'expectedDay',
    'customIntervalDays',
    'accountId',
    'automaticDetectionEnabled',
  ]);
  const frequency = normalizeLifecycle(input.frequency, SALARY_FREQUENCIES);
  if (
    input.automaticDetectionEnabled !== undefined &&
    typeof input.automaticDetectionEnabled !== 'boolean'
  )
    invalid();
  return {
    name: safeText(input.name, 120),
    amountMinor: minorString(normalizeMinor(input.amountMinor, 'positive')),
    currencyCode: currency(input.currencyCode),
    frequency,
    ...salarySchedule(frequency, input.expectedDay, input.customIntervalDays),
    accountId: optionalId(input.accountId),
    automaticDetectionEnabled: input.automaticDetectionEnabled ?? false,
  };
}

export function normalizeSalaryPatch(value: unknown): {
  expectedVersion: number;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  exact(input, ['expectedVersion', 'patch']);
  const expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  const source = record(input.patch);
  const fields = [
    'name',
    'amountMinor',
    'currencyCode',
    'frequency',
    'expectedDay',
    'customIntervalDays',
    'accountId',
    'automaticDetectionEnabled',
    'status',
  ];
  exact(source, fields);
  if (Object.keys(source).length === 0) invalid();
  const patch: Record<string, unknown> = {};
  if ('name' in source) patch.name = safeText(source.name, 120);
  if ('amountMinor' in source)
    patch.amountMinor = minorString(normalizeMinor(source.amountMinor, 'positive'));
  if ('currencyCode' in source) patch.currencyCode = currency(source.currencyCode);
  if ('accountId' in source) patch.accountId = optionalId(source.accountId);
  if ('automaticDetectionEnabled' in source) {
    if (typeof source.automaticDetectionEnabled !== 'boolean') invalid();
    patch.automaticDetectionEnabled = source.automaticDetectionEnabled;
  }
  if ('status' in source) patch.status = normalizeLifecycle(source.status, SALARY_STATUSES);
  if ('frequency' in source || 'expectedDay' in source || 'customIntervalDays' in source) {
    if (!('frequency' in source)) invalid();
    const frequency = normalizeLifecycle(source.frequency, SALARY_FREQUENCIES);
    Object.assign(patch, {
      frequency,
      ...salarySchedule(frequency, source.expectedDay, source.customIntervalDays),
    });
  }
  return { expectedVersion, patch };
}

export function normalizeReceiptLink(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['transactionId', 'expectedAt', 'replacesReceiptId']);
  return {
    transactionId: normalizePlanningId(input.transactionId),
    expectedAt: timestamp(input.expectedAt),
    replacesReceiptId: optionalId(input.replacesReceiptId),
  };
}

export function normalizeVersionOnly(value: unknown): { expectedVersion: number } {
  const input = record(value);
  exact(input, ['expectedVersion']);
  return { expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER) };
}

export function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) invalid();
  return normalized;
}

const BUDGET_STATUSES = ['draft', 'active', 'paused', 'closed', 'deleted'] as const;
const ALLOCATION_STATUSES = ['active', 'paused', 'deleted'] as const;

function budgetPeriod(
  startValue: unknown,
  endValue: unknown,
): { periodStart: string; periodEnd: string } {
  const periodStart = normalizePlanningDate(startValue);
  const periodEnd = normalizePlanningDate(endValue);
  const duration =
    (Date.parse(`${periodEnd}T00:00:00.000Z`) - Date.parse(`${periodStart}T00:00:00.000Z`)) /
    86_400_000;
  if (duration < 0 || duration > 365) invalid();
  return { periodStart, periodEnd };
}

function boolean(value: unknown, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') invalid();
  return value;
}

export function normalizeBudgetCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, [
    'name',
    'currencyCode',
    'periodStart',
    'periodEnd',
    'totalMinor',
    'incomeTargetMinor',
    'savingsTargetMinor',
    'rolloverEnabled',
    'rolloverMinor',
    'copiedFromBudgetId',
  ]);
  const rolloverEnabled = boolean(input.rolloverEnabled, false);
  const rolloverMinor = minorString(normalizeMinor(input.rolloverMinor ?? '0', 'nonnegative'));
  if (!rolloverEnabled && rolloverMinor !== '0') invalid();
  return {
    name: safeText(input.name, 120),
    currencyCode: currency(input.currencyCode),
    ...budgetPeriod(input.periodStart, input.periodEnd),
    totalMinor: minorString(normalizeMinor(input.totalMinor, 'nonnegative')),
    incomeTargetMinor: minorString(normalizeMinor(input.incomeTargetMinor ?? '0', 'nonnegative')),
    savingsTargetMinor: minorString(normalizeMinor(input.savingsTargetMinor ?? '0', 'nonnegative')),
    rolloverEnabled,
    rolloverMinor,
    copiedFromBudgetId: optionalId(input.copiedFromBudgetId),
  };
}

export function normalizeBudgetPatch(value: unknown): {
  expectedVersion: number;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  exact(input, ['expectedVersion', 'patch']);
  const expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  const source = record(input.patch);
  const fields = [
    'name',
    'periodStart',
    'periodEnd',
    'totalMinor',
    'incomeTargetMinor',
    'savingsTargetMinor',
    'rolloverEnabled',
    'rolloverMinor',
    'status',
  ];
  exact(source, fields);
  if (Object.keys(source).length === 0) invalid();
  const patch: Record<string, unknown> = {};
  if ('name' in source) patch.name = safeText(source.name, 120);
  if ('periodStart' in source) patch.periodStart = normalizePlanningDate(source.periodStart);
  if ('periodEnd' in source) patch.periodEnd = normalizePlanningDate(source.periodEnd);
  for (const field of ['totalMinor', 'incomeTargetMinor', 'savingsTargetMinor', 'rolloverMinor'])
    if (field in source) patch[field] = minorString(normalizeMinor(source[field], 'nonnegative'));
  if ('rolloverEnabled' in source) patch.rolloverEnabled = boolean(source.rolloverEnabled);
  if (
    source.rolloverEnabled === false &&
    patch.rolloverMinor !== undefined &&
    patch.rolloverMinor !== '0'
  )
    invalid();
  if ('status' in source) patch.status = normalizeLifecycle(source.status, BUDGET_STATUSES);
  if ('periodStart' in source && 'periodEnd' in source)
    budgetPeriod(source.periodStart, source.periodEnd);
  return { expectedVersion, patch };
}

export function normalizeBudgetAllocations(value: unknown): {
  expectedVersion: number;
  allocations: Record<string, unknown>[];
} {
  const input = record(value);
  exact(input, ['expectedVersion', 'allocations']);
  const expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(input.allocations) || input.allocations.length > 100) invalid();
  const allocations = input.allocations.map((value) => {
    const allocation = record(value);
    exact(allocation, ['categoryId', 'limitMinor', 'rolloverMinor', 'alertThresholds', 'status']);
    if (
      !Array.isArray(allocation.alertThresholds) ||
      allocation.alertThresholds.length < 1 ||
      allocation.alertThresholds.length > 8
    )
      invalid();
    const alertThresholds = allocation.alertThresholds.map((threshold) =>
      integer(threshold, 1, 200),
    );
    if (alertThresholds.join(',') !== [...new Set(alertThresholds)].sort((a, b) => a - b).join(','))
      invalid();
    return {
      categoryId: normalizePlanningId(allocation.categoryId),
      limitMinor: minorString(normalizeMinor(allocation.limitMinor, 'nonnegative')),
      rolloverMinor: minorString(normalizeMinor(allocation.rolloverMinor, 'nonnegative')),
      alertThresholds,
      status: normalizeLifecycle(allocation.status, ALLOCATION_STATUSES),
    };
  });
  if (new Set(allocations.map(({ categoryId }) => categoryId)).size !== allocations.length)
    invalid();
  return { expectedVersion, allocations };
}

const OBLIGATION_DIRECTIONS = ['payable', 'receivable'] as const;
const OBLIGATION_TYPES = [
  'bill',
  'debt',
  'installment',
  'subscription',
  'other',
  'car_installment',
  'personal_loan',
  'buy_now_pay_later',
  'credit_card_installment',
  'rent',
  'utility',
  'custom',
] as const;
const SCHEDULE_KINDS = ['fixed_term', 'open_ended', 'irregular'] as const;
const OBLIGATION_FREQUENCIES = [
  'monthly',
  'weekly',
  'biweekly',
  'quarterly',
  'yearly',
  'custom',
  'irregular',
] as const;
const OBLIGATION_STATUSES = ['active', 'paused', 'completed', 'closed', 'archived'] as const;

function nullableText(value: unknown, maximum: number): string | null {
  return value === undefined || value === null ? null : safeText(value, maximum);
}

function obligationSchedule(input: Record<string, unknown>): Record<string, unknown> {
  const scheduleKind = normalizeLifecycle(input.scheduleKind, SCHEDULE_KINDS);
  const principal = normalizeMinor(input.principalMinor, 'nonnegative');
  const opening = normalizeMinor(input.openingPaidMinor ?? '0', 'nonnegative');
  if (opening > principal) invalid();
  const frequency = normalizeLifecycle(input.frequency, OBLIGATION_FREQUENCIES);
  let installmentAmountMinor: string | null = null;
  let installmentCount: number | null = null;
  if (scheduleKind === 'fixed_term') {
    if (principal <= 0n) invalid();
    const installment = normalizeMinor(input.installmentAmountMinor, 'positive');
    installmentAmountMinor = minorString(installment);
    installmentCount = integer(input.installmentCount, 1, 1200);
    if (installment * BigInt(installmentCount - 1) >= principal - opening) invalid();
  } else if (scheduleKind === 'open_ended') {
    installmentAmountMinor = minorString(normalizeMinor(input.installmentAmountMinor, 'positive'));
    if (input.installmentCount !== undefined && input.installmentCount !== null) invalid();
  } else {
    if (
      frequency !== 'irregular' ||
      input.installmentAmountMinor != null ||
      input.installmentCount != null
    )
      invalid();
  }
  let expectedDay: number | null = null;
  let customIntervalDays: number | null = null;
  if (['monthly', 'quarterly', 'yearly'].includes(frequency))
    expectedDay = integer(input.expectedDay, 1, 31);
  else if (['weekly', 'biweekly'].includes(frequency))
    expectedDay = integer(input.expectedDay, 0, 6);
  else if (frequency === 'custom') customIntervalDays = integer(input.customIntervalDays, 1, 366);
  else if (scheduleKind !== 'irregular') invalid();
  return {
    scheduleKind,
    principalMinor: minorString(principal),
    openingPaidMinor: minorString(opening),
    installmentAmountMinor,
    installmentCount,
    frequency,
    expectedDay,
    customIntervalDays,
  };
}

function obligationDates(
  startValue: unknown,
  endValue: unknown,
): { startDate: string; endDate: string | null } {
  const startDate = normalizePlanningDate(startValue);
  const endDate =
    endValue === undefined || endValue === null ? null : normalizePlanningDate(endValue);
  if (endDate !== null && endDate < startDate) invalid();
  return { startDate, endDate };
}

function obligationMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const automaticMatchingEnabled = boolean(input.automaticMatchingEnabled, false);
  const providerKeywords = normalizeStringArray(input.providerKeywords ?? [], 20, 80);
  const reminderTiming = nullableText(input.reminderTiming, 80);
  if (reminderTiming !== null && !/^[a-z][a-z0-9_.-]*$/.test(reminderTiming)) invalid();
  return {
    defaultAccountId: optionalId(input.defaultAccountId),
    automaticMatchingEnabled,
    provider: nullableText(input.provider, 120),
    providerKeywords,
    reminderTiming,
    notes: nullableText(input.notes, 1000),
  };
}

const OBLIGATION_CREATE_FIELDS = [
  'name',
  'direction',
  'type',
  'scheduleKind',
  'currencyCode',
  'principalMinor',
  'openingPaidMinor',
  'installmentAmountMinor',
  'installmentCount',
  'frequency',
  'expectedDay',
  'customIntervalDays',
  'startDate',
  'endDate',
  'defaultAccountId',
  'automaticMatchingEnabled',
  'provider',
  'providerKeywords',
  'reminderTiming',
  'notes',
] as const;

export function normalizeObligationCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, OBLIGATION_CREATE_FIELDS);
  return {
    name: safeText(input.name, 160),
    direction: normalizeLifecycle(input.direction, OBLIGATION_DIRECTIONS),
    type: normalizeLifecycle(input.type, OBLIGATION_TYPES),
    currencyCode: currency(input.currencyCode),
    ...obligationSchedule(input),
    ...obligationDates(input.startDate, input.endDate),
    ...obligationMetadata(input),
  };
}

export function normalizeObligationPatch(value: unknown): {
  expectedVersion: number;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  exact(input, ['expectedVersion', 'patch']);
  const expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  const source = record(input.patch);
  exact(source, [
    ...OBLIGATION_CREATE_FIELDS.filter((field) => field !== 'currencyCode'),
    'status',
  ]);
  if (Object.keys(source).length === 0) invalid();
  const patch: Record<string, unknown> = {};
  if ('name' in source) patch.name = safeText(source.name, 160);
  if ('direction' in source)
    patch.direction = normalizeLifecycle(source.direction, OBLIGATION_DIRECTIONS);
  if ('type' in source) patch.type = normalizeLifecycle(source.type, OBLIGATION_TYPES);
  for (const field of ['principalMinor', 'openingPaidMinor'])
    if (field in source) patch[field] = minorString(normalizeMinor(source[field], 'nonnegative'));
  if ('installmentAmountMinor' in source)
    patch.installmentAmountMinor =
      source.installmentAmountMinor === null
        ? null
        : minorString(normalizeMinor(source.installmentAmountMinor, 'positive'));
  if ('installmentCount' in source)
    patch.installmentCount =
      source.installmentCount === null ? null : integer(source.installmentCount, 1, 1200);
  if ('scheduleKind' in source)
    patch.scheduleKind = normalizeLifecycle(source.scheduleKind, SCHEDULE_KINDS);
  if ('frequency' in source)
    patch.frequency = normalizeLifecycle(source.frequency, OBLIGATION_FREQUENCIES);
  if ('expectedDay' in source)
    patch.expectedDay = source.expectedDay === null ? null : integer(source.expectedDay, 0, 31);
  if ('customIntervalDays' in source)
    patch.customIntervalDays =
      source.customIntervalDays === null ? null : integer(source.customIntervalDays, 1, 366);
  if ('startDate' in source) patch.startDate = normalizePlanningDate(source.startDate);
  if ('endDate' in source)
    patch.endDate = source.endDate === null ? null : normalizePlanningDate(source.endDate);
  if ('startDate' in source && 'endDate' in source)
    obligationDates(source.startDate, source.endDate);
  if ('defaultAccountId' in source) patch.defaultAccountId = optionalId(source.defaultAccountId);
  if ('automaticMatchingEnabled' in source)
    patch.automaticMatchingEnabled = boolean(source.automaticMatchingEnabled);
  if ('provider' in source) patch.provider = nullableText(source.provider, 120);
  if ('providerKeywords' in source)
    patch.providerKeywords = normalizeStringArray(source.providerKeywords, 20, 80);
  if ('reminderTiming' in source) {
    const reminderTiming = nullableText(source.reminderTiming, 80);
    if (reminderTiming !== null && !/^[a-z][a-z0-9_.-]*$/.test(reminderTiming)) invalid();
    patch.reminderTiming = reminderTiming;
  }
  if ('notes' in source) patch.notes = nullableText(source.notes, 1000);
  if ('status' in source) patch.status = normalizeLifecycle(source.status, OBLIGATION_STATUSES);
  return { expectedVersion, patch };
}

const PAYMENT_CASES = ['partial', 'full', 'over', 'early', 'settlement', 'correction'] as const;
const ALLOCATION_INTENTS = [
  'current',
  'later_installments',
  'principal',
  'correction',
  'settlement',
  'prepayment',
] as const;
const PAYMENT_SOURCES = ['manual', 'automatic', 'voice', 'platform_assisted'] as const;

export function normalizePaymentCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, [
    'transactionId',
    'expectedVersion',
    'paymentMethod',
    'paymentCase',
    'allocationIntent',
    'source',
    'allocations',
  ]);
  if (
    !Array.isArray(input.allocations) ||
    input.allocations.length < 1 ||
    input.allocations.length > 100
  )
    invalid();
  const allocations = input.allocations.map((value) => {
    const allocation = record(value);
    exact(allocation, ['scheduleItemId', 'amountMinor']);
    return {
      scheduleItemId: normalizePlanningId(allocation.scheduleItemId),
      amountMinor: minorString(normalizeMinor(allocation.amountMinor, 'positive')),
    };
  });
  if (new Set(allocations.map(({ scheduleItemId }) => scheduleItemId)).size !== allocations.length)
    invalid();
  allocations.reduce((sum, { amountMinor }) => {
    const next = sum + BigInt(amountMinor);
    if (next > MAX_BIGINT) invalid();
    return next;
  }, 0n);
  return {
    transactionId: normalizePlanningId(input.transactionId),
    expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER),
    paymentMethod: nullableText(input.paymentMethod, 80),
    paymentCase: normalizeLifecycle(input.paymentCase, PAYMENT_CASES),
    allocationIntent: normalizeLifecycle(input.allocationIntent, ALLOCATION_INTENTS),
    source: normalizeLifecycle(input.source, PAYMENT_SOURCES),
    allocations,
  };
}

export function normalizeMatchDecision(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['decision', 'expectedVersion', 'allocation']);
  const decision = normalizeLifecycle(input.decision, ['accepted', 'rejected'] as const);
  if ((decision === 'accepted') !== (input.allocation !== null && input.allocation !== undefined))
    invalid();
  return {
    decision,
    expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER),
    allocation: decision === 'accepted' ? normalizePaymentCreate(input.allocation) : null,
  };
}

const SAVINGS_STATUSES = ['active', 'paused', 'completed', 'deleted'] as const;

function iconKey(value: unknown): string | null {
  const icon = nullableText(value, 80);
  if (icon !== null && !/^[A-Za-z0-9._:-]+$/.test(icon)) invalid();
  return icon;
}

export function normalizeSavingsGoalCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, [
    'name',
    'targetMinor',
    'openingTrackedMinor',
    'currencyCode',
    'targetDate',
    'linkedAccountId',
    'iconKey',
    'emergencyFund',
  ]);
  return {
    name: safeText(input.name, 160),
    targetMinor: minorString(normalizeMinor(input.targetMinor, 'positive')),
    openingTrackedMinor: minorString(
      normalizeMinor(input.openingTrackedMinor ?? '0', 'nonnegative'),
    ),
    currencyCode: currency(input.currencyCode),
    targetDate:
      input.targetDate === undefined || input.targetDate === null
        ? null
        : normalizePlanningDate(input.targetDate),
    linkedAccountId: optionalId(input.linkedAccountId),
    iconKey: iconKey(input.iconKey),
    emergencyFund: boolean(input.emergencyFund, false),
  };
}

export function normalizeSavingsGoalPatch(value: unknown): {
  expectedVersion: number;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  exact(input, ['expectedVersion', 'patch']);
  const expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  const source = record(input.patch);
  exact(source, [
    'name',
    'targetMinor',
    'targetDate',
    'linkedAccountId',
    'iconKey',
    'emergencyFund',
    'status',
  ]);
  if (Object.keys(source).length === 0) invalid();
  const patch: Record<string, unknown> = {};
  if ('name' in source) patch.name = safeText(source.name, 160);
  if ('targetMinor' in source)
    patch.targetMinor = minorString(normalizeMinor(source.targetMinor, 'positive'));
  if ('targetDate' in source)
    patch.targetDate = source.targetDate === null ? null : normalizePlanningDate(source.targetDate);
  if ('linkedAccountId' in source) patch.linkedAccountId = optionalId(source.linkedAccountId);
  if ('iconKey' in source) patch.iconKey = iconKey(source.iconKey);
  if ('emergencyFund' in source) patch.emergencyFund = boolean(source.emergencyFund);
  if ('status' in source) patch.status = normalizeLifecycle(source.status, SAVINGS_STATUSES);
  return { expectedVersion, patch };
}

export function normalizeSavingsMovement(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['transactionId', 'expectedVersion', 'kind', 'amountMinor', 'replacesMovementId']);
  const kind = normalizeLifecycle(input.kind, [
    'contribution',
    'withdrawal',
    'adjustment',
  ] as const);
  const amount = normalizeMinor(input.amountMinor, 'signed-nonzero');
  const replacesMovementId = optionalId(input.replacesMovementId);
  if (
    (kind === 'contribution' && amount < 0n) ||
    (kind === 'withdrawal' && amount > 0n) ||
    (kind === 'adjustment') !== (replacesMovementId !== null)
  )
    invalid();
  return {
    transactionId: normalizePlanningId(input.transactionId),
    expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER),
    kind,
    amountMinor: minorString(amount),
    replacesMovementId,
  };
}
