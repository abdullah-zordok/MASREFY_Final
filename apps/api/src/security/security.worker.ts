import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';

import { Injectable } from '@nestjs/common';

import { IdentityPrivacyHandler } from '../identity/identity-privacy.handler';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { recordPlatformMetric, SECURITY_METRICS } from '../platform/observability/platform-metrics';
import { writeExportPackage } from './export-package';
import { ExportStorage } from './export-storage';
import { PrivacyHandlerRegistry } from './privacy-handlers';
import { SecurityRepository } from './security.repository';
import { buildSecurityEventPayload } from './security.events';
import { TrackingPrivacyHandler } from '../tracking/tracking-privacy.handler';
import { AiPrivacyHandler } from '../ai/ai-privacy.handler';

interface ExportClaim {
  id: string;
  user_id: string;
  scope: string[];
}
interface DeletionClaim {
  id: string;
  user_id: string;
}

@Injectable()
export class SecurityWorkerService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly registry: PrivacyHandlerRegistry;

  constructor(
    private readonly repository: SecurityRepository,
    private readonly storage: ExportStorage,
    identity: IdentityPrivacyHandler,
    tracking: TrackingPrivacyHandler,
    ai: AiPrivacyHandler,
    private readonly config: PlatformConfigService,
  ) {
    const manifest = config.get('MASARIFI_PRIVACY_HANDLER_MANIFEST');
    if (!manifest) throw new Error('PRIVACY_HANDLER_MANIFEST_MISSING');
    this.registry = new PrivacyHandlerRegistry([ai, identity, tracking], manifest);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.config.getRequired('MASARIFI_SECURITY_WORKER_POLL_MS'));
    this.timer.unref();
    void this.runOnce();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runJob('support-expiry', () => this.expireSupportGrants());
      await this.runJob('security-alerts', () => this.dispatchSecurityAlerts());
      await this.runJob('privacy-export', async () => {
        await this.expireExports();
        await this.generateExport();
      });
      await this.runJob('account-deletion', () => this.executeDeletion());
      await this.runJob('retention', () => this.applyRetention());
    } finally {
      this.running = false;
    }
  }

  private async runJob(job: string, action: () => Promise<void>): Promise<void> {
    const startedAt = performance.now();
    try {
      await action();
      recordPlatformMetric(SECURITY_METRICS.jobRun, 1, { job, outcome: 'success' });
    } catch {
      recordPlatformMetric(SECURITY_METRICS.jobRun, 1, { job, outcome: 'failure' });
    } finally {
      recordPlatformMetric(SECURITY_METRICS.jobDuration, performance.now() - startedAt, { job });
    }
  }

  private async expireSupportGrants(): Promise<void> {
    await this.repository.withWorkerTransaction(async (client) => {
      const expired = await client.query<{
        id: string;
        user_id: string;
        assignee: string;
        scope: unknown;
      }>(
        `with due as (select id from private.support_access_requests where status='approved' and expires_at<=clock_timestamp()
        order by expires_at,id for update skip locked limit $1)
        update private.support_access_requests r set status='expired',decided_at=coalesce(decided_at,clock_timestamp()) from due where r.id=due.id
        returning r.id,r.user_id,r.assignee,r.scope`,
        [this.config.getRequired('MASARIFI_SECURITY_JOB_BATCH_SIZE')],
      );
      for (const request of expired.rows) {
        const grant = (
          await client.query<{ id: string }>(
            `update private.support_access_grants set revoked_at=clock_timestamp()
          where request_id=$1 and revoked_at is null returning id`,
            [request.id],
          )
        ).rows[0];
        if (!grant) continue;
        const occurredAt = new Date().toISOString();
        await client.query(
          `select private.enqueue_outbox_event('support_access.revoked','support_request',$1,$2)`,
          [
            request.id,
            JSON.stringify(
              buildSecurityEventPayload('support_access.revoked', {
                requestId: request.id,
                grantId: grant.id,
                adminId: request.assignee,
                userId: request.user_id,
                scopeKeys: this.scopeKeys(request.scope),
                occurredAt,
              }),
            ),
          ],
        );
        await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
          null,
          'system',
          'security.support-access-expired',
          'support_request',
          request.id,
          null,
          null,
          'Automatic support grant expiry',
          request.id,
          JSON.stringify({ operation: 'support-expiry' }),
        ]);
      }
    });
  }

  private async dispatchSecurityAlerts(): Promise<void> {
    await this.repository.withWorkerTransaction(async (client) => {
      await client.query('select private.dispatch_security_alerts($1)', [
        this.config.getRequired('MASARIFI_SECURITY_JOB_BATCH_SIZE'),
      ]);
    });
  }

  private async generateExport(): Promise<void> {
    const claim = await this.repository.withWorkerTransaction(async (client) => {
      const result =
        await client.query<ExportClaim>(`with selected as (select id from private.privacy_export_requests where status='verified' or (status='processing' and updated_at<=clock_timestamp()-interval '15 minutes')
        order by requested_at,id for update skip locked limit 1)
        update private.privacy_export_requests r set status='processing',error_code=null from selected where r.id=selected.id
        returning r.id,r.user_id,r.scope`);
      return result.rows[0];
    });
    if (!claim) return;
    const key = `exports/${claim.id}/privacy.zip`;
    const evidence = {
      requestId: claim.id,
      userId: claim.user_id,
      evidenceAt: new Date(),
      correlationId: randomUUID(),
    };
    try {
      const entries = [];
      const handlers = claim.scope.map((entry) =>
        this.registry
          .entries()
          .find((handler) => `${handler.resourceType}@${String(handler.schemaVersion)}` === entry),
      );
      if (handlers.length < 1 || handlers.some((handler) => !handler))
        throw new Error('PRIVACY_HANDLER_MANIFEST_MISMATCH');
      for (const handler of handlers) {
        if (!handler) throw new Error('PRIVACY_HANDLER_MANIFEST_MISMATCH');
        for await (const entry of handler.export(evidence)) entries.push(entry);
      }
      const stream = new PassThrough();
      const upload = this.storage.upload(key, stream);
      const [packaged] = await Promise.all([
        writeExportPackage(entries, stream, {
          maxBytes: this.config.getRequired('MASARIFI_EXPORT_MAX_BYTES'),
          maxEntries: this.config.getRequired('MASARIFI_EXPORT_MAX_ENTRIES'),
        }),
        upload,
      ]);
      await this.storage.head(key, packaged.bytes);
      await this.repository.withWorkerTransaction(async (client) => {
        await client.query(
          `update private.privacy_export_requests set status='ready',storage_ref=$2,completed_at=clock_timestamp(),
          expires_at=clock_timestamp()+make_interval(hours=>$3) where id=$1 and status='processing'`,
          [claim.id, key, this.config.getRequired('MASARIFI_EXPORT_RETENTION_HOURS')],
        );
        const expiresAt = new Date(
          Date.now() + this.config.getRequired('MASARIFI_EXPORT_RETENTION_HOURS') * 3_600_000,
        ).toISOString();
        await client.query(
          `select private.enqueue_outbox_event('privacy.export_ready','privacy_export',$1,$2)`,
          [
            claim.id,
            JSON.stringify(
              buildSecurityEventPayload('privacy.export_ready', {
                requestId: claim.id,
                userId: claim.user_id,
                expiresAt,
                occurredAt: new Date().toISOString(),
              }),
            ),
          ],
        );
      });
    } catch {
      await this.repository.withWorkerTransaction(async (client) => {
        await client.query(
          "update private.privacy_export_requests set status='failed',error_code='EXPORT_GENERATION_FAILED' where id=$1 and status='processing'",
          [claim.id],
        );
      });
      await this.storage.delete(key).catch(() => {
        /* an absent partial object is already safe */
      });
    }
  }

  private async expireExports(): Promise<void> {
    const references = await this.repository.withWorkerTransaction(async (client) => {
      const rows = (
        await client.query<{ id: string; user_id: string; storage_ref: string; expires_at: Date }>(
          `with due as (select id from private.privacy_export_requests where status='ready' and expires_at<=clock_timestamp()
        order by expires_at,id for update skip locked limit $1)
        update private.privacy_export_requests r set status='expired' from due where r.id=due.id returning r.id,r.user_id,r.storage_ref,r.expires_at`,
          [this.config.getRequired('MASARIFI_SECURITY_JOB_BATCH_SIZE')],
        )
      ).rows;
      for (const row of rows)
        await client.query(
          `select private.enqueue_outbox_event('privacy.export_expired','privacy_export',$1,$2)`,
          [
            row.id,
            JSON.stringify(
              buildSecurityEventPayload('privacy.export_expired', {
                requestId: row.id,
                userId: row.user_id,
                expiresAt: row.expires_at.toISOString(),
                occurredAt: new Date().toISOString(),
              }),
            ),
          ],
        );
      return rows;
    });
    for (const { storage_ref } of references)
      await this.storage.delete(storage_ref).catch(() => {
        /* retried by reconciliation evidence */
      });
  }

  private async executeDeletion(): Promise<void> {
    const claim = await this.repository.withWorkerTransaction(async (client) => {
      const result =
        await client.query<DeletionClaim>(`with selected as (select d.id from private.account_deletion_requests d
        where (d.status='verified' or (d.status='processing' and d.updated_at<=clock_timestamp()-interval '15 minutes')) and d.cooling_off_ends_at<=clock_timestamp() and not exists(
          select 1 from private.retention_holds h where h.resource_id=d.user_id and h.starts_at<=clock_timestamp() and (h.ends_at is null or h.ends_at>clock_timestamp()))
        order by d.cooling_off_ends_at,d.id for update skip locked limit 1)
        update private.account_deletion_requests d set status='processing',error_code=null from selected where d.id=selected.id returning d.id,d.user_id`);
      return result.rows[0];
    });
    if (!claim) return;
    const evidence = {
      requestId: claim.id,
      userId: claim.user_id,
      evidenceAt: new Date(),
      correlationId: randomUUID(),
    };
    try {
      const outcomes: Array<Record<string, unknown>> = [];
      for (const handler of this.registry.entries()) {
        const held = await this.repository.withWorkerTransaction(
          async (client) =>
            (
              await client.query<{ held: boolean }>(
                `select exists(select 1 from private.retention_holds where resource_type=$1 and resource_id=$2
            and starts_at<=clock_timestamp() and (ends_at is null or ends_at>clock_timestamp())) held`,
                [handler.resourceType, claim.user_id],
              )
            ).rows[0]?.held === true,
        );
        outcomes.push(
          held
            ? {
                resourceType: handler.resourceType,
                deletedCount: 0,
                anonymizedCount: 0,
                retainedCount: 1,
                policyIds: [],
              }
            : { resourceType: handler.resourceType, ...(await handler.deleteAccount(evidence)) },
        );
      }
      await this.repository.withWorkerTransaction(async (client) => {
        await client.query(
          `update private.account_deletion_requests set status='completed',completed_at=clock_timestamp(),retention_result=$2
          where id=$1 and status='processing'`,
          [claim.id, JSON.stringify({ outcomes })],
        );
        await client.query(
          `select private.enqueue_outbox_event('privacy.deletion_completed','deletion_request',$1,$2)`,
          [
            claim.id,
            JSON.stringify(
              buildSecurityEventPayload('privacy.deletion_completed', {
                requestId: claim.id,
                userId: claim.user_id,
                occurredAt: new Date().toISOString(),
              }),
            ),
          ],
        );
      });
    } catch {
      await this.repository.withWorkerTransaction(async (client) => {
        await client.query(
          "update private.account_deletion_requests set status='failed',error_code='DELETION_HANDLER_FAILED' where id=$1 and status='processing'",
          [claim.id],
        );
      });
    }
  }

  private async applyRetention(): Promise<void> {
    const policies = await this.repository.withWorkerTransaction(
      async (client) =>
        (
          await client.query<{
            id: string;
            resource_type: string;
            retention_days: number;
            deletion_mode: 'delete' | 'anonymize' | 'archive';
          }>(
            'select id,resource_type,retention_days,deletion_mode from private.retention_policies where enabled order by resource_type limit $1',
            [this.config.getRequired('MASARIFI_SECURITY_JOB_BATCH_SIZE')],
          )
        ).rows,
    );
    for (const policy of policies) {
      const handler = this.registry
        .entries()
        .find(({ resourceType }) => resourceType === policy.resource_type);
      if (!handler) throw new Error('PRIVACY_HANDLER_MANIFEST_MISMATCH');
      const candidates = await handler.listRetentionCandidates(
        new Date(Date.now() - policy.retention_days * 86_400_000),
        null,
        this.config.getRequired('MASARIFI_SECURITY_JOB_BATCH_SIZE'),
      );
      for (const candidate of candidates.items) {
        const held = await this.repository.withWorkerTransaction(
          async (client) =>
            (
              await client.query<{ held: boolean }>(
                `select exists(select 1 from private.retention_holds where resource_type=$1 and resource_id=$2
            and starts_at<=clock_timestamp() and (ends_at is null or ends_at>clock_timestamp())) held`,
                [policy.resource_type, candidate.resourceId],
              )
            ).rows[0]?.held === true,
        );
        if (!held)
          await handler.applyRetention(candidate, policy.deletion_mode, {
            requestId: policy.id,
            userId: candidate.resourceId,
            evidenceAt: new Date(),
            correlationId: randomUUID(),
          });
      }
    }
  }

  private scopeKeys(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { resource?: unknown }).resource === 'string' &&
        Array.isArray((entry as { actions?: unknown }).actions)
          ? (entry as { actions: unknown[]; resource: string }).actions.flatMap((action) =>
              typeof action === 'string'
                ? [`${(entry as { resource: string }).resource}:${action}`]
                : [],
            )
          : [],
      )
      .sort()
      .slice(0, 18);
  }
}
