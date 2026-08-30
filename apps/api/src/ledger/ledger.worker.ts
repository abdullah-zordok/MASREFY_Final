import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import { LEDGER_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { LedgerRepository } from './ledger.repository';

interface ReconciliationResult {
  rows: Array<{
    accountId: string;
    ledgerVersion: number;
    matches: boolean;
    mismatchKind: 'confirmed' | 'pending' | 'confirmed_and_pending' | null;
    projectionAgeSeconds: number;
  }>;
  nextCursor: string | null;
}

@Injectable()
export class LedgerWorker implements OnModuleDestroy {
  private cursor: string | null = null;
  private active: Promise<ReconciliationResult> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly repository: LedgerRepository) {}

  runOnce(options: { batchSize?: number } = {}): Promise<ReconciliationResult> {
    const batchSize = options.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
      return Promise.reject(new Error('LEDGER_RECONCILIATION_BATCH_INVALID'));
    if (this.active) return this.active;
    const running = this.execute(batchSize);
    this.active = running;
    void running
      .finally(() => {
        if (this.active === running) this.active = undefined;
      })
      .catch(() => undefined);
    return running;
  }

  start(): void {
    if (this.stopped || this.timer) return;
    void this.runOnce().catch(() => undefined);
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), 60_000);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active?.catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private async execute(batchSize: number): Promise<ReconciliationResult> {
    const startedAt = performance.now();
    let outcome = 'failure';
    try {
      const result = await this.repository.reconcile(this.cursor, batchSize);
      const mismatches = result.rows.filter(
        (row): row is typeof row & { mismatchKind: Exclude<typeof row.mismatchKind, null> } =>
          !row.matches && row.mismatchKind !== null,
      );
      for (const row of mismatches) {
        await this.repository.recordReconciliationMismatch({
          accountId: row.accountId,
          mismatchKind: row.mismatchKind,
          ledgerVersion: row.ledgerVersion,
          observedAt: new Date().toISOString(),
          requestId: randomUUID(),
        });
        recordPlatformMetric(LEDGER_METRICS.reconciliationMismatch, 1, {
          mismatch_kind: row.mismatchKind,
        });
      }
      recordPlatformMetric(LEDGER_METRICS.reconciliationChecked, result.rows.length, {});
      recordPlatformMetric(LEDGER_METRICS.reconciliationBatchSize, result.rows.length, {});
      recordPlatformMetric(
        LEDGER_METRICS.reconciliationAge,
        Math.max(0, ...result.rows.map(({ projectionAgeSeconds }) => projectionAgeSeconds)),
        {},
      );
      this.cursor = result.nextCursor;
      outcome = 'success';
      return result;
    } catch (error) {
      recordPlatformMetric(LEDGER_METRICS.reconciliationFailure, 1, {});
      recordPlatformMetric(LEDGER_METRICS.reconciliationRetry, 1, { outcome: 'scheduled' });
      throw error;
    } finally {
      recordPlatformMetric(LEDGER_METRICS.reconciliationDuration, performance.now() - startedAt, {
        outcome,
      });
    }
  }
}
