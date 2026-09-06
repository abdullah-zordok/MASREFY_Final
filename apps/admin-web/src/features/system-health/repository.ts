import { apiClient, liveCursor, mocksEnabled, rememberLiveCursor } from "@/core/api/client";
import type { z } from "zod";
import {
  apiMonitoringSchema,
  databaseMonitoringSchema,
  healthOverviewSchema,
  jobRunDetailSchema,
  jobRunIdSchema,
  jobRunsQuerySchema,
  cancelJobResultSchema,
  jobActionRequestSchema,
  paginatedJobRunsSchema,
  providerHealthPageSchema,
  providerHealthQuerySchema,
  queueHealthPageSchema,
  queueHealthQuerySchema,
  retryJobResultSchema,
  scheduledJobsPageSchema,
  scheduledJobsQuerySchema,
  storageMonitoringSchema,
  phase13HealthOverviewSchema,
  phase13JobActionResultSchema,
  phase13JobRunDetailSchema,
  phase13JobRunPageSchema,
  phase13PerformanceSchema,
  phase13ProviderPageSchema,
  phase13QueueSummarySchema,
  phase13RecoverySchema,
  phase13ScheduledJobPageSchema,
  operationalRangeSchema,
  platformScopeSchema,
  type ApiMonitoring,
  type DatabaseMonitoring,
  type HealthOverview,
  type JobRunDetail,
  type JobRunsQuery,
  type JobActionRequest,
  type OperationalRange,
  type PaginatedJobRuns,
  type ProviderHealthPage,
  type ProviderHealthQuery,
  type QueueHealthPage,
  type QueueHealthQuery,
  type ScheduledJobsPage,
  type ScheduledJobsQuery,
  type StorageMonitoring,
} from "./contracts";

export interface HealthOverviewQuery {
  range: OperationalRange;
  platform: "all" | "ios" | "android";
  scenario?: string;
}

export type MonitoringQuery = HealthOverviewQuery;

export interface SystemHealthRepository {
  getHealthOverview(query: HealthOverviewQuery): Promise<HealthOverview>;
  getApiMonitoring(query: MonitoringQuery): Promise<ApiMonitoring>;
  getDatabaseMonitoring(query: MonitoringQuery): Promise<DatabaseMonitoring>;
  getStorageMonitoring(query: MonitoringQuery): Promise<StorageMonitoring>;
  listProviderHealth(query: ProviderHealthQuery): Promise<ProviderHealthPage>;
  listQueueHealth(query: QueueHealthQuery): Promise<QueueHealthPage>;
  listJobRuns(query: JobRunsQuery): Promise<PaginatedJobRuns>;
  getJobRun(jobRunId: string): Promise<JobRunDetail>;
  retryJobRun(jobRunId: string, request: JobActionRequest): Promise<z.infer<typeof phase13JobActionResultSchema>>;
  cancelJobRun(jobRunId: string, request: JobActionRequest): Promise<z.infer<typeof phase13JobActionResultSchema>>;
  listScheduledJobs(query: ScheduledJobsQuery): Promise<ScheduledJobsPage>;
}

type Phase13Freshness = z.infer<typeof phase13HealthOverviewSchema>["freshness"];
type Phase13JobRun = z.infer<typeof phase13JobRunPageSchema>["items"][number];
type ServiceCategory = z.infer<typeof healthOverviewSchema>["services"][number]["category"];
const serviceCategories: readonly ServiceCategory[] = ["api", "database", "auth", "storage", "cache", "workers", "payments", "ai", "email", "push", "exchange_rates", "monitoring"];

const unavailableMetric = (
  key: string,
  label: string,
  unit: "count" | "percent" | "milliseconds" | "seconds" | "bytes" | "ratio",
  freshness: Phase13Freshness,
  value: number | null = null,
) => ({ key, label, value, unit, semantic: "selected_range" as const, completeness: value === null ? "unavailable" as const : "complete" as const, freshness });

function healthStatus(status: string) {
  return status === "operational" || status === "up"
    ? "operational" as const
    : status === "degraded"
      ? "degraded" as const
      : status === "maintenance"
        ? "maintenance" as const
        : status === "unknown"
          ? "unknown" as const
          : "major_outage" as const;
}

