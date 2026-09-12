import { Platform } from 'react-native';
import { isDemoModeEnabled } from '@/config/demo-mode';
import { createClientDemoData } from '@/domain/demo-data';
import type { Locale } from '@/domain/foundation';

import {
  decideAutomaticTracking,
  normalizeSender,
  transactionInputFromEvent,
  type AutomaticFeedback,
  type DetectedFinancialEvent,
  type KeywordRuleSummary,
  type MockFinancialEventInput,
  type TrackingImportSession,
  type TrackingMode,
  type TrackingStatusSnapshot
} from '@/domain/automatic-tracking';
import type {
  AppShellStorage,
  TrackingPermissionService
} from '@/services/contracts/app-shell-service';
import {
  TrackingError,
  automaticTrackingServiceCapability,
  type AutomaticTrackingService,
  type DuplicateResolution,
  type ReviewQuery,
  type RuleQuery,
  type SenderQuery,
  type SenderRuleInput,
  type TrackingHistoryQuery,
  type TrackingMutationResult
} from '@/services/contracts/automatic-tracking-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import type {
  NotificationService,
  NotificationSourceEvent
} from '@/services/contracts/assistant-notifications-service';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import { accountAllowsAutomaticTracking } from '@/domain/core-finance';
import { createAppShellStorage } from '@/storage/app-shell-storage';
import { AutomaticTrackingRepository } from '@/storage/automatic-tracking-repository';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';
import { createTrackingPermissionService } from '@/services/platform/tracking-permission-service';
import { defaultKeywordRules } from './default-keywords';
import { coreFinanceService } from './core-finance-service';
import { createMockTrackingPermissionService } from './tracking-permission-service';
import { assistantNotificationsService } from './assistant-notifications-service';

const silentNotificationService: Pick<NotificationService, 'createFromSource'> =
  {
    async createFromSource(input) {
      return {
        ...input,
        id: `notification-${input.eventKey}`,
        readAt: null,
        deletedAt: null,
        phoneStatus: 'not_requested',
        syncStatus: 'synced',
        safeFailure: null
      };
    }
  };

