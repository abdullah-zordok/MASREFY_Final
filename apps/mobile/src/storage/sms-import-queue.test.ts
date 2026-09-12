import type { TrackingImportSubmission } from '@/domain/automatic-tracking';
import { SmsImportQueue } from './sms-import-queue';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    })
  };
}

const submission: TrackingImportSubmission = {
  schemaVersion: 1,
  sourceType: 'sms',
  sourceChannel: 'android_sms',
  events: [
    {
      sourceItemKey: 'sha256:one',
      sender: 'BANK',
      body: 'raw fixture body that is unnecessary',
      amountMinor: -1250,
      currency: 'SAR',
      kind: 'expense',
      accountId: '10000000-0000-4000-8000-000000000001',
      receivedAt: '2026-09-12T10:00:00.000Z'
    }
  ]
};

describe('SMS import queue', () => {
  it('persists a bounded minimized queue before advancing its cursor', async () => {
    const storage = memoryStorage();
    const queue = new SmsImportQueue(storage);

    const state = await queue.enqueue('owner-1', {
      idempotencyKey: 'sms:sha256:one',
      submission,
      cursor: 1_757_678_401_000,
      fingerprints: Array.from({ length: 600 }, (_, index) => `sha256:${index}`)
    });
    const persisted = [...storage.values.values()][0] ?? '';

    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({
      idempotencyKey: 'sms:sha256:one',
      sessionId: null
    });
    expect(state.cursor).toBe(1_757_678_401_000);
    expect(state.fingerprints).toHaveLength(500);
    expect(persisted).not.toContain('raw fixture body');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('keeps repeated enqueue idempotent and preserves the original key', async () => {
    const queue = new SmsImportQueue(memoryStorage());

    await queue.enqueue('owner-1', {
      idempotencyKey: 'sms:sha256:one',
      submission,
      cursor: 1,
      fingerprints: ['sha256:one']
    });
    const state = await queue.enqueue('owner-1', {
      idempotencyKey: 'sms:sha256:one',
      submission,
      cursor: 2,
      fingerprints: ['sha256:one']
    });

    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.idempotencyKey).toBe('sms:sha256:one');
  });

  it('marks submissions and removes only terminal queue entries', async () => {
    const queue = new SmsImportQueue(memoryStorage());
    await queue.enqueue('owner-1', {
      idempotencyKey: 'sms:sha256:one',
      submission,
      cursor: 1,
      fingerprints: ['sha256:one']
    });

    await expect(
      queue.markSubmitted('owner-1', 'sms:sha256:one', 'session-1')
    ).resolves.toMatchObject({
      pending: [expect.objectContaining({ sessionId: 'session-1' })]
    });
    await expect(
      queue.markTerminal('owner-1', 'sms:sha256:one')
    ).resolves.toMatchObject({ pending: [] });
  });

  it('stores only safe rule fields and clears state when the owner changes', async () => {
    const storage = memoryStorage();
    const queue = new SmsImportQueue(storage);
    await queue.saveRules('owner-1', {
      keywords: [{ value: 'paid', enabled: true }],
      senders: [{ normalizedSender: 'bank', enabled: true, trusted: true }]
    });

    await expect(queue.load('owner-1')).resolves.toMatchObject({
      rules: {
        keywords: [{ value: 'paid', enabled: true }],
        senders: [{ normalizedSender: 'bank', enabled: true, trusted: true }]
      }
    });
    await expect(queue.load('owner-2')).resolves.toMatchObject({
      ownerId: 'owner-2',
      pending: [],
      cursor: null,
      fingerprints: []
    });
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('checkpoints filtered messages without creating an import', async () => {
    const queue = new SmsImportQueue(memoryStorage());

    await expect(
      queue.checkpoint('owner-1', 42, ['sha256:filtered'], 'review_all')
    ).resolves.toMatchObject({
      cursor: 42,
      fingerprints: ['sha256:filtered'],
      mode: 'review_all',
      pending: []
    });
  });
});
