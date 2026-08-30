import {
  automaticFeedbackSchema,
  detectedFinancialEventSchema,
  duplicateCandidateSchema,
  normalizeSender,
  reviewItemSchema,
  senderRuleSchema,
  trackingHistoryEntrySchema,
  type AutomaticFeedback,
  type DetectedFinancialEvent,
  type DuplicateCandidate,
  type MockFinancialEventInput,
  type ReviewItem,
  type SenderRule,
  type TrackingDecisionStatus,
  type TrackingHistoryEntry,
  type TrackingReasonCode
} from '@/domain/automatic-tracking';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

export interface AutomaticTrackingSeed {
  events?: DetectedFinancialEvent[];
  reviews?: ReviewItem[];
  duplicates?: DuplicateCandidate[];
  senders?: SenderRule[];
  history?: TrackingHistoryEntry[];
  feedback?: AutomaticFeedback[];
}

export class AutomaticTrackingRepository {
  private readonly seed: AutomaticTrackingSeed;
  private events: DetectedFinancialEvent[];
  private reviews: ReviewItem[];
  private duplicates: DuplicateCandidate[];
  private senders: SenderRule[];
  private history: TrackingHistoryEntry[];
  private feedback: AutomaticFeedback[];
  private sequence = 0;

  constructor(seed: AutomaticTrackingSeed = {}) {
    this.seed = copy(seed);
    this.events = seed.events?.map(copy) ?? [];
    this.reviews = seed.reviews?.map(copy) ?? [];
    this.duplicates = seed.duplicates?.map(copy) ?? [];
    this.senders = seed.senders?.map(copy) ?? [];
    this.history = seed.history?.map(copy) ?? [];
    this.feedback = seed.feedback?.map(copy) ?? [];
  }

  reset(): void {
    const seed = this.seed;
    this.events = seed.events?.map(copy) ?? [];
    this.reviews = seed.reviews?.map(copy) ?? [];
    this.duplicates = seed.duplicates?.map(copy) ?? [];
    this.senders = seed.senders?.map(copy) ?? [];
    this.history = seed.history?.map(copy) ?? [];
    this.feedback = seed.feedback?.map(copy) ?? [];
    this.sequence = 0;
  }

  relocalizeDemoFixtures(seed: AutomaticTrackingSeed): void {
    const events = new Map(seed.events?.map((event) => [event.id, event]));
    const reviews = new Map(seed.reviews?.map((review) => [review.id, review]));
    const senders = new Map(seed.senders?.map((sender) => [sender.id, sender]));
    this.events = this.events.map((event) => {
      const localized = events.get(event.id);
      return localized ? { ...event, merchant: localized.merchant } : event;
    });
    this.reviews = this.reviews.map((review) => {
      const localized = reviews.get(review.id);
      return localized
        ? {
            ...review,
            proposedValues: {
              ...review.proposedValues,
              merchant: localized.proposedValues.merchant
            }
          }
        : review;
    });
    this.senders = this.senders.map((sender) => {
      const localized = senders.get(sender.id);
      return localized ? { ...sender, displayLabel: localized.displayLabel } : sender;
    });
  }

