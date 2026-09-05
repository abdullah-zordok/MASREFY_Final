import {
  buildReferenceEvent,
  REFERENCE_EVENT_NAMES,
} from '../../../src/reference/reference.events';

describe('reference event contracts', () => {
  const events = { buildReferenceEvent, REFERENCE_EVENT_NAMES };

  it('owns exactly ten event names', () => {
    expect(events.REFERENCE_EVENT_NAMES).toEqual([
      'account.archived',
      'account.closed',
      'account.created',
      'account.updated',
      'category.created',
      'category.deleted',
      'category.merged',
      'category.updated',
      'exchange-rate.refreshed',
      'reference.updated',
    ]);
  });

  it('accepts safe identifiers and rejects customer labels or raw rates', () => {
    expect(
      events.buildReferenceEvent('account.created', {
        accountId: '10000000-0000-4000-8000-000000000001',
        userId: 'user_1',
        version: 1,
        occurredAt: '2026-08-29T00:00:00.000Z',
      }),
    ).toMatchObject({ version: 1 });
    expect(() =>
      events.buildReferenceEvent('category.created', {
        categoryId: '10000000-0000-4000-8000-000000000001',
        labelEn: 'Food',
      }),
    ).toThrow('EVENT_PAYLOAD_INVALID');
    expect(() => events.buildReferenceEvent('exchange-rate.refreshed', { rate: '0.25' })).toThrow(
      'EVENT_PAYLOAD_INVALID',
    );
  });

  it('rejects malformed identifiers, unknown fields, and unsorted changes', () => {
    const base = {
      accountId: '10000000-0000-4000-8000-000000000001',
      userId: 'user_1',
      version: 2,
      occurredAt: '2026-08-29T00:00:00.000Z',
    };
    expect(() =>
      events.buildReferenceEvent('account.updated', { ...base, accountId: 'bad' }),
    ).toThrow('EVENT_PAYLOAD_INVALID');
    expect(() =>
      events.buildReferenceEvent('account.updated', { ...base, ownerId: 'user_2' }),
    ).toThrow('EVENT_PAYLOAD_INVALID');
    expect(() =>
      events.buildReferenceEvent('account.updated', {
        ...base,
        changedFields: ['notes', 'name'],
      }),
    ).toThrow('EVENT_PAYLOAD_INVALID');
  });

  it('allows the account automatic-tracking field in audited updates', () => {
    expect(
      events.buildReferenceEvent('account.updated', {
        accountId: '10000000-0000-4000-8000-000000000001',
        userId: 'user_1',
        version: 2,
        occurredAt: '2026-08-29T00:00:00.000Z',
        changedFields: ['automaticTrackingEnabled'],
      }),
    ).toMatchObject({ changedFields: ['automaticTrackingEnabled'] });
  });
});
