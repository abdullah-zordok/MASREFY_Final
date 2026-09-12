import * as Crypto from 'expo-crypto';

import { resolveClientMode } from '@/config/client-runtime';
import type {
  KeywordRuleSummary,
  SenderRule,
  TrackingImportSession,
  TrackingMode,
  TrackingStatusSnapshot
} from '@/domain/automatic-tracking';
import type { Account } from '@/domain/core-finance';
import {
  prepareSmsImport,
  type PreparedSmsImport
} from '@/features/tracking/sms-import';
import { useAppShellStore } from '@/state/app-shell';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  SmsImportQueue,
  type SmsImportQueueEntry,
  type SmsRuleSnapshot
} from '@/storage/sms-import-queue';
import { automaticTrackingService } from './automatic-tracking-service';
import type { AutomaticTrackingService } from './contracts/automatic-tracking-service';
import type { TrackingPermissionService } from './contracts/app-shell-service';
import type { CoreFinanceService } from './contracts/core-finance-service';
import { coreFinanceService } from './mocks/core-finance-service';
import { createTrackingPermissionService } from './platform/tracking-permission-service';
import {
  smsInboxService,
  type SmsInboxService
} from './platform/sms-inbox-service';

export type AutomaticTrackingSyncStatus =
  | 'idle'
  | 'scanning'
  | 'queued'
  | 'processing'
  | 'imported'
  | 'review'
  | 'duplicate'
  | 'account_required'
  | 'error';

export interface AutomaticTrackingSyncState {
  status: AutomaticTrackingSyncStatus;
  sessionId: string | null;
  reviewId: string | null;
  duplicateId: string | null;
  errorCode: string | null;
}

interface CoordinatorDependencies {
  isLive(): boolean;
  session(): { status: string; userId: string | null } | null;
  offlineMode(): TrackingMode | null;
  tracking: Pick<
    AutomaticTrackingService,
    | 'getStatus'
    | 'listKeywordRules'
    | 'listSenderRules'
    | 'submitImport'
    | 'getImportSession'
    | 'listImportItemIds'
    | 'listReviewItems'
    | 'listDuplicates'
  >;
  permission: Pick<TrackingPermissionService, 'getState'>;
  inbox: SmsInboxService;
  listAccounts: CoreFinanceService['listAccounts'];
  listCachedAccounts(): Promise<Account[]>;
  queue: SmsImportQueue;
  prepare: typeof prepareSmsImport;
  now(): number;
}

const idleState: AutomaticTrackingSyncState = {
  status: 'idle',
  sessionId: null,
  reviewId: null,
  duplicateId: null,
  errorCode: null
};