  async hydrate(): Promise<void> {
    const database = await openDatabase();
    const [events, reviews, duplicates, senders, history, feedback] =
      await Promise.all([
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_events'
        ),
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_reviews'
        ),
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_duplicates'
        ),
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_senders'
        ),
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_history'
        ),
        database.getAllAsync<{ payload: string }>(
          'SELECT payload FROM tracking_feedback'
        )
      ]);
    if (!events.length && !senders.length) {
      await this.persistAll();
      return;
    }
    this.events = parseRows(events, detectedFinancialEventSchema);
    this.reviews = parseRows(reviews, reviewItemSchema);
    this.duplicates = parseRows(duplicates, duplicateCandidateSchema);
    this.senders = parseRows(senders, senderRuleSchema);
    this.history = parseRows(history, trackingHistoryEntrySchema);
    this.feedback = parseRows(feedback, automaticFeedbackSchema);
  }

  async persistAll(): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await transaction.execAsync(
        'DELETE FROM tracking_feedback; DELETE FROM tracking_history; DELETE FROM tracking_duplicates; DELETE FROM tracking_reviews; DELETE FROM tracking_senders; DELETE FROM tracking_events;'
      );
      for (const event of this.events) await persistEvent(transaction, event);
      for (const review of this.reviews)
        await persistReview(transaction, review);
      for (const duplicate of this.duplicates)
        await persistDuplicate(transaction, duplicate);
      for (const sender of this.senders)
        await persistSender(transaction, sender);
      for (const entry of this.history)
        await persistHistory(transaction, entry);
      for (const item of this.feedback)
        await persistFeedback(transaction, item);
    });
  }

  findByFingerprint(fingerprint: string): DetectedFinancialEvent | null {
    return copy(
      this.events.find((event) => event.sourceFingerprint === fingerprint) ??
        null
    );
  }

  createEvent(
    input: MockFinancialEventInput,
    status: TrackingDecisionStatus,
    reasonCodes: TrackingReasonCode[],
    now = Date.now()
  ): DetectedFinancialEvent {
    const event = detectedFinancialEventSchema.parse({
      id: input.id ?? this.nextId('tracking-event'),
      sourceFingerprint: input.sourceFingerprint,
      sourceKind: input.sourceKind ?? 'sms_mock',
      eventType: input.eventType,
      decisionStatus: status,
      confidenceBasisPoints: input.confidenceBasisPoints,
      amountMinor: input.amountMinor ?? null,
      currencyCode: input.currencyCode ?? null,
      merchant: input.merchant ?? null,
      categoryId: input.categoryId ?? null,
      accountHint: null,
      accountId: input.accountId ?? null,
      paymentMethod: null,
      occurredAt: input.occurredAt ?? now,
      sourceText: input.sourceText ?? null,
      sourceTextExpiresAt: input.sourceText
        ? now + 30 * 24 * 60 * 60 * 1000
        : null,
      reasonCodes,
      priorEventId: input.priorEventId ?? null,
      transactionId: null,
      obligationMatchId: null,
      createdAt: now,
      updatedAt: now
    });
    this.events.push(event);
    this.addHistory(event.id, historyActionForStatus(status), reasonCodes, now);
    return copy(event);
  }

  updateEvent(
    id: string,
    patch: Partial<DetectedFinancialEvent>
  ): DetectedFinancialEvent {
    const index = this.events.findIndex((event) => event.id === id);
    if (index < 0) throw new Error('not_found');
    const next = detectedFinancialEventSchema.parse({
      ...this.events[index],
      ...patch,
      updatedAt: patch.updatedAt ?? Date.now()
    });
    this.events[index] = next;
    return copy(next);
  }

  addReview(
    event: DetectedFinancialEvent,
    missingFields: string[] = []
  ): ReviewItem {
    const existing = this.reviews.find(
      (item) => item.detectedEventId === event.id
    );
    if (existing) return copy(existing);
    const now = Date.now();
    const review = reviewItemSchema.parse({
      id: this.nextId('review'),
      detectedEventId: event.id,
      status: 'pending',
      reasonCodes: event.reasonCodes,
      missingFields,
      proposedValues: {
        amountMinor: event.amountMinor,
        currencyCode: event.currencyCode,
        merchant: event.merchant,
        accountId: event.accountId,
        categoryId: event.categoryId
      },
      selectedDuplicateResolution: null,
      selectedObligationId: null,
      resolutionErrorCode: null,
      createdAt: now,
      resolvedAt: null,
      updatedAt: now
    });
    this.reviews.push(review);
    return copy(review);
  }

  addDuplicate(
    event: DetectedFinancialEvent,
    existingTransactionId: string
  ): DuplicateCandidate {
    const duplicate = duplicateCandidateSchema.parse({
      id: this.nextId('duplicate'),
      detectedEventId: event.id,
      existingTransactionId,
      probabilityBasisPoints: 9_200,
      reasonCodes: ['amount', 'time', 'merchant'],
      resolution: null,
      status: 'pending',
      resolvedAt: null
    });
    this.duplicates.push(duplicate);
    return copy(duplicate);
  }

  addFeedback(
    event: DetectedFinancialEvent,
    transactionId: string,
    notificationOutcome: AutomaticFeedback['notificationOutcome'] = 'delivered_mock',
    now = Date.now()
  ): AutomaticFeedback {
    const feedback = automaticFeedbackSchema.parse({
      id: this.nextId('feedback'),
      detectedEventId: event.id,
      transactionId,
      kind: 'transaction_added',
      undoExpiresAt: now + 30_000,
      notificationOutcome,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
    this.feedback.push(feedback);
    return copy(feedback);
  }

  listEvents(): DetectedFinancialEvent[] {
    return this.events.map(copy);
  }

  requireEvent(id: string): DetectedFinancialEvent {
    const event = this.events.find(
      (item) => item.id === id || item.transactionId === id
    );
    if (!event) throw new Error('not_found');
    return copy(event);
  }

  listReviews(status?: ReviewItem['status']): ReviewItem[] {
    return this.reviews
      .filter((item) => !status || item.status === status)
      .map(copy);
  }

  requireReview(id: string): ReviewItem {
    const review = this.reviews.find(
      (item) => item.id === id || item.detectedEventId === id
    );
    if (!review) throw new Error('not_found');
    return copy(review);
  }

  updateReview(id: string, patch: Partial<ReviewItem>): ReviewItem {
    const index = this.reviews.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('not_found');
    const next = reviewItemSchema.parse({
      ...this.reviews[index],
      ...patch,
      updatedAt: Date.now()
    });
    this.reviews[index] = next;
    return copy(next);
  }

  listDuplicates(): DuplicateCandidate[] {
    return this.duplicates.map(copy);
  }

  requireDuplicate(id: string): DuplicateCandidate {
    const duplicate = this.duplicates.find((item) => item.id === id);
    if (!duplicate) throw new Error('not_found');
    return copy(duplicate);
  }

  updateDuplicate(
    id: string,
    resolution: NonNullable<DuplicateCandidate['resolution']>
  ): DuplicateCandidate {
    const index = this.duplicates.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('not_found');
    const next = {
      ...this.duplicates[index],
      resolution,
      status: 'resolved' as const,
      resolvedAt: Date.now()
    };
    this.duplicates[index] = next;
    return copy(next);
  }

  listSenders(search = ''): SenderRule[] {
    const query = normalizeSender(search);
    return this.senders
      .filter(
        (sender) =>
          !query ||
          sender.normalizedSender.includes(query) ||
          normalizeSender(sender.displayLabel).includes(query)
      )
      .map(copy);
  }

  saveSender(
    input: Omit<SenderRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): SenderRule {
    const now = Date.now();
    const value = senderRuleSchema.parse({
      id: input.id ?? this.nextId('sender'),
      ...input,
      normalizedSender: normalizeSender(input.normalizedSender),
      createdAt: now,
      updatedAt: now
    });
    const index = this.senders.findIndex(
      (sender) =>
        sender.id === value.id ||
        sender.normalizedSender === value.normalizedSender
    );
    if (index >= 0)
      this.senders[index] = {
        ...this.senders[index],
        ...value,
        createdAt: this.senders[index].createdAt
      };
    else this.senders.push(value);
    return copy(index >= 0 ? this.senders[index] : value);
  }

  removeCustomSender(id: string): string {
    const sender = this.senders.find((item) => item.id === id);
    if (!sender) throw new Error('not_found');
    if (sender.origin !== 'custom') throw new Error('invalid_input');
    this.senders = this.senders.filter((item) => item.id !== id);
    return id;
  }

  listHistory(): TrackingHistoryEntry[] {
    return this.history
      .slice()
      .sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id))
      .map(copy);
  }

  clearHistory(): number {
    const count = this.history.length;
    this.history = [];
    this.events = this.events.map((event) => ({
      ...event,
      sourceText: null,
      sourceTextExpiresAt: null
    }));
    return count;
  }

  purgeExpiredSourceText(now = Date.now()): number {
    let count = 0;
    this.events = this.events.map((event) => {
      if (
        event.sourceText &&
        event.sourceTextExpiresAt &&
        event.sourceTextExpiresAt <= now
      ) {
        count += 1;
        this.addHistory(event.id, 'source_purged', ['source_expired'], now);
        return {
          ...event,
          sourceText: null,
          sourceTextExpiresAt: null,
          updatedAt: now
        };
      }
      return event;
    });
    return count;
  }

  requireFeedback(id: string): AutomaticFeedback {
    const feedback = this.feedback.find((item) => item.id === id);
    if (!feedback) throw new Error('not_found');
    return copy(feedback);
  }

  updateFeedback(
    id: string,
    status: AutomaticFeedback['status']
  ): AutomaticFeedback {
    const index = this.feedback.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('not_found');
    const next = { ...this.feedback[index], status, updatedAt: Date.now() };
    this.feedback[index] = next;
    return copy(next);
  }

  private addHistory(
    detectedEventId: string,
    action: TrackingHistoryEntry['action'],
    reasonCodes: TrackingReasonCode[],
    occurredAt: number
  ): void {
    this.history.push(
      trackingHistoryEntrySchema.parse({
        id: this.nextId('history'),
        detectedEventId,
        action,
        reasonCodes,
        occurredAt
      })
    );
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now()}-${this.sequence}`;
  }
}

type PersistRunner = {
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
};

function parseRows<T>(
  rows: readonly { payload: string }[],
  schema: { parse(value: unknown): T }
): T[] {
  return rows.map((row) => schema.parse(JSON.parse(row.payload)));
}

async function persistEvent(
  database: PersistRunner,
  event: DetectedFinancialEvent
) {
  await database.runAsync(
    'INSERT INTO tracking_events (id, source_fingerprint, payload, decision_status, occurred_at, source_text_expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, decision_status = excluded.decision_status, occurred_at = excluded.occurred_at, source_text_expires_at = excluded.source_text_expires_at, updated_at = excluded.updated_at',
    event.id,
    event.sourceFingerprint,
    JSON.stringify(event),
    event.decisionStatus,
    event.occurredAt,
    event.sourceTextExpiresAt,
    event.updatedAt
  );
}

async function persistReview(database: PersistRunner, review: ReviewItem) {
  await database.runAsync(
    'INSERT INTO tracking_reviews (id, detected_event_id, payload, status, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, updated_at = excluded.updated_at',
    review.id,
    review.detectedEventId,
    JSON.stringify(review),
    review.status,
    review.updatedAt
  );
}

async function persistDuplicate(
  database: PersistRunner,
  duplicate: DuplicateCandidate
) {
  await database.runAsync(
    'INSERT INTO tracking_duplicates (id, detected_event_id, payload, status) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status',
    duplicate.id,
    duplicate.detectedEventId,
    JSON.stringify(duplicate),
    duplicate.status
  );
}

async function persistSender(database: PersistRunner, sender: SenderRule) {
  await database.runAsync(
    'INSERT INTO tracking_senders (id, normalized_sender, payload, enabled, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, enabled = excluded.enabled, updated_at = excluded.updated_at',
    sender.id,
    sender.normalizedSender,
    JSON.stringify(sender),
    sender.enabled ? 1 : 0,
    sender.updatedAt
  );
}

async function persistHistory(
  database: PersistRunner,
  history: TrackingHistoryEntry
) {
  await database.runAsync(
    'INSERT INTO tracking_history (id, detected_event_id, payload, occurred_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, occurred_at = excluded.occurred_at',
    history.id,
    history.detectedEventId,
    JSON.stringify(history),
    history.occurredAt
  );
}

async function persistFeedback(
  database: PersistRunner,
  feedback: AutomaticFeedback
) {
  await database.runAsync(
    'INSERT INTO tracking_feedback (id, detected_event_id, transaction_id, payload, status, undo_expires_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, undo_expires_at = excluded.undo_expires_at',
    feedback.id,
    feedback.detectedEventId,
    feedback.transactionId,
    JSON.stringify(feedback),
    feedback.status,
    feedback.undoExpiresAt
  );
}

function historyActionForStatus(
  status: TrackingDecisionStatus
): TrackingHistoryEntry['action'] {
  if (status === 'auto_added') return 'auto_added';
  if (status === 'review_required') return 'sent_to_review';
  if (status === 'rejected') return 'rejected';
  if (status === 'ignored') return 'ignored';
  return 'detected';
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
