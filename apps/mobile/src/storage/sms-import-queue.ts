import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  TrackingImportEvent,
  TrackingImportSubmission,
  TrackingMode
} from '@/domain/automatic-tracking';

const storageKey = 'masarifi.tracking.smsImportQueue.v1';

interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SmsImportQueueEntry {
  idempotencyKey: string;
  submission: TrackingImportSubmission;
  sessionId: string | null;
}

export interface SmsRuleSnapshot {
  keywords: { value: string; enabled: boolean }[];
  senders: {
    normalizedSender: string;
    enabled: boolean;
    trusted: boolean;
  }[];
}

export interface SmsImportQueueState {
  version: 1;
  ownerId: string;
  pending: SmsImportQueueEntry[];
  cursor: number | null;
  fingerprints: string[];
  mode: TrackingMode | null;
  rules: SmsRuleSnapshot;
}

export class SmsImportQueue {
  constructor(private readonly storage: StorageLike = AsyncStorage) {}

  async load(ownerId: string): Promise<SmsImportQueueState> {
    const raw = await this.storage.getItem(storageKey);
    if (!raw) return empty(ownerId);
    try {
      const state = JSON.parse(raw) as SmsImportQueueState;
      if (
        state.version !== 1 ||
        typeof state.ownerId !== 'string' ||
        !Array.isArray(state.pending) ||
        !Array.isArray(state.fingerprints) ||
        !state.rules ||
        !Array.isArray(state.rules.keywords) ||
        !Array.isArray(state.rules.senders)
      ) {
        throw new Error('sms_queue_invalid');
      }
      if (state.ownerId === ownerId) return state;
    } catch {
      // Corrupt or differently owned local data must never cross sessions.
    }
    await this.clear();
    return empty(ownerId);
  }

  async enqueue(
    ownerId: string,
    input: {
      idempotencyKey: string;
      submission: TrackingImportSubmission;
      cursor: number;
      fingerprints: readonly string[];
      mode?: TrackingMode;
    }
  ): Promise<SmsImportQueueState> {
    const state = await this.load(ownerId);
    if (!state.pending.some((item) => item.idempotencyKey === input.idempotencyKey)) {
      if (state.pending.length >= 100) throw new Error('sms_queue_full');
      state.pending.push({
        idempotencyKey: input.idempotencyKey,
        submission: minimize(input.submission),
        sessionId: null
      });
    }
    state.cursor = Math.max(state.cursor ?? 0, input.cursor);
    state.fingerprints = [
      ...new Set([...state.fingerprints, ...input.fingerprints])
    ].slice(-500);
    if (input.mode) state.mode = input.mode;
    return this.save(state);
  }

  async checkpoint(
    ownerId: string,
    cursor: number,
    fingerprints: readonly string[],
    mode?: TrackingMode
  ): Promise<SmsImportQueueState> {
    const state = await this.load(ownerId);
    state.cursor = Math.max(state.cursor ?? 0, cursor);
    state.fingerprints = [
      ...new Set([...state.fingerprints, ...fingerprints])
    ].slice(-500);
    if (mode) state.mode = mode;
    return this.save(state);
  }

  async markSubmitted(
    ownerId: string,
    idempotencyKey: string,
    sessionId: string
  ): Promise<SmsImportQueueState> {
    const state = await this.load(ownerId);
    const entry = state.pending.find(
      (item) => item.idempotencyKey === idempotencyKey
    );
    if (!entry) throw new Error('sms_queue_item_not_found');
    entry.sessionId = sessionId;
    return this.save(state);
  }

  async markTerminal(
    ownerId: string,
    idempotencyKey: string
  ): Promise<SmsImportQueueState> {
    const state = await this.load(ownerId);
    state.pending = state.pending.filter(
      (item) => item.idempotencyKey !== idempotencyKey
    );
    return this.save(state);
  }

  async saveRules(
    ownerId: string,
    rules: SmsRuleSnapshot
  ): Promise<SmsImportQueueState> {
    const state = await this.load(ownerId);
    state.rules = {
      keywords: rules.keywords.map(({ value, enabled }) => ({ value, enabled })),
      senders: rules.senders.map(
        ({ normalizedSender, enabled, trusted }) => ({
          normalizedSender,
          enabled,
          trusted
        })
      )
    };
    return this.save(state);
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(storageKey);
  }

  private async save(state: SmsImportQueueState) {
    await this.storage.setItem(storageKey, JSON.stringify(state));
    return state;
  }
}

function empty(ownerId: string): SmsImportQueueState {
  return {
    version: 1,
    ownerId,
    pending: [],
    cursor: null,
    fingerprints: [],
    mode: null,
    rules: { keywords: [], senders: [] }
  };
}

function minimize(input: TrackingImportSubmission): TrackingImportSubmission {
  return {
    schemaVersion: 1,
    sourceType: input.sourceType,
    ...(input.sourceChannel ? { sourceChannel: input.sourceChannel } : {}),
    events: input.events.map(minimizeEvent)
  };
}

function minimizeEvent(event: TrackingImportEvent): TrackingImportEvent {
  return {
    sourceItemKey: event.sourceItemKey,
    ...(event.sender ? { sender: event.sender } : {}),
    ...(event.amountMinor === undefined
      ? event.body
        ? { body: event.body }
        : {}
      : { amountMinor: event.amountMinor }),
    ...(event.currency ? { currency: event.currency } : {}),
    ...(event.merchant ? { merchant: event.merchant } : {}),
    receivedAt: event.receivedAt,
    ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
    ...(event.metadata ? { metadata: event.metadata } : {}),
    ...(event.kind ? { kind: event.kind } : {}),
    ...(event.accountId ? { accountId: event.accountId } : {}),
    ...(event.categoryId ? { categoryId: event.categoryId } : {})
  };
}
