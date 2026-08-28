import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PoolService } from '../database/pool.service';
import type { OutboxEnvelopeRow } from './event-envelope';

interface DatabaseOutboxRow {
  id: string;
  created_at: Date;
  aggregate_type: string;
  aggregate_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly database: PoolService) {}

  async claim(workerId: string, limit: number, leaseSeconds: number): Promise<OutboxEnvelopeRow[]> {
    const result = await this.withWorkerTransaction((client) =>
      client.query<DatabaseOutboxRow>('select * from private.claim_outbox_batch($1, $2, $3)', [
        workerId,
        limit,
        leaseSeconds,
      ]),
    );
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      attemptCount: row.attempt_count,
    }));
  }

  async complete(eventId: string, workerId: string): Promise<boolean> {
    const result = await this.withWorkerTransaction((client) =>
      client.query<{ id: string }>(
        `update private.outbox_events
         set published_at = now(), locked_by = null, locked_until = null, last_error_code = null
         where id = $1 and locked_by = $2 and published_at is null
         returning id`,
        [eventId, workerId],
      ),
    );
    return result.rowCount === 1;
  }

  async fail(
    eventId: string,
    workerId: string,
    attemptCount: number,
    errorCode: string,
    availableAt: Date,
  ): Promise<boolean> {
    const result = await this.withWorkerTransaction((client) =>
      client.query<{ id: string }>(
        `update private.outbox_events
         set attempt_count = $3, last_error_code = $4, available_at = $5,
             locked_by = null, locked_until = null
         where id = $1 and locked_by = $2 and published_at is null
         returning id`,
        [eventId, workerId, attemptCount, errorCode, availableAt],
      ),
    );
    return result.rowCount === 1;
  }

  private async withWorkerTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.withClient(async (client) => {
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
}
