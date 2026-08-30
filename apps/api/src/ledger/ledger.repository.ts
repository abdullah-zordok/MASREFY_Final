import { createHash } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import { PoolService } from '../platform/database/pool.service';
import { LEDGER_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { buildLedgerEvent } from './ledger.events';
import {
  decodeLedgerCursor,
  encodeLedgerCursor,
  normalizeLedgerRead,
  normalizeTransactionId,
} from './ledger.dto';
import { hashIdempotencyKey, hashNormalizedCommand } from './idempotency';
import type { LedgerMutation } from './ledger.service';
import type { ReferenceOperation, ReferenceRepository } from '../reference/reference.repository';

interface Claim extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  retry_after_seconds: number | null;
}
interface CommandResult extends QueryResultRow {
  result: { transactionId: string; version: number; ledgerVersion: number };
}
interface TransactionRow extends QueryResultRow {
  id: string;
  kind: string;
  status: string;
  amount_minor: string;
  fee_minor: string;
  currency: string;
  category_id: string | null;
  title: string;
  merchant: string | null;
  payment_method: string | null;
  note: string | null;
  occurred_at: Date;
  source: string;
  reverses_transaction_id: string | null;
  version: string;
  deleted_at: Date | null;
  undo_expires_at: Date | null;
}
interface PostingRow extends QueryResultRow {
  id: string;
  account_id: string;
  amount_minor: string;
  clearing_state: string;
  posting_role: string;
  occurred_at: Date;
}
interface RevisionRow extends QueryResultRow {
  revision_no: number;
  reason: string;
  created_at: Date;
}
interface BalanceRow extends QueryResultRow {
  account_id: string;
  currency: string;
  confirmed_minor: string;
  pending_minor: string;
  ledger_version: string;
  reconciled_at: Date | null;
}
interface LedgerDetailResponse {
  transaction: {
    transaction: {
      accountIds: string[];
      deletedAt: string | null;
      undoExpiresAt: string | null;
      kind: string;
      occurredAt: string;
    };
    postings: unknown[];
  };
  balances: Array<{
    accountId: string;
    currency: string;
    confirmedMinor: number;
    pendingMinor: number;
    ledgerVersion: number;
    reconciledAt: string | null;
  }>;
  ledgerVersion: number;
  requestId: string;
}
interface ListRow extends TransactionRow {
  account_ids: string[];
  ledger_version: string;
}
interface ReconciliationRow extends QueryResultRow {
  account_id: string;
  ledger_version: string;
  matches: boolean;
  confirmed_minor: string;
  pending_minor: string;
  derived_confirmed_minor: string;
  derived_pending_minor: string;
  projection_age_seconds: string;
}

const digest = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

function domainError(code: string, status: number, currentVersion?: number): HttpException {
  return new HttpException(
    { code, ...(currentVersion === undefined ? {} : { currentVersion }) },
    status,
  );
}

function mapDatabaseError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const pg = error as { code?: string; message?: string; detail?: string; constraint?: string };
  const message = pg.message ?? '';
  if (
    pg.code === '22003' ||
    message.includes('AMOUNT_INVALID') ||
    [
      'account_balances_confirmed_check',
      'account_balances_pending_check',
      'account_balances_available_check',
    ].includes(pg.constraint ?? '')
  )
    return domainError('AMOUNT_OUT_OF_RANGE', 400);
  if (message.includes('ACCOUNT_INVALID')) return domainError('ACCOUNT_NOT_POSTABLE', 409);
  if (message.includes('CURRENCY_MISMATCH')) return domainError('CURRENCY_MISMATCH', 409);
  if (message.includes('CURRENCY_INVALID')) return domainError('INVALID_CURRENCY', 400);
  if (message.includes('CATEGORY_INVALID')) return domainError('CATEGORY_INVALID', 409);
  if (message.includes('TRANSACTION_NOT_FOUND')) return domainError('NOT_FOUND', 404);
  if (message.includes('TRANSACTION_INELIGIBLE'))
    return domainError('TRANSACTION_NOT_EDITABLE', 409);
  if (message.includes('TRANSACTION_HAS_DEPENDENTS'))
    return domainError('TRANSACTION_HAS_DEPENDENTS', 409);
  if (message.includes('REVERSAL_EXISTS')) return domainError('REVERSAL_EXISTS', 409);
  if (message.includes('REFUND_EXCEEDS_AVAILABLE'))
    return domainError('REFUND_EXCEEDS_AVAILABLE', 409);
  if (message.includes('UNDO_EXPIRED')) return domainError('UNDO_EXPIRED', 409);
  if (message.includes('VERSION_CONFLICT')) {
    const currentVersion = Number(pg.detail);
    return domainError(
      'VERSION_CONFLICT',
      409,
      Number.isSafeInteger(currentVersion) && currentVersion >= 1 ? currentVersion : undefined,
    );
  }
  if (pg.code === '22023' || pg.code === '22P02' || pg.code === '23514')
    return domainError('VALIDATION_FAILED', 400);
  if (pg.code === '28000') return domainError('PROFILE_INACTIVE', 403);
  if (pg.code === '42501') return domainError('FORBIDDEN', 403);
  if (
    ['40001', '40P01', '55P03', '57014'].includes(pg.code ?? '') ||
    message === 'DATABASE_QUERY_TIMEOUT'
  )
    return domainError('LEDGER_BUSY', 409);
  return domainError('LEDGER_UNAVAILABLE', 503);
}

