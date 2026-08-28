import { Injectable, Optional } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PoolService } from '../platform/database/pool.service';
import type { ClerkPrincipal } from './clerk-auth.guard';
import type { ClerkIdentityUser } from './clerk-client.service';
import type {
  Calendar,
  DeviceRegistrationDto,
  DevicePlatform,
  Locale,
  OnboardingReplaceDto,
  OnboardingStep,
  PreferencesReplaceDto,
  PrivacySettings,
  ProfileUpdateDto,
  Theme,
} from './identity.dto';
import {
  buildDeviceRegisteredPayload,
  buildDeviceRevokedPayload,
  buildProfileCreatedPayload,
  buildProfileDeletionRequestedPayload,
  buildProfileUpdatedPayload,
} from './identity.events';
import { PushTokenCrypto } from './push-token.crypto';

export interface ProfileRecord {
  id: string;
  primaryEmail: string | null;
  phoneE164: string | null;
  displayName: string | null;
  locale: Locale;
  timezone: string;
  status: 'active';
  version: number;
}

export interface PreferencesRecord {
  defaultCurrency: string;
  language: Locale;
  theme: Theme;
  calendar: Calendar;
  weekStart: number;
  privacySettings: PrivacySettings;
  version: number;
}

export interface OnboardingRecord {
  step: OnboardingStep;
  completedSteps: OnboardingStep[];
  completedAt: Date | null;
  version: number;
}

export interface DeviceRecord {
  id: string;
  platform: DevicePlatform;
  appVersion: string;
  deviceName: string | null;
  trustedAt: Date | null;
  lastSeenAt: Date;
  revokedAt: Date | null;
  clerkSessionId: string | null;
  createdAt: Date;
  version: number;
}

export interface DeviceRegistrationRecord {
  device: DeviceRecord;
  created: boolean;
  registrationResult: 'created' | 'refreshed' | 'reactivated_with_fresh_session';
}

export type DeviceRevokeRecord =
  | { status: 'not_found' }
  | { status: 'revoked'; device: DeviceRecord; sessionId: string | null };

export interface ClerkWebhookReceipt {
  eventId: string;
  eventType: 'user.created' | 'user.updated' | 'user.deleted';
  verifiedAt: Date;
  payloadHash: string;
  payload: Record<string, unknown>;
}

export type ClerkWebhookProcessResult =
  | { status: 'idle' }
  | { status: 'processed'; eventId: string }
  | { status: 'failed'; eventId: string; attemptCount: number };

interface ClerkWebhookRow {
  id: string;
  clerk_event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

interface ProfileRow {
  id: string;
  primary_email: string | null;
  phone_e164: string | null;
  display_name: string | null;
  locale: Locale;
  timezone: string;
  status: 'active' | 'suspended' | 'deletion_pending' | 'deleted';
  version: string;
}

interface PreferencesRow {
  default_currency: string;
  language: Locale;
  theme: Theme;
  calendar: Calendar;
  week_start: number;
  privacy_settings: PrivacySettings;
  version: string;
}

interface OnboardingRow {
  step: OnboardingStep;
  completed_steps: OnboardingStep[];
  completed_at: Date | null;
  version: string;
}

interface DeviceRow {
  id: string;
  platform: DevicePlatform;
  app_version: string;
  device_name: string | null;
  trusted_at: Date | null;
  last_seen_at: Date;
  revoked_at: Date | null;
  clerk_session_id: string | null;
  created_at: Date;
  version: string;
  created?: boolean;
}

function version(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('DATABASE_VERSION_INVALID');
  return parsed;
}

function profile(row: ProfileRow): ProfileRecord {
  if (row.status !== 'active') throw new Error('PROFILE_INACTIVE');
  return {
    id: row.id,
    primaryEmail: row.primary_email,
    phoneE164: row.phone_e164,
    displayName: row.display_name,
    locale: row.locale,
    timezone: row.timezone,
    status: row.status,
    version: version(row.version),
  };
}

function preferences(row: PreferencesRow): PreferencesRecord {
  return {
    defaultCurrency: row.default_currency,
    language: row.language,
    theme: row.theme,
    calendar: row.calendar,
    weekStart: row.week_start,
    privacySettings: row.privacy_settings,
    version: version(row.version),
  };
}

function onboarding(row: OnboardingRow): OnboardingRecord {
  return {
    step: row.step,
    completedSteps: row.completed_steps,
    completedAt: row.completed_at,
    version: version(row.version),
  };
}

function device(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    platform: row.platform,
    appVersion: row.app_version,
    deviceName: row.device_name,
    trustedAt: row.trusted_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    clerkSessionId: row.clerk_session_id,
    createdAt: row.created_at,
    version: version(row.version),
  };
}

