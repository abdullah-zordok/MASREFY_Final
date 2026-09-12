import type {
  AssistantActionInput,
  AssistantActionPreview,
  AssistantConsent,
  AssistantConversation,
  AssistantResponse,
  AssistantResponseFeedback
} from '@/domain/assistant';
import type {
  NotificationActionKind,
  NotificationEvent,
  NotificationListQuery,
  NotificationPermissionState,
  NotificationPreferences,
  NotificationPreferencesInput,
  NotificationTarget,
  NotificationTargetResolution,
  Page
} from '@/domain/notifications';
import type {
  LocalDataDeletionResult,
  PrivacyRequest,
  RepresentativeSession,
  SecurityEvent,
  UserProfile,
  UserProfileInput
} from '@/domain/settings';
import type {
  SubscriptionOfferCatalog,
  SubscriptionOperation,
  SubscriptionOperationInput,
  SubscriptionState
} from '@/domain/subscriptions';
import type {
  SupportArticle,
  SupportDraft,
  SupportDraftInput,
  SupportOperation,
  SupportReplyInput,
  SupportTicket
} from '@/domain/support';
import type { MutationResult } from './core-finance-service';
import type { CapabilityContractMetadata } from './capability-contract';

export const notificationServiceCapability: CapabilityContractMetadata = {
  capability: 'assistant-notifications.notifications',
  majorVersion: 1,
  owner: 'assistant-notifications',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'notifications.state.unavailable'
};

export const phoneNotificationServiceCapability: CapabilityContractMetadata = {
  capability: 'assistant-notifications.phone',
  majorVersion: 1,
  owner: 'assistant-notifications',
  providerKinds: ['platform'],
  unavailableOutcome: 'notifications.permission.unavailable'
};

export const assistantServiceCapability: CapabilityContractMetadata = {
  capability: 'assistant.conversations',
  majorVersion: 1,
  owner: 'assistant',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'assistant.state.unavailable'
};

export const subscriptionServiceCapability: CapabilityContractMetadata = {
  capability: 'subscriptions.billing',
  majorVersion: 1,
  owner: 'subscriptions',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'subscriptions.state.unavailable'
};

export const settingsServiceCapability: CapabilityContractMetadata = {
  capability: 'settings.profile',
  majorVersion: 1,
  owner: 'settings',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'settings.state.unavailable'
};

export const supportServiceCapability: CapabilityContractMetadata = {
  capability: 'support.tickets',
  majorVersion: 1,
  owner: 'support',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'support.state.unavailable'
};

export type NotificationSourceEvent = Omit<
  NotificationEvent,
  'id' | 'readAt' | 'deletedAt' | 'phoneStatus' | 'syncStatus' | 'safeFailure'
>;

export type NotificationActionResult = {
  id: string;
  target: NotificationTarget | null;
};

export type PhoneNotificationPresentation = {
  notificationId: string;
  title: string;
  body: string;
  categoryId?: string;
};

export type PhonePresentationResult = {
  status: 'presented' | 'suppressed' | 'failed';
  identifier: string | null;
};

export type PhoneNotificationResponse = {
  notificationId: string;
  action: NotificationActionKind;
};

export interface NotificationService {
  list(input: NotificationListQuery): Promise<Page<NotificationEvent>>;
  get(id: string): Promise<NotificationEvent>;
  createFromSource(input: NotificationSourceEvent): Promise<NotificationEvent>;
  markRead(id: string, read: boolean): Promise<MutationResult<NotificationEvent>>;
  markAllRead(filter: NotificationListQuery, operationId: string): Promise<MutationResult<number>>;
  delete(id: string, operationId: string): Promise<MutationResult<{ id: string }>>;
  getPreferences(): Promise<NotificationPreferences>;
  savePreferences(input: NotificationPreferencesInput, expectedVersion: number, operationId: string): Promise<MutationResult<NotificationPreferences>>;
  refreshPermission(): Promise<NotificationPermissionState>;
  requestPermissionAfterEducation(): Promise<NotificationPermissionState>;
  resolveTarget(id: string): Promise<NotificationTargetResolution>;
  revalidateAction(id: string, action: NotificationActionKind): Promise<{ status: 'available' | 'expired' | 'unavailable' | 'unlock_required'; target: NotificationTarget | null; action: NotificationActionKind }>;
  executeAction(id: string, action: NotificationActionKind, operationId: string): Promise<MutationResult<NotificationActionResult>>;
}

