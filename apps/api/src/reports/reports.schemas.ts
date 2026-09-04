import type { ReportPeriod } from './reports.period';

export const REPORT_TYPES = [
  'financial_summary',
  'category_spending',
  'budget_performance',
  'obligation_progress',
  'savings_progress',
  'account_activity',
] as const;
export const REPORT_FORMATS = ['json', 'csv', 'pdf'] as const;
export const DELIVERY_CHANNELS = ['download', 'email'] as const;
export const REPORT_PERIODS = ['monthly', 'three_months', 'half_year', 'annual'] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = (typeof REPORT_FORMATS)[number];
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface ReportSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  ledgerVersion: number;
  reportType: ReportType;
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
    kind: ReportPeriod;
  };
  format: ReportFormat;
  delivery: DeliveryChannel;
  currencyCode: string;
  dataState: 'complete' | 'empty' | 'partial' | 'estimated';
  evidence: readonly Record<string, unknown>[];
  summary: Record<string, unknown>;
  breakdowns: readonly Record<string, unknown>[];
  detailedRows: readonly Record<string, unknown>[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_KEY =
  /^(?:userId|recipient|email|signedUrl|downloadUrl|storageRef|password|secret|token|providerPayload|smtpResponse)$/i;

function invalid(code = 'REPORT_SNAPSHOT_INVALID'): never {
  throw new Error(code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}

function isoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function localDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function safeJson(value: unknown, depth = 0): void {
  if (depth > 8) invalid();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) invalid();
    return;
  }
  if (typeof value === 'string') {
    // eslint-disable-next-line no-control-regex -- snapshots reject controls and bidi overrides
    if (value.length > 1_000 || /[\u0000\u202a-\u202e\u2066-\u2069]/.test(value)) invalid();
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100_000) invalid();
    value.forEach((entry) => {
      safeJson(entry, depth + 1);
    });
    return;
  }
  const object = record(value);
  if (Object.keys(object).length > 100) invalid();
  for (const [key, entry] of Object.entries(object)) {
    if (FORBIDDEN_KEY.test(key)) invalid();
    safeJson(entry, depth + 1);
  }
}

export function isReportUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function parseReportSnapshot(value: unknown, maximumBytes = 1_048_576): ReportSnapshot {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    invalid();
  }
  if (Buffer.byteLength(encoded, 'utf8') > maximumBytes) invalid('REPORT_SNAPSHOT_TOO_LARGE');
  const input = record(value);
  exact(input, [
    'schemaVersion',
    'generatedAt',
    'ledgerVersion',
    'reportType',
    'period',
    'format',
    'delivery',
    'currencyCode',
    'dataState',
    'evidence',
    'summary',
    'breakdowns',
    'detailedRows',
  ]);
  const period = record(input.period);
  exact(period, ['startDate', 'endDate', 'timezone', 'kind']);
  if (
    input.schemaVersion !== 1 ||
    !isoTimestamp(input.generatedAt) ||
    typeof input.ledgerVersion !== 'number' ||
    !Number.isSafeInteger(input.ledgerVersion) ||
    input.ledgerVersion < 0 ||
    !REPORT_TYPES.includes(input.reportType as ReportType) ||
    !REPORT_FORMATS.includes(input.format as ReportFormat) ||
    !DELIVERY_CHANNELS.includes(input.delivery as DeliveryChannel) ||
    typeof input.currencyCode !== 'string' ||
    !/^[A-Z]{3}$/.test(input.currencyCode) ||
    !['complete', 'empty', 'partial', 'estimated'].includes(String(input.dataState)) ||
    !localDate(period.startDate) ||
    !localDate(period.endDate) ||
    period.startDate > period.endDate ||
    typeof period.timezone !== 'string' ||
    period.timezone.length < 1 ||
    period.timezone.length > 64 ||
    !REPORT_PERIODS.includes(period.kind as ReportPeriod) ||
    !Array.isArray(input.evidence) ||
    input.evidence.length > 32 ||
    !Array.isArray(input.breakdowns) ||
    input.breakdowns.length > 100 ||
    !Array.isArray(input.detailedRows) ||
    input.detailedRows.length > 100_000
  ) {
    invalid();
  }
  record(input.summary);
  safeJson(input);
  return structuredClone(input) as unknown as ReportSnapshot;
}
