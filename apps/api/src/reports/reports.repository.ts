import { HttpException, Injectable, Optional } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PoolService } from '../platform/database/pool.service';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import {
  nextScheduleOccurrence,
  zonedDateTimeToInstant,
  type ReportPeriodRange,
} from './reports.period';
import {
  parseReportSnapshot,
  type DeliveryChannel,
  type ReportFormat,
  type ReportType,
} from './reports.schemas';
import { buildReportEvent, type ReportEventType } from './reports.events';

interface SummaryRow extends QueryResultRow {
  currency_code: string;
  income_minor: string;
  expense_minor: string;
  net_cash_flow_minor: string;
  transaction_count: string;
}

interface CategoryRow extends QueryResultRow {
  category_id: string;
  category_label_ar: string;
  category_label_en: string;
  currency_code: string;
  expense_minor: string;
  transaction_count: string;
}

export interface ReportsSummaryResponse {
  metadata: {
    schemaVersion: 1;
    generatedAt: string;
    ledgerVersion: number;
    reportType: ReportType;
    period: string;
    range: {
      startDate: string;
      endDate: string;
      timezone: string;
    };
    dataState: 'complete' | 'empty';
    evidence: Array<{ kind: 'ledger'; version: number; asOf: string }>;
  };
  summaries: Array<{
    income: { amountMinor: number; currency: string };
    expense: { amountMinor: number; currency: string };
    netCashFlow: { amountMinor: number; currency: string };
    savingsRateBasisPoints: number;
    transactionCount: number;
  }>;
  breakdowns: Array<{
    categoryId: string;
    labelAr: string;
    labelEn: string;
    currencyCode: string;
    expenseMinor: number;
    transactionCount: number;
  }>;
}

export interface ReportsContext {
  timezone: string;
  ledgerVersion: number;
}

interface IdempotencyClaim extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
}

interface AttemptRow extends QueryResultRow {
  id: string;
  schedule_id: string | null;
  report_type: ReportType;
  format: ReportFormat;
  delivery: DeliveryChannel;
  status: string;
  metadata: Record<string, unknown>;
  requested_at: Date;
  expires_at: Date;
  storage_ref?: string | null;
  error_code: string | null;
}

interface ScheduleRow extends QueryResultRow {
  id: string;
  user_id: string;
  report_type: ReportType;
  frequency: 'monthly' | 'three_months' | 'half_year' | 'annual';
  timezone: string;
  next_run_at: Date;
  delivery_channel: DeliveryChannel;
  recipient: string | null;
  enabled: boolean;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

export interface AdminReportCounts {
  totalUsers: number;
  newUsers: number;
  iosUsers: number;
  androidUsers: number;
  bothUsers: number;
  iosDevices: number;
  androidDevices: number;
}

interface AdminActivityRow extends QueryResultRow {
  id: string;
  event_type: string;
  summary: string;
  occurred_at: Date;
  platform_scope: string;
  permission: string;
  destination: string | null;
  total_count: string;
}

export interface AdminActivityQuery {
  platform: string;
  days: number;
  page: number;
  pageSize: number;
}

export type ReportWorkKind = 'report.generate' | 'report.email.deliver' | 'report.output.expire';
export interface ReportWorkClaim {
  id: string;
  userId: string;
  status: string;
  snapshot: unknown;
  storageRef: string | null;
  expiresAt: string;
  attemptCount: number;
  recipient?: string | null;
}
export interface ReportWorkOutcome {
  status: 'ready' | 'delivered' | 'failed' | 'expired';
  storageRef?: string;
  providerMessageId?: string;
  errorCode?: string;
  event?: { type: ReportEventType; data: Record<string, unknown> };
}

function safeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new HttpException({ code: 'REPORT_VALUE_OUT_OF_RANGE' }, 503);
  return parsed;
}

function mapDatabaseError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const code = (error as { code?: string }).code;
  if (code === '57014') return new HttpException({ code: 'REPORT_QUERY_TIMEOUT' }, 503);
  if (code === '42501') return new HttpException({ code: 'FORBIDDEN' }, 403);
  if (code === 'P0002') return new HttpException({ code: 'REPORT_NOT_FOUND' }, 404);
  if (code === '23505') return new HttpException({ code: 'REPORT_SNAPSHOT_CONFLICT' }, 409);
  if (code === '23503') return new HttpException({ code: 'REPORT_SCHEDULE_IN_USE' }, 409);
  if (code === '40001') return new HttpException({ code: 'REPORT_SCHEDULE_CONFLICT' }, 409);
  return new HttpException({ code: 'REPORT_UNAVAILABLE' }, 503);
}

@Injectable()
export class ReportsRepository {
  constructor(
    private readonly pool: PoolService,
    @Optional() private readonly config?: PlatformConfigService,
  ) {}

  async getContext(principal: ClerkPrincipal): Promise<ReportsContext> {
    return this.withApiSnapshot(principal, async (client) => {
      const row = (
        await client.query<{ timezone: string; ledger_version: string }>(
          `select p.timezone,coalesce(max(b.ledger_version),0)::bigint ledger_version
           from public.profiles p left join public.accounts a on a.user_id=p.id
           left join public.account_balances b on b.account_id=a.id
           where p.id=$1 group by p.id,p.timezone`,
          [principal.userId],
        )
      ).rows[0];
      if (!row) throw new HttpException({ code: 'NOT_FOUND' }, 404);
      return { timezone: row.timezone, ledgerVersion: safeInteger(row.ledger_version) };
    });
  }

