import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PoolService } from '../platform/database/pool.service';
import { PlatformConfigService } from '../platform/config/platform-config.service';

export interface EngagementCommand {
  operation: string;
  body?: unknown;
  query?: unknown;
  params?: Readonly<Record<string, string>>;
  idempotencyKey?: string;
  requestId: string;
}

interface Claim extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: unknown;
}

interface ValueRow extends QueryResultRow {
  value: unknown;
}

interface CursorRow extends ValueRow {
  sort_at: Date | string;
  sort_id: string;
}

export interface NotificationDeliveryClaim extends QueryResultRow {
  id: string;
  claim_token: string;
  user_id: string;
  channel: 'in_app' | 'push' | 'email';
  provider: string;
  attempt_count: number;
  event_id: string | null;
  title: string;
  body_safe: string;
  data: Record<string, unknown>;
  token_ciphertext: string | null;
  token_device_id: string | null;
  token_provider: 'expo' | 'apns' | 'fcm' | null;
}

export interface AttachmentScanClaim extends QueryResultRow {
  id: string;
  claim_token: string;
  storage_ref: string;
  sha256: string;
  size_bytes: string;
  content_type: string;
  attempt_count: number;
}

export interface SourceNotificationClaim extends QueryResultRow {
  source_event_id: string;
  source_id: string | null;
  event_type: string;
  user_id: string;
  locale: 'ar' | 'en';
  time_zone: string;
  occurred_at: string;
  expires_at: string | null;
}

export interface SourceTemplate extends QueryResultRow {
  id: string;
  key: string;
  locale: 'ar' | 'en';
  channel: 'in_app' | 'push' | 'email';
  template_version: number;
  subject: string | null;
  body: string;
  enabled: boolean;
  quiet_hours: Record<string, unknown>;
}

export interface PreparedDelivery {
  channel: 'in_app' | 'push' | 'email';
  provider: 'database' | 'push' | 'smtp';
  title: string;
  body: string;
  status: 'queued' | 'suppressed';
  nextAttemptAt: Date | null;
  errorCode?: string;
}

const READS = new Set([
  'listNotifications',
  'getNotification',
  'getNotificationPreferences',
  'listSupportCategories',
  'listSupportTickets',
  'getSupportTicket',
  'downloadSupportAttachment',
  'listFeedback',
  'getFeedback',
  'listOwnAbuseReports',
  'listPublishedContent',
  'getPublishedContent',
  'adminListNotificationTemplates',
  'adminListNotificationCampaigns',
  'adminGetNotificationCampaign',
  'adminListNotificationDeliveries',
  'adminListSupportTickets',
  'adminGetSupportTicket',
  'adminListSupportCategories',
  'adminListFeedback',
  'adminGetFeedback',
  'adminListAbuseReports',
  'adminListContent',
  'adminGetContent',
]);

interface EngagementCursor {
  at: string;
  id: string;
}

function decodeCursor(value: unknown): EngagementCursor | null {
  if (value === undefined) return null;
  if (typeof value !== 'string')
    throw new HttpException({ code: 'ENGAGEMENT_CURSOR_INVALID' }, 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error();
    const cursor = parsed as Partial<EngagementCursor>;
    if (
      typeof cursor.at !== 'string' ||
      !Number.isFinite(Date.parse(cursor.at)) ||
      typeof cursor.id !== 'string' ||
      cursor.id.length < 1 ||
      cursor.id.length > 128
    )
      throw new Error();
    return { at: cursor.at, id: cursor.id };
  } catch {
    throw new HttpException({ code: 'ENGAGEMENT_CURSOR_INVALID' }, 400);
  }
}

function cursorPage(rows: CursorRow[], limit: number): Record<string, unknown> {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const last = hasMore ? selected.at(-1) : undefined;
  return {
    items: selected.map((row) => row.value),
    nextCursor: last
      ? Buffer.from(
          JSON.stringify({
            at: new Date(last.sort_at).toISOString(),
            id: last.sort_id,
          } satisfies EngagementCursor),
        ).toString('base64url')
      : null,
    hasMore,
  };
}

function page(items: unknown[]): Record<string, unknown> {
  return { items, nextCursor: null, hasMore: false };
}

function commandBody(command: EngagementCommand): Record<string, unknown> {
  return (command.body ?? {}) as Record<string, unknown>;
}

function databaseCommandBody(command: EngagementCommand): Record<string, unknown> {
  const input = commandBody(command);
  if (command.operation !== 'replaceNotificationPreferences' || !Array.isArray(input.items))
    return input;
  return {
    ...input,
    items: input.items.map((item) => {
      const preference = item as Record<string, unknown>;
      return {
        channel: preference.channel,
        event_type: preference.eventType,
        enabled: preference.enabled,
        quiet_hours: preference.quietHours,
      };
    }),
  };
}

