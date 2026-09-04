import { available, money, resolveReportPeriod, unavailable, type FinancialReport, type ReportBreakdown, type ReportOutputAttempt, type ReportPreview, type ReportSchedule, type ReportScheduleInput, type ReportSnapshot } from '@/domain/reports';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { reportsServiceCapability, type ReportsService } from '@/services/contracts/reports-service';
import { ReportsRepository } from '@/storage/reports-repository';

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;

export class ReportsApiError extends Error {
  constructor(readonly code: string) { super(code); }
}

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReportsApiError('reports_unavailable');
  return value as Json;
}
function number(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function epoch(value: unknown): number { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Date.now(); }

export function createLiveReportsService(options: {
  baseUrl?: string;
  token?: TokenProvider;
  request?: typeof fetch;
  repository?: ReportsRepository;
} = {}): CapabilityProviderHandle<ReportsService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';
  const token = options.token ?? (() => Promise.reject(new ReportsApiError('reports_unavailable')));
  const request = options.request ?? fetch;
  const local = options.repository ?? new ReportsRepository(false);
  const previews = new Map<string, ReportPreview>();
  const attempts = new Map<string, ReportOutputAttempt>();

  const send = async (method: string, path: string, body?: unknown, key?: string): Promise<unknown> => {
    if (!baseUrl) throw new ReportsApiError('reports_unavailable');
    let response: Response;
    try {
      response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw new ReportsApiError('offline'); }
    const value: unknown = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new ReportsApiError(response.status === 403 ? 'permission_required' : response.status === 404 ? 'not_found' : response.status === 409 ? 'conflict' : response.status === 410 ? 'expired' : 'reports_unavailable');
    return value;
  };

  const report = async (input: Parameters<ReportsService['getReport']>[0]): Promise<FinancialReport> => {
    const response = object(await send('GET', `/api/v1/reports/summary?type=financial_summary&period=${encodeURIComponent(input.kind)}&currency=${encodeURIComponent(input.currencyCode)}`));
    const metadata = object(response.metadata), summaries = Array.isArray(response.summaries) ? response.summaries.map(object) : [];
    const selected = summaries.find((item) => object(item.income).currency === input.currencyCode) ?? {};
    const income = number(object(selected.income ?? {}).amountMinor), expense = number(object(selected.expense ?? {}).amountMinor), net = number(object(selected.netCashFlow ?? {}).amountMinor);
    const period = resolveReportPeriod({ ...input, now: epoch(metadata.generatedAt) });
    return {
      key: `report:${input.kind}:${input.anchorDate}:${input.currencyCode}`, period, currencyCode: input.currencyCode,
      generatedAt: epoch(metadata.generatedAt), dataAsOf: epoch((Array.isArray(metadata.evidence) ? object(metadata.evidence[0] ?? {}).asOf : metadata.generatedAt)),
      dataState: metadata.dataState === 'empty' ? 'empty' : 'complete', completenessReasons: [],
      summary: {
        income: available(money(income, input.currencyCode)), expense: available(money(expense, input.currencyCode)), netCashFlow: available(money(net, input.currencyCode)),
        savingsRateBasisPoints: available(number(selected.savingsRateBasisPoints)), obligationPayments: unavailable('insufficient_history'),
        largestCategory: unavailable('insufficient_history'), largestTransaction: unavailable('insufficient_history'), comparisons: []
      }, breakdowns: [], insights: []
    };
  };

  const breakdown = (dimension: ReportBreakdown['dimension'], dataState: FinancialReport['dataState']): ReportBreakdown => ({ dimension, questionKey: `reports.${dimension}.question`, summaryKey: `reports.${dimension}.summary`, items: [], dataState });
  const schedule = (value: unknown, input?: ReportScheduleInput): ReportSchedule => {
    const row = object(value), enabled = row.enabled === true, now = epoch(row.updatedAt);
    return {
      id: String(row.id), version: number(row.version), status: enabled ? 'active' : (input?.status === 'disabled' ? 'disabled' : 'paused'),
      recipient: { normalizedEmail: typeof row.recipientMasked === 'string' ? row.recipientMasked : input?.recipientEmail ?? '', status: row.deliveryChannel === 'email' ? 'verified' : 'unverified', verifiedAt: row.deliveryChannel === 'email' ? now : null, failureCategory: null },
      frequency: row.frequency as ReportSchedule['frequency'], language: input?.language ?? 'ar', currencyCode: input?.currencyCode ?? 'SAR', deliveryDay: input?.deliveryDay ?? 1,
      timeZone: String(row.timezone), includeAssistantSummary: input?.includeAssistantSummary ?? false, detailLevel: input?.detailLevel ?? 'summary',
      lastSuccessfulAttemptId: null, nextDeliveryAt: enabled ? epoch(row.nextRunAt) : null, createdAt: epoch(row.createdAt), updatedAt: now
    };
  };
  const snapshot = (value: FinancialReport, language: 'ar' | 'en', detailLevel: 'summary' | 'detailed'): ReportSnapshot => ({
    period: value.period, generatedAt: value.generatedAt, dataAsOf: value.dataAsOf, language, currencyCode: value.currencyCode,
    detailLevel, dataState: value.dataState, notices: [], summary: value.summary, breakdowns: value.breakdowns, detailedRows: []
  });
  const attempt = (value: unknown, fallback?: ReportSnapshot, operationId = ''): ReportOutputAttempt => {
    const row = object(value), status = String(row.status);
    const saved = attempts.get(String(row.id ?? row.attemptId));
    if (!fallback && !saved) throw new ReportsApiError('reports_unavailable');
    const outputSnapshot = fallback ?? saved?.snapshot;
    if (!outputSnapshot) throw new ReportsApiError('reports_unavailable');
    return {
      id: String(row.id ?? row.attemptId), operationId, scheduleId: typeof row.scheduleId === 'string' ? row.scheduleId : null, kind: 'download',
      status: status === 'ready' ? 'ready' : status === 'sending' ? 'sending' : status === 'delivered' ? 'sent' : status === 'failed' || status === 'expired' ? 'failed' : 'scheduled',
      snapshot: outputSnapshot, retryOfAttemptId: null, failureCategory: status === 'failed' ? 'unknown' : null,
      requestedAt: epoch(row.requestedAt ?? row.generatedAt), completedAt: ['ready', 'delivered', 'failed', 'expired'].includes(status) ? epoch(row.updatedAt ?? row.generatedAt) : null, scheduleStatusAtCompletion: null
    };
  };

  return {
    metadata: { id: 'phase10-reports-http', capability: reportsServiceCapability.capability, majorVersion: reportsServiceCapability.majorVersion, kind: 'live', availability: baseUrl && options.token ? 'available' : 'unavailable' },
    getReport: report,
    async getBreakdown(input) { const value = await report(input); return value.breakdowns.find((item) => item.dimension === input.dimension) ?? breakdown(input.dimension, value.dataState); },
    async getSchedule() { const page = object(await send('GET', '/api/v1/report-schedules?limit=1')); const item = Array.isArray(page.items) ? page.items[0] : undefined; return item ? schedule(item) : null; },
    async verifyRecipient(email, operationId) { const value = object(await send('POST', '/api/v1/report-schedules/verify-recipient', { email }, operationId)); return { value: { normalizedEmail: String(value.normalizedEmail), status: 'verified', verifiedAt: epoch(value.verifiedAt), failureCategory: null }, affectedScopes: ['reports.schedule'] }; },
    async saveSchedule(input, expectedVersion, operationId) {
      const current = await this.getSchedule();
      const body = { reportType: 'financial_summary', frequency: input.frequency, timezone: input.timeZone, deliveryChannel: 'email', recipient: input.recipientEmail, enabled: input.status !== 'paused' && input.status !== 'disabled' };
      const value = expectedVersion === null || !current
        ? await send('POST', '/api/v1/report-schedules', body, operationId)
        : await send('PATCH', `/api/v1/report-schedules/${encodeURIComponent(current.id)}`, { expectedVersion, ...body }, operationId);
      return { value: schedule(value, input), affectedScopes: ['reports.schedule'] };
    },
    async setScheduleStatus(status, expectedVersion, operationId) {
      const current = await this.getSchedule(); if (!current) throw new ReportsApiError('not_found');
      if (status === 'disabled') { await send('DELETE', `/api/v1/report-schedules/${encodeURIComponent(current.id)}?expectedVersion=${String(expectedVersion)}`, undefined, operationId); return { value: { ...current, status, version: current.version + 1, nextDeliveryAt: null }, affectedScopes: ['reports.schedule'] }; }
      const value = await send('PATCH', `/api/v1/report-schedules/${encodeURIComponent(current.id)}`, { expectedVersion, enabled: status === 'active' }, operationId);
      return { value: { ...schedule(value), status }, affectedScopes: ['reports.schedule'] };
    },
    saveScheduleDraft: (value) => local.saveDraft(value), loadScheduleDraft: () => local.loadDraft(), discardScheduleDraft: () => local.discardDraft(),
    async previewOutput(input) { const value = await report(input); const result = { previewId: `preview:${value.key}:${input.detailLevel}`, snapshot: snapshot(value, input.language, input.detailLevel), recipientEmail: input.recipientEmail ?? null }; previews.set(result.previewId, result); return result; },
    async requestOutput(input, operationId) {
      if (input.kind === 'retry') { await send('POST', `/api/v1/reports/${encodeURIComponent(input.previousAttemptId)}/retry-delivery`, undefined, operationId); const value = await this.getAttempt(input.previousAttemptId); return { value, affectedScopes: ['reports.attempts'] }; }
      const preview = input.kind === 'scheduled' ? [...previews.values()][0] : previews.get(input.previewId); if (!preview) throw new ReportsApiError('stale_preview');
      const body = { type: 'financial_summary', periodStart: preview.snapshot.period.startDate, periodEnd: preview.snapshot.period.endDate, format: input.kind === 'download' ? 'pdf' : 'pdf', delivery: input.kind === 'download' || input.kind === 'share' ? 'download' : 'email', recipient: input.kind === 'download' || input.kind === 'share' ? null : preview.recipientEmail };
      const accepted = object(await send('POST', '/api/v1/reports', body, operationId)); const value = attempt(accepted, preview.snapshot, operationId); attempts.set(value.id, value); await local.saveAttempt(value); return { value, affectedScopes: ['reports.attempts'] };
    },
    async listAttempts(input) { const query = new URLSearchParams({ limit: '100', ...(input?.scheduleId ? { scheduleId: input.scheduleId } : {}), ...(input?.status ? { status: input.status === 'sent' ? 'delivered' : input.status } : {}) }); const page = object(await send('GET', `/api/v1/reports?${query.toString()}`)); const persisted = new Map((await local.listAttempts()).map((item) => [item.id, item])); const items = Array.isArray(page.items) ? page.items.flatMap((item) => { try { const row = object(item), saved = persisted.get(String(row.id)); const mapped = attempt(row, saved?.snapshot, saved?.operationId); attempts.set(mapped.id, mapped); return [mapped]; } catch { return []; } }) : []; return { items, nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null, total: items.length }; },
    async getAttempt(id) { const saved = await local.requireAttempt(id).catch(() => undefined); const value = attempt(await send('GET', `/api/v1/reports/${encodeURIComponent(id)}`), saved?.snapshot, saved?.operationId); attempts.set(id, value); await local.saveAttempt(value); return value; }
  };
}
