import { z } from 'zod';
import { safeFailureSchema } from './notifications';

export const assistantConsentSchema = z.object({ status: z.enum(['not_requested', 'enabled', 'disabled']), disclosedDataCategories: z.array(z.enum(['transactions', 'planning', 'reports'])), consentedAt: z.number().int().nonnegative().nullable(), disabledAt: z.number().int().nonnegative().nullable(), version: z.number().int().positive() }).superRefine((value, ctx) => { if (value.status === 'enabled' && value.consentedAt === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'enabled consent needs time' }); if (value.status === 'disabled' && value.disabledAt === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'disabled consent needs time' }); });
export type AssistantConsent = z.infer<typeof assistantConsentSchema>;
export const assistantConversationSchema = z.object({ id: z.string().min(1), title: z.string().min(1).max(120), status: z.enum(['active', 'deleted']), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(), lastResponseId: z.string().nullable(), version: z.number().int().positive() });
export type AssistantConversation = z.infer<typeof assistantConversationSchema>;
const blockSchema = z.object({ label: z.enum(['fact', 'estimate', 'suggestion']), key: z.string().min(1), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) });
const snapshotSchema = z.object({ sources: z.array(z.object({ kind: z.enum(['transaction', 'budget', 'obligation', 'goal', 'report']), id: z.string().min(1), version: z.number().int().nonnegative() }).strict()), values: z.array(z.object({ key: z.string().min(1), minor: z.number().int().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), status: z.enum(['available', 'estimated']).optional() }).strict()), completeness: z.object({ confirmed: z.number().int().nonnegative(), reviewRequired: z.number().int().nonnegative(), conflicts: z.number().int().nonnegative(), reasons: z.array(z.string()) }).strict(), reportReference: z.string().nullable() }).strict();
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
function freezeDeep<T>(value: T): DeepReadonly<T> { if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); } return value as DeepReadonly<T>; }
const immutableSnapshotSchema = snapshotSchema.transform((snapshot) => freezeDeep(snapshot));
export function createImmutableSnapshot(input: z.input<typeof snapshotSchema>) { return immutableSnapshotSchema.parse(input); }
export const assistantResponseSchema = z.object({ id: z.string().min(1), conversationId: z.string().min(1), question: z.string().min(1).max(1000), responseType: z.enum(['direct', 'comparison', 'explanation', 'saving_suggestion', 'plan', 'obligation_analysis', 'insufficient_data', 'safe_redirect']), blocks: z.array(blockSchema), period: z.string().nullable(), dataAsOf: z.number().int().nonnegative(), snapshot: immutableSnapshotSchema, limitations: z.array(z.string()), proposedActionIds: z.array(z.string()), feedback: z.enum(['helpful', 'not_helpful', 'reported']).nullable(), createdAt: z.number().int().nonnegative() });
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export type AssistantResponseFeedback = NonNullable<AssistantResponse['feedback']>;
const destinationSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('budget'), budgetId: z.string().min(1) }), z.object({ kind: z.literal('goal'), goalId: z.string().min(1) }), z.object({ kind: z.literal('transactions') }), z.object({ kind: z.literal('subscriptions') }), z.object({ kind: z.literal('obligation'), obligationId: z.string().min(1) })]);
const previewFields = { id: z.string().min(1), responseId: z.string().min(1), affectedDestination: destinationSchema, sourceVersions: z.array(z.object({ id: z.string().min(1), version: z.number().int().nonnegative() }).strict()), status: z.enum(['draft', 'ready', 'confirming', 'succeeded', 'failed', 'cancelled', 'stale', 'expired']), operationId: z.string().min(1).nullable(), expiresAt: z.number().int().nonnegative().nullable(), resultReference: z.string().nullable(), safeFailure: safeFailureSchema.nullable(), version: z.number().int().positive() };
const moneyInput = z.object({ amountMinor: z.number().int(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const noInput = z.object({}).strict();
export const assistantActionPreviewSchema = z.discriminatedUnion('kind', [
  z.object({ ...previewFields, kind: z.literal('create_budget'), input: moneyInput }), z.object({ ...previewFields, kind: z.literal('adjust_budget'), input: moneyInput }), z.object({ ...previewFields, kind: z.literal('create_goal'), input: moneyInput }), z.object({ ...previewFields, kind: z.literal('create_transaction'), input: moneyInput }), z.object({ ...previewFields, kind: z.literal('update_transaction'), input: noInput }), z.object({ ...previewFields, kind: z.literal('update_budget'), input: noInput }), z.object({ ...previewFields, kind: z.literal('record_obligation_payment'), input: noInput }), z.object({ ...previewFields, kind: z.literal('resolve_tracking_review'), input: noInput }), z.object({ ...previewFields, kind: z.literal('add_reminder'), input: z.object({ date: z.string().min(1) }).strict() }), z.object({ ...previewFields, kind: z.literal('open_transactions'), input: noInput }), z.object({ ...previewFields, kind: z.literal('show_subscriptions'), input: noInput }), z.object({ ...previewFields, kind: z.literal('link_transaction'), input: z.object({ transactionId: z.string().min(1) }).strict() }), z.object({ ...previewFields, kind: z.literal('review_obligation'), input: z.object({ obligationId: z.string().min(1) }).strict() }), z.object({ ...previewFields, kind: z.literal('create_plan'), input: moneyInput })
]).superRefine((value, ctx) => { const changing = previewRequiresConfirmation(value.kind); if (changing && (value.expiresAt === null || value.sourceVersions.length === 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'data change requires expiry and versions' }); if (value.status === 'confirming' && !value.operationId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'confirmation needs operation' }); if (value.status === 'succeeded' ? (!value.operationId || !value.resultReference) : value.resultReference !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'result only on success' }); });
export type AssistantActionPreview = z.infer<typeof assistantActionPreviewSchema>;
export type AssistantActionInput = AssistantActionPreview['input'];
export type AssistantActionKind = AssistantActionPreview['kind'];
export function canTransitionPreview(from: AssistantActionPreview['status'], to: AssistantActionPreview['status']) { return (from === 'draft' && to === 'ready') || (from === 'ready' && ['confirming', 'cancelled', 'stale', 'expired', 'failed'].includes(to)) || (from === 'confirming' && ['succeeded', 'failed', 'stale', 'expired'].includes(to)) || (['failed', 'stale'].includes(from) && to === 'ready'); }
export function deleteConversationIsolated<T extends { conversationId?: string }, S>(conversationId: string, responses: readonly T[], sourceRecords: readonly S[]) { return { responses: responses.filter((response) => response.conversationId !== conversationId), sourceRecords }; }

export type CreateAssistantActionPreviewInput = Pick<AssistantActionPreview, 'id' | 'responseId' | 'kind' | 'input' | 'affectedDestination' | 'sourceVersions'> & { now: number; expiresInMs: number };

export function previewRequiresConfirmation(kind: AssistantActionKind) {
  return !['open_transactions', 'show_subscriptions', 'review_obligation'].includes(kind);
}

export function createAssistantActionPreview(input: CreateAssistantActionPreviewInput): AssistantActionPreview {
  return assistantActionPreviewSchema.parse({
    id: input.id,
    responseId: input.responseId,
    kind: input.kind,
    input: input.input,
    affectedDestination: input.affectedDestination,
    sourceVersions: input.sourceVersions,
    status: 'ready',
    operationId: null,
    expiresAt: previewRequiresConfirmation(input.kind) ? input.now + input.expiresInMs : null,
    resultReference: null,
    safeFailure: null,
    version: 1
  });
}

export function updateAssistantActionPreviewInput(
  preview: AssistantActionPreview,
  input: AssistantActionInput,
  sourceVersions: readonly { id: string; version: number }[] = preview.sourceVersions
): AssistantActionPreview {
  if (!previewRequiresConfirmation(preview.kind) || !['ready', 'failed', 'stale'].includes(preview.status)) throw new Error('not_editable');
  const status = preview.status === 'ready' ? 'ready' : transitionStatus(preview, 'ready');
  return assistantActionPreviewSchema.parse({ ...preview, input, sourceVersions, status, safeFailure: null, resultReference: null, operationId: null, version: preview.version + 1 });
}

export function revalidateAssistantActionPreview(
  preview: AssistantActionPreview,
  current: { now: number; sourceVersions: readonly { id: string; version: number }[] }
): AssistantActionPreview {
  if (preview.expiresAt !== null && current.now > preview.expiresAt) return nextStatus(preview, 'expired');
  const stale = preview.sourceVersions.some((source) => current.sourceVersions.find((item) => item.id === source.id)?.version !== source.version);
  return stale ? nextStatus(preview, 'stale') : preview;
}

export function cancelAssistantActionPreview(preview: AssistantActionPreview): AssistantActionPreview {
  transitionStatus(preview, 'cancelled');
  return assistantActionPreviewSchema.parse({ ...preview, status: 'cancelled', operationId: null, resultReference: null, safeFailure: null, version: preview.version + 1 });
}

export function failAssistantActionPreview(preview: AssistantActionPreview, safeFailure: AssistantActionPreview['safeFailure']): AssistantActionPreview {
  transitionStatus(preview, 'failed');
  return assistantActionPreviewSchema.parse({ ...preview, status: 'failed', operationId: null, resultReference: null, safeFailure, version: preview.version + 1 });
}

function nextStatus(preview: AssistantActionPreview, status: AssistantActionPreview['status']) {
  transitionStatus(preview, status);
  return assistantActionPreviewSchema.parse({ ...preview, status, version: preview.version + 1 });
}

function transitionStatus(preview: AssistantActionPreview, status: AssistantActionPreview['status']) {
  if (!canTransitionPreview(preview.status, status)) throw new Error('invalid_transition');
  return status;
}
