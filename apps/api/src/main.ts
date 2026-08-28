import 'reflect-metadata';

import { type INestApplication, ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { PlatformConfigService } from './platform/config/platform-config.service';
import { HealthService } from './platform/health/health.service';
import { configureHttpSecurity } from './platform/http/http-security';
import { configureValidation } from './platform/http/http-validation';
import { configureRequestDrain, drainApplication } from './platform/http/request-drain';
import { RequestTimeoutInterceptor } from './platform/http/request-timeout.interceptor';
import { SafeExceptionFilter } from './platform/http/safe-exception.filter';
import { GracefulShutdown } from './platform/observability/graceful-shutdown';
import { PlatformLogger } from './platform/observability/platform-logger';
import { startTelemetry } from './platform/observability/telemetry';

export async function bootstrapApi(): Promise<INestApplication> {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    bufferLogs: true,
  });
  const config = app.get(PlatformConfigService);
  const health = app.get(HealthService);
  const logger = new PlatformLogger(undefined, config.get('MASARIFI_LOG_LEVEL'));
  const telemetry = await startTelemetry(process.env);
  const shutdown = new GracefulShutdown(config.get('MASARIFI_SHUTDOWN_TIMEOUT_MS'));
  app.useLogger(logger);
  configureRequestDrain(app, shutdown);
  configureValidation(app, config.get('MASARIFI_HTTP_BODY_LIMIT_BYTES'), ['/webhooks/clerk']);
  configureHttpSecurity(app, config);
  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new RequestTimeoutInterceptor(config),
  );

  process.once('SIGTERM', () => {
    void drainApplication(app, health, telemetry, shutdown)
      .then(({ timedOut }) => {
        logger.info('platform.stopped', {
          context: 'Bootstrap',
          processKind: 'api',
          state: timedOut ? 'not_ready' : 'ready',
        });
      })
      .catch(() => {
        process.stderr.write('API_SHUTDOWN_FAILED\n');
        process.exitCode = 1;
      });
  });
  await app.listen(config.get('MASARIFI_HTTP_PORT'));
  logger.info('platform.started', {
    context: 'Bootstrap',
    processKind: 'api',
    version: config.get('MASARIFI_RELEASE_VERSION'),
  });
  return app;
}

if (require.main === module) {
  void bootstrapApi().catch(() => {
    process.stderr.write('API_BOOTSTRAP_FAILED\n');
    process.exitCode = 1;
  });
}