export function createMockAutomaticTrackingService({
  repository = new AutomaticTrackingRepository(
    isDemoModeEnabled() ? createClientDemoData().tracking : {}
  ),
  financeService = coreFinanceService,
  notificationService = silentNotificationService,
  storage = createAppShellStorage(),
  permissionService = createMockTrackingPermissionService('granted'),
  persistent = false,
  platform = Platform.OS,
  registerForReset = false
}: {
  repository?: AutomaticTrackingRepository;
  financeService?: CoreFinanceService;
  notificationService?: Pick<NotificationService, 'createFromSource'>;
  storage?: AppShellStorage;
  permissionService?: TrackingPermissionService;
  persistent?: boolean;
  platform?: string;
  registerForReset?: boolean;
} = {}): CapabilityProviderHandle<AutomaticTrackingService> {
  let hydration: Promise<void> | null = null;
  let serviceState: TrackingStatusSnapshot['serviceState'] = 'healthy';
  const ensureReady = async () => {
    if (persistent) hydration ??= repository.hydrate();
    await hydration;
    const purged = repository.purgeExpiredSourceText();
    if (persistent && purged) await repository.persistAll();
  };
  const undoResults = new Map<
    string,
    Promise<TrackingMutationResult<AutomaticFeedback>>
  >();
  const importSessions = new Map<string, TrackingImportSession>();
  if (registerForReset)
    registerRuntimeUserDataReset(() => {
      repository.reset();
      undoResults.clear();
      serviceState = 'healthy';
      hydration = null;
    });
  const persist = async () => {
    if (persistent) await repository.persistAll();
  };
  const mode = async (): Promise<TrackingMode> =>
    (await storage.loadTrackingPreference())?.mode ?? 'automatic_clear';
  const assertAutomaticTrackingAccount = async (
    accountId: unknown,
    selectedMode?: TrackingMode
  ) => {
    try {
      if (
        (selectedMode ?? (await mode())) === 'paused' ||
        typeof accountId !== 'string' ||
        !accountAllowsAutomaticTracking(
          await financeService.getAccount(accountId)
        )
      )
        throw new Error('blocked');
    } catch {
      throw new TrackingError('account_blocked');
    }
  };

  return {
    metadata: {
      id: 'mock-automatic-tracking',
      capability: automaticTrackingServiceCapability.capability,
      majorVersion: automaticTrackingServiceCapability.majorVersion,
      kind: 'mock',
      availability: platform === 'ios' ? 'unavailable' : 'available'
    },
    async submitImport(input) {
      const now = Date.now();
      const session: TrackingImportSession = {
        id: `fixture-${input.events[0]?.sourceItemKey ?? 'import'}`,
        status: 'complete',
        itemCount: input.events.length,
        acceptedCount: input.events.length,
        rejectedCount: 0,
        completedAt: now,
        updatedAt: now
      };
      importSessions.set(session.id, session);
      return session;
    },
    async getImportSession(id) {
      const session = importSessions.get(id);
      if (!session) throw new TrackingError('not_found');
      return session;
    },
    async listDuplicates() {
      await ensureReady();
      return repository.listDuplicates();
    },
    async getStatus() {
      await ensureReady();
      const permission = await permissionService.getState();
      const permissionUnavailable = permission.status === 'unavailable';
      const events = repository.listEvents();
      const lastAuto = events.find((event) => event.transactionId);
      return {
        platform:
          platform === 'android'
            ? 'android'
            : platform === 'ios'
              ? 'ios'
              : 'conservative',
        mode: await mode(),
        permissionStatus: platform === 'android' ? permission.status : null,
        serviceState:
          platform === 'android' && !permissionUnavailable
            ? serviceState
            : 'unavailable',
        lastDetectedAt: events.at(-1)?.createdAt ?? null,
        lastSuccessfulTransactionId: lastAuto?.transactionId ?? null,
        detectedThisMonth: events.length,
        reviewCount: repository.listReviews('pending').length,
        activeKeywordCount: (await storage.loadKeywords()).filter(
          (rule) => rule.enabled
        ).length,
        activeSenderCount: repository
          .listSenders()
          .filter((sender) => sender.enabled).length,
        lastUpdatedAt: Date.now()
      };
    },
    async setMode(nextMode) {
      await storage.saveTrackingPreference({
        mode: nextMode,
        selectedAt: Date.now(),
        isRecommended: nextMode === 'automatic_clear'
      });
      return this.getStatus();
    },
    async refreshStatus() {
      serviceState = 'healthy';
      return this.getStatus();
    },
    async clearHistory() {
      await ensureReady();
      const count = repository.clearHistory();
      await persist();
      return mutation(count, ['tracking.history', 'tracking.status']);
    },
    async purgeExpiredSourceText(now) {
      await ensureReady();
      const count = repository.purgeExpiredSourceText(now);
      await persist();
      return count;
    },
    async processMockEvent(input: MockFinancialEventInput) {
      await ensureReady();
      const selectedMode = await mode();
      if (selectedMode === 'paused') throw new TrackingError('paused');
      const prior = repository.findByFingerprint(input.sourceFingerprint);
      if (prior)
        return {
          event: prior,
          feedback: null,
          affectedScopes: ['tracking.status']
        };
      await assertAutomaticTrackingAccount(input.accountId, selectedMode);
      const decision = decideAutomaticTracking(selectedMode, input);
      const status =
        decision.status === 'auto_add'
          ? 'analyzing'
          : decision.status === 'review'
            ? 'review_required'
            : decision.status === 'reject'
              ? 'rejected'
              : 'ignored';
      let event = repository.createEvent(input, status, decision.reasonCodes);
      let feedback = null;
      const scopes = ['tracking.status', 'tracking.history'];
      if (decision.status === 'review') {
        const review = repository.addReview(event);
        if (input.duplicateTransactionId) {
          repository.addDuplicate(event, input.duplicateTransactionId);
          await notificationService.createFromSource(
            reviewNotification(event, review.id, 'duplicate')
          );
        } else {
          await notificationService.createFromSource(
            reviewNotification(event, review.id)
          );
        }
        scopes.push('tracking.review');
      }
      if (decision.status === 'auto_add') {
        const result = await financeService.createTransaction(
          transactionInputFromEvent(event),
          event.sourceFingerprint,
          'automatic'
        );
        event = repository.updateEvent(event.id, {
          decisionStatus: 'auto_added',
          transactionId: result.value.id
        });
        feedback = repository.addFeedback(
          event,
          result.value.id,
          'delivered_mock'
        );
        await notificationService.createFromSource(
          autoAddedNotification(event, feedback.undoExpiresAt)
        );
        scopes.push(...result.affectedScopes, 'tracking.feedback');
      }
      await persist();
      return { event, feedback, affectedScopes: [...new Set(scopes)] };
    },
    async listHistory(query?: TrackingHistoryQuery) {
      await ensureReady();
      return page(repository.listHistory(), query?.cursor, query?.pageSize);
    },
    async getDetectedEvent(id) {
      await ensureReady();
      return repository.requireEvent(id);
    },
    async listReviewItems(query?: ReviewQuery) {
      await ensureReady();
      return page(
        repository.listReviews(query?.status ?? 'pending'),
        query?.cursor,
        query?.pageSize
      );
    },
    async getReviewItem(id) {
      await ensureReady();
      return repository.requireReview(id);
    },
    async resolveReview(id, input) {
      await ensureReady();
      const review = repository.requireReview(id);
      if (input.action === 'confirm')
        await assertAutomaticTrackingAccount(
          input.values?.accountId ?? review.proposedValues.accountId
        );
      const next = repository.updateReview(review.id, {
        status:
          input.action === 'confirm'
            ? 'resolved'
            : input.action === 'ignore'
              ? 'ignored'
              : 'failed',
        resolvedAt: Date.now()
      });
      await persist();
      return mutation(next, ['tracking.review', 'tracking.status']);
    },
    async getDuplicate(id) {
      await ensureReady();
      return repository.requireDuplicate(id);
    },
    async resolveDuplicate(id, resolution: DuplicateResolution) {
      await ensureReady();
      if (resolution === 'keep_new' || resolution === 'keep_both') {
        const duplicate = repository.requireDuplicate(id);
        await assertAutomaticTrackingAccount(
          repository.requireEvent(duplicate.detectedEventId).accountId
        );
      }
      const duplicate = repository.updateDuplicate(id, resolution);
      await persist();
      return mutation(duplicate, ['tracking.review', 'tracking.history']);
    },
    async listKeywordRules(query?: RuleQuery) {
      const search = query?.search?.trim().toLocaleLowerCase('en') ?? '';
      const language = query?.language ?? 'all';
      return (await storage.loadKeywords())
        .filter((rule) => language === 'all' || rule.language === language)
        .filter(
          (rule) =>
            !search || rule.value.toLocaleLowerCase('en').includes(search)
        )
        .map((rule): KeywordRuleSummary => ({
          ...rule,
          recentUseCount: 0,
          lastUsedAt: null
        }));
    },
    async saveKeywordRules(rules) {
      await storage.saveKeywords([...rules]);
      return mutation(await this.listKeywordRules(), [
        'tracking.keywords',
        'tracking.status'
      ]);
    },
    async restoreDefaultKeywords() {
      await storage.saveKeywords(defaultKeywordRules);
      return mutation(await this.listKeywordRules(), [
        'tracking.keywords',
        'tracking.status'
      ]);
    },
    async listSenderRules(query?: SenderQuery) {
      await ensureReady();
      return repository.listSenders(query?.search);
    },
    async saveSenderRule(input: SenderRuleInput) {
      await ensureReady();
      const sender = repository.saveSender({
        id: input.id,
        normalizedSender: normalizeSender(input.sender),
        displayLabel: input.displayLabel,
        institutionKey: input.institutionKey ?? null,
        origin: input.origin ?? 'custom',
        enabled: input.enabled ?? true,
        trusted: input.trusted ?? false,
        recentUseCount: 0,
        lastUsedAt: null
      });
      await persist();
      return mutation(sender, ['tracking.senders', 'tracking.status']);
    },
    async removeCustomSender(id) {
      await ensureReady();
      const removed = repository.removeCustomSender(id);
      await persist();
      return mutation(removed, ['tracking.senders', 'tracking.status']);
    },
    async undoAutomaticAddition(feedbackId) {
      const replay = undoResults.get(feedbackId);
      if (replay) return replay;
      const result = (async () => {
        await ensureReady();
        const feedback = repository.requireFeedback(feedbackId);
        if (feedback.status !== 'active')
          return mutation(feedback, ['tracking.feedback']);
        if (Date.now() > feedback.undoExpiresAt)
          throw new TrackingError('expired_undo');
        await financeService.deleteTransaction(feedback.transactionId);
        const next = repository.updateFeedback(feedback.id, 'undone');
        const event = repository.requireEvent(feedback.detectedEventId);
        await notificationService.createFromSource(undoneNotification(event));
        await persist();
        return mutation(next, [
          'tracking.feedback',
          'tracking.status',
          'transactions.list',
          'home.summary'
        ]);
      })();
      undoResults.set(feedbackId, result);
      try {
        return await result;
      } catch (error) {
        undoResults.delete(feedbackId);
        throw error;
      }
    },
    async reportWrongDetection(eventId) {
      await ensureReady();
      const event = repository.updateEvent(eventId, {
        decisionStatus: 'rejected'
      });
      await persist();
      return mutation(event, ['tracking.history', 'tracking.status']);
    }
  };
}

