import {
  available,
  money,
  resolveReportPeriod,
  unavailable,
  type FinancialReport,
  type CompletenessReason,
  type ReportBreakdown,
  type ReportOutputAttempt,
  type ReportPreview,
  type ReportSnapshot
} from '@/domain/reports';
import { emptyTransactionFilters } from '@/domain/core-finance';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import {
  reportsServiceCapability,
  type ReportsService
} from '@/services/contracts/reports-service';
import { ReportsRepository } from '@/storage/reports-repository';

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;

export class ReportsApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReportsApiError('reports_unavailable');
  return value as Json;
}
function exact(value: unknown, keys: readonly string[]): Json {
  const row = object(value);
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new ReportsApiError('contract_mismatch');
  return row;
}
function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new ReportsApiError('reports_unavailable');
  return parsed;
}
function epoch(value: unknown): number {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new ReportsApiError('reports_unavailable');
  return Date.parse(value);
}

export function createLiveReportsService(
  options: {
    baseUrl?: string;
    token?: TokenProvider;
    request?: typeof fetch;
    repository?: ReportsRepository;
  } = {}
): CapabilityProviderHandle<ReportsService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';
  const token =
    options.token ??
    (() => Promise.reject(new ReportsApiError('reports_unavailable')));
  const request = options.request ?? fetch;
  const local = options.repository ?? new ReportsRepository(false);
  const previews = new Map<string, ReportPreview>();
  const attempts = new Map<string, ReportOutputAttempt>();

  const send = async (
    method: string,
    path: string,
    body?: unknown,
    key?: string
  ): Promise<unknown> => {
    if (!baseUrl) throw new ReportsApiError('reports_unavailable');
    let response: Response;
    try {
      response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(key ? { 'Idempotency-Key': key } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ReportsApiError('offline');
    }
    let value: unknown = null;
    try {
      if (response.status !== 204) value = await response.json();
    } catch {
      throw new ReportsApiError('contract_mismatch');
    }
    if (!response.ok)
      throw new ReportsApiError(
        response.status === 403
          ? 'permission_required'
          : response.status === 404
            ? 'not_found'
            : response.status === 409
              ? 'conflict'
              : response.status === 410
                ? 'expired'
                : 'reports_unavailable'
      );
    return value;
  };

  const report = async (
    input: Parameters<ReportsService['getReport']>[0]
  ): Promise<FinancialReport> => {
    if (input.accountIds?.length)
      throw new ReportsApiError('report_account_scope_unavailable');
    const response = exact(
      await send(
        'GET',
        `/api/v1/reports/summary?${new URLSearchParams({
          type: 'financial_summary',
          period: input.kind,
          anchorDate: input.anchorDate,
          currency: input.currencyCode
        }).toString()}`
      ),
      ['metadata', 'summaries', 'breakdowns']
    );
    const metadata = exact(response.metadata, [
        'schemaVersion',
        'generatedAt',
        'ledgerVersion',
        'reportType',
        'period',
        'range',
        'dataState',
        'evidence'
      ]),
      range = exact(metadata.range, ['startDate', 'endDate', 'timezone']),
      summaries = Array.isArray(response.summaries)
        ? response.summaries.map((value) =>
            exact(value, [
              'income',
              'expense',
              'netCashFlow',
              'savingsRateBasisPoints',
              'transactionCount'
            ])
          )
        : (() => {
            throw new ReportsApiError('contract_mismatch');
          })();
    if (
      metadata.schemaVersion !== 1 ||
      metadata.reportType !== 'financial_summary' ||
      metadata.period !== input.kind ||
      !['complete', 'empty', 'partial', 'estimated'].includes(
        String(metadata.dataState)
      ) ||
      !Number.isSafeInteger(metadata.ledgerVersion) ||
      !Array.isArray(metadata.evidence)
    )
      throw new ReportsApiError('contract_mismatch');
    const selected =
      summaries.find(
        (item) =>
          exact(item.income, ['amountMinor', 'currency']).currency ===
          input.currencyCode
      ) ?? null;
    if (!selected && metadata.dataState !== 'empty')
      throw new ReportsApiError('contract_mismatch');
    const values = selected ?? {
      income: { amountMinor: 0, currency: input.currencyCode },
      expense: { amountMinor: 0, currency: input.currencyCode },
      netCashFlow: { amountMinor: 0, currency: input.currencyCode },
      savingsRateBasisPoints: 0,
      transactionCount: 0
    };
    const incomeValue = exact(values.income, ['amountMinor', 'currency']),
      expenseValue = exact(values.expense, ['amountMinor', 'currency']),
      netValue = exact(values.netCashFlow, ['amountMinor', 'currency']);
    if (
      incomeValue.currency !== input.currencyCode ||
      expenseValue.currency !== input.currencyCode ||
      netValue.currency !== input.currencyCode
    )
      throw new ReportsApiError('contract_mismatch');
    const income = integer(incomeValue.amountMinor),
      expense = integer(expenseValue.amountMinor),
      net = integer(netValue.amountMinor);
    const period = resolveReportPeriod({
      ...input,
      now: epoch(metadata.generatedAt)
    });
    if (range.timezone !== input.timeZone)
      throw new ReportsApiError('report_timezone_unavailable');
    if (
      range.startDate !== period.startDate ||
      range.endDate !== period.endDate
    )
      throw new ReportsApiError('report_range_mismatch');
    const key = `report:${input.kind}:${input.anchorDate}:${input.currencyCode}`;
    if (!Array.isArray(response.breakdowns))
      throw new ReportsApiError('contract_mismatch');
    const breakdowns = [
      categoryBreakdown(response.breakdowns, period, input.currencyCode, key)
    ];
    const sourceReasons: CompletenessReason[] =
      metadata.dataState === 'partial' || metadata.dataState === 'estimated'
        ? ['source_incomplete']
        : [];
    const financialValue = (amountMinor: number) =>
      sourceReasons.length
        ? {
            status: 'incomplete' as const,
            value: money(amountMinor, input.currencyCode),
            reasons: sourceReasons
          }
        : available(money(amountMinor, input.currencyCode));
    const evidence = metadata.evidence.map((value) =>
      exact(value, ['kind', 'version', 'asOf'])
    );
    return {
      key,
      period,
      currencyCode: input.currencyCode,
      generatedAt: epoch(metadata.generatedAt),
      dataAsOf: epoch(evidence[0]?.asOf ?? metadata.generatedAt),
      dataState: metadata.dataState === 'empty' ? 'empty' : 'partial',
      completenessReasons: [...sourceReasons, 'unsupported_by_server'],
      summary: {
        income: financialValue(income),
        expense: financialValue(expense),
        netCashFlow: financialValue(net),
        savingsRateBasisPoints: sourceReasons.length
          ? {
              status: 'incomplete',
              value: integer(values.savingsRateBasisPoints),
              reasons: sourceReasons
            }
          : available(integer(values.savingsRateBasisPoints)),
        obligationPayments: unavailable('unsupported_by_server'),
        largestCategory: breakdowns[0]?.items[0]
          ? available(breakdowns[0].items[0])
          : unavailable('insufficient_history'),
        largestTransaction: unavailable('unsupported_by_server'),
        comparisons: []
      },
      breakdowns,
      insights: []
    };
  };

  const breakdown = (
    dimension: ReportBreakdown['dimension'],
    dataState: FinancialReport['dataState']
  ): ReportBreakdown => ({
    dimension,
    questionKey: `reports.${dimension}.question`,
    summaryKey: `reports.${dimension}.summary`,
    items: [],
    dataState
  });
  const snapshot = (
    value: FinancialReport,
    language: 'ar' | 'en',
    detailLevel: 'summary' | 'detailed'
  ): ReportSnapshot => ({
    period: value.period,
    generatedAt: value.generatedAt,
    dataAsOf: value.dataAsOf,
    language,
    currencyCode: value.currencyCode,
    detailLevel,
    dataState: value.dataState,
    notices: [],
    summary: value.summary,
    breakdowns: value.breakdowns,
    detailedRows: []
  });
  const attempt = (
    value: unknown,
    fallback?: ReportSnapshot,
    operationId = ''
  ): ReportOutputAttempt => {
    const row = exact(value, [
        'id',
        'attemptId',
        'scheduleId',
        'reportType',
        'format',
        'delivery',
        'status',
        'metadata',
        'ledgerVersion',
        'schemaVersion',
        'generatedAt',
        'requestedAt',
        'updatedAt',
        'completedAt',
        'expiresAt',
        'errorCode',
        'downloadUrl',
        'downloadUrlExpiresAt'
      ]),
      status = String(row.status);
    if (
      ![
        'queued',
        'generating',
        'ready',
        'sending',
        'delivered',
        'failed',
        'expired'
      ].includes(status)
    )
      throw new ReportsApiError('contract_mismatch');
    const saved = attempts.get(String(row.id ?? row.attemptId));
    if (!fallback && !saved)
      throw new ReportsApiError('report_snapshot_unavailable');
    const outputSnapshot = fallback ?? saved?.snapshot;
    if (!outputSnapshot) throw new ReportsApiError('reports_unavailable');
    return {
      id: String(row.id ?? row.attemptId),
      operationId,
      scheduleId: typeof row.scheduleId === 'string' ? row.scheduleId : null,
      kind:
        typeof row.scheduleId === 'string'
          ? 'scheduled'
          : row.delivery === 'email'
            ? 'send_now'
            : 'download',
      status:
        status === 'ready'
          ? 'ready'
          : status === 'sending'
            ? 'sending'
            : status === 'delivered'
              ? 'sent'
              : status === 'failed' || status === 'expired'
                ? 'failed'
                : 'scheduled',
      snapshot: outputSnapshot,
      retryOfAttemptId: null,
      failureCategory: status === 'failed' ? 'unknown' : null,
      requestedAt: epoch(row.requestedAt ?? row.generatedAt),
      completedAt: ['ready', 'delivered', 'failed', 'expired'].includes(status)
        ? epoch(row.updatedAt ?? row.generatedAt)
        : null,
      scheduleStatusAtCompletion: null
    };
  };

  return {
    metadata: {
      id: 'phase10-reports-http',
      capability: reportsServiceCapability.capability,
      majorVersion: reportsServiceCapability.majorVersion,
      kind: 'live',
      availability: baseUrl && options.token ? 'available' : 'unavailable'
    },
    getReport: report,
    async getBreakdown(input) {
      if (input.dimension !== 'category')
        throw new ReportsApiError('report_dimension_unavailable');
      const value = await report(input);
      return (
        value.breakdowns.find((item) => item.dimension === 'category') ??
        breakdown('category', value.dataState)
      );
    },
    async getSchedule() {
      const page = exact(
        await send('GET', '/api/v1/report-schedules?limit=1'),
        ['items', 'nextCursor', 'requestId']
      );
      const item = Array.isArray(page.items) ? page.items[0] : undefined;
      if (item)
        throw new ReportsApiError('report_schedule_settings_unavailable');
      return null;
    },
    async verifyRecipient(email, operationId) {
      const value = object(
        await send(
          'POST',
          '/api/v1/report-schedules/verify-recipient',
          { email },
          operationId
        )
      );
      return {
        value: {
          normalizedEmail: String(value.normalizedEmail),
          status: 'verified',
          verifiedAt: epoch(value.verifiedAt),
          failureCategory: null
        },
        affectedScopes: ['reports.schedule']
      };
    },
    async saveSchedule(input, expectedVersion, operationId) {
      void input;
      void expectedVersion;
      void operationId;
      throw new ReportsApiError('report_schedule_settings_unavailable');
    },
    async setScheduleStatus(status, expectedVersion, operationId) {
      void status;
      void expectedVersion;
      void operationId;
      throw new ReportsApiError('report_schedule_settings_unavailable');
    },
    saveScheduleDraft: (value) => local.saveDraft(value),
    loadScheduleDraft: () => local.loadDraft(),
    discardScheduleDraft: () => local.discardDraft(),
    async previewOutput(input) {
      const value = await report(input);
      const result = {
        previewId: `preview:${value.key}:${input.detailLevel}`,
        snapshot: snapshot(value, input.language, input.detailLevel),
        recipientEmail: input.recipientEmail ?? null
      };
      previews.set(result.previewId, result);
      return result;
    },
    async requestOutput(input, operationId) {
      if (input.kind === 'retry') {
        await send(
          'POST',
          `/api/v1/reports/${encodeURIComponent(input.previousAttemptId)}/retry-delivery`,
          undefined,
          operationId
        );
        const value = await this.getAttempt(input.previousAttemptId);
        return { value, affectedScopes: ['reports.attempts'] };
      }
      if (input.kind === 'scheduled')
        throw new ReportsApiError('reports_unavailable');
      const preview = previews.get(input.previewId);
      if (!preview) throw new ReportsApiError('stale_preview');
      const body = {
        type: 'financial_summary',
        periodStart: preview.snapshot.period.startDate,
        periodEnd: preview.snapshot.period.endDate,
        format: 'pdf',
        delivery:
          input.kind === 'download' || input.kind === 'share'
            ? 'download'
            : 'email',
        recipient:
          input.kind === 'download' || input.kind === 'share'
            ? null
            : preview.recipientEmail
      };
      const accepted = object(
        await send('POST', '/api/v1/reports', body, operationId)
      );
      const value = attempt(accepted, preview.snapshot, operationId);
      attempts.set(value.id, value);
      await local.saveAttempt(value);
      return { value, affectedScopes: ['reports.attempts'] };
    },
    async listAttempts(input) {
      const query = new URLSearchParams({
        limit: '100',
        ...(input?.scheduleId ? { scheduleId: input.scheduleId } : {}),
        ...(input?.status
          ? { status: input.status === 'sent' ? 'delivered' : input.status }
          : {})
      });
      const page = exact(
        await send('GET', `/api/v1/reports?${query.toString()}`),
        ['items', 'nextCursor', 'requestId']
      );
      if (page.nextCursor !== null)
        throw new ReportsApiError('report_attempt_paging_unavailable');
      const persisted = new Map(
        (await local.listAttempts()).map((item) => [item.id, item])
      );
      const items = Array.isArray(page.items)
        ? page.items.map((item) => {
            const row = object(item),
              saved = persisted.get(String(row.id));
            const mapped = attempt(row, saved?.snapshot, saved?.operationId);
            attempts.set(mapped.id, mapped);
            return mapped;
          })
        : [];
      return {
        items,
        nextCursor:
          typeof page.nextCursor === 'string' ? page.nextCursor : null,
        total: items.length
      };
    },
    async getAttempt(id) {
      const saved = (await local.listAttempts()).find(
        (attempt) => attempt.id === id
      );
      const value = attempt(
        await send('GET', `/api/v1/reports/${encodeURIComponent(id)}`),
        saved?.snapshot,
        saved?.operationId
      );
      attempts.set(id, value);
      await local.saveAttempt(value);
      return value;
    }
  };
}

function categoryBreakdown(
  values: unknown[],
  period: FinancialReport['period'],
  currencyCode: string,
  reportKey: string
): ReportBreakdown {
  const items = values
    .map((value) =>
      exact(value, [
        'categoryId',
        'labelAr',
        'labelEn',
        'currencyCode',
        'expenseMinor',
        'transactionCount'
      ])
    )
    .filter((row) => row.currencyCode === currencyCode)
    .map((row) => ({
      id: String(row.categoryId),
      label: String(row.labelEn),
      value: available(money(integer(row.expenseMinor), currencyCode)),
      metricKind: 'category_spend' as const,
      transactionIds: [],
      drillDown: {
        kind: 'transactions' as const,
        filters: {
          ...emptyTransactionFilters,
          periodStart: period.startInstant,
          periodEnd: period.endExclusiveInstant - 1,
          categoryIds: [String(row.categoryId)]
        },
        returnContext: { reportKey, period, dimension: String(row.categoryId) }
      }
    }));
  return {
    dimension: 'category',
    questionKey: 'reports.chart.categories',
    summaryKey: 'reports.chart.categoriesSummary',
    items,
    dataState: items.length ? 'complete' : 'empty'
  };
}
