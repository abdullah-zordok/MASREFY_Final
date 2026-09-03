import type {
  AutomaticFeedback,
  DetectedFinancialEvent,
  DuplicateCandidate,
  KeywordRuleSummary,
  MockFinancialEventInput,
  ReviewItem,
  SenderRule,
  TrackingHistoryEntry,
  TrackingMode,
  TrackingStatusSnapshot
} from '@/domain/automatic-tracking';
import type { KeywordRule } from '@/domain/app-shell';
import type { CapabilityContractMetadata } from './capability-contract';

export const automaticTrackingServiceCapability: CapabilityContractMetadata = {
  capability: 'automatic-tracking.events',
  majorVersion: 1,
  owner: 'automatic-tracking',
  providerKinds: ['live', 'mock'],
  unavailableOutcome: 'tracking.status.permissionRequired'
};

export interface TrackingPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface TrackingMutationResult<T = unknown> {
  value: T;
  affectedScopes: readonly string[];
}

export interface TrackingDecisionResult {
  event: DetectedFinancialEvent;
  feedback: AutomaticFeedback | null;
  affectedScopes: readonly string[];
}

export interface TrackingHistoryQuery {
  cursor?: string | null;
  pageSize?: number;
}

export interface ReviewQuery extends TrackingHistoryQuery {
  status?: ReviewItem['status'];
}

export interface RuleQuery {
  search?: string;
  language?: 'ar' | 'en' | 'all';
}

export interface SenderQuery {
  search?: string;
}

export interface SenderRuleInput {
  id?: string;
  sender: string;
  displayLabel: string;
  institutionKey?: string | null;
  origin?: SenderRule['origin'];
  enabled?: boolean;
  trusted?: boolean;
}

export interface ReviewResolutionInput {
  action: 'confirm' | 'ignore' | 'report_wrong';
  values?: Record<string, unknown>;
}

export type DuplicateResolution =
  'keep_existing' | 'keep_new' | 'keep_both' | 'merge_details';

export interface AutomaticTrackingService {
  getStatus(): Promise<TrackingStatusSnapshot>;
  setMode(mode: TrackingMode): Promise<TrackingStatusSnapshot>;
  refreshStatus(): Promise<TrackingStatusSnapshot>;
  clearHistory(): Promise<TrackingMutationResult<number>>;
  purgeExpiredSourceText(now?: number): Promise<number>;
  processMockEvent(
    input: MockFinancialEventInput
  ): Promise<TrackingDecisionResult>;
  listHistory(
    query?: TrackingHistoryQuery
  ): Promise<TrackingPage<TrackingHistoryEntry>>;
  getDetectedEvent(id: string): Promise<DetectedFinancialEvent>;
  listReviewItems(query?: ReviewQuery): Promise<TrackingPage<ReviewItem>>;
  getReviewItem(id: string): Promise<ReviewItem>;
  resolveReview(
    id: string,
    input: ReviewResolutionInput
  ): Promise<TrackingMutationResult<ReviewItem>>;
  getDuplicate(id: string): Promise<DuplicateCandidate>;
  resolveDuplicate(
    id: string,
    resolution: DuplicateResolution
  ): Promise<TrackingMutationResult<DuplicateCandidate>>;
  listKeywordRules(query?: RuleQuery): Promise<KeywordRuleSummary[]>;
  saveKeywordRules(
    rules: readonly KeywordRule[]
  ): Promise<TrackingMutationResult<KeywordRuleSummary[]>>;
  restoreDefaultKeywords(): Promise<
    TrackingMutationResult<KeywordRuleSummary[]>
  >;
  listSenderRules(query?: SenderQuery): Promise<SenderRule[]>;
  saveSenderRule(
    input: SenderRuleInput
  ): Promise<TrackingMutationResult<SenderRule>>;
  removeCustomSender(id: string): Promise<TrackingMutationResult<string>>;
  undoAutomaticAddition(
    feedbackId: string
  ): Promise<TrackingMutationResult<AutomaticFeedback>>;
  reportWrongDetection(
    eventId: string
  ): Promise<TrackingMutationResult<DetectedFinancialEvent>>;
}

export type TrackingErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'permission_required'
  | 'paused'
  | 'offline'
  | 'duplicate'
  | 'review_required'
  | 'expired_undo'
  | 'conflict'
  | 'unknown';

export class TrackingError extends Error {
  constructor(public readonly code: TrackingErrorCode) {
    super(code);
    this.name = 'TrackingError';
  }
}
