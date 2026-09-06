import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { PoolService } from '../platform/database/pool.service';
import type { FlagContext, OperationCommand } from './operations.schemas';
import type { OperationsJobKey } from './job-registry';

@Injectable()
export class OperationsRepository {
  constructor(private readonly pool: PoolService) {}

  read(principal: ClerkPrincipal, kind: string, query: unknown): Promise<unknown> {
    return this.asApi(principal, async (client) => {
      const result = await client.query<{ value: unknown }>(
        'select private.read_operations($1,$2::jsonb) value',
        [kind, JSON.stringify(query)],
      );
      return result.rows[0]?.value;
    });
  }

  jobAction(
    principal: ClerkPrincipal,
    input: {
      runId: string;
      action: 'retry' | 'cancel';
      expectedVersion: number;
      reason: string;
      requestId: string;
      idempotencyHash: string;
    },
  ): Promise<unknown> {
    return this.asApi(principal, async (client) => {
      const result = await client.query<{ value: unknown }>(
        'select private.request_job_action($1::uuid,$2,$3::bigint,$4,$5,$6,$7) value',
        [
          input.runId,
          input.action,
          input.expectedVersion,
          principal.userId,
          input.reason,
          input.requestId,
          input.idempotencyHash,
        ],
      );
      return result.rows[0]?.value;
    });
  }

  evaluateFlag(principal: ClerkPrincipal, key: string, context: FlagContext): Promise<unknown> {
    return this.asApi(principal, async (client) => {
      const result = await client.query<{ value: unknown }>(
        'select private.evaluate_feature_flag($1,$2::jsonb) value',
        [key, JSON.stringify(context)],
      );
      return result.rows[0]?.value;
    });
  }

  command(
    principal: ClerkPrincipal,
    operation: OperationCommand,
    resourceKey: string | null,
    body: Record<string, unknown>,
    requestId: string,
    idempotencyHash: string,
  ): Promise<unknown> {
    return this.asApi(principal, async (client) => {
      const result = await client.query<{ value: unknown }>(
        'select private.execute_operations_command($1,$2,$3::jsonb,$4,$5,$6) value',
        [
          operation,
          resourceKey,
          JSON.stringify(body),
          principal.userId,
          requestId,
          idempotencyHash,
        ],
      );
      return result.rows[0]?.value;
    });
  }

  runOperationsJob(
    jobKey: OperationsJobKey,
  ): Promise<Record<string, string | number | boolean | null>> {
    return this.asWorker(async (client) => {
      const result = await client.query<{
        value: Record<string, string | number | boolean | null>;
      }>('select private.execute_operations_job($1,clock_timestamp()) value', [jobKey]);
      return result.rows[0]?.value ?? { outcome: 'unavailable' };
    });
  }

  claim(workerId: string, limit: number): Promise<Record<string, unknown>[]> {
    return this.asWorker(async (client) => {
      const result = await client.query<{ value: Record<string, unknown> }>(
        'select private.claim_due_jobs($1,$2,clock_timestamp()) value',
        [workerId, limit],
      );
      return result.rows.map((row) => row.value);
    });
  }

  heartbeat(attemptId: string, workerId: string): Promise<void> {
    return this.asWorker(async (client) => {
      await client.query('select private.heartbeat_job_attempt($1::uuid,$2,clock_timestamp())', [
        attemptId,
        workerId,
      ]);
    });
  }

  complete(
    attemptId: string,
    workerId: string,
    outcome: 'succeeded' | 'failed',
    safeErrorCode: string | null,
    summary: Record<string, string | number | boolean | null>,
  ): Promise<unknown> {
    return this.asWorker(async (client) => {
      const result = await client.query<{ value: unknown }>(
        'select private.complete_job_attempt($1::uuid,$2,$3,$4,$5::jsonb,clock_timestamp()) value',
        [attemptId, workerId, outcome, safeErrorCode, JSON.stringify(summary)],
      );
      return result.rows[0]?.value;
    });
  }

  private asApi<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction('masarifi_api', principal, action);
  }

  private asWorker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction('masarifi_worker', null, action);
  }

  private async transaction<T>(
    role: 'masarifi_api' | 'masarifi_worker',
    principal: ClerkPrincipal | null,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify(
            principal
              ? { role: 'authenticated', sub: principal.userId, sid: principal.sessionId }
              : { role: 'worker' },
          ),
        ]);
        await client.query(`set local role ${role}`);
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
