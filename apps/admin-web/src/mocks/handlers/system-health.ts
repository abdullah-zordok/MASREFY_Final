import { http, HttpResponse } from "msw";
import { ADMIN_ROLES, type PermissionKey } from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import { jobActionRequestSchema } from "@/features/system-health/contracts";
import {
  apiMonitoringFixtures,
  databaseMonitoringFixtures,
  errorRateTrend,
  healthSummary,
  healthOverviewFixtures,
  incidents,
  latencyTrend,
  providerHealthFixtures,
  queueSummary,
  requestVolume,
  services,
  storageMonitoringFixtures,
} from "@/mocks/fixtures/system-health";
import { readScenario } from "@/mocks/scenarios/foundation";
import {
  cancelPhase8JobRun,
  getPhase8JobRun,
  listPhase8JobRuns,
  listPhase8QueueHealth,
  listPhase8ScheduledJobs,
  retryPhase8JobRun,
} from "@/mocks/phase8-system-health-state";
import { scenarioResponse } from "./shared";

function denied(request: Request, permission: PermissionKey = "system-health.read"): Response | null {
  const candidate = request.headers.get("x-admin-simulated-role");
  const role = candidate === null
    ? "super-admin"
    : ADMIN_ROLES.find((adminRole) => adminRole === candidate);
  return role && hasPermission(role, permission)
    ? null
    : HttpResponse.json({ code: "forbidden" }, { status: 403 });
}

function fixtureKey(request: Request): string | Response {
  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "24h";
  if (!["1h", "24h", "7d", "30d"].includes(range)) {
    return HttpResponse.json({ code: "validation_error" }, { status: 400 });
  }
  const scenario = url.searchParams.get("__scenario");
  return scenario === "partial" || scenario === "stale" || scenario === "unavailable" ? scenario : range;
}

function simulatedRole(request: Request) {
  const candidate = request.headers.get("x-admin-simulated-role");
  return candidate === null ? "super-admin" : ADMIN_ROLES.find((adminRole) => adminRole === candidate);
}

