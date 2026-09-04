import { HttpException, Injectable, Optional } from '@nestjs/common';

import { ClerkClientService } from '../identity/clerk-client.service';
import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from '../ledger/idempotency';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { ReportsCache } from './reports.cache';
import {
  normalizeAdminExportRequest,
  normalizeAdminOverviewQuery,
  normalizeCreateReport,
  normalizeReportList,
  normalizeScheduleCreate,
  normalizeSchedulePatch,
  normalizeSummaryQuery,
  normalizeVerifyRecipient,
} from './reports.dto';
import {
  firstScheduleRun,
  localDateAt,
  resolveReportPeriod,
  type ReportPeriod as ScheduleFrequency,
} from './reports.period';
import { ReportsRepository, type AdminReportCounts } from './reports.repository';
import { isReportUuid, parseReportSnapshot } from './reports.schemas';
import { ReportsStorage } from './reports.storage';

@Injectable()
export class ReportsService {
  private readonly reportCache = new ReportsCache(500, 300_000);
  private readonly dashboardCache = new ReportsCache(500, 60_000);

  constructor(
    private readonly repository: ReportsRepository,
    @Optional() private readonly storage?: ReportsStorage,
    @Optional() private readonly config?: PlatformConfigService,
    @Optional() private readonly identity?: ClerkClientService,
  ) {}

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

