import type { LoggerService } from '@nestjs/common';

import { recordPlatformMetric, SYNC_METRICS } from '../platform/observability/platform-metrics';
import type { SyncDomain } from './sync.types';

export function recordSyncMutation(outcome: string, domain: SyncDomain): void {
  recordPlatformMetric(SYNC_METRICS.mutation, 1, { outcome, scope: domain });
  if (outcome === 'replay') recordPlatformMetric(SYNC_METRICS.replay, 1, { scope: domain });
}

export function recordSyncWorker(job: string, outcome: string): void {
  recordPlatformMetric(SYNC_METRICS.worker, 1, { job, outcome });
}

export function recordSyncCursorLag(domain: SyncDomain, value: number): void {
  recordPlatformMetric(SYNC_METRICS.cursorLag, value, { scope: domain });
}

export function recordSyncConflict(outcome: string): void {
  recordPlatformMetric(SYNC_METRICS.conflict, 1, { outcome });
}

export function recordSyncRetry(outcome: string): void {
  recordPlatformMetric(SYNC_METRICS.retry, 1, { outcome });
}

export function logSyncEvent(
  logger: LoggerService,
  event: string,
  fields: {
    outcome?: string;
    domain?: SyncDomain;
    status?: string;
    attempt?: number;
    requestId?: string;
  } = {},
): void {
  logger.log({ event, ...fields }, 'sync');
}
