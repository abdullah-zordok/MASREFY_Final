export const TRACKING_EVENT_NAMES = Object.freeze([
  'tracking.preference.updated.v1',
  'tracking.rule.changed.v1',
  'import.session.changed.v1',
  'import.item.changed.v1',
  'tracking.review.requested.v1',
  'tracking.review.resolved.v1',
  'tracking.duplicate.detected.v1',
  'tracking.duplicate.resolved.v1',
  'tracking.feedback.recorded.v1',
  'parser.rule.version.changed.v1',
  'parser.corpus.completed.v1',
  'unsupported.format.recorded.v1',
  'tracking.admin.action.v1',
] as const);

const names = new Set<string>(TRACKING_EVENT_NAMES);
const allowed = new Set([
  'action',
  'candidateId',
  'attempt',
  'failed',
  'failedCount',
  'feedbackId',
  'historyId',
  'itemCount',
  'itemId',
  'kind',
  'occurredAt',
  'occurrenceCount',
  'preferenceId',
  'passed',
  'requestId',
  'resourceId',
  'resourceKind',
  'resolution',
  'reviewRequired',
  'reviewId',
  'ruleId',
  'ruleKind',
  'sessionId',
  'status',
  'scoreBand',
  'existingTransactionId',
  'transactionId',
  'version',
  'versionId',
  'versionNumber',
  'unsupportedFormatId',
  'enabled',
]);
const forbidden =
  /raw|payload|body|sender|keyword|merchant|amount|storage|token|definition|fixture|error/i;

export function buildTrackingEvent(
  name: string,
  payload: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  if (
    !names.has(name) ||
    Buffer.byteLength(JSON.stringify(payload)) > 4096 ||
    Object.keys(payload).some((key) => !allowed.has(key) || forbidden.test(key))
  )
    throw new Error('TRACKING_EVENT_INVALID');
  return Object.freeze({ ...payload });
}
