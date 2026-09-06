import type { OutboxDispatcher } from './outbox-dispatcher';
import type { OutboxRepository } from './outbox.repository';
import { OUTBOX_METRICS, recordPlatformMetric } from '../observability/platform-metrics';

export interface OutboxWorkerOptions {
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  pollMs: number;
}

export class OutboxWorkerService {
  private controller: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly dispatcher: OutboxDispatcher,
    private readonly options: OutboxWorkerOptions,
  ) {
    if (
      !/^[A-Za-z0-9._:-]{1,128}$/.test(options.workerId) ||
      options.batchSize < 1 ||
      options.batchSize > 100 ||
      options.leaseSeconds < 1 ||
      options.leaseSeconds > 300 ||
      options.pollMs < 100 ||
      options.pollMs > 10_000
    ) {
      throw new Error('OUTBOX_WORKER_CONFIG_INVALID');
    }
  }

  start(): void {
    if (this.controller && !this.controller.signal.aborted) return;
    this.controller = new AbortController();
    this.loopPromise = this.run(this.controller.signal);
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    await this.loopPromise;
  }

  async runOnce(): Promise<number> {
    const claimStartedAt = Date.now();
    const rows = await this.repository.claim(
      this.options.workerId,
      this.options.batchSize,
      this.options.leaseSeconds,
    );
    recordPlatformMetric(OUTBOX_METRICS.claimDuration, Date.now() - claimStartedAt, {
      outcome: 'success',
    });
    recordPlatformMetric(OUTBOX_METRICS.claimBatchSize, rows.length, { outcome: 'success' });
    await Promise.all(
      rows.map((row) => this.dispatcher.dispatch(row, this.options.workerId, row.id)),
    );
    return rows.length;
  }

  private async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.runOnce();
      } catch {
        // The retained rows or leases are retried after the bounded poll interval.
      }
      await new Promise((resolve) => setTimeout(resolve, this.options.pollMs));
    }
  }
}
