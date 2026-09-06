import { Inject, Injectable, Optional } from '@nestjs/common';

import { AiWorker } from '../ai/ai.worker';
import { EngagementWorker } from '../engagement/engagement.worker';
import { ClerkWebhookWorker } from '../identity/clerk-webhook.worker';
import { LedgerWorker } from '../ledger/ledger.worker';
import { OutboxWorkerService } from '../platform/outbox/outbox-worker.service';
import { PlanningWorker } from '../planning/planning.worker';
import { ReportsWorker } from '../reports/reports.worker';
import { SecurityWorkerService } from '../security/security.worker';
import { SyncWorker } from '../sync/sync.worker';
import { TrackingWorker } from '../tracking/tracking.worker';

import { OperationsService } from './operations.service';

export const OPERATIONS_JOB_KEYS = Object.freeze([
  'operations.provider-health',
  'operations.capacity-evaluate',
  'operations.cache-invalidate',
  'operations.backup-verify',
  'operations.restore-drill',
  'operations.dr-rehearse',
  'operations.maintenance-activate',
  'operations.maintenance-complete',
  'operations.job-history-retain',
] as const);

export type OperationsJobKey = (typeof OPERATIONS_JOB_KEYS)[number];

export const GOVERNED_JOB_KEYS = Object.freeze([
  'platform.outbox.dispatch',
  'clerk.webhook.process',
  'clerk.identity.reconcile',
  'clerk.session-revoke.retry',
  'security.support-expire',
  'security.alert-dispatch',
  'privacy.export-generate',
  'privacy.export-expire',
  'privacy.account-delete',
  'retention.apply',
  'ledger.reconcile',
  'sync-mutations.retry',
  'idempotency.cleanup',
  'sync-state.cleanup',
  'conflicts.expire',
  'planning.salary-cycle.generate',
  'planning.obligation-schedule.generate',
  'planning.payment-match.propose',
  'planning.overdue.mark',
  'planning.reminders.emit',
  'planning.reconcile',
  'import.parse',
  'parser.corpus',
  'raw.purge',
  'tracking.reconcile',
  'ai.evaluate_route',
  'voice.transcribe_extract',
  'assistant.respond',
  'ai.usage_rollup',
  'voice-media.purge',
  'ai.reconcile',
  'report.generate',
  'report.email.deliver',
  'report.output.expire',
  'report.schedule.enqueue',
  'source.consume',
  'notification.dispatch',
  'notification.expire',
  'notification.campaign.expand',
  'support-attachment.scan',
  'support-attachment.cleanup',
  ...OPERATIONS_JOB_KEYS,
] as const);

@Injectable()
export class OperationsJobRegistry {
  constructor(
    @Inject(OperationsService)
    private readonly operations: Pick<OperationsService, 'runJob'>,
    @Optional() private readonly outbox?: OutboxWorkerService,
    @Optional() private readonly clerk?: ClerkWebhookWorker,
    @Optional() private readonly security?: SecurityWorkerService,
    @Optional() private readonly ledger?: LedgerWorker,
    @Optional() private readonly sync?: SyncWorker,
    @Optional() private readonly planning?: PlanningWorker,
    @Optional() private readonly tracking?: TrackingWorker,
    @Optional() private readonly ai?: AiWorker,
    @Optional() private readonly reports?: ReportsWorker,
    @Optional() private readonly engagement?: EngagementWorker,
  ) {}

  async run(jobKey: string): Promise<Record<string, string | number | boolean | null>> {
    if (!(GOVERNED_JOB_KEYS as readonly string[]).includes(jobKey))
      throw new Error('OPERATIONS_JOB_UNKNOWN');
    let result: unknown;
    if ((OPERATIONS_JOB_KEYS as readonly string[]).includes(jobKey))
      return this.operations.runJob(jobKey as OperationsJobKey);
    if (jobKey === 'platform.outbox.dispatch') result = await this.required(this.outbox).runOnce();
    else if (jobKey.startsWith('clerk.'))
      result = await this.required(this.clerk).runJob(
        jobKey as Parameters<ClerkWebhookWorker['runJob']>[0],
      );
    else if (/^(security\.|privacy\.|retention\.)/u.test(jobKey)) {
      await this.required(this.security).runJob(jobKey);
      result = 1;
    } else if (jobKey === 'ledger.reconcile') result = await this.required(this.ledger).runOnce();
    else if (/^(sync-mutations\.|idempotency\.|sync-state\.|conflicts\.)/u.test(jobKey))
      result = await this.required(this.sync).runJob(jobKey as Parameters<SyncWorker['runJob']>[0]);
    else if (jobKey.startsWith('planning.'))
      result = await this.required(this.planning).runJob(
        jobKey as Parameters<PlanningWorker['runJob']>[0],
      );
    else if (/^(import\.|parser\.|raw\.|tracking\.)/u.test(jobKey))
      result = await this.required(this.tracking).runJob(
        jobKey as Parameters<TrackingWorker['runJob']>[0],
      );
    else if (/^(ai\.|voice\.|assistant\.)/u.test(jobKey))
      result = await this.required(this.ai).runJob(jobKey as Parameters<AiWorker['runJob']>[0]);
    else if (jobKey.startsWith('report.'))
      result = await this.required(this.reports).runJob(
        jobKey as Parameters<ReportsWorker['runJob']>[0],
      );
    else result = await this.required(this.engagement).runJob(jobKey);
    return {
      outcome: 'succeeded',
      processed: typeof result === 'number' && Number.isSafeInteger(result) ? result : 1,
    };
  }

  private required<T>(value: T | undefined): T {
    if (!value) throw new Error('OPERATIONS_JOB_HANDLER_UNAVAILABLE');
    return value;
  }
}
