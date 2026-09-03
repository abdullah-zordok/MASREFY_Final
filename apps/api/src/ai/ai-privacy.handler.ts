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
import { AiStorage } from './ai.storage';

@Injectable()
export class AiPrivacyHandler implements PrivacyDomainHandler {
  readonly resourceType = 'ai';
  readonly schemaVersion = 1 as const;
  constructor(
    private readonly pool: PoolService,
    private readonly storage: AiStorage,
  ) {}

  async *export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry> {
    await Promise.resolve();
    for (const kind of [
      'voice_sessions',
      'voice_transcripts',
      'voice_proposals',
      'voice_proposal_fields',
      'voice_category_preferences',
      'assistant_consents',
      'conversations',
      'messages',
      'assistant_snapshots',
      'assistant_previews',
      'assistant_feedback',
      'response_reports',
    ])
      yield {
        path: `ai/${kind}.ndjson`,
        mediaType: 'application/x-ndjson',
        stream: this.entries(evidence.userId, kind),
      };
  }

  async deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome> {
    const counts = await this.worker(
      async (client) =>
        (
          await client.query<{ result: { deleted?: number; anonymized?: number } }>(
            'select private.ai_owner_data_counts($1) result',
            [evidence.userId],
          )
        ).rows[0]?.result ?? {},
    );
    let after: string | null = null;
    do {
      const refs = await this.worker(
        async (client) =>
          (
            await client.query<{ id: string; storage_ref: string }>(
              'select * from private.read_ai_voice_refs($1,$2::uuid,500)',
              [evidence.userId, after],
            )
          ).rows,
      );
      for (const { storage_ref: ref } of refs) await this.storage.delete(ref);
      const last = refs.at(-1);
      after = refs.length === 500 && last ? last.id : null;
    } while (after);
    let deletedCount = 0,
      changed: number;
    do {
      changed = await this.worker(async (client) =>
        Number(
          (
            await client.query<{ result: string }>(
              'select private.delete_ai_owner_data($1,500) result',
              [evidence.userId],
            )
          ).rows[0]?.result ?? 0,
        ),
      );
      deletedCount += changed;
    } while (changed === 500);
    return {
      deletedCount: counts.deleted ?? deletedCount,
      anonymizedCount: counts.anonymized ?? 0,
      retainedCount: 0,
      policyIds: [],
    };
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
    let afterId: string | null = null;
    do {
      const rows = await this.worker(async (client) =>
        (
          await client.query<{ value: Record<string, unknown> } & QueryResultRow>(
            'select value from private.export_ai_batch($1,$2,$3::timestamptz,$4::uuid,500)',
            [userId, kind, after, afterId],
          )
        ).rows.map(({ value }) => value),
      );
      for (const row of rows) yield Buffer.from(`${JSON.stringify(row)}\n`);
      const createdAt = rows.at(-1)?.created_at;
      const id = rows.at(-1)?.id;
      after =
        rows.length === 500 && typeof createdAt === 'string' && typeof id === 'string'
          ? createdAt
          : null;
      afterId = after ? (id as string) : null;
      if (rows.length < 500) break;
    } while (after);
  }

  private worker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
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
