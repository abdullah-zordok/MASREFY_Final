import type { Account } from '@/domain/core-finance';
import type {
  TrackingImportSession,
  TrackingStatusSnapshot
} from '@/domain/automatic-tracking';
import { permissionState } from './mocks/tracking-permission-service';
import { SmsImportQueue } from '@/storage/sms-import-queue';
import { createAutomaticTrackingCoordinator } from './automatic-tracking-coordinator';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
    removeItem: async (key: string) => void values.delete(key)
  };
}

const ownerAccount: Account = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Primary',
  type: 'bank',
  currencyCode: 'SAR',
  openingBalanceMinor: 0,
  institution: 'Bank',
  lastFour: '4242',
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  monthlyInterestRateBasisPoints: null,
  minimumPaymentMinor: null,
  automaticTrackingEnabled: true,
  isDefault: true,
  iconKey: null,
  colorKey: null,
  notes: null,
  status: 'active',
  createdAt: 1,
  updatedAt: 1
};

const status = (
  patch: Partial<TrackingStatusSnapshot> = {}
): TrackingStatusSnapshot => ({
  platform: 'android',
  mode: 'automatic_clear',
  permissionStatus: null,
  serviceState: 'healthy',
  lastDetectedAt: null,
  lastSuccessfulTransactionId: null,
  detectedThisMonth: 0,
  reviewCount: 0,
  activeKeywordCount: 0,
  activeSenderCount: 0,
  lastUpdatedAt: 1,
  ...patch
});

const session = (
  state: TrackingImportSession['status']
): TrackingImportSession => ({
  id: 'session-1',
  status: state,
  itemCount: 1,
  acceptedCount: state === 'complete' ? 1 : 0,
  rejectedCount: state === 'failed' ? 1 : 0,
  completedAt: ['complete', 'failed', 'cancelled'].includes(state) ? 2 : null,
  updatedAt: 2
});

function setup(overrides: Record<string, unknown> = {}) {
  let online = true;
  const queue = new SmsImportQueue(memoryStorage());
  const tracking = {
    getStatus: jest.fn().mockResolvedValue(status()),
    listKeywordRules: jest.fn().mockResolvedValue([]),
    listSenderRules: jest.fn().mockResolvedValue([]),
    submitImport: jest.fn().mockResolvedValue(session('processing')),
    getImportSession: jest.fn().mockResolvedValue(session('processing')),
    listImportItemIds: jest.fn().mockResolvedValue(['item-1']),
    listReviewItems: jest.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0
    }),
    listDuplicates: jest.fn().mockResolvedValue([])
  };
  const inbox = {
    available: true,
    readRecent: jest.fn().mockResolvedValue([
      { id: '1', sender: 'BANK', body: 'Paid 12 SAR', receivedAt: 100 }
    ]),
    isNetworkAvailable: jest.fn(async () => online)
  };
  const prepare = jest.fn().mockResolvedValue({
    events: [
      {
        sourceItemKey: 'sha256:one',
        amountMinor: -1200,
        currency: 'SAR',
        kind: 'expense',
        accountId: ownerAccount.id,
        receivedAt: '2026-09-12T10:00:00.000Z'
      }
    ],
    skippedFingerprints: [],
    newestReceivedAt: 100,
    accountRequiredCount: 0
  });
  const dependencies = {
    isLive: () => true,
    session: () => ({ status: 'authenticated' as const, userId: 'owner-1' }),
    offlineMode: () => 'automatic_clear' as const,
    tracking,
    permission: {
      getState: jest.fn().mockResolvedValue(permissionState('granted'))
    },
    inbox,
    listAccounts: jest.fn().mockResolvedValue([ownerAccount]),
    listCachedAccounts: jest.fn().mockResolvedValue([ownerAccount]),
    queue,
    prepare,
    now: () => 1_757_678_500_000,
    ...overrides
  };
  return {
    coordinator: createAutomaticTrackingCoordinator(dependencies as never),
    dependencies,
    tracking,
    inbox,
    prepare,
    queue,
    setOnline(value: boolean) {
      online = value;
    }
  };
}

