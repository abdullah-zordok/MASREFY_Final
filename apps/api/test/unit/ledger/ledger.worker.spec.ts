jest.mock('../../../src/platform/observability/platform-metrics', () => ({
  LEDGER_METRICS: {
    reconciliationChecked: 'masarifi_ledger_reconciliation_checked_total',
    reconciliationMismatch: 'masarifi_ledger_reconciliation_mismatch_total',
    reconciliationFailure: 'masarifi_ledger_reconciliation_failure_total',
    reconciliationRetry: 'masarifi_ledger_reconciliation_retry_total',
    reconciliationBatchSize: 'masarifi_ledger_reconciliation_batch_size',
    reconciliationAge: 'masarifi_ledger_reconciliation_age_seconds',
    reconciliationDuration: 'masarifi_ledger_reconciliation_duration_ms',
  },
  recordPlatformMetric: jest.fn(),
}));

import { recordPlatformMetric } from '../../../src/platform/observability/platform-metrics';
import { LedgerWorker } from '../../../src/ledger/ledger.worker';

type ReconciliationRow = {
  accountId: string;
  ledgerVersion: number;
  matches: boolean;
  mismatchKind: 'confirmed' | 'pending' | 'confirmed_and_pending' | null;
  projectionAgeSeconds?: number;
};
type ReconciliationResult = {
  rows: ReconciliationRow[];
  nextCursor: string | null;
};
type ReconciliationRepository = {
  reconcile: jest.MockedFunction<
    (cursor: string | null, batchSize: number) => Promise<ReconciliationResult>
  >;
  recordReconciliationMismatch: jest.MockedFunction<
    (event: {
      accountId: string;
      mismatchKind: Exclude<ReconciliationRow['mismatchKind'], null>;
      ledgerVersion: number;
      observedAt: string;
      requestId: string;
    }) => Promise<void>
  >;
};
describe('ledger reconciliation worker', () => {
  const accountA = '10000000-0000-4000-8000-000000000001';
  const accountB = '10000000-0000-4000-8000-000000000002';
  let repository: ReconciliationRepository;

  beforeEach(() => {
    repository = {
      reconcile: jest.fn().mockResolvedValue({ rows: [], nextCursor: null }),
      recordReconciliationMismatch: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('uses the default 100-account batch, honors the 500 maximum, and resumes from the deterministic cursor', async () => {
    repository.reconcile
      .mockResolvedValueOnce({
        rows: [{ accountId: accountA, ledgerVersion: 1, matches: true, mismatchKind: null }],
        nextCursor: accountA,
      })
      .mockResolvedValueOnce({ rows: [], nextCursor: null });
    const worker = new LedgerWorker(repository as never);

    await worker.runOnce();
    await worker.runOnce({ batchSize: 500 });

    expect(repository.reconcile).toHaveBeenNthCalledWith(1, null, 100);
    expect(repository.reconcile).toHaveBeenNthCalledWith(2, accountA, 500);
    await expect(worker.runOnce({ batchSize: 501 })).rejects.toThrow(
      'LEDGER_RECONCILIATION_BATCH_INVALID',
    );
  });

  it('retries the same cursor after a failed batch so a restart cannot skip accounts', async () => {
    repository.reconcile
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValueOnce({
        rows: [{ accountId: accountA, ledgerVersion: 2, matches: true, mismatchKind: null }],
        nextCursor: accountA,
      });
    const worker = new LedgerWorker(repository as never);

    await expect(worker.runOnce()).rejects.toThrow('temporary database failure');
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_failure_total',
      1,
      {},
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_retry_total',
      1,
      { outcome: 'scheduled' },
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_duration_ms',
      expect.any(Number),
      { outcome: 'failure' },
    );
    await expect(worker.runOnce()).resolves.toMatchObject({ nextCursor: accountA });

    expect(repository.reconcile).toHaveBeenNthCalledWith(1, null, 100);
    expect(repository.reconcile).toHaveBeenNthCalledWith(2, null, 100);
  });

  it('reports a mismatch with redacted evidence and never asks the repository to repair a balance', async () => {
    repository.reconcile.mockResolvedValue({
      rows: [
        {
          accountId: accountA,
          ledgerVersion: 3,
          matches: true,
          mismatchKind: null,
          projectionAgeSeconds: 12,
        },
        {
          accountId: accountB,
          ledgerVersion: 4,
          matches: false,
          mismatchKind: 'confirmed_and_pending',
          projectionAgeSeconds: 34,
        },
      ],
      nextCursor: null,
    });
    const worker = new LedgerWorker(repository as never);

    await worker.runOnce();

    expect(repository.recordReconciliationMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: accountB,
        ledgerVersion: 4,
        mismatchKind: 'confirmed_and_pending',
      }),
    );
    const event = repository.recordReconciliationMismatch.mock.calls[0]?.[0] ?? {};
    expect(JSON.stringify(event)).not.toMatch(
      /amount|balance|confirmedMinor|pendingMinor|derived/i,
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_checked_total',
      2,
      {},
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_batch_size',
      2,
      {},
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_age_seconds',
      34,
      {},
    );
    expect(recordPlatformMetric).toHaveBeenCalledWith(
      'masarifi_ledger_reconciliation_mismatch_total',
      1,
      { mismatch_kind: 'confirmed_and_pending' },
    );
    expect(Object.keys(repository)).not.toContain('repairBalance');
  });

  it('waits for the active batch during shutdown and does not start a second one', async () => {
    let finish!: (value: ReconciliationResult) => void;
    repository.reconcile.mockReturnValue(
      new Promise<ReconciliationResult>((resolve) => {
        finish = resolve;
      }),
    );
    const worker = new LedgerWorker(repository as never);

    const running = worker.runOnce();
    const stopping = worker.stop();
    finish({ rows: [], nextCursor: null });
    await Promise.all([running, stopping]);
    worker.start();
    await Promise.resolve();

    expect(repository.reconcile).toHaveBeenCalledTimes(1);
  });
});
