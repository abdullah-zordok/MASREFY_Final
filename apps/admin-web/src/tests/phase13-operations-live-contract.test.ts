import { afterEach, describe, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { governanceRepository } from "@/features/governance/repository";
import { systemHealthRepository } from "@/features/system-health/repository";
import { mockServer } from "@/mocks/server";

const observedAt = "2026-09-06T13:00:00.000Z";
const staleAt = "2026-09-06T13:05:00.000Z";
const freshness = { observedAt, staleAt, state: "fresh" } as const;
const runId = "13000000-0000-4000-8000-000000000001";
const scheduleId = "13000000-0000-4000-8000-000000000002";
const maintenanceId = "13000000-0000-4000-8000-000000000003";

describe("Phase 13 live operations mapping", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_ENABLE_MOCKS;
  });

  test("keeps mock mode disabled in production even when the public flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCKS", "true");
    mockServer.use(
      http.get("/api/v1/admin/system-health/overview", () =>
        HttpResponse.json({ status: "operational", services: [], partial: false, freshness }),
      ),
    );

    await expect(
      systemHealthRepository.getHealthOverview({ range: "24h", platform: "all" }),
    ).resolves.toMatchObject({ summary: "Overall status: operational", services: expect.any(Array) });
  });

  test("does not allow a public E2E flag to enable production fixtures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCKS", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_E2E_MOCKS", "true");
    mockServer.use(
      http.get("/api/v1/admin/system-health/overview", () =>
        HttpResponse.json({ status: "operational", services: [], partial: false, freshness }),
      ),
    );

    await expect(
      systemHealthRepository.getHealthOverview({ range: "24h", platform: "all" }),
    ).resolves.toMatchObject({ summary: "Overall status: operational" });
  });

  test("maps bounded health, performance, recovery, provider, and queue payloads", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/system-health/overview", () => HttpResponse.json({ status: "operational", services: [{ key: "database", status: "operational", latencyMs: 8, freshness }], partial: false, freshness })),
      http.get("/api/v1/admin/performance", () => HttpResponse.json({ range: "24h", budgets: { "operations.jobs": { p50: 10, p95: 20, p99: 30, unit: "milliseconds", status: "within_budget" } }, series: [{ at: observedAt, value: 20 }], freshness })),
      http.get("/api/v1/admin/recovery", () => HttpResponse.json({ items: [{ scope: "database", status: "verified", observedAt, evidenceRef: "evidence/recovery.md", rpoSeconds: 10, rtoSeconds: 30 }], rpoTargetSeconds: 900, rtoTargetSeconds: 7200 })),
      http.get("/api/v1/admin/system-health/providers", () => HttpResponse.json({ items: [{ provider: "database", status: "up", latencyMs: 8, checkedAt: observedAt }], nextCursor: null })),
      http.get("/api/v1/admin/jobs/queues", () => HttpResponse.json({ items: [{ key: "operations", waiting: 1, active: 0, failed: 0, oldestWaitingSeconds: 2, status: "operational" }], freshness, partial: false })),
    );

    const overview = await systemHealthRepository.getHealthOverview({ range: "24h", platform: "all" });
    expect(overview.services).toHaveLength(1);
    expect(overview.services.find(({ category }) => category === "database")).toMatchObject({ status: "operational", latency: { value: 8 } });
    expect(overview.services.find(({ category }) => category === "cache")).toBeUndefined();
    await expect(systemHealthRepository.getApiMonitoring({ range: "24h", platform: "all" })).resolves.toMatchObject({ latency: { value: 20 } });
    await expect(systemHealthRepository.getDatabaseMonitoring({ range: "24h", platform: "all" })).resolves.toMatchObject({ backupState: "healthy" });
    await expect(systemHealthRepository.getStorageMonitoring({ range: "24h", platform: "all" })).resolves.toMatchObject({ cleanupState: "unavailable" });
    await expect(systemHealthRepository.listProviderHealth({ category: "database", status: "all", platform: "all" })).resolves.toMatchObject({ items: [{ category: "database", safeError: null }] });
    await expect(systemHealthRepository.listQueueHealth({ range: "24h", platform: "all" })).resolves.toMatchObject({ items: [{ queue: "operations", counters: { waiting: { value: 1 } } }] });
  });

  test("maps job lists, detail, safe actions, and UUID schedules", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    const run = { id: runId, jobKey: "operations.provider-health", ownerSpec: 13, status: "failed", queuedAt: observedAt, startedAt: observedAt, completedAt: staleAt, correlationId: "phase13-test", summary: { safeCode: "PROVIDER_UNKNOWN" }, version: 2 };
    const secondRun = { ...run, id: "13000000-0000-4000-8000-000000000004", correlationId: "phase13-page-2" };
    mockServer.use(
      http.get("/api/v1/admin/jobs/runs", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor ? { items: [secondRun], nextCursor: null } : { items: [run], nextCursor: runId });
      }),
      http.get(`/api/v1/admin/jobs/runs/${runId}`, () => HttpResponse.json({ run, attempts: [{ attempt: 1, status: "failed", workerId: "worker-1", startedAt: observedAt, completedAt: staleAt, safeCode: "PROVIDER_UNKNOWN" }], allowedActions: ["retry"] })),
      http.post(`/api/v1/admin/jobs/runs/${runId}/retry`, () => HttpResponse.json({ status: "queued", runId, version: 3, retryOfRunId: runId })),
      http.get("/api/v1/admin/jobs/scheduled", () => HttpResponse.json({ items: [{ id: scheduleId, key: "operations.provider-health", ownerSpec: 13, type: "provider_health", schedule: { kind: "interval", everySeconds: 300, timezone: "UTC" }, enabled: true, timeoutSeconds: 60, maxAttempts: 3, retrySafe: true, cancelSafe: true, nextRunAt: staleAt, version: 1 }], nextCursor: null })),
    );

    await expect(systemHealthRepository.listJobRuns({ queue: "all", state: "failed" })).resolves.toMatchObject({ total: 2 });
    await expect(systemHealthRepository.listJobRuns({ queue: "all", state: "failed", page: 2 })).resolves.toMatchObject({ items: [], total: 2 });
    await expect(systemHealthRepository.getJobRun(runId)).resolves.toMatchObject({ run: { safeErrorCode: "PROVIDER_UNKNOWN" }, allowedActions: ["retry"] });
    await expect(systemHealthRepository.retryJobRun(runId, { jobRunId: runId, expectedVersion: 2, reason: "Retry after operator review", submissionKey: "SUB-DEMO-RETRY" })).resolves.toMatchObject({ status: "queued", version: 3 });
    await expect(systemHealthRepository.listScheduledJobs({ queue: "all" })).resolves.toMatchObject({ items: [{ id: scheduleId, queue: "operations" }] });
  });

  test("maps operational settings, flags, and maintenance without billing fixtures", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/settings/operations.history.retention_days", () => HttpResponse.json({ key: "operations.history.retention_days", value: 30, sensitivity: "internal", redacted: false, version: 2, updatedAt: observedAt })),
      http.patch("/api/v1/admin/settings/operations.history.retention_days", () => HttpResponse.json({ resourceId: "operations.history.retention_days", status: "updated", version: 3 })),
      http.get("/api/v1/admin/feature-flags", () => HttpResponse.json({ items: [{ id: runId, key: "operations.safe-mode", description: "Safe operations mode", defaultEnabled: true, status: "active", rules: [], version: 1 }], nextCursor: null })),
      http.patch("/api/v1/admin/feature-flags/operations.safe-mode", () => HttpResponse.json({ resourceId: "operations.safe-mode", status: "updated", version: 2 })),
      http.get("/api/v1/admin/maintenance", () => HttpResponse.json({ items: [{ id: maintenanceId, startsAt: observedAt, endsAt: staleAt, scopes: ["api"], message: { ar: "صيانة مجدولة", en: "Scheduled maintenance" }, status: "scheduled", version: 1 }], nextCursor: null })),
      http.patch(`/api/v1/admin/maintenance/${maintenanceId}`, () => HttpResponse.json({ resourceId: maintenanceId, status: "active", version: 2 })),
    );

    await expect(governanceRepository.getSettingsGroup("general")).resolves.toMatchObject({ operationsSetting: true, values: { settingKey: "operations.history.retention_days", value: 30 } });
    await expect(governanceRepository.updateSettingsGroup("general", { changes: { retentionDays: 60 }, expectedVersion: 2, reason: "Retain operational history longer", submissionKey: "phase13-settings-update" })).resolves.toMatchObject({ status: "updated", version: 3 });
    await expect(governanceRepository.listFeatureFlags({ page: 1, pageSize: 25 })).resolves.toMatchObject({ items: [{ id: "operations.safe-mode", status: "active" }] });
    await expect(governanceRepository.updateFeatureFlag("operations.safe-mode", { rolloutPercent: 0, expectedVersion: 1, reason: "Disable after safe review", submissionKey: "phase13-flag-update" })).resolves.toMatchObject({ status: "updated", version: 2 });
    await expect(governanceRepository.getMaintenance()).resolves.toMatchObject({ state: "scheduled", mockOnly: false });
    await expect(governanceRepository.updateMaintenance({ nextState: "active", message: { ar: "صيانة جارية", en: "Maintenance active" }, startsAt: observedAt, endsAt: staleAt, expectedVersion: 1, reason: "Begin scheduled maintenance", submissionKey: "phase13-maintenance" })).resolves.toMatchObject({ status: "active", version: 2 });
  });
});