  async createReport(
    principal: ClerkPrincipal,
    body: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireRecent(principal);
    try {
      hashIdempotencyKey(idempotencyKey);
      const command = normalizeCreateReport(body);
      if (command.delivery === 'email') {
        const identity = await this.identity?.getIdentityUser(principal.userId);
        if (!identity?.primaryEmail || identity.primaryEmail.toLowerCase() !== command.recipient)
          throw new HttpException({ code: 'REPORT_RECIPIENT_UNVERIFIED' }, 403);
      }
      return await this.repository.captureSnapshot(
        principal,
        { ...command, recipient: null },
        idempotencyKey,
        requestId,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  listReportAttempts(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      return this.repository.listAttempts(principal, normalizeReportList(query), requestId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  async getReportAttempt(
    principal: ClerkPrincipal,
    attemptId: string,
    requestId: string,
    now = new Date(),
  ): Promise<unknown> {
    this.requireRecent(principal);
    if (!isReportUuid(attemptId)) throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    const attempt = await this.repository.getAttempt(principal, attemptId, requestId);
    if (new Date(String(attempt.expiresAt)).getTime() <= now.getTime())
      throw new HttpException({ code: 'REPORT_EXPIRED' }, 410);
    const { storageRef, ...safe } = attempt;
    if (
      (attempt.status === 'ready' || attempt.status === 'delivered') &&
      typeof storageRef === 'string'
    ) {
      if (!this.storage) throw new HttpException({ code: 'REPORT_STORAGE_UNAVAILABLE' }, 503);
      const ttl = this.config?.get('MASARIFI_REPORT_SIGNED_URL_SECONDS') ?? 300;
      return { ...safe, downloadUrl: await this.storage.sign(storageRef, ttl) };
    }
    return safe;
  }

  retryReportDelivery(
    principal: ClerkPrincipal,
    attemptId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireRecent(principal);
    try {
      if (!isReportUuid(attemptId)) throw new Error('INVALID');
      hashIdempotencyKey(idempotencyKey);
      return this.repository.retryDelivery(principal, attemptId, idempotencyKey, requestId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  async getAdminOverview(
    principal: ClerkPrincipal,
    query: unknown,
  ): Promise<Record<string, unknown>> {
    const normalized = this.adminQuery(query);
    const counts = await this.repository.getAdminReportCounts(
      principal,
      String(normalized.platform),
      this.periodDays(String(normalized.period)),
    );
    return this.adminOverviewResponse(normalized, counts);
  }

  async getAdminPlatformAnalytics(
    principal: ClerkPrincipal,
    query: unknown,
  ): Promise<Record<string, unknown>> {
    const normalized = this.adminQuery(query);
    const counts = await this.repository.getAdminReportCounts(
      principal,
      String(normalized.platform),
      this.periodDays(String(normalized.period)),
    );
    const now = new Date().toISOString(),
      period = String(normalized.period),
      platform = String(normalized.platform);
    const freshness = { state: 'fresh', asOf: now };
    const point = (value: number) => [{ timestamp: now, value }];
    const trend = (id: string, label: string, kind: string, value: number, unit = 'customers') => ({
      id,
      label,
      kind,
      unit,
      period,
      platformScope: platform,
      points: point(value),
      summary: label,
    });
    const iosOnly = counts.iosUsers - counts.bothUsers,
      androidOnly = counts.androidUsers - counts.bothUsers;
    return {
      query: normalized,
      customers: {
        uniqueCustomersTotal: counts.iosUsers + counts.androidUsers - counts.bothUsers,
        iosCustomers: counts.iosUsers,
        androidCustomers: counts.androidUsers,
        iosOnlyCustomers: iosOnly,
        androidOnlyCustomers: androidOnly,
        multiPlatformCustomers: counts.bothUsers,
        activeCustomersTotal: counts.iosUsers + counts.androidUsers - counts.bothUsers,
        activeIosCustomers: counts.iosUsers,
        activeAndroidCustomers: counts.androidUsers,
        newCustomersTotal: 0,
        newIosCustomers: 0,
        newAndroidCustomers: 0,
        period,
        freshness,
      },
      userGrowth: trend('user-growth', 'User growth', 'unique-customers', counts.newUsers),
      dailyActiveUsers: trend(
        'daily-active',
        'Daily active users',
        'unique-customers',
        counts.iosUsers + counts.androidUsers - counts.bothUsers,
      ),
      monthlyActiveUsers: trend(
        'monthly-active',
        'Monthly active users',
        'unique-customers',
        counts.iosUsers + counts.androidUsers - counts.bothUsers,
      ),
      versions: [],
      capabilities: [],
      devices: [
        {
          platform: 'ios',
          category: 'active',
          deviceCount: counts.iosDevices,
          share:
            counts.iosDevices + counts.androidDevices === 0
              ? 0
              : counts.iosDevices / (counts.iosDevices + counts.androidDevices),
        },
        {
          platform: 'android',
          category: 'active',
          deviceCount: counts.androidDevices,
          share:
            counts.iosDevices + counts.androidDevices === 0
              ? 0
              : counts.androidDevices / (counts.iosDevices + counts.androidDevices),
        },
      ],
      imports: [],
      support: [],
      comparisonTrends: [],
      errorRateTrend: trend('error-rate', 'Error rate', 'events', 0, 'ratio'),
      regions: [{ region: 'customers', availability: 'available', retryable: true }],
    };
  }

  async getAdminOverviewActivity(
    principal: ClerkPrincipal,
    query: unknown,
  ): Promise<Record<string, unknown>> {
    let normalized: Record<string, unknown>;
    try {
      normalized = normalizeAdminOverviewQuery(query, true);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const page = Number(normalized.page),
      pageSize = Number(normalized.pageSize);
    const activity = await this.repository.getAdminOverviewActivity(principal, {
      platform: String(normalized.platform),
      days: this.periodDays(String(normalized.period)),
      page,
      pageSize,
    });
    return {
      items: activity.items,
      page,
      pageSize,
      totalItems: activity.totalItems,
      totalPages: Math.ceil(activity.totalItems / pageSize),
      region: {
        region: 'activity',
        availability: activity.totalItems === 0 ? 'empty' : 'available',
        retryable: true,
        ...(activity.totalItems === 0 ? { message: 'No matching safe activity.' } : {}),
      },
    };
  }

  async createAdminExport(
    principal: ClerkPrincipal,
    body: unknown,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ): Promise<Record<string, unknown>> {
    this.requireRecent(principal);
    let command: Record<string, unknown>;
    try {
      hashIdempotencyKey(idempotencyKey);
      command = normalizeAdminExportRequest(body);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const days = this.periodDays(String(command.period));
    const end = now.toISOString().slice(0, 10);
    const start = new Date(Date.parse(`${end}T00:00:00.000Z`) - (days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const data =
      command.exportType === 'user_report'
        ? await this.repository.getSupportedFinancialReport(
            principal,
            String(command.userId),
            start,
            end,
          )
        : {
            adminAggregate: true,
            counts: await this.repository.getAdminReportCounts(
              principal,
              String(command.platform),
              days,
            ),
          };
    const sourceLedgerVersion = (data as { ledgerVersion?: unknown }).ledgerVersion;
    const ledgerVersion =
      command.exportType === 'user_report' && Number.isSafeInteger(sourceLedgerVersion)
        ? (sourceLedgerVersion as number)
        : 0;
    const snapshot = parseReportSnapshot({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      ledgerVersion,
      reportType: 'account_activity',
      period: {
        startDate: start,
        endDate: end,
        timezone: 'UTC',
        kind: days === 7 ? 'monthly' : days === 30 ? 'monthly' : 'three_months',
      },
      format: command.format,
      delivery: 'download',
      currencyCode: 'SAR',
      dataState: 'complete',
      evidence:
        command.exportType === 'user_report'
          ? [{ kind: 'ledger', version: ledgerVersion, asOf: now.toISOString() }]
          : [],
      summary: data,
      breakdowns: [],
      detailedRows: [],
    });
    return this.repository.captureAdminExport(
      principal,
      command,
      snapshot,
      idempotencyKey,
      requestId,
    );
  }

  getAdminExport(
    principal: ClerkPrincipal,
    attemptId: string,
    requestId: string,
  ): Promise<unknown> {
    return this.getReportAttempt(principal, attemptId, requestId);
  }

  async verifyReportRecipient(
    principal: ClerkPrincipal,
    body: unknown,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<Record<string, unknown>> {
    this.requireRecent(principal);
    let normalized: { email: string };
    try {
      hashIdempotencyKey(idempotencyKey);
      normalized = normalizeVerifyRecipient(body);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const identity = await this.identity?.getIdentityUser(principal.userId);
    if (!identity?.primaryEmail || identity.primaryEmail.toLowerCase() !== normalized.email)
      throw new HttpException({ code: 'REPORT_RECIPIENT_UNVERIFIED' }, 403);
    return {
      normalizedEmail: normalized.email,
      status: 'verified',
      verifiedAt: now.toISOString(),
      failureCategory: null,
    };
  }

  async createReportSchedule(
    principal: ClerkPrincipal,
    body: unknown,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ): Promise<unknown> {
    this.requireRecent(principal);
    let command: Record<string, unknown>;
    try {
      hashIdempotencyKey(idempotencyKey);
      command = normalizeScheduleCreate(body);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    if (command.deliveryChannel === 'email') {
      const identity = await this.identity?.getIdentityUser(principal.userId);
      if (!identity?.primaryEmail || identity.primaryEmail.toLowerCase() !== command.recipient)
        throw new HttpException({ code: 'REPORT_RECIPIENT_UNVERIFIED' }, 403);
    }
    const frequency = command.frequency as 'monthly' | 'three_months' | 'half_year' | 'annual';
    const timezone = String(command.timezone);
    return this.repository.createSchedule(
      principal,
      { ...command, nextRunAt: firstScheduleRun(frequency, timezone, now).toISOString() },
      idempotencyKey,
      requestId,
    );
  }

  listReportSchedules(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error();
      const input = query as Record<string, unknown>;
      if (Object.keys(input).some((key) => !['cursor', 'limit'].includes(key))) throw new Error();
      const normalized = normalizeReportList(input);
      return this.repository.listSchedules(
        principal,
        normalized.cursor,
        normalized.limit,
        requestId,
      );
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  getReportSchedule(
    principal: ClerkPrincipal,
    scheduleId: string,
    requestId: string,
  ): Promise<unknown> {
    if (!isReportUuid(scheduleId)) throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    return this.repository.getSchedule(principal, scheduleId, requestId);
  }

  async updateReportSchedule(
    principal: ClerkPrincipal,
    scheduleId: string,
    body: unknown,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ): Promise<unknown> {
    this.requireRecent(principal);
    let normalized: ReturnType<typeof normalizeSchedulePatch>;
    try {
      if (!isReportUuid(scheduleId)) throw new Error();
      hashIdempotencyKey(idempotencyKey);
      normalized = normalizeSchedulePatch(body);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const current = await this.repository.getScheduleState(principal, scheduleId);
    const command: Record<string, unknown> = {
      id: scheduleId,
      expectedVersion: normalized.expectedVersion,
      reportType: normalized.patch.reportType ?? current.report_type,
      frequency: normalized.patch.frequency ?? current.frequency,
      timezone: normalized.patch.timezone ?? current.timezone,
      deliveryChannel: normalized.patch.deliveryChannel ?? current.delivery_channel,
      recipient:
        normalized.patch.recipient !== undefined ? normalized.patch.recipient : current.recipient,
      enabled: normalized.patch.enabled ?? current.enabled,
    };
    if (command.deliveryChannel === 'download') command.recipient = null;
    if (command.deliveryChannel === 'email')
      await this.assertVerifiedRecipient(principal, command.recipient);
    const timingChanged =
      normalized.patch.frequency !== undefined ||
      normalized.patch.timezone !== undefined ||
      (normalized.patch.enabled === true && !current.enabled);
    command.nextRunAt = timingChanged
      ? firstScheduleRun(
          command.frequency as ScheduleFrequency,
          String(command.timezone),
          now,
        ).toISOString()
      : current.next_run_at.toISOString();
    return this.repository.updateSchedule(principal, command, idempotencyKey, requestId);
  }

  async deleteReportSchedule(
    principal: ClerkPrincipal,
    scheduleId: string,
    expectedVersion: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<void> {
    const parsedVersion =
      typeof expectedVersion === 'string' && /^\d+$/.test(expectedVersion)
        ? Number(expectedVersion)
        : expectedVersion;
    if (
      !isReportUuid(scheduleId) ||
      !Number.isSafeInteger(parsedVersion) ||
      Number(parsedVersion) < 1
    )
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    await this.repository.deleteSchedule(
      principal,
      scheduleId,
      Number(parsedVersion),
      idempotencyKey,
      requestId,
    );
  }

  private async assertVerifiedRecipient(
    principal: ClerkPrincipal,
    recipient: unknown,
  ): Promise<void> {
    const identity = await this.identity?.getIdentityUser(principal.userId);
    if (
      typeof recipient !== 'string' ||
      !identity?.primaryEmail ||
      identity.primaryEmail.toLowerCase() !== recipient
    )
      throw new HttpException({ code: 'REPORT_RECIPIENT_UNVERIFIED' }, 403);
  }

  private adminQuery(query: unknown): Record<string, unknown> {
    try {
      return normalizeAdminOverviewQuery(query);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  private periodDays(period: string): number {
    return period === '7d' ? 7 : period === '90d' ? 90 : 30;
  }

  private adminOverviewResponse(
    query: Record<string, unknown>,
    counts: AdminReportCounts,
  ): Record<string, unknown> {
    const now = new Date().toISOString(),
      period = String(query.period),
      platform = String(query.platform);
    const freshness = { state: 'fresh', asOf: now };
    return {
      query,
      metrics: [
        {
          id: 'unique-customers',
          label: 'Unique customers',
          numericValue: counts.totalUsers,
          formattedValue: String(counts.totalUsers),
          kind: 'unique-customers',
          platformScope: platform,
          period,
          freshness,
        },
      ],
      subscriptionRevenue: {
        paidCustomers: 0,
        freeCustomers: counts.totalUsers,
        recurringRevenue: 0,
        currency: 'SAR',
        distribution: [
          {
            plan: 'unclassified',
            customers: counts.totalUsers,
            share: counts.totalUsers === 0 ? 0 : 1,
          },
        ],
        revenueTrend: {
          id: 'recurring-revenue',
          label: 'Recurring revenue',
          kind: 'currency',
          unit: 'SAR',
          period,
          platformScope: platform,
          points: [{ timestamp: now, value: 0 }],
          summary: 'No billing projection is exposed by reports.',
        },
        freshness,
      },
      operationalMetrics: [],
      serviceHealth: [],
      regions: [
        {
          region: 'metrics',
          availability: counts.totalUsers === 0 ? 'empty' : 'available',
          retryable: true,
        },
      ],
      freshness,
    };
  }

  private requireRecent(principal: ClerkPrincipal): void {
    const maximum = this.config?.get('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS') ?? 300;
    if (principal.factorAgeSeconds === null || principal.factorAgeSeconds > maximum)
      throw new HttpException({ code: 'RECENT_AUTH_REQUIRED' }, 403);
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
        ? await this.repository.getSummary(
            principal,
            normalized.type,
            period,
            normalized.currency,
            requestId,
          )
        : await this.repository.getHome(principal, period, normalized.currency, requestId);
    const version = (result as { metadata?: { ledgerVersion?: number } }).metadata?.ledgerVersion;
    if (version === context.ledgerVersion) cache.set(key, result);
    return result;
  }
}
