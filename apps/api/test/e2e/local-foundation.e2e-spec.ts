import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { PlatformConfigService } from '../../src/platform/config/platform-config.service';
import { HealthService } from '../../src/platform/health/health.service';
import type { QueueHealthIndicator } from '../../src/platform/health/queue-health.indicator';
import { validateEnvironment } from '../../src/platform/config/environment.schema';
import type { PoolService } from '../../src/platform/database/pool.service';

const liveTest = process.env.MASARIFI_LIVE_DATABASE_TESTS === '1' ? it : it.skip;

function applicationEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.MASARIFI_LIVE_DATABASE_TESTS;
  return environment;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_PORT_UNAVAILABLE');
  await new Promise<void>((resolveClose) =>
    server.close(() => {
      resolveClose();
    }),
  );
  return address.port;
}

function startProcess(
  root: string,
  entry: 'main.js' | 'worker.js',
  kind: 'api' | 'worker',
  port: number,
  databaseUrl: string,
) {
  const child = spawn(process.execPath, [resolve(root, `apps/api/dist/src/${entry}`)], {
    cwd: resolve(root, 'apps/api'),
    env: {
      ...applicationEnvironment(),
      NODE_ENV: 'test',
      MASARIFI_PROCESS_KIND: kind,
      MASARIFI_RELEASE_VERSION: 'foundation-e2e',
      MASARIFI_HTTP_PORT: String(port),
      DATABASE_URL: databaseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const collect = (chunk: Buffer) => {
    output = `${output}${chunk.toString('utf8')}`.slice(-16_384);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return { child, output: () => output };
}

async function waitForResponse(url: string, expectedStatus: number): Promise<Response> {
  const deadline = Date.now() + 20_000;
  let lastStatus: number | 'unreachable' = 'unreachable';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      if (response.status === expectedStatus) return response;
    } catch {
      // Process startup is expected to refuse connections briefly.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `FOUNDATION_RESPONSE_TIMEOUT:${String(expectedStatus)}:LAST_${String(lastStatus)}`,
  );
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = once(child, 'exit').then(() => true);
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<boolean>((resolveTimeout) => {
    timeout = setTimeout(() => {
      resolveTimeout(false);
    }, 5_000);
  });
  const didExit = await Promise.race([exited, timedOut]);
  if (timeout) clearTimeout(timeout);
  if (!didExit) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

describe('local foundation', () => {
  const root = resolve(__dirname, '../../../..');

  it('uses the official Supabase project and orchestrates only API and worker', () => {
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker/local/compose.backend.yml'), 'utf8');

    expect(config).toContain('project_id');
    expect(compose).toContain('backend-api:');
    expect(compose).toContain('worker:');
    expect(compose).not.toMatch(/^\s{2}(postgres|auth|storage|studio|queue|redis):/m);
  });

  it('reports healthy dependencies and fails safely when one is unavailable', async () => {
    const environment = validateEnvironment({
      ...applicationEnvironment(),
      MASARIFI_READINESS_CACHE_TTL_MS: 0,
    });
    const config = new PlatformConfigService(new ConfigService(environment));
    const ping = jest.fn().mockResolvedValue(undefined);
    const database = { ping } as unknown as PoolService;
    const check = jest.fn().mockResolvedValue('up');
    const queue = { check } as unknown as QueueHealthIndicator;
    const health = new HealthService(config, database, queue);

    expect(health.live().status).toBe('ok');
    expect(ping).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();

    await expect(health.ready()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up', queue: 'up' },
    });
    expect(ping).toHaveBeenLastCalledWith(1_000);
    expect(check).toHaveBeenLastCalledWith(1_000);

    ping.mockRejectedValueOnce(new Error('postgresql://secret-host'));
    await expect(health.ready()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: 'down', queue: 'up' },
    });

    health.beginShutdown();
    ping.mockClear();
    check.mockClear();
    await expect(health.ready()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: 'down', queue: 'down' },
    });
    expect(ping).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  liveTest(
    'starts API and worker and fails readiness safely when PostgreSQL is unavailable',
    async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
      const healthyPort = await availablePort();
      const unavailablePort = await availablePort();
      const api = startProcess(root, 'main.js', 'api', healthyPort, databaseUrl);
      const worker = startProcess(root, 'worker.js', 'worker', healthyPort, databaseUrl);
      const unavailableApi = startProcess(
        root,
        'main.js',
        'api',
        unavailablePort,
        'postgresql://unavailable:unavailable@127.0.0.1:1/postgres',
      );

      try {
        const live = await waitForResponse(
          `http://127.0.0.1:${String(healthyPort)}/health/live`,
          200,
        );
        await expect(live.json()).resolves.toMatchObject({
          status: 'ok',
          version: 'foundation-e2e',
        });
        const ready = await waitForResponse(
          `http://127.0.0.1:${String(healthyPort)}/health/ready`,
          200,
        );
        await expect(ready.json()).resolves.toEqual({
          status: 'ready',
          checks: { database: 'up', queue: 'up' },
        });

        const unavailable = await waitForResponse(
          `http://127.0.0.1:${String(unavailablePort)}/health/ready`,
          503,
        );
        const unavailableBody: unknown = await unavailable.json();
        expect(unavailableBody).toEqual({
          status: 'not_ready',
          checks: { database: 'down', queue: 'down' },
        });
        expect(JSON.stringify(unavailableBody)).not.toMatch(/postgres|127\.0\.0\.1|unavailable/i);

        const workerDeadline = Date.now() + 10_000;
        while (!worker.output().includes('platform.started') && Date.now() < workerDeadline) {
          if (worker.child.exitCode !== null) {
            throw new Error(`WORKER_EXITED:${String(worker.child.exitCode)}:${worker.output()}`);
          }
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
        expect(worker.output()).toContain('platform.started');
      } finally {
        await Promise.all([
          stopProcess(api.child),
          stopProcess(worker.child),
          stopProcess(unavailableApi.child),
        ]);
      }
    },
    60_000,
  );
});
