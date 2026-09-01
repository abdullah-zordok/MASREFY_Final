export const PLANNING_EVENT_NAMES = Object.freeze([
  'planning.salary_profile_created',
  'planning.salary_profile_updated',
  'planning.salary_profile_archived',
  'planning.salary_receipt_expected',
  'planning.salary_receipt_received',
  'planning.salary_receipt_corrected',
  'planning.salary_receipt_undone',
  'planning.budget_created',
  'planning.budget_updated',
  'planning.budget_allocations_replaced',
  'planning.budget_closed',
  'planning.budget_deleted',
  'planning.obligation_created',
  'planning.obligation_updated',
  'planning.obligation_schedule_generated',
  'planning.obligation_overdue',
  'planning.obligation_completed',
  'planning.obligation_archived',
  'planning.obligation_payment_recorded',
  'planning.obligation_payment_reversed',
  'planning.payment_match_proposed',
  'planning.payment_match_accepted',
  'planning.payment_match_rejected',
  'planning.savings_goal_created',
  'planning.savings_goal_updated',
  'planning.savings_goal_completed',
  'planning.savings_goal_deleted',
  'planning.savings_movement_recorded',
  'planning.savings_movement_reversed',
  'planning.reminder_intent_created',
  'planning.reconciliation_difference',
  'planning.reconciliation_repaired',
] as const);

export type PlanningEventName = (typeof PLANNING_EVENT_NAMES)[number];

const names = new Set<string>(PLANNING_EVENT_NAMES);
const allowed = new Set([
  'aggregateVersion',
  'budgetId',
  'count',
  'currencyCode',
  'cycleDate',
  'dueAt',
  'goalId',
  'ledgerVersion',
  'matchId',
  'movementId',
  'obligationId',
  'paymentId',
  'profileId',
  'reasonCode',
  'receiptId',
  'requestId',
  'resourceId',
  'resourceType',
  'scheduleItemId',
  'status',
  'transactionId',
  'userId',
]);
const forbidden =
  /amount|name|note|provider|keyword|description|evidence|accountLabel|lastFour|requestBody|error/i;
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subject = /^[A-Za-z0-9_:-]{1,128}$/;

export function buildPlanningEvent(
  name: PlanningEventName,
  payload: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const keys = Object.keys(payload);
  if (
    !names.has(name) ||
    keys.some((key) => !allowed.has(key) || forbidden.test(key)) ||
    Buffer.byteLength(JSON.stringify(payload)) > 4096 ||
    typeof payload.userId !== 'string' ||
    !subject.test(payload.userId) ||
    typeof payload.requestId !== 'string' ||
    !subject.test(payload.requestId)
  )
    throw new Error('PLANNING_EVENT_INVALID');
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith('Id') && !['requestId', 'userId'].includes(key) && !id.test(String(value)))
      throw new Error('PLANNING_EVENT_INVALID');
    if (key.endsWith('Version') && (!Number.isSafeInteger(value) || Number(value) < 0))
      throw new Error('PLANNING_EVENT_INVALID');
  }
  return Object.freeze({ ...payload });
}
