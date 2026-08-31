import { Test } from '@nestjs/testing';

import { SyncHandlers } from '../../src/sync/sync.handlers';
import { SyncRepository } from '../../src/sync/sync.repository';
import { SyncWorker } from '../../src/sync/sync.worker';
import { WorkerModule } from '../../src/worker.module';

describe('sync worker container registration', () => {
  it('registers all four bounded jobs and stops before shutdown completes', async () => {
    const repository = {
      claimMutations: jest.fn().mockResolvedValue([]),
      runMaintenance: jest.fn().mockResolvedValue(0),
    };
    const module = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(SyncRepository)
      .useValue(repository)
      .overrideProvider(SyncHandlers)
      .useValue({ dispatch: jest.fn() })
      .compile();
    const worker = module.get(SyncWorker);
    const stop = jest.spyOn(worker, 'stop');

    await expect(worker.runJob('sync-mutations.retry')).resolves.toBe(0);
    for (const job of ['idempotency.cleanup', 'sync-state.cleanup', 'conflicts.expire'] as const)
      await expect(worker.runJob(job)).resolves.toBe(0);
    await module.close();

    expect(repository.claimMutations).toHaveBeenCalledTimes(1);
    expect(repository.runMaintenance).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