export const systemHealthHandlers = [
  http.get("/api/v1/admin/system-health/overview", async ({ request }) => {
    const permissionError = denied(request);
    if (permissionError) return permissionError;
    const scenario = readScenario(request);
    const response = await scenarioResponse(scenario);
    if (response) return response;
    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "24h";
    if (!["1h", "24h", "7d", "30d"].includes(range)) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    const rawScenario = url.searchParams.get("__scenario");
    const fixture = rawScenario === "partial" || rawScenario === "stale" || rawScenario === "unknown"
      ? healthOverviewFixtures[rawScenario]
      : healthOverviewFixtures[range] ?? healthOverviewFixtures["24h"];
    return HttpResponse.json(fixture);
  }),
  http.get("/api/v1/admin/system-health/api", async ({ request }) => {
    const permissionError = denied(request, "system-health.api.read");
    if (permissionError) return permissionError;
    const key = fixtureKey(request);
    if (typeof key !== "string") return key;
    if (["partial", "stale", "unavailable"].includes(key)) return HttpResponse.json(apiMonitoringFixtures[key]);
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    return HttpResponse.json(apiMonitoringFixtures[key] ?? apiMonitoringFixtures["24h"]);
  }),
  http.get("/api/v1/admin/system-health/database", async ({ request }) => {
    const permissionError = denied(request, "system-health.database.read");
    if (permissionError) return permissionError;
    const key = fixtureKey(request);
    if (typeof key !== "string") return key;
    if (["partial", "stale", "unavailable"].includes(key)) return HttpResponse.json(databaseMonitoringFixtures[key]);
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    return HttpResponse.json(databaseMonitoringFixtures[key] ?? databaseMonitoringFixtures["24h"]);
  }),
  http.get("/api/v1/admin/system-health/storage", async ({ request }) => {
    const permissionError = denied(request, "system-health.storage.read");
    if (permissionError) return permissionError;
    const key = fixtureKey(request);
    if (typeof key !== "string") return key;
    if (["partial", "stale", "unavailable"].includes(key)) return HttpResponse.json(storageMonitoringFixtures[key]);
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    return HttpResponse.json(storageMonitoringFixtures[key] ?? storageMonitoringFixtures["24h"]);
  }),
  http.get("/api/v1/admin/system-health/providers", async ({ request }) => {
    const permissionError = denied(request, "system-health.providers.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? "all";
    const status = url.searchParams.get("status") ?? "all";
    const role = simulatedRole(request);
    const allowed = role === "billing-operator"
      ? ["stripe"]
      : role === "ai-operator"
        ? ["ai"]
        : role === "content-manager"
          ? ["email", "push"]
          : ["stripe", "ai", "email", "push", "exchange_rates"];
    const source = allowed.length === 5 ? providerHealthFixtures.full : providerHealthFixtures.domain;
    const items = source.items
      .filter((item) => allowed.includes(item.category))
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => status === "all" || item.status === status)
      .map((item) => allowed.length === 5 ? item : { ...item, access: "domain" as const });
    return HttpResponse.json({ ...source, items, total: items.length });
  }),
  http.get("/api/v1/admin/jobs/queues", async ({ request }) => {
    const permissionError = denied(request, "jobs.queues.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const url = new URL(request.url);
    const range = url.searchParams.get("range");
    const platform = url.searchParams.get("platform");
    return HttpResponse.json(listPhase8QueueHealth({
      range: range === "1h" || range === "7d" || range === "30d" ? range : "24h",
      platform: platform === "ios" || platform === "android" ? platform : "all",
    }));
  }),
  http.get("/api/v1/admin/jobs/runs", async ({ request }) => {
    const permissionError = denied(request, "jobs.runs.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const url = new URL(request.url);
    const queue = url.searchParams.get("queue");
    const state = url.searchParams.get("state");
    return HttpResponse.json(listPhase8JobRuns({
      queue: queue === "imports" || queue === "ai_processing" || queue === "notifications" || queue === "reports" || queue === "data_exports" || queue === "account_deletion" || queue === "subscription_reconciliation" ? queue : "all",
      state: state === "waiting" || state === "active" || state === "completed" || state === "failed" || state === "delayed" || state === "cancelled" ? state : "all",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25) as 25,
      search: url.searchParams.get("search") ?? undefined,
    }));
  }),
  http.post("/api/v1/admin/jobs/runs/:jobRunId/retry", async ({ request, params }) => {
    const permissionError = denied(request, "operations.jobs.manage");
    if (permissionError) return permissionError;
    const parsed = jobActionRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.jobRunId !== params.jobRunId) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    try {
      return HttpResponse.json(retryPhase8JobRun(String(params.jobRunId), parsed.data));
    } catch {
      return HttpResponse.json({ code: "conflict" }, { status: 409 });
    }
  }),
  http.post("/api/v1/admin/jobs/runs/:jobRunId/cancel", async ({ request, params }) => {
    const permissionError = denied(request, "operations.jobs.manage");
    if (permissionError) return permissionError;
    const parsed = jobActionRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.jobRunId !== params.jobRunId) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    try {
      return HttpResponse.json(cancelPhase8JobRun(String(params.jobRunId), parsed.data));
    } catch {
      return HttpResponse.json({ code: "conflict" }, { status: 409 });
    }
  }),
  http.get("/api/v1/admin/jobs/runs/:jobRunId", async ({ request, params }) => {
    const permissionError = denied(request, "jobs.runs.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const detail = getPhase8JobRun(String(params.jobRunId));
    return detail ? HttpResponse.json(detail) : HttpResponse.json({ code: "not_found" }, { status: 404 });
  }),
  http.get("/api/v1/admin/jobs/scheduled", async ({ request }) => {
    const permissionError = denied(request, "jobs.schedules.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const url = new URL(request.url);
    const queue = url.searchParams.get("queue");
    return HttpResponse.json(listPhase8ScheduledJobs({
      queue: queue === "imports" || queue === "ai_processing" || queue === "notifications" || queue === "reports" || queue === "data_exports" || queue === "account_deletion" || queue === "subscription_reconciliation" ? queue : "all",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25) as 25,
      search: url.searchParams.get("search") ?? undefined,
    }));
  }),
  http.get("/api/v1/admin/system-health", async ({ request }) => {
    const permissionError = denied(request);
    if (permissionError) return permissionError;
    const scenario = readScenario(request);
    const response = await scenarioResponse(scenario);
    if (response) return response;
    const empty = scenario === "empty";
    return HttpResponse.json({
      summary: empty ? [] : healthSummary,
      services: empty ? [] : services,
      incidents: empty ? [] : incidents,
      requestVolume: empty ? [] : requestVolume,
      latencyTrend: empty ? [] : latencyTrend,
      errorRateTrend: empty ? [] : errorRateTrend,
      queueSummary: empty ? [] : queueSummary,
      partial: scenario === "partial" || undefined,
      warning: scenario === "partial" ? "بيانات أحد المزودين متأخرة." : undefined,
    });
  }),
];
