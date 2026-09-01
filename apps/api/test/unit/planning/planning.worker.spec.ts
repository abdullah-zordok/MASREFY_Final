jest.mock('../../../src/planning/planning.observability', () => ({
  recordPlanningJob: jest.fn(),
  recordPlanningReconciliation: jest.fn(),
}));

import { PlanningWorker, type PlanningJob } from '../../../src/planning/planning.worker';

const claim = {
  id: '70000000-0000-4000-8000-000000000081',
  resourceId: '70000000-0000-4000-8000-000000000082',
  attemptCount: 1,
  leaseToken: '70000000-0000-4000-8000-000000000083',
};

describe('PlanningWorker', () => {
  it.each([
    'planning.salary-cycle.generate',
    'planning.obligation-schedule.generate',
    'planning.payment-match.propose',
    'planning.overdue.mark',
    'planning.reminders.emit',
  ] as PlanningJob[])('claims and atomically executes and completes %s', async (job) => {
    const repository = {
      claimPlanning: jest.fn().mockResolvedValue([claim]),
      executePlanningClaim: jest.fn().mockResolvedValue({ changed: 1 }),
      completePlanningClaim: jest.fn(),
    };
    const worker = new PlanningWorker(repository as never);
    await expect(worker.runJob(job)).resolves.toBe(1);
    expect(repository.executePlanningClaim).toHaveBeenCalledWith(job, claim);
    expect(repository.completePlanningClaim).not.toHaveBeenCalled();
  });

  it('retries failures and exhausts poison claims at attempt eight', async () => {
    const completePlanningClaim = jest.fn();
    const repository = {
      claimPlanning: jest.fn().mockResolvedValue([{ ...claim, attemptCount: 8 }]),
      executePlanningClaim: jest.fn().mockRejectedValue(new Error('DATABASE_UNAVAILABLE')),
      completePlanningClaim,
    };
    const worker = new PlanningWorker(repository as never);
    await worker.runJob('planning.salary-cycle.generate');
    expect(completePlanningClaim).toHaveBeenCalledWith(claim.id, claim.leaseToken, 'exhausted', {
      errorCode: 'DATABASE_UNAVAILABLE',
    });
  });

  it('coalesces concurrent cycles and waits for active work during shutdown', async () => {
    let release!: () => void;
    const pending = new Promise<Record<string, unknown>>((resolve) => {
      release = () => {
        resolve({ changed: 1 });
      };
    });
    const repository = {
      claimPlanning: jest.fn().mockResolvedValue([claim]),
      executePlanningClaim: jest.fn().mockReturnValue(pending),
      completePlanningClaim: jest.fn(),
      markPlanningOverdue: jest.fn().mockResolvedValue(0),
      reconcilePlanning: jest.fn().mockResolvedValue([]),
    };
    const worker = new PlanningWorker(repository as never);
    const first = worker.runOnce();
    expect(worker.runOnce()).toBe(first);
    const stopping = worker.stop();
    release();
    await expect(Promise.all([first, stopping])).resolves.toEqual([undefined, undefined]);
  });
});
