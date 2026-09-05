export const ENGAGEMENT_SOURCE_EVENTS = new Set<string>([
  'transaction.created',
  'transfer.created',
  'transaction.refunded',
  'transaction.reversed',
  'transaction.revised',
  'transaction.deleted',
  'transaction.restored',
  'balance.changed',
  'ledger.reconciliation_failed',
  'planning.salary_receipt_expected',
  'planning.salary_receipt_received',
  'planning.obligation_overdue',
  'planning.obligation_completed',
  'planning.savings_goal_completed',
  'tracking.review.requested.v1',
  'tracking.duplicate.detected.v1',
  'unsupported.format.recorded.v1',
  'voice.proposal_ready.v1',
  'assistant.response_ready.v1',
  'ai.budget_threshold.v1',
  'report.ready',
  'report.delivery_failed',
  'export.ready',
]);

export const ENGAGEMENT_JOB_NAMES = new Set([
  'notification.dispatch',
  'notification.delivery.retry',
  'notification.campaign.expand',
  'notification.expire',
  'support-attachment.scan',
] as const);

export const ENGAGEMENT_EVENT_NAMES = new Set([
  'notification.delivered',
  'notification.failed',
  'notification.read',
  'notification.acted',
  'support.ticket_opened',
  'support.message_added',
  'support.status_changed',
  'content.published',
  'content.retired',
  'feedback.received',
] as const);

const forbidden =
  /amount|account|description|message|body|note|token|provider|filename|audience|reporter|resource/i;

export function buildEngagementEvent(
  type: string,
  data: Record<string, string | number | boolean | null>,
): Readonly<{
  type: string;
  schemaVersion: 1;
  data: Readonly<Record<string, string | number | boolean | null>>;
}> {
  if (
    !ENGAGEMENT_EVENT_NAMES.has(type as never) ||
    Object.keys(data).some((key) => forbidden.test(key)) ||
    Buffer.byteLength(JSON.stringify(data)) > 4096
  ) {
    throw new Error('ENGAGEMENT_EVENT_INVALID');
  }
  return Object.freeze({ type, schemaVersion: 1, data: Object.freeze({ ...data }) });
}
