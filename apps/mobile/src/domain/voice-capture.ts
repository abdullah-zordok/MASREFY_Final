import type { TransactionInput, TransactionType } from './core-finance';

export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_MAX_PROPOSALS = 10;

export type VoicePermissionState =
  'not_requested' | 'granted' | 'denied' | 'permanently_denied' | 'unavailable';

export type VoiceSessionState =
  | 'idle'
  | 'permission_required'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'transcribing'
  | 'transcript_review'
  | 'analyzing'
  | 'proposal_review'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'canceled';

export type VoiceScenario =
  | 'empty'
  | 'clear_ar'
  | 'clear_en'
  | 'mixed'
  | 'missing_account'
  | 'unknown_merchant'
  | 'multiple'
  | 'income'
  | 'transfer'
  | 'obligation'
  | 'low_confidence'
  | 'failed_analysis'
  | 'unsupported_language'
  | 'no_speech'
  | 'background_noise'
  | 'offline';

export type VoiceErrorCode =
  | 'permission_denied'
  | 'permission_permanent'
  | 'recording_interrupted'
  | 'maximum_duration'
  | 'no_speech'
  | 'background_noise'
  | 'unsupported_language'
  | 'analysis_unavailable'
  | 'analysis_failed'
  | 'offline'
  | 'invalid_proposal'
  | 'save_failed'
  | 'unknown';

export type VoiceField =
  | 'type'
  | 'amount'
  | 'currency'
  | 'merchant'
  | 'category'
  | 'payment_method'
  | 'account'
  | 'date'
  | 'beneficiary'
  | 'recurring_intent'
  | 'obligation'
  | 'notes';

export type VoiceFieldStatus = 'clear' | 'confirm' | 'missing' | 'conflict';

export interface VoiceFieldAssessment {
  field: VoiceField;
  confidence: number;
  status: VoiceFieldStatus;
  reasonCode: string;
  confirmed: boolean;
}

export interface VoiceTranscript {
  text: string;
  language: 'ar' | 'en' | 'mixed' | 'unsupported';
  confidence: number;
  capturedAt: number;
  editedByUser: boolean;
  analysisReference?: {
    sessionId: string;
    sessionVersion: number;
    proposalId: string;
    proposalVersion: number;
  };
}

export type VoicePaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'wallet'
  | 'apple_pay'
  | 'google_pay'
  | 'other';

export interface VoiceRecurringSuggestion {
  kind: 'one_time' | 'recurring' | 'existing_obligation' | 'new_obligation';
  cadence: 'weekly' | 'monthly' | null;
  candidateObligationIds: string[];
  confidence: number;
  confirmed: boolean;
}

export interface VoiceTransactionProposal {
  id: string;
  type: Extract<
    TransactionType,
    'expense' | 'income' | 'transfer' | 'obligation_payment'
  > | null;
  amountMinor: number | null;
  currencyCode: string | null;
  merchant: string | null;
  title: string;
  categoryId: string | null;
  paymentMethod: VoicePaymentMethod | null;
  accountId: string | null;
  destinationAccountId: string | null;
  occurredAt: number | null;
  beneficiary: string | null;
  obligationId: string | null;
  duplicateOfTransactionId: string | null;
  notes: string | null;
  assessments: VoiceFieldAssessment[];
  recurringSuggestion: VoiceRecurringSuggestion | null;
  selected: boolean;
  status: 'proposed' | 'edited' | 'ready' | 'removed' | 'saved';
  categoryPreference: 'only_this_time' | 'always_for_merchant' | 'not_now';
}

export interface VoiceProposalGroup {
  id: string;
  sessionId: string;
  proposals: VoiceTransactionProposal[];
  status:
    'reviewing' | 'validating' | 'saving' | 'saved' | 'failed' | 'canceled';
  saveErrorCode: VoiceErrorCode | null;
}

export interface VoiceCaptureSession {
  id: string;
  state: VoiceSessionState;
  permission: VoicePermissionState;
  language: 'ar' | 'en';
  scenario: VoiceScenario;
  startedAt: number | null;
  timezoneOffsetMinutes: number | null;
  durationMs: number;
  recordingId: string | null;
  audioReference: string | null;
  transcript: VoiceTranscript | null;
  group: VoiceProposalGroup | null;
  errorCode: VoiceErrorCode | null;
}

