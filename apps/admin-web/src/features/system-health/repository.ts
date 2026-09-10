import { apiClient, mocksEnabled } from "@/core/api/client";
import { z } from "zod";
import {
  apiMonitoringSchema,
  databaseMonitoringSchema,
  freshnessSchema,
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

type Phase13Freshness = z.infer<typeof freshnessSchema>;
type SourceFreshness = z.infer<typeof phase13HealthOverviewSchema>["freshness"];
type Phase13JobRun = z.infer<typeof phase13JobRunPageSchema>["items"][number];
const unknownFreshness = { observedAt: null, staleAt: null, state: "unknown" as const };

function presentFreshness(value: SourceFreshness | Phase13Freshness): Phase13Freshness {
  return value.state === "unknown" ? unknownFreshness : value as Phase13Freshness;
}

async function allCursorItems<T>(
  path: string,
  params: URLSearchParams,
  schema: z.ZodType<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor) query.set("cursor", cursor);
    const response = await apiClient.get(`${path}?${query.toString()}`, schema);
    items.push(...response.items);
    cursor = response.nextCursor;
    if (!cursor) return items;
  }
  throw new Error("CURSOR_PAGE_LIMIT_EXCEEDED");
}

const unavailableMetric = (
  key: string,
  label: string,
  unit: "count" | "percent" | "milliseconds" | "seconds" | "bytes" | "ratio",
  freshness: SourceFreshness | Phase13Freshness,
  value: number | null = null,
) => ({ key, label, value, unit, semantic: "selected_range" as const, completeness: value === null ? "unavailable" as const : "complete" as const, freshness: presentFreshness(freshness) });

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
    return healthOverviewSchema.parse({
      range: query.range,
      summary: `Overall status: ${value.status}`,
      services: value.services.map((service) => {
        const category = service.key === "identity" ? "auth" : service.key;
        return {
          id: service.key,
          name: category,
          category,
          status: healthStatus(service.status),
          uptime: unavailableMetric("uptime", "Uptime", "percent", service.freshness),
          latency: unavailableMetric("latency", "Latency", "milliseconds", service.freshness, service.latencyMs ?? null),
          errorRate: unavailableMetric("error_rate", "Error rate", "percent", service.freshness),
          freshness: presentFreshness(service.freshness),
        };
      }),
      freshness: presentFreshness(value.freshness),
      partial: value.partial,
    });
  },
  async getApiMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/api?${monitoringParams(query)}`, apiMonitoringSchema);
    const value = await apiClient.get(`/api/v1/admin/performance?range=${query.range}`, phase13PerformanceSchema);
    const budget = value.budgets["operations.jobs"];
    return apiMonitoringSchema.parse({
      range: value.range,
      requestVolume: unavailableMetric("request_volume", "Request volume", "count", value.freshness),
      errorRate: unavailableMetric("error_rate", "Error rate", "percent", value.freshness),
      latency: {
        ...unavailableMetric("latency", "P95 latency", "milliseconds", value.freshness, budget?.p95 ?? null),
        summary: budget?.status,
      },
      series: value.series,
      endpoints: [],
      statusCodes: [],
      freshness: presentFreshness(value.freshness),
    });
  },
  async getDatabaseMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/database?${monitoringParams(query)}`, databaseMonitoringSchema);
    const value = await apiClient.get("/api/v1/admin/recovery", phase13RecoverySchema);
    const item = value.items.find(({ scope }) => scope === "database");
    return databaseMonitoringSchema.parse({
      range: query.range,
      connectionUsage: unavailableMetric("connections", "Connections", "count", unknownFreshness),
      queryLatency: unavailableMetric("query_latency", "Query latency", "milliseconds", unknownFreshness),
      storageUsage: unavailableMetric("storage_usage", "Storage usage", "bytes", unknownFreshness),
      slowQueries: [],
      backupState: item?.status === "verified" ? "healthy" : item?.status === "failed" ? "failed" : "unavailable",
      recoveryState: item?.status === "verified" ? "healthy" : item?.status === "failed" ? "degraded" : "unavailable",
      freshness: unknownFreshness,
    });
  },
  async getStorageMonitoring(query) {
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/storage?${monitoringParams(query)}`, storageMonitoringSchema);
    const value = await apiClient.get("/api/v1/admin/recovery", phase13RecoverySchema);
    const item = value.items.find(({ scope }) => scope === "storage");
    return storageMonitoringSchema.parse({
      range: query.range,
      storageUsage: unavailableMetric("storage_usage", "Storage usage", "bytes", unknownFreshness),
      uploadCount: unavailableMetric("upload_count", "Uploads", "count", unknownFreshness),
      failedUploads: unavailableMetric("failed_uploads", "Failed uploads", "count", unknownFreshness),
      temporaryFiles: unavailableMetric("temporary_files", "Temporary files", "count", unknownFreshness),
      cleanupState: item?.status === "verified" ? "healthy" : item?.status === "failed" ? "failed" : "unavailable",
      freshness: unknownFreshness,
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
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (parsed.category !== "all" && ["database", "storage", "identity", "ai", "email", "push"].includes(parsed.category)) liveParams.set("provider", parsed.category);
    if (["up", "degraded", "down", "unknown"].includes(parsed.status)) liveParams.set("status", parsed.status);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/system-health/providers?${params.toString()}`, providerHealthPageSchema);
    const items = await allCursorItems("/api/v1/admin/system-health/providers", liveParams, phase13ProviderPageSchema);
    return providerHealthPageSchema.parse({
      items: items.slice((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize).map((provider) => {
        return {
          id: provider.provider,
          name: provider.provider,
          category: provider.provider,
          status: healthStatus(provider.status),
          latency: unavailableMetric("latency", "Latency", "milliseconds", unknownFreshness, provider.latencyMs),
          errorRate: unavailableMetric("error_rate", "Error rate", "percent", unknownFreshness),
          lastSuccessAt: null,
          lastCheckedAt: provider.checkedAt,
          freshness: unknownFreshness,
          capabilities: [provider.provider],
          fallbackState: "not_applicable",
          safeError: provider.safeCode ?? null,
          platformImpact: { total: 0, ios: 0, android: 0, semantic: "requests", completeness: "unavailable" },
          access: "full",
        };
      }),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: items.length,
      freshness: unknownFreshness,
      partial: parsed.platform !== "all",
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
        freshness: presentFreshness(value.freshness),
        backlogState: healthStatus(item.status),
        access: "full",
      })),
      range: parsed.range,
      platform: parsed.platform,
      freshness: presentFreshness(value.freshness),
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
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (parsed.state !== "all") liveParams.set("status", ({ waiting: "queued", active: "running", completed: "succeeded", failed: "failed", delayed: "retrying", cancelled: "canceled" } as const)[parsed.state]);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/jobs/runs?${params.toString()}`, paginatedJobRunsSchema);
    const allItems = await allCursorItems("/api/v1/admin/jobs/runs", liveParams, phase13JobRunPageSchema);
    const items = allItems.filter((run) =>
      (parsed.queue === "all" || queueKey(run.jobKey) === parsed.queue) &&
      (!parsed.search || run.jobKey.toLocaleLowerCase().includes(parsed.search.toLocaleLowerCase())),
    );
    return paginatedJobRunsSchema.parse({ items: items.slice((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize).map(adaptRun), page: parsed.page, pageSize: parsed.pageSize, total: items.length, freshness: unknownFreshness, partial: false });
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
    const liveParams = new URLSearchParams({ limit: String(parsed.pageSize) });
    const allItems = await allCursorItems("/api/v1/admin/jobs/scheduled", liveParams, phase13ScheduledJobPageSchema);
    const items = allItems.filter((job) =>
      (parsed.queue === "all" || queueKey(job.key) === parsed.queue) &&
      (!parsed.search || job.key.toLocaleLowerCase().includes(parsed.search.toLocaleLowerCase())),
    );
    return scheduledJobsPageSchema.parse({
      items: items.slice((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize).map((job) => ({ id: job.id, name: job.key, queue: queueKey(job.key), schedule: job.schedule ? `Every ${job.schedule.everySeconds} seconds (${job.schedule.timezone})` : "Manual", lastRun: null, lastRunAt: null, nextRunAt: job.nextRunAt, lastState: null, enabled: job.enabled, freshness: unknownFreshness, access: "full" })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: items.length,
      freshness: unknownFreshness,
      partial: false,
    });
  },
};
