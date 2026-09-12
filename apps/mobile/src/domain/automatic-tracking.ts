import { z } from 'zod';

import type { KeywordRule, TrackingPreference } from './app-shell';
import type { TransactionInput } from './core-finance';

export const trackingPlatforms = ['android', 'ios', 'conservative'] as const;
export const trackingServiceStates = [
  'healthy',
  'interrupted',
  'battery_restricted',
  'offline',
  'unavailable'
] as const;
export const trackingEventTypes = [
  'purchase',
  'withdrawal',
  'deposit',
  'salary',
  'incoming_transfer',
  'outgoing_transfer',
  'refund',
  'reversal',
  'fee',
  'subscription',
  'installment',
  'failed',
  'pending'
] as const;
export const trackingDecisionStatuses = [
  'received',
  'analyzing',
  'auto_added',
  'review_required',
  'ignored',
  'rejected',
  'resolved',
  'failed'
] as const;
export const trackingReasonCodes = [
  'clear_success',
  'low_confidence',
  'review_all',
  'paused',
  'failed_event',
  'otp',
  'marketing',
  'amount_conflict',
  'duplicate',
  'rule_conflict',
  'ambiguous_account',
  'ambiguous_lifecycle',
  'multiple_obligations',
  'invalid_input',
  'source_expired'
] as const;

export type TrackingPlatform = (typeof trackingPlatforms)[number];
export type TrackingServiceState = (typeof trackingServiceStates)[number];
export type TrackingEventType = (typeof trackingEventTypes)[number];
export type TrackingDecisionStatus = (typeof trackingDecisionStatuses)[number];
export type TrackingReasonCode = (typeof trackingReasonCodes)[number];
export type TrackingMode = TrackingPreference['mode'];

export interface TrackingImportEvent {
  sourceItemKey: string;
  sender?: string;
  body?: string;
  amountMinor?: number;
  currency?: string;
  merchant?: string;
  receivedAt: string;
  occurredAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
  kind?: 'income' | 'expense' | 'transfer' | 'refund' | 'fee';
  accountId?: string;
  categoryId?: string;
}

export interface TrackingImportSubmission {
  schemaVersion: 1;
  sourceType: 'sms' | 'manual';
  sourceChannel?:
    | 'android_sms'
    | 'android_notification'
    | 'ios_shortcut'
    | 'ios_app_intent'
    | 'ios_share_extension'
    | 'manual';
  events: TrackingImportEvent[];
}

export interface TrackingImportSession {
  id: string;
  status:
    | 'received'
    | 'processing'
    | 'review'
    | 'complete'
    | 'failed'
    | 'cancelled';
  itemCount: number;
  acceptedCount: number;
  rejectedCount: number;
  completedAt: number | null;
  updatedAt: number;
}

const epochSchema = z.number().int().nonnegative();
const confidenceSchema = z.number().int().min(0).max(10_000);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);

export const detectedFinancialEventSchema = z
  .object({
    id: z.string().min(1),
    sourceFingerprint: z.string().min(1),
    sourceKind: z.enum([
      'sms_mock',
      'platform_assisted_mock',
      'android_sms',
      'android_notification',
      'ios_shortcut',
      'ios_app_intent',
      'ios_share_extension',
      'manual'
    ]),
    eventType: z.enum(trackingEventTypes),
    decisionStatus: z.enum(trackingDecisionStatuses),
    confidenceBasisPoints: confidenceSchema,
    amountMinor: z.number().int().safe().positive().nullable(),
    currencyCode: currencySchema.nullable(),
    merchant: z.string().trim().max(160).nullable(),
    categoryId: z.string().nullable(),
    accountHint: z.string().trim().max(80).nullable(),
    accountId: z.string().nullable(),
    paymentMethod: z.string().trim().max(80).nullable(),
    occurredAt: epochSchema.nullable(),
    sourceText: z.string().max(2_000).nullable(),
    sourceTextExpiresAt: epochSchema.nullable(),
    reasonCodes: z.array(z.enum(trackingReasonCodes)).min(1),
    priorEventId: z.string().nullable(),
    transactionId: z.string().nullable(),
    obligationMatchId: z.string().nullable(),
    createdAt: epochSchema,
    updatedAt: epochSchema
  })
  .superRefine((event, context) => {
    if (event.sourceText && !event.sourceTextExpiresAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceTextExpiresAt'],
        message: 'source text requires expiry'
      });
    }
    if (event.decisionStatus === 'auto_added' && !event.transactionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transactionId'],
        message: 'auto-added events require a transaction'
      });
    }
  });