  async getSummary(
    principal: ClerkPrincipal,
    reportType: ReportType,
    period: ReportPeriodRange,
    currency: string | null,
    requestId: string,
  ): Promise<ReportsSummaryResponse> {
    void requestId;
    try {
      return await this.withApiSnapshot(principal, (client) =>
        this.readSummary(client, principal.userId, reportType, period, currency),
      );
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async getHome(
    principal: ClerkPrincipal,
    period: ReportPeriodRange,
    currency: string | null,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    void requestId;
    return this.withApiSnapshot(principal, async (client) => {
      const summary = await this.readSummary(
        client,
        principal.userId,
        'financial_summary',
        period,
        currency,
      );
      const balances = (
        await client.query<{
          account_id: string;
          currency_code: string;
          confirmed_minor: string;
          pending_minor: string;
        }>(
          `select a.id account_id,a.currency_code,b.confirmed_minor,b.pending_minor
           from public.accounts a join public.account_balances b on b.account_id=a.id
           where a.user_id=$1 and a.status='active' and ($2::char(3) is null or a.currency_code=$2)
           order by a.id limit 100`,
          [principal.userId, currency],
        )
      ).rows.map((row) => ({
        accountId: row.account_id,
        confirmed: {
          amountMinor: safeInteger(row.confirmed_minor),
          currency: row.currency_code.trim(),
        },
        pending: {
          amountMinor: safeInteger(row.pending_minor),
          currency: row.currency_code.trim(),
        },
      }));
      const planning = await this.readPlanning(client, principal.userId, period, currency);
      const recentItems = (
        await client.query<{
          id: string;
          kind: string;
          amount_minor: string;
          currency_code: string;
          occurred_at: Date;
        }>(
          `select id,kind,amount_minor,currency_code,occurred_at from public.transactions
           where user_id=$1 and status='confirmed' and deleted_at is null
             and ($2::char(3) is null or currency_code=$2)
           order by occurred_at desc,id desc limit 25`,
          [principal.userId, currency],
        )
      ).rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: { amountMinor: safeInteger(row.amount_minor), currency: row.currency_code.trim() },
        occurredAt: row.occurred_at.toISOString(),
      }));
      return { ...summary, balances, planning, recentItems };
    });
  }

  async captureSnapshot(
    principal: ClerkPrincipal,
    command: {
      type: ReportType;
      periodStart: string;
      periodEnd: string;
      format: ReportFormat;
      delivery: DeliveryChannel;
      recipient: null;
    },
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin isolation level repeatable read');
        try {
          await this.setApiContext(client, principal);
          const keyHash = hashIdempotencyKey(idempotencyKey);
          const requestHash = hashNormalizedCommand(command);
          const claim = (
            await client.query<IdempotencyClaim>(
              'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
              [principal.userId, 'reports.create', keyHash, requestHash, '2 minutes'],
            )
          ).rows[0];
          if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
          if (claim.outcome === 'hash_mismatch')
            throw new HttpException({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409);
          if (claim.outcome === 'in_progress')
            throw new HttpException({ code: 'IDEMPOTENCY_IN_PROGRESS' }, 409);
          if (claim.outcome === 'replay') {
            if (!claim.response_body || claim.response_status !== 202)
              throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
            await client.query('commit');
            return claim.response_body;
          }
          const context = (
            await client.query<{ timezone: string; currency: string }>(
              `select p.timezone,coalesce(u.default_currency,'SAR') currency from public.profiles p
               left join public.user_preferences u on u.user_id=p.id where p.id=$1`,
              [principal.userId],
            )
          ).rows[0];
          if (!context) throw new HttpException({ code: 'NOT_FOUND' }, 404);
          const days =
            Math.floor(
              (Date.parse(`${command.periodEnd}T00:00:00Z`) -
                Date.parse(`${command.periodStart}T00:00:00Z`)) /
                86_400_000,
            ) + 1;
          const kind =
            days <= 31
              ? 'monthly'
              : days <= 93
                ? 'three_months'
                : days <= 186
                  ? 'half_year'
                  : 'annual';
          const nextDay = new Date(Date.parse(`${command.periodEnd}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10);
          const period: ReportPeriodRange = {
            kind,
            timezone: context.timezone,
            startDate: command.periodStart,
            endDate: command.periodEnd,
            startInstant: zonedDateTimeToInstant(command.periodStart, '00:00', context.timezone),
            endExclusiveInstant: zonedDateTimeToInstant(nextDay, '00:00', context.timezone),
          };
          const summary = await this.readSummary(
            client,
            principal.userId,
            command.type,
            period,
            context.currency.trim(),
          );
          const content = await this.reportContent(client, {
            userId: principal.userId,
            reportType: command.type,
            period,
            currency: context.currency.trim(),
            summary,
          });
          const snapshot = parseReportSnapshot(
            {
              schemaVersion: 1,
              generatedAt: summary.metadata.generatedAt,
              ledgerVersion: summary.metadata.ledgerVersion,
              reportType: command.type,
              period: {
                startDate: period.startDate,
                endDate: period.endDate,
                timezone: period.timezone,
                kind,
              },
              format: command.format,
              delivery: command.delivery,
              currencyCode: context.currency.trim(),
              dataState: content.dataState,
              evidence: summary.metadata.evidence,
              summary: content.summary,
              breakdowns: content.breakdowns,
              detailedRows: content.detailedRows,
            },
            this.config?.get('MASARIFI_REPORT_MAX_BYTES') ?? 52_428_800,
          );
          const retentionHours = this.config?.get('MASARIFI_REPORT_RETENTION_HOURS') ?? 24;
          const expiresAt = new Date(Date.now() + retentionHours * 3_600_000).toISOString();
          const captured = (
            await client.query<{ id: string; delivery_status: string }>(
              'select * from private.capture_report_snapshot($1,$2,$3::date,$4::date,$5,$6::jsonb,$7::uuid,$8::timestamptz)',
              [
                principal.userId,
                command.type,
                command.periodStart,
                command.periodEnd,
                summary.metadata.ledgerVersion,
                JSON.stringify(snapshot),
                null,
                expiresAt,
              ],
            )
          ).rows[0];
          if (!captured) throw new Error('REPORT_CAPTURE_FAILED');
          const response = {
            attemptId: captured.id,
            status: captured.delivery_status,
            ledgerVersion: summary.metadata.ledgerVersion,
            schemaVersion: 1,
            generatedAt: summary.metadata.generatedAt,
          };
          await client.query(
            'select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)',
            [
              principal.userId,
              'reports.create',
              keyHash,
              requestHash,
              202,
              JSON.stringify(response),
              captured.id,
            ],
          );
          await client.query('commit');
          void requestId;
          return response;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async getAttempt(
    principal: ClerkPrincipal,
    attemptId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.withApiSnapshot(
      principal,
      async (client) =>
        (
          await client.query<AttemptRow>('select * from private.read_report_output($1,$2::uuid)', [
            principal.userId,
            attemptId,
          ])
        ).rows,
    );
    const row = rows[0];
    if (!row) throw new HttpException({ code: 'REPORT_NOT_FOUND' }, 404);
    return this.attempt(row, requestId, true);
  }

  async getAdminReportCounts(
    principal: ClerkPrincipal,
    platform: string,
    days: number,
  ): Promise<AdminReportCounts> {
    const rows = await this.withApiSnapshot(principal, async (client) => {
      const result = await client.query<{
        total_users: string;
        new_users: string;
        ios_users: string;
        android_users: string;
        both_users: string;
        ios_devices: string;
        android_devices: string;
      }>('select * from private.read_admin_report_counts($1,$2)', [platform, days]);
      return result.rows;
    });
    const row = rows[0];
    if (!row) throw new HttpException({ code: 'REPORT_UNAVAILABLE' }, 503);
    return {
      totalUsers: safeInteger(row.total_users),
      newUsers: safeInteger(row.new_users),
      iosUsers: safeInteger(row.ios_users),
      androidUsers: safeInteger(row.android_users),
      bothUsers: safeInteger(row.both_users),
      iosDevices: safeInteger(row.ios_devices),
      androidDevices: safeInteger(row.android_devices),
    };
  }

  async getAdminOverviewActivity(
    principal: ClerkPrincipal,
    query: AdminActivityQuery,
  ): Promise<{ items: Record<string, unknown>[]; totalItems: number }> {
    const rows = await this.withApiSnapshot(
      principal,
      async (client) =>
        (
          await client.query<AdminActivityRow>(
            'select * from private.read_admin_overview_activity($1,$2,$3,$4)',
            [query.platform, query.days, (query.page - 1) * query.pageSize, query.pageSize],
          )
        ).rows,
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        summary: row.summary,
        occurredAt: row.occurred_at.toISOString(),
        platformScope: row.platform_scope,
        permission: row.permission,
        ...(row.destination ? { destination: row.destination } : {}),
      })),
      totalItems: safeInteger(rows[0]?.total_count ?? '0'),
    };
  }

  async getSupportedFinancialReport(
    principal: ClerkPrincipal,
    userId: string,
    start: string,
    end: string,
  ): Promise<Record<string, unknown>> {
    return this.withApiSnapshot(principal, async (client) => {
      const row = (
        await client.query<{ read_supported_financial_report: Record<string, unknown> }>(
          'select private.read_supported_financial_report($1,$2::date,$3::date)',
          [userId, start, end],
        )
      ).rows[0];
      if (!row) throw new HttpException({ code: 'REPORT_NOT_FOUND' }, 404);
      return row.read_supported_financial_report;
    });
  }

  captureAdminExport(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    snapshot: ReturnType<typeof parseReportSnapshot>,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.scheduleMutation(
      principal,
      'reports.admin.export',
      idempotencyKey,
      command,
      202,
      requestId,
      async (client) => {
        await client.query("select private.assert_admin_permission('privacy.exports.manage')");
        const retentionHours = this.config?.get('MASARIFI_REPORT_RETENTION_HOURS') ?? 24;
        const expiresAt = new Date(Date.now() + retentionHours * 3_600_000).toISOString();
        const row = (
          await client.query<{ id: string; delivery_status: string }>(
            'select * from private.capture_report_snapshot($1,$2,$3::date,$4::date,$5,$6::jsonb,$7::uuid,$8::timestamptz)',
            [
              principal.userId,
              snapshot.reportType,
              snapshot.period.startDate,
              snapshot.period.endDate,
              snapshot.ledgerVersion,
              JSON.stringify(snapshot),
              null,
              expiresAt,
            ],
          )
        ).rows[0];
        if (!row) throw new Error('REPORT_CAPTURE_FAILED');
        await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)', [
          principal.userId,
          'admin',
          'report.export_requested',
          'report_attempt',
          row.id,
          null,
          null,
          typeof command.supportReason === 'string'
            ? command.supportReason
            : 'Admin aggregate export',
          requestId,
          JSON.stringify({
            exportType: command.exportType,
            platform: command.platform,
            period: command.period,
          }),
        ]);
        return {
          attemptId: row.id,
          status: row.delivery_status,
          ledgerVersion: snapshot.ledgerVersion,
          schemaVersion: 1,
          generatedAt: snapshot.generatedAt,
        };
      },
    );
  }

  async listAttempts(
    principal: ClerkPrincipal,
    query: {
      cursor: string | null;
      limit: number;
      scheduleId: string | null;
      status: string | null;
    },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = this.decodeCursor(query.cursor);
    const rows = await this.withApiSnapshot(
      principal,
      async (client) =>
        (
          await client.query<AttemptRow>(
            'select * from private.list_report_outputs($1,$2::timestamptz,$3::uuid,$4,$5::uuid,$6)',
            [
              principal.userId,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              query.limit + 1,
              query.scheduleId,
              query.status,
            ],
          )
        ).rows,
    );
    const more = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((row) => this.attempt(row, requestId, false)),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.requested_at.toISOString(), id: last.id }),
            ).toString('base64url')
          : null,
      requestId,
    };
  }

  async retryDelivery(
    principal: ClerkPrincipal,
    attemptId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const command = { attemptId };
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await this.setApiContext(client, principal);
        const keyHash = hashIdempotencyKey(idempotencyKey),
          requestHash = hashNormalizedCommand(command);
        const claim = (
          await client.query<IdempotencyClaim>(
            'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
            [principal.userId, 'reports.delivery.retry', keyHash, requestHash, '2 minutes'],
          )
        ).rows[0];
        if (claim?.outcome === 'replay' && claim.response_body) {
          await client.query('commit');
          return claim.response_body;
        }
        if (claim?.outcome !== 'new')
          throw new HttpException(
            {
              code:
                claim?.outcome === 'hash_mismatch'
                  ? 'IDEMPOTENCY_KEY_REUSED'
                  : 'IDEMPOTENCY_IN_PROGRESS',
            },
            409,
          );
        const status = (
          await client.query<{ retry_report_delivery: string }>(
            'select private.retry_report_delivery($1,$2::uuid)',
            [principal.userId, attemptId],
          )
        ).rows[0]?.retry_report_delivery;
        const response = { attemptId, status, schemaVersion: 1 };
        await client.query('select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)', [
          principal.userId,
          'reports.delivery.retry',
          keyHash,
          requestHash,
          202,
          JSON.stringify(response),
          attemptId,
        ]);
        await client.query('commit');
        void requestId;
        return response;
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      }
    });
  }

  async listWork(kind: ReportWorkKind, limit: number): Promise<string[]> {
    return this.pool.withClient(async (client) => {
      await client.query('begin read only');
      try {
        await this.setWorkerContext(client);
        const rows = (
          await client.query<{ id: string }>('select * from private.list_report_work($1,$2)', [
            kind,
            limit,
          ])
        ).rows;
        await client.query('commit');
        return rows.map(({ id }) => id);
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      }
    });
  }

  async captureDeliveryWebhook(
    eventKeyHash: string,
    payloadHash: string,
  ): Promise<'new' | 'replay' | 'conflict'> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await this.setWorkerContext(client);
        const outcome = (
          await client.query<{ capture_report_delivery_webhook: 'new' | 'replay' | 'conflict' }>(
            'select private.capture_report_delivery_webhook($1,$2)',
            [eventKeyHash, payloadHash],
          )
        ).rows[0]?.capture_report_delivery_webhook;
        await client.query('commit');
        if (!outcome) throw new Error('REPORT_WEBHOOK_CAPTURE_FAILED');
        return outcome;
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      }
    });
  }

  async withWorkLock(
    kind: ReportWorkKind,
    id: string,
    action: (claim: ReportWorkClaim) => Promise<ReportWorkOutcome>,
  ): Promise<boolean> {
    return this.pool.withClient(async (client) => {
      const locked = (
        await client.query<{ locked: boolean }>(
          'select pg_try_advisory_lock(hashtextextended($1,0)) locked',
          [id],
        )
      ).rows[0]?.locked;
      if (!locked) return false;
      try {
        await client.query('begin');
        await this.setWorkerContext(client);
        const row = (
          await client.query<{
            id: string;
            user_id: string;
            status: string;
            snapshot: unknown;
            storage_ref: string | null;
            expires_at: Date;
            attempt_count: number;
            recipient?: string | null;
          }>('select * from private.read_report_work($1::uuid)', [id])
        ).rows[0];
        if (!row) {
          await client.query('rollback');
          return false;
        }
        const expected =
          kind === 'report.generate'
            ? ['queued', 'generating', 'failed']
            : kind === 'report.email.deliver'
              ? ['ready', 'sending']
              : ['queued', 'generating', 'ready', 'sending', 'delivered', 'failed'];
        if (!expected.includes(row.status)) {
          await client.query('rollback');
          return false;
        }
        const initial =
          kind === 'report.generate'
            ? 'generating'
            : kind === 'report.email.deliver'
              ? 'sending'
              : null;
        if (initial && row.status !== initial)
          await client.query('select private.transition_report_output($1,$2,$3,$4,$5)', [
            id,
            initial,
            null,
            null,
            null,
          ]);
        await client.query('commit');
        const outcome = await action({
          id: row.id,
          userId: row.user_id,
          status: row.status,
          snapshot: row.snapshot,
          storageRef: row.storage_ref,
          expiresAt: row.expires_at.toISOString(),
          attemptCount: row.attempt_count + (initial && row.status !== initial ? 1 : 0),
          recipient: row.recipient,
        });
        await client.query('begin');
        await this.setWorkerContext(client);
        await client.query('select private.transition_report_output($1,$2,$3,$4,$5)', [
          id,
          outcome.status,
          outcome.storageRef ?? null,
          outcome.providerMessageId ?? null,
          outcome.errorCode ?? null,
        ]);
        if (outcome.event) {
          const event = buildReportEvent(outcome.event.type, outcome.event.data);
          await client.query('select private.enqueue_outbox_event($1,$2,$3,$4::jsonb)', [
            event.type,
            'report_attempt',
            id,
            JSON.stringify(event),
          ]);
        }
        await client.query('commit');
        return true;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          /* connection cleanup continues */
        }
        throw error;
      } finally {
        await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [id]);
      }
    });
  }

  async listDueSchedules(now: Date, limit: number): Promise<ScheduleRow[]> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await this.setWorkerContext(client);
        const rows = (
          await client.query<ScheduleRow>(
            'select * from private.list_due_report_schedules($1,$2)',
            [now.toISOString(), limit],
          )
        ).rows;
        await client.query('commit');
        return rows;
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      }
    });
  }

  async enqueueDueSchedule(id: string, now: Date): Promise<boolean> {
    return this.pool.withClient(async (client) => {
      const locked = (
        await client.query<{ locked: boolean }>(
          'select pg_try_advisory_lock(hashtextextended($1,1)) locked',
          [id],
        )
      ).rows[0]?.locked;
      if (!locked) return false;
      try {
        await client.query('begin isolation level repeatable read');
        await this.setWorkerContext(client);
        const schedule = (
          await client.query<ScheduleRow>(
            'select * from private.read_due_report_schedule($1::uuid,$2::timestamptz)',
            [id, now.toISOString()],
          )
        ).rows[0];
        if (!schedule) {
          await client.query('rollback');
          return false;
        }
        const occurrence = nextScheduleOccurrence(
          {
            frequency: schedule.frequency,
            timezone: schedule.timezone,
            nextRunAt: schedule.next_run_at,
          },
          now,
        );
        await this.setApiContext(client, {
          userId: schedule.user_id,
          sessionId: 'report-scheduler',
          factorAgeSeconds: null,
        });
        const context = (
          await client.query<{ currency: string }>(
            `select coalesce(u.default_currency,'SAR') currency from public.profiles p
           left join public.user_preferences u on u.user_id=p.id where p.id=$1`,
            [schedule.user_id],
          )
        ).rows[0];
        if (!context) throw new Error('REPORT_OWNER_MISSING');
        const summary = await this.readSummary(
          client,
          schedule.user_id,
          schedule.report_type,
          occurrence.period,
          context.currency.trim(),
        );
        const content = await this.reportContent(client, {
          userId: schedule.user_id,
          reportType: schedule.report_type,
          period: occurrence.period,
          currency: context.currency.trim(),
          summary,
        });
        const snapshot = parseReportSnapshot(
          {
            schemaVersion: 1,
            generatedAt: summary.metadata.generatedAt,
            ledgerVersion: summary.metadata.ledgerVersion,
            reportType: schedule.report_type,
            period: {
              startDate: occurrence.period.startDate,
              endDate: occurrence.period.endDate,
              timezone: schedule.timezone,
              kind: schedule.frequency,
            },
            format: 'pdf',
            delivery: schedule.delivery_channel,
            currencyCode: context.currency.trim(),
            dataState: content.dataState,
            evidence: summary.metadata.evidence,
            summary: content.summary,
            breakdowns: content.breakdowns,
            detailedRows: content.detailedRows,
          },
          this.config?.get('MASARIFI_REPORT_MAX_BYTES') ?? 52_428_800,
        );
        await this.setWorkerContext(client, schedule.user_id);
        const retentionHours = this.config?.get('MASARIFI_REPORT_RETENTION_HOURS') ?? 24;
        await client.query(
          'select * from private.capture_report_snapshot($1,$2,$3::date,$4::date,$5,$6::jsonb,$7::uuid,$8::timestamptz)',
          [
            schedule.user_id,
            schedule.report_type,
            occurrence.period.startDate,
            occurrence.period.endDate,
            summary.metadata.ledgerVersion,
            JSON.stringify(snapshot),
            schedule.id,
            new Date(now.getTime() + retentionHours * 3_600_000).toISOString(),
          ],
        );
        await client.query(
          'select private.advance_report_schedule($1::uuid,$2,$3::timestamptz,$4::timestamptz)',
          [
            schedule.id,
            safeInteger(schedule.version),
            occurrence.scheduledFor.toISOString(),
            occurrence.nextRunAt.toISOString(),
          ],
        );
        await client.query('commit');
        return true;
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      } finally {
        await client.query('select pg_advisory_unlock(hashtextextended($1,1))', [id]);
      }
    });
  }

  createSchedule(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.scheduleMutation(
      principal,
      'report-schedules.create',
      idempotencyKey,
      command,
      201,
      requestId,
      async (client) => {
        const row = (
          await client.query<ScheduleRow>(
            'select * from private.create_report_schedule($1,$2,$3,$4,$5::timestamptz,$6,$7,$8)',
            [
              principal.userId,
              command.reportType,
              command.frequency,
              command.timezone,
              command.nextRunAt,
              command.deliveryChannel,
              command.recipient,
              command.enabled,
            ],
          )
        ).rows[0];
        if (!row) throw new Error('REPORT_SCHEDULE_CREATE_FAILED');
        return this.schedule(row);
      },
      'report.schedule_created',
    );
  }

  async getSchedule(
    principal: ClerkPrincipal,
    id: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return { ...this.schedule(await this.getScheduleState(principal, id)), requestId };
  }

  async getScheduleState(principal: ClerkPrincipal, id: string): Promise<ScheduleRow> {
    const rows = await this.withApiSnapshot(
      principal,
      async (client) =>
        (
          await client.query<ScheduleRow>(
            'select * from public.report_schedules where id=$1 and user_id=$2',
            [id, principal.userId],
          )
        ).rows,
    );
    if (!rows[0]) throw new HttpException({ code: 'REPORT_NOT_FOUND' }, 404);
    return rows[0];
  }

  async listSchedules(
    principal: ClerkPrincipal,
    cursor: string | null,
    limit: number,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const decoded = this.decodeCursor(cursor);
    const rows = await this.withApiSnapshot(
      principal,
      async (client) =>
        (
          await client.query<ScheduleRow>(
            `select * from public.report_schedules where user_id=$1
         and ($2::timestamptz is null or (created_at,id)<($2,$3::uuid))
         order by created_at desc,id desc limit $4`,
            [principal.userId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
          )
        ).rows,
    );
    const items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items: items.map((row) => this.schedule(row)),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.created_at.toISOString(), id: last.id }),
            ).toString('base64url')
          : null,
      requestId,
    };
  }

  updateSchedule(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    idempotencyKey: string,
    requestId: string,
    auditAction = 'report.schedule_updated',
  ): Promise<Record<string, unknown>> {
    return this.scheduleMutation(
      principal,
      'report-schedules.update',
      idempotencyKey,
      command,
      200,
      requestId,
      async (client) => {
        const row = (
          await client.query<ScheduleRow>(
            'select * from private.update_report_schedule($1,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10)',
            [
              principal.userId,
              command.id,
              command.expectedVersion,
              command.reportType,
              command.frequency,
              command.timezone,
              command.nextRunAt,
              command.deliveryChannel,
              command.recipient,
              command.enabled,
            ],
          )
        ).rows[0];
        if (!row) throw new HttpException({ code: 'REPORT_SCHEDULE_CONFLICT' }, 409);
        return this.schedule(row);
      },
      auditAction,
    );
  }

  deleteSchedule(
    principal: ClerkPrincipal,
    id: string,
    expectedVersion: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const command = { id, expectedVersion };
    return this.scheduleMutation(
      principal,
      'report-schedules.delete',
      idempotencyKey,
      command,
      204,
      requestId,
      async (client) => {
        const deleted = (
          await client.query<{ delete_report_schedule: string }>(
            'select private.delete_report_schedule($1,$2::uuid,$3)',
            [principal.userId, id, expectedVersion],
          )
        ).rows[0]?.delete_report_schedule;
        if (!deleted) throw new Error('REPORT_SCHEDULE_DELETE_FAILED');
        return { id: deleted };
      },
      'report.schedule_deleted',
    );
  }

  private async scheduleMutation(
    principal: ClerkPrincipal,
    scope: string,
    idempotencyKey: string,
    command: Record<string, unknown>,
    status: number,
    requestId: string,
    action: (client: PoolClient) => Promise<Record<string, unknown>>,
    auditAction?: string,
  ): Promise<Record<string, unknown>> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await this.setApiContext(client, principal);
        const keyHash = hashIdempotencyKey(idempotencyKey),
          requestHash = hashNormalizedCommand(command);
        const claim = (
          await client.query<IdempotencyClaim>(
            'select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
            [principal.userId, scope, keyHash, requestHash, '2 minutes'],
          )
        ).rows[0];
        if (claim?.outcome === 'replay' && claim.response_body) {
          await client.query('commit');
          return claim.response_body;
        }
        if (claim?.outcome !== 'new')
          throw new HttpException(
            {
              code:
                claim?.outcome === 'hash_mismatch'
                  ? 'IDEMPOTENCY_KEY_REUSED'
                  : 'IDEMPOTENCY_IN_PROGRESS',
            },
            409,
          );
        const response = await action(client);
        const resourceId = typeof response.id === 'string' ? response.id : null;
        if (auditAction && resourceId) {
          await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)', [
            principal.userId,
            'user',
            auditAction,
            'report_schedule',
            resourceId,
            null,
            null,
            null,
            requestId,
            JSON.stringify({
              reportType: command.reportType,
              frequency: command.frequency,
              deliveryChannel: command.deliveryChannel,
              enabled: command.enabled,
            }),
          ]);
        }
        await client.query('select private.complete_idempotency_key($1,$2,$3,$4,$5,$6::jsonb,$7)', [
          principal.userId,
          scope,
          keyHash,
          requestHash,
          status,
          JSON.stringify(response),
          resourceId,
        ]);
        await client.query('commit');
        void requestId;
        return response;
      } catch (error) {
        await client.query('rollback');
        throw mapDatabaseError(error);
      }
    });
  }

  private schedule(row: ScheduleRow): Record<string, unknown> {
    const recipientMasked = row.recipient?.replace(/^(.)([^@]*)(@.*)$/u, '$1***$3');
    return {
      id: row.id,
      ...(row.schedule_id ? { scheduleId: row.schedule_id } : {}),
      version: safeInteger(row.version),
      reportType: row.report_type,
      frequency: row.frequency,
      timezone: row.timezone,
      nextRunAt: row.next_run_at.toISOString(),
      deliveryChannel: row.delivery_channel,
      ...(recipientMasked ? { recipientMasked } : {}),
      enabled: row.enabled,
      lastRunAt: row.last_run_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private attempt(
    row: AttemptRow,
    requestId: string,
    includeStorage: boolean,
  ): Record<string, unknown> {
    return {
      id: row.id,
      reportType: row.report_type,
      format: row.format,
      delivery: row.delivery,
      status: row.status,
      metadata: row.metadata,
      requestedAt: row.requested_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      ...(row.error_code ? { errorCode: row.error_code } : {}),
      ...(includeStorage && row.storage_ref ? { storageRef: row.storage_ref } : {}),
      requestId,
    };
  }

  private decodeCursor(value: string | null): { createdAt: string; id: string } | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      if (
        typeof parsed.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string'
      )
        throw new Error();
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  private async readPlanning(
    client: PoolClient,
    userId: string,
    period: ReportPeriodRange,
    currency: string | null,
  ): Promise<Record<string, unknown[]>> {
    const budgets = (
      await client.query<{ currency_code: string; total_minor: string; spent_minor: string }>(
        `select b.currency_code,sum(b.total_minor)::bigint total_minor,
           coalesce(sum(u.spent_minor),0)::bigint spent_minor
         from public.budgets b left join public.v_budget_utilization u on u.budget_id=b.id
         where b.user_id=$1 and b.status<>'deleted' and b.period_end>=$2::date and b.period_start<=$3::date
           and ($4::char(3) is null or b.currency_code=$4)
         group by b.currency_code order by b.currency_code limit 16`,
        [userId, period.startDate, period.endDate, currency],
      )
    ).rows.map((row) => ({
      currency: row.currency_code.trim(),
      budgetMinor: safeInteger(row.total_minor),
      spentMinor: safeInteger(row.spent_minor),
    }));
    const obligations = (
      await client.query<{
        currency_code: string;
        paid_minor: string;
        remaining_minor: string;
        overdue_minor: string;
      }>(
        `select currency_code,sum(paid_minor)::bigint paid_minor,
           sum(remaining_minor)::bigint remaining_minor,sum(overdue_minor)::bigint overdue_minor
         from public.v_obligation_status where user_id=$1
           and ($2::char(3) is null or currency_code=$2)
         group by currency_code order by currency_code limit 16`,
        [userId, currency],
      )
    ).rows.map((row) => ({
      currency: row.currency_code.trim(),
      paidMinor: safeInteger(row.paid_minor),
      remainingMinor: safeInteger(row.remaining_minor),
      overdueMinor: safeInteger(row.overdue_minor),
    }));
    const savingsGoals = (
      await client.query<{ currency_code: string; target_minor: string; tracked_minor: string }>(
        `select g.currency_code,sum(g.target_minor)::bigint target_minor,
           sum(g.opening_tracked_minor+coalesce(m.movement_minor,0))::bigint tracked_minor
         from public.savings_goals g left join lateral (
           select sum(amount_minor)::bigint movement_minor from public.savings_goal_movements
           where goal_id=g.id
         ) m on true
         where g.user_id=$1 and g.status<>'deleted'
           and ($2::char(3) is null or g.currency_code=$2)
         group by g.currency_code order by g.currency_code limit 16`,
        [userId, currency],
      )
    ).rows.map((row) => ({
      currency: row.currency_code.trim(),
      targetMinor: safeInteger(row.target_minor),
      trackedMinor: safeInteger(row.tracked_minor),
    }));
    return { budgets, obligations, savingsGoals };
  }

  private async readDetailedRows(
    client: PoolClient,
    userId: string,
    period: ReportPeriodRange,
    options: { currency: string | null; limit: number },
  ): Promise<Record<string, unknown>[]> {
    const rows = (
      await client.query<{
        occurred_at: Date;
        kind: string;
        amount_minor: string;
        currency_code: string;
        category_label: string;
      }>(
        `select t.occurred_at,t.kind,t.amount_minor,t.currency_code,
           coalesce(c.label_en,'Uncategorized') category_label
         from public.transactions t left join public.categories c on c.id=t.category_id
         where t.user_id=$1 and t.status='confirmed' and t.deleted_at is null
           and t.occurred_at>=$2::timestamptz and t.occurred_at<$3::timestamptz
           and ($4::char(3) is null or t.currency_code=$4)
         order by t.occurred_at,t.id limit $5`,
        [
          userId,
          period.startInstant,
          period.endExclusiveInstant,
          options.currency,
          options.limit + 1,
        ],
      )
    ).rows;
    if (rows.length > options.limit)
      throw new HttpException({ code: 'REPORT_LIMIT_EXCEEDED' }, 413);
    return rows.map((row) => ({
      occurredAt: row.occurred_at.toISOString(),
      kind: row.kind,
      amountMinor: safeInteger(row.amount_minor),
      currencyCode: row.currency_code.trim(),
      categoryLabel: row.category_label,
    }));
  }

  private async reportContent(
    client: PoolClient,
    input: {
      userId: string;
      reportType: ReportType;
      period: ReportPeriodRange;
      currency: string;
      summary: ReportsSummaryResponse;
    },
  ): Promise<{
    summary: Record<string, unknown>;
    breakdowns: Record<string, unknown>[];
    detailedRows: Record<string, unknown>[];
    dataState: 'complete' | 'empty';
  }> {
    const includePlanning = [
      'financial_summary',
      'budget_performance',
      'obligation_progress',
      'savings_progress',
    ].includes(input.reportType);
    const planning = includePlanning
      ? await this.readPlanning(client, input.userId, input.period, input.currency)
      : undefined;
    const detailedRows =
      input.reportType === 'account_activity'
        ? await this.readDetailedRows(client, input.userId, input.period, {
            currency: input.currency,
            limit: this.config?.get('MASARIFI_REPORT_MAX_ROWS') ?? 100_000,
          })
        : [];
    const breakdowns = ['financial_summary', 'category_spending'].includes(input.reportType)
      ? input.summary.breakdowns
      : [];
    const hasPlanning = planning && Object.values(planning).some((rows) => rows.length > 0);
    const hasData =
      input.summary.summaries.length > 0 || breakdowns.length > 0 || detailedRows.length > 0;
    return {
      summary: { summaries: input.summary.summaries, ...(planning ? { planning } : {}) },
      breakdowns,
      detailedRows,
      dataState: hasData || hasPlanning ? 'complete' : 'empty',
    };
  }

  private async readSummary(
    client: PoolClient,
    userId: string,
    reportType: ReportType,
    period: ReportPeriodRange,
    currency: string | null,
  ): Promise<ReportsSummaryResponse> {
    const summaries = (
      await client.query<SummaryRow>(
        `with effects as (
           select t.currency_code,
             case when t.kind='income' then t.amount_minor else 0 end::bigint income_minor,
             case
               when t.kind='expense' then t.amount_minor+t.fee_minor
               when t.kind='refund' then -t.amount_minor
               when t.fee_minor>0 then t.fee_minor
               else 0
             end::bigint expense_minor,
             case when t.kind in ('income','expense','refund') or t.fee_minor>0 then 1 else 0 end transaction_count
           from public.transactions t
           where t.user_id=$1 and t.status='confirmed' and t.deleted_at is null
             and t.occurred_at >= $2::timestamptz and t.occurred_at < $3::timestamptz
             and ($4::char(3) is null or t.currency_code=$4)
         )
         select currency_code,sum(income_minor)::bigint income_minor,
           sum(expense_minor)::bigint expense_minor,
           (sum(income_minor)-sum(expense_minor))::bigint net_cash_flow_minor,
           sum(transaction_count)::bigint transaction_count
         from effects where transaction_count>0
         group by currency_code order by currency_code`,
        [userId, period.startInstant, period.endExclusiveInstant, currency],
      )
    ).rows.map((row) => {
      const income = safeInteger(row.income_minor);
      const netCashFlow = safeInteger(row.net_cash_flow_minor);
      const currencyCode = row.currency_code.trim();
      return {
        income: { amountMinor: income, currency: currencyCode },
        expense: { amountMinor: safeInteger(row.expense_minor), currency: currencyCode },
        netCashFlow: { amountMinor: netCashFlow, currency: currencyCode },
        savingsRateBasisPoints: income === 0 ? 0 : Math.trunc((netCashFlow * 10_000) / income),
        transactionCount: safeInteger(row.transaction_count),
      };
    });
    const breakdowns = (
      await client.query<CategoryRow>(
        `with category_effects as (
           select t.currency_code,t.category_id,t.amount_minor::bigint expense_minor
           from public.transactions t
           where t.user_id=$1 and t.kind='expense' and t.status='confirmed'
             and t.deleted_at is null and t.category_id is not null
             and t.occurred_at >= $2::timestamptz and t.occurred_at < $3::timestamptz
             and ($4::char(3) is null or t.currency_code=$4)
           union all
           select r.currency_code,o.category_id,-r.amount_minor::bigint
           from public.transactions r
           join public.transactions o on o.id=r.reverses_transaction_id and o.user_id=r.user_id
           where r.user_id=$1 and r.kind='refund' and r.status='confirmed'
             and r.deleted_at is null and o.category_id is not null
             and r.occurred_at >= $2::timestamptz and r.occurred_at < $3::timestamptz
             and ($4::char(3) is null or r.currency_code=$4)
         )
         select e.category_id,c.label_ar category_label_ar,c.label_en category_label_en,e.currency_code,
           sum(e.expense_minor)::bigint expense_minor,count(*)::bigint transaction_count
         from category_effects e
         join public.categories c on c.id=e.category_id
         group by e.category_id,c.label_ar,c.label_en,e.currency_code
         order by currency_code,expense_minor desc,category_id limit 100`,
        [userId, period.startInstant, period.endExclusiveInstant, currency],
      )
    ).rows.map((row) => ({
      categoryId: row.category_id,
      labelAr: row.category_label_ar,
      labelEn: row.category_label_en,
      currencyCode: row.currency_code.trim(),
      expenseMinor: safeInteger(row.expense_minor),
      transactionCount: safeInteger(row.transaction_count),
    }));
    const ledgerVersion = safeInteger(
      (
        await client.query<{ ledger_version: string }>(
          `select coalesce(max(b.ledger_version),0)::bigint ledger_version
           from public.account_balances b join public.accounts a on a.id=b.account_id where a.user_id=$1`,
          [userId],
        )
      ).rows[0]?.ledger_version ?? '0',
    );
    const generatedAt = new Date().toISOString();
    return {
      metadata: {
        schemaVersion: 1,
        generatedAt,
        ledgerVersion,
        reportType,
        period: period.kind,
        range: {
          startDate: period.startDate,
          endDate: period.endDate,
          timezone: period.timezone,
        },
        dataState: summaries.length === 0 ? 'empty' : 'complete',
        evidence: [{ kind: 'ledger', version: ledgerVersion, asOf: generatedAt }],
      },
      summaries,
      breakdowns,
    };
  }

  private withApiSnapshot<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin isolation level repeatable read read only');
      try {
        await this.setApiContext(client, principal);
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private async setApiContext(client: PoolClient, principal: ClerkPrincipal): Promise<void> {
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'authenticated', sub: principal.userId, sid: principal.sessionId }),
    ]);
    await client.query('set local role masarifi_api');
  }

  private async setWorkerContext(client: PoolClient, userId?: string): Promise<void> {
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'worker', ...(userId ? { sub: userId } : {}) }),
    ]);
    await client.query('set local role masarifi_worker');
  }
}
