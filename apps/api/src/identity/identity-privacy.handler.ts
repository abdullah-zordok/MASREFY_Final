import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PoolService } from '../platform/database/pool.service';
import type {
  DeletionOutcome,
  ExportEntry,
  PrivacyDomainHandler,
  PrivacyEvidence,
  RetentionCandidate,
} from '../security/privacy-handlers';
import { ClerkClientService } from './clerk-client.service';

async function *jsonEntry(value: unknown): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(JSON.stringify(value));
}

@Injectable()
export class IdentityPrivacyHandler implements PrivacyDomainHandler {
  readonly resourceType = 'identity';
  readonly schemaVersion = 1 as const;

  constructor(
    private readonly pool: PoolService,
    private readonly clerk: ClerkClientService,
  ) {}

  async *export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry> {
    const snapshot = await this.workerTransaction(async (client) => {
      const [profile, preferences, onboarding, devices] = await Promise.all([
        client.query<Record<string, unknown>>(`select id,primary_email,phone_e164,display_name,locale,timezone,status,created_at,updated_at,version from public.profiles where id=$1`, [evidence.userId]),
        client.query<Record<string, unknown>>('select default_currency,language,theme,calendar,week_start,privacy_settings,version from public.user_preferences where user_id=$1', [evidence.userId]),
        client.query<Record<string, unknown>>('select step,completed_steps,completed_at,version from public.onboarding_progress where user_id=$1', [evidence.userId]),
        client.query<Record<string, unknown>>(`select id,platform,app_version,device_name,trusted_at,last_seen_at,revoked_at,created_at,version
          from public.user_devices where user_id=$1 order by created_at,id limit 1000`, [evidence.userId]),
      ]);
      return { profile: profile.rows[0] ?? null, preferences: preferences.rows[0] ?? null, onboarding: onboarding.rows[0] ?? null, devices: devices.rows };
    });
    yield { path: 'identity/profile.json', mediaType: 'application/json', stream: jsonEntry(snapshot.profile) };
    yield { path: 'identity/preferences.json', mediaType: 'application/json', stream: jsonEntry(snapshot.preferences) };
    yield { path: 'identity/onboarding.json', mediaType: 'application/json', stream: jsonEntry(snapshot.onboarding) };
    yield { path: 'identity/devices.json', mediaType: 'application/json', stream: jsonEntry(snapshot.devices) };
  }

  async deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome> {
    const sessions = await this.workerTransaction(async (client) => {
      const rows = await client.query<{ clerk_session_id: string | null }>('select clerk_session_id from public.user_devices where user_id=$1 and revoked_at is null', [evidence.userId]);
      return rows.rows.flatMap(({ clerk_session_id }) => clerk_session_id ? [clerk_session_id] : []);
    });
    for (const sessionId of sessions) await this.clerk.revokeSession(sessionId);
    const anonymizedCount = await this.workerTransaction(async (client) => {
      await client.query('update public.push_tokens set revoked_at=clock_timestamp() where user_id=$1 and revoked_at is null', [evidence.userId]);
      await client.query(`update public.user_devices set revoked_at=coalesce(revoked_at,clock_timestamp()),clerk_session_id=null
        where user_id=$1 and (revoked_at is null or clerk_session_id is not null)`, [evidence.userId]);
      const profile = await client.query(`update public.profiles set primary_email=null,phone_e164=null,display_name=null,status='deleted'
        where id=$1 and status<>'deleted' returning id`, [evidence.userId]);
      return profile.rowCount ?? 0;
    });
    return { deletedCount: 0, anonymizedCount, retainedCount: 0, policyIds: [] };
  }

  async listRetentionCandidates(
    before: Date,
    cursor: string | null,
    limit: number,
  ): Promise<{ items: readonly RetentionCandidate[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('RETENTION_LIMIT_INVALID');
    return this.workerTransaction(async (client) => {
      const rows = await client.query<{ id: string; updated_at: Date; version: string }>(`select id,updated_at,version from public.profiles
        where status='deleted' and updated_at<$1 and ($2::text is null or id>$2) order by id limit $3`, [before, cursor, limit + 1]);
      const selected = rows.rows.slice(0, limit);
      return {
        items: selected.map((row) => ({ resourceId: row.id, eligibleAt: row.updated_at, version: Number(row.version) })),
        nextCursor: rows.rows.length > limit ? selected.at(-1)?.id ?? null : null,
      };
    });
  }

  async applyRetention(
    candidate: RetentionCandidate,
    mode: 'delete' | 'anonymize' | 'archive',
    _evidence: PrivacyEvidence,
  ): Promise<DeletionOutcome> {
    void _evidence;
    if (mode === 'archive') return { deletedCount: 0, anonymizedCount: 0, retainedCount: 1, policyIds: [] };
    const affected = await this.workerTransaction(async (client) => {
      const result = await client.query(`update public.profiles set primary_email=null,phone_e164=null,display_name=null
        where id=$1 and version=$2 and status='deleted' returning id`, [candidate.resourceId, candidate.version]);
      return result.rowCount ?? 0;
    });
    return { deletedCount: 0, anonymizedCount: affected, retainedCount: 0, policyIds: [] };
  }

  private async workerTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const value = await action(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }
}
