import { createHash, createPrivateKey, sign } from 'node:crypto';
import { connect, constants } from 'node:http2';

import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';

import { ClerkClientService } from '../identity/clerk-client.service';
import { PushTokenCrypto } from '../identity/push-token.crypto';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { createTlsMailTransport } from '../reports/reports.smtp';
import { ENGAGEMENT_SOURCE_EVENTS } from './engagement.events';
import { EngagementObservability } from './engagement.observability';
import {
  EngagementRepository,
  type NotificationDeliveryClaim,
  type PreparedDelivery,
  type SourceNotificationClaim,
} from './engagement.repository';
import { evaluateDelivery, type QuietHours } from './notification.policy';
import {
  ApnsPushProvider,
  DeterministicNotificationProvider,
  ExpoPushProvider,
  FcmPushProvider,
  NotificationEmailProvider,
  type HttpTransport,
  type ProviderResult,
} from './notification.providers';
import { renderNotification } from './notification.renderer';
import { ClamAvAttachmentScanner, DeterministicAttachmentScanner } from './support.scanner';
import { SupportStorage } from './support.storage';

export type EngagementJob =
  | 'source.consume'
  | 'notification.dispatch'
  | 'notification.expire'
  | 'notification.campaign.expand'
  | 'support-attachment.scan'
  | 'support-attachment.cleanup';

const ENGAGEMENT_JOBS: readonly EngagementJob[] = [
  'source.consume',
  'notification.dispatch',
  'notification.expire',
  'notification.campaign.expand',
  'support-attachment.scan',
  'support-attachment.cleanup',
];

