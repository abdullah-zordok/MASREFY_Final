import { constants, closeSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export type AiWorkerHealthState = 'starting' | 'ready' | 'failed' | 'stopped';
export const AI_WORKER_HEALTH_PATH = '/tmp/ai-worker-health.json';

function scope(env: NodeJS.ProcessEnv): 'analysis' | 'assistant' | null {
  if (env.MASARIFI_PROCESS_KIND !== 'worker') return null;
  const analysis = env.MASARIFI_VOICE_ANALYSIS_ONLY === 'true';
  const assistant = env.MASARIFI_AI_ASSISTANT_ONLY === 'true';
  return analysis === assistant ? null : analysis ? 'analysis' : 'assistant';
}

export function healthyAiWorker(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const pollMs = Number(env.MASARIFI_AI_WORKER_POLL_MS ?? '500');
  const leaseSeconds = Number(env.MASARIFI_AI_LEASE_SECONDS ?? '120');
  const expectedScope = scope(env);
  return (
    expectedScope !== null &&
    /^[a-f0-9]{40}$/.test(env.MASARIFI_RELEASE_VERSION ?? '') &&
    Number.isInteger(pollMs) &&
    pollMs >= 100 &&
    pollMs <= 10000 &&
    Number.isInteger(leaseSeconds) &&
    leaseSeconds >= 10 &&
    leaseSeconds <= 300 &&
    state.sourceSha === env.MASARIFI_RELEASE_VERSION &&
    state.scope === expectedScope &&
    state.state === 'ready' &&
    typeof state.observedAt === 'number' &&
    Number.isFinite(state.observedAt) &&
    Number.isFinite(now) &&
    now >= state.observedAt &&
    // Existing Voice and Assistant deadlines differ. Allow a bounded job to
    // finish without marking legitimate provider work stale before its deadline.
    now - state.observedAt <= Math.max(180000, leaseSeconds * 1000) + pollMs
  );
}

export function publishAiWorkerHealth(
  state: AiWorkerHealthState,
  env: NodeJS.ProcessEnv = process.env,
  path = AI_WORKER_HEALTH_PATH,
  now = Date.now(),
): boolean {
  const expectedScope = scope(env);
  if (!expectedScope || !/^[a-f0-9]{40}$/.test(env.MASARIFI_RELEASE_VERSION ?? '')) return false;
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(
      descriptor,
      JSON.stringify({
        sourceSha: env.MASARIFI_RELEASE_VERSION,
        scope: expectedScope,
        observedAt: now,
        state,
      }),
    );
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
    return true;
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        /* Publication already failed. */
      }
    }
    try {
      unlinkSync(temporaryPath);
    } catch {
      /* Absent after publication or failed creation. */
    }
  }
}
