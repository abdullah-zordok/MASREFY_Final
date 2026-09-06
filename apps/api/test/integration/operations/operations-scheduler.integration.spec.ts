import { OperationsWorker } from '../../../src/operations/operations.worker';

describe('operations scheduler integration', () => {
  it('dispatches one authoritative claim when workers poll concurrently', async () => {
    let available = true;
    const completions: unknown[][] = [];
    const repository = {
      claim: () => {
        if (!available) return Promise.resolve([]);
        available = false;
        return Promise.resolve([
          {
            jobKey: 'operations.cache-invalidate',
            attemptId: '00000000-0000-4000-8000-000000000013',
            timeoutSeconds: 10,
          },
        ]);
      },
      complete: (...input: unknown[]) => {
        completions.push(input);
        return Promise.resolve();
      },
      heartbeat: () => Promise.resolve(),
    };
    const registry = { run: jest.fn(() => Promise.resolve({ outcome: 'succeeded' })) };

    await Promise.all([
      new OperationsWorker(repository, registry).runOnce(),
      new OperationsWorker(repository, registry).runOnce(),
    ]);
    expect(registry.run).toHaveBeenCalledTimes(1);
    expect(completions).toHaveLength(1);
    expect(completions[0]?.[2]).toBe('succeeded');
  });
});