@Injectable()
export class EngagementWorker implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly workerId = `engagement-${String(process.pid)}`;
  // ponytail: process-local circuit; move to shared state only when multiple workers create provider pressure.
  private readonly providerCircuits = new Map<string, { failures: number; openUntil: number }>();

  constructor(
    private readonly repository: EngagementRepository,
    private readonly storage: SupportStorage,
    private readonly identity: ClerkClientService,
    private readonly config: PlatformConfigService,
    @Optional() private readonly observability?: EngagementObservability,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, 1_000);
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

  runJob(job: string): Promise<number> {
    if (!(ENGAGEMENT_JOBS as readonly string[]).includes(job))
      return Promise.reject(new Error('ENGAGEMENT_JOB_UNKNOWN'));
    if (job === 'source.consume') return this.consumeSources();
    if (job === 'notification.dispatch') return this.dispatchNotifications();
    if (job === 'notification.expire') return this.expireNotifications();
    if (job === 'notification.campaign.expand') return this.expandCampaigns();
    if (job === 'support-attachment.scan') return this.scanAttachments();
    return this.cleanupAttachments();
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of ENGAGEMENT_JOBS) await this.runJob(job);
    } finally {
      this.running = false;
    }
  }

  private async consumeSources(): Promise<number> {
    const startedAt = performance.now();
    const sources = await this.repository.claimSourceEvents(
      [...ENGAGEMENT_SOURCE_EVENTS],
      this.config.getRequired('MASARIFI_NOTIFICATION_BATCH_SIZE'),
    );
    let succeeded = 0;
    for (const source of sources)
      try {
        await this.ingest(source);
        succeeded += 1;
      } catch {
        this.observability?.job('source.consume', 'failure');
      }
    this.observability?.job(
      'source.consume',
      'success',
      'none',
      'none',
      succeeded,
      performance.now() - startedAt,
    );
    this.observability?.backlog('source.consume', sources.length);
    return sources.length;
  }

  private async expireNotifications(): Promise<number> {
    const startedAt = performance.now();
    const expired = await this.repository.expireNotifications();
    this.observability?.job(
      'notification.expire',
      'success',
      'none',
      'none',
      expired,
      performance.now() - startedAt,
    );
    return expired;
  }

  private async expandCampaigns(): Promise<number> {
    const startedAt = performance.now();
    const expanded = await this.repository.expandCampaigns(
      this.config.getRequired('MASARIFI_CAMPAIGN_BATCH_SIZE'),
    );
    this.observability?.job(
      'notification.campaign.expand',
      'success',
      'none',
      'none',
      expanded,
      performance.now() - startedAt,
    );
    this.observability?.backlog('notification.campaign.expand', expanded);
    return expanded;
  }

  private async dispatchNotifications(): Promise<number> {
    const deliveries = await this.repository.claimNotificationDeliveries(
      this.workerId,
      this.config.getRequired('MASARIFI_NOTIFICATION_BATCH_SIZE'),
    );
    this.observability?.backlog('notification.dispatch', deliveries.length);
    await Promise.all(deliveries.map((delivery) => this.deliver(delivery)));
    return deliveries.length;
  }

  private async scanAttachments(): Promise<number> {
    const attachments = await this.repository.claimAttachments(
      this.workerId,
      this.config.getRequired('MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE'),
    );
    this.observability?.backlog('support-attachment.scan', attachments.length);
    for (const attachment of attachments) {
      const startedAt = performance.now();
      try {
        const content = await this.storage.read(attachment.storage_ref);
        const valid =
          content.length === Number(attachment.size_bytes) &&
          createHash('sha256').update(content).digest('hex') === attachment.sha256 &&
          matchesType(content, attachment.content_type);
        const scan = valid
          ? await this.scanner().scan(content)
          : { status: 'rejected' as const, code: 'ATTACHMENT_METADATA_MISMATCH' };
        const status =
          scan.status === 'clean'
            ? 'clean'
            : scan.status === 'rejected' || attachment.attempt_count >= 5
              ? 'rejected'
              : 'failed';
        await this.repository.finishAttachment(
          attachment.id,
          attachment.claim_token,
          status,
          'code' in scan ? scan.code : undefined,
        );
        if (status === 'rejected') await this.storage.delete(attachment.storage_ref);
        this.observability?.job(
          'support-attachment.scan',
          status === 'clean' ? 'success' : status === 'failed' ? 'retry' : 'suppressed',
          'none',
          'none',
          1,
          performance.now() - startedAt,
        );
      } catch {
        const terminal = attachment.attempt_count >= 5;
        await this.repository.finishAttachment(
          attachment.id,
          attachment.claim_token,
          terminal ? 'rejected' : 'failed',
          'SCANNER_UNAVAILABLE',
        );
        if (terminal) await this.storage.delete(attachment.storage_ref).catch(() => undefined);
        this.observability?.job(
          'support-attachment.scan',
          terminal ? 'suppressed' : 'retry',
          'none',
          'none',
          1,
          performance.now() - startedAt,
        );
      }
    }
    return attachments.length;
  }

  private async cleanupAttachments(): Promise<number> {
    const orphans = await this.repository.removeOrphanedAttachmentUploads(
      this.config.getRequired('MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE'),
    );
    for (const key of orphans) await this.storage.delete(key).catch(() => undefined);
    this.observability?.job(
      'support-attachment.cleanup',
      'success',
      'none',
      'none',
      orphans.length,
    );
    return orphans.length;
  }

  private async ingest(source: SourceNotificationClaim): Promise<void> {
    const templates = await this.repository.loadSourceTemplates(source);
    const parsedExpiry = source.expires_at ? new Date(source.expires_at) : undefined;
    const expiresAt =
      parsedExpiry && Number.isFinite(parsedExpiry.getTime()) ? parsedExpiry : undefined;
    const deliveries: PreparedDelivery[] = [];
    for (const template of templates) {
      const rendered = renderNotification(
        {
          key: template.key,
          locale: template.locale,
          channel: template.channel,
          version: template.template_version,
          title: template.locale === 'ar' ? 'مصاريفي' : 'Masarifi',
          subject: template.subject ?? undefined,
          body: template.body,
          allowedVariables: [],
        },
        {},
      );
      const quietHours = parseQuietHours(template.quiet_hours);
      const decision = evaluateDelivery({
        channel: template.channel,
        enabled: template.enabled,
        ...(quietHours ? { quietHours } : {}),
        now: new Date(),
        ...(expiresAt ? { expiresAt } : {}),
      });
      deliveries.push({
        channel: template.channel,
        provider:
          template.channel === 'in_app'
            ? 'database'
            : template.channel === 'email'
              ? 'smtp'
              : 'push',
        title: rendered.title,
        body: rendered.body,
        status: decision.outcome === 'suppress' ? 'suppressed' : 'queued',
        nextAttemptAt:
          decision.outcome === 'defer'
            ? decision.until
            : decision.outcome === 'deliver'
              ? new Date()
              : null,
        ...(decision.outcome === 'suppress'
          ? { errorCode: `PREFERENCE_${decision.reason.toUpperCase()}` }
          : {}),
      });
    }
    await this.repository.createNotificationFromSource(source, deliveries);
  }

  private async deliver(claim: NotificationDeliveryClaim): Promise<void> {
    const startedAt = performance.now();
    const provider = normalizedProvider(claim);
    let result: ProviderResult;
    if (this.circuitOpen(provider)) result = { status: 'retryable', code: 'PROVIDER_CIRCUIT_OPEN' };
    else
      try {
        if (claim.channel === 'in_app')
          result = { status: 'accepted', providerRef: claim.event_id ?? claim.id };
        else if (this.config.getRequired('MASARIFI_ENGAGEMENT_PROVIDER_MODE') === 'disabled')
          result = { status: 'terminal', code: 'DELIVERY_DISABLED' };
        else if (this.config.getRequired('MASARIFI_ENGAGEMENT_PROVIDER_MODE') === 'deterministic')
          result = await new DeterministicNotificationProvider('success').send(
            this.input(claim, 'deterministic'),
          );
        else if (claim.channel === 'email') {
          const recipient = (await this.identity.getIdentityUser(claim.user_id))?.primaryEmail;
          if (!recipient) result = { status: 'terminal', code: 'RECIPIENT_UNVERIFIED' };
          else
            result = await new NotificationEmailProvider(
              createTlsMailTransport(this.config),
              this.config.getRequired('EMAIL_FROM'),
            ).send(claim.event_id ?? claim.id, recipient, claim.title, claim.body_safe);
        } else result = await this.push(claim);
      } catch {
        result = { status: 'retryable', code: 'PROVIDER_TEMPORARY' };
      }
    this.recordProviderResult(provider, result);
    const maximum = this.config.getRequired('MASARIFI_NOTIFICATION_MAX_ATTEMPTS');
    const terminal =
      result.status === 'terminal' ||
      result.status === 'ambiguous' ||
      claim.attempt_count >= maximum;
    await this.repository.finishNotificationDelivery(
      claim.id,
      claim.claim_token,
      result.status === 'accepted' ? 'delivered' : terminal ? 'suppressed' : 'failed',
      result.status === 'accepted' ? undefined : result.code,
      result.status === 'accepted' ? result.providerRef : undefined,
    );
    this.observability?.job(
      claim.attempt_count > 1 ? 'notification.delivery.retry' : 'notification.dispatch',
      result.status === 'accepted' ? 'success' : terminal ? 'suppressed' : 'retry',
      claim.channel,
      normalizedProvider(claim),
      1,
      performance.now() - startedAt,
    );
    if (result.status === 'terminal' && result.code === 'TOKEN_INVALID' && claim.token_device_id)
      await this.repository.revokePushToken(claim.user_id, claim.token_device_id);
  }

  private circuitOpen(provider: string, now = Date.now()): boolean {
    const circuit = this.providerCircuits.get(provider);
    if (!circuit || circuit.openUntil <= now) {
      if (circuit) this.providerCircuits.delete(provider);
      return false;
    }
    return true;
  }

  private recordProviderResult(provider: string, result: ProviderResult, now = Date.now()): void {
    if (result.status === 'accepted' || result.status === 'terminal') {
      this.providerCircuits.delete(provider);
      return;
    }
    const failures = (this.providerCircuits.get(provider)?.failures ?? 0) + 1;
    this.providerCircuits.set(provider, {
      failures,
      openUntil: failures >= 5 ? now + 30_000 : 0,
    });
  }

  private async push(claim: NotificationDeliveryClaim): Promise<ProviderResult> {
    if (!claim.token_ciphertext || !claim.token_device_id || !claim.token_provider)
      return { status: 'terminal', code: 'TOKEN_UNAVAILABLE' };
    let token = this.crypto().decrypt(claim.token_ciphertext, {
      provider: claim.token_provider,
      userId: claim.user_id,
      deviceId: claim.token_device_id,
    });
    try {
      const input = this.input(claim, token);
      if (claim.token_provider === 'expo')
        return await new ExpoPushProvider(
          this.http(),
          this.config.getRequired('MASARIFI_EXPO_ACCESS_TOKEN'),
        ).send(input);
      if (claim.token_provider === 'fcm')
        return await new FcmPushProvider(
          this.http(),
          this.config.getRequired('MASARIFI_FCM_PROJECT_ID'),
          this.config.getRequired('MASARIFI_FCM_ACCESS_TOKEN'),
        ).send(input);
      return await new ApnsPushProvider(
        this.http(),
        apnsJwt(this.config),
        this.config.getRequired('MASARIFI_APNS_BUNDLE_ID'),
      ).send(input);
    } finally {
      token = '';
    }
  }

  private input(claim: NotificationDeliveryClaim, token: string) {
    return {
      token,
      eventId: claim.event_id ?? claim.id,
      title: claim.title,
      body: claim.body_safe,
      route: typeof claim.data.route === 'string' ? claim.data.route : 'notification_detail',
    };
  }

  private crypto(): PushTokenCrypto {
    const hashKey = Buffer.from(
      this.config.getRequired('MASARIFI_PUSH_TOKEN_HASH_KEY'),
      'base64url',
    );
    const keys = this.config
      .getRequired('MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS')
      .split(',')
      .map((entry) => {
        const separator = entry.indexOf(':');
        return {
          id: entry.slice(0, separator),
          key: Buffer.from(entry.slice(separator + 1), 'base64url'),
        };
      });
    return new PushTokenCrypto(hashKey, keys);
  }

  private scanner() {
    const mode = this.config.getRequired('MASARIFI_ENGAGEMENT_PROVIDER_MODE');
    return mode === 'live'
      ? new ClamAvAttachmentScanner(
          this.config.getRequired('MASARIFI_CLAMAV_HOST'),
          this.config.getRequired('MASARIFI_CLAMAV_PORT'),
          5_000,
          this.config.getRequired('MASARIFI_SUPPORT_ATTACHMENT_MAX_BYTES'),
        )
      : new DeterministicAttachmentScanner('clean');
  }

  private http(): HttpTransport {
    return async (request) => {
      if (new URL(request.url).hostname === 'api.push.apple.com') return http2Json(request);
      const { url, headers, body, timeoutMs } = request;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return { status: response.status, json: await response.json().catch(() => ({})) };
      } finally {
        clearTimeout(timer);
      }
    };
  }
}