describe('automatic tracking coordinator', () => {
  it.each([
    ['not live', { isLive: () => false }],
    ['signed out', { session: () => ({ status: 'signed_out', userId: null }) }],
    ['paused', { tracking: { ...setup().tracking, getStatus: jest.fn().mockResolvedValue(status({ mode: 'paused' })) } }],
    ['unavailable', { tracking: { ...setup().tracking, getStatus: jest.fn().mockResolvedValue(status({ serviceState: 'unavailable' })) } }],
    ['permission denied', { permission: { getState: jest.fn().mockResolvedValue(permissionState('denied')) } }]
  ])('does not scan when %s', async (_label, override) => {
    const context = setup(override);

    await context.coordinator.sync();

    expect(context.inbox.readRecent).not.toHaveBeenCalled();
  });

  it('queues minimized events offline without making tracking HTTP mutations', async () => {
    const context = setup();
    context.setOnline(false);

    await expect(context.coordinator.sync()).resolves.toMatchObject({ status: 'queued' });
    expect(context.tracking.submitImport).not.toHaveBeenCalled();
    await expect(context.queue.load('owner-1')).resolves.toMatchObject({
      pending: [expect.objectContaining({ idempotencyKey: expect.stringMatching(/^sms:/) })]
    });
  });

  it('reuses the persisted idempotency key when connectivity returns', async () => {
    const context = setup();
    context.setOnline(false);
    await context.coordinator.sync();
    const originalKey = (await context.queue.load('owner-1')).pending[0]?.idempotencyKey;
    context.setOnline(true);

    await context.coordinator.sync();

    expect(context.tracking.submitImport).toHaveBeenCalledWith(
      expect.any(Object),
      originalKey
    );
  });

  it('polls an already submitted session instead of resubmitting it', async () => {
    const context = setup();
    await context.queue.enqueue('owner-1', {
      idempotencyKey: 'sms:existing',
      submission: {
        schemaVersion: 1,
        sourceType: 'sms',
        sourceChannel: 'android_sms',
        events: [{ sourceItemKey: 'sha256:one', amountMinor: -1200, currency: 'SAR', receivedAt: '2026-09-12T10:00:00Z' }]
      },
      cursor: 100,
      fingerprints: ['sha256:one']
    });
    await context.queue.markSubmitted('owner-1', 'sms:existing', 'session-1');

    await expect(context.coordinator.sync()).resolves.toMatchObject({ status: 'processing' });
    expect(context.tracking.getImportSession).toHaveBeenCalledWith('session-1');
    expect(context.tracking.submitImport).not.toHaveBeenCalled();
  });

  it.each([
    ['complete', 'imported'],
    ['failed', 'error']
  ] as const)('maps terminal backend state %s to %s', async (backend, expected) => {
    const context = setup();
    context.tracking.submitImport.mockResolvedValue(session(backend));

    await expect(context.coordinator.sync()).resolves.toMatchObject({ status: expected });
    await expect(context.queue.load('owner-1')).resolves.toMatchObject({ pending: [] });
  });

  it('uses real review and duplicate IDs from items in the current session', async () => {
    const review = {
      id: 'review-1',
      detectedEventId: 'item-1',
      status: 'pending',
      reasonCodes: ['duplicate'],
      missingFields: [],
      proposedValues: {},
      selectedDuplicateResolution: null,
      selectedObligationId: null,
      resolutionErrorCode: null,
      createdAt: 1,
      resolvedAt: null,
      updatedAt: 1
    };
    const context = setup();
    context.tracking.submitImport.mockResolvedValue(session('review'));
    context.tracking.listReviewItems.mockResolvedValue({ items: [review], nextCursor: null, total: 1 });
    context.tracking.listDuplicates.mockResolvedValue([
      {
        id: 'duplicate-1',
        detectedEventId: 'item-1',
        existingTransactionId: 'transaction-1',
        probabilityBasisPoints: 9000,
        reasonCodes: ['same_amount'],
        resolution: null,
        status: 'pending',
        resolvedAt: null
      }
    ]);

    await expect(context.coordinator.sync()).resolves.toMatchObject({
      status: 'duplicate',
      duplicateId: 'duplicate-1',
      reviewId: 'review-1'
    });
  });

  it('keeps a review session pending until its real review ID is visible', async () => {
    const context = setup();
    context.tracking.submitImport.mockResolvedValue(session('review'));

    await expect(context.coordinator.sync()).resolves.toMatchObject({
      status: 'processing',
      sessionId: 'session-1'
    });
    await expect(context.queue.load('owner-1')).resolves.toMatchObject({
      pending: [expect.objectContaining({ sessionId: 'session-1' })]
    });
  });

  it('keeps ambiguous-account messages local and reports account_required', async () => {
    const context = setup();
    context.prepare.mockResolvedValue({
      events: [],
      skippedFingerprints: [],
      newestReceivedAt: 100,
      accountRequiredCount: 1
    });

    await expect(context.coordinator.sync()).resolves.toMatchObject({
      status: 'account_required'
    });
    expect(context.tracking.submitImport).not.toHaveBeenCalled();
  });

  it('coalesces concurrent start and resume synchronization', async () => {
    let release!: (value: []) => void;
    const pending = new Promise<[]>(resolve => { release = resolve; });
    const context = setup();
    context.inbox.readRecent.mockReturnValue(pending);

    const first = context.coordinator.sync();
    const second = context.coordinator.sync();
    expect(second).toBe(first);
    release([]);
    await first;
    expect(context.inbox.readRecent).toHaveBeenCalledTimes(1);
  });
});
