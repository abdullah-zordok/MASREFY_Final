import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { ClerkClientService } from '../identity/clerk-client.service';
import { renderReport } from './reports.renderer';
import {
  ReportsRepository,
  type ReportWorkClaim,
  type ReportWorkOutcome,
} from './reports.repository';
import { parseReportSnapshot } from './reports.schemas';
import { ReportsStorage } from './reports.storage';
import { ReportsSmtp, ReportsSmtpError } from './reports.smtp';
import { recordReportBacklog, recordReportBytes, recordReportJob } from './reports.observability';

@Injectable()
export class ReportsWorker implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: ReportsRepository,
    private readonly storage: ReportsStorage,
    private readonly config: PlatformConfigService,
    @Optional() @Inject('REPORT_ARABIC_FONT') private readonly suppliedFont?: Buffer,
    @Optional() private readonly smtp?: ReportsSmtp,
    @Optional() private readonly identity?: ClerkClientService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.runOnce().catch(() => undefined),
      this.config.getRequired('MASARIFI_REPORT_POLL_MS'),
    );
    this.timer.unref();
    void this.runOnce().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.repository.listDueSchedules(
        now,
        this.config.getRequired('MASARIFI_REPORT_BATCH_SIZE'),
      );
      recordReportBacklog('report.schedule.enqueue', due.length);
      for (const schedule of due) {
        const startedAt = performance.now();
        const enqueued = await this.repository.enqueueDueSchedule(schedule.id, now);
        recordReportJob(
          'report.schedule.enqueue',
          enqueued ? 'success' : 'locked',
          performance.now() - startedAt,
        );
      }
      for (const kind of [
        'report.generate',
        'report.email.deliver',
        'report.output.expire',
      ] as const) {
        const ids = await this.repository.listWork(
          kind,
          this.config.getRequired('MASARIFI_REPORT_BATCH_SIZE'),
        );
        recordReportBacklog(kind, ids.length);
        for (const id of ids)
          await this.repository.withWorkLock(kind, id, (claim) =>
            kind === 'report.generate'
              ? this.generate(claim)
              : kind === 'report.email.deliver'
                ? this.deliver(claim)
                : this.expire(claim),
          );
      }
    } finally {
      this.running = false;
    }
  }

  private async generate(claim: ReportWorkClaim): Promise<ReportWorkOutcome> {
    let storedKey: string | undefined;
    try {
      if (claim.attemptCount >= this.config.getRequired('MASARIFI_REPORT_MAX_ATTEMPTS'))
        throw new Error('REPORT_MAX_ATTEMPTS');
      const maximum = this.config.getRequired('MASARIFI_REPORT_MAX_BYTES');
      const snapshot = parseReportSnapshot(claim.snapshot, maximum);
      const rendered = renderReport(
        snapshot,
        snapshot.format,
        maximum,
        snapshot.format === 'pdf' ? this.font() : undefined,
      );
      if (claim.status === 'generating')
        await this.storage.delete(this.storage.key(claim.id, claim.userId, snapshot.format));
      // Storage consumes this exact stream and propagates its errors; the counter is evidence only here.
      void rendered.byteCounter.catch(() => undefined);
      const stored = await this.storage.upload(
        claim.id,
        claim.userId,
        snapshot.format,
        rendered.contentType,
        rendered.body,
        maximum,
      );
      storedKey = stored.key;
      await this.storage.verify(stored.key, stored.bytes);
      recordReportBytes('report.generate', stored.bytes);
      recordReportJob('report.generate', 'success');
      const adminAggregate = snapshot.summary.adminAggregate === true;
      return {
        status: 'ready',
        storageRef: stored.key,
        event: adminAggregate
          ? {
              type: 'export.ready',
              data: {
                attemptId: claim.id,
                format: snapshot.format,
                bytes: stored.bytes,
                expiresAt: claim.expiresAt,
                adminAggregate: true,
              },
            }
          : {
              type: 'report.ready',
              data: {
                attemptId: claim.id,
                format: snapshot.format,
                bytes: stored.bytes,
                expiresAt: claim.expiresAt,
              },
            },
      };
    } catch (error) {
      if (storedKey)
        try {
          await this.storage.delete(storedKey);
        } catch {
          /* expiry reconciliation will retry */
        }
      const message = error instanceof Error ? error.message : '';
      const errorCode = /^[A-Z][A-Z0-9_]{1,79}$/.test(message) ? message : 'REPORT_RENDER_FAILED';
      recordReportJob('report.generate', 'failure');
      return { status: 'failed', errorCode };
    }
  }

  private async expire(claim: ReportWorkClaim): Promise<ReportWorkOutcome> {
    try {
      if (claim.storageRef) await this.storage.delete(claim.storageRef);
      recordReportJob('report.output.expire', 'success');
      return {
        status: 'expired',
        event: {
          type: 'report.expired',
          data: { attemptId: claim.id, expiredAt: new Date().toISOString() },
        },
      };
    } catch {
      recordReportJob('report.output.expire', 'failure');
      return { status: 'failed', errorCode: 'REPORT_STORAGE_UNAVAILABLE' };
    }
  }

  private async deliver(claim: ReportWorkClaim): Promise<ReportWorkOutcome> {
    try {
      if (claim.status === 'sending') throw new ReportsSmtpError('DELIVERY_ACCEPTANCE_UNKNOWN');
      if (!this.smtp || !claim.storageRef) throw new ReportsSmtpError('REPORT_EMAIL_UNAVAILABLE');
      if (claim.attemptCount >= this.config.getRequired('MASARIFI_REPORT_MAX_ATTEMPTS'))
        throw new ReportsSmtpError('REPORT_MAX_ATTEMPTS');
      const snapshot = parseReportSnapshot(
        claim.snapshot,
        this.config.getRequired('MASARIFI_REPORT_MAX_BYTES'),
      );
      if (snapshot.delivery !== 'email') throw new ReportsSmtpError('REPORT_EMAIL_INVALID');
      const recipient =
        claim.recipient ?? (await this.identity?.getIdentityUser(claim.userId))?.primaryEmail;
      if (!recipient) throw new ReportsSmtpError('REPORT_RECIPIENT_UNVERIFIED');
      const link = await this.storage.sign(
        claim.storageRef,
        this.config.getRequired('MASARIFI_REPORT_SIGNED_URL_SECONDS'),
      );
      const accepted = await this.smtp.send(claim.id, recipient, link);
      recordReportJob('report.email.deliver', 'success');
      return {
        status: 'delivered',
        providerMessageId: accepted.providerMessageId,
        event: {
          type: 'report.delivery_succeeded',
          data: { attemptId: claim.id, acceptedByServerAt: accepted.acceptedByServerAt },
        },
      };
    } catch (error) {
      const failure =
        error instanceof ReportsSmtpError
          ? error
          : new ReportsSmtpError('REPORT_EMAIL_UNAVAILABLE', true);
      recordReportJob('report.email.deliver', failure.retryable ? 'retry' : 'failure');
      return {
        status:
          failure.retryable &&
          claim.attemptCount < this.config.getRequired('MASARIFI_REPORT_MAX_ATTEMPTS')
            ? 'ready'
            : 'failed',
        errorCode: failure.code,
        event: {
          type: 'report.delivery_failed',
          data: {
            attemptId: claim.id,
            errorCode: failure.code,
            retryable: failure.retryable,
            attemptCount: claim.attemptCount,
          },
        },
      };
    }
  }

  private font(): Buffer {
    if (this.suppliedFont) return this.suppliedFont;
    const candidates = [
      join(process.cwd(), 'assets/fonts/NotoSansArabicUI-Regular.ttf'),
      join(process.cwd(), '../mobile/assets/fonts/NotoSansArabicUI-Regular.ttf'),
    ];
    const path = candidates.find(existsSync);
    if (!path) throw new Error('REPORT_FONT_UNAVAILABLE');
    return readFileSync(path);
  }
}