function mapDatabaseError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const code = (error as { code?: string }).code;
  if (code === '42501') return new HttpException({ code: 'FORBIDDEN' }, 403);
  if (code === 'P0002') return new HttpException({ code: 'NOT_FOUND' }, 404);
  if (['23505', '40001'].includes(code ?? '')) return new HttpException({ code: 'CONFLICT' }, 409);
  if (['22023', '22P02', '23514'].includes(code ?? ''))
    return new HttpException({ code: 'ENGAGEMENT_INPUT_INVALID' }, 400);
  return new HttpException({ code: 'ENGAGEMENT_UNAVAILABLE' }, 503);
}

@Injectable()
export class EngagementRepository {
  constructor(
    private readonly pool: PoolService,
    private readonly config: PlatformConfigService,
  ) {}

  async execute(principal: ClerkPrincipal, command: EngagementCommand): Promise<unknown> {
    try {
      return READS.has(command.operation)
        ? await this.read(principal, command)
        : await this.mutate(principal, command);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async claimSourceEvents(
    eventTypes: readonly string[],
    limit: number,
  ): Promise<SourceNotificationClaim[]> {
    return this.worker(async (client) => {
      await client.query('select private.enqueue_credit_card_due_reminders(current_timestamp,$1)', [
        limit,
      ]);
      const result = await client.query<SourceNotificationClaim>(
        `select o.id source_event_id,o.aggregate_id::text source_id,o.event_type,owner.user_id,
           case when coalesce(o.payload->>'locale',p.locale)='en' then 'en' else 'ar' end locale,
           p.timezone time_zone,o.created_at::text occurred_at,
           case when o.payload->>'expiresAt' ~ '^\\d{4}-\\d{2}-\\d{2}T' then o.payload->>'expiresAt' end expires_at
         from private.outbox_events o
         cross join lateral (select coalesce(
           nullif(o.payload->>'userId',''),
           (select user_id from public.transactions where id=o.aggregate_id),
           (select user_id from public.salary_receipts where id=o.aggregate_id),
           (select user_id from public.obligation_schedule_items where id=o.aggregate_id),
           (select user_id from public.savings_goals where id=o.aggregate_id),
           (select user_id from public.review_items where id=o.aggregate_id),
           (select user_id from public.duplicate_candidates where id=o.aggregate_id),
           (select user_id from public.unsupported_formats where id=o.aggregate_id),
           (select user_id from public.voice_proposals where id=o.aggregate_id),
           (select user_id from public.assistant_messages where id=o.aggregate_id),
           (select user_id from private.report_output_attempts where id=o.aggregate_id),
           (select user_id from private.ai_usage_events where request_id=o.aggregate_id::text limit 1)
         ) user_id) owner
         join public.profiles p on p.id=owner.user_id and p.status='active'
         where o.published_at is not null and o.event_type=any($1::text[])
           and not exists(select 1 from public.notification_events n where n.source_event_id=o.id)
         order by o.created_at,o.id limit $2`,
        [eventTypes, limit],
      );
      return result.rows;
    });
  }

  async loadSourceTemplates(source: SourceNotificationClaim): Promise<SourceTemplate[]> {
    return this.worker(async (client) => {
      const result = await client.query<SourceTemplate>(
        `select distinct on (t.channel) t.id,t.key,t.locale,t.channel,t.template_version,t.subject,t.body,
           coalesce(pref.enabled,true) enabled,coalesce(pref.quiet_hours,'{}'::jsonb) quiet_hours
         from public.notification_templates t
         left join public.notification_preferences pref on pref.user_id=$2 and pref.event_type=$1 and pref.channel=t.channel
         where t.key=$1 and t.status='published' and t.locale in ($3,'ar','en')
         order by t.channel,(t.locale=$3) desc,(t.locale='ar') desc,t.template_version desc`,
        [source.event_type, source.user_id, source.locale],
      );
      return result.rows;
    });
  }

  async createNotificationFromSource(
    source: SourceNotificationClaim,
    deliveries: readonly PreparedDelivery[],
  ): Promise<boolean> {
    if (!deliveries.some((item) => item.channel === 'in_app')) return false;
    return this.worker(async (client) => {
      const inApp = deliveries.find((item) => item.channel === 'in_app');
      const inserted = await client.query<{ id: string }>(
        `insert into public.notification_events(source_event_id,user_id,type,title,body_safe,data,expires_at,created_at)
         values($1,$2,$3,$4,$5,jsonb_build_object(
           'route','notification_detail','sourceEventId',$1::text,'actions',
           case when $3 in ('transaction.created','transaction.revised') then jsonb_build_array(
             jsonb_build_object('key','view','expiresAt',null),jsonb_build_object('key','edit','expiresAt',null),
             jsonb_build_object('key','undo','expiresAt',least(coalesce($6,$7::timestamptz+interval '15 minutes'),$7::timestamptz+interval '15 minutes'))
           ) else jsonb_build_array(jsonb_build_object('key','view','expiresAt',null)) end,
           'targetKind',case
             when $3 like 'transaction.%' or $3 like 'transfer.%' then 'transaction'
             when $3 like 'planning.obligation_%' then 'obligation'
             when $3='account.credit_card_payment_due' then 'account'
             when $3 like 'planning.savings_%' then 'goal'
             when $3 like 'tracking.review.%' then 'review'
             else 'settings' end,
           'targetId',coalesce($8,'notifications')
         ),$6,$7)
         on conflict(source_event_id) do nothing returning id`,
        [
          source.source_event_id,
          source.user_id,
          source.event_type,
          inApp?.title,
          inApp?.body,
          source.expires_at,
          source.occurred_at,
          source.source_id,
        ],
      );
      const eventId = inserted.rows[0]?.id;
      if (!eventId) return false;
      for (const item of deliveries) {
        await client.query(
          `insert into private.notification_deliveries(event_id,user_id,channel,provider,rendered_title,rendered_body,rendered_data,status,error_code,next_attempt_at)
           values($1,$2,$3,$4,$5,$6,jsonb_build_object('route','notification_detail'),$7,$8,$9) on conflict do nothing`,
          [
            eventId,
            source.user_id,
            item.channel,
            item.provider,
            item.title,
            item.body,
            item.status,
            item.errorCode ?? null,
            item.nextAttemptAt,
          ],
        );
      }
      return true;
    });
  }

  async claimNotificationDeliveries(
    workerId: string,
    limit: number,
  ): Promise<NotificationDeliveryClaim[]> {
    return this.worker(async (client) => {
      const claims = await client.query<NotificationDeliveryClaim>(
        `select d.id,d.claim_token,d.user_id,d.channel,d.provider,d.attempt_count,d.event_id,
          coalesce(d.rendered_title,e.title,t.subject,'Masarifi') title,coalesce(d.rendered_body,e.body_safe,t.body) body_safe,
          coalesce(d.rendered_data,e.data,jsonb_build_object('route','notification_detail')) data,
          p.token_ciphertext,p.device_id token_device_id,p.provider token_provider
         from private.claim_notification_deliveries($1,$2,60) d
         left join public.notification_events e on e.id=d.event_id
         left join public.notification_campaigns c on c.id=d.campaign_id
         left join public.notification_templates t on t.id=c.template_id and t.status='published'
         left join lateral (select token_ciphertext,device_id,provider from public.push_tokens
           where user_id=d.user_id and revoked_at is null order by updated_at desc limit 1) p on d.channel='push'`,
        [workerId, limit],
      );
      return claims.rows;
    });
  }

  async finishNotificationDelivery(
    id: string,
    claimToken: string,
    outcome: 'delivered' | 'failed' | 'suppressed',
    errorCode?: string,
    providerRef?: string,
  ): Promise<boolean> {
    return this.worker(async (client) => {
      const updated = await client.query<{
        id: string;
        event_id: string | null;
        campaign_id: string | null;
        channel: string;
      }>(
        `update private.notification_deliveries set status=$3,error_code=$4,provider_ref=$5,
          delivered_at=case when $3='delivered' then clock_timestamp() else null end,
          next_attempt_at=case when $3='failed' then clock_timestamp()+make_interval(secs=>least(3600,power(2,attempt_count)::integer*15)) else null end,
          claim_token=null,claimed_by=null,lease_until=null where id=$1 and claim_token=$2
          returning id,event_id,campaign_id,channel`,
        [id, claimToken, outcome, errorCode ?? null, providerRef ?? null],
      );
      const delivery = updated.rows[0];
      if (!delivery) return false;
      if (outcome === 'delivered' || outcome === 'failed') {
        await client.query(
          `select private.enqueue_outbox_event($1,'notification_delivery',$2,jsonb_build_object(
             'schemaVersion',1,'deliveryId',$2::uuid,'eventId',$3::uuid,'campaignId',$4::uuid,
             'channel',$5::text,'errorCode',$6::text))`,
          [
            outcome === 'delivered' ? 'notification.delivered' : 'notification.failed',
            delivery.id,
            delivery.event_id,
            delivery.campaign_id,
            delivery.channel,
            errorCode ?? null,
          ],
        );
      }
      return true;
    });
  }

  async revokePushToken(userId: string, deviceId: string): Promise<void> {
    await this.worker(async (client) => {
      await client.query(
        `update public.push_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=$1 and device_id=$2`,
        [userId, deviceId],
      );
    });
  }

  async claimAttachments(workerId: string, limit: number): Promise<AttachmentScanClaim[]> {
    return this.worker(
      async (client) =>
        (
          await client.query<AttachmentScanClaim>(
            `with due as (select id from private.support_attachments where scan_status in ('pending','failed')
          and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp())
          order by next_attempt_at,id limit $2 for update skip locked)
         update private.support_attachments a set claim_token=extensions.gen_random_uuid(),claimed_by=$1,
          lease_until=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1 from due where a.id=due.id
         returning a.id,a.claim_token,a.storage_ref,a.sha256,a.size_bytes,a.content_type,a.attempt_count`,
            [workerId, limit],
          )
        ).rows,
    );
  }

  async finishAttachment(
    id: string,
    claimToken: string,
    outcome: 'clean' | 'rejected' | 'failed',
    errorCode?: string,
  ): Promise<boolean> {
    return this.worker(
      async (client) =>
        (
          await client.query(
            `update private.support_attachments set scan_status=$3,error_code=$4,
          scanned_at=case when $3 in ('clean','rejected') then clock_timestamp() else null end,
          next_attempt_at=case when $3='failed' then clock_timestamp()+make_interval(secs=>least(3600,power(2,attempt_count)::integer*15)) else next_attempt_at end,
          claim_token=null,claimed_by=null,lease_until=null where id=$1 and claim_token=$2 returning id`,
            [id, claimToken, outcome, errorCode ?? null],
          )
        ).rowCount === 1,
    );
  }

  async removeOrphanedAttachmentUploads(limit: number): Promise<string[]> {
    return this.worker(async (client) => {
      const removed = await client.query<{ storage_ref: string }>(
        `delete from private.support_attachments where id in (
           select id from private.support_attachments where scan_status='uploading'
             and created_at<clock_timestamp()-interval '1 hour'
           order by created_at,id limit $1 for update skip locked
         ) returning storage_ref`,
        [limit],
      );
      return removed.rows.map((row) => row.storage_ref);
    });
  }

  async expireNotifications(): Promise<number> {
    return this.worker(
      async (client) =>
        (
          await client.query(
            `update private.notification_deliveries d set status='suppressed',error_code='EXPIRED',next_attempt_at=null where d.status in ('queued','failed') and exists(select 1 from public.notification_events e where e.id=d.event_id and e.expires_at<=clock_timestamp())`,
          )
        ).rowCount ?? 0,
    );
  }

  async expandCampaigns(limit: number): Promise<number> {
    return this.worker(async (client) => {
      const campaign = (
        await client.query<{
          id: string;
          channel: string;
          subject: string | null;
          body: string;
          audience_definition: Record<string, unknown>;
        }>(
          `select c.id,t.channel,t.subject,t.body,c.audience_definition from public.notification_campaigns c
           join public.notification_templates t on t.id=c.template_id
           where c.status in ('scheduled','running') and (c.status='running' or c.scheduled_at<=clock_timestamp())
           order by c.scheduled_at nulls first,c.id limit 1 for update of c skip locked`,
        )
      ).rows[0];
      if (!campaign) return 0;
      await client.query(
        `update public.notification_campaigns set status='running' where id=$1 and status='scheduled'`,
        [campaign.id],
      );
      const inserted = await client.query(
        `insert into private.notification_deliveries(campaign_id,user_id,channel,provider,rendered_title,rendered_body,rendered_data,next_attempt_at)
         select $1,p.id,$2,case $2 when 'push' then 'push' when 'email' then 'smtp' else 'database' end,$8,$9,jsonb_build_object('route','notification_detail'),clock_timestamp()
         from public.profiles p where p.status='active'
           and p.id>coalesce((select max(existing.user_id) from private.notification_deliveries existing where existing.campaign_id=$1),'')
           and (coalesce(cardinality($4::text[]),0)=0 or p.locale=any($4::text[]))
           and ($5='all' or ($5='active' and p.last_seen_at>=clock_timestamp()-interval '30 days')
             or ($5='inactive' and (p.last_seen_at is null or p.last_seen_at<clock_timestamp()-interval '30 days')))
           and (coalesce(cardinality($6::text[]),0)=0 or exists(
             select 1 from public.user_devices u where u.user_id=p.id and u.revoked_at is null and u.platform=any($6::text[])))
           and (not ('salary_users'=any($7::text[])) or exists(select 1 from public.salary_profiles s where s.user_id=p.id and s.deleted_at is null))
           and not exists(select 1 from public.notification_preferences pref where pref.user_id=p.id and pref.channel=$2 and not pref.enabled)
           and not exists(select 1 from private.notification_deliveries d where d.campaign_id=$1 and d.user_id=p.id and d.channel=$2)
         order by p.id limit $3 on conflict do nothing`,
        [
          campaign.id,
          campaign.channel,
          limit,
          campaign.audience_definition.locales ?? [],
          campaign.audience_definition.activity ?? 'all',
          campaign.audience_definition.platforms ?? [],
          campaign.audience_definition.segmentKeys ?? [],
          campaign.subject ?? 'Masarifi',
          campaign.body,
        ],
      );
      if ((inserted.rowCount ?? 0) < limit) {
        await client.query(
          `update public.notification_campaigns set status='completed' where id=$1 and status='running'`,
          [campaign.id],
        );
      }
      return inserted.rowCount ?? 0;
    });
  }

  private async read(principal: ClerkPrincipal, command: EngagementCommand): Promise<unknown> {
    return this.pool.withClient(async (client) => {
      await client.query('begin isolation level repeatable read read only');
      try {
        await this.setContext(client, principal);
        const value = await this.readOperation(client, principal.userId, command);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private async readOperation(
    client: PoolClient,
    userId: string,
    command: EngagementCommand,
  ): Promise<unknown> {
    const id = Object.values(command.params ?? {})[0];
    const query = (command.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(
      Number(query.limit ?? 50),
      command.operation.startsWith('admin') ? 200 : 100,
    );
    const cursor = decodeCursor(query.cursor);
    switch (command.operation) {
      case 'listNotifications': {
        const rows = (
          await client.query<CursorRow>(
            `select jsonb_build_object('id',id,'type',type,'title',title,'body',body_safe,'dataSafe',data-'actions','readAt',read_at,'actedAt',acted_at,'expiresAt',expires_at,'actions',coalesce(data->'actions','[]'),'version',version,'createdAt',created_at) value,created_at sort_at,id::text sort_id
             from public.notification_events where user_id=$1 and (expires_at is null or expires_at>clock_timestamp())
             and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
             and ($4::text is null or type=$4) and ($5::boolean is null or (read_at is null)=$5)
             order by created_at desc,id desc limit $6`,
            [
              userId,
              cursor?.at ?? null,
              cursor?.id ?? null,
              query.type ?? null,
              query.unread ?? null,
              limit + 1,
            ],
          )
        ).rows;
        const result = cursorPage(rows, limit);
        const unread = await client.query<{ count: string }>(
          `select count(*)::text count from public.notification_events where user_id=$1 and read_at is null and (expires_at is null or expires_at>clock_timestamp())`,
          [userId],
        );
        return { ...result, unreadCount: Number(unread.rows[0]?.count ?? 0) };
      }
      case 'getNotification':
        return this.one(
          client,
          `select jsonb_build_object('id',id,'type',type,'title',title,'body',body_safe,'dataSafe',data-'actions','readAt',read_at,'actedAt',acted_at,'expiresAt',expires_at,'actions',coalesce(data->'actions','[]'),'version',version,'createdAt',created_at) value from public.notification_events where id=$1 and user_id=$2 and (expires_at is null or expires_at>clock_timestamp())`,
          [id, userId],
        );
      case 'getNotificationPreferences': {
        const rows = await client.query<ValueRow & { matrix_version: string }>(
          `select jsonb_build_object('channel',channel,'eventType',event_type,'enabled',enabled,'quietHours',quiet_hours,'version',version) value,
               max(version) over()::text matrix_version from public.notification_preferences where user_id=$1 order by event_type,channel`,
          [userId],
        );
        return {
          items: rows.rows.map((row) => row.value),
          version: Number(rows.rows[0]?.matrix_version ?? 1),
        };
      }
      case 'listSupportCategories':
      case 'adminListSupportCategories':
        return page(
          (
            await client.query(
              `select jsonb_build_object('id',id,'key',key,'name',name,'sortOrder',sort_order,'active',active,'version',version) value from public.support_categories ${command.operation.startsWith('admin') ? '' : 'where active'} order by sort_order,key limit $1`,
              [limit],
            )
          ).rows.map((row: ValueRow) => row.value),
        );
      case 'listSupportTickets':
      case 'adminListSupportTickets': {
        const admin = command.operation.startsWith('admin');
        const rows = await client.query<CursorRow>(
          `select jsonb_build_object('id',id,'categoryId',category_id,'subject',subject,'status',status,'priority',priority,'lastMessageAt',last_message_at,'closedAt',closed_at,'version',version,'createdAt',created_at) value,last_message_at sort_at,id::text sort_id
           from public.support_tickets where ($1::text is null or user_id=$1)
           and ($2::timestamptz is null or (last_message_at,id)<($2::timestamptz,$3::uuid))
           and ($4::text is null or status=$4) order by last_message_at desc,id desc limit $5`,
          [
            admin ? null : userId,
            cursor?.at ?? null,
            cursor?.id ?? null,
            query.status ?? null,
            limit + 1,
          ],
        );
        return cursorPage(rows.rows, limit);
      }
      case 'getSupportTicket':
      case 'adminGetSupportTicket': {
        const admin = command.operation.startsWith('admin');
        const ticket = await this.one(
          client,
          `select jsonb_build_object('id',id,'categoryId',category_id,'subject',subject,'status',status,'priority',priority,'lastMessageAt',last_message_at,'closedAt',closed_at,'version',version,'createdAt',created_at) value from public.support_tickets where id=$1 ${admin ? '' : 'and user_id=$2'}`,
          admin ? [id] : [id, userId],
        );
        const messageRows = (
          await client.query<CursorRow>(
            `select jsonb_build_object('id',m.id,'senderType',m.sender_type,'body',m.body,'attachments',coalesce((
               select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename_safe,'contentType',a.content_type,'sizeBytes',a.size_bytes,'status',a.scan_status) order by a.id)
               from private.support_attachments a where a.message_id=m.id and ${admin ? "a.scan_status<>'uploading'" : "a.scan_status='clean'"}
             ),'[]'::jsonb),'createdAt',m.created_at) value,m.created_at sort_at,m.id::text sort_id
             from public.support_messages m where m.ticket_id=$1
             and ($2::timestamptz is null or (m.created_at,m.id)>($2::timestamptz,$3::uuid))
             order by m.created_at,m.id limit $4`,
            [id, cursor?.at ?? null, cursor?.id ?? null, limit + 1],
          )
        ).rows;
        const messagePage = cursorPage(messageRows, limit);
        const notes = admin
          ? (
              await client.query(
                `select jsonb_build_object('id',id,'body',body,'createdAt',created_at) value from private.support_internal_notes where ticket_id=$1 order by created_at,id limit 100`,
                [id],
              )
            ).rows.map((row: ValueRow) => row.value)
          : undefined;
        return {
          ...(ticket as Record<string, unknown>),
          messages: messagePage.items,
          nextCursor: messagePage.nextCursor,
          hasMore: messagePage.hasMore,
          ...(notes ? { internalNotes: notes } : {}),
        };
      }
      case 'downloadSupportAttachment':
        return this.one(
          client,
          `select jsonb_build_object('id',a.id,'storageRef',a.storage_ref,'filename',a.filename_safe,'contentType',a.content_type,'sizeBytes',a.size_bytes,'status',a.scan_status) value from private.support_attachments a join public.support_tickets t on t.id=a.ticket_id where a.id=$1 and t.user_id=$2 and a.scan_status='clean'`,
          [id, userId],
        );
      case 'listFeedback':
      case 'adminListFeedback': {
        const admin = command.operation.startsWith('admin');
        const rows = await client.query<CursorRow>(
          `select jsonb_build_object('id',id,'type',type,'subject',subject,'body',body,'status',status,'version',version,'createdAt',created_at) value,created_at sort_at,id::text sort_id
           from public.feedback_items where ($1::text is null or user_id=$1)
           and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
           and ($4::text is null or status=$4) order by created_at desc,id desc limit $5`,
          [
            admin ? null : userId,
            cursor?.at ?? null,
            cursor?.id ?? null,
            query.status ?? null,
            limit + 1,
          ],
        );
        return cursorPage(rows.rows, limit);
      }
      case 'adminGetFeedback':
        return this.one(
          client,
          `select jsonb_build_object('id',id,'type',type,'subject',subject,'body',body,'state',status,'version',version,'createdAt',created_at,'updatedAt',updated_at) value from public.feedback_items where id=$1`,
          [id],
        );
      case 'getFeedback':
        return this.one(
          client,
          `select jsonb_build_object('id',id,'type',type,'subject',subject,'body',body,'status',status,'version',version,'createdAt',created_at) value from public.feedback_items where id=$1 and user_id=$2`,
          [id, userId],
        );
      case 'listOwnAbuseReports':
      case 'adminListAbuseReports': {
        const admin = command.operation.startsWith('admin');
        const rows = await client.query<CursorRow>(
          `select jsonb_build_object('id',id,'status',status,'createdAt',created_at${admin ? ",'resourceType',resource_type,'resourceId',resource_id,'reason',reason,'version',version" : ''}) value,created_at sort_at,id::text sort_id
           from public.abuse_reports where ($1::text is null or reporter_id=$1)
           and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
           and ($4::text is null or status=$4) order by created_at desc,id desc limit $5`,
          [
            admin ? null : userId,
            cursor?.at ?? null,
            cursor?.id ?? null,
            query.status ?? null,
            limit + 1,
          ],
        );
        return cursorPage(rows.rows, limit);
      }
      case 'listPublishedContent':
      case 'getPublishedContent': {
        const locale = query.locale === 'ar' ? 'ar' : 'en';
        const single = command.operation === 'getPublishedContent';
        const localeParameter = single ? '$2' : '$1';
        const sql = `select jsonb_build_object('key',c.key,'type',c.type,'locale',t.locale,'title',t.title,'body',t.body,'version',c.version,'publishedAt',c.published_at) value,c.updated_at sort_at,c.id::text sort_id from public.content_items c join lateral (select * from public.content_translations t where t.content_id=c.id order by (t.locale=${localeParameter}) desc,(t.locale='en') desc limit 1) t on true where c.status='published' ${single ? 'and c.key=$1' : "and ($2::text is null or c.type=$2) and ($3::text is null or t.title ilike '%'||$3||'%' or t.body ilike '%'||$3||'%') and ($4::timestamptz is null or (c.updated_at,c.id)<($4::timestamptz,$5::uuid))"} order by c.updated_at desc,c.id desc ${single ? '' : 'limit $6'}`;
        const values: unknown[] = single
          ? [id, locale]
          : [
              locale,
              query.type ?? null,
              query.query ?? null,
              cursor?.at ?? null,
              cursor?.id ?? null,
              limit + 1,
            ];
        return single
          ? this.one(client, sql, values)
          : cursorPage((await client.query<CursorRow>(sql, values)).rows, limit);
      }
      case 'adminListNotificationTemplates':
        return this.adminPage(client, 'public.notification_templates', limit, cursor);
      case 'adminListNotificationCampaigns':
        return this.adminPage(client, 'public.notification_campaigns', limit, cursor);
      case 'adminGetNotificationCampaign':
        return this.one(
          client,
          `select jsonb_build_object('id',id,'name',name,'audience',audience_definition,'templateId',template_id,'state',status,'scheduledAt',scheduled_at,'createdBy',created_by,'approvedBy',approved_by,'version',version,'createdAt',created_at,'updatedAt',updated_at) value from public.notification_campaigns where id=$1`,
          [id],
        );
      case 'adminListNotificationDeliveries':
        return this.adminPage(client, 'private.notification_deliveries', limit, cursor);
      case 'adminListContent':
        return this.adminPage(client, 'public.content_items', limit, cursor);
      case 'adminGetContent':
        return this.one(
          client,
          `select jsonb_build_object('id',c.id,'key',c.key,'type',c.type,'state',c.status,'publishedAt',c.published_at,'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at,'translations',coalesce((select jsonb_agg(jsonb_build_object('locale',t.locale,'title',t.title,'body',t.body) order by t.locale) from public.content_translations t where t.content_id=c.id),'[]'::jsonb)) value from public.content_items c where c.id=$1`,
          [id],
        );
      default:
        throw new Error('ENGAGEMENT_OPERATION_INVALID');
    }
  }

  private async mutate(principal: ClerkPrincipal, command: EngagementCommand): Promise<unknown> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await this.setContext(client, principal);
        const scope = `engagement.${command.operation}`;
        const keyHash = hashIdempotencyKey(command.idempotencyKey ?? '');
        const requestHash = hashNormalizedCommand({
          operation: command.operation,
          body: command.body,
          params: command.params,
        });
        const claim = (
          await client.query<Claim>(
            'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
            [principal.userId, scope, keyHash, requestHash, '2 minutes'],
          )
        ).rows[0];
        if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
        if (claim.outcome === 'hash_mismatch')
          throw new HttpException({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409);
        if (claim.outcome === 'in_progress')
          throw new HttpException({ code: 'IDEMPOTENCY_IN_PROGRESS' }, 409);
        if (claim.outcome === 'replay') {
          await client.query('commit');
          return claim.response_body;
        }
        const value = await this.mutationOperation(client, principal, command);
        await client.query('select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)', [
          principal.userId,
          scope,
          keyHash,
          requestHash,
          command.operation.includes('Create') || command.operation.startsWith('create')
            ? 201
            : 200,
          JSON.stringify(value),
          Object.values(command.params ?? {})[0] ?? null,
        ]);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private async mutationOperation(
    client: PoolClient,
    principal: ClerkPrincipal,
    command: EngagementCommand,
  ): Promise<unknown> {
    const input = commandBody(command);
    const databaseInput = databaseCommandBody(command);
    const id = Object.values(command.params ?? {})[0] ?? null;
    let sql: string;
    let values: unknown[];
    switch (command.operation) {
      case 'setNotificationRead':
      case 'actOnNotification':
        sql = 'select private.mark_notification($1,$2::uuid,$3,$4,$5,$6) value';
        values = [
          principal.userId,
          id,
          input.expectedVersion,
          command.operation === 'setNotificationRead' ? input.read : true,
          command.operation === 'actOnNotification',
          input.actionKey ?? null,
        ];
        break;
      case 'createSupportTicket':
        sql = 'select private.create_support_ticket($1,$2::uuid,$3,$4) value';
        values = [principal.userId, input.categoryId, input.subject, input.message];
        break;
      case 'addSupportMessage':
        sql = 'select private.add_support_message($1,$2::uuid,$3,$4,$5::uuid[]) value';
        values = [
          principal.userId,
          id,
          input.body,
          input.expectedVersion,
          input.attachmentUploadIds ?? [],
        ];
        break;
      case 'createFeedback':
        sql = 'select private.create_feedback($1,$2,$3,$4) value';
        values = [principal.userId, input.type, input.subject ?? null, input.body];
        break;
      case 'createAbuseReport':
        sql = 'select private.create_abuse_report($1,$2,$3,$4) value';
        values = [principal.userId, input.resourceType, input.resourceId, input.reason];
        break;
      default:
        sql =
          'select private.execute_engagement_command($1,$2,$3::uuid,$4::jsonb,$5,$6,$7,$8) value';
        values = [
          principal.userId,
          command.operation,
          id,
          JSON.stringify(databaseInput),
          principal.mfaAgeSeconds ?? principal.factorAgeSeconds,
          command.requestId,
          this.config.getRequired('MASARIFI_CAMPAIGN_APPROVAL_THRESHOLD'),
          this.config.getRequired('MASARIFI_SUPPORT_REOPEN_HOURS'),
        ];
    }
    const result = (await client.query<ValueRow>(sql, values)).rows[0]?.value;
    if (result === undefined) throw new Error('ENGAGEMENT_COMMAND_FAILED');
    return typeof result === 'string'
      ? {
          resourceId: result,
          outcome: 'accepted',
          currentState: 'created',
          version: 1,
          requestId: command.requestId,
        }
      : { ...(result as Record<string, unknown>), requestId: command.requestId };
  }

  private async one(client: PoolClient, sql: string, values: unknown[]): Promise<unknown> {
    const row = (await client.query<ValueRow>(sql, values)).rows[0];
    if (!row) throw new HttpException({ code: 'NOT_FOUND' }, 404);
    return row.value;
  }

  private async adminPage(
    client: PoolClient,
    table: string,
    limit: number,
    cursor: EngagementCursor | null,
  ): Promise<unknown> {
    if (
      !new Set([
        'public.notification_templates',
        'public.notification_campaigns',
        'private.notification_deliveries',
        'public.content_items',
      ]).has(table)
    )
      throw new Error('ENGAGEMENT_OPERATION_INVALID');
    const projections: Record<string, string> = {
      'public.notification_templates':
        "jsonb_build_object('id',id,'state',status,'version',version,'updatedAt',updated_at,'safe',jsonb_build_object('key',key,'locale',locale,'channel',channel,'templateVersion',template_version,'subject',subject,'body',body))",
      'public.notification_campaigns':
        "jsonb_build_object('id',id,'state',status,'version',version,'updatedAt',updated_at,'safe',jsonb_build_object('name',name,'templateId',template_id,'scheduledAt',scheduled_at,'createdBy',created_by,'approvedBy',approved_by))",
      'private.notification_deliveries':
        "jsonb_build_object('id',id,'state',status,'version',version,'updatedAt',updated_at,'safe',jsonb_build_object('channel',channel,'attemptCount',attempt_count,'errorCode',error_code,'deliveredAt',delivered_at,'eventId',event_id,'campaignId',campaign_id))",
      'public.content_items':
        "jsonb_build_object('id',id,'state',status,'version',version,'updatedAt',updated_at,'safe',jsonb_build_object('key',key,'type',type,'publishedAt',published_at))",
    };
    const projection = projections[table];
    if (!projection) throw new Error('ENGAGEMENT_OPERATION_INVALID');
    return cursorPage(
      (
        await client.query<CursorRow>(
          `select ${projection} value,
             updated_at sort_at,id::text sort_id from ${table} item
           where ($1::timestamptz is null or (updated_at,id)<($1::timestamptz,$2::uuid))
           order by updated_at desc,id desc limit $3`,
          [cursor?.at ?? null, cursor?.id ?? null, limit + 1],
        )
      ).rows,
      limit,
    );
  }

  private async setContext(client: PoolClient, principal: ClerkPrincipal): Promise<void> {
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'authenticated', sub: principal.userId, sid: principal.sessionId }),
    ]);
    await client.query('set local role masarifi_api');
  }

  private async worker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'worker' }),
        ]);
        await client.query('set local role masarifi_worker');
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }
}
