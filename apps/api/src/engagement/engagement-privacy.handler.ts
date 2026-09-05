import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import { PoolService } from '../platform/database/pool.service';
import type {
  DeletionOutcome,
  ExportEntry,
  PrivacyDomainHandler,
  PrivacyEvidence,
  RetentionCandidate,
} from '../security/privacy-handlers';
import { SupportStorage } from './support.storage';

@Injectable()
export class EngagementPrivacyHandler implements PrivacyDomainHandler {
  readonly resourceType = 'engagement';
  readonly schemaVersion = 1 as const;

  constructor(
    private readonly pool: PoolService,
    private readonly storage: SupportStorage,
  ) {}

  async *export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry> {
    await Promise.resolve();
    for (const kind of [
      'notifications',
      'preferences',
      'tickets',
      'messages',
      'attachments',
      'feedback',
      'abuse_reports',
    ])
      yield {
        path: `engagement/${kind}.ndjson`,
        mediaType: 'application/x-ndjson',
        stream: this.entries(evidence.userId, kind),
      };
  }

  async deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome> {
    let after: string | null = null;
    do {
      const refs = await this.worker(
        async (client) =>
          (
            await client.query<{ id: string; storage_ref: string }>(
              'select * from private.read_engagement_attachment_refs($1,$2::uuid,500)',
              [evidence.userId, after],
            )
          ).rows,
      );
      for (const row of refs) await this.storage.delete(row.storage_ref);
      after = refs.length === 500 ? (refs.at(-1)?.id ?? null) : null;
    } while (after);
    let deletedCount = 0;
    let changed: number;
    do {
      changed = await this.worker(async (client) =>
        Number(
          (
            await client.query<{ result: string }>(
              'select private.delete_engagement_owner_data($1,500) result',
              [evidence.userId],
            )
          ).rows[0]?.result ?? 0,
        ),
      );
      deletedCount += changed;
    } while (changed === 500);
    return { deletedCount, anonymizedCount: 0, retainedCount: 0, policyIds: [] };
  }

  listRetentionCandidates(): Promise<{
    items: readonly RetentionCandidate[];
    nextCursor: string | null;
  }> {
    return Promise.resolve({ items: [], nextCursor: null });
  }

  applyRetention(): Promise<DeletionOutcome> {
    return Promise.resolve({
      deletedCount: 0,
      anonymizedCount: 0,
      retainedCount: 0,
      policyIds: [],
    });
  }

  private async *entries(userId: string, kind: string): AsyncIterable<Uint8Array> {
    let after: string | null = null;
    do {
      const rows = await this.worker(async (client) =>
        (
          await client.query<{ value: Record<string, unknown> } & QueryResultRow>(
            'select private.export_engagement_batch($1,$2,$3::uuid,500) value',
            [userId, kind, after],
          )
        ).rows.map(({ value }) => value),
      );
      for (const row of rows) yield Buffer.from(`${JSON.stringify(row)}\n`);
      const id = rows.at(-1)?.id;
      after = rows.length === 500 && typeof id === 'string' ? id : null;
    } while (after);
  }

  private worker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
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
