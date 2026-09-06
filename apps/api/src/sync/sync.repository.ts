import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { PoolService } from '../platform/database/pool.service';
import type { SyncMutation } from './sync.types';
import type { SyncDomain } from './sync.types';

interface MutationReceiptRow extends QueryResultRow {
  outcome: 'received' | 'replay' | 'hash_mismatch';
  mutation_id: string;
  status: 'received' | 'processing' | 'applied' | 'conflict' | 'rejected';
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

interface BatchClaimRow extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  retry_after_seconds: number | null;
  lease_token: string | null;
}

export interface BatchClaim {
  outcome: BatchClaimRow['outcome'];
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
  leaseToken: string | null;
}

export interface BatchCompletion {
  keyHash: string;
  requestHash: string;
  leaseToken: string;
}

export interface BootstrapDomain {
  domain: SyncDomain;
  position: bigint;
  items: Array<{ id: string; snapshot: Record<string, unknown> }>;
  hasMore: boolean;
}

export interface DeltaChange {
  position: bigint;
  resourceId: string;
  resourceType: string;
  operation: 'upsert' | 'delete';
  version: number;
  snapshot: Record<string, unknown> | null;
  deletedAt: string | null;
}

export interface DeltaPage {
  oldest: bigint;
  current: bigint;
  changes: DeltaChange[];
}

