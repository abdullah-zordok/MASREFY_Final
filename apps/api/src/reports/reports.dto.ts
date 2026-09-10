import {
  DELIVERY_CHANNELS,
  REPORT_FORMATS,
  REPORT_PERIODS,
  REPORT_TYPES,
  type DeliveryChannel,
  type ReportFormat,
  type ReportType,
} from './reports.schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex -- public inputs reject controls and bidi overrides
const UNSAFE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const REPORT_STATUSES = [
  'queued',
  'generating',
  'ready',
  'sending',
  'delivered',
  'failed',
  'expired',
] as const;

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

function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) invalid();
  return value;
}

function localDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
}

function email(value: unknown): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim().normalize('NFKC').toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    UNSAFE.test(normalized) ||
    !EMAIL.test(normalized)
  ) {
    invalid();
  }
  return normalized;
}

function timezone(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || UNSAFE.test(value))
    invalid();
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
  } catch {
    invalid();
  }
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  )
    invalid();
  return parsed;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum || UNSAFE.test(normalized))
    invalid();
  return normalized;
}

function optionalUuid(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID.test(value)) invalid();
  return value.toLowerCase();
}

export function normalizeSummaryQuery(
  value: unknown,
  requireType: boolean,
): {
  type: ReportType;
  period: (typeof REPORT_PERIODS)[number];
  anchorDate: string | null;
  currency: string | null;
} {
  const input = record(value);
  exact(
    input,
    requireType
      ? ['type', 'period', 'anchorDate', 'currency']
      : ['period', 'anchorDate', 'currency'],
  );
  if (requireType && input.type === undefined) invalid();
  const currency = input.currency === undefined ? null : text(input.currency, 3, 3);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) invalid();
  return {
    type: requireType ? oneOf(input.type, REPORT_TYPES) : 'financial_summary',
    period: oneOf(input.period, REPORT_PERIODS),
    anchorDate: input.anchorDate === undefined ? null : localDate(input.anchorDate),
    currency,
  };
}

export function normalizeCreateReport(value: unknown): {
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  format: ReportFormat;
  delivery: DeliveryChannel;
  recipient: string | null;
} {
  const input = record(value);
  exact(input, ['type', 'periodStart', 'periodEnd', 'format', 'delivery', 'recipient']);
  const periodStart = localDate(input.periodStart);
  const periodEnd = localDate(input.periodEnd);
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const maximumEnd = new Date(
    Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()) - 86_400_000,
  );
  if (periodEnd < periodStart || new Date(`${periodEnd}T00:00:00.000Z`) > maximumEnd) invalid();
  const delivery = oneOf(input.delivery, DELIVERY_CHANNELS);
  const recipient =
    input.recipient === undefined || input.recipient === null ? null : email(input.recipient);
  if ((delivery === 'email') !== Boolean(recipient)) invalid();
  return {
    type: oneOf(input.type, REPORT_TYPES),
    periodStart,
    periodEnd,
    format: oneOf(input.format, REPORT_FORMATS),
    delivery,
    recipient,
  };
}

export function normalizeReportList(value: unknown): {
  cursor: string | null;
  limit: number;
  scheduleId: string | null;
  status: (typeof REPORT_STATUSES)[number] | null;
} {
  const input = record(value);
  exact(input, ['cursor', 'limit', 'scheduleId', 'status']);
  return {
    cursor: input.cursor === undefined ? null : text(input.cursor, 1, 512),
    limit: input.limit === undefined ? 25 : integer(input.limit, 1, 100),
    scheduleId: optionalUuid(input.scheduleId),
    status: input.status === undefined ? null : oneOf(input.status, REPORT_STATUSES),
  };
}

export function normalizeVerifyRecipient(value: unknown): { email: string } {
  const input = record(value);
  exact(input, ['email']);
  return { email: email(input.email) };
}

export function normalizeScheduleCreate(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['reportType', 'frequency', 'timezone', 'deliveryChannel', 'recipient', 'enabled']);
  const deliveryChannel = oneOf(input.deliveryChannel, DELIVERY_CHANNELS);
  const recipient =
    input.recipient === undefined || input.recipient === null ? null : email(input.recipient);
  if ((deliveryChannel === 'email') !== Boolean(recipient)) invalid();
  return {
    reportType: oneOf(input.reportType, REPORT_TYPES),
    frequency: oneOf(input.frequency, REPORT_PERIODS),
    timezone: timezone(input.timezone),
    deliveryChannel,
    recipient,
    enabled: boolean(input.enabled),
  };
}

export function normalizeSchedulePatch(value: unknown): {
  expectedVersion: number;
  patch: Record<string, unknown>;
} {
  const input = record(value);
  const fields = [
    'reportType',
    'frequency',
    'timezone',
    'deliveryChannel',
    'recipient',
    'enabled',
  ] as const;
  exact(input, ['expectedVersion', ...fields]);
  const patch: Record<string, unknown> = {};
  if (input.reportType !== undefined) patch.reportType = oneOf(input.reportType, REPORT_TYPES);
  if (input.frequency !== undefined) patch.frequency = oneOf(input.frequency, REPORT_PERIODS);
  if (input.timezone !== undefined) patch.timezone = timezone(input.timezone);
  if (input.deliveryChannel !== undefined)
    patch.deliveryChannel = oneOf(input.deliveryChannel, DELIVERY_CHANNELS);
  if (input.recipient !== undefined)
    patch.recipient = input.recipient === null ? null : email(input.recipient);
  if (input.enabled !== undefined) patch.enabled = boolean(input.enabled);
  if (Object.keys(patch).length === 0) invalid();
  return { expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), patch };
}

export function normalizeAdminExportRequest(value: unknown): Record<string, unknown> {
  const input = record(value);
  exact(input, ['exportType', 'period', 'platform', 'format', 'userId', 'supportReason']);
  const exportType = oneOf(input.exportType, [
    'overview',
    'platform_analytics',
    'activity',
    'user_report',
  ] as const);
  const result: Record<string, unknown> = {
    exportType,
    period: oneOf(input.period, ['7d', '30d', '90d'] as const),
    platform:
      input.platform === undefined
        ? 'all'
        : oneOf(input.platform, ['all', 'ios', 'android'] as const),
    format: oneOf(input.format, REPORT_FORMATS),
  };
  if (exportType === 'user_report') {
    result.userId = text(input.userId, 1, 128);
    result.supportReason = text(input.supportReason, 10, 500);
  } else if (input.userId !== undefined || input.supportReason !== undefined) {
    invalid();
  }
  return result;
}

export function normalizeAdminOverviewQuery(
  value: unknown,
  activity = false,
): Record<string, unknown> {
  const input = record(value);
  exact(
    input,
    activity
      ? ['platform', 'period', 'locale', 'page', 'pageSize']
      : ['platform', 'period', 'locale'],
  );
  return {
    platform:
      input.platform === undefined
        ? 'all'
        : oneOf(input.platform, ['all', 'ios', 'android'] as const),
    period: input.period === undefined ? '30d' : oneOf(input.period, ['7d', '30d', '90d'] as const),
    locale: input.locale === undefined ? 'ar' : oneOf(input.locale, ['ar', 'en'] as const),
    ...(activity
      ? {
          page: input.page === undefined ? 1 : integer(input.page, 1, 10_000),
          pageSize: input.pageSize === undefined ? 10 : integer(input.pageSize, 1, 25),
        }
      : {}),
  };
}