function conflictReason(error: unknown, mapped: HttpException): string {
  const code = (error as { code?: string }).code;
  const databaseReasons: Record<string, string> = {
    '40001': 'SERIALIZATION_FAILURE',
    '40P01': 'DEADLOCK',
    '55P03': 'LOCK_TIMEOUT',
    '57014': 'QUERY_TIMEOUT',
  };
  if (code && databaseReasons[code]) return databaseReasons[code];
  const response = mapped.getResponse() as { code?: unknown };
  return typeof response.code === 'string' ? response.code : 'CONFLICT';
}

@Injectable()
export class LedgerRepository {
  constructor(private readonly pool: PoolService) {}

  async replayCompleted(input: LedgerMutation): Promise<Record<string, unknown> | undefined> {
    const startedAt = performance.now();
    let observed = false;
    let outcome = 'failure';
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: input.principal.userId,
              sid: input.principal.sessionId,
            }),
          ]);
          await client.query('set local role masarifi_api');
          const claim = (
            await client.query<Claim>('select * from private.lookup_idempotency_key($1,$2,$3,$4)', [
              input.principal.userId,
              input.scope,
              hashIdempotencyKey(input.idempotencyKey),
              hashNormalizedCommand(input.command),
            ])
          ).rows[0];
          if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
          observed = claim.outcome !== 'new';
          if (observed)
            recordPlatformMetric(LEDGER_METRICS.idempotency, 1, {
              scope: input.scope,
              outcome: claim.outcome,
            });
          if (claim.outcome === 'hash_mismatch') throw domainError('IDEMPOTENCY_KEY_REUSED', 409);
          if (claim.outcome === 'in_progress') throw domainError('IDEMPOTENCY_IN_PROGRESS', 409);
          if (claim.outcome === 'replay') {
            if (!claim.response_body || claim.response_status !== input.status)
              throw domainError('IDEMPOTENCY_REPLAY_UNAVAILABLE', 503);
            await client.query('commit');
            outcome = 'replay';
            recordPlatformMetric(LEDGER_METRICS.idempotencyReplay, 1, { scope: input.scope });
            return claim.response_body;
          }
          await client.query('commit');
          return undefined;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      observed = true;
      const mapped = mapDatabaseError(error);
      if (mapped.getStatus() === 409) {
        recordPlatformMetric(LEDGER_METRICS.conflict, 1, {
          operation: input.operation,
          reason: conflictReason(error, mapped),
        });
      }
      throw mapped;
    } finally {
      if (observed) {
        recordPlatformMetric(LEDGER_METRICS.command, 1, { operation: input.operation, outcome });
        recordPlatformMetric(LEDGER_METRICS.commandDuration, performance.now() - startedAt, {
          operation: input.operation,
        });
      }
    }
  }

  async createAccount(input: ReferenceOperation, reference: ReferenceRepository): Promise<unknown> {
    const operation = 'createAccountOpening';
    const scope = 'reference.account.create';
    const startedAt = performance.now();
    let outcome = 'failure';
    let postingCount = 0;
    let touchedAccountCount = 0;
    let appendStage: string = 'command';
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: input.principal.userId,
              sid: input.principal.sessionId,
            }),
          ]);
          await client.query('set local role masarifi_api');
          const keyHash = hashIdempotencyKey(input.idempotencyKey ?? '');
          const requestHash = hashNormalizedCommand(
            JSON.parse(JSON.stringify(input.body)) as Record<string, unknown>,
          );
          const claim = (
            await client.query<Claim>(
              'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
              [input.principal.userId, scope, keyHash, requestHash, '2 minutes'],
            )
          ).rows[0];
          if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
          recordPlatformMetric(LEDGER_METRICS.idempotency, 1, { scope, outcome: claim.outcome });
          if (claim.outcome === 'hash_mismatch') throw domainError('IDEMPOTENCY_KEY_REUSED', 409);
          if (claim.outcome === 'in_progress') throw domainError('IDEMPOTENCY_IN_PROGRESS', 409);
          if (claim.outcome === 'replay') {
            if (!claim.response_body || claim.response_status !== 201)
              throw domainError('IDEMPOTENCY_REPLAY_UNAVAILABLE', 503);
            await client.query('commit');
            outcome = 'replay';
            recordPlatformMetric(LEDGER_METRICS.idempotencyReplay, 1, { scope });
            return claim.response_body;
          }
          await this.lockOwner(client, input.principal.userId, operation);
          const created = (await reference.createAccountOnClient(client, input)) as {
            account: { id: string };
            openingTransactionId: string | null;
          };
          const opening = Number(input.body.openingBalanceMinor ?? 0);
          const occurredAt = new Date().toISOString();
          const openingResult = (
            await client.query<CommandResult>(
              'select private.post_opening_transaction($1,$2::uuid,$3::bigint,$4,$5::timestamptz,$6) result',
              [
                input.principal.userId,
                created.account.id,
                opening,
                'Opening balance',
                occurredAt,
                'account_opening',
              ],
            )
          ).rows[0]?.result;
          if (!openingResult) throw new Error('LEDGER_RESULT_MISSING');
          postingCount = openingResult.transactionId ? 1 : 0;
          touchedAccountCount = 1;
          const response = JSON.parse(
            JSON.stringify({
              ...created,
              openingTransactionId: openingResult.transactionId,
            }),
          ) as Record<string, unknown>;
          if (openingResult.transactionId) {
            const payload = buildLedgerEvent('transaction.created', {
              transactionId: openingResult.transactionId,
              kind: 'opening',
              accountIds: [created.account.id],
              version: openingResult.version,
              ledgerVersion: openingResult.ledgerVersion,
              occurredAt,
              requestId: input.requestId,
            });
            appendStage = 'audit';
            await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
              input.principal.userId,
              'user',
              'transaction.created',
              'transaction',
              openingResult.transactionId,
              null,
              digest(`${openingResult.transactionId}:${String(openingResult.version)}`),
              null,
              input.requestId,
              JSON.stringify({
                operation,
                version: openingResult.version,
                ledgerVersion: openingResult.ledgerVersion,
              }),
            ]);
            appendStage = 'outbox';
            await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
              'transaction.created',
              'transaction',
              openingResult.transactionId,
              JSON.stringify(payload),
            ]);
            await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
              'balance.changed',
              'transaction',
              openingResult.transactionId,
              JSON.stringify(
                buildLedgerEvent('balance.changed', {
                  transactionId: openingResult.transactionId,
                  accountIds: [created.account.id],
                  ledgerVersion: openingResult.ledgerVersion,
                  requestId: input.requestId,
                }),
              ),
            ]);
          }
          appendStage = 'idempotency';
          await client.query(
            'select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)',
            [
              input.principal.userId,
              scope,
              keyHash,
              requestHash,
              201,
              JSON.stringify(response),
              created.account.id,
            ],
          );
          await client.query('commit');
          outcome = 'success';
          return response;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      if (appendStage !== 'command')
        recordPlatformMetric(LEDGER_METRICS.appendFailure, 1, { dependency: appendStage });
      const mapped = mapDatabaseError(error);
      if (mapped.getStatus() === 409) {
        recordPlatformMetric(LEDGER_METRICS.conflict, 1, {
          operation,
          reason: conflictReason(error, mapped),
        });
      }
      throw mapped;
    } finally {
      recordPlatformMetric(LEDGER_METRICS.command, 1, { operation, outcome });
      recordPlatformMetric(LEDGER_METRICS.commandDuration, performance.now() - startedAt, {
        operation,
      });
      if (outcome === 'success') {
        recordPlatformMetric(LEDGER_METRICS.postingCount, postingCount, { operation });
        recordPlatformMetric(LEDGER_METRICS.touchedAccountCount, touchedAccountCount, {
          operation,
        });
        recordPlatformMetric(LEDGER_METRICS.projectionUpdate, touchedAccountCount, { operation });
      }
    }
  }

  async listTransactions(
    principal: LedgerMutation['principal'],
    query: Record<string, unknown>,
    requestId = 'missing-request-id',
  ): Promise<Record<string, unknown>> {
    const normalized = normalizeLedgerRead(query);
    const cursor = normalized.cursor ? decodeLedgerCursor(normalized.cursor) : null;
    const tsQuery =
      normalized.query
        ?.normalize('NFKC')
        .match(/[\p{L}\p{N}_]+/gu)
        ?.map((token) => `${token}:*`)
        .join(' & ') ?? null;
    if (normalized.query && !tsQuery) throw domainError('VALIDATION_FAILED', 400);
    return this.observeRead('list_transactions', () =>
      this.customerTransaction(principal, async (client) => {
        const rows = (
          await client.query<ListRow>(
            `select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,
          btrim(t.currency_code::text) currency,t.category_id,t.title,t.merchant,t.payment_method,
          t.note,t.occurred_at,t.source,t.reverses_transaction_id,t.version,t.deleted_at,
          t.undo_expires_at,
          private.ledger_account_ids(t.id) account_ids,
          coalesce((select max(b.ledger_version) from public.account_balances b
            join public.accounts a on a.id=b.account_id where a.user_id=$1),0)::text ledger_version
        from public.transactions t
        where t.user_id=$1
          and ($2::uuid is null or exists(select 1 from public.transaction_postings p
            where p.transaction_id=t.id and p.account_id=$2))
          and ($3::uuid is null or t.category_id=$3)
          and ($4::text is null or t.kind=$4)
          and ($5::text is null or t.status=$5)
          and ($6::text is null or t.source=$6)
          and ($7::timestamptz is null or t.occurred_at >= $7)
          and ($8::timestamptz is null or t.occurred_at <= $8)
          and ($9::text is null or to_tsvector('simple',coalesce(t.title,'')||' '||coalesce(t.merchant,''))
            @@ to_tsquery('simple',$9))
          and ($10::timestamptz is null or (t.occurred_at,t.id)<($10,$11::uuid))
        order by t.occurred_at desc,t.id desc limit $12`,
            [
              principal.userId,
              normalized.accountId,
              normalized.categoryId,
              normalized.kind,
              normalized.status,
              normalized.source,
              normalized.from,
              normalized.to,
              tsQuery,
              cursor?.occurredAt ?? null,
              cursor?.id ?? null,
              normalized.limit + 1,
            ],
          )
        ).rows;
        const page = rows.slice(0, normalized.limit);
        const last = page.at(-1);
        return {
          items: page.map((row) => this.mapSummary(row, row.account_ids)),
          nextCursor:
            rows.length > normalized.limit && last
              ? encodeLedgerCursor({ occurredAt: last.occurred_at.toISOString(), id: last.id })
              : null,
          ledgerVersion: Number(rows[0]?.ledger_version ?? 0),
          requestId,
        };
      }),
    );
  }

  async getTransaction(
    principal: LedgerMutation['principal'],
    transactionId: string,
    requestId = 'missing-request-id',
  ): Promise<Record<string, unknown>> {
    const id = normalizeTransactionId(transactionId);
    return this.observeRead('get_transaction', () =>
      this.customerTransaction(principal, async (client) => {
        const row = (
          await client.query<ListRow & { postings: unknown[]; revisions: unknown[] }>(
            `select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,
          btrim(t.currency_code::text) currency,t.category_id,t.title,t.merchant,t.payment_method,
          t.note,t.occurred_at,t.source,t.reverses_transaction_id,t.version,t.deleted_at,
          t.undo_expires_at,
          private.ledger_account_ids(t.id) account_ids,
          coalesce((select max(b.ledger_version) from public.account_balances b
            join public.accounts a on a.id=b.account_id where a.user_id=$2),0)::text ledger_version,
          coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'accountId',p.account_id,
            'amountMinor',p.amount_minor,'clearingState',p.clearing_state,'postingRole',p.posting_role,
            'occurredAt',p.occurred_at) order by p.created_at,p.id)
            from public.transaction_postings p where p.transaction_id=t.id),'[]'::jsonb) postings,
          coalesce((select jsonb_agg(jsonb_build_object('revisionNo',r.revision_no,'reason',r.reason,
            'createdAt',r.created_at) order by r.revision_no)
            from audit.transaction_revisions r where r.transaction_id=t.id),'[]'::jsonb) revisions
        from public.transactions t where t.id=$1 and t.user_id=$2`,
            [id, principal.userId],
          )
        ).rows[0];
        if (!row) throw domainError('NOT_FOUND', 404);
        return {
          transaction: this.mapSummary(row, row.account_ids),
          postings: row.postings,
          revisions: row.revisions,
          ledgerVersion: Number(row.ledger_version),
          requestId,
        };
      }),
    );
  }

  async getAccountSummary(
    principal: LedgerMutation['principal'],
    accountId: string,
    query: Record<string, unknown>,
    requestId = 'missing-request-id',
  ): Promise<Record<string, unknown>> {
    const id = normalizeTransactionId(accountId);
    const normalized = normalizeLedgerRead(query);
    if (
      normalized.cursor ||
      normalized.accountId ||
      normalized.categoryId ||
      normalized.kind ||
      normalized.status ||
      normalized.source ||
      normalized.query ||
      normalized.limit !== 25
    )
      throw domainError('VALIDATION_FAILED', 400);
    return this.observeRead('get_account_summary', () =>
      this.customerTransaction(principal, async (client) => {
        const rows = (
          await client.query<
            ListRow &
              BalanceRow & {
                account_status: string;
                available_minor: string;
                updated_at: Date;
              }
          >(
            `with recent as (
          select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,btrim(t.currency_code::text) currency,
            t.category_id,t.title,t.merchant,t.payment_method,t.note,t.occurred_at,t.source,
            t.reverses_transaction_id,t.version,t.deleted_at,t.undo_expires_at,
            private.ledger_account_ids(t.id) account_ids
          from public.transactions t where t.user_id=$1
            and exists(select 1 from public.transaction_postings p
              where p.transaction_id=t.id and p.account_id=$2)
            and ($3::timestamptz is null or t.occurred_at >= $3)
            and ($4::timestamptz is null or t.occurred_at <= $4)
          order by t.occurred_at desc,t.id desc limit 25)
        select s.account_id,btrim(s.currency_code::text) currency,s.account_status,
          s.confirmed_minor::text,s.pending_minor::text,s.available_minor::text,
          s.ledger_version::text,s.reconciled_at,s.updated_at,r.*
        from public.v_account_balance_summary s left join recent r on true
        where s.account_id=$2 order by r.occurred_at desc,r.id desc`,
            [principal.userId, id, normalized.from, normalized.to],
          )
        ).rows;
        const balance = rows[0];
        if (!balance) throw domainError('NOT_FOUND', 404);
        return {
          accountId: id,
          currency: balance.currency,
          balance: {
            accountId: id,
            currency: balance.currency,
            confirmedMinor: Number(balance.confirmed_minor),
            pendingMinor: Number(balance.pending_minor),
            ledgerVersion: Number(balance.ledger_version),
            reconciledAt: balance.reconciled_at?.toISOString() ?? null,
          },
          recentTransactions: rows
            .filter((row) => row.id)
            .map((row) => this.mapSummary(row, row.account_ids)),
          ledgerVersion: Number(balance.ledger_version),
          requestId,
        };
      }),
    );
  }

  async reconcile(
    cursor: string | null,
    batchSize: number,
  ): Promise<{
    rows: Array<{
      accountId: string;
      ledgerVersion: number;
      matches: boolean;
      mismatchKind: 'confirmed' | 'pending' | 'confirmed_and_pending' | null;
      projectionAgeSeconds: number;
    }>;
    nextCursor: string | null;
  }> {
    if (cursor !== null) normalizeTransactionId(cursor);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
      throw new Error('LEDGER_RECONCILIATION_BATCH_INVALID');
    return this.workerTransaction(async (client) => {
      const rows = (
        await client.query<ReconciliationRow>(
          'select * from private.reconcile_account_balance($1::uuid,$2)',
          [cursor, batchSize],
        )
      ).rows;
      const mapped = rows.map((row) => {
        const confirmed = row.confirmed_minor !== row.derived_confirmed_minor;
        const pending = row.pending_minor !== row.derived_pending_minor;
        return {
          accountId: row.account_id,
          ledgerVersion: Number(row.ledger_version),
          matches: row.matches,
          projectionAgeSeconds: Number(row.projection_age_seconds),
          mismatchKind:
            !confirmed && !pending
              ? null
              : confirmed && pending
                ? ('confirmed_and_pending' as const)
                : confirmed
                  ? ('confirmed' as const)
                  : ('pending' as const),
        };
      });
      return {
        rows: mapped,
        nextCursor: mapped.length === batchSize ? (mapped.at(-1)?.accountId ?? null) : null,
      };
    });
  }

  async recordReconciliationMismatch(event: {
    accountId: string;
    mismatchKind: 'confirmed' | 'pending' | 'confirmed_and_pending';
    ledgerVersion: number;
    observedAt: string;
    requestId: string;
  }): Promise<void> {
    const payload = buildLedgerEvent('ledger.reconciliation_failed', event);
    await this.workerTransaction(async (client) => {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended('ledger-reconcile:'||$1,0))",
        [event.accountId],
      );
      const exists = (
        await client.query<{ exists: boolean }>(
          `select exists(select 1 from private.outbox_events where event_type='ledger.reconciliation_failed'
          and aggregate_id=$1 and payload->>'ledgerVersion'=$2 and payload->>'mismatchKind'=$3)`,
          [event.accountId, String(event.ledgerVersion), event.mismatchKind],
        )
      ).rows[0]?.exists;
      if (!exists)
        await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
          'ledger.reconciliation_failed',
          'account_balance',
          event.accountId,
          JSON.stringify(payload),
        ]);
    });
  }

  async effect(
    principal: LedgerMutation['principal'],
    transactionId: string,
  ): Promise<{ amountMinor: number; feeMinor: number; currency: string; version: number }> {
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: principal.userId,
              sid: principal.sessionId,
            }),
          ]);
          await client.query('set local role masarifi_api');
          const row = (
            await client.query<{
              amount_minor: string;
              fee_minor: string;
              currency: string;
              version: string;
            }>(
              'select amount_minor,fee_minor,btrim(currency_code::text) currency,version from public.transactions where id=$1 and user_id=$2',
              [transactionId, principal.userId],
            )
          ).rows[0];
          if (!row) throw domainError('NOT_FOUND', 404);
          await client.query('commit');
          return {
            amountMinor: Number(row.amount_minor),
            feeMinor: Number(row.fee_minor),
            currency: row.currency,
            version: Number(row.version),
          };
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async mutate(input: LedgerMutation): Promise<unknown> {
    const startedAt = performance.now();
    let outcome = 'failure';
    let postingCount = 0;
    let touchedAccountCount = 0;
    let appendStage: string = 'command';
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: input.principal.userId,
              sid: input.principal.sessionId,
            }),
          ]);
          await client.query('set local role masarifi_api');
          const keyHash = hashIdempotencyKey(input.idempotencyKey);
          const requestHash = hashNormalizedCommand(input.command);
          const claim = (
            await client.query<Claim>(
              'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
              [input.principal.userId, input.scope, keyHash, requestHash, '2 minutes'],
            )
          ).rows[0];
          if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
          recordPlatformMetric(LEDGER_METRICS.idempotency, 1, {
            scope: input.scope,
            outcome: claim.outcome,
          });
          if (claim.outcome === 'hash_mismatch') throw domainError('IDEMPOTENCY_KEY_REUSED', 409);
          if (claim.outcome === 'in_progress') throw domainError('IDEMPOTENCY_IN_PROGRESS', 409);
          if (claim.outcome === 'replay') {
            if (!claim.response_body || claim.response_status !== input.status)
              throw domainError('IDEMPOTENCY_REPLAY_UNAVAILABLE', 503);
            await client.query('commit');
            outcome = 'replay';
            recordPlatformMetric(LEDGER_METRICS.idempotencyReplay, 1, { scope: input.scope });
            return claim.response_body;
          }
          await this.lockOwner(client, input.principal.userId, input.operation);
          const priorPostingCount = [
            'reviseTransaction',
            'deleteTransaction',
            'restoreTransaction',
          ].includes(input.operation)
            ? Number(
                (
                  await client.query<{ count: string }>(
                    'select count(*)::text count from public.transaction_postings where transaction_id=$1',
                    [input.command.transactionId],
                  )
                ).rows[0]?.count ?? 0,
              )
            : 0;
          const result = await this.command(client, input);
          const detailResponse = await this.response(client, result, input.requestId);
          const accountIds = detailResponse.balances.map(({ accountId }) => accountId).sort();
          postingCount = detailResponse.transaction.postings.length - priorPostingCount;
          touchedAccountCount = accountIds.length;
          let response: unknown = detailResponse;
          if (input.operation === 'refundTransaction' || input.operation === 'reverseTransaction')
            response = {
              ...detailResponse,
              original: await this.originalSummary(client, String(input.command.transactionId)),
            };
          if (input.operation === 'deleteTransaction') {
            const summary = detailResponse.transaction.transaction;
            response = {
              transactionId: result.transactionId,
              deletedAt: summary.deletedAt,
              undoExpiresAt: summary.undoExpiresAt,
              version: result.version,
              balances: detailResponse.balances,
              ledgerVersion: result.ledgerVersion,
              requestId: input.requestId,
            };
          }
          const eventType =
            input.operation === 'transfer'
              ? 'transfer.created'
              : input.operation === 'refundTransaction'
                ? 'transaction.refunded'
                : input.operation === 'reverseTransaction'
                  ? 'transaction.reversed'
                  : input.operation === 'reviseTransaction'
                    ? 'transaction.revised'
                    : input.operation === 'deleteTransaction'
                      ? 'transaction.deleted'
                      : input.operation === 'restoreTransaction'
                        ? 'transaction.restored'
                        : 'transaction.created';
          const payload =
            eventType === 'transaction.revised'
              ? buildLedgerEvent(eventType, {
                  transactionId: result.transactionId,
                  oldVersion: Number(input.command.expectedVersion),
                  accountIds,
                  version: result.version,
                  ledgerVersion: result.ledgerVersion,
                  requestId: input.requestId,
                })
              : eventType === 'transaction.deleted'
                ? buildLedgerEvent(eventType, {
                    transactionId: result.transactionId,
                    version: result.version,
                    undoExpiresAt: detailResponse.transaction.transaction.undoExpiresAt,
                    ledgerVersion: result.ledgerVersion,
                    requestId: input.requestId,
                  })
                : eventType === 'transaction.restored'
                  ? buildLedgerEvent(eventType, {
                      transactionId: result.transactionId,
                      version: result.version,
                      ledgerVersion: result.ledgerVersion,
                      requestId: input.requestId,
                    })
                  : buildLedgerEvent(eventType, {
                      transactionId: result.transactionId,
                      kind: detailResponse.transaction.transaction.kind,
                      accountIds,
                      version: result.version,
                      ledgerVersion: result.ledgerVersion,
                      occurredAt: detailResponse.transaction.transaction.occurredAt,
                      requestId: input.requestId,
                    });
          appendStage = 'audit';
          await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
            input.principal.userId,
            'user',
            eventType,
            'transaction',
            result.transactionId,
            null,
            digest(`${result.transactionId}:${String(result.version)}`),
            null,
            input.requestId,
            JSON.stringify({
              operation: input.operation,
              version: result.version,
              ledgerVersion: result.ledgerVersion,
            }),
          ]);
          appendStage = 'outbox';
          await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
            eventType,
            'transaction',
            result.transactionId,
            JSON.stringify(payload),
          ]);
          await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
            'balance.changed',
            'transaction',
            result.transactionId,
            JSON.stringify(
              buildLedgerEvent('balance.changed', {
                transactionId: result.transactionId,
                accountIds: [...accountIds].sort(),
                ledgerVersion: result.ledgerVersion,
                requestId: input.requestId,
              }),
            ),
          ]);
          appendStage = 'idempotency';
          await client.query(
            'select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)',
            [
              input.principal.userId,
              input.scope,
              keyHash,
              requestHash,
              input.status,
              JSON.stringify(response),
              result.transactionId,
            ],
          );
          await client.query('commit');
          outcome = 'success';
          return response;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      if (appendStage !== 'command')
        recordPlatformMetric(LEDGER_METRICS.appendFailure, 1, { dependency: appendStage });
      const mapped = mapDatabaseError(error);
      if (mapped.getStatus() === 409) {
        recordPlatformMetric(LEDGER_METRICS.conflict, 1, {
          operation: input.operation,
          reason: conflictReason(error, mapped),
        });
      }
      throw mapped;
    } finally {
      recordPlatformMetric(LEDGER_METRICS.command, 1, { operation: input.operation, outcome });
      recordPlatformMetric(LEDGER_METRICS.commandDuration, performance.now() - startedAt, {
        operation: input.operation,
      });
      if (outcome === 'success') {
        recordPlatformMetric(LEDGER_METRICS.postingCount, postingCount, {
          operation: input.operation,
        });
        recordPlatformMetric(LEDGER_METRICS.touchedAccountCount, touchedAccountCount, {
          operation: input.operation,
        });
        recordPlatformMetric(LEDGER_METRICS.projectionUpdate, touchedAccountCount, {
          operation: input.operation,
        });
      }
    }
  }

  private async command(
    client: PoolClient,
    input: LedgerMutation,
  ): Promise<CommandResult['result']> {
    if (input.operation === 'deleteTransaction' || input.operation === 'restoreTransaction') {
      const deleting = input.operation === 'deleteTransaction';
      const sql = deleting
        ? 'select private.soft_delete_transaction($1,$2::uuid,$3::bigint,$4) result'
        : 'select private.restore_transaction($1,$2::uuid,$3::bigint) result';
      const values = deleting
        ? [
            input.principal.userId,
            input.command.transactionId,
            input.command.expectedVersion,
            input.command.reason,
          ]
        : [input.principal.userId, input.command.transactionId, input.command.expectedVersion];
      const row = (await client.query<CommandResult>(sql, values)).rows[0];
      if (!row) throw new Error('LEDGER_RESULT_MISSING');
      return row.result;
    }
    if (input.operation === 'refundTransaction' || input.operation === 'reverseTransaction') {
      const refund = input.operation === 'refundTransaction';
      const sql = refund
        ? 'select private.refund_transaction($1,$2::uuid,$3::bigint,$4::bigint,$5::uuid,$6::timestamptz,$7) result'
        : 'select private.reverse_transaction($1,$2::uuid,$3::bigint,$4::timestamptz,$5) result';
      const values = refund
        ? [
            input.principal.userId,
            input.command.transactionId,
            input.command.expectedVersion,
            input.command.amountMinor,
            input.command.accountId,
            input.command.occurredAt,
            input.command.reason,
          ]
        : [
            input.principal.userId,
            input.command.transactionId,
            input.command.expectedVersion,
            input.command.occurredAt,
            input.command.reason,
          ];
      const row = (await client.query<CommandResult>(sql, values)).rows[0];
      if (!row) throw new Error('LEDGER_RESULT_MISSING');
      return row.result;
    }
    if (input.operation === 'reviseTransaction') {
      const row = (
        await client.query<CommandResult>(
          'select private.revise_transaction($1,$2::uuid,$3::bigint,$4::jsonb,$5) result',
          [
            input.principal.userId,
            input.command.transactionId,
            input.command.expectedVersion,
            JSON.stringify(input.command.patch),
            input.command.reason,
          ],
        )
      ).rows[0];
      if (!row) throw new Error('LEDGER_RESULT_MISSING');
      return row.result;
    }
    const sql =
      input.operation === 'createTransaction'
        ? 'select private.post_transaction($1,$2::jsonb) result'
        : input.operation === 'transfer'
          ? 'select private.transfer_funds($1,$2::jsonb) result'
          : null;
    if (!sql) throw new Error('LEDGER_OPERATION_INVALID');
    const row = (
      await client.query<CommandResult>(sql, [
        input.principal.userId,
        JSON.stringify(input.command),
      ])
    ).rows[0];
    if (!row) throw new Error('LEDGER_RESULT_MISSING');
    return row.result;
  }

  private async response(
    client: PoolClient,
    result: CommandResult['result'],
    requestId: string,
  ): Promise<LedgerDetailResponse> {
    const transaction = (
      await client.query<TransactionRow>(
        `select id,kind,status,amount_minor,fee_minor,btrim(currency_code::text) currency,category_id,title,
       merchant,payment_method,note,occurred_at,source,reverses_transaction_id,version,deleted_at,undo_expires_at
       from public.transactions where id=$1`,
        [result.transactionId],
      )
    ).rows[0];
    if (!transaction) throw new Error('LEDGER_RESULT_MISSING');
    const postings = (
      await client.query<PostingRow>(
        `select id,account_id,amount_minor,clearing_state,posting_role,occurred_at
       from public.transaction_postings where transaction_id=$1 order by created_at,id`,
        [result.transactionId],
      )
    ).rows;
    const revisions = (
      await client.query<RevisionRow>(
        `select revision_no,reason,created_at from audit.transaction_revisions where transaction_id=$1 order by revision_no`,
        [result.transactionId],
      )
    ).rows;
    const accountIds =
      (
        await client.query<{ account_ids: string[] }>(
          'select private.ledger_account_ids($1) account_ids',
          [result.transactionId],
        )
      ).rows[0]?.account_ids ?? [];
    const balances = (
      await client.query<BalanceRow>(
        `select b.account_id,btrim(a.currency_code::text) currency,b.confirmed_minor,b.pending_minor,b.ledger_version,b.reconciled_at
       from public.account_balances b join public.accounts a on a.id=b.account_id
       where b.ledger_version=$1 order by b.account_id`,
        [result.ledgerVersion],
      )
    ).rows.map((row) => ({
      accountId: row.account_id,
      currency: row.currency,
      confirmedMinor: Number(row.confirmed_minor),
      pendingMinor: Number(row.pending_minor),
      ledgerVersion: Number(row.ledger_version),
      reconciledAt: row.reconciled_at?.toISOString() ?? null,
    }));
    const summary = {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      amountMinor: Number(transaction.amount_minor),
      currency: transaction.currency,
      accountIds,
      feeMinor: Number(transaction.fee_minor),
      categoryId: transaction.category_id,
      title: transaction.title,
      merchant: transaction.merchant,
      paymentMethod: transaction.payment_method,
      note: transaction.note,
      occurredAt: transaction.occurred_at.toISOString(),
      source: transaction.source,
      originalTransactionId: transaction.reverses_transaction_id,
      version: Number(transaction.version),
      deletedAt: transaction.deleted_at?.toISOString() ?? null,
      undoExpiresAt: transaction.undo_expires_at?.toISOString() ?? null,
    };
    const detail = {
      transaction: summary,
      postings: postings.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        amountMinor: Number(row.amount_minor),
        clearingState: row.clearing_state,
        postingRole: row.posting_role,
        occurredAt: row.occurred_at.toISOString(),
      })),
      revisions: revisions.map((row) => ({
        revisionNo: row.revision_no,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
      })),
      ledgerVersion: result.ledgerVersion,
      requestId,
    };
    return { transaction: detail, balances, ledgerVersion: result.ledgerVersion, requestId };
  }

  private async originalSummary(
    client: PoolClient,
    transactionId: string,
  ): Promise<Record<string, unknown>> {
    const transaction = (
      await client.query<TransactionRow>(
        `select id,kind,status,amount_minor,fee_minor,btrim(currency_code::text) currency,category_id,title,
       merchant,payment_method,note,occurred_at,source,reverses_transaction_id,version,deleted_at,undo_expires_at
       from public.transactions where id=$1`,
        [transactionId],
      )
    ).rows[0];
    if (!transaction) throw new Error('LEDGER_RESULT_MISSING');
    const accountIds =
      (
        await client.query<{ account_ids: string[] }>(
          'select private.ledger_account_ids($1) account_ids',
          [transactionId],
        )
      ).rows[0]?.account_ids ?? [];
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      amountMinor: Number(transaction.amount_minor),
      currency: transaction.currency,
      accountIds,
      feeMinor: Number(transaction.fee_minor),
      categoryId: transaction.category_id,
      title: transaction.title,
      merchant: transaction.merchant,
      paymentMethod: transaction.payment_method,
      note: transaction.note,
      occurredAt: transaction.occurred_at.toISOString(),
      source: transaction.source,
      originalTransactionId: transaction.reverses_transaction_id,
      version: Number(transaction.version),
      deletedAt: transaction.deleted_at?.toISOString() ?? null,
      undoExpiresAt: transaction.undo_expires_at?.toISOString() ?? null,
    };
  }

  private mapSummary(transaction: TransactionRow, accountIds: string[]): Record<string, unknown> {
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      amountMinor: Number(transaction.amount_minor),
      currency: transaction.currency,
      accountIds,
      feeMinor: Number(transaction.fee_minor),
      categoryId: transaction.category_id,
      title: transaction.title,
      merchant: transaction.merchant,
      paymentMethod: transaction.payment_method,
      note: transaction.note,
      occurredAt: transaction.occurred_at.toISOString(),
      source: transaction.source,
      originalTransactionId: transaction.reverses_transaction_id,
      version: Number(transaction.version),
      deletedAt: transaction.deleted_at?.toISOString() ?? null,
      undoExpiresAt: transaction.undo_expires_at?.toISOString() ?? null,
    };
  }

  private async observeRead(
    operation: string,
    action: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const startedAt = performance.now();
    let outcome = 'failure';
    try {
      const result = await action();
      outcome = 'success';
      const collection = Array.isArray(result.items)
        ? result.items
        : Array.isArray(result.recentTransactions)
          ? result.recentTransactions
          : null;
      recordPlatformMetric(LEDGER_METRICS.readResultCount, collection?.length ?? 1, { operation });
      recordPlatformMetric(LEDGER_METRICS.payloadBytes, Buffer.byteLength(JSON.stringify(result)), {
        operation,
      });
      return result;
    } finally {
      recordPlatformMetric(LEDGER_METRICS.read, 1, { operation, outcome });
      recordPlatformMetric(LEDGER_METRICS.readDuration, performance.now() - startedAt, {
        operation,
      });
    }
  }

  private async lockOwner(client: PoolClient, userId: string, operation: string): Promise<void> {
    const startedAt = performance.now();
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [userId]);
    recordPlatformMetric(LEDGER_METRICS.lockWaitDuration, performance.now() - startedAt, {
      operation,
    });
  }

  private async customerTransaction<T>(
    principal: LedgerMutation['principal'],
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query(
            "select set_config('request.jwt.claims',$1,true),set_config('role','masarifi_api',true)",
            [
              JSON.stringify({
                role: 'authenticated',
                sub: principal.userId,
                sid: principal.sessionId,
              }),
            ],
          );
          const result = await action(client);
          await client.query('commit');
          return result;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  private async workerTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(
          "select set_config('statement_timeout','2000ms',true),set_config('role','masarifi_worker',true)",
        );
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