function queueKey(jobKey: string) {
  const prefix = jobKey.split(/[.-]/u)[0];
  if (["import", "parser", "raw", "tracking"].includes(prefix ?? "")) return "tracking" as const;
  if (["voice", "assistant"].includes(prefix ?? "")) return "ai" as const;
  if (["report"].includes(prefix ?? "")) return "reports" as const;
  if (["source", "notification", "support"].includes(prefix ?? "")) return "notifications" as const;
  if (["privacy", "retention"].includes(prefix ?? "")) return "security" as const;
  if (["clerk"].includes(prefix ?? "")) return "identity" as const;
  if (["sync", "idempotency", "conflicts"].includes(prefix ?? "")) return "sync" as const;
  if (["ledger", "planning", "operations", "ai"].includes(prefix ?? "")) return prefix as "ledger" | "planning" | "operations" | "ai";
  return "platform" as const;
}

function jobState(status: Phase13JobRun["status"]) {
  return ({ queued: "waiting", running: "active", succeeded: "completed", failed: "failed", retrying: "delayed", dead_lettered: "failed", canceled: "cancelled" } as const)[status];
}

function adaptRun(run: Phase13JobRun) {
  return {
    id: run.id,
    name: run.jobKey,
    queue: queueKey(run.jobKey),
    state: jobState(run.status),
    attempt: 1,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.startedAt && run.completedAt ? Math.max(0, Date.parse(run.completedAt) - Date.parse(run.startedAt)) : null,
    safeErrorCode: null,
    summary: Object.keys(run.summary).length ? "Safe result metadata recorded." : "No result metadata.",
    correlationId: run.correlationId,
    platform: null,
    appVersion: null,
    version: run.version,
    retryOfJobRunId: null,
    access: "full" as const,
  };
}

function monitoringParams(query: MonitoringQuery): string {
  const range = operationalRangeSchema.parse(query.range);
  const platform = platformScopeSchema.extract(["all", "ios", "android"]).parse(query.platform);
  const params = new URLSearchParams({ range, platform });
  if (query.scenario) params.set("__scenario", query.scenario);
  return params.toString();
}

