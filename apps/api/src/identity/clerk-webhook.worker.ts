import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { IDENTITY_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { ClerkClientService } from './clerk-client.service';
import { IdentityRepository } from './identity.repository';

export interface ReconciliationEvidence {
  processed: number;
  next: string | null;
  checkpointHash: string;
}

@Injectable()
export class ClerkWebhookWorker {
  private controller: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly repository: IdentityRepository,
    private readonly clerk: ClerkClientService,
    private readonly config: PlatformConfigService,
  ) {}

  start(): void {
    if (this.controller && !this.controller.signal.aborted) return;
    this.controller = new AbortController();
    this.loopPromise = this.run(this.controller.signal);
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    await this.loopPromise;
  }

  async reconcileProviderPage(offset = 0): Promise<ReconciliationEvidence> {
    const limit = this.config.get('MASARIFI_CLERK_RECONCILE_PAGE_SIZE');
    const page = await this.clerk.listIdentityUsers(offset, limit);
    for (const user of page.users) {
      await this.repository.synchronizeClerkIdentity(user, user.id);
    }
    recordPlatformMetric(IDENTITY_METRICS.reconciliation, page.users.length, {
      operation: 'provider_page', outcome: 'success',
    });
    return this.evidence(page.users.map((user) => user.id), page.nextOffset?.toString() ?? null);
  }

  async reconcileProfilePage(afterSubject: string | null = null): Promise<ReconciliationEvidence> {
    const limit = this.config.get('MASARIFI_CLERK_RECONCILE_PAGE_SIZE');
    const subjects = await this.repository.listProfileSubjects(afterSubject, limit);
    for (const subject of subjects) {
      await this.repository.synchronizeClerkIdentity(await this.clerk.getIdentityUser(subject), subject);
    }
    recordPlatformMetric(IDENTITY_METRICS.reconciliation, subjects.length, {
      operation: 'profile_page', outcome: 'success',
    });
    const next = subjects.length === limit ? (subjects.at(-1) ?? null) : null;
    return this.evidence(subjects, next);
  }

  async retryRevokedSession(): Promise<boolean> {
    const revoked = await this.repository.nextRevokedSession();
    if (!revoked) return false;
    await this.clerk.revokeSession(revoked.sessionId);
    await this.repository.completeWorkerSessionRevoke(revoked.deviceId, revoked.sessionId);
    recordPlatformMetric(IDENTITY_METRICS.deviceSessionRetry, 1, { outcome: 'success' });
    return true;
  }

  private async run(signal: AbortSignal): Promise<void> {
    const pollMs = this.config.get('MASARIFI_CLERK_WEBHOOK_POLL_MS');
    const maxAttempts = this.config.get('MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS');
    let cycles = 0;
    while (!signal.aborted) {
      let delay = pollMs;
      try {
        const result = await this.repository.processNextClerkWebhook(
          (subject) => this.clerk.getIdentityUser(subject), maxAttempts,
        );
        if (result.status === 'failed') {
          delay = pollMs * 2 ** Math.min(result.attemptCount, 4);
        }
        if (result.status !== 'idle') {
          recordPlatformMetric(IDENTITY_METRICS.webhookProcess, 1, { outcome: result.status });
        }
        await this.retryRevokedSession();
        cycles += 1;
        if (cycles % 120 === 0) {
          const redacted = await this.repository.redactClerkWebhookPayloads(100);
          recordPlatformMetric(IDENTITY_METRICS.redaction, redacted, { outcome: 'success' });
        }
      } catch {
        // Retained inbox rows and session links are retried on the next bounded cycle.
      }
      await this.wait(delay, signal);
    }
  }

  private evidence(subjects: readonly string[], next: string | null): ReconciliationEvidence {
    return {
      processed: subjects.length,
      next,
      checkpointHash: createHash('sha256').update(subjects.join('\0')).digest('hex'),
    };
  }

  private wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, milliseconds);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}
