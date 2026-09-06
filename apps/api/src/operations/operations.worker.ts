import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { Inject, Injectable } from '@nestjs/common';

import { OperationsJobRegistry } from './job-registry';
import { OperationsRepository } from './operations.repository';
import {
  OPERATIONS_METRICS,
  recordPlatformMetric,
} from '../platform/observability/platform-metrics';

type Store = Pick<OperationsRepository, 'claim' | 'heartbeat' | 'complete'>;
type Registry = Pick<OperationsJobRegistry, 'run'>;

@Injectable()
export class OperationsWorker {
  private readonly workerId = `operations-${String(process.pid)}-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(
    @Inject(OperationsRepository) private readonly repository: Store,
    @Inject(OperationsJobRegistry) private readonly registry: Registry,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), 1_000);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }

  runOnce(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.poll().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async poll(): Promise<void> {
    const claims = await this.repository.claim(this.workerId, 1);
    recordPlatformMetric(OPERATIONS_METRICS.jobBacklog, claims.length, { status: 'claimed' });
    for (const claim of claims) await this.execute(claim);
  }

  private async execute(claim: Record<string, unknown>): Promise<void> {
    if (
      typeof claim.jobKey !== 'string' ||
      typeof claim.attemptId !== 'string' ||
      typeof claim.timeoutSeconds !== 'number' ||
      !Number.isFinite(claim.timeoutSeconds) ||
      claim.timeoutSeconds <= 0
    )
      throw new Error('OPERATIONS_CLAIM_INVALID');
    const jobKey = claim.jobKey;
    const attemptId = claim.attemptId;
    const timeoutMs = claim.timeoutSeconds * 1_000;
    const startedAt = performance.now();
    const deadline = { exceeded: false };
    const timer = setTimeout(() => {
      deadline.exceeded = true;
    }, timeoutMs);
    const heartbeat = setInterval(
      () => void this.repository.heartbeat(attemptId, this.workerId).catch(() => undefined),
      Math.max(250, Math.min(5_000, timeoutMs / 3)),
    );
    heartbeat.unref();
    try {
      const result = await this.registry.run(jobKey);
      if (deadline.exceeded) {
        await this.repository.complete(attemptId, this.workerId, 'failed', 'JOB_TIMEOUT', {});
        recordPlatformMetric(OPERATIONS_METRICS.job, 1, { job: jobKey, outcome: 'failed' });
        return;
      }
      await this.repository.complete(attemptId, this.workerId, 'succeeded', null, {
        ...result,
      });
      recordPlatformMetric(OPERATIONS_METRICS.job, 1, { job: jobKey, outcome: 'succeeded' });
    } catch {
      await this.repository.complete(attemptId, this.workerId, 'failed', 'JOB_FAILED', {});
      recordPlatformMetric(OPERATIONS_METRICS.job, 1, { job: jobKey, outcome: 'failed' });
    } finally {
      clearTimeout(timer);
      clearInterval(heartbeat);
      recordPlatformMetric(OPERATIONS_METRICS.jobDuration, performance.now() - startedAt, {
        job: jobKey,
      });
    }
  }
}
