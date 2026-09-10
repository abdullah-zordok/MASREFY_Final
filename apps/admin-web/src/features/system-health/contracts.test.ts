import { describe, expect, test } from "vitest";
import {
  apiMonitoringFixtures,
  databaseMonitoringFixtures,
  healthOverviewFixtures,
  providerHealthFixtures,
  storageMonitoringFixtures,
} from "@/mocks/fixtures/system-health";
import * as contracts from "./contracts";

describe("Phase 8 shared operational contracts", () => {
  test("accepts only the four fixed operational ranges", () => {
    const schema = contracts.operationalRangeSchema;
    for (const range of ["1h", "24h", "7d", "30d"]) {
      expect(schema.safeParse(range).success, range).toBe(true);
    }
    expect(schema.safeParse("90d").success).toBe(false);
  });

  test("accepts platform scopes and rejects unsupported platform values", () => {
    const schema = contracts.platformScopeSchema;
    for (const platform of ["all", "ios", "android", "unknown", "global"]) {
      expect(schema.safeParse(platform).success, platform).toBe(true);
    }
    expect(schema.safeParse("web").success).toBe(false);
  });

  test("requires valid ordered freshness timestamps", () => {
    const schema = contracts.freshnessSchema;
    expect(schema.safeParse({
      observedAt: "2026-08-01T11:58:00+03:00",
      staleAt: "2026-08-01T12:03:00+03:00",
      state: "fresh",
    }).success).toBe(true);
    expect(schema.safeParse({
      observedAt: "2026-08-01T12:03:00+03:00",
      staleAt: "2026-08-01T11:58:00+03:00",
      state: "unknown",
    }).success).toBe(false);
  });

  test("distinguishes zero from unavailable metric values", () => {
    const schema = contracts.metricValueSchema;
    const base = {
      key: "failed_jobs",
      label: "Failed jobs",
      unit: "count",
      semantic: "selected_range",
      freshness: {
        observedAt: "2026-08-01T11:58:00+03:00",
        staleAt: "2026-08-01T12:03:00+03:00",
        state: "fresh",
      },
    };
    expect(schema.safeParse({ ...base, value: 0, completeness: "complete" }).success).toBe(true);
    expect(schema.safeParse({ ...base, value: null, completeness: "unavailable" }).success).toBe(true);
  });

  test("bounds pagination, IDs, search text, and action reasons", () => {
    expect(contracts.pageSizeSchema.safeParse(25).success).toBe(true);
    expect(contracts.pageSizeSchema.safeParse(101).success).toBe(false);
    expect(contracts.jobRunIdSchema.safeParse("JOB-DEMO-FAILED-01").success).toBe(true);
    expect(contracts.jobRunIdSchema.safeParse("DEMO-FAILED-01").success).toBe(false);
    expect(contracts.searchSchema.safeParse("x".repeat(120)).success).toBe(true);
    expect(contracts.searchSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(contracts.actionReasonSchema.safeParse("Valid plain reason").success).toBe(true);
    expect(contracts.actionReasonSchema.safeParse("short").success).toBe(false);
    expect(contracts.actionReasonSchema.safeParse("bad\u0000reason text").success).toBe(false);
    expect(contracts.actionReasonSchema.safeParse("bad\u202ereason text").success).toBe(false);
  });

  test("rejects unknown fields and exposes safe operational errors", () => {
    expect(contracts.safeMetadataEntrySchema.safeParse({
      key: "queue",
      label: "Queue",
      value: "imports",
      rawPayload: "secret",
    }).success).toBe(false);
    expect(contracts.operationalApiErrorSchema.safeParse({
      status: 403,
      code: "forbidden",
      message: "Access denied",
      retryable: false,
      correlationId: "COR-DEMO-01",
    }).success).toBe(true);
  });
});

describe("US1 health overview contracts", () => {
  const freshness = {
    observedAt: "2026-08-01T11:58:00+03:00",
    staleAt: "2026-08-01T12:03:00+03:00",
    state: "fresh",
  };
  const metric = {
    key: "uptime",
    label: "Uptime",
    value: 99.98,
    unit: "percent",
    semantic: "selected_range",
    completeness: "complete",
    freshness,
  };
  const service = {
    id: "SVC-API",
    name: "NestJS API",
    category: "api",
    status: "operational",
    uptime: metric,
    latency: { ...metric, key: "latency", label: "Latency", value: 118, unit: "milliseconds" },
    errorRate: { ...metric, key: "error_rate", label: "Error rate", value: 0.08 },
    freshness,
    lastIncident: null,
    impactSummary: "No active customer impact.",
    platformImpact: {
      total: 0,
      ios: 0,
      android: 0,
      unknown: 0,
      semantic: "unique_customers",
      completeness: "complete",
    },
  };

  test("accepts source-provided service summaries up to the safe cardinality bound", () => {
    const overview = {
      range: "24h",
      summary: "One degraded service requires attention.",
      services: Array.from({ length: 12 }, (_, index) => ({
        ...service,
        id: `SVC-DEMO-${index + 1}`,
        name: `Service ${index + 1}`,
      })),
      attention: [{ id: "INC-DEMO-01", kind: "incident", label: "Demo incident", href: "/admin/security/incidents/INC-DEMO-01" }],
      freshness,
      partial: false,
      partialReason: null,
    };
    expect(contracts.healthOverviewSchema.safeParse(overview).success).toBe(true);
    expect(contracts.healthOverviewSchema.safeParse({ ...overview, services: Array.from({ length: 21 }, (_, index) => ({ ...service, id: `service-${index + 1}`, name: `Service ${index + 1}` })) }).success).toBe(false);
  });

  test("keeps platform impact separate from global health status", () => {
    const parsed = contracts.serviceHealthSummarySchema.parse({
      ...service,
      status: "degraded",
      platformImpact: {
        total: 9,
        ios: 4,
        android: 3,
        unknown: 2,
        semantic: "unique_customers",
        completeness: "partial",
      },
    });
    expect(parsed.status).toBe("degraded");
    expect(parsed.platformImpact?.total).toBe(9);
  });

  test("allows unavailable metrics without treating them as zero", () => {
    const unavailable = contracts.metricValueSchema.parse({
      ...metric,
      value: null,
      completeness: "unavailable",
      summary: "Provider observation missing.",
    });
    expect(unavailable.value).toBeNull();
    expect(unavailable.completeness).toBe("unavailable");
  });

  test("validates every exported US1 overview fixture", () => {
    for (const [name, fixture] of Object.entries(healthOverviewFixtures)) {
      expect(contracts.healthOverviewSchema.safeParse(fixture).success, name).toBe(true);
    }
  });
});

describe("US2 API database and storage monitoring contracts", () => {
  const freshness = {
    observedAt: "2026-08-01T11:58:00+03:00",
    staleAt: "2026-08-01T12:03:00+03:00",
    state: "fresh",
  };
  const metric = {
    key: "request_volume",
    label: "Request volume",
    value: 1284,
    unit: "count",
    semantic: "selected_range",
    completeness: "complete",
    freshness,
  };

  test("validates safe API monitoring without raw path or customer fields", () => {
    const api = {
      range: "24h",
      requestVolume: metric,
      errorRate: { ...metric, key: "error_rate", label: "Error rate", value: 0.8, unit: "percent" },
      latency: { ...metric, key: "latency", label: "Latency", value: 142, unit: "milliseconds" },
      series: [{ at: "2026-08-01T11:00:00+03:00", value: 142 }],
      endpoints: [{
        routePattern: "/api/v1/admin/imports/:scope",
        requestVolume: metric,
        errorRate: { ...metric, key: "endpoint_errors", label: "Endpoint errors", value: 1.2, unit: "percent" },
        p95Latency: { ...metric, key: "endpoint_p95", label: "Endpoint p95", value: 210, unit: "milliseconds" },
        statusCodeGroup: "mixed",
      }],
      statusCodes: [{ group: "2xx", count: 1220 }, { group: "5xx", count: 3 }],
      freshness,
      partialReason: null,
    };
    expect(contracts.apiMonitoringSchema.safeParse(api).success).toBe(true);
    expect(contracts.endpointGroupSchema.safeParse({ ...api.endpoints[0], rawPath: "/users/USR-1?token=secret" }).success).toBe(false);
  });

  test("validates database and storage diagnostics as safe flat groups", () => {
    expect(contracts.databaseMonitoringSchema.safeParse({
      range: "24h",
      connectionUsage: { ...metric, key: "connection_usage", label: "Connection usage", value: 62, unit: "percent" },
      queryLatency: { ...metric, key: "query_latency", label: "Query latency", value: 38, unit: "milliseconds" },
      storageUsage: { ...metric, key: "database_storage", label: "Database storage", value: 71, unit: "percent" },
      slowQueries: [{
        label: "Aggregated import lookup",
        operation: "select",
        count: { ...metric, key: "slow_query_count", label: "Slow query count", value: 8 },
        p95Duration: { ...metric, key: "slow_query_p95", label: "Slow query p95", value: 410, unit: "milliseconds" },
      }],
      backupState: "healthy",
      recoveryState: "healthy",
      freshness,
      incident: null,
    }).success).toBe(true);

    expect(contracts.storageMonitoringSchema.safeParse({
      range: "24h",
      storageUsage: { ...metric, key: "storage_usage", label: "Storage usage", value: 55, unit: "percent" },
      uploadCount: { ...metric, key: "upload_count", label: "Uploads", value: 412 },
      failedUploads: { ...metric, key: "failed_uploads", label: "Failed uploads", value: 3 },
      temporaryFiles: { ...metric, key: "temporary_files", label: "Temporary files", value: null, completeness: "unavailable" },
      cleanupState: "delayed",
      freshness,
      incident: { id: "INC-DEMO-STORAGE", kind: "incident", label: "Storage cleanup delay" },
    }).success).toBe(true);
  });

  test("validates every exported US2 monitoring fixture", () => {
    for (const [name, fixture] of Object.entries(apiMonitoringFixtures)) {
      expect(contracts.apiMonitoringSchema.safeParse(fixture).success, `api ${name}`).toBe(true);
    }
    for (const [name, fixture] of Object.entries(databaseMonitoringFixtures)) {
      expect(contracts.databaseMonitoringSchema.safeParse(fixture).success, `database ${name}`).toBe(true);
    }
    for (const [name, fixture] of Object.entries(storageMonitoringFixtures)) {
      expect(contracts.storageMonitoringSchema.safeParse(fixture).success, `storage ${name}`).toBe(true);
    }
  });
});

describe("US3 external provider health contracts", () => {
  const freshness = {
    observedAt: "2026-08-01T11:58:00+03:00",
    staleAt: "2026-08-01T12:03:00+03:00",
    state: "fresh",
  };
  const metric = {
    key: "provider_latency",
    label: "Provider latency",
    value: 286,
    unit: "milliseconds",
    semantic: "selected_range",
    completeness: "complete",
    freshness,
  };

  test("validates safe provider summaries and rejects configuration fields", () => {
    const provider = {
      id: "PRV-STRIPE",
      name: "Stripe",
      category: "stripe",
      status: "operational",
      latency: metric,
      errorRate: { ...metric, key: "provider_error_rate", label: "Provider error rate", value: 0.07, unit: "percent" },
      lastSuccessAt: "2026-08-01T11:52:00+03:00",
      lastCheckedAt: "2026-08-01T11:58:00+03:00",
      freshness,
      capabilities: ["payments", "subscriptions"],
      fallbackState: "not_applicable",
      safeError: null,
      platformImpact: { total: 0, ios: 0, android: 0, unknown: 0, semantic: "requests", completeness: "complete" },
      access: "full",
    };
    expect(contracts.providerHealthSummarySchema.safeParse(provider).success).toBe(true);
    expect(contracts.providerHealthSummarySchema.safeParse({ ...provider, apiKey: "secret" }).success).toBe(false);
  });

  test("requires five categories and paginated provider responses", () => {
    for (const category of ["stripe", "ai", "email", "push", "exchange_rates"]) {
      expect(contracts.providerCategorySchema.safeParse(category).success, category).toBe(true);
    }
    expect(contracts.providerHealthPageSchema.safeParse({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      freshness,
      partial: false,
    }).success).toBe(true);
  });

  test("validates every exported US3 provider fixture", () => {
    for (const [name, fixture] of Object.entries(providerHealthFixtures)) {
      expect(contracts.providerHealthPageSchema.safeParse(fixture).success, name).toBe(true);
    }
  });
});

describe("US4 queue and job read contracts", () => {
  const freshness = {
    observedAt: "2026-08-01T11:58:00+03:00",
    staleAt: "2026-08-01T12:03:00+03:00",
    state: "fresh",
  };
  const metric = {
    key: "waiting",
    label: "Waiting",
    value: 12,
    unit: "count",
    semantic: "snapshot",
    completeness: "complete",
    freshness,
  };

  test("validates seven queues and job states without retried", () => {
    for (const queue of ["imports", "ai_processing", "notifications", "reports", "data_exports", "account_deletion", "subscription_reconciliation"]) {
      expect(contracts.queueKeySchema.safeParse(queue).success, queue).toBe(true);
    }
    for (const state of ["waiting", "active", "completed", "failed", "delayed", "cancelled"]) {
      expect(contracts.jobStateSchema.safeParse(state).success, state).toBe(true);
    }
    expect(contracts.jobStateSchema.safeParse("retried").success).toBe(false);
  });

  test("validates queue snapshots, run summaries, and safe detail metadata", () => {
    const run = {
      id: "JOB-DEMO-FAILED-01",
      name: "Import classification",
      queue: "imports",
      state: "failed",
      attempt: 1,
      startedAt: "2026-08-01T11:40:00+03:00",
      completedAt: "2026-08-01T11:41:00+03:00",
      durationMs: 60000,
      safeErrorCode: "import_timeout",
      summary: "Safe timeout while processing import batch.",
      correlationId: "COR-DEMO-IMPORT-01",
      platform: "ios",
      appVersion: "2.8.0",
      version: 1,
      retryOfJobRunId: null,
      access: "full",
    };
    expect(contracts.queueSnapshotSchema.safeParse({
      queue: "imports",
      label: "Imports",
      counters: {
        waiting: metric,
        active: { ...metric, key: "active", label: "Active" },
        delayed: { ...metric, key: "delayed", label: "Delayed" },
        completed: { ...metric, key: "completed", label: "Completed", semantic: "selected_range" },
        failed: { ...metric, key: "failed", label: "Failed", semantic: "selected_range" },
        retried: { ...metric, key: "retried", label: "Retried", semantic: "selected_range" },
      },
      oldestWaitingSeconds: 180,
      throughput: { ...metric, key: "throughput", label: "Throughput", semantic: "selected_range" },
      failureRate: { ...metric, key: "failure_rate", label: "Failure rate", value: 1.2, unit: "percent", semantic: "selected_range" },
      lastProcessedAt: "2026-08-01T11:58:00+03:00",
      freshness,
      backlogState: "degraded",
      platformImpact: { total: 12, ios: 6, android: 4, unknown: 2, semantic: "jobs", completeness: "complete" },
      access: "full",
    }).success).toBe(true);
    expect(contracts.jobRunDetailSchema.safeParse({
      run,
      metadata: [{ key: "batch_type", label: "Batch type", value: "imports" }],
      timeline: [{ event: "queued", at: "2026-08-01T11:39:00+03:00", summary: "Queued safely." }],
      references: [{ id: "INC-DEMO-WORKERS", kind: "incident", label: "Worker backlog incident" }],
      allowedActions: [],
    }).success).toBe(true);
    expect(contracts.safeMetadataEntrySchema.safeParse({ key: "payload", label: "Payload", value: { raw: true } }).success).toBe(false);
  });
});

describe("US5 retry and cancel action contracts", () => {
  test("validates bounded action requests and safe retry/cancel results", () => {
    const request = {
      jobRunId: "JOB-DEMO-FAILED-01",
      expectedVersion: 1,
      reason: "Retry after operator reviewed safe failure.",
      submissionKey: "SUB-DEMO-01",
    };
    expect(contracts.jobActionRequestSchema.safeParse(request).success).toBe(true);
    expect(contracts.jobActionRequestSchema.safeParse({ ...request, reason: "short" }).success).toBe(false);
    expect(contracts.jobActionRequestSchema.safeParse({ ...request, reason: "bad\u202ereason text" }).success).toBe(false);
    expect(contracts.actionOutcomeSchema.safeParse({
      status: "accepted",
      message: "Retry requested safely.",
      audit: { id: "AUD-DEMO-RETRY-01", kind: "audit", label: "job.retry_requested" },
    }).success).toBe(true);
  });
});

describe("US6 scheduled job contracts", () => {
  test("validates read-only scheduled job summaries and rejects mutation schemas", () => {
    const freshness = {
      observedAt: "2026-08-01T11:58:00+03:00",
      staleAt: "2026-08-01T12:03:00+03:00",
      state: "fresh",
    };
    expect(contracts.scheduledJobSummarySchema.safeParse({
      id: "SCH-IMPORTS-DAILY",
      name: "Daily imports maintenance",
      queue: "imports",
      schedule: "Every day at 02:00 Asia/Riyadh",
      lastRun: { id: "JOB-DEMO-COMPLETED-01", kind: "job", label: "Last safe run" },
      lastRunAt: "2026-08-01T02:00:00+03:00",
      nextRunAt: "2026-08-02T02:00:00+03:00",
      lastState: "completed",
      enabled: true,
      freshness,
      access: "full",
    }).success).toBe(true);
    expect("createScheduledJobSchema" in contracts).toBe(false);
    expect("runScheduledJobNowSchema" in contracts).toBe(false);
  });
});
