import { OperationsWorker } from '../../../src/operations/operations.worker';

describe('operations worker recovery', () => {
  it('replays an available durable claim after a safe failure without duplicating completion', async () => {
    let polls = 0;
    const completions: string[] = [];
    const worker = new OperationsWorker(
      {
        claim: () => {
          polls += 1;
          return Promise.resolve(
            polls > 1
              ? []
              : [
                  {
                    jobKey: 'ledger.reconcile',
                    attemptId: '00000000-0000-4000-8000-000000000013',
                    timeoutSeconds: 10,
                  },
                ],
          );
        },
        complete: (_attempt, _worker, outcome) => {
          completions.push(outcome);
          return Promise.resolve();
        },
        heartbeat: () => Promise.resolve(),
      },
      { run: () => Promise.resolve({ outcome: 'succeeded', processed: 1 }) },
    );
    await worker.runOnce();
    await worker.runOnce();
    expect(completions).toEqual(['succeeded']);
  });
});
