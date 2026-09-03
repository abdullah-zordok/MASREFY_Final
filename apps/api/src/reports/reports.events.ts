import {
  DELIVERY_CHANNELS,
  REPORT_FORMATS,
  REPORT_TYPES,
  isReportUuid,
  type DeliveryChannel,
  type ReportFormat,
  type ReportType,
} from './reports.schemas';

export const REPORT_EVENTS = [
  'report.requested',
  'report.ready',
  'report.delivery_succeeded',
  'report.delivery_failed',
  'report.expired',
  'export.ready',
] as const;

export type ReportEventType = (typeof REPORT_EVENTS)[number];

const contracts: Record<ReportEventType, readonly string[]> = {
  'report.requested': ['attemptId', 'reportType', 'format', 'delivery', 'ledgerVersion'],
  'report.ready': ['attemptId', 'format', 'bytes', 'expiresAt'],
  'report.delivery_succeeded': ['attemptId', 'acceptedByServerAt'],
  'report.delivery_failed': ['attemptId', 'errorCode', 'retryable', 'attemptCount'],
  'report.expired': ['attemptId', 'expiredAt'],
  'export.ready': ['attemptId', 'format', 'bytes', 'expiresAt', 'adminAggregate'],
};

function invalid(): never {
  throw new Error('REPORT_EVENT_INVALID');
}

function timestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function buildReportEvent(
  type: string,
  data: Record<string, unknown>,
): { type: ReportEventType; schemaVersion: 1; data: Record<string, unknown> } {
  if (!REPORT_EVENTS.includes(type as ReportEventType)) invalid();
  const eventType = type as ReportEventType;
  const keys = contracts[eventType];
  if (
    Object.keys(data).length !== keys.length ||
    Object.keys(data).some((key) => !keys.includes(key)) ||
    !isReportUuid(data.attemptId)
  ) {
    invalid();
  }
  if (
    eventType === 'report.requested' &&
    (!REPORT_TYPES.includes(data.reportType as ReportType) ||
      !REPORT_FORMATS.includes(data.format as ReportFormat) ||
      !DELIVERY_CHANNELS.includes(data.delivery as DeliveryChannel) ||
      !Number.isSafeInteger(data.ledgerVersion) ||
      Number(data.ledgerVersion) < 0)
  ) {
    invalid();
  }
  if (
    ['report.ready', 'export.ready'].includes(eventType) &&
    (!REPORT_FORMATS.includes(data.format as ReportFormat) ||
      !Number.isSafeInteger(data.bytes) ||
      Number(data.bytes) < 0 ||
      !timestamp(data.expiresAt))
  ) {
    invalid();
  }
  if (eventType === 'export.ready' && typeof data.adminAggregate !== 'boolean') invalid();
  if (eventType === 'report.delivery_succeeded' && !timestamp(data.acceptedByServerAt)) invalid();
  if (
    eventType === 'report.delivery_failed' &&
    (typeof data.errorCode !== 'string' ||
      !/^[A-Z0-9_]{1,80}$/.test(data.errorCode) ||
      typeof data.retryable !== 'boolean' ||
      !Number.isInteger(data.attemptCount) ||
      Number(data.attemptCount) < 1)
  ) {
    invalid();
  }
  if (eventType === 'report.expired' && !timestamp(data.expiredAt)) invalid();
  return { type: eventType, schemaVersion: 1, data: structuredClone(data) };
}
