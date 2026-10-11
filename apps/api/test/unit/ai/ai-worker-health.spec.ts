import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { AiWorker } from '../../../src/ai/ai.worker';
import { healthyAiWorker, publishAiWorkerHealth } from '../../../src/ai/ai-worker-health';

const source = 'a'.repeat(40);
const env = {
  MASARIFI_PROCESS_KIND: 'worker',
  MASARIFI_RELEASE_VERSION: source,
  MASARIFI_VOICE_ANALYSIS_ONLY: 'true',
  MASARIFI_AI_ASSISTANT_ONLY: 'false',
  MASARIFI_AI_WORKER_POLL_MS: '5000',
};

it('requires matching scoped source and fresh successful polling, never mere startup', () => {
  const state = { sourceSha: source, scope: 'analysis', observedAt: 1000, state: 'ready' };
  expect(healthyAiWorker(state, env, 1000)).toBe(true);
  expect(healthyAiWorker(state, env, 186001)).toBe(false);
  expect(healthyAiWorker(state, env, 999)).toBe(false);
  const assistantEnv = {
    ...env,
    MASARIFI_VOICE_ANALYSIS_ONLY: 'false',
    MASARIFI_AI_ASSISTANT_ONLY: 'true',
    MASARIFI_AI_LEASE_SECONDS: '300',
  };
  expect(healthyAiWorker({ ...state, scope: 'assistant' }, assistantEnv, 250000)).toBe(true);
  expect(healthyAiWorker({ ...state, scope: 'assistant' }, assistantEnv, 306001)).toBe(false);
  for (const patch of [
    { state: 'starting' },
    { state: 'failed' },
    { state: 'stopped' },
    { sourceSha: 'b'.repeat(40) },
    { scope: 'assistant' },
    { observedAt: NaN },
  ]) {
    expect(healthyAiWorker({ ...state, ...patch }, env, 1000)).toBe(false);
  }
  for (const patch of [
    { MASARIFI_PROCESS_KIND: 'api' },
    { MASARIFI_AI_ASSISTANT_ONLY: 'true' },
    { MASARIFI_RELEASE_VERSION: 'unknown' },
    { MASARIFI_AI_WORKER_POLL_MS: '-1' },
    { MASARIFI_AI_WORKER_POLL_MS: '999999999' },
  ]) {
    expect(healthyAiWorker(state, { ...env, ...patch }, 1000)).toBe(false);
  }
});

it('writes only fixed health fields and returns failure without leaking filesystem errors', () => {
  const directory = mkdtempSync(join(tmpdir(), 'masarifi-ai-health-'));
  const path = join(directory, 'health.json');
  expect(publishAiWorkerHealth('ready', env, path, 1000)).toBe(true);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
    sourceSha: source,
    scope: 'analysis',
    observedAt: 1000,
    state: 'ready',
  });
  expect(publishAiWorkerHealth('failed', env, join(directory, 'absent', 'health.json'), 1000)).toBe(
    false,
  );
  expect(
    publishAiWorkerHealth('ready', { ...env, MASARIFI_AI_ASSISTANT_ONLY: 'true' }, path, 1000),
  ).toBe(false);
});

it('keeps every concurrent reader observation complete during repeated publications', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ai-health-overlap-')), 'health.json');
  expect(publishAiWorkerHealth('ready', env, path)).toBe(true);
  const shared = new SharedArrayBuffer(4);
  const reader = new Worker(
    `
    const { workerData, parentPort } = require('node:worker_threads');
    const { readFileSync } = require('node:fs');
    const stop = new Int32Array(workerData.shared);
    let observations = 0; let invalid = 0;
    parentPort.postMessage('ready');
    while (!Atomics.load(stop, 0)) {
      try {
        const value = JSON.parse(readFileSync(workerData.path, 'utf8'));
        if (!['ready', 'failed'].includes(value.state) || value.sourceSha.length !== 40) invalid++;
      } catch { invalid++; }
      observations++;
    }
    parentPort.postMessage({ observations, invalid });
  `,
    { eval: true, workerData: { path, shared } },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      reader.once('message', () => {
        resolve();
      });
      reader.once('error', reject);
    });
    const result = new Promise<{ observations: number; invalid: number }>((resolve, reject) => {
      reader.once('message', resolve);
      reader.once('error', reject);
    });
    let published = 0;
    for (let index = 0; index < 200; index++) {
      // Windows may reject replacement while a reader holds the old file.
      // A failed publication must still leave a complete prior observation.
      if (publishAiWorkerHealth(index % 2 ? 'ready' : 'failed', env, path)) published++;
    }
    Atomics.store(new Int32Array(shared), 0, 1);
    const observations = await result;
    expect(observations.observations).toBeGreaterThan(0);
    expect(observations.invalid).toBe(0);
    expect(published).toBeGreaterThan(0);
  } finally {
    Atomics.store(new Int32Array(shared), 0, 1);
    await reader.terminate();
  }
});

it('publishes ready only after scoped work finishes, failure immediately, and stopped after shutdown', async () => {
  let fail = false;
  const worker = new AiWorker(
    {
      claimAnalysisWork: () =>
        fail ? Promise.reject(new Error('FIXTURE_POLL_FAILED')) : Promise.resolve([]),
      claimAnalysisPurges: () => Promise.resolve([]),
    } as never,
    {} as never,
    {} as never,
    {
      get: (key: string) => key === 'MASARIFI_VOICE_ANALYSIS_ONLY',
      getRequired: (key: string) => (key === 'MASARIFI_AI_PROVIDER_ENABLED' ? true : 1),
    } as never,
  );
  const states: string[] = [];
  worker.observeHealth((state) => {
    states.push(state);
  });
  expect(states).toEqual(['starting']);
  await worker.runOnce();
  expect(states).toEqual(['starting', 'ready']);
  fail = true;
  await expect(worker.runOnce()).rejects.toThrow('FIXTURE_POLL_FAILED');
  expect(states).toEqual(['starting', 'ready', 'failed']);
  await worker.stop();
  expect(states.at(-1)).toBe('stopped');
});