let demoAutomaticTrackingRepository: AutomaticTrackingRepository | null = null;

export function createProductionAutomaticTrackingService(
  locale: Locale = 'ar'
): CapabilityProviderHandle<AutomaticTrackingService> {
  const demoMode = isDemoModeEnabled();
  const repository = new AutomaticTrackingRepository(
    demoMode
      ? createClientDemoData(Date.now(), 'Asia/Riyadh', locale).tracking
      : {}
  );
  if (demoMode) demoAutomaticTrackingRepository = repository;
  const service = createMockAutomaticTrackingService({
    repository,
    persistent:
      !demoMode && Platform.OS !== 'web' && process.env.NODE_ENV !== 'test',
    notificationService: assistantNotificationsService,
    permissionService: createTrackingPermissionService(),
    registerForReset: true
  });
  if (demoMode)
    return {
      ...service,
      metadata: { ...service.metadata, id: 'demo-automatic-tracking' }
    };
  const rejectMutation = async () => {
    throw new TrackingError('permission_required');
  };
  const unavailableStatus = async () => ({
    ...(await service.getStatus()),
    permissionStatus: 'unavailable' as const,
    serviceState: 'unavailable' as const
  });
  return {
    ...service,
    metadata: {
      ...service.metadata,
      id: 'unavailable-automatic-tracking',
      availability: 'unavailable'
    },
    getStatus: unavailableStatus,
    refreshStatus: unavailableStatus,
    setMode: rejectMutation,
    processMockEvent: rejectMutation,
    resolveReview: rejectMutation,
    resolveDuplicate: rejectMutation,
    saveKeywordRules: rejectMutation,
    restoreDefaultKeywords: rejectMutation,
    saveSenderRule: rejectMutation,
    removeCustomSender: rejectMutation,
    undoAutomaticAddition: rejectMutation,
    reportWrongDetection: rejectMutation
  };
}

