import type { TrackingImportSubmission } from '@/domain/automatic-tracking';
import { SmsImportQueue } from './sms-import-queue';
import { StatefulSqlite } from '@/test-utils/stateful-sqlite';
import { runExclusiveDatabaseTransaction } from './database';

let mockDatabase: StatefulSqlite;
jest.mock('./database', () => ({
  openDatabase: jest.fn(async () => mockDatabase),
  runExclusiveDatabaseTransaction: jest.fn(
    async (
      db: StatefulSqlite,
      operation: (tx: StatefulSqlite) => Promise<void>
    ) => db.withExclusiveTransactionAsync(operation)
  )
}));
beforeEach(() => {
  mockDatabase = new StatefulSqlite(['sms_import_queue']);
});
const legacyKey = 'masarifi.tracking.smsImportQueue.v1';
const legacy = () => ({
  version: 1,
  ownerId: 'owner-1',
  pending: [{ idempotencyKey: 'sms:sha256:one', submission, sessionId: null }],
  cursor: 42,
  fingerprints: ['sha256:one'],
  mode: 'review_all',
  rules: { keywords: [{ value: 'paid', enabled: true }], senders: [] }
});

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
    const persisted = String(
      mockDatabase.read('sms_import_queue')[0]?.payload ?? ''
    );

    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({
      idempotencyKey: 'sms:sha256:one',
      sessionId: null
    });
    expect(state.cursor).toBe(1_757_678_401_000);
    expect(state.fingerprints).toHaveLength(500);
    expect(persisted).not.toContain('raw fixture body');
    expect(mockDatabase.read('sms_import_queue')).toHaveLength(1);
    expect(JSON.parse(persisted)).toEqual(state);
    expect(storage.values.size).toBe(0);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('persists and reloads provider notification imports', async () => {
    const queue = new SmsImportQueue(memoryStorage());
    await queue.enqueue('owner-1', {
      idempotencyKey: 'provider:sha256:one',
      submission: {
        ...submission,
        sourceType: 'provider',
        sourceChannel: 'android_notification'
      },
      cursor: 42,
      fingerprints: ['sha256:one']
    });

    await expect(queue.load('owner-1')).resolves.toMatchObject({
      pending: [
        {
          idempotencyKey: 'provider:sha256:one',
          submission: {
            sourceType: 'provider',
            sourceChannel: 'android_notification'
          }
        }
      ]
    });
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
    expect(storage.values.size).toBe(0);
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

  it('commits same-owner legacy state before removing plaintext and can reload it', async () => {
    const storage = memoryStorage();
    storage.values.set(legacyKey, JSON.stringify(legacy()));
    storage.removeItem.mockImplementation(async (key) => {
      expect(mockDatabase.read('sms_import_queue')).toHaveLength(1);
      storage.values.delete(key);
    });
    const state = await new SmsImportQueue(storage).load('owner-1');
    expect(state).toMatchObject({
      cursor: 42,
      mode: 'review_all',
      pending: [{ idempotencyKey: 'sms:sha256:one' }]
    });
    expect(storage.values.size).toBe(0);
    expect(await new SmsImportQueue(storage).load('owner-1')).toEqual(state);
  });

  it('retains legacy data on failed encrypted commit and retries cleanup without overwriting encrypted state', async () => {
    const storage = memoryStorage();
    storage.values.set(legacyKey, JSON.stringify(legacy()));
    mockDatabase.failNextWrite('sms_import_queue');
    const queue = new SmsImportQueue(storage);
    await expect(queue.load('owner-1')).rejects.toThrow(
      'injected sms_import_queue failure'
    );
    expect(storage.values.has(legacyKey)).toBe(true);
    await queue.load('owner-1');
    await queue.markTerminal('owner-1', 'sms:sha256:one');
    storage.values.set(legacyKey, JSON.stringify(legacy()));
    expect((await queue.load('owner-1')).pending).toEqual([]);
    expect(storage.values.has(legacyKey)).toBe(false);
  });

  it.each([
    ['foreign owner', () => ({ ...legacy(), ownerId: 'owner-2' })],
    ['invalid JSON', () => '{'],
    ['pending item', () => ({ ...legacy(), pending: [null] })],
    [
      'event',
      () => ({
        ...legacy(),
        pending: [
          {
            ...legacy().pending[0],
            submission: {
              ...submission,
              events: [{ ...submission.events[0], amountMinor: 1.5 }]
            }
          }
        ]
      })
    ],
    ['cursor', () => ({ ...legacy(), cursor: -1 })],
    ['mode', () => ({ ...legacy(), mode: 'invalid' })],
    ['fingerprint', () => ({ ...legacy(), fingerprints: [42] })],
    [
      'rules',
      () => ({
        ...legacy(),
        rules: { keywords: [{ value: 'paid', enabled: 'yes' }], senders: [] }
      })
    ],
    [
      'queue cap',
      () => ({ ...legacy(), pending: Array(101).fill(legacy().pending[0]) })
    ],
    [
      'fingerprint cap',
      () => ({ ...legacy(), fingerprints: Array(501).fill('fingerprint') })
    ]
  ])('purges legacy data with %s', async (_label, data) => {
    const storage = memoryStorage();
    const value = data();
    storage.values.set(
      legacyKey,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
    expect(await new SmsImportQueue(storage).load('owner-1')).toMatchObject({
      pending: [],
      cursor: null
    });
    expect(storage.values.has(legacyKey)).toBe(false);
    expect(mockDatabase.read('sms_import_queue')).toEqual([]);
  });

  it('rejects a stale-owner transaction before queue persistence', async () => {
    jest
      .mocked(runExclusiveDatabaseTransaction)
      .mockRejectedValueOnce(new Error('stale database owner'));
    const storage = memoryStorage();
    await expect(
      new SmsImportQueue(storage).checkpoint('owner-1', 42, [])
    ).rejects.toThrow('stale database owner');
    expect(mockDatabase.read('sms_import_queue')).toEqual([]);
    expect(storage.values.size).toBe(0);
  });

  it('clears encrypted and plaintext queue state', async () => {
    const storage = memoryStorage();
    const queue = new SmsImportQueue(storage);
    await queue.checkpoint('owner-1', 42, ['sha256:one']);
    storage.values.set(legacyKey, JSON.stringify(legacy()));
    await queue.clear();
    expect(mockDatabase.read('sms_import_queue')).toEqual([]);
    expect(storage.values.size).toBe(0);
  });
});
