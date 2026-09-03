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
import { TrackingStorage } from './tracking.storage';

@Injectable()
export class TrackingPrivacyHandler implements PrivacyDomainHandler {
  readonly resourceType = 'tracking';
  readonly schemaVersion = 1 as const;
  constructor(
    private readonly pool: PoolService,
    private readonly storage: TrackingStorage,
  ) {}

  async *export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry> {
    await Promise.resolve();
    for (const resource of [
      'preferences',
      'keyword-rules',
      'sender-rules',
      'sessions',
      'items',
      'reviews',
      'duplicates',
      'history',
      'feedback',
    ]) {
      yield {
        path: `tracking/${resource}.ndjson`,
        mediaType: 'application/x-ndjson',
        stream: this.exportResource(evidence.userId, resource),
      };
    }
  }

  async deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome> {
    const refs = await this.worker(async (client) =>
      (
        await client.query<{ read_tracking_raw_refs: string } & QueryResultRow>(
          'select private.read_tracking_raw_refs($1)',
          [evidence.userId],
        )
      ).rows.map((row) => row.read_tracking_raw_refs),
    );
    for (const ref of refs) await this.storage.delete(ref);
    const deletedCount = await this.worker(async (client) =>
      Number(
        (
          await client.query<{ result: string } & QueryResultRow>(
            'select private.delete_tracking_data($1) result',
            [evidence.userId],
          )
        ).rows[0]?.result ?? 0,
      ),
    );
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

  private worker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
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

  private async *exportResource(userId: string, resource: string): AsyncIterable<Uint8Array> {
    let after: string | null = null;
    do {
      const rows = await this.worker(async (client) =>
        (
          await client.query<{ value: Record<string, unknown> } & QueryResultRow>(
            'select private.export_tracking_batch($1,$2,$3::uuid,500) value',
            [userId, resource, after],
          )
        ).rows.map(({ value }) => value),
      );
      for (const row of rows) yield Buffer.from(`${JSON.stringify(row)}\n`);
      const lastId = rows.at(-1)?.id;
      after = rows.length === 500 && typeof lastId === 'string' ? lastId : null;
      if (rows.length < 500) break;
    } while (after);
  }
}