export const automaticTrackingService =
  process.env.NODE_ENV === 'test'
    ? createMockAutomaticTrackingService()
    : createProductionAutomaticTrackingService();

export function relocalizeDemoAutomaticTrackingRepository(
  locale: Locale
): void {
  demoAutomaticTrackingRepository?.relocalizeDemoFixtures(
    createClientDemoData(Date.now(), 'Asia/Riyadh', locale).tracking
  );
}

function page<T>(items: T[], cursor: string | null = null, pageSize = 50) {
  const start = cursor
    ? Math.max(0, items.findIndex((item) => idOf(item) === cursor) + 1)
    : 0;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    total: items.length,
    nextCursor:
      start + pageSize < items.length
        ? (idOf(pageItems[pageItems.length - 1]) ?? null)
        : null
  };
}

function idOf(value: unknown): string | null {
  return typeof value === 'object' && value && 'id' in value
    ? String(value.id)
    : null;
}

function mutation<T>(
  value: T,
  affectedScopes: readonly string[]
): TrackingMutationResult<T> {
  return { value, affectedScopes: [...new Set(affectedScopes)] };
}

function autoAddedNotification(
  event: Pick<
    DetectedFinancialEvent,
    | 'id'
    | 'eventType'
    | 'priorEventId'
    | 'occurredAt'
    | 'createdAt'
    | 'transactionId'
  >,
  undoExpiresAt: number
): NotificationSourceEvent {
  const kind = trackingNotificationKind(event);
  return sourceNotification(event, kind, 'auto-added', {
    target: event.transactionId
      ? { kind: 'transaction', transactionId: event.transactionId }
      : null,
    availableActions: [
      { kind: 'view', expiresAt: null, sourceVersion: 1 },
      { kind: 'undo', expiresAt: undoExpiresAt, sourceVersion: 1 }
    ],
    category: kind === 'income' ? 'income' : 'transaction'
  });
}

