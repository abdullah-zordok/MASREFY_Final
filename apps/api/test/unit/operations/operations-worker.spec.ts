import {
  GOVERNED_JOB_KEYS,
  OPERATIONS_JOB_KEYS,
  OperationsJobRegistry,
} from '../../../src/operations/job-registry';
import { OperationsWorker } from '../../../src/operations/operations.worker';
import { EngagementWorker } from '../../../src/engagement/engagement.worker';

describe('operations job registry', () => {
  const expected = [
    'operations.provider-health',
    'operations.capacity-evaluate',
    'operations.cache-invalidate',
    'operations.backup-verify',
    'operations.restore-drill',
    'operations.dr-rehearse',
    'operations.maintenance-activate',
    'operations.maintenance-complete',
    'operations.job-history-retain',
  ] as const;

  it('contains exactly the nine owned Phase 13 jobs', () => {
    expect(OPERATIONS_JOB_KEYS).toEqual(expected);
  });

  it('contains every governed job once and no paid work', () => {
    expect(GOVERNED_JOB_KEYS).toHaveLength(50);
    expect(new Set(GOVERNED_JOB_KEYS).size).toBe(50);
    expect(JSON.stringify(GOVERNED_JOB_KEYS)).not.toMatch(
      /billing|stripe|subscription|entitlement|checkout|promotion/iu,
    );
  });

  it('reuses an existing domain handler and reduces its result to a safe count', async () => {
    const outbox = { runOnce: jest.fn().mockResolvedValue(2) };
    const registry = new OperationsJobRegistry(
      { runJob: () => Promise.resolve({ outcome: 'succeeded' }) },
      outbox as never,
    );
    await expect(registry.run('platform.outbox.dispatch')).resolves.toEqual({
      outcome: 'succeeded',
      processed: 2,
    });
  });

  it.each(expected)('dispatches the owned %s behavior', async (jobKey) => {
    const service = {
      runJob: jest.fn((key: string) =>
        Promise.resolve({ outcome: key === jobKey ? 'succeeded' : 'wrong' }),
      ),
    };
    const registry = new OperationsJobRegistry(service);

    await expect(registry.run(jobKey)).resolves.toEqual({ outcome: 'succeeded' });
    expect(service.runJob).toHaveBeenCalledWith(jobKey);
  });

  it('rejects arbitrary and billing job identifiers', async () => {
    const registry = new OperationsJobRegistry({
      runJob: () => Promise.resolve({ outcome: 'should-not-run' }),
    });
    await expect(registry.run('shell.execute')).rejects.toThrow('OPERATIONS_JOB_UNKNOWN');
    await expect(registry.run('billing.reconcile')).rejects.toThrow('OPERATIONS_JOB_UNKNOWN');
  });
});

describe('OperationsWorker', () => {
  it('records a safe successful attempt', async () => {
    const completed: unknown[] = [];
    const repository = {
      claim: jest.fn(() =>
        Promise.resolve([
          {
            jobKey: 'operations.provider-health',
            attemptId: '00000000-0000-4000-8000-000000000013',
            timeoutSeconds: 30,
          },
        ]),
      ),
      complete: (...input: unknown[]) => Promise.resolve(completed.push(input)),
      heartbeat: () => Promise.resolve(),
    };
    const worker = new OperationsWorker(repository, {
      run: () => Promise.resolve({ outcome: 'succeeded' }),
    });

    await worker.runOnce();
    expect(repository.claim).toHaveBeenCalledWith(expect.any(String), 1);
    expect(completed).toEqual([
      [
        '00000000-0000-4000-8000-000000000013',
        expect.any(String),
        'succeeded',
        null,
        { outcome: 'succeeded' },
      ],
    ]);
  });

  it('reduces thrown errors to one fixed safe code', async () => {
    const completed: unknown[] = [];
    const repository = {
      claim: jest.fn(() =>
        Promise.resolve([
          {
            jobKey: 'operations.provider-health',
            attemptId: '00000000-0000-4000-8000-000000000013',
            timeoutSeconds: 30,
          },
        ]),
      ),
      complete: (...input: unknown[]) => Promise.resolve(completed.push(input)),
      heartbeat: () => Promise.resolve(),
    };
    const worker = new OperationsWorker(repository, {
      run: () => Promise.reject(new Error('https://secret.invalid?token=unsafe')),
    });

    await worker.runOnce();
    expect(JSON.stringify(completed)).not.toContain('secret.invalid');
    expect(completed).toEqual([
      ['00000000-0000-4000-8000-000000000013', expect.any(String), 'failed', 'JOB_FAILED', {}],
    ]);
  });

  it('records an overrun only after the handler settles', async () => {
    let release!: () => void;
    const held = new Promise<Record<string, string>>((resolve) => {
      release = () => {
        resolve({ outcome: 'late' });
      };
    });
    const completed: unknown[] = [];
    let claimed = false;
    const worker = new OperationsWorker(
      {
        claim: () => {
          if (claimed) return Promise.resolve([]);
          claimed = true;
          return Promise.resolve([
            {
              jobKey: 'operations.provider-health',
              attemptId: '00000000-0000-4000-8000-000000000013',
              timeoutSeconds: 0.001,
            },
          ]);
        },
        complete: (...input: unknown[]) => Promise.resolve(completed.push(input)),
        heartbeat: () => Promise.resolve(),
      },
      { run: async () => held },
    );

    const running = worker.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(completed).toEqual([]);
    release();
    await running;
    await worker.stop();
    expect(completed[0]).toEqual([
      '00000000-0000-4000-8000-000000000013',
      expect.any(String),
      'failed',
      'JOB_TIMEOUT',
      {},
    ]);
  });
});

describe('governed domain handlers', () => {
  it('runs only the selected engagement job block', async () => {
    const expireNotifications = jest.fn(() => Promise.resolve(3));
    const worker = new EngagementWorker(
      { expireNotifications } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(worker.runJob('notification.expire')).resolves.toBe(3);
    expect(expireNotifications).toHaveBeenCalledTimes(1);
  });
});