export function createAutomaticTrackingCoordinator(
  dependencies: CoordinatorDependencies
) {
  let state = idleState;
  let running: Promise<AutomaticTrackingSyncState> | null = null;
  const listeners = new Set<() => void>();
  const update = (
    status: AutomaticTrackingSyncStatus,
    patch: Partial<AutomaticTrackingSyncState> = {}
  ) => {
    state = { ...idleState, status, ...patch };
    listeners.forEach((listener) => listener());
    return state;
  };

  const execute = async (): Promise<AutomaticTrackingSyncState> => {
    const session = dependencies.session();
    if (
      !dependencies.isLive() ||
      session?.status !== 'authenticated' ||
      !session.userId
    ) {
      return update('idle');
    }
    try {
      const ownerId = session.userId;
      const queue = await dependencies.queue.load(ownerId);
      const online = await dependencies.inbox.isNetworkAvailable();
      let mode = queue.mode ?? dependencies.offlineMode();
      let status: TrackingStatusSnapshot | null = null;
      if (online) {
        status = await dependencies.tracking.getStatus();
        mode = status.mode;
      }
      if (
        mode === 'paused' ||
        status?.serviceState === 'unavailable' ||
        !dependencies.inbox.available
      ) {
        return update('idle');
      }
      const permission = await dependencies.permission.getState();
      if (permission.status !== 'granted') return update('idle');

      if (online && queue.pending.length) {
        return await flush(ownerId, queue.pending, dependencies, update);
      }

      const rules = online
        ? await onlineRules(ownerId, mode!, dependencies)
        : cachedRules(queue.rules);
      const accounts = online
        ? await dependencies.listAccounts()
        : await dependencies.listCachedAccounts();
      update('scanning');
      const since = queue.cursor ?? Math.max(0, dependencies.now() - 7 * 86_400_000);
      const messages = await dependencies.inbox.readRecent({ since, limit: 100 });
      const prepared = await dependencies.prepare(messages, {
        ...rules,
        accounts,
        knownFingerprints: new Set(queue.fingerprints)
      });
      if (!prepared.events.length) {
        if (prepared.accountRequiredCount) return update('account_required');
        if (prepared.newestReceivedAt !== null)
          await dependencies.queue.checkpoint(
            ownerId,
            prepared.newestReceivedAt,
            prepared.skippedFingerprints,
            mode ?? undefined
          );
        return update('idle');
      }

      const idempotencyKey = await importKey(prepared);
      const cursor = prepared.accountRequiredCount
        ? (queue.cursor ?? since)
        : (prepared.newestReceivedAt ?? since);
      const queued = await dependencies.queue.enqueue(ownerId, {
        idempotencyKey,
        submission: {
          schemaVersion: 1,
          sourceType: 'sms',
          sourceChannel: 'android_sms',
          events: prepared.events
        },
        cursor,
        fingerprints: [
          ...prepared.events.map((event) => event.sourceItemKey),
          ...prepared.skippedFingerprints
        ],
        mode: mode ?? undefined
      });
      if (!online)
        return update(
          prepared.accountRequiredCount ? 'account_required' : 'queued'
        );
      return await flush(ownerId, queued.pending, dependencies, update);
    } catch {
      return update('error', { errorCode: 'sync_failed' });
    }
  };

  return {
    sync(): Promise<AutomaticTrackingSyncState> {
      if (running) return running;
      running = execute().finally(() => {
        running = null;
      });
      return running;
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

async function onlineRules(
  ownerId: string,
  mode: TrackingMode,
  dependencies: CoordinatorDependencies
) {
  const [keywordRules, senderRules] = await Promise.all([
    dependencies.tracking.listKeywordRules(),
    dependencies.tracking.listSenderRules()
  ]);
  await dependencies.queue.saveRules(ownerId, {
    keywords: keywordRules.map(({ value, enabled }) => ({ value, enabled })),
    senders: senderRules.map(
      ({ normalizedSender, enabled, trusted }) => ({
        normalizedSender,
        enabled,
        trusted
      })
    )
  });
  await dependencies.queue.checkpoint(ownerId, 0, [], mode);
  return { keywordRules, senderRules };
}

function cachedRules(rules: SmsRuleSnapshot): {
  keywordRules: KeywordRuleSummary[];
  senderRules: SenderRule[];
} {
  return {
    keywordRules: rules.keywords.map((rule, index) => ({
      id: `cached-keyword-${index}`,
      group: 'expense',
      language: 'en',
      value: rule.value,
      normalizedValue: rule.value.normalize('NFKC').toLocaleLowerCase('en'),
      origin: 'custom',
      enabled: rule.enabled,
      recentUseCount: 0,
      lastUsedAt: null
    })),
    senderRules: rules.senders.map((rule, index) => ({
      id: `cached-sender-${index}`,
      normalizedSender: rule.normalizedSender,
      displayLabel: rule.normalizedSender,
      institutionKey: null,
      origin: 'custom',
      enabled: rule.enabled,
      trusted: rule.trusted,
      recentUseCount: 0,
      lastUsedAt: null,
      createdAt: 0,
      updatedAt: 0
    }))
  };
}

async function importKey(prepared: PreparedSmsImport): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    prepared.events.map((event) => event.sourceItemKey).join('|')
  );
  return `sms:${digest}`;
}

async function flush(
  ownerId: string,
  pending: readonly SmsImportQueueEntry[],
  dependencies: CoordinatorDependencies,
  update: (
    status: AutomaticTrackingSyncStatus,
    patch?: Partial<AutomaticTrackingSyncState>
  ) => AutomaticTrackingSyncState
): Promise<AutomaticTrackingSyncState> {
  let last = update('idle');
  for (const entry of pending) {
    let current: TrackingImportSession;
    if (entry.sessionId) {
      current = await dependencies.tracking.getImportSession(entry.sessionId);
    } else {
      current = await dependencies.tracking.submitImport(
        entry.submission,
        entry.idempotencyKey
      );
      await dependencies.queue.markSubmitted(
        ownerId,
        entry.idempotencyKey,
        current.id
      );
    }
    if (current.status === 'received' || current.status === 'processing')
      return update('processing', { sessionId: current.id });
    if (current.status === 'review') {
      const itemIds = new Set(
        await dependencies.tracking.listImportItemIds(current.id)
      );
      const [review, duplicates] = await Promise.all([
        findReview(itemIds, dependencies),
        dependencies.tracking.listDuplicates()
      ]);
      const duplicate = duplicates.find((item) =>
        itemIds.has(item.detectedEventId)
      );
      if (!review && !duplicate)
        return update('processing', { sessionId: current.id });
      await dependencies.queue.markTerminal(ownerId, entry.idempotencyKey);
      return duplicate
        ? update('duplicate', {
            sessionId: current.id,
            reviewId: review?.id ?? null,
            duplicateId: duplicate.id
          })
        : update('review', {
            sessionId: current.id,
            reviewId: review?.id ?? null
          });
    }
    await dependencies.queue.markTerminal(ownerId, entry.idempotencyKey);
    if (current.status === 'complete')
      last = update('imported', { sessionId: current.id });
    else
      return update('error', {
        sessionId: current.id,
        errorCode: `import_${current.status}`
      });
  }
  return last;
}

async function findReview(
  itemIds: ReadonlySet<string>,
  dependencies: CoordinatorDependencies
) {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = await dependencies.tracking.listReviewItems({
      status: 'pending',
      pageSize: 100,
      cursor
    });
    const review = page.items.find((item) => itemIds.has(item.detectedEventId));
    if (review) return review;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('review_cursor_loop');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return null;
}

const cachedAccounts = new CoreFinanceRepository();
let cachedAccountsReady: Promise<void> | null = null;
const coordinator = createAutomaticTrackingCoordinator({
  isLive: () => resolveClientMode() === 'live',
  session: () => useAppShellStore.getState().session,
  offlineMode: () =>
    useAppShellStore.getState().onboarding?.trackingPreference?.mode ?? null,
  tracking: automaticTrackingService,
  permission: createTrackingPermissionService(),
  inbox: smsInboxService,
  listAccounts: (...args) => coreFinanceService.listAccounts(...args),
  async listCachedAccounts() {
    cachedAccountsReady ??= cachedAccounts.hydrate();
    await cachedAccountsReady;
    return cachedAccounts.listAccounts();
  },
  queue: new SmsImportQueue(),
  prepare: prepareSmsImport,
  now: Date.now
});

export const syncAutomaticTracking = () => coordinator.sync();
export const getAutomaticTrackingSyncState = () => coordinator.getState();
export const subscribeAutomaticTrackingSyncState = (listener: () => void) =>
  coordinator.subscribe(listener);
