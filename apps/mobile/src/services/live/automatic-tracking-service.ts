import { Platform } from 'react-native';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID
} from 'expo-crypto';

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

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function epoch(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const mapped = Array.isArray(value)
    ? value.filter(
        (item): item is TrackingReasonCode =>
          typeof item === 'string' && allowed.has(item as TrackingReasonCode)
      )
    : [];
  return mapped.length ? mapped : ['invalid_input'];
}

function trackingPage(value: unknown): {
  items: Json[];
  nextCursor: string | null;
} {
  const response = record(value);
  const items = response.items ?? response.data;
  return {
    items: Array.isArray(items) ? items.map(record) : [],
    nextCursor:
      typeof response.nextCursor === 'string' ? response.nextCursor : null
  };
}

function page(value: unknown): Json[] {
  return trackingPage(value).items;
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
  return record(response.resource ?? response.data ?? response);
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
        response.status === 409
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
  const review = (value: Json): ReviewItem => ({
    id: text(value.id),
    detectedEventId: text(value.importItemId ?? value.itemId),
    status:
      value.status === 'pending'
        ? 'pending'
        : value.status === 'rejected'
          ? 'ignored'
          : 'resolved',
    reasonCodes: reasons([value.reason]),
    missingFields: [],
    proposedValues: record(value.proposedValues ?? {}),
    selectedDuplicateResolution: null,
    selectedObligationId: null,
    resolutionErrorCode: null,
    createdAt: epoch(value.createdAt) ?? Date.now(),
    resolvedAt: epoch(value.reviewedAt),
    updatedAt: epoch(value.updatedAt) ?? Date.now()
  });
  const duplicate = (value: Json): DuplicateCandidate => ({
    id: text(value.id),
    detectedEventId: text(value.leftItemId),
    existingTransactionId: text(value.rightTransactionId),
    probabilityBasisPoints: Math.round(Number(value.score ?? 0) * 10_000),
    reasonCodes: Array.isArray(value.reasons)
      ? value.reasons.map(String)
      : ['amount_currency'],
    resolution:
      typeof value.resolution === 'string'
        ? (value.resolution as DuplicateResolution)
        : null,
    status: value.status === 'proposed' ? 'pending' : 'resolved',
    resolvedAt: epoch(value.decidedAt)
  });
  const status = async (): Promise<TrackingStatusSnapshot> => {
    const value = record(await get('/api/v1/tracking/status'));
    return {
      platform:
        Platform.OS === 'android'
          ? 'android'
          : Platform.OS === 'ios'
            ? 'ios'
            : 'conservative',
      mode: text(value.mode, 'paused') as TrackingMode,
      permissionStatus: Platform.OS === 'android' ? 'granted' : null,
      serviceState: value.available === true ? 'healthy' : 'unavailable',
      lastDetectedAt: epoch(value.lastDetectedAt),
      lastSuccessfulTransactionId:
        typeof value.lastSuccessfulTransactionId === 'string'
          ? value.lastSuccessfulTransactionId
          : null,
      detectedThisMonth: Number(value.detectedThisMonth ?? 0),
      reviewCount: Number(value.reviewCount ?? 0),
      activeKeywordCount: Number(value.activeKeywordCount ?? 0),
      activeSenderCount: Number(value.activeSenderCount ?? 0),
      lastUpdatedAt: Date.now()
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
    getStatus: status,
    refreshStatus: status,
    async setMode(mode) {
      const current = resource(await get('/api/v1/tracking/preferences'));
      await send('PUT', '/api/v1/tracking/preferences', {
        mode,
        sourceRetentionDays: current.sourceRetentionDays ?? 30,
        historyRetentionDays: current.historyRetentionDays ?? 365,
        expectedVersion: current.version
      });
      return status();
    },
    clearHistory: async () => ({
      value: Number((await send('DELETE', '/api/v1/tracking/history')) ?? 0),
      affectedScopes: ['tracking.history']
    }),
    purgeExpiredSourceText: () => Promise.resolve(0),
    async processMockEvent(input) {
      const event = input as MockFinancialEventInput;
      const receivedAt = new Date(event.occurredAt ?? Date.now()).toISOString();
      const eventTime = event.occurredAt ?? Date.parse(receivedAt);
      const idempotencyKey = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        `tracking-import:${event.sourceFingerprint}`
      );
      const created = record(
        await send(
          'POST',
          '/api/v1/imports',
          {
            schemaVersion: 1,
            sourceType: 'manual',
            sourceChannel: 'manual',
            events: [
              {
                sourceItemKey: event.sourceFingerprint,
                body: event.sourceText ?? event.eventType,
                receivedAt,
                amountMinor: event.amountMinor,
                currency: event.currencyCode,
                merchant: event.merchant,
                ...(event.occurredAt == null
                  ? {}
                  : { occurredAt: new Date(eventTime).toISOString() }),
                kind:
                  event.eventType === 'salary' || event.eventType === 'deposit'
                    ? 'income'
                    : 'expense',
                accountId: event.accountId,
                categoryId: event.categoryId
              }
            ]
          },
          idempotencyKey
        )
      );
      const resource = record(created.resource ?? created);
      const detected: DetectedFinancialEvent = {
        id: text(resource.id),
        sourceFingerprint: event.sourceFingerprint,
        sourceKind: 'manual',
        eventType: event.eventType,
        decisionStatus: 'received',
        confidenceBasisPoints: event.confidenceBasisPoints,
        amountMinor: event.amountMinor ?? null,
        currencyCode: event.currencyCode ?? null,
        merchant: event.merchant ?? null,
        categoryId: event.categoryId ?? null,
        accountHint: null,
        accountId: event.accountId ?? null,
        paymentMethod: null,
        occurredAt: eventTime,
        sourceText: null,
        sourceTextExpiresAt: null,
        reasonCodes: ['clear_success'],
        priorEventId: event.priorEventId ?? null,
        transactionId: null,
        obligationMatchId: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return {
        event: detected,
        feedback: null,
        affectedScopes: ['tracking.imports']
      };
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
        action:
          value.outcome === 'accepted'
            ? 'auto_added'
            : value.outcome === 'reviewed'
              ? 'sent_to_review'
              : value.outcome === 'purged'
                ? 'source_purged'
                : value.outcome === 'rejected'
                  ? 'rejected'
                  : value.outcome === 'duplicate'
                    ? 'linked'
                    : 'detected',
        reasonCodes: reasons(value.reasonCodes),
        occurredAt: epoch(value.occurredAt) ?? Date.now()
      }));
      return { items, nextCursor: response.nextCursor, total: items.length };
    },
    async getDetectedEvent(id) {
      const item = page(await get('/api/v1/tracking/history?limit=100')).find(
        (value) => value.sourceRef === id || value.id === id
      );
      if (!item) throw new TrackingError('not_found');
      return {
        id,
        sourceFingerprint: id,
        sourceKind: 'manual',
        eventType: 'purchase',
        decisionStatus:
          item.outcome === 'rejected'
            ? 'rejected'
            : item.outcome === 'accepted'
              ? 'auto_added'
              : 'received',
        confidenceBasisPoints: 0,
        amountMinor: null,
        currencyCode: null,
        merchant: null,
        categoryId: null,
        accountHint: null,
        accountId: null,
        paymentMethod: null,
        occurredAt: epoch(item.occurredAt),
        sourceText: null,
        sourceTextExpiresAt: null,
        reasonCodes: reasons(item.reasonCodes),
        priorEventId: null,
        transactionId:
          typeof item.transactionId === 'string' ? item.transactionId : null,
        obligationMatchId: null,
        createdAt: epoch(item.createdAt) ?? Date.now(),
        updatedAt: Date.now()
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
      const current = review(
        record(await get(`/api/v1/reviews/${encodeURIComponent(id)}`))
      );
      const value = record(
        await send(
          'POST',
          `/api/v1/reviews/${encodeURIComponent(id)}/decision`,
          {
            decision:
              input.action === 'ignore'
                ? 'reject'
                : input.values
                  ? 'edit_accept'
                  : 'accept',
            expectedVersion: Number(
              record(await get(`/api/v1/reviews/${encodeURIComponent(id)}`))
                .version
            ),
            edit: input.values
          }
        )
      );
      return {
        value: review(record(value.resource ?? value)) ?? current,
        affectedScopes: ['tracking.reviews', 'transactions']
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
          { resolution, expectedVersion: current.version }
        )
      );
      return {
        value: duplicate(record(value.resource ?? value)),
        affectedScopes: ['tracking.duplicates', 'transactions']
      };
    },
    async listKeywordRules(_query?: RuleQuery) {
      return page(await get('/api/v1/tracking/keyword-rules?limit=100')).map(
        (value): KeywordRuleSummary => {
          const id = text(value.id);
          keywordVersions.set(id, Number(value.version ?? 1));
          return {
            id,
            group: text(value.groupKey) as KeywordRuleSummary['group'],
            language: text(value.languageCode, 'en') as 'ar' | 'en',
            value: text(value.keyword),
            normalizedValue: text(value.keyword)
              .normalize('NFKC')
              .toLocaleLowerCase('en'),
            origin: text(value.origin, 'custom') as 'default' | 'custom',
            enabled: value.enabled === true,
            recentUseCount: Number(value.recentUseCount ?? 0),
            lastUsedAt: epoch(value.lastUsedAt)
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
      return page(await get('/api/v1/tracking/sender-rules?limit=100')).map(
        (value): SenderRule => {
          const id = text(value.id);
          senderVersions.set(id, Number(value.version ?? 1));
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
            recentUseCount: 0,
            lastUsedAt: null,
            createdAt: epoch(value.createdAt) ?? Date.now(),
            updatedAt: epoch(value.updatedAt) ?? Date.now()
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
      return {
        value: (await this.listSenderRules()).find(
          (item) => item.id === text(value.id)
        ) as SenderRule,
        affectedScopes: ['tracking.senders']
      };
    },
    async removeCustomSender(id) {
      await this.listSenderRules();
      await send(
        'DELETE',
        `/api/v1/tracking/sender-rules/${encodeURIComponent(id)}?expectedVersion=${String(senderVersions.get(id) ?? 1)}`
      );
      return { value: id, affectedScopes: ['tracking.senders'] };
    },
    async undoAutomaticAddition(
      feedbackId
    ): Promise<TrackingMutationResult<AutomaticFeedback>> {
      const history = page(
        await get('/api/v1/tracking/history?limit=100')
      ).find((item) => item.id === feedbackId);
      const transactionId = text(history?.transactionId);
      if (!history || !transactionId) throw new TrackingError('not_found');
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
      const now = Date.now();
      return {
        value: {
          id: text(feedback.id, feedbackId),
          detectedEventId: text(history.sourceRef, feedbackId),
          transactionId,
          kind: 'automatic_action_undone',
          undoExpiresAt: now,
          notificationOutcome: 'disabled',
          status: 'undone',
          createdAt: now,
          updatedAt: now
        },
        affectedScopes: [
          'tracking.feedback',
          'transactions.list',
          'home.summary'
        ]
      };
    },
    async reportWrongDetection(eventId) {
      const entries = page(await get('/api/v1/tracking/history?limit=100'));
      const history = entries.find(
        (item) => item.sourceRef === eventId || item.id === eventId
      );
      if (!history) throw new TrackingError('not_found');
      await send('POST', '/api/v1/tracking/feedback', {
        historyId: history.id,
        kind: 'wrong_detection'
      });
      const event = await this.getDetectedEvent(eventId);
      return {
        value: { ...event, decisionStatus: 'rejected', updatedAt: Date.now() },
        affectedScopes: ['tracking.history', 'tracking.status']
      };
    }
  };
}
