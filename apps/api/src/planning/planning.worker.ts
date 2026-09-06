import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import { recordPlanningJob, recordPlanningReconciliation } from './planning.observability';
import {
  PlanningRepository,
  type ClaimedPlanningJob,
  type PlanningClaim,
} from './planning.repository';

export type PlanningJob = ClaimedPlanningJob | 'planning.reconcile';
const JOBS: readonly PlanningJob[] = [
  'planning.salary-cycle.generate',
  'planning.obligation-schedule.generate',
  'planning.payment-match.propose',
  'planning.overdue.mark',
  'planning.reminders.emit',
];

@Injectable()
export class PlanningWorker implements OnModuleDestroy {
  private active: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly repository: PlanningRepository) {}

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

  async runJob(job: PlanningJob): Promise<number> {
    if (job === 'planning.reconcile') {
      const rows = await this.repository.reconcilePlanning(true, 100);
      recordPlanningReconciliation(rows.length ? 'repaired' : 'clean', rows.length);
      return rows.length;
    }
    const claims = await this.repository.claimPlanning(job, 100, 60);
    for (const claim of claims) await this.process(job, claim);
    return claims.length;
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

  private async execute(): Promise<void> {
    for (const job of JOBS) {
      try {
        await this.runJob(job);
        recordPlanningJob(job, 'success');
      } catch (error) {
        recordPlanningJob(job, 'failure');
        throw error;
      }
    }
    try {
      const rows = await this.repository.reconcilePlanning(true, 100);
      recordPlanningReconciliation(rows.length ? 'repaired' : 'clean', rows.length);
    } catch (error) {
      recordPlanningReconciliation('failure', 1);
      throw error;
    }
  }

  private async process(job: ClaimedPlanningJob, claim: PlanningClaim): Promise<void> {
    try {
      await this.repository.executePlanningClaim(job, claim);
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.repository.completePlanningClaim(
        claim.id,
        claim.leaseToken,
        claim.attemptCount >= 8 ? 'exhausted' : 'retry',
        { errorCode },
      );
    }
  }

  private errorCode(error: unknown): string {
    const value = error instanceof Error ? error.message : 'PLANNING_JOB_FAILED';
    return value.match(/[A-Z][A-Z0-9_]{2,63}/)?.[0] ?? 'PLANNING_JOB_FAILED';
  }
}