export interface PhoneNotificationService {
  getPermission(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  registerCategories(): Promise<void>;
  presentLocal(input: PhoneNotificationPresentation): Promise<PhonePresentationResult>;
  getLastResponse(): Promise<PhoneNotificationResponse | null>;
  subscribeToResponses(listener: (response: PhoneNotificationResponse) => void): () => void;
  openSystemSettings(): Promise<void>;
}

export interface AssistantConversationQuery {
  cursor?: string;
  pageSize?: number;
  status?: AssistantConversation['status'];
}

export interface AssistantService {
  getConsent(): Promise<AssistantConsent>;
  getAvailability(): Promise<{ status: 'available' | 'disabled' | 'limit_reached'; remainingQuestions: number }>;
  setConsent(enabled: boolean, expectedVersion: number, operationId: string): Promise<MutationResult<AssistantConsent>>;
  listConversations(input: AssistantConversationQuery): Promise<Page<AssistantConversation>>;
  createConversation(input: { question: string }, operationId: string): Promise<MutationResult<AssistantConversation>>;
  getConversation(id: string, cursor?: string): Promise<{ conversation: AssistantConversation; responses: Page<AssistantResponse> }>;
  getResponse(id: string): Promise<AssistantResponse>;
  ask(conversationId: string, question: string, operationId: string): Promise<MutationResult<AssistantResponse>>;
  renameConversation(id: string, title: string, expectedVersion: number, operationId: string): Promise<MutationResult<AssistantConversation>>;
  deleteConversation(id: string, expectedVersion: number, operationId: string): Promise<MutationResult<{ id: string }>>;
  setResponseFeedback(responseId: string, feedback: AssistantResponseFeedback, operationId: string): Promise<MutationResult<AssistantResponse>>;
  getActionPreview(id: string): Promise<AssistantActionPreview>;
  updateActionPreview(id: string, input: AssistantActionInput, expectedVersion: number): Promise<AssistantActionPreview>;
  confirmAction(id: string, expectedVersion: number, operationId: string): Promise<MutationResult<AssistantActionPreview>>;
  cancelAction(id: string, expectedVersion: number, operationId: string): Promise<MutationResult<AssistantActionPreview>>;
}

export interface SubscriptionService {
  getCatalog(): Promise<SubscriptionOfferCatalog>;
  getState(): Promise<SubscriptionState>;
  getOperation(id: string): Promise<SubscriptionOperation>;
  startOperation(input: SubscriptionOperationInput, expectedVersion: number, operationId: string): Promise<MutationResult<SubscriptionOperation>>;
  completeMockOperation(operationId: string, outcome: 'success' | 'failure' | 'cancelled'): Promise<MutationResult<SubscriptionOperation>>;
}

export interface SettingsService {
  getProfile(): Promise<UserProfile>;
  saveProfile(input: UserProfileInput, expectedVersion: number, operationId: string): Promise<MutationResult<UserProfile>>;
  listSessions(): Promise<RepresentativeSession[]>;
  revokeSession(sessionId: string, operationId: string): Promise<MutationResult<RepresentativeSession>>;
  revokeAllSessions(operationId: string): Promise<MutationResult<RepresentativeSession[]>>;
  listSecurityEvents(cursor?: string): Promise<Page<SecurityEvent>>;
  requestPrivacyAction(kind: PrivacyRequest['kind'], operationId: string): Promise<MutationResult<PrivacyRequest>>;
  deleteLocalData(operationId: string): Promise<MutationResult<LocalDataDeletionResult>>;
}

export interface SupportService {
  searchArticles(input: { query: string; category?: string }): Promise<SupportArticle[]>;
  listTickets(cursor?: string): Promise<Page<SupportTicket>>;
  getTicket(id: string): Promise<SupportTicket>;
  saveDraft(input: SupportDraftInput): Promise<SupportDraft>;
  loadDraft(id: string): Promise<SupportDraft | null>;
  discardDraft(id: string): Promise<void>;
  submitDraft(id: string, operationId: string): Promise<MutationResult<SupportOperation>>;
  reply(ticketId: string, input: SupportReplyInput, expectedVersion: number, operationId: string): Promise<MutationResult<SupportOperation>>;
  rate(ticketId: string, rating: number, expectedVersion: number, operationId: string): Promise<MutationResult<SupportOperation>>;
}
