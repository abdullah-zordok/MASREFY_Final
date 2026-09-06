import { performance } from 'node:perf_hooks';

import { HttpException, Inject, Injectable, Optional } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from '../ledger/idempotency';
import { MetaService } from '../platform/meta/meta.service';
import {
  OPERATIONS_METRICS,
  recordPlatformMetric,
} from '../platform/observability/platform-metrics';
import type { OperationsJobKey } from './job-registry';
import { OperationsRepository } from './operations.repository';
import {
  parseFlagContext,
  parseJobAction,
  parseOperationCommand,
  parseOperationsReadQuery,
  type OperationCommand,
} from './operations.schemas';

type Store = Pick<
  OperationsRepository,
  'read' | 'jobAction' | 'evaluateFlag' | 'runOperationsJob' | 'command'
>;

const READ_KINDS = new Set([
  'providers',
  'scheduled-jobs',
  'job-runs',
  'incidents',
  'settings',
  'flags',
  'maintenance',
  'health',
  'queues',
  'performance',
  'job-run',
  'setting',
  'recovery',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function operationError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (code === 'P0002') return new HttpException({ code: 'NOT_FOUND' }, 404);
  if (code === '42501') return new HttpException({ code: 'FORBIDDEN' }, 403);
  if (['40001', '23P01', '23505'].includes(code) || /STALE|CONFLICT|REUSED|OVERLAP/u.test(message))
    return new HttpException({ code: 'VERSION_CONFLICT' }, 409);
  if (
    ['22023', '22P02', '23502', '23503', '23514'].includes(code) ||
    /^(OPERATIONS_|IDEMPOTENCY_)/u.test(message)
  )
    return new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  return new HttpException({ code: 'SERVICE_UNAVAILABLE' }, 503);
}

@Injectable()
export class OperationsService {
  constructor(
    @Inject(OperationsRepository)
    private readonly repository: Partial<Store>,
    @Optional()
    @Inject(MetaService)
    private readonly meta?: Pick<MetaService, 'invalidate'>,
  ) {}

  async list(principal: ClerkPrincipal, kind: string, query: unknown): Promise<unknown> {
    try {
      if (!READ_KINDS.has(kind)) throw new Error('INVALID_KIND');
      const normalized = parseOperationsReadQuery(kind, query);
      if (!this.repository.read) throw new Error('REPOSITORY_UNAVAILABLE');
      return await this.repository.read(principal, kind, normalized);
    } catch (error) {
      throw operationError(error);
    }
  }

  async jobAction(
    principal: ClerkPrincipal,
    runId: string,
    action: 'retry' | 'cancel',
    body: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      if (!UUID.test(runId) || !['retry', 'cancel'].includes(action)) throw new Error('INVALID');
      const input = parseJobAction(body);
      if (!this.repository.jobAction) throw new Error('REPOSITORY_UNAVAILABLE');
      return await this.repository.jobAction(principal, {
        runId,
        action,
        ...input,
        requestId,
        idempotencyHash: hashIdempotencyKey(idempotencyKey),
      });
    } catch (error) {
      throw operationError(error);
    }
  }

  async previewFlag(principal: ClerkPrincipal, key: string, context: unknown): Promise<unknown> {
    try {
      if (!/^[a-z][a-z0-9.-]{2,79}$/u.test(key) || !this.repository.evaluateFlag)
        throw new Error('INVALID');
      return await this.repository.evaluateFlag(principal, key, parseFlagContext(context));
    } catch (error) {
      throw operationError(error);
    }
  }

  async command(
    principal: ClerkPrincipal,
    operation: OperationCommand,
    resourceKey: string | null,
    body: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      if (!this.repository.command) throw new Error('REPOSITORY_UNAVAILABLE');
      if (
        resourceKey !== null &&
        !UUID.test(resourceKey) &&
        !/^[a-z][a-z0-9_.-]{2,127}$/u.test(resourceKey)
      )
        throw new Error('INVALID_RESOURCE');
      const input = parseOperationCommand(operation, body);
      const result = await this.repository.command(
        principal,
        operation,
        resourceKey,
        input,
        requestId,
        hashIdempotencyKey(idempotencyKey),
      );
      if (!operation.includes('Incident')) this.meta?.invalidate();
      if (operation.includes('Incident'))
        recordPlatformMetric(OPERATIONS_METRICS.incident, 1, {
          severity: typeof input.severity === 'string' ? input.severity : 'unchanged',
          status:
            typeof input.status === 'string'
              ? input.status
              : operation === 'createIncident'
                ? 'open'
                : 'updated',
        });
      else if (operation.includes('Maintenance'))
        recordPlatformMetric(OPERATIONS_METRICS.maintenance, 1, {
          status:
            typeof input.status === 'string'
              ? input.status
              : operation === 'createMaintenance'
                ? 'scheduled'
                : 'updated',
        });
      else
        recordPlatformMetric(OPERATIONS_METRICS.configuration, 1, {
          operation,
          outcome: 'succeeded',
        });
      return result;
    } catch (error) {
      const metric = operation.includes('Incident')
        ? OPERATIONS_METRICS.incident
        : operation.includes('Maintenance')
          ? OPERATIONS_METRICS.maintenance
          : OPERATIONS_METRICS.configuration;
      recordPlatformMetric(metric, 1, { operation, outcome: 'rejected' });
      throw operationError(error);
    }
  }

  async runJob(
    jobKey: OperationsJobKey,
  ): Promise<Record<string, string | number | boolean | null>> {
    if (!this.repository.runOperationsJob)
      return Promise.reject(new Error('OPERATIONS_UNAVAILABLE'));
    const startedAt = performance.now();
    try {
      const result = await this.repository.runOperationsJob(jobKey);
      if (jobKey === 'operations.cache-invalidate') this.meta?.invalidate();
      if (jobKey === 'operations.provider-health') {
        for (const provider of ['database', 'storage', 'identity', 'ai', 'email', 'push'])
          recordPlatformMetric(OPERATIONS_METRICS.provider, 1, {
            provider,
            status: provider === 'database' ? 'up' : 'unknown',
          });
        recordPlatformMetric(OPERATIONS_METRICS.providerLatency, Number(result.latencyMs ?? 0), {
          provider: 'database',
        });
      }
      if (/^operations\.(?:backup-verify|restore-drill|dr-rehearse)$/u.test(jobKey))
        recordPlatformMetric(OPERATIONS_METRICS.recovery, 1, {
          scope: jobKey.slice('operations.'.length),
          outcome: String(result.status ?? 'unknown'),
        });
      if (jobKey.startsWith('operations.maintenance-'))
        recordPlatformMetric(OPERATIONS_METRICS.maintenance, Number(result.changed ?? 0), {
          status: jobKey.endsWith('activate') ? 'activated' : 'completed',
        });
      return result;
    } catch (error) {
      if (/^operations\.(?:backup-verify|restore-drill|dr-rehearse)$/u.test(jobKey))
        recordPlatformMetric(OPERATIONS_METRICS.recovery, 1, {
          scope: jobKey.slice('operations.'.length),
          outcome: 'failed',
        });
      throw error;
    } finally {
      if (/^operations\.(?:backup-verify|restore-drill|dr-rehearse)$/u.test(jobKey))
        recordPlatformMetric(OPERATIONS_METRICS.recoveryDuration, performance.now() - startedAt, {
          scope: jobKey.slice('operations.'.length),
        });
    }
  }
}
