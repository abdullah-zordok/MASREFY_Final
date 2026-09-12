import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';

import type {
  AutomaticFeedback,
  DuplicateCandidate,
  KeywordRuleSummary,
  ReviewItem,
  SenderRule,
  TrackingHistoryEntry,
  TrackingImportSession,
  TrackingReasonCode,
  TrackingStatusSnapshot
} from '@/domain/automatic-tracking';
import type { KeywordRule } from '@/domain/app-shell';
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

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () =>
  Promise.reject(new TrackingError('permission_required'));

export function configureAutomaticTrackingTokenProvider(
  provider: TokenProvider
): void {
  tokenProvider = provider;
}

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TrackingError('unknown');
  return value as Json;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new TrackingError('unknown');
  return value;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new TrackingError('unknown');
  return Number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TrackingError('unknown');
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function probabilityBasisPoints(value: unknown): number {
  const parsed =
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
    throw new TrackingError('unknown');
  return Math.round(parsed * 10_000);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TrackingError('unknown');
  return value.map(text);
}

function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new TrackingError('unknown');
  return value as T;
}

function epoch(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredEpoch(value: unknown): number {
  const parsed = epoch(value);
  if (parsed === null) throw new TrackingError('unknown');
  return parsed;
}

function nullableEpoch(value: unknown): number | null {
  if (value === null) return null;
  return requiredEpoch(value);
}

function reasons(value: unknown): TrackingReasonCode[] {
  const allowed = new Set<TrackingReasonCode>([
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
  ]);
  const aliases: Record<string, TrackingReasonCode> = {
    duplicate_candidate: 'duplicate',
    review_required: 'review_all'
  };
  const mapped = Array.isArray(value)
    ? value.map((item) => {
        const mapped = typeof item === 'string' ? (aliases[item] ?? item) : '';
        if (!allowed.has(mapped as TrackingReasonCode))
          throw new TrackingError('unknown');
        return mapped as TrackingReasonCode;
      })
    : [];
  if (!Array.isArray(value) || mapped.length !== value.length)
    throw new TrackingError('unknown');
  return mapped;
}

function trackingPage(value: unknown): {
  items: Json[];
  nextCursor: string | null;
} {
  const response = record(value);
  if (
    Object.keys(response).some(
      (key) => !['items', 'nextCursor'].includes(key)
    ) ||
    !Array.isArray(response.items) ||
    (response.nextCursor !== null && typeof response.nextCursor !== 'string')
  )
    throw new TrackingError('unknown');
  return {
    items: response.items.map(record),
    nextCursor: response.nextCursor
  };
}

function listPath(
  path: string,
  values: Record<string, string | number | null | undefined>
): string {
  const query = Object.entries(values)
    .filter(
      (entry): entry is [string, string | number] =>
        entry[1] !== null && entry[1] !== undefined
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join('&');
  return query ? `${path}?${query}` : path;
}

function resource(value: unknown): Json {
  const response = record(value);
  return 'resource' in response ? record(response.resource) : response;
}

export function createLiveAutomaticTrackingService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token = () => tokenProvider(),
  request = fetch
}: {
  baseUrl?: string;
  token?: TokenProvider;
  request?: typeof fetch;
} = {}): CapabilityProviderHandle<AutomaticTrackingService> {
  const keywordVersions = new Map<string, number>();
  const senderVersions = new Map<string, number>();
  const send = async (
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<unknown> => {
    const response = await request(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(method === 'GET'
          ? {}
          : { 'Idempotency-Key': idempotencyKey ?? randomUUID() }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const value: unknown =
      response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = record(value);
      const code = text(error.code || record(error.error ?? {}).code);
      throw new TrackingError(
        code === 'TRACKING_ACCOUNT_BLOCKED'
          ? 'account_blocked'
          : response.status === 409
            ? 'conflict'
            : response.status === 404
              ? 'not_found'
              : code === 'REVIEW_REQUIRED'
                ? 'review_required'
                : 'unknown'
      );
    }
    return value;
  };
  const get = (path: string) => send('GET', path);
  const allPages = async (path: string): Promise<Json[]> => {
    const items: Json[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const response = trackingPage(
        await get(listPath(path, { limit: 100, cursor }))
      );
      items.push(...response.items);
      cursor = response.nextCursor;
      if (cursor && cursors.has(cursor)) throw new TrackingError('unknown');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return items;
  };
  const review = (value: Json): ReviewItem => ({
    id: text(value.id),
    detectedEventId: text(value.importItemId ?? value.itemId),
    status: {
      pending: 'pending',
      rejected: 'ignored',
      accepted: 'resolved',
      edited: 'resolved'
    }[
      member(value.status, ['pending', 'rejected', 'accepted', 'edited'])
    ] as ReviewItem['status'],
    reasonCodes: reasons([value.reason]),
    missingFields: [],
    proposedValues: record(value.proposedValues),
    selectedDuplicateResolution: null,
    selectedObligationId: null,
    resolutionErrorCode: null,
    createdAt: requiredEpoch(value.createdAt),
    resolvedAt: nullableEpoch(value.reviewedAt),
    updatedAt: requiredEpoch(value.updatedAt)
  });
  const duplicate = (value: Json): DuplicateCandidate => ({
    id: text(value.id),
    detectedEventId: text(value.leftItemId),
    existingTransactionId: text(value.rightTransactionId),
    probabilityBasisPoints: probabilityBasisPoints(value.score),
    reasonCodes: strings(value.reasons),
    resolution:
      value.resolution === null
        ? null
        : member<DuplicateResolution>(value.resolution, [
            'keep_existing',
            'keep_new',
            'keep_both',
            'merge_details'
          ]),
    status: {
      proposed: 'pending',
      duplicate: 'resolved',
      not_duplicate: 'resolved'
    }[
      member(value.status, ['proposed', 'duplicate', 'not_duplicate'])
    ] as DuplicateCandidate['status'],
    resolvedAt: nullableEpoch(value.decidedAt)
  });
  const importSession = (value: Json): TrackingImportSession => ({
    id: text(value.id),
    status: member(value.status, [
      'received',
      'processing',
      'review',
      'complete',
      'failed',
      'cancelled'
    ]),
    itemCount: integer(value.itemCount),
    acceptedCount: integer(value.acceptedCount),
    rejectedCount: integer(value.rejectedCount),
    completedAt: nullableEpoch(value.completedAt),
    updatedAt: requiredEpoch(value.updatedAt)
  });
  const status = async (): Promise<TrackingStatusSnapshot> => {
    const value = record(await get('/api/v1/tracking/status'));
    const available = boolean(value.available);
    return {
      platform:
        Platform.OS === 'android'
          ? 'android'
          : Platform.OS === 'ios'
            ? 'ios'
            : 'conservative',
      mode: member(value.mode, ['automatic_clear', 'review_all', 'paused']),
      permissionStatus: null,
      serviceState: available ? 'healthy' : 'unavailable',
      lastDetectedAt: nullableEpoch(value.lastDetectedAt),
      lastSuccessfulTransactionId: nullableText(
        value.lastSuccessfulTransactionId
      ),
      detectedThisMonth: integer(value.detectedThisMonth),
      reviewCount: integer(value.reviewCount),
      activeKeywordCount: integer(value.activeKeywordCount),
      activeSenderCount: integer(value.activeSenderCount),
      lastUpdatedAt: requiredEpoch(value.lastUpdatedAt)
    };
  };
  return {
    metadata: {
      id: 'phase08-tracking-http',
      capability: automaticTrackingServiceCapability.capability,
      majorVersion: automaticTrackingServiceCapability.majorVersion,
      kind: 'live',
      availability: 'available'
    },
    async submitImport(input, idempotencyKey) {
      return importSession(
        resource(
          await send('POST', '/api/v1/imports', input, idempotencyKey)
        )
      );
    },
    getImportSession: async (id) =>
      importSession(
        record(await get(`/api/v1/imports/${encodeURIComponent(id)}`))
      ),
    async listDuplicates() {
      return (await allPages('/api/v1/duplicates')).map(duplicate);
    },
    getStatus: status,
    refreshStatus: status,
    async setMode(mode) {
      const current = resource(await get('/api/v1/tracking/preferences'));
      await send('PUT', '/api/v1/tracking/preferences', {
        enabled: mode !== 'paused',
        reviewRequired: mode !== 'automatic_clear',
        sourceRetentionDays: integer(current.sourceRetentionDays),
        historyRetentionDays: integer(current.historyRetentionDays),
        expectedVersion: integer(current.version)
      });
      return status();
    },
    clearHistory: async () => {
      const entries = await allPages('/api/v1/tracking/history');
      const cleared = entries.filter(
        (entry) =>
          entry.transactionId === null &&
          !['accepted', 'duplicate'].includes(text(entry.outcome))
      ).length;
      await send('DELETE', '/api/v1/tracking/history');
      return { value: cleared, affectedScopes: ['tracking.history'] };
    },
    purgeExpiredSourceText: () => Promise.resolve(0),
    async processMockEvent() {
      throw new TrackingError('permission_required');
    },
    async listHistory(query?: TrackingHistoryQuery) {
      const response = trackingPage(
        await get(
          listPath('/api/v1/tracking/history', {
            limit: query?.pageSize ?? 50,
            cursor: query?.cursor
          })
        )
      );
      const items = response.items.map((value): TrackingHistoryEntry => ({
        id: text(value.id),
        detectedEventId: text(value.sourceRef),
        action: {
          received: 'detected',
          parsed: 'detected',
          reviewed: 'sent_to_review',
          accepted: 'auto_added',
          rejected: 'rejected',
          duplicate: 'linked',
          failed: 'rejected',
          purged: 'source_purged',
          feedback: 'reported_wrong'
        }[
          member(value.outcome, [
            'received',
            'parsed',
            'reviewed',
            'accepted',
            'rejected',
            'duplicate',
            'failed',
            'purged',
            'feedback'
          ])
        ] as TrackingHistoryEntry['action'],
        reasonCodes: reasons(value.reasonCodes),
        occurredAt: requiredEpoch(value.occurredAt)
      }));
      return { items, nextCursor: response.nextCursor, total: items.length };
    },
    async getDetectedEvent(id) {
      const item = (await allPages('/api/v1/tracking/history')).find(
        (value) => value.sourceRef === id || value.id === id
      );
      if (!item) throw new TrackingError('not_found');
      const outcome = member(item.outcome, [
        'received',
        'parsed',
        'reviewed',
        'accepted',
        'rejected',
        'duplicate',
        'failed',
        'purged',
        'feedback'
      ]);
      return {
        id,
        sourceFingerprint: text(item.sourceRef),
        sourceKind: member(item.sourceType, [
          'android_sms',
          'android_notification',
          'ios_shortcut',
          'ios_app_intent',
          'ios_share_extension',
          'manual'
        ]),
        eventType: member(item.eventType, [
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
        ]),
        decisionStatus: (
          {
            received: 'received',
            parsed: 'analyzing',
            reviewed: 'review_required',
            accepted: 'auto_added',
            rejected: 'rejected',
            duplicate: 'resolved',
            failed: 'failed',
            purged: 'ignored',
            feedback: 'rejected'
          } as const
        )[outcome],
        confidenceBasisPoints: integer(item.confidenceBasisPoints),
        amountMinor:
          item.amountMinor === null ? null : integer(item.amountMinor),
        currencyCode: nullableText(item.currencyCode),
        merchant: nullableText(item.merchant),
        categoryId: nullableText(item.categoryId),
        accountHint: null,
        accountId: nullableText(item.accountId),
        paymentMethod: nullableText(item.paymentMethod),
        occurredAt: nullableEpoch(item.occurredAt),
        sourceText: null,
        sourceTextExpiresAt: null,
        reasonCodes: reasons(item.reasonCodes),
        priorEventId: null,
        transactionId:
          typeof item.transactionId === 'string' ? item.transactionId : null,
        obligationMatchId: null,
        createdAt: requiredEpoch(item.createdAt),
        updatedAt: requiredEpoch(item.updatedAt)
      };
    },
    async listReviewItems(query?: ReviewQuery) {
      if (query?.status === 'resolving' || query?.status === 'failed')
        return { items: [], nextCursor: null, total: 0 };
      const status =
        query?.status === 'ignored'
          ? 'rejected'
          : query?.status === 'resolved'
            ? 'accepted'
            : query?.status;
      const response = trackingPage(
        await get(
          listPath('/api/v1/reviews', {
            limit: query?.pageSize ?? 50,
            cursor: query?.cursor,
            status
          })
        )
      );
      const items = response.items.map(review);
      return { items, nextCursor: response.nextCursor, total: items.length };
    },
    getReviewItem: async (id) =>
      review(record(await get(`/api/v1/reviews/${encodeURIComponent(id)}`))),
    async resolveReview(id, input) {
      const currentValue = record(
        await get(`/api/v1/reviews/${encodeURIComponent(id)}`)
      );
      const accepts = input.action === 'confirm';
      const value = record(
        await send(
          'POST',
          `/api/v1/reviews/${encodeURIComponent(id)}/decision`,
          {
            decision: !accepts
              ? 'reject'
              : input.values
                ? 'edit_accept'
                : 'accept',
            expectedVersion: integer(currentValue.version),
            ...(accepts && input.values ? { edit: input.values } : {})
          }
        )
      );
      return {
        value: review(resource(value)),
        affectedScopes: accepts
          ? ['tracking.reviews', 'transactions']
          : ['tracking.reviews', 'tracking.history']
      };
    },
    getDuplicate: async (id) =>
      duplicate(
        record(await get(`/api/v1/duplicates/${encodeURIComponent(id)}`))
      ),
    async resolveDuplicate(id, resolution) {
      const current = record(
        await get(`/api/v1/duplicates/${encodeURIComponent(id)}`)
      );
      const value = record(
        await send(
          'POST',
          `/api/v1/duplicates/${encodeURIComponent(id)}/decision`,
          { resolution, expectedVersion: integer(current.version) }
        )
      );
      return {
        value: duplicate(resource(value)),
        affectedScopes: ['tracking.duplicates', 'transactions']
      };
    },
    async listKeywordRules(_query?: RuleQuery) {
      return (await allPages('/api/v1/tracking/keyword-rules')).map(
        (value): KeywordRuleSummary => {
          const id = text(value.id);
          keywordVersions.set(id, integer(value.version));
          return {
            id,
            group: member(value.groupKey, [
              'expense',
              'income',
              'transfer',
              'withdrawal',
              'deposit',
              'refund',
              'subscription',
              'installment',
              'fee',
              'failed_transaction',
              'reversal'
            ]),
            language: member(value.languageCode, ['ar', 'en']),
            value: text(value.keyword),
            normalizedValue: text(value.keyword)
              .normalize('NFKC')
              .toLocaleLowerCase('en'),
            origin: member(value.origin, ['default', 'custom']),
            enabled: value.enabled === true,
            recentUseCount: integer(value.recentUseCount),
            lastUsedAt: nullableEpoch(value.lastUsedAt)
          };
        }
      );
    },
    async saveKeywordRules(rules: readonly KeywordRule[]) {
      await this.listKeywordRules();
      await Promise.all(
        rules.map((rule) =>
          send(
            rule.id ? 'PATCH' : 'POST',
            rule.id
              ? `/api/v1/tracking/keyword-rules/${encodeURIComponent(rule.id)}`
              : '/api/v1/tracking/keyword-rules',
            {
              value: rule.value,
              group: rule.group,
              language: rule.language,
              enabled: rule.enabled,
              ...(rule.id
                ? { expectedVersion: keywordVersions.get(rule.id) }
                : {})
            }
          )
        )
      );
      return {
        value: await this.listKeywordRules(),
        affectedScopes: ['tracking.keywords']
      };
    },
    async restoreDefaultKeywords() {
      await send('POST', '/api/v1/tracking/keyword-rules/restore-defaults');
      return {
        value: await this.listKeywordRules(),
        affectedScopes: ['tracking.keywords']
      };
    },
    async listSenderRules(_query?: SenderQuery) {
      return (await allPages('/api/v1/tracking/sender-rules')).map(
        (value): SenderRule => {
          const id = text(value.id);
          senderVersions.set(id, integer(value.version));
          return {
            id,
            normalizedSender: text(value.senderPattern),
            displayLabel: text(value.displayLabel),
            institutionKey:
              typeof value.institutionId === 'string'
                ? value.institutionId
                : null,
            origin: 'custom',
            enabled: value.enabled === true,
            trusted: value.trusted === true,
            recentUseCount: integer(value.recentUseCount),
            lastUsedAt: nullableEpoch(value.lastUsedAt),
            createdAt: requiredEpoch(value.createdAt),
            updatedAt: requiredEpoch(value.updatedAt)
          };
        }
      );
    },
    async saveSenderRule(input: SenderRuleInput) {
      await this.listSenderRules();
      const value = resource(
        await send(
          input.id ? 'PATCH' : 'POST',
          input.id
            ? `/api/v1/tracking/sender-rules/${encodeURIComponent(input.id)}`
            : '/api/v1/tracking/sender-rules',
          {
            value: input.sender,
            displayLabel: input.displayLabel,
            institutionId: input.institutionKey,
            trusted: input.trusted ?? false,
            enabled: input.enabled ?? true,
            ...(input.id
              ? { expectedVersion: senderVersions.get(input.id) }
              : {})
          }
        )
      );
      const saved = (await this.listSenderRules()).find(
        (item) => item.id === text(value.id)
      );
      if (!saved) throw new TrackingError('unknown');
      return {
        value: saved,
        affectedScopes: ['tracking.senders']
      };
    },
    async removeCustomSender(id) {
      await this.listSenderRules();
      const version = senderVersions.get(id);
      if (version === undefined) throw new TrackingError('not_found');
      await send(
        'DELETE',
        `/api/v1/tracking/sender-rules/${encodeURIComponent(id)}?expectedVersion=${String(version)}`
      );
      return { value: id, affectedScopes: ['tracking.senders'] };
    },
    async undoAutomaticAddition(
      feedbackId
    ): Promise<TrackingMutationResult<AutomaticFeedback>> {
      const history = (await allPages('/api/v1/tracking/history')).find(
        (item) => item.id === feedbackId
      );
      if (!history || typeof history.transactionId !== 'string')
        throw new TrackingError('not_found');
      const transactionId = text(history.transactionId);
      const current = record(
        record(
          await get(`/api/v1/transactions/${encodeURIComponent(transactionId)}`)
        ).transaction
      );
      await send(
        'POST',
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/reverse`,
        {
          expectedVersion: current.version,
          reason: 'Undo automatic tracking addition'
        }
      );
      const feedback = resource(
        await send('POST', '/api/v1/tracking/feedback', {
          historyId: feedbackId,
          kind: 'other',
          comment: 'automatic_action_undone'
        })
      );
      const occurredAt = requiredEpoch(feedback.createdAt);
      return {
        value: {
          id: text(feedback.id),
          detectedEventId: text(history.sourceRef),
          transactionId,
          kind: 'automatic_action_undone',
          undoExpiresAt: occurredAt,
          notificationOutcome: 'disabled',
          status: 'undone',
          createdAt: occurredAt,
          updatedAt: occurredAt
        },
        affectedScopes: [
          'tracking.feedback',
          'transactions.list',
          'home.summary'
        ]
      };
    },
    async reportWrongDetection(eventId) {
      const entries = await allPages('/api/v1/tracking/history');
      const history = entries.find(
        (item) => item.sourceRef === eventId || item.id === eventId
      );
      if (!history) throw new TrackingError('not_found');
      const feedback = resource(
        await send('POST', '/api/v1/tracking/feedback', {
          historyId: history.id,
          kind: 'wrong_detection'
        })
      );
      const event = await this.getDetectedEvent(eventId);
      return {
        value: {
          ...event,
          decisionStatus: 'rejected',
          updatedAt: requiredEpoch(feedback.createdAt)
        },
        affectedScopes: ['tracking.history', 'tracking.status']
      };
    }
  };
}