interface ConflictRow extends QueryResultRow {
  id: string;
  transaction_id: string;
  client_mutation_id: string;
  server_version: string;
  client_version: string;
  conflict_fields: string[];
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  status: 'open' | 'resolved' | 'rejected';
  resolution: 'server' | 'client' | 'merged' | 'duplicate' | null;
  resolution_payload: Record<string, unknown> | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface ConflictRecord {
  id: string;
  transactionId: string;
  clientMutationId: string;
  serverVersion: number;
  clientVersion: number;
  conflictFields: string[];
  serverSnapshot: Record<string, unknown>;
  clientSnapshot: Record<string, unknown>;
  status: ConflictRow['status'];
  resolution: ConflictRow['resolution'];
  resolutionPayload: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ClaimedMutationRow extends QueryResultRow {
  id: string;
  user_id: string;
  device_id: string;
  factor_age_seconds: number | null;
  operation_id: string;
  domain: SyncDomain;
  resource_type: SyncMutation['resourceType'];
  schema_version: 1;
  depends_on: string[];
  operation: SyncMutation['operation'];
  resource_id: string | null;
  base_version: string | null;
  payload: Record<string, unknown>;
  attempt_count: number;
  lease_token: string;
}

export interface ClaimedMutation {
  id: string;
  userId: string;
  deviceId: string;
  factorAgeSeconds: number | null;
  mutation: SyncMutation;
  attemptCount: number;
  leaseToken: string;
}

export interface MutationReceipt {
  outcome: MutationReceiptRow['outcome'];
  mutationId: string;
  status: MutationReceiptRow['status'];
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

@Injectable()
export class SyncRepository {
  constructor(private readonly pool: PoolService) {}

  private transaction<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
    readOnlyRepeatable = false,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query(
        readOnlyRepeatable ? 'begin isolation level repeatable read read only' : 'begin',
      );
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            role: 'authenticated',
            sub: principal.userId,
            sid: principal.sessionId,
          }),
        ]);
        await client.query('set local role masarifi_api');
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  assertActiveDevice(principal: ClerkPrincipal, deviceId: string): Promise<void> {
    return this.transaction(principal, async (client) => {
      await client.query('select private.assert_active_sync_device($1,$2)', [
        principal.userId,
        deviceId,
      ]);
    });
  }

  recordIssuedCursor(
    principal: ClerkPrincipal,
    deviceId: string,
    domain: SyncDomain,
    position: bigint,
  ): Promise<void> {
    return this.transaction(principal, async (client) => {
      await client.query('select private.record_sync_cursor_issued($1,$2,$3,$4)', [
        principal.userId,
        deviceId,
        domain,
        position.toString(),
      ]);
    });
  }

  async claimBatch(
    principal: ClerkPrincipal,
    keyHash: string,
    requestHash: string,
    leaseSeconds: number,
  ): Promise<BatchClaim> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<BatchClaimRow>(
          `select * from private.claim_sync_idempotency_key(
            $1,'sync.mutations',$2,$3,$4::interval
          )`,
          [principal.userId, keyHash, requestHash, `${String(leaseSeconds)} seconds`],
        )
      ).rows[0];
      if (!row) throw new Error('SYNC_IDEMPOTENCY_UNAVAILABLE');
      return {
        outcome: row.outcome,
        responseStatus: row.response_status,
        responseBody: row.response_body,
        retryAfterSeconds: row.retry_after_seconds,
        leaseToken: row.lease_token,
      };
    });
  }

  completeBatch(
    principal: ClerkPrincipal,
    completion: BatchCompletion,
    status: number,
    body: Record<string, unknown>,
  ): Promise<void> {
    return this.transaction(principal, async (client) => {
      await client.query(
        `select private.complete_sync_idempotency_key(
          $1,'sync.mutations',$2,$3,$4,$5,$6::jsonb,null
        )`,
        [
          principal.userId,
          completion.keyHash,
          completion.requestHash,
          completion.leaseToken,
          status,
          JSON.stringify(body),
        ],
      );
    });
  }

  async receiveMutation(
    principal: ClerkPrincipal,
    deviceId: string,
    mutation: SyncMutation,
    payloadHash: string,
  ): Promise<MutationReceipt> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<MutationReceiptRow>(
          `select * from private.receive_client_mutation(
            $1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10,$11,$12,$13::jsonb
          )`,
          [
            principal.userId,
            deviceId,
            principal.factorAgeSeconds,
            mutation.operationId,
            mutation.domain,
            mutation.resourceType,
            mutation.schemaVersion,
            mutation.dependsOn,
            mutation.operation,
            mutation.resourceId,
            mutation.baseVersion,
            payloadHash,
            JSON.stringify(mutation.payload),
          ],
        )
      ).rows[0];
      if (!row) throw new Error('SYNC_RECEIPT_UNAVAILABLE');
      return {
        outcome: row.outcome,
        mutationId: row.mutation_id,
        status: row.status,
        result: row.result,
        error: row.error,
      };
    });
  }

  bootstrap(
    principal: ClerkPrincipal,
    domains: SyncDomain[],
    after: string | null,
    limit: number,
    boundary: bigint | null,
  ): Promise<BootstrapDomain[]> {
    return this.transaction(
      principal,
      async (client) => {
        const result: BootstrapDomain[] = [];
        for (const domain of domains) {
          const table = domain;
          const owner = domain === 'categories' ? '(user_id=$1 or user_id is null)' : 'user_id=$1';
          const snapshot =
            domain === 'transactions'
              ? `jsonb_build_object(
                'id',source.id,'kind',source.kind,'status',source.status,
                'amount_minor',source.amount_minor,'fee_minor',source.fee_minor,
                'currency_code',source.currency_code,'category_id',source.category_id,
                'title',source.title,'merchant',source.merchant,
                'payment_method',source.payment_method,'note',source.note,
                'occurred_at',source.occurred_at,'source',source.source,
                'reverses_transaction_id',source.reverses_transaction_id,
                'deleted_at',source.deleted_at,'undo_expires_at',source.undo_expires_at,
                'created_at',source.created_at,'updated_at',source.updated_at,
                'version',source.version,'postings',coalesce((
                select jsonb_agg(jsonb_build_object(
                  'account_id',p.account_id,'amount_minor',p.amount_minor,
                  'clearing_state',p.clearing_state,'posting_role',p.posting_role,
                  'occurred_at',p.occurred_at
                ) order by p.posting_role,p.id)
                from public.transaction_postings p where p.transaction_id=source.id
              ),'[]'::jsonb))`
              : domain === 'accounts'
                ? `jsonb_build_object(
                  'id',source.id,'name',source.name,'type',source.type,
                  'currency_code',source.currency_code,
                  'institution_name',source.institution_name,'last_four',source.last_four,
                  'credit_limit_minor',source.credit_limit_minor,'is_default',source.is_default,
                  'icon_key',source.icon_key,'color_key',source.color_key,'notes',source.notes,
                  'status',source.status,'sort_order',source.sort_order,
                  'include_in_totals',source.include_in_totals,'opened_at',source.opened_at,
                  'automatic_tracking_enabled',source.automatic_tracking_enabled,
                  'statement_day',source.statement_day,
                  'payment_due_day',source.payment_due_day,
                  'monthly_interest_rate_basis_points',source.monthly_interest_rate_basis_points,
                  'minimum_payment_minor',source.minimum_payment_minor,
                  'closed_at',source.closed_at,'deleted_at',source.deleted_at,
                  'created_at',source.created_at,'updated_at',source.updated_at,
                  'version',source.version)`
                : `jsonb_build_object(
                  'id',source.id,'parent_id',source.parent_id,
                  'merged_into_id',source.merged_into_id,'kind',source.kind,
                  'label_ar',source.label_ar,'label_en',source.label_en,
                  'icon',source.icon,'color',source.color,'system_key',source.system_key,
                  'sort_order',source.sort_order,'active',source.active,
                  'deleted_at',source.deleted_at,'created_at',source.created_at,
                  'updated_at',source.updated_at,'version',source.version)`;
          const cursor =
            boundary ??
            BigInt(
              (
                await client.query<{ current_cursor: string }>(
                  'select * from private.get_sync_bounds($1,$2)',
                  [principal.userId, domain],
                )
              ).rows[0]?.current_cursor ?? '0',
            );
          const items = await client.query<{ id: string; snapshot: Record<string, unknown> }>(
            `select source.id::text id,${snapshot} snapshot from public.${table} source
           where ${owner} and ($2::uuid is null or source.id>$2::uuid)
           order by source.id limit $3`,
            [principal.userId, after, limit + 1],
          );
          result.push({
            domain,
            position: cursor,
            items: items.rows.slice(0, limit),
            hasMore: items.rows.length > limit,
          });
        }
        return result;
      },
      true,
    );
  }

  delta(
    principal: ClerkPrincipal,
    domain: SyncDomain,
    position: bigint,
    limit: number,
  ): Promise<DeltaPage> {
    return this.transaction(
      principal,
      async (client) => {
        const bounds = await client.query<{ oldest: string; current_cursor: string }>(
          'select * from private.get_sync_bounds($1,$2)',
          [principal.userId, domain],
        );
        const changes = await client.query<{
          position: string;
          resource_id: string;
          resource_type: string;
          operation: 'upsert' | 'delete';
          resource_version: string;
          snapshot: Record<string, unknown> | null;
          deleted_at: Date | string | null;
        }>('select * from private.get_sync_delta($1,$2,$3,$4)', [
          principal.userId,
          domain,
          position.toString(),
          limit + 1,
        ]);
        return {
          oldest: BigInt(bounds.rows[0]?.oldest ?? '0'),
          current: BigInt(bounds.rows[0]?.current_cursor ?? '0'),
          changes: changes.rows.map((row) => ({
            position: BigInt(row.position),
            resourceId: row.resource_id,
            resourceType: row.resource_type,
            operation: row.operation,
            version: Number(row.resource_version),
            snapshot: row.snapshot,
            deletedAt:
              row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
          })),
        };
      },
      true,
    );
  }

  acknowledge(
    principal: ClerkPrincipal,
    deviceId: string,
    domain: SyncDomain,
    position: bigint,
    lastMutationId: string | null,
  ): Promise<{ position: bigint; acknowledgedAt: string }> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<{ last_cursor: string; last_synced_at: Date }>(
          'select * from private.ack_client_sync_cursor($1,$2,$3,$4,$5)',
          [principal.userId, deviceId, domain, position.toString(), lastMutationId],
        )
      ).rows[0];
      if (!row) throw new Error('SYNC_ACK_UNAVAILABLE');
      return {
        position: BigInt(row.last_cursor),
        acknowledgedAt: row.last_synced_at.toISOString(),
      };
    });
  }

  listConflicts(
    principal: ClerkPrincipal,
    status: ConflictRow['status'],
    after: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<ConflictRecord[]> {
    return this.transaction(principal, async (client) => {
      const rows = await client.query<ConflictRow>(
        `select * from public.transaction_conflicts
         where user_id=$1 and status=$2
           and ($3::timestamptz is null or (created_at,id)>($3,$4::uuid))
         order by created_at,id limit $5`,
        [principal.userId, status, after?.createdAt ?? null, after?.id ?? null, limit + 1],
      );
      return rows.rows.map((row) => this.conflict(row));
    });
  }

  getConflict(principal: ClerkPrincipal, conflictId: string): Promise<ConflictRecord | null> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<ConflictRow>(
          'select * from public.transaction_conflicts where user_id=$1 and id=$2',
          [principal.userId, conflictId],
        )
      ).rows[0];
      return row ? this.conflict(row) : null;
    });
  }

  resolveConflict(
    principal: ClerkPrincipal,
    conflictId: string,
    resolution: NonNullable<ConflictRow['resolution']>,
    payload: Record<string, unknown> | null,
    requestId: string,
    keyHash: string,
    requestHash: string,
  ): Promise<ConflictRecord> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<ConflictRow>(
          'select (private.resolve_transaction_conflict($1,$2,$3,$4::jsonb,$5,$6,$7)).*',
          [
            principal.userId,
            conflictId,
            resolution,
            payload ? JSON.stringify(payload) : null,
            requestId,
            keyHash,
            requestHash,
          ],
        )
      ).rows[0];
      if (!row) throw new Error('SYNC_CONFLICT_UNAVAILABLE');
      return this.conflict(row);
    });
  }

  createConflict(
    userId: string,
    input: {
      mutationId: string;
      transactionId: string;
      serverVersion: number;
      clientVersion: number;
      fields: string[];
      serverSnapshot: Record<string, unknown>;
      clientSnapshot: Record<string, unknown>;
    },
    leaseToken: string,
  ): Promise<ConflictRecord> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const row = (
          await client.query<ConflictRow>(
            `select (private.create_transaction_conflict(
              $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb
            )).*`,
            [
              userId,
              input.mutationId,
              input.transactionId,
              input.serverVersion,
              input.clientVersion,
              input.fields,
              JSON.stringify(input.serverSnapshot),
              JSON.stringify(input.clientSnapshot),
            ],
          )
        ).rows[0];
        if (!row) throw new Error('SYNC_CONFLICT_UNAVAILABLE');
        await client.query(
          "select private.complete_client_mutation($1,$2,'conflict',$3::jsonb,null)",
          [input.mutationId, leaseToken, JSON.stringify({ conflictId: row.id })],
        );
        await client.query('commit');
        return this.conflict(row);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async claimMutations(
    workerId: string,
    limit: number,
    leaseSeconds: number,
  ): Promise<ClaimedMutation[]> {
    const rows = await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        const result = await client.query<ClaimedMutationRow>(
          'select * from private.claim_client_mutations($1,$2,$3)',
          [workerId, limit, leaseSeconds],
        );
        await client.query('commit');
        return result.rows;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      factorAgeSeconds: row.factor_age_seconds,
      mutation: {
        operationId: row.operation_id,
        domain: row.domain,
        resourceType: row.resource_type,
        schemaVersion: row.schema_version,
        dependsOn: row.depends_on,
        operation: row.operation,
        resourceId: row.resource_id,
        baseVersion: row.base_version === null ? null : Number(row.base_version),
        payload: row.payload,
      },
      attemptCount: row.attempt_count,
      leaseToken: row.lease_token,
    }));
  }

  workerComplete(
    mutationId: string,
    leaseToken: string,
    status: 'applied' | 'conflict' | 'rejected',
    result: Record<string, unknown> | null,
    error: Record<string, unknown> | null,
  ): Promise<void> {
    return this.workerQuery(
      'select private.complete_client_mutation($1,$2,$3,$4::jsonb,$5::jsonb)',
      [
        mutationId,
        leaseToken,
        status,
        result ? JSON.stringify(result) : null,
        error ? JSON.stringify(error) : null,
      ],
    );
  }

  retryMutation(
    mutationId: string,
    leaseToken: string,
    nextAttemptAt: Date,
    errorCode: string,
  ): Promise<void> {
    return this.workerQuery('select private.retry_client_mutation($1,$2,$3,$4)', [
      mutationId,
      leaseToken,
      nextAttemptAt,
      errorCode,
    ]);
  }

  async conflictTarget(
    principal: ClerkPrincipal,
    transactionId: string,
  ): Promise<{ version: number; snapshot: Record<string, unknown> } | null> {
    return this.transaction(principal, async (client) => {
      const row = (
        await client.query<{ version: string; snapshot: Record<string, unknown> }>(
          `select version::text,jsonb_build_object(
            'id',t.id,'kind',t.kind,'status',t.status,
            'amount_minor',t.amount_minor,'fee_minor',t.fee_minor,
            'currency_code',t.currency_code,'category_id',t.category_id,
            'title',t.title,'merchant',t.merchant,'payment_method',t.payment_method,
            'note',t.note,'occurred_at',t.occurred_at,'source',t.source,
            'reverses_transaction_id',t.reverses_transaction_id,
            'deleted_at',t.deleted_at,'undo_expires_at',t.undo_expires_at,
            'created_at',t.created_at,'updated_at',t.updated_at,'version',t.version
          ) snapshot from public.transactions t where id=$1 and user_id=$2`,
          [transactionId, principal.userId],
        )
      ).rows[0];
      return row ? { version: Number(row.version), snapshot: row.snapshot } : null;
    });
  }

  async runMaintenance(
    job: 'idempotency.cleanup' | 'sync-state.cleanup' | 'conflicts.expire',
    retentionDays: number,
  ): Promise<number> {
    let affected = 0;
    await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        affected =
          (
            await client.query<{ affected: number }>(
              'select private.run_sync_maintenance($1,$2) affected',
              [job, retentionDays],
            )
          ).rows[0]?.affected ?? 0;
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
    return affected;
  }

  private async workerQuery(sql: string, values: unknown[]): Promise<void> {
    await this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_worker');
        await client.query(sql, values);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private conflict(row: ConflictRow): ConflictRecord {
    return {
      id: row.id,
      transactionId: row.transaction_id,
      clientMutationId: row.client_mutation_id,
      serverVersion: Number(row.server_version),
      clientVersion: Number(row.client_version),
      conflictFields: row.conflict_fields,
      serverSnapshot: row.server_snapshot,
      clientSnapshot: row.client_snapshot,
      status: row.status,
      resolution: row.resolution,
      resolutionPayload: row.resolution_payload,
      createdAt: row.created_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }
}