export type DetectedFinancialEvent = z.infer<
  typeof detectedFinancialEventSchema
>;

export const reviewItemSchema = z.object({
  id: z.string().min(1),
  detectedEventId: z.string().min(1),
  status: z.enum(['pending', 'resolving', 'resolved', 'ignored', 'failed']),
  reasonCodes: z.array(z.enum(trackingReasonCodes)).min(1),
  missingFields: z.array(z.string()),
  proposedValues: z.record(z.unknown()),
  selectedDuplicateResolution: z
    .enum(['keep_existing', 'keep_new', 'keep_both', 'merge_details'])
    .nullable(),
  selectedObligationId: z.string().nullable(),
  resolutionErrorCode: z.string().nullable(),
  createdAt: epochSchema,
  resolvedAt: epochSchema.nullable(),
  updatedAt: epochSchema
});

export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const duplicateCandidateSchema = z.object({
  id: z.string().min(1),
  detectedEventId: z.string().min(1),
  existingTransactionId: z.string().min(1),
  probabilityBasisPoints: confidenceSchema,
  reasonCodes: z.array(z.string()).min(1),
  resolution: z
    .enum(['keep_existing', 'keep_new', 'keep_both', 'merge_details'])
    .nullable(),
  status: z.enum(['pending', 'resolved', 'failed']),
  resolvedAt: epochSchema.nullable()
});

export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const senderRuleSchema = z.object({
  id: z.string().min(1),
  normalizedSender: z.string().min(1),
  displayLabel: z.string().min(1),
  institutionKey: z.string().nullable(),
  origin: z.enum(['recognized', 'custom']),
  enabled: z.boolean(),
  trusted: z.boolean(),
  recentUseCount: z.number().int().nonnegative(),
  lastUsedAt: epochSchema.nullable(),
  createdAt: epochSchema,
  updatedAt: epochSchema
});

export type SenderRule = z.infer<typeof senderRuleSchema>;

export const trackingHistoryEntrySchema = z.object({
  id: z.string().min(1),
  detectedEventId: z.string().min(1),
  action: z.enum([
    'detected',
    'auto_added',
    'sent_to_review',
    'ignored',
    'rejected',
    'merged',
    'linked',
    'undone',
    'source_purged',
    'reported_wrong'
  ]),
  reasonCodes: z.array(z.enum(trackingReasonCodes)),
  occurredAt: epochSchema
});

export type TrackingHistoryEntry = z.infer<typeof trackingHistoryEntrySchema>;

export const automaticFeedbackSchema = z.object({
  id: z.string().min(1),
  detectedEventId: z.string().min(1),
  transactionId: z.string().min(1),
  kind: z.enum([
    'transaction_added',
    'obligation_payment_recorded',
    'automatic_action_undone'
  ]),
  undoExpiresAt: epochSchema,
  notificationOutcome: z.enum([
    'delivered_mock',
    'suppressed_private',
    'disabled',
    'failed_mock'
  ]),
  status: z.enum(['active', 'undone', 'expired']),
  createdAt: epochSchema,
  updatedAt: epochSchema
});

export type AutomaticFeedback = z.infer<typeof automaticFeedbackSchema>;

export interface TrackingStatusSnapshot {
  platform: TrackingPlatform;
  mode: TrackingMode;
  permissionStatus:
    | 'not_requested'
    | 'granted'
    | 'denied'
    | 'permanently_denied'
    | 'revoked'
    | 'unavailable'
    | null;
  serviceState: TrackingServiceState;
  lastDetectedAt: number | null;
  lastSuccessfulTransactionId: string | null;
  detectedThisMonth: number;
  reviewCount: number;
  activeKeywordCount: number;
  activeSenderCount: number;
  lastUpdatedAt: number;
}

export interface MockFinancialEventInput {
  id?: string;
  sourceFingerprint: string;
  sourceText?: string | null;
  sourceKind?:
    | 'sms_mock'
    | 'platform_assisted_mock'
    | 'android_sms'
    | 'android_notification'
    | 'ios_shortcut'
    | 'ios_app_intent'
    | 'ios_share_extension'
    | 'manual';
  eventType: TrackingEventType;
  confidenceBasisPoints: number;
  amountMinor?: number | null;
  currencyCode?: string | null;
  merchant?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  occurredAt?: number | null;
  reasonCodes?: TrackingReasonCode[];
  duplicateTransactionId?: string | null;
  priorEventId?: string | null;
  hasAmountConflict?: boolean;
  hasOtpSignal?: boolean;
  hasMarketingSignal?: boolean;
  hasRuleConflict?: boolean;
  hasAmbiguousAccount?: boolean;
  hasAmbiguousLifecycle?: boolean;
  obligationCandidateCount?: number;
}