export interface VoiceCategoryPreference {
  id: string;
  merchantKey: string;
  merchantLabel: string;
  categoryId: string;
  createdAt: number;
  updatedAt: number;
}

export function fieldStatusForConfidence(
  confidence: number,
  conflict = false
): VoiceFieldStatus {
  if (conflict) return 'conflict';
  if (confidence >= 90) return 'clear';
  if (confidence >= 60) return 'confirm';
  return 'missing';
}

export function assessment(
  field: VoiceField,
  confidence: number,
  reasonCode = `voice.confidence.${field}`,
  conflict = false
): VoiceFieldAssessment {
  const status = fieldStatusForConfidence(confidence, conflict);
  return {
    field,
    confidence,
    status,
    reasonCode,
    confirmed: status === 'clear'
  };
}

export function selectedProposals(
  group: VoiceProposalGroup
): VoiceTransactionProposal[] {
  return group.proposals.filter(
    (item) => item.selected && item.status !== 'removed'
  );
}

export function proposalErrors(
  proposal: VoiceTransactionProposal
): VoiceField[] {
  const errors = new Set<VoiceField>();
  const required = new Set<VoiceField>([
    'type',
    'amount',
    'currency',
    'date',
    'account'
  ]);
  if (proposal.type !== 'transfer') required.add('category');
  if (!proposal.type) errors.add('type');
  if (!proposal.amountMinor || proposal.amountMinor <= 0) errors.add('amount');
  if (!proposal.currencyCode || !/^[A-Z]{3}$/.test(proposal.currencyCode))
    errors.add('currency');
  if (!proposal.occurredAt) errors.add('date');
  if (!proposal.accountId) errors.add('account');
  if (proposal.type !== 'transfer' && !proposal.categoryId)
    errors.add('category');
  if (
    proposal.type === 'transfer' &&
    (!proposal.destinationAccountId ||
      proposal.destinationAccountId === proposal.accountId)
  )
    errors.add('beneficiary');
  for (const item of proposal.assessments) {
    if (
      item.status === 'conflict' ||
      (item.status === 'missing' && required.has(item.field))
    )
      errors.add(item.field);
    if (item.status === 'confirm' && !item.confirmed) errors.add(item.field);
  }
  return [...errors];
}

export function proposalToTransactionInput(
  proposal: VoiceTransactionProposal
): TransactionInput {
  if (proposalErrors(proposal).length) throw new Error('invalid_proposal');
  return {
    type: proposal.type!,
    amountMinor: proposal.amountMinor!,
    currencyCode: proposal.currencyCode!,
    accountId: proposal.accountId!,
    destinationAccountId:
      proposal.type === 'transfer' ? proposal.destinationAccountId : null,
    feeMinor: 0,
    categoryId: proposal.type === 'transfer' ? null : proposal.categoryId,
    title:
      proposal.title.trim() ||
      proposal.merchant ||
      proposal.categoryId ||
      proposal.type!,
    merchant: proposal.merchant,
    occurredAt: proposal.occurredAt!,
    notes: proposal.notes,
    originalTransactionId: null,
    obligationId: proposal.obligationId
  };
}

export function resolveSpokenDate(
  phrase: string,
  recordedAt: number,
  timezoneOffsetMinutes: number
): { value: number; requiresConfirmation: boolean } {
  const normalized = phrase.trim().toLocaleLowerCase('en');
  const localRecordedAt = recordedAt - timezoneOffsetMinutes * 60_000;
  const date = new Date(localRecordedAt);
  date.setUTCHours(12, 0, 0, 0);
  if (normalized === 'yesterday' || normalized === 'أمس')
    date.setUTCDate(date.getUTCDate() - 1);
  else if (
    normalized === 'tomorrow' ||
    normalized === 'غدًا' ||
    normalized === 'غدا'
  )
    date.setUTCDate(date.getUTCDate() + 1);
  const value = date.getTime() + timezoneOffsetMinutes * 60_000;
  return {
    value,
    requiresConfirmation:
      normalized === 'tomorrow' || normalized === 'غدًا' || normalized === 'غدا'
  };
}

export function normalizeMerchant(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .normalize('NFKC')
    .replace(/\s+/g, ' ');
}
