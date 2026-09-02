import { buildEventEnvelope } from '../../../src/platform/outbox/event-envelope';

const row = {
  id: '0198f79d-98f3-7bb4-a820-f43bb4d0e17f',
  createdAt: new Date('2026-08-27T12:00:00.000Z'),
  aggregateType: 'account',
  aggregateId: '0198f79d-98f3-7bb4-a820-f43bb4d0e17e',
  eventType: 'account.changed',
  payload: { version: 1 },
  attemptCount: 0,
};

describe('buildEventEnvelope', () => {
  it('builds the exact versioned envelope', () => {
    expect(buildEventEnvelope(row, 'req-1')).toEqual({
      schemaVersion: 1,
      eventId: row.id,
      eventType: 'account.changed',
      occurredAt: '2026-08-27T12:00:00.000Z',
      producer: 'masarifi-api',
      aggregate: { type: 'account', id: row.aggregateId },
      correlationId: 'req-1',
      attempt: 1,
      payload: { version: 1 },
    });
  });

  it('rejects an unsafe correlation ID before publication', () => {
    expect(() => buildEventEnvelope(row, 'Bearer secret')).toThrow('OUTBOX_CORRELATION_ID_INVALID');
  });

  it('keeps internal sync snapshots out of published events', () => {
    const envelope = buildEventEnvelope(
      { ...row, payload: { version: 2, sync: { snapshot: { amountMinor: '1000' } } } },
      'req-2',
    );
    expect(envelope.payload).toEqual({ version: 2 });
  });
});
