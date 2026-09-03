import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { PoolService } from '../platform/database/pool.service';
import type { ReportPeriodRange } from './reports.period';
import type { ReportType } from './reports.schemas';

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

function safeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpException({ code: 'REPORT_VALUE_OUT_OF_RANGE' }, 503);
  return parsed;
}

function mapDatabaseError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const code = (error as { code?: string }).code;
  if (code === '57014') return new HttpException({ code: 'REPORT_QUERY_TIMEOUT' }, 503);
  if (code === '42501') return new HttpException({ code: 'FORBIDDEN' }, 403);
  return new HttpException({ code: 'REPORT_UNAVAILABLE' }, 503);
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly pool: PoolService) {}

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
        await client.query<{ account_id: string; currency_code: string; confirmed_minor: string; pending_minor: string }>(
          `select a.id account_id,a.currency_code,b.confirmed_minor,b.pending_minor
           from public.accounts a join public.account_balances b on b.account_id=a.id
           where a.user_id=$1 and a.status='active' and ($2::char(3) is null or a.currency_code=$2)
           order by a.id limit 100`,
          [principal.userId, currency],
        )
      ).rows.map((row) => ({
        accountId: row.account_id,
        confirmed: { amountMinor: safeInteger(row.confirmed_minor), currency: row.currency_code.trim() },
        pending: { amountMinor: safeInteger(row.pending_minor), currency: row.currency_code.trim() },
      }));
      const budgets = (
        await client.query<{ currency_code: string; total_minor: string; spent_minor: string }>(
          `select b.currency_code,sum(b.total_minor)::bigint total_minor,
             coalesce(sum(u.spent_minor),0)::bigint spent_minor
           from public.budgets b left join public.v_budget_utilization u on u.budget_id=b.id
           where b.user_id=$1 and b.status<>'deleted' and b.period_end>=$2::date and b.period_start<=$3::date
             and ($4::char(3) is null or b.currency_code=$4)
           group by b.currency_code order by b.currency_code limit 16`,
          [principal.userId, period.startDate, period.endDate, currency],
        )
      ).rows.map((row) => ({
        currency: row.currency_code.trim(),
        budgetMinor: safeInteger(row.total_minor),
        spentMinor: safeInteger(row.spent_minor),
      }));
      const recentItems = (
        await client.query<{ id: string; kind: string; amount_minor: string; currency_code: string; occurred_at: Date }>(
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
      return { ...summary, balances, planning: { budgets }, recentItems };
    });
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
        `select currency_code,sum(income_minor)::bigint income_minor,
           sum(expense_minor)::bigint expense_minor,sum(net_cash_flow_minor)::bigint net_cash_flow_minor,
           sum(transaction_count)::bigint transaction_count
         from public.v_monthly_financial_summary
         where user_id=$1 and month_start between date_trunc('month',$2::date)::date
           and date_trunc('month',$3::date)::date and ($4::char(3) is null or currency_code=$4)
         group by currency_code order by currency_code`,
        [userId, period.startDate, period.endDate, currency],
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
        `select category_id,category_label_ar,category_label_en,currency_code,
           sum(expense_minor)::bigint expense_minor,sum(transaction_count)::bigint transaction_count
         from public.v_category_spending_summary
         where user_id=$1 and month_start between date_trunc('month',$2::date)::date
           and date_trunc('month',$3::date)::date and ($4::char(3) is null or currency_code=$4)
         group by category_id,category_label_ar,category_label_en,currency_code
         order by currency_code,expense_minor desc,category_id limit 100`,
        [userId, period.startDate, period.endDate, currency],
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
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: principal.userId, sid: principal.sessionId }),
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
}
