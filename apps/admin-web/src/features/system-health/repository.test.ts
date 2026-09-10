import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { mockServer } from "@/mocks/server";
import { systemHealthRepository } from "./repository";

const observedAt = "2026-09-10T08:00:00.000Z";
const staleAt = "2026-09-10T08:05:00.000Z";
const freshness = { observedAt, staleAt, state: "fresh" } as const;

describe("system health repository", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  test("gets a validated Phase 8 health overview with range and platform query values", async () => {
    const result = await systemHealthRepository.getHealthOverview({ range: "7d", platform: "ios" });
    expect(result.range).toBe("7d");
    expect(result.services).toHaveLength(12);
    expect(result.services[0]).toHaveProperty("freshness");
  });

  test("supports Phase 8 overview scenarios and denies unassigned direct roles safely", async () => {
    await expect(systemHealthRepository.getHealthOverview({ range: "24h", platform: "all", scenario: "partial" }))
      .resolves.toMatchObject({ partial: true });

    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");
    await expect(systemHealthRepository.getHealthOverview({ range: "24h", platform: "all" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("gets validated API database and storage monitoring with range query values", async () => {
    await expect(systemHealthRepository.getApiMonitoring({ range: "1h", platform: "all" }))
      .resolves.toMatchObject({ range: "1h", latency: { unit: "milliseconds" } });
    await expect(systemHealthRepository.getDatabaseMonitoring({ range: "7d", platform: "ios" }))
      .resolves.toMatchObject({ range: "7d", backupState: "healthy" });
    await expect(systemHealthRepository.getStorageMonitoring({ range: "30d", platform: "android" }))
      .resolves.toMatchObject({ range: "30d", cleanupState: "healthy" });
  });

  test("supports US2 partial stale unavailable scenarios and forbidden role projection", async () => {
    await expect(systemHealthRepository.getApiMonitoring({ range: "24h", platform: "all", scenario: "partial" }))
      .resolves.toMatchObject({ partialReason: "One endpoint group is delayed." });
    await expect(systemHealthRepository.getDatabaseMonitoring({ range: "24h", platform: "all", scenario: "stale" }))
      .resolves.toMatchObject({ freshness: { state: "stale" } });
    await expect(systemHealthRepository.getStorageMonitoring({ range: "24h", platform: "all", scenario: "unavailable" }))
      .resolves.toMatchObject({ cleanupState: "unavailable" });

    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");
    await expect(systemHealthRepository.getApiMonitoring({ range: "24h", platform: "all" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("lists provider health with filters and pagination", async () => {
    const providers = await systemHealthRepository.listProviderHealth({
      category: "ai",
      status: "all",
      platform: "ios",
      pageSize: 25,
      sort: "status",
    });
    expect(providers.items).toHaveLength(1);
    expect(providers.items[0]).toMatchObject({ name: "AI Providers", category: "ai" });
    expect(providers.items[0]).not.toHaveProperty("apiKey");
  });

  test("projects providers by role and returns safe provider errors", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");
    await expect(systemHealthRepository.listProviderHealth({ category: "all", status: "all", platform: "all" }))
      .resolves.toMatchObject({ items: [{ category: "stripe", access: "domain" }] });

    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    await expect(systemHealthRepository.listProviderHealth({ category: "all", status: "all", platform: "all" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });

    window.sessionStorage.setItem("admin-simulated-role", "super-admin");
    await expect(systemHealthRepository.listProviderHealth({ category: "all", status: "all", platform: "all", scenario: "unavailable" }))
      .rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
  });

  test("gets queue health, job runs, and safe job detail", async () => {
    await expect(systemHealthRepository.listQueueHealth({ range: "24h", platform: "all" }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ queue: "imports" })]) });
    await expect(systemHealthRepository.listJobRuns({ queue: "imports", state: "failed", page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ id: "JOB-DEMO-FAILED-01" })] });
    await expect(systemHealthRepository.getJobRun("JOB-DEMO-FAILED-01"))
      .resolves.toMatchObject({ run: { id: "JOB-DEMO-FAILED-01" }, allowedActions: ["retry"] });
  });

  test("protects malformed or unauthorized job detail lookups", async () => {
    expect(() => systemHealthRepository.getJobRun("bad-id")).toThrow();
    await expect(systemHealthRepository.getJobRun("JOB-NOT-FOUND")).rejects.toMatchObject({ code: "not_found", status: 404 });

    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    await expect(systemHealthRepository.listQueueHealth({ range: "24h", platform: "all" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("posts retry and cancel job actions with validated results", async () => {
    await expect(systemHealthRepository.retryJobRun("JOB-DEMO-FAILED-01", {
      jobRunId: "JOB-DEMO-FAILED-01",
      expectedVersion: 1,
      reason: "Retry after safe operator review.",
      submissionKey: "SUB-DEMO-RETRY",
    })).resolves.toMatchObject({ outcome: { message: "Retry requested" }, retry: { run: { state: "waiting" } } });

    await expect(systemHealthRepository.cancelJobRun("JOB-DEMO-WAITING-01", {
      jobRunId: "JOB-DEMO-WAITING-01",
      expectedVersion: 1,
      reason: "Cancel after safe operator review.",
      submissionKey: "SUB-DEMO-CANCEL",
    })).resolves.toMatchObject({ outcome: { message: "Cancel requested" }, cancelled: { state: "cancelled" } });
  });

  test("lists scheduled jobs as read-only summaries", async () => {
    const schedules = await systemHealthRepository.listScheduledJobs({ queue: "all", page: 1, pageSize: 25 });
    expect(schedules.items).toHaveLength(7);
    expect(schedules.items[0]).toHaveProperty("nextRunAt");
    expect(systemHealthRepository).not.toHaveProperty("runScheduledJobNow");
  });
});

describe("BE013 exact live operations mapping", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  test("preserves measured latency and only source-provided health rows", async () => {
    mockServer.use(
      http.get("/api/v1/admin/system-health/overview", () =>
        HttpResponse.json({
          status: "degraded",
          services: [{ key: "database", status: "degraded", latencyMs: 17, freshness }],
          partial: true,
          freshness,
        }),
      ),
      http.get("/api/v1/admin/performance", () =>
        HttpResponse.json({
          range: "24h",
          budgets: {
            "providers.shallow": { p50: 5, p95: 8, p99: 11, unit: "milliseconds", status: "within_budget" },
            "operations.jobs": { p50: 30, p95: 77, p99: 120, unit: "milliseconds", status: "breached" },
          },
          series: [{ at: observedAt, value: 77 }],
          freshness,
        }),
      ),
    );

    const overview = await systemHealthRepository.getHealthOverview({ range: "24h", platform: "all" });
    expect(overview).toMatchObject({ partial: true, services: [{ id: "database", latency: { value: 17 } }] });
    expect(overview.services).toHaveLength(1);
    await expect(systemHealthRepository.getApiMonitoring({ range: "24h", platform: "all" }))
      .resolves.toMatchObject({ latency: { value: 77, summary: "breached" } });
  });

  test("does not infer storage evidence or freshness from the first recovery row", async () => {
    mockServer.use(
      http.get("/api/v1/admin/recovery", () =>
        HttpResponse.json({
          items: [{ scope: "database", status: "verified", observedAt, evidenceRef: "database-proof" }],
          rpoTargetSeconds: 900,
          rtoTargetSeconds: 7200,
        }),
      ),
    );

    await expect(systemHealthRepository.getStorageMonitoring({ range: "24h", platform: "all" }))
      .resolves.toMatchObject({ cleanupState: "unavailable", freshness: { observedAt: null, staleAt: null, state: "unknown" } });
  });

  test("traverses provider cursors for exact totals without synthetic success or freshness", async () => {
    let calls = 0;
    mockServer.use(
      http.get("/api/v1/admin/system-health/providers", ({ request }) => {
        calls += 1;
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json({
          items: [{ provider: cursor ? "storage" : "database", status: "up", latencyMs: cursor ? 9 : 7, checkedAt: observedAt }],
          nextCursor: cursor ? null : "provider-page-2",
        });
      }),
    );

    const page = await systemHealthRepository.listProviderHealth({ category: "all", status: "all", platform: "all", page: 1, pageSize: 25 });
    expect(calls).toBe(2);
    expect(page).toMatchObject({ total: 2, partial: false, freshness: { state: "unknown", observedAt: null } });
    expect(page.items[0]).toMatchObject({ id: "database", lastSuccessAt: null });
  });
});
