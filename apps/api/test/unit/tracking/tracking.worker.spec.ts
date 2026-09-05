import { TrackingWorker } from '../../../src/tracking/tracking.worker';
import { HttpException } from '@nestjs/common';
import { TRACKING_METRICS } from '../../../src/platform/observability/platform-metrics';
import * as platformMetrics from '../../../src/platform/observability/platform-metrics';

describe('tracking worker', () => {
  it('coalesces concurrent runs and completes parse, raw purge, reconciliation, and metrics', async () => {
    let release!: () => void;
    const claim = new Promise<Array<never>>((resolve) => {
      release = () => {
        resolve([]);
      };
    });
    const repository = {
      claimParserCorpus: jest.fn(() => Promise.resolve([])),
      claimImports: jest.fn(() => claim),
      rawDue: jest.fn(() =>
        Promise.resolve([{ id: 'raw-1', storage_ref: 'object-1', purge_token: 'purge-1' }]),
      ),
      completeRaw: jest.fn(() => Promise.resolve(true)),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 1,
          duplicateBacklog: 2,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 3,
        }),
      ),
    };
    const storage = { delete: jest.fn(() => Promise.resolve()) };
    const worker = new TrackingWorker(repository as never, {} as never, storage as never);
    const first = worker.runOnce();
    const second = worker.runOnce();
    expect(repository.claimImports).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(storage.delete).toHaveBeenCalledWith('object-1');
    expect(repository.completeRaw).toHaveBeenCalledWith('raw-1', 'purge-1');
    expect(repository.maintenance).toHaveBeenCalledTimes(1);
    await worker.stop();
  });

  it('posts clear automatic items only through the ledger service and fences completion', async () => {
    const repository = {
      claimParserCorpus: jest.fn(() => Promise.resolve([])),
      claimImports: jest.fn(() =>
        Promise.resolve([
          { id: 'session-1', user_id: 'owner', claim_token: 'token-1', attempt_count: 1 },
        ]),
      ),
      prepareImport: jest.fn(() => Promise.resolve({ parserItems: [] })),
      applyParserResult: jest.fn(() => Promise.resolve()),
      finalizeImport: jest.fn(() =>
        Promise.resolve({
          autoItems: [
            {
              id: 'item-1',
              userId: 'owner',
              values: {
                kind: 'expense',
                amountMinor: 100,
                currency: 'SAR',
                accountId: 'account-1',
                occurredAt: '2026-09-02T08:00:00.000Z',
              },
            },
          ],
        }),
      ),
      getImportSourceIdentityHash: jest.fn(() => Promise.resolve('c'.repeat(64))),
      acceptImportItem: jest.fn<Promise<void>, [string, string, string, string]>(() =>
        Promise.resolve(),
      ),
      completeImport: jest.fn(() => Promise.resolve()),
      rawDue: jest.fn(() => Promise.resolve([])),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 0,
          duplicateBacklog: 0,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 0,
        }),
      ),
    };
    const ledger = {
      createTransaction: jest.fn<
        Promise<{ transaction: { transaction: { id: string } } }>,
        [unknown]
      >(() => Promise.resolve({ transaction: { transaction: { id: 'transaction-1' } } })),
    };
    const worker = new TrackingWorker(repository as never, ledger as never, {} as never);
    await worker.runOnce();
    const create = ledger.createTransaction.mock.calls[0]?.[0] as
      { body: Record<string, unknown>; idempotencyKey: string } | undefined;
    expect(create?.body).toMatchObject({
      source: 'tracking-import',
      externalRef: `tracking:${'c'.repeat(64)}`,
    });
    expect(create?.idempotencyKey).toBe(`tracking:${'c'.repeat(64)}`);
    const accepted = repository.acceptImportItem.mock.calls[0];
    expect(accepted?.slice(0, 2)).toEqual(['item-1', 'token-1']);
    expect(typeof accepted?.[2]).toBe('string');
    expect(accepted?.[3]).toBe('transaction-1');
    expect(repository.finalizeImport).toHaveBeenCalledWith('session-1', 'token-1');
    expect(repository.completeImport).toHaveBeenCalledWith(
      'session-1',
      'token-1',
      'succeeded',
      null,
    );
  });

  it('rejects a preference-race item without creating review or ledger effects', async () => {
    const repository = {
      claimParserCorpus: jest.fn(() => Promise.resolve([])),
      claimImports: jest.fn(() =>
        Promise.resolve([
          { id: 'session-1', user_id: 'owner', claim_token: 'token-1', attempt_count: 1 },
        ]),
      ),
      prepareImport: jest.fn(() => Promise.resolve({ parserItems: [] })),
      finalizeImport: jest.fn(() =>
        Promise.resolve({
          autoItems: [
            {
              id: 'item-1',
              userId: 'owner',
              values: {
                kind: 'expense',
                amountMinor: 100,
                currency: 'SAR',
                accountId: 'account-1',
                occurredAt: '2026-09-02T08:00:00.000Z',
              },
            },
          ],
        }),
      ),
      getImportSourceIdentityHash: jest.fn(() => Promise.resolve('d'.repeat(64))),
      deferImportItem: jest.fn(() => Promise.resolve()),
      completeImport: jest.fn(() => Promise.resolve()),
      rawDue: jest.fn(() => Promise.resolve([])),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 0,
          duplicateBacklog: 0,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 0,
        }),
      ),
    };
    const ledger = {
      createTransaction: jest.fn(() =>
        Promise.reject(new HttpException({ code: 'TRACKING_ACCOUNT_BLOCKED' }, 409)),
      ),
    };

    await new TrackingWorker(repository as never, ledger as never, {} as never).runOnce();

    expect(repository.deferImportItem).toHaveBeenCalledWith(
      'item-1',
      'token-1',
      'account_tracking_blocked',
    );
    expect(repository.completeImport).toHaveBeenCalledWith(
      'session-1',
      'token-1',
      'succeeded',
      null,
    );
  });

  it('leaves failed raw objects retryable while continuing reconciliation', async () => {
    const repository = {
      claimParserCorpus: jest.fn(() => Promise.resolve([])),
      claimImports: jest.fn(() => Promise.resolve([])),
      rawDue: jest.fn(() =>
        Promise.resolve([{ id: 'raw-1', storage_ref: 'object-1', purge_token: 'purge-1' }]),
      ),
      completeRaw: jest.fn(() => Promise.resolve()),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 0,
          duplicateBacklog: 0,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 1,
        }),
      ),
    };
    const storage = { delete: jest.fn(() => Promise.reject(new Error('storage unavailable'))) };
    const worker = new TrackingWorker(repository as never, {} as never, storage as never);

    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(repository.completeRaw).not.toHaveBeenCalled();
    expect(repository.maintenance).toHaveBeenCalledTimes(1);
  });

  it('reports an invalidated raw purge token as a failed claim', async () => {
    const metric = jest.spyOn(platformMetrics, 'recordPlatformMetric').mockImplementation();
    const repository = {
      claimParserCorpus: jest.fn(() => Promise.resolve([])),
      claimImports: jest.fn(() => Promise.resolve([])),
      rawDue: jest.fn(() =>
        Promise.resolve([{ id: 'raw-1', storage_ref: 'object-1', purge_token: 'purge-1' }]),
      ),
      completeRaw: jest.fn(() => Promise.resolve(false)),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 0,
          duplicateBacklog: 0,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 0,
        }),
      ),
    };
    const storage = { delete: jest.fn(() => Promise.resolve()) };
    const worker = new TrackingWorker(repository as never, {} as never, storage as never);

    await worker.runOnce();

    expect(metric).toHaveBeenCalledWith(TRACKING_METRICS.job, 0, {
      job: 'raw.purge',
      outcome: 'failure',
    });
  });

  it('runs a claimed parser corpus through the constrained interpreter and completes the lease', async () => {
    const repository = {
      claimParserCorpus: jest.fn(() =>
        Promise.resolve([{ id: 'version-1', claim_token: 'corpus-token', attempt_count: 1 }]),
      ),
      prepareParserCorpus: jest.fn(() =>
        Promise.resolve({
          definition: {
            matches: [
              { field: 'body', operator: 'safe_pattern', value: '^paid {amount} {currency}$' },
            ],
            captures: [
              { field: 'amount', sourceGroup: 'amount' },
              { field: 'currency', sourceGroup: 'currency' },
            ],
            normalizations: [
              { field: 'amount', operation: 'minor_units' },
              { field: 'currency', operation: 'uppercase' },
            ],
            mappings: [
              { sourceField: 'amount', targetField: 'amount' },
              { sourceField: 'currency', targetField: 'currency' },
            ],
          },
          cases: [
            {
              id: 'case-1',
              input: 'paid 12 SAR',
              expected: { amountMinor: 1200, currency: 'SAR' },
            },
          ],
        }),
      ),
      completeParserCorpus: jest.fn(() => Promise.resolve({ status: 'passed' })),
      claimImports: jest.fn(() => Promise.resolve([])),
      rawDue: jest.fn(() => Promise.resolve([])),
      maintenance: jest.fn(() => Promise.resolve()),
      operationalMetrics: jest.fn(() =>
        Promise.resolve({
          importBacklog: 0,
          reviewBacklog: 0,
          duplicateBacklog: 0,
          oldestImportAgeSeconds: 0,
          rawPurgeLagSeconds: 0,
        }),
      ),
    };
    const worker = new TrackingWorker(repository as never, {} as never, {} as never);

    await worker.runOnce();

    expect(repository.completeParserCorpus).toHaveBeenCalledWith(
      'version-1',
      'corpus-token',
      [{ id: 'case-1', passed: true }],
      null,
    );
  });
});
