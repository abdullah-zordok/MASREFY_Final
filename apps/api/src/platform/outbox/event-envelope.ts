import { validateOutboxInput } from './outbox-validation';

export interface OutboxEnvelopeRow {
  id: string;
  createdAt: Date;
  aggregateType: string;
  aggregateId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
}

export interface EventEnvelope {
  schemaVersion: 1;
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: 'masarifi-api';
  aggregate: { type: string; id: string | null };
  correlationId: string;
  attempt: number;
  payload: Record<string, unknown>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const correlationPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function buildEventEnvelope(row: OutboxEnvelopeRow, correlationId: string): EventEnvelope {
  const payload = { ...row.payload };
  delete payload.sync;
  validateOutboxInput(row.eventType, row.aggregateType, payload);
  if (
    !uuidPattern.test(row.id) ||
    (row.aggregateId !== null && !uuidPattern.test(row.aggregateId))
  ) {
    throw new Error('OUTBOX_ID_INVALID');
  }
  if (!correlationPattern.test(correlationId)) throw new Error('OUTBOX_CORRELATION_ID_INVALID');
  if (!Number.isSafeInteger(row.attemptCount) || row.attemptCount < 0) {
    throw new Error('OUTBOX_ATTEMPT_INVALID');
  }
  return {
    schemaVersion: 1,
    eventId: row.id,
    eventType: row.eventType,
    occurredAt: row.createdAt.toISOString(),
    producer: 'masarifi-api',
    aggregate: { type: row.aggregateType, id: row.aggregateId },
    correlationId,
    attempt: row.attemptCount + 1,
    payload,
  };
}
