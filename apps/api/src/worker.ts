import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PlatformConfigService } from './platform/config/platform-config.service';
import { GracefulShutdown } from './platform/observability/graceful-shutdown';
import { PlatformLogger } from './platform/observability/platform-logger';
import { startTelemetry } from './platform/observability/telemetry';
import { OperationsWorker } from './operations/operations.worker';

export async function bootstrapWorker(): Promise<INestApplicationContext> {
  const { WorkerModule } = await import('./worker.module');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: false,
    bufferLogs: true,
  });
  const config = app.get(PlatformConfigService);
  const logger = new PlatformLogger(undefined, config.get('MASARIFI_LOG_LEVEL'));
  const telemetry = await startTelemetry(process.env);
  const shutdown = new GracefulShutdown(config.get('MASARIFI_SHUTDOWN_TIMEOUT_MS'));
  const operationsWorker = app.get(OperationsWorker);
  app.useLogger(logger);

  process.once('SIGTERM', () => {
    void (async () => {
      const { timedOut } = await shutdown.shutdown(() => operationsWorker.stop());
      if (timedOut) process.exitCode = 1;
      try {
        await app.close();
      } finally {
        await telemetry.shutdown();
      }
    })();
  });
  operationsWorker.start();
  logger.info('platform.started', {
    context: 'Bootstrap',
    processKind: 'worker',
    version: config.get('MASARIFI_RELEASE_VERSION'),
  });
  return app;
}

if (require.main === module) {
  void bootstrapWorker().catch(() => {
    process.stderr.write('WORKER_BOOTSTRAP_FAILED\n');
    process.exitCode = 1;
  });
}
