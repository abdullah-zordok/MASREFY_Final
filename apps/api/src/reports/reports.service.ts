import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { ReportsCache } from './reports.cache';
import { normalizeSummaryQuery } from './reports.dto';
import { localDateAt, resolveReportPeriod } from './reports.period';
import { ReportsRepository } from './reports.repository';

@Injectable()
export class ReportsService {
  private readonly reportCache = new ReportsCache(500, 300_000);
  private readonly dashboardCache = new ReportsCache(500, 60_000);

  constructor(private readonly repository: ReportsRepository) {}

  async getReportSummary(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
    now = new Date(),
  ): Promise<unknown> {
    return this.summary('report', principal, query, requestId, now);
  }

  async getDashboardHome(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
    now = new Date(),
  ): Promise<unknown> {
    return this.summary('dashboard', principal, query, requestId, now);
  }

  invalidate(owner: string): void {
    this.reportCache.invalidate(owner);
    this.dashboardCache.invalidate(owner);
  }

  private async summary(
    namespace: 'dashboard' | 'report',
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
    now: Date,
  ): Promise<unknown> {
    let normalized;
    try {
      normalized = normalizeSummaryQuery(query, namespace === 'report');
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const context = await this.repository.getContext(principal);
    const period = resolveReportPeriod(
      normalized.period,
      localDateAt(now, context.timezone),
      context.timezone,
    );
    const key = ReportsCache.key(
      principal.userId,
      namespace,
      `${normalized.type}:${normalized.period}`,
      normalized.currency ?? 'all',
      context.ledgerVersion,
    );
    const cache = namespace === 'report' ? this.reportCache : this.dashboardCache;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result =
      namespace === 'report'
        ? await this.repository.getSummary(principal, normalized.type, period, normalized.currency, requestId)
        : await this.repository.getHome(principal, period, normalized.currency, requestId);
    const version = (result as { metadata?: { ledgerVersion?: number } }).metadata?.ledgerVersion;
    if (version === context.ledgerVersion) cache.set(key, result);
    return result;
  }
}
