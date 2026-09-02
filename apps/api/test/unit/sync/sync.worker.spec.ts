import { HttpException } from '@nestjs/common';

import { SyncWorker } from '../../../src/sync/sync.worker';

const claimed = {
  id: '74000000-0000-4000-8000-000000000001',
  userId: 'owner',
  deviceId: 'device',
  factorAgeSeconds: 700,
  mutation: {
    operationId: '74000000-0000-4000-8000-000000000002',
    domain: 'transactions',
    resourceType: 'transaction',
    schemaVersion: 1,
    dependsOn: [],
    operation: 'update',
    resourceId: '74000000-0000-4000-8000-000000000003',
    baseVersion: 1,
    payload: { title: 'Client' },
  },
  attemptCount: 1,
  leaseToken: '74000000-0000-4000-8000-000000000004',
} as const;

const values: Record<string, number> = {
  MASARIFI_SYNC_BATCH_SIZE: 100,
  MASARIFI_SYNC_LEASE_SECONDS: 60,
  MASARIFI_SYNC_RETENTION_DAYS: 30,
  MASARIFI_SYNC_POLL_MS: 500,
  MASARIFI_SYNC_RETRY_BASE_SECONDS: 1,
  MASARIFI_SYNC_RETRY_MAX_SECONDS: 300,
  MASARIFI_SYNC_RETRY_JITTER_MS: 1000,
  MASARIFI_SYNC_MAX_ATTEMPTS: 10,
};
const config = { getRequired: jest.fn((key: string) => values[key]) } as never;

describe('SyncWorker', () => {
  it('claims, dispatches, and completes one mutation with its fence', async () => {
    const repository = {
      claimMutations: jest.fn().mockResolvedValue([claimed]),
      workerComplete: jest.fn(),
    };
    const handlers = { dispatch: jest.fn().mockResolvedValue({ resourceId: 'server-one' }) };
    const worker = new SyncWorker(repository as never, handlers as never, config);
    await expect(worker.runJob('sync-mutations.retry')).resolves.toBe(1);
    expect(handlers.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', factorAgeSeconds: 700 }),
      claimed.mutation,
      claimed.mutation.operationId,
    );
    expect(repository.workerComplete).toHaveBeenCalledWith(
      claimed.id,
      claimed.leaseToken,
      'applied',
      { resourceId: 'server-one' },
      null,
    );
  });

  it('turns stale financial edits into explicit conflicts', async () => {
    const repository = {
      claimMutations: jest.fn().mockResolvedValue([claimed]),
      conflictTarget: jest.fn().mockResolvedValue({ version: 2, snapshot: { title: 'Server' } }),
      createConflict: jest.fn().mockResolvedValue({ id: 'conflict-one' }),
      workerComplete: jest.fn(),
    };
    const handlers = {
      dispatch: jest
        .fn()
        .mockRejectedValue(new HttpException({ code: 'VERSION_CONFLICT', currentVersion: 2 }, 409)),
    };
    const worker = new SyncWorker(repository as never, handlers as never, config);
    await worker.runJob('sync-mutations.retry');
    expect(repository.createConflict).toHaveBeenCalledWith(
      claimed.userId,
      expect.objectContaining({ mutationId: claimed.id }),
      claimed.leaseToken,
    );
    expect(repository.workerComplete).not.toHaveBeenCalled();
  });

  it('uses deterministic capped backoff and terminally rejects poison items', async () => {
    const poison = { ...claimed, attemptCount: 10 };
    const repository = {
      claimMutations: jest.fn().mockResolvedValue([poison]),
      workerComplete: jest.fn(),
    };
    const handlers = { dispatch: jest.fn().mockRejectedValue(new Error('DATABASE_UNAVAILABLE')) };
    const worker = new SyncWorker(repository as never, handlers as never, config);
    expect(worker.retryDelayMs(claimed.id, 4)).toBe(worker.retryDelayMs(claimed.id, 4));
    expect(worker.retryDelayMs(claimed.id, 99)).toBeLessThanOrEqual(300_000);
    await worker.runJob('sync-mutations.retry');
    expect(repository.workerComplete).toHaveBeenCalledWith(
      poison.id,
      poison.leaseToken,
      'rejected',
      null,
      { code: 'SYNC_RETRY_EXHAUSTED', cause: 'DATABASE_UNAVAILABLE' },
    );
  });

  it('terminally rejects stale planning versions without retrying', async () => {
    const planningClaim = {
      ...claimed,
      mutation: { ...claimed.mutation, domain: 'planning', resourceType: 'budget' },
    } as const;
    const repository = {
      claimMutations: jest.fn().mockResolvedValue([planningClaim]),
      workerComplete: jest.fn(),
      retryMutation: jest.fn(),
    };
    const handlers = {
      dispatch: jest
        .fn()
        .mockRejectedValue(new HttpException({ code: 'PLANNING_VERSION_CONFLICT' }, 409)),
    };
    const worker = new SyncWorker(repository as never, handlers as never, config);
    await worker.runJob('sync-mutations.retry');
    expect(repository.workerComplete).toHaveBeenCalledWith(
      planningClaim.id,
      planningClaim.leaseToken,
      'rejected',
      null,
      { code: 'PLANNING_VERSION_CONFLICT' },
    );
    expect(repository.retryMutation).not.toHaveBeenCalled();
  });

  it.each(['idempotency.cleanup', 'sync-state.cleanup', 'conflicts.expire'] as const)(
    'runs the bounded %s job',
    async (job) => {
      const repository = { runMaintenance: jest.fn().mockResolvedValue(2) };
      const worker = new SyncWorker(repository as never, {} as never, config);
      await expect(worker.runJob(job)).resolves.toBe(2);
      expect(repository.runMaintenance).toHaveBeenCalledWith(job, 30);
    },
  );
});
