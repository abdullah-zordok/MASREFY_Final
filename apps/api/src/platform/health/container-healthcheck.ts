import { get } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { AI_WORKER_HEALTH_PATH, healthyAiWorker } from '../../ai/ai-worker-health';

export function isLiveResponse(status: number | undefined, body: string): boolean {
  try {
    const value = JSON.parse(body) as { status?: unknown };
    return status === 200 && value.status === 'ok';
  } catch {
    return false;
  }
}

export function runHealthcheck(
  env: NodeJS.ProcessEnv = process.env,
  healthPath = AI_WORKER_HEALTH_PATH,
): void {
  if (
    env.MASARIFI_PROCESS_KIND === 'worker' &&
    (env.MASARIFI_VOICE_ANALYSIS_ONLY === 'true' || env.MASARIFI_AI_ASSISTANT_ONLY === 'true')
  ) {
    try {
      if (statSync(healthPath).size > 1024) throw new Error('HEALTH_STATE_INVALID');
      const state: unknown = JSON.parse(readFileSync(healthPath, 'utf8'));
      process.exitCode = healthyAiWorker(state, env) ? 0 : 1;
    } catch {
      process.exitCode = 1;
    }
    return;
  }
  const port = Number.parseInt(env.MASARIFI_HTTP_PORT ?? '3000', 10);
  const request = get(
    { host: '127.0.0.1', port, path: '/health/live', timeout: 900 },
    (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > 1_024) request.destroy();
      });
      response.on('end', () => {
        process.exitCode = isLiveResponse(response.statusCode, body) ? 0 : 1;
      });
    },
  );
  request.on('timeout', () => request.destroy(new Error('HEALTHCHECK_TIMEOUT')));
  request.on('error', () => {
    process.exitCode = 1;
  });
}

if (require.main === module) runHealthcheck();