@Injectable()
export class IdentityRepository {
  constructor(
    private readonly pool: PoolService,
    @Optional() private readonly pushCrypto?: PushTokenCrypto,
  ) {}

  async withCustomerTransaction<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({
            role: 'authenticated',
            sub: principal.userId,
            sid: principal.sessionId,
          }),
        ]);
        await client.query('set local role masarifi_api');
        await client.query('select private.assert_active_profile($1)', [principal.userId]);
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async receiveClerkWebhook(
    receipt: ClerkWebhookReceipt,
  ): Promise<'inserted' | 'duplicate' | 'conflict'> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_api');
        const result = await client.query<{ payload_hash: string; inserted: boolean }>(
          `with inserted as (
             insert into private.clerk_webhook_events (
               clerk_event_id, event_type, signature_verified_at, payload_hash, payload
             ) values ($1, $2, $3, $4, $5::jsonb)
             on conflict (clerk_event_id) do nothing
             returning payload_hash
           )
           select payload_hash, true as inserted from inserted
           union all
           select payload_hash, false as inserted
           from private.clerk_webhook_events
           where clerk_event_id = $1 and not exists (select 1 from inserted)
           limit 1`,
          [
            receipt.eventId,
            receipt.eventType,
            receipt.verifiedAt,
            receipt.payloadHash,
            JSON.stringify(receipt.payload),
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error('WEBHOOK_RECEIPT_FAILED');
        const outcome = row.inserted
          ? 'inserted'
          : row.payload_hash === receipt.payloadHash
            ? 'duplicate'
            : 'conflict';
        await client.query('commit');
        return outcome;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async processNextClerkWebhook(
    lookup: (subject: string) => Promise<ClerkIdentityUser | null>,
    maxAttempts: number,
  ): Promise<ClerkWebhookProcessResult> {
    let claimed: ClerkWebhookRow | undefined;
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query('set local role masarifi_worker');
          const selected = await client.query<ClerkWebhookRow>(
            `select id, clerk_event_id, payload, attempt_count
             from private.clerk_webhook_events
             where status in ('received', 'failed') and attempt_count < $1
             order by created_at, id
             for update skip locked limit 1`,
            [maxAttempts],
          );
          claimed = selected.rows[0];
          if (!claimed) {
            await client.query('commit');
            return { status: 'idle' };
          }
          await client.query(
            `update private.clerk_webhook_events
             set status='processing', attempt_count=attempt_count+1, last_error_code=null
             where id=$1`,
            [claimed.id],
          );
          const subject = this.webhookSubject(claimed.payload);
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [subject]);
          const current = await lookup(subject);
          if (current && current.id !== subject) throw new Error('CLERK_SUBJECT_MISMATCH');
          await this.synchronizeProfile(client, subject, current, 'clerk_webhook', claimed.clerk_event_id);
          await client.query(
            `update private.clerk_webhook_events
             set status='processed', processed_at=now(), last_error_code=null
             where id=$1`,
            [claimed.id],
          );
          await client.query('commit');
          return { status: 'processed', eventId: claimed.clerk_event_id };
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      if (!claimed) throw error;
      const code = error instanceof Error && error.message === 'INVALID_WEBHOOK'
        ? 'INVALID_WEBHOOK'
        : 'PROVIDER_UNAVAILABLE';
      const attemptCount = await this.failClerkWebhook(claimed.id, maxAttempts, code);
      return { status: 'failed', eventId: claimed.clerk_event_id, attemptCount };
    }
  }

  async synchronizeClerkIdentity(
    current: ClerkIdentityUser | null,
    subject: string,
  ): Promise<void> {
    await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [subject]);
        await this.synchronizeProfile(client, subject, current, 'clerk_reconciliation', null);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async listProfileSubjects(afterSubject: string | null, limit: number): Promise<string[]> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const result = await client.query<{ id: string }>(
          `select id from public.profiles
           where ($1::text is null or id > $1) and status <> 'deleted'
           order by id limit $2`,
          [afterSubject, limit],
        );
        await client.query('commit');
        return result.rows.map((row) => row.id);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async redactClerkWebhookPayloads(limit: number): Promise<number> {
    const result = await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const redacted = await client.query<{ id: string }>(
          `with selected as (
             select id from private.clerk_webhook_events
             where created_at <= now() - interval '7 days'
               and status in ('processed', 'failed') and payload <> '{}'::jsonb
             order by created_at, id for update skip locked limit $1
           )
           update private.clerk_webhook_events events set payload='{}'::jsonb
           from selected where events.id=selected.id returning events.id`,
          [limit],
        );
        await client.query('commit');
        return redacted.rowCount ?? 0;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
    return result;
  }

  async nextRevokedSession(): Promise<{ deviceId: string; sessionId: string } | null> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const result = await client.query<{ id: string; clerk_session_id: string }>(
          `select id, clerk_session_id from public.user_devices
           where revoked_at is not null and clerk_session_id is not null
           order by revoked_at, id for update skip locked limit 1`,
        );
        const row = result.rows[0];
        await client.query('commit');
        return row ? { deviceId: row.id, sessionId: row.clerk_session_id } : null;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async completeWorkerSessionRevoke(deviceId: string, sessionId: string): Promise<void> {
    await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        await client.query(
          `update public.user_devices set clerk_session_id=null
           where id=$1 and clerk_session_id=$2 and revoked_at is not null`,
          [deviceId, sessionId],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private webhookSubject(payload: Record<string, unknown>): string {
    const data = payload.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('INVALID_WEBHOOK');
    }
    const subject = (data as Record<string, unknown>).id;
    if (typeof subject !== 'string' || subject.trim() !== subject || subject.length < 1 || subject.length > 128) {
      throw new Error('INVALID_WEBHOOK');
    }
    return subject;
  }

  private async failClerkWebhook(id: string, maxAttempts: number, code: string): Promise<number> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const result = await client.query<{ attempt_count: number }>(
          `update private.clerk_webhook_events
           set status='failed', attempt_count=least(attempt_count+1, $2),
               processed_at=null, last_error_code=$3
           where id=$1 and status in ('received','failed') returning attempt_count`,
          [id, maxAttempts, code],
        );
        await client.query('commit');
        return result.rows[0]?.attempt_count ?? maxAttempts;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private async synchronizeProfile(
    client: PoolClient,
    subject: string,
    current: ClerkIdentityUser | null,
    source: 'clerk_webhook' | 'clerk_reconciliation',
    sourceEventId: string | null,
  ): Promise<void> {
    const existing = await client.query<ProfileRow>(
      `select id, primary_email, phone_e164, display_name, locale, timezone, status, version
       from public.profiles where id=$1 for update`,
      [subject],
    );
    const before = existing.rows[0];
    if (current) {
      let result: ProfileRow | undefined;
      let created = false;
      if (!before) {
        const inserted = await client.query<ProfileRow>(
          `insert into public.profiles (id,primary_email,phone_e164,display_name,status)
           values ($1,$2,$3,$4,'active')
           returning id,primary_email,phone_e164,display_name,locale,timezone,status,version`,
          [subject, current.primaryEmail, current.primaryPhone, current.displayName],
        );
        result = inserted.rows[0];
        created = true;
      } else if (before.status === 'active') {
        const updated = await client.query<ProfileRow>(
          `update public.profiles set primary_email=$2, phone_e164=$3
           where id=$1 and (primary_email is distinct from $2 or phone_e164 is distinct from $3)
           returning id,primary_email,phone_e164,display_name,locale,timezone,status,version`,
          [subject, current.primaryEmail, current.primaryPhone],
        );
        result = updated.rows[0] ?? before;
      } else {
        return;
      }
      if (!result) throw new Error('PROFILE_SYNC_FAILED');
      await client.query(
        `insert into public.user_preferences(user_id) values($1) on conflict(user_id) do nothing`,
        [subject],
      );
      await client.query(
        `insert into public.onboarding_progress(user_id) values($1) on conflict(user_id) do nothing`,
        [subject],
      );
      if (created) {
        await client.query(
          `select private.enqueue_outbox_event('profile.created','profile',null,$1::jsonb)`,
          [JSON.stringify(buildProfileCreatedPayload(subject, source, sourceEventId))],
        );
      } else {
        const changedFields = [
          ...(before?.primary_email === result.primary_email ? [] : ['primary_email']),
          ...(before?.phone_e164 === result.phone_e164 ? [] : ['phone_e164']),
        ];
        if (changedFields.length > 0) {
          await client.query(
            `select private.enqueue_outbox_event('profile.updated','profile',null,$1::jsonb)`,
            [JSON.stringify(buildProfileUpdatedPayload(
              subject, version(result.version), changedFields, source, sourceEventId,
            ))],
          );
        }
      }
      return;
    }

    if (!before) return;
    let deletion: ProfileRow | undefined;
    if (before.status === 'active') {
      const updated = await client.query<ProfileRow>(
        `update public.profiles set status='deletion_pending' where id=$1
         returning id,primary_email,phone_e164,display_name,locale,timezone,status,version`,
        [subject],
      );
      deletion = updated.rows[0];
    }
    if (!deletion) return;
    await client.query(
      `update public.user_devices set revoked_at=coalesce(revoked_at,now()) where user_id=$1`,
      [subject],
    );
    await client.query(
      `update public.push_tokens set revoked_at=coalesce(revoked_at,now()) where user_id=$1`,
      [subject],
    );
    await client.query(
      `select private.enqueue_outbox_event('profile.deletion_requested','profile',null,$1::jsonb)`,
      [JSON.stringify(buildProfileDeletionRequestedPayload(
        subject, version(deletion.version), source, sourceEventId, new Date(),
      ))],
    );
  }

  async getProfile(principal: ClerkPrincipal): Promise<ProfileRecord | null> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<ProfileRow>(
        `with touched as (
           update public.profiles
           set last_seen_at = now()
           where id = $1
             and (last_seen_at is null or last_seen_at < now() - interval '15 minutes')
           returning id, primary_email, phone_e164, display_name, locale, timezone, status, version
         )
         select * from touched
         union all
         select id, primary_email, phone_e164, display_name, locale, timezone, status, version
         from public.profiles
         where id = $1 and not exists (select 1 from touched)
         limit 1`,
        [principal.userId],
      );
      return result.rows[0] ? profile(result.rows[0]) : null;
    });
  }

  async updateProfile(
    principal: ClerkPrincipal,
    input: ProfileUpdateDto,
  ): Promise<ProfileRecord | null> {
    const changedFields = [
      ...(input.displayName === undefined ? [] : ['display_name']),
      ...(input.locale === undefined ? [] : ['locale']),
      ...(input.timezone === undefined ? [] : ['timezone']),
    ];
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<ProfileRow>(
        `update public.profiles
         set display_name = case when $2::boolean then $3::text else display_name end,
             locale = case when $4::boolean then $5::text else locale end,
             timezone = case when $6::boolean then $7::text else timezone end
         where id = $1 and version = $8
         returning id, primary_email, phone_e164, display_name, locale, timezone, status, version`,
        [
          principal.userId,
          input.displayName !== undefined,
          input.displayName ?? null,
          input.locale !== undefined,
          input.locale ?? null,
          input.timezone !== undefined,
          input.timezone ?? null,
          input.expectedVersion,
        ],
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `select private.enqueue_outbox_event('profile.updated', 'profile', null, $1::jsonb)`,
        [JSON.stringify(buildProfileUpdatedPayload(
          principal.userId,
          version(row.version),
          changedFields,
        ))],
      );
      return profile(row);
    });
  }

  async getPreferences(principal: ClerkPrincipal): Promise<PreferencesRecord> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<PreferencesRow>(
        `select default_currency, language, theme, calendar, week_start, privacy_settings, version
         from public.user_preferences where user_id = $1`,
        [principal.userId],
      );
      return result.rows[0]
        ? preferences(result.rows[0])
        : {
            defaultCurrency: 'SAR',
            language: 'ar',
            theme: 'system',
            calendar: 'gregorian',
            weekStart: 6,
            privacySettings: {},
            version: 1,
          };
    });
  }

  async replacePreferences(
    principal: ClerkPrincipal,
    input: PreferencesReplaceDto,
  ): Promise<PreferencesRecord | null> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<PreferencesRow>(
        `insert into public.user_preferences (
           user_id, default_currency, language, theme, calendar, week_start, privacy_settings
         )
         select $1, $2, $3, $4, $5, $6, $7::jsonb
         where $8::bigint = 1
            or exists (select 1 from public.user_preferences where user_id = $1)
         on conflict (user_id) do update
         set default_currency = excluded.default_currency,
             language = excluded.language,
             theme = excluded.theme,
             calendar = excluded.calendar,
             week_start = excluded.week_start,
             privacy_settings = excluded.privacy_settings
         where user_preferences.version = $8
         returning default_currency, language, theme, calendar, week_start, privacy_settings, version`,
        [
          principal.userId,
          input.defaultCurrency,
          input.language,
          input.theme,
          input.calendar,
          input.weekStart,
          JSON.stringify(input.privacySettings),
          input.expectedVersion,
        ],
      );
      return result.rows[0] ? preferences(result.rows[0]) : null;
    });
  }

  async getOnboarding(principal: ClerkPrincipal): Promise<OnboardingRecord> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<OnboardingRow>(
        `select step, completed_steps, completed_at, version
         from public.onboarding_progress where user_id = $1`,
        [principal.userId],
      );
      return result.rows[0]
        ? onboarding(result.rows[0])
        : { step: 'welcome', completedSteps: [], completedAt: null, version: 1 };
    });
  }

  async replaceOnboarding(
    principal: ClerkPrincipal,
    input: OnboardingReplaceDto,
  ): Promise<OnboardingRecord | null> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<OnboardingRow>(
        `with changed as (
           insert into public.onboarding_progress (user_id, step, completed_steps, completed_at)
           select $1, $2, $3::text[], case when $4::boolean then now() else null end
           where $5::bigint = 1
              or exists (select 1 from public.onboarding_progress where user_id = $1)
           on conflict (user_id) do update
           set step = excluded.step,
               completed_steps = excluded.completed_steps,
               completed_at = case
                 when $4::boolean then coalesce(onboarding_progress.completed_at, now())
                 else null
               end
           where onboarding_progress.version = $5
             and (
               onboarding_progress.step is distinct from excluded.step
               or onboarding_progress.completed_steps is distinct from excluded.completed_steps
               or (onboarding_progress.completed_at is not null) <> $4::boolean
             )
           returning step, completed_steps, completed_at, version
         )
         select * from changed
         union all
         select step, completed_steps, completed_at, version
         from public.onboarding_progress
         where user_id = $1
           and version = $5
           and step = $2
           and completed_steps = $3::text[]
           and (completed_at is not null) = $4::boolean
           and not exists (select 1 from changed)
         limit 1`,
        [
          principal.userId,
          input.step,
          input.completedSteps,
          input.complete,
          input.expectedVersion,
        ],
      );
      return result.rows[0] ? onboarding(result.rows[0]) : null;
    });
  }

  async listDevices(
    principal: ClerkPrincipal,
    cursor: { lastSeenAt: Date; id: string } | null,
    limit: number,
  ): Promise<DeviceRecord[]> {
    return this.withCustomerTransaction(principal, async (client) => {
      const result = await client.query<DeviceRow>(
        `select id, platform, app_version, device_name, trusted_at, last_seen_at,
                revoked_at, clerk_session_id, created_at, version
         from public.user_devices
         where user_id = $1
           and ($2::timestamptz is null or (last_seen_at, id) < ($2, $3::uuid))
         order by last_seen_at desc, id desc
         limit $4`,
        [principal.userId, cursor?.lastSeenAt ?? null, cursor?.id ?? null, limit + 1],
      );
      return result.rows.map(device);
    });
  }

  async registerDevice(
    principal: ClerkPrincipal,
    input: DeviceRegistrationDto,
  ): Promise<DeviceRegistrationRecord> {
    const protection = this.requirePushCrypto();
    const fingerprint = protection.fingerprint(input.deviceFingerprint);
    return this.withCustomerTransaction(principal, async (client) => {
      const existing = await client.query<{ revoked_at: Date | null; clerk_session_id: string | null }>(
        `select revoked_at, clerk_session_id from public.user_devices
         where user_id = $1 and device_fingerprint = $2 for update`,
        [principal.userId, fingerprint],
      );
      const prior = existing.rows[0];
      const result = await client.query<DeviceRow>(
        `insert into public.user_devices (
           user_id, device_fingerprint, clerk_session_id, platform, app_version, device_name
         ) values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, device_fingerprint) do update
         set clerk_session_id = excluded.clerk_session_id,
             platform = excluded.platform,
             app_version = excluded.app_version,
             device_name = excluded.device_name,
             last_seen_at = now(),
             revoked_at = null
         where user_devices.revoked_at is null
            or user_devices.clerk_session_id is distinct from excluded.clerk_session_id
         returning id, platform, app_version, device_name, trusted_at, last_seen_at,
                   revoked_at, clerk_session_id, created_at, version, (xmax = 0) as created`,
        [
          principal.userId,
          fingerprint,
          principal.sessionId,
          input.platform,
          input.appVersion,
          input.deviceName ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('PUSH_TOKEN_CONFLICT');
      const record = device(row);
      const registrationResult = row.created
        ? 'created'
        : prior?.revoked_at
          ? 'reactivated_with_fresh_session'
          : 'refreshed';

      if (input.pushToken && input.pushProvider) {
        const tokenHash = protection.tokenHash(input.pushToken);
        const tokenCiphertext = protection.encrypt(input.pushToken, {
          provider: input.pushProvider,
          userId: principal.userId,
          deviceId: record.id,
        });
        await client.query(
          `update public.push_tokens set revoked_at = now()
           where user_id = $1 and device_id = $2 and provider = $3
             and token_hash <> $4 and revoked_at is null`,
          [principal.userId, record.id, input.pushProvider, tokenHash],
        );
        let push = await client.query<{ id: string }>(
          `insert into public.push_tokens (
             user_id, device_id, token_hash, token_ciphertext, provider, revoked_at
           ) values ($1, $2, $3, $4, $5, null)
           on conflict (provider, token_hash) do nothing
           returning id`,
          [principal.userId, record.id, tokenHash, tokenCiphertext, input.pushProvider],
        );
        if (push.rowCount === 0) {
          push = await client.query<{ id: string }>(
            `update public.push_tokens
             set device_id = $2, token_ciphertext = $4, revoked_at = null
             where user_id = $1 and token_hash = $3 and provider = $5
             returning id`,
            [principal.userId, record.id, tokenHash, tokenCiphertext, input.pushProvider],
          );
        }
        if (push.rowCount !== 1) throw new Error('PUSH_TOKEN_CONFLICT');
      }

      await client.query(
        `select private.enqueue_outbox_event('device.registered', 'device', $1::uuid, $2::jsonb)`,
        [record.id, JSON.stringify(buildDeviceRegisteredPayload(
          principal.userId,
          record.id,
          record.platform,
          record.version,
          registrationResult,
        ))],
      );
      return { device: record, created: row.created === true, registrationResult };
    });
  }

  async revokeDevice(
    principal: ClerkPrincipal,
    deviceId: string,
    recentAuth: boolean,
  ): Promise<DeviceRevokeRecord> {
    return this.withCustomerTransaction(principal, async (client) => {
      const selected = await client.query<DeviceRow>(
        `select id, platform, app_version, device_name, trusted_at, last_seen_at,
                revoked_at, clerk_session_id, created_at, version
         from public.user_devices where id = $1 and user_id = $2 for update`,
        [deviceId, principal.userId],
      );
      const current = selected.rows[0];
      if (!current) return { status: 'not_found' };
      if (
        current.revoked_at === null &&
        current.clerk_session_id === principal.sessionId &&
        !recentAuth
      ) {
        throw new Error('RECENT_AUTH_REQUIRED');
      }
      let record = device(current);
      if (current.revoked_at === null) {
        const revoked = await client.query<DeviceRow>(
          `update public.user_devices set revoked_at = now()
           where id = $1 and user_id = $2 and revoked_at is null
           returning id, platform, app_version, device_name, trusted_at, last_seen_at,
                     revoked_at, clerk_session_id, created_at, version`,
          [deviceId, principal.userId],
        );
        const row = revoked.rows[0];
        if (!row || !row.revoked_at) throw new Error('DEVICE_REVOKE_FAILED');
        record = device(row);
        const revokedAt = record.revokedAt;
        if (!revokedAt) throw new Error('DEVICE_REVOKE_FAILED');
        await client.query(
          `update public.push_tokens set revoked_at = coalesce(revoked_at, now())
           where user_id = $1 and device_id = $2 and revoked_at is null`,
          [principal.userId, deviceId],
        );
        await client.query(
          `select private.enqueue_outbox_event('device.revoked', 'device', $1::uuid, $2::jsonb)`,
          [deviceId, JSON.stringify(buildDeviceRevokedPayload(
            principal.userId,
            deviceId,
            record.version,
            revokedAt,
            record.clerkSessionId ? 'pending' : 'not_linked',
          ))],
        );
      }
      return { status: 'revoked', device: record, sessionId: record.clerkSessionId };
    });
  }

  async completeSessionRevoke(
    principal: ClerkPrincipal,
    deviceId: string,
    sessionId: string,
  ): Promise<void> {
    await this.withCustomerTransaction(principal, async (client) => {
      await client.query(
        `update public.user_devices set clerk_session_id = null
         where id = $1 and user_id = $2 and revoked_at is not null and clerk_session_id = $3`,
        [deviceId, principal.userId, sessionId],
      );
    });
  }

  private requirePushCrypto(): PushTokenCrypto {
    if (!this.pushCrypto) throw new Error('PUSH_CRYPTO_UNAVAILABLE');
    return this.pushCrypto;
  }
}