export interface TrackingDecision {
  status: 'auto_add' | 'review' | 'ignore' | 'reject';
  reasonCodes: TrackingReasonCode[];
}

export function normalizeSender(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, '');
}

export function transitionDetectedEvent(
  current: TrackingDecisionStatus,
  next: TrackingDecisionStatus
): TrackingDecisionStatus {
  const allowed: Record<TrackingDecisionStatus, TrackingDecisionStatus[]> = {
    received: ['analyzing', 'failed'],
    analyzing: [
      'auto_added',
      'review_required',
      'ignored',
      'rejected',
      'failed'
    ],
    auto_added: ['resolved', 'failed'],
    review_required: ['resolved', 'ignored', 'failed'],
    ignored: [],
    rejected: [],
    resolved: [],
    failed: ['review_required', 'resolved', 'ignored']
  };
  if (!allowed[current].includes(next)) throw new Error('invalid_transition');
  return next;
}

export function decideAutomaticTracking(
  mode: TrackingMode,
  input: MockFinancialEventInput
): TrackingDecision {
  const safety = safetyReason(input);
  if (safety) return { status: 'reject', reasonCodes: [safety] };
  if (input.duplicateTransactionId)
    return { status: 'review', reasonCodes: ['duplicate'] };
  if (input.hasRuleConflict)
    return { status: 'review', reasonCodes: ['rule_conflict'] };
  if (input.hasAmbiguousAccount)
    return { status: 'review', reasonCodes: ['ambiguous_account'] };
  if (input.hasAmbiguousLifecycle)
    return { status: 'review', reasonCodes: ['ambiguous_lifecycle'] };
  if ((input.obligationCandidateCount ?? 0) > 1)
    return { status: 'review', reasonCodes: ['multiple_obligations'] };
  if (mode === 'paused') return { status: 'ignore', reasonCodes: ['paused'] };
  if (mode === 'review_all')
    return { status: 'review', reasonCodes: ['review_all'] };
  if (input.confidenceBasisPoints >= 9_000)
    return { status: 'auto_add', reasonCodes: ['clear_success'] };
  if (input.confidenceBasisPoints >= 6_000)
    return { status: 'review', reasonCodes: ['low_confidence'] };
  return { status: 'ignore', reasonCodes: ['low_confidence'] };
}

export function transactionInputFromEvent(
  event: DetectedFinancialEvent
): TransactionInput {
  if (
    !event.amountMinor ||
    !event.currencyCode ||
    !event.accountId ||
    !event.categoryId ||
    !event.occurredAt
  ) {
    throw new Error('invalid_input');
  }
  return {
    type:
      event.eventType === 'salary' ||
      event.eventType === 'deposit' ||
      event.eventType === 'incoming_transfer'
        ? 'income'
        : event.eventType === 'refund'
          ? 'refund'
          : event.eventType === 'reversal'
            ? 'reversal'
            : event.eventType === 'installment'
              ? 'obligation_payment'
              : event.eventType === 'subscription'
                ? 'recurring_payment'
                : 'expense',
    amountMinor: event.amountMinor,
    currencyCode: event.currencyCode,
    accountId: event.accountId,
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: event.categoryId,
    title: event.merchant ?? event.eventType,
    merchant: event.merchant,
    occurredAt: event.occurredAt,
    notes: null,
    originalTransactionId: event.priorEventId,
    obligationId: null
  };
}

export type KeywordRuleSummary = KeywordRule & {
  recentUseCount: number;
  lastUsedAt: number | null;
};

function safetyReason(
  input: MockFinancialEventInput
): TrackingReasonCode | null {
  if (
    input.eventType === 'failed' ||
    input.hasOtpSignal ||
    input.hasMarketingSignal ||
    input.hasAmountConflict ||
    !input.amountMinor ||
    !input.currencyCode
  ) {
    if (input.eventType === 'failed') return 'failed_event';
    if (input.hasOtpSignal) return 'otp';
    if (input.hasMarketingSignal) return 'marketing';
    if (input.hasAmountConflict) return 'amount_conflict';
    return 'invalid_input';
  }
  return null;
}
