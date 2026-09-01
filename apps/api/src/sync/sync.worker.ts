import { createHash, randomUUID } from 'node:crypto';

import { HttpException, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { SyncHandlers } from './sync.handlers';
import {
  logSyncEvent,
  recordSyncConflict,
  recordSyncRetry,
  recordSyncWorker,
} from './sync.observability';
import { SyncRepository, type ClaimedMutation } from './sync.repository';

export type SyncJob =
  'sync-mutations.retry' | 'idempotency.cleanup' | 'sync-state.cleanup' | 'conflicts.expire';

@Injectable()
export class SyncWorker implements OnModuleDestroy {
  private readonly logger = new Logger(SyncWorker.name);
  private active: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private lastMaintenance = 0;
  private readonly workerId = `sync-${randomUUID()}`;

  constructor(
    private readonly repository: SyncRepository,
    private readonly handlers: SyncHandlers,
    private readonly config: PlatformConfigService,
  ) {}

  runOnce(): Promise<void> {
    if (this.active) return this.active;
    const running = this.execute();
    this.active = running;
    void running
      .finally(() => {
        if (this.active === running) this.active = undefined;
      })
      .catch(() => undefined);
    return running;
  }

  async runJob(job: SyncJob): Promise<number> {
    if (job === 'sync-mutations.retry') {
      const claimed = await this.repository.claimMutations(
        this.workerId,
        this.config.getRequired('MASARIFI_SYNC_BATCH_SIZE'),
        this.config.getRequired('MASARIFI_SYNC_LEASE_SECONDS'),
      );
      for (const mutation of claimed) await this.process(mutation);
      return claimed.length;
    }
    return this.repository.runMaintenance(
      job,
      this.config.getRequired('MASARIFI_SYNC_RETENTION_DAYS'),
    );
  }

  start(): void {
    if (this.stopped || this.timer) return;
    void this.runOnce().catch(() => undefined);
    this.timer = setInterval(
      () => void this.runOnce().catch(() => undefined),
      this.config.getRequired('MASARIFI_SYNC_POLL_MS'),
    );
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

  retryDelayMs(mutationId: string, attempt: number): number {
    const base = this.config.getRequired('MASARIFI_SYNC_RETRY_BASE_SECONDS') * 1000;
    const maximum = this.config.getRequired('MASARIFI_SYNC_RETRY_MAX_SECONDS') * 1000;
    const jitterMaximum = this.config.getRequired('MASARIFI_SYNC_RETRY_JITTER_MS');
    const exponential = Math.min(maximum, base * 2 ** Math.max(0, attempt - 1));
    const jitter =
      jitterMaximum === 0
        ? 0
        : createHash('sha256').update(mutationId).digest().readUInt32BE(0) % (jitterMaximum + 1);
    return Math.min(maximum, exponential + jitter);
  }

  private async execute(): Promise<void> {
    await this.measured('sync-mutations.retry');
    if (Date.now() - this.lastMaintenance < 60_000) return;
    for (const job of ['idempotency.cleanup', 'sync-state.cleanup', 'conflicts.expire'] as const)
      await this.measured(job);
    this.lastMaintenance = Date.now();
  }

  private async measured(job: SyncJob): Promise<void> {
    try {
      await this.runJob(job);
      recordSyncWorker(job, 'success');
      logSyncEvent(this.logger, 'worker.completed', { outcome: 'success', status: job });
    } catch (error) {
      recordSyncWorker(job, 'failure');
      logSyncEvent(this.logger, 'worker.failed', { outcome: 'failure', status: job });
      throw error;
    }
  }

  private async process(claimed: ClaimedMutation): Promise<void> {
    const principal = {
      userId: claimed.userId,
      sessionId: `sync-worker:${this.workerId}`,
      factorAgeSeconds: claimed.factorAgeSeconds,
    };
    try {
      const result = await this.handlers.dispatch(
        principal,
        claimed.mutation,
        claimed.mutation.operationId,
      );
      await this.repository.workerComplete(
        claimed.id,
        claimed.leaseToken,
        'applied',
        this.result(result),
        null,
      );
    } catch (error) {
      const code = this.errorCode(error);
      if (
        code === 'VERSION_CONFLICT' &&
        claimed.mutation.domain === 'transactions' &&
        claimed.mutation.resourceId &&
        claimed.mutation.baseVersion !== null
      ) {
        const target = await this.repository.conflictTarget(principal, claimed.mutation.resourceId);
        if (target) {
          await this.repository.createConflict(
            claimed.userId,
            {
              mutationId: claimed.id,
              transactionId: claimed.mutation.resourceId,
              serverVersion: target.version,
              clientVersion: claimed.mutation.baseVersion,
              fields: Object.keys(claimed.mutation.payload).sort(),
              serverSnapshot: target.snapshot,
              clientSnapshot: claimed.mutation.payload,
            },
            claimed.leaseToken,
          );
          recordSyncConflict('created');
          return;
        }
      }
      if (this.permanent(code)) {
        await this.repository.workerComplete(claimed.id, claimed.leaseToken, 'rejected', null, {
          code,
        });
        recordSyncRetry('rejected');
        return;
      }
      if (claimed.attemptCount >= this.config.getRequired('MASARIFI_SYNC_MAX_ATTEMPTS')) {
        await this.repository.workerComplete(claimed.id, claimed.leaseToken, 'rejected', null, {
          code: 'SYNC_RETRY_EXHAUSTED',
          cause: code,
        });
        recordSyncRetry('exhausted');
        return;
      }
      await this.repository.retryMutation(
        claimed.id,
        claimed.leaseToken,
        new Date(Date.now() + this.retryDelayMs(claimed.id, claimed.attemptCount)),
        code,
      );
      recordSyncRetry('scheduled');
    }
  }

  private result(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { accepted: true };
  }

  private permanent(code: string): boolean {
    return [
      'VALIDATION_FAILED',
      'AUTH_TOKEN_INVALID',
      'PROFILE_INACTIVE',
      'DEVICE_NOT_FOUND',
      'SYNC_OPERATION_UNSUPPORTED',
      'TRANSACTION_NOT_FOUND',
      'TRANSACTION_INELIGIBLE',
      'ACCOUNT_INVALID',
      'CATEGORY_INVALID',
      'PLANNING_VERSION_CONFLICT',
    ].includes(code);
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object') {
        const code: unknown = (response as Record<string, unknown>).code;
        if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(code)) return code;
      }
    }
    if (error instanceof Error) {
      const code = error.message.match(/[A-Z][A-Z0-9_]{2,63}/)?.[0];
      if (code) return code;
    }
    return 'SYNC_MUTATION_FAILED';
  }
}
