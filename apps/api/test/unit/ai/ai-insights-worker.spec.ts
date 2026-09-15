import { AiWorker } from '../../../src/ai/ai.worker';

it('runs deterministic proactive insight refresh without an AI provider', async () => {
  const repository = { refreshInsights: jest.fn(() => Promise.resolve(2)) };
  const gateway = { complete: jest.fn() };
  const worker = new AiWorker(
    repository as never,
    {} as never,
    gateway as never,
    { getRequired: jest.fn(() => 25) } as never,
  );

  await expect(worker.runJob('financial-insights.generate')).resolves.toBe(2);
  expect(repository.refreshInsights).toHaveBeenCalledWith(25);
  expect(gateway.complete).not.toHaveBeenCalled();
});