export const systemHealthRepository: SystemHealthRepository = {
  async getHealthOverview(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/overview?${monitoringParams(query)}`, healthOverviewSchema);
    const liveParams = new URLSearchParams({ range: query.range, platform: query.platform });
    const value = await apiClient.get(`/api/v1/admin/system-health/overview?${liveParams.toString()}`, phase13HealthOverviewSchema);
    const services = new Map(value.services.map((service) => [service.key === "identity" ? "auth" : service.key, service]));
    return healthOverviewSchema.parse({
      range: query.range,
      summary: `Overall status: ${value.status}`,
      services: serviceCategories.map((category) => {
        const service = services.get(category);
        const freshness = service?.freshness ?? value.freshness;
        return {
          id: `SVC-${category.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
          name: category,
          category,
          status: service ? healthStatus(service.status) : "unknown",
          uptime: unavailableMetric("uptime", "Uptime", "percent", freshness),
          latency: unavailableMetric("latency", "Latency", "milliseconds", freshness, service?.latencyMs ?? null),
          errorRate: unavailableMetric("error_rate", "Error rate", "percent", freshness),
          freshness,
        };
      }),
      freshness: value.freshness,
      partial: value.partial,
    });
  },
  async getApiMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/api?${monitoringParams(query)}`, apiMonitoringSchema);
    const value = await apiClient.get(`/api/v1/admin/performance?range=${query.range}`, phase13PerformanceSchema);
    const budget = Object.values(value.budgets)[0];
    return apiMonitoringSchema.parse({
      range: value.range,
      requestVolume: unavailableMetric("request_volume", "Request volume", "count", value.freshness),
      errorRate: unavailableMetric("error_rate", "Error rate", "percent", value.freshness),
      latency: unavailableMetric("latency", "P95 latency", "milliseconds", value.freshness, budget?.p95 ?? null),
      series: value.series,
      endpoints: [],
      statusCodes: [],
      freshness: value.freshness,
    });
  },
  async getDatabaseMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/database?${monitoringParams(query)}`, databaseMonitoringSchema);
    const value = await apiClient.get("/api/v1/admin/recovery", phase13RecoverySchema);
    const item = value.items.find(({ scope }) => scope === "database");
    const freshness = { observedAt: item?.observedAt ?? new Date().toISOString(), staleAt: new Date(Date.parse(item?.observedAt ?? new Date().toISOString()) + 300_000).toISOString(), state: item ? "fresh" as const : "unknown" as const };
    return databaseMonitoringSchema.parse({
      range: query.range,
      connectionUsage: unavailableMetric("connections", "Connections", "count", freshness),
      queryLatency: unavailableMetric("query_latency", "Query latency", "milliseconds", freshness),
      storageUsage: unavailableMetric("storage_usage", "Storage usage", "bytes", freshness),
      slowQueries: [],
      backupState: item?.status === "verified" ? "healthy" : item?.status === "failed" ? "failed" : "unavailable",
      recoveryState: item?.status === "verified" ? "healthy" : item?.status === "failed" ? "degraded" : "unavailable",
      freshness,
    });
  },
  async getStorageMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/storage?${monitoringParams(query)}`, storageMonitoringSchema);
    const value = await apiClient.get("/api/v1/admin/recovery", phase13RecoverySchema);
    const observedAt = value.items[0]?.observedAt ?? new Date().toISOString();
    const freshness = { observedAt, staleAt: new Date(Date.parse(observedAt) + 300_000).toISOString(), state: value.items.length ? "fresh" as const : "unknown" as const };
    return storageMonitoringSchema.parse({
      range: query.range,
      storageUsage: unavailableMetric("storage_usage", "Storage usage", "bytes", freshness),
      uploadCount: unavailableMetric("upload_count", "Uploads", "count", freshness),
      failedUploads: unavailableMetric("failed_uploads", "Failed uploads", "count", freshness),
      temporaryFiles: unavailableMetric("temporary_files", "Temporary files", "count", freshness),
      cleanupState: "unavailable",
      freshness,
    });
  },
  async listProviderHealth(query) {
    const parsed = providerHealthQuerySchema.parse(query);
    const params = new URLSearchParams({
      category: parsed.category,
      status: parsed.status,
      platform: parsed.platform,
      page: String(parsed.page),
      pageSize: String(parsed.pageSize),
      sort: parsed.sort,
    });
    if (parsed.scenario) params.set("__scenario", parsed.scenario);
    const cursorScope = `providers:${parsed.category}:${parsed.status}:${parsed.platform}:${parsed.pageSize}:${parsed.sort}`;
    const cursor = liveCursor(cursorScope, parsed.page);
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (cursor) liveParams.set("cursor", cursor);
    if (parsed.category !== "all" && ["database", "storage", "identity", "ai", "email", "push"].includes(parsed.category)) liveParams.set("provider", parsed.category);
    if (["up", "degraded", "down", "unknown"].includes(parsed.status)) liveParams.set("status", parsed.status);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/providers?${params.toString()}`, providerHealthPageSchema);
    const value = await apiClient.get(`/api/v1/admin/system-health/providers?${liveParams.toString()}`, phase13ProviderPageSchema);
    rememberLiveCursor(cursorScope, parsed.page, value.nextCursor);
    const now = Date.now();
    const aggregateFreshness = value.items.length
      ? {
          observedAt: value.items.reduce((latest, item) => item.checkedAt > latest ? item.checkedAt : latest, value.items[0]!.checkedAt),
          staleAt: value.items.reduce((earliest, item) => item.checkedAt < earliest ? item.checkedAt : earliest, value.items[0]!.checkedAt),
          state: value.items.some((item) => Date.parse(item.checkedAt) + 300_000 < now) ? "stale" as const : "fresh" as const,
        }
      : { observedAt: new Date().toISOString(), staleAt: new Date(Date.now() + 300_000).toISOString(), state: "unknown" as const };
    if (value.items.length) aggregateFreshness.staleAt = new Date(Date.parse(aggregateFreshness.staleAt) + 300_000).toISOString();
    return providerHealthPageSchema.parse({
      items: value.items.map((provider) => {
        const freshness = { observedAt: provider.checkedAt, staleAt: new Date(Date.parse(provider.checkedAt) + 300_000).toISOString(), state: Date.parse(provider.checkedAt) + 300_000 < now ? "stale" as const : "fresh" as const };
        return {
          id: `PRV-${provider.provider.toUpperCase()}`,
          name: provider.provider,
          category: provider.provider,
          status: healthStatus(provider.status),
          latency: unavailableMetric("latency", "Latency", "milliseconds", freshness, provider.latencyMs),
          errorRate: unavailableMetric("error_rate", "Error rate", "percent", freshness),
          lastSuccessAt: provider.status === "up" ? provider.checkedAt : null,
          lastCheckedAt: provider.checkedAt,
          freshness,
          capabilities: [provider.provider],
          fallbackState: "not_applicable",
          safeError: provider.safeCode ?? null,
          platformImpact: { total: 0, ios: 0, android: 0, semantic: "requests", completeness: "unavailable" },
          access: "full",
        };
      }),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: (parsed.page - 1) * parsed.pageSize + value.items.length + (value.nextCursor ? 1 : 0),
      freshness: aggregateFreshness,
      partial: false,
    });
  },
  async listQueueHealth(query) {
    const parsed = queueHealthQuerySchema.parse(query);
    const params = new URLSearchParams({ range: parsed.range, platform: parsed.platform });
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/jobs/queues?${params.toString()}`, queueHealthPageSchema);
    const value = await apiClient.get("/api/v1/admin/jobs/queues", phase13QueueSummarySchema);
    return queueHealthPageSchema.parse({
      items: value.items.map((item) => ({
        queue: queueKey(item.key),
        label: item.key,
        counters: {
          waiting: unavailableMetric("waiting", "Waiting", "count", value.freshness, item.waiting),
          active: unavailableMetric("active", "Active", "count", value.freshness, item.active),
          delayed: unavailableMetric("delayed", "Delayed", "count", value.freshness),
          completed: unavailableMetric("completed", "Completed", "count", value.freshness),
          failed: unavailableMetric("failed", "Failed", "count", value.freshness, item.failed),
          retried: unavailableMetric("retried", "Retried", "count", value.freshness),
        },
        oldestWaitingSeconds: item.oldestWaitingSeconds,
        throughput: unavailableMetric("throughput", "Throughput", "count", value.freshness),
        failureRate: unavailableMetric("failure_rate", "Failure rate", "percent", value.freshness),
        lastProcessedAt: null,
        freshness: value.freshness,
        backlogState: healthStatus(item.status),
        access: "full",
      })),
      range: parsed.range,
      platform: parsed.platform,
      freshness: value.freshness,
      partial: value.partial,
    });
  },
  async listJobRuns(query) {
    const parsed = jobRunsQuerySchema.parse(query);
    const params = new URLSearchParams({
      queue: parsed.queue,
      state: parsed.state,
      page: String(parsed.page),
      pageSize: String(parsed.pageSize),
    });
    if (parsed.search) params.set("search", parsed.search);
    const cursorScope = `job-runs:${parsed.queue}:${parsed.state}:${parsed.search ?? ""}:${parsed.pageSize}`;
    const cursor = liveCursor(cursorScope, parsed.page);
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (cursor) liveParams.set("cursor", cursor);
    if (parsed.state !== "all") liveParams.set("status", ({ waiting: "queued", active: "running", completed: "succeeded", failed: "failed", delayed: "retrying", cancelled: "canceled" } as const)[parsed.state]);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/jobs/runs?${params.toString()}`, paginatedJobRunsSchema);
    const value = await apiClient.get(`/api/v1/admin/jobs/runs?${liveParams.toString()}`, phase13JobRunPageSchema);
    rememberLiveCursor(cursorScope, parsed.page, value.nextCursor);
    const items = value.items.filter((run) =>
      (parsed.queue === "all" || queueKey(run.jobKey) === parsed.queue) &&
      (!parsed.search || run.jobKey.toLocaleLowerCase().includes(parsed.search.toLocaleLowerCase())),
    );
    const observedAt = new Date().toISOString();
    return paginatedJobRunsSchema.parse({ items: items.map(adaptRun), page: parsed.page, pageSize: parsed.pageSize, total: (parsed.page - 1) * parsed.pageSize + items.length + (value.nextCursor ? 1 : 0), freshness: { observedAt, staleAt: new Date(Date.now() + 60_000).toISOString(), state: "fresh" }, partial: parsed.queue !== "all" || Boolean(parsed.search) });
  },
  getJobRun(jobRunId) {
    const parsed = jobRunIdSchema.parse(jobRunId);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}`, jobRunDetailSchema);
    return apiClient.get(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}`, phase13JobRunDetailSchema).then((value) => {
      const run = adaptRun(value.run);
      return jobRunDetailSchema.parse({
        run: { ...run, attempt: value.attempts.at(-1)?.attempt ?? 1, safeErrorCode: value.attempts.at(-1)?.safeCode ?? null },
        metadata: [],
        timeline: value.attempts.map((attempt) => ({ event: attempt.status === "running" ? "started" : attempt.status === "succeeded" ? "completed" : "failed", at: attempt.completedAt ?? attempt.startedAt, summary: attempt.safeCode ?? attempt.status })),
        references: [],
        allowedActions: value.allowedActions,
      });
    });
  },
  retryJobRun(jobRunId, request) {
    const parsed = jobRunIdSchema.parse(jobRunId);
    const body = jobActionRequestSchema.parse(request);
    if (mocksEnabled())
      return apiClient.post(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}/retry`, body, retryJobResultSchema) as unknown as Promise<z.infer<typeof phase13JobActionResultSchema>>;
    return apiClient.post(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}/retry`, { expectedVersion: body.expectedVersion, reason: body.reason }, phase13JobActionResultSchema);
  },
  cancelJobRun(jobRunId, request) {
    const parsed = jobRunIdSchema.parse(jobRunId);
    const body = jobActionRequestSchema.parse(request);
    if (mocksEnabled())
      return apiClient.post(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}/cancel`, body, cancelJobResultSchema) as unknown as Promise<z.infer<typeof phase13JobActionResultSchema>>;
    return apiClient.post(`/api/v1/admin/jobs/runs/${encodeURIComponent(parsed)}/cancel`, { expectedVersion: body.expectedVersion, reason: body.reason }, phase13JobActionResultSchema);
  },
  async listScheduledJobs(query) {
    const parsed = scheduledJobsQuerySchema.parse(query);
    const params = new URLSearchParams({
      queue: parsed.queue,
      page: String(parsed.page),
      pageSize: String(parsed.pageSize),
    });
    if (parsed.search) params.set("search", parsed.search);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/jobs/scheduled?${params.toString()}`, scheduledJobsPageSchema);
    const cursorScope = `scheduled-jobs:${parsed.queue}:${parsed.search ?? ""}:${parsed.pageSize}`;
    const cursor = liveCursor(cursorScope, parsed.page);
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (cursor) liveParams.set("cursor", cursor);
    const value = await apiClient.get(`/api/v1/admin/jobs/scheduled?${liveParams.toString()}`, phase13ScheduledJobPageSchema);
    rememberLiveCursor(cursorScope, parsed.page, value.nextCursor);
    const items = value.items.filter((job) =>
      (parsed.queue === "all" || queueKey(job.key) === parsed.queue) &&
      (!parsed.search || job.key.toLocaleLowerCase().includes(parsed.search.toLocaleLowerCase())),
    );
    const observedAt = new Date().toISOString();
    const freshness = { observedAt, staleAt: new Date(Date.now() + 60_000).toISOString(), state: "fresh" as const };
    return scheduledJobsPageSchema.parse({
      items: items.map((job) => ({ id: `SCH-${job.id}`, name: job.key, queue: queueKey(job.key), schedule: job.schedule ? `Every ${job.schedule.everySeconds} seconds (${job.schedule.timezone})` : "Manual", lastRun: null, lastRunAt: null, nextRunAt: job.nextRunAt, lastState: null, enabled: job.enabled, freshness, access: "full" })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: (parsed.page - 1) * parsed.pageSize + items.length + (value.nextCursor ? 1 : 0),
      freshness,
      partial: parsed.queue !== "all" || Boolean(parsed.search),
    });
  },
};