function http2Json(
  request: Parameters<HttpTransport>[0],
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const session = connect(url.origin);
    const timer = setTimeout(() => {
      session.destroy(new Error('PROVIDER_TIMEOUT'));
    }, request.timeoutMs);
    const stream = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `${url.pathname}${url.search}`,
      ...request.headers,
    });
    let status = 0;
    let settled = false;
    const chunks: Buffer[] = [];
    let bytes = 0;
    const finish = (error?: Error) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      session.close();
      if (error) reject(error);
      return true;
    };
    session.once('error', finish);
    stream.once('response', (headers) => {
      status = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
    });
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 8_192) stream.destroy(new Error('PROVIDER_RESPONSE_TOO_LARGE'));
      else chunks.push(chunk);
    });
    stream.once('error', finish);
    stream.once('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!finish()) return;
      try {
        resolve({ status, json: body ? (JSON.parse(body) as unknown) : {} });
      } catch {
        resolve({ status, json: {} });
      }
    });
    stream.end(JSON.stringify(request.body));
  });
}

function normalizedProvider(claim: NotificationDeliveryClaim): string {
  if (claim.channel === 'in_app') return 'database';
  if (claim.channel === 'email') return 'smtp';
  return claim.token_provider ?? 'push';
}

function parseQuietHours(value: Record<string, unknown>): QuietHours | undefined {
  if (value.enabled !== true) return undefined;
  if (
    typeof value.start !== 'string' ||
    typeof value.end !== 'string' ||
    typeof value.timeZone !== 'string' ||
    !Array.isArray(value.weekdays)
  )
    throw new Error('NOTIFICATION_QUIET_HOURS_INVALID');
  return {
    enabled: true,
    start: value.start,
    end: value.end,
    timeZone: value.timeZone,
    weekdays: value.weekdays as number[],
  };
}

function matchesType(content: Buffer, type: string): boolean {
  if (type === 'application/pdf') return content.subarray(0, 5).toString() === '%PDF-';
  if (type === 'image/png')
    return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg')
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  return type === 'text/plain' && !content.includes(0);
}

function apnsJwt(config: PlatformConfigService): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'ES256', kid: config.getRequired('MASARIFI_APNS_KEY_ID') })}.${encode({ iss: config.getRequired('MASARIFI_APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1_000) })}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(config.getRequired('MASARIFI_APNS_PRIVATE_KEY')),
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${signature.toString('base64url')}`;
}
