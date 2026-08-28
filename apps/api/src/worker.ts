import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PlatformConfigService } from './platform/config/platform-config.service';
import { ClerkWebhookWorker } from './identity/clerk-webhook.worker';
import { GracefulShutdown } from './platform/observability/graceful-shutdown';
import { PlatformLogger } from './platform/observability/platform-logger';
import { OutboxWorkerService } from './platform/outbox/outbox-worker.service';
import { startTelemetry } from './platform/observability/telemetry';

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
  const worker = app.get(OutboxWorkerService);
  const clerkWorker = app.get(ClerkWebhookWorker);
  app.useLogger(logger);

  process.once('SIGTERM', () => {
    void shutdown.shutdown(async () => {
      await worker.stop();
      await clerkWorker.stop();
      await app.close();
      await telemetry.shutdown();
    });
  });
  worker.start();
  clerkWorker.start();
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