function reviewNotification(
  event: Pick<
    DetectedFinancialEvent,
    'id' | 'eventType' | 'priorEventId' | 'occurredAt' | 'createdAt'
  >,
  reviewId: string,
  outcome: 'review-required' | 'duplicate' = 'review-required'
): NotificationSourceEvent {
  return sourceNotification(event, trackingNotificationKind(event), outcome, {
    target: { kind: 'review', reviewId },
    availableActions: [{ kind: 'view', expiresAt: null, sourceVersion: 1 }]
  });
}

function undoneNotification(event: {
  id: string;
  eventType: MockFinancialEventInput['eventType'];
  priorEventId: string | null;
  occurredAt: number | null;
  createdAt: number;
}): NotificationSourceEvent {
  return sourceNotification(event, trackingNotificationKind(event), 'undone', {
    target: null,
    availableActions: []
  });
}

function sourceNotification(
  event: { id: string; occurredAt: number | null; createdAt: number },
  kind: string,
  outcome: string,
  patch: Pick<NotificationSourceEvent, 'availableActions' | 'target'> &
    Partial<Pick<NotificationSourceEvent, 'category'>>
): NotificationSourceEvent {
  return {
    eventKey: `tracking:${event.id}:${outcome}`,
    category: patch.category ?? 'transaction',
    eventType: `tracking.${kind}.${outcome}`,
    titleKey: `notifications.tracking.${kind}.${outcome}.title`,
    bodyKey: `notifications.tracking.${kind}.${outcome}.body`,
    messageValues: { kind, outcome },
    sensitivity: 'protected',
    target: patch.target,
    availableActions: patch.availableActions,
    occurredAt: event.occurredAt ?? event.createdAt
  };
}

function trackingNotificationKind(event: {
  eventType: MockFinancialEventInput['eventType'];
  priorEventId: string | null;
}): 'expense' | 'income' | 'refund' | 'correction' | 'reversal' {
  if (event.eventType === 'refund') return 'refund';
  if (event.eventType === 'reversal') return 'reversal';
  if (event.priorEventId) return 'correction';
  if (
    event.eventType === 'deposit' ||
    event.eventType === 'salary' ||
    event.eventType === 'incoming_transfer'
  )
    return 'income';
  return 'expense';
}
