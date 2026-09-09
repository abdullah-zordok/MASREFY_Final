import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { mockServer } from "@/mocks/server";
import {
  AI_BASE_PATH,
  aiRepository,
  buildAiQuery,
  encodeAiId,
} from "./repository";
import { aiListQuerySchema } from "./contracts";
import {
  configureApiActorProvider,
  configureApiTokenProvider,
} from "@/core/api/client";

describe("Spec 006 shared AI repository boundary", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("uses the versioned admin AI base path and serializes safe queries", () => {
    const params = buildAiQuery(aiListQuerySchema, {
      search: "provider",
      platform: "android",
      scenario: "slow",
    });

    expect(AI_BASE_PATH).toBe("/api/v1/admin/ai");
    expect(params.toString()).toContain("search=provider");
    expect(params.toString()).toContain("platform=android");
    expect(params.toString()).toContain("__scenario=slow");
  });

  test("encodes safe identifiers and rejects unsafe route ids", () => {
    expect(encodeAiId("AIP-OPENAI")).toBe("AIP-OPENAI");
    expect(() => encodeAiId("../AIP-OPENAI")).toThrow();
  });

  test("validates requests and rejects unsafe responses", async () => {
    mockServer.use(
      http.get("/api/v1/admin/ai/probe", () =>
        HttpResponse.json({
          status: 200,
          code: "ok",
          message: "unsafe extra",
          rawPrompt: "private",
        }),
      ),
    );

    await expect(aiRepository.probe()).rejects.toMatchObject({
      code: "contract_mismatch",
    });
  });

  test("gets the AI overview through validated query filters", async () => {
    const overview = await aiRepository.getOverview({
      platform: "ios",
      period: "30d",
      scenario: "partial",
    });

    expect(overview.query).toMatchObject({ platform: "ios", period: "30d" });
    expect(overview.totalOriginalRequests).toBeGreaterThan(0);
    expect(overview.totalAttempts).toBeGreaterThanOrEqual(
      overview.totalOriginalRequests,
    );
  });

  test("returns a valid empty overview instead of an invalid mock payload", async () => {
    const overview = await aiRepository.getOverview({
      platform: "all",
      period: "30d",
      scenario: "empty",
    });

    expect(overview.metrics).toEqual([]);
    expect(overview.regions.metrics.availability).toBe("empty");
  });

  test("lists providers, provider detail, models, and validates provider actions", async () => {
    await expect(
      aiRepository.listProviders({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({ items: [{ id: "AIP-OPENAI" }] });
    await expect(aiRepository.getProvider("AIP-OPENAI")).resolves.toMatchObject(
      { id: "AIP-OPENAI", fallbackRoutes: expect.any(Array) },
    );
    const models = await aiRepository.listModels({ page: 1, pageSize: 25 });
    expect(models.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "AIM-GPT-4O" }),
        expect.objectContaining({ id: "AIM-GPT-4O-MINI" }),
      ]),
    );
    await expect(
      aiRepository.actOnProvider("AIP-OPENAI", {
        action: "activate",
        context: {
          reason: "validated action",
          expectedState: "healthy",
          expectedRevision: 1,
        },
      }),
    ).resolves.toMatchObject({ affectedId: "AIP-OPENAI" });
  });

  test("denies provider inventory when the simulated role lacks provider access", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "content-manager");

    await expect(
      aiRepository.listProviders({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("loads every metadata-only AI operations resource and sanitized prompt detail", async () => {
    for (const resource of [
      "prompts",
      "usage",
      "failures",
      "reports",
      "safety-rules",
    ] as const) {
      const page = await aiRepository.listOperational(resource, {
        page: 1,
        pageSize: 25,
      });
      expect(page.items).toHaveLength(
        resource === "prompts" ? 3 : resource === "safety-rules" ? 2 : 1,
      );
      expect(page.items[0]).toMatchObject({ resource });
      expect(JSON.stringify(page)).not.toMatch(
        /rawPrompt|rawResponse|providerPayload|apiKey|credential/i,
      );
    }

    const prompt = await aiRepository.getPrompt("AIPR-RECEIPT-AR-V3");
    expect(prompt.sanitizedPreview).toContain("fictional");
    expect(prompt.history.every((entry) => entry.immutable)).toBe(true);
  });

  test("records confirmed model and triage decisions with stale-state protection", async () => {
    const context = {
      reason: "verified mock decision",
      expectedRevision: 1,
    };
    await expect(
      aiRepository.actOnModel("AIM-GPT-4O", {
        action: "deactivate",
        context: { ...context, expectedState: "active" },
      }),
    ).resolves.toMatchObject({ outcome: "success", affectedId: "AIM-GPT-4O" });
    await expect(
      aiRepository.actOnOperational("failures", "AIF-0001", {
        action: "acknowledge",
        context: { ...context, expectedState: "open" },
      }),
    ).resolves.toMatchObject({ outcome: "success", affectedId: "AIF-0001" });
    await expect(
      aiRepository.listOperational("failures", {
        page: 1,
        pageSize: 25,
        status: "acknowledged",
      }),
    ).resolves.toMatchObject({
      items: [{ id: "AIF-0001", status: "acknowledged", revision: 2 }],
    });
    await expect(
      aiRepository.listOperational("failures", {
        page: 1,
        pageSize: 25,
        search: "does-not-exist",
      }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      aiRepository.actOnOperational("failures", "AIF-0001", {
        action: "resolve",
        context: {
          ...context,
          expectedState: "resolved",
          expectedRevision: 99,
        },
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(
      aiRepository.actOnOperational("failures", "AIF-0001", {
        action: "resolve",
        context: {
          ...context,
          expectedState: "acknowledged",
          expectedRevision: 2,
        },
      }),
    ).resolves.toMatchObject({ currentState: "resolved" });
    await expect(
      aiRepository.actOnOperational("failures", "AIF-0001", {
        action: "reopen",
        context: { ...context, expectedState: "resolved", expectedRevision: 3 },
      }),
    ).resolves.toMatchObject({ currentState: "open" });
    await expect(
      aiRepository.actOnOperational("failures", "AIF-0001", {
        action: "assign",
        context: { ...context, expectedState: "open", expectedRevision: 4 },
      }),
    ).resolves.toMatchObject({ currentState: "assigned" });
  });

  test("creates rollback drafts and blocks required safety coverage gaps", async () => {
    await expect(
      aiRepository.actOnOperational("prompts", "AIPR-RECEIPT-AR-V3", {
        action: "rollback",
        context: {
          reason: "create a safe rollback draft",
          expectedState: "active",
          expectedRevision: 3,
        },
      }),
    ).resolves.toMatchObject({
      affectedId: "AIPR-ROLLBACK-0001",
      currentState: "draft",
    });
    const prompts = await aiRepository.listOperational("prompts", {
      page: 1,
      pageSize: 25,
    });
    expect(prompts.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "AIPR-RECEIPT-AR-V3" }),
        expect.objectContaining({ id: "AIPR-ROLLBACK-0001", status: "draft" }),
      ]),
    );
    await expect(
      aiRepository.actOnOperational("safety-rules", "AIS-0001", {
        action: "deactivate",
        context: {
          reason: "would remove required coverage",
          expectedState: "active",
          expectedRevision: 5,
        },
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(
      aiRepository.actOnOperational("safety-rules", "AIS-0002", {
        action: "activate",
        context: {
          reason: "activate bounded declarative rule",
          expectedState: "draft",
          expectedRevision: 1,
        },
      }),
    ).resolves.toMatchObject({ currentState: "active", outcome: "success" });
  });

  test("activates only prompt candidates whose required fictional tests pass", async () => {
    await expect(
      aiRepository.actOnOperational("prompts", "AIPR-CAT-EN-V2", {
        action: "activate",
        context: {
          reason: "all required fictional tests passed",
          expectedState: "testing",
          expectedRevision: 2,
        },
      }),
    ).resolves.toMatchObject({ currentState: "active", outcome: "success" });
    await expect(
      aiRepository.actOnOperational("prompts", "AIPR-VOICE-AR-V4", {
        action: "activate",
        context: {
          reason: "required fictional test is failing",
          expectedState: "testing",
          expectedRevision: 4,
        },
      }),
    ).rejects.toMatchObject({ code: "validation_error", status: 400 });
  });

  test("persists a validated provider fallback priority change", async () => {
    const provider = await aiRepository.getProvider("AIP-OPENAI");
    expect(provider.accessLevel).toBe("full");
    if (provider.accessLevel !== "full")
      throw new Error("AI operator requires the full provider projection");
    const changed = (provider.fallbackRoutes ?? [])
      .map((route) => ({
        ...route,
        priority: (provider.fallbackRoutes?.length ?? 0) + 1 - route.priority,
      }))
      .sort((left, right) => left.priority - right.priority);
    await expect(
      aiRepository.actOnProvider(provider.id, {
        action: "update_fallback",
        fallbackRoutes: changed,
        context: {
          reason: "validated fallback priority change",
          expectedState: provider.health,
          expectedRevision: provider.revision,
        },
      }),
    ).resolves.toMatchObject({ outcome: "success" });
    const updated = await aiRepository.getProvider(provider.id);
    expect(updated.accessLevel).toBe("full");
    if (updated.accessLevel !== "full")
      throw new Error("AI operator requires the full provider projection");
    expect(updated.revision).toBe(2);
    expect(updated.fallbackRoutes?.[0]).toMatchObject({
      modelId: "AIM-GPT-4O-MINI",
      priority: 1,
    });
  });

  test("enforces least privilege on every new AI operations endpoint", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "content-manager");

    for (const resource of [
      "prompts",
      "usage",
      "failures",
      "reports",
      "safety-rules",
    ] as const) {
      await expect(
        aiRepository.listOperational(resource, { page: 1, pageSize: 25 }),
      ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    }

    await expect(
      aiRepository.actOnModel("AIM-GPT-4O", {
        action: "deactivate",
        context: {
          reason: "must be denied",
          expectedState: "active",
          expectedRevision: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      aiRepository.getPrompt("AIPR-RECEIPT-AR-V3"),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      aiRepository.actOnProvider("AIP-OPENAI", {
        action: "deactivate",
        context: {
          reason: "must be denied",
          expectedState: "healthy",
          expectedRevision: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    for (const [resource, id, action, state, revision] of [
      ["prompts", "AIPR-RECEIPT-AR-V3", "rollback", "active", 3],
      ["failures", "AIF-0001", "acknowledge", "open", 1],
      ["reports", "AIR-0001", "confirmed_issue", "pending_review", 1],
      ["safety-rules", "AIS-0001", "deactivate", "active", 5],
    ] as const) {
      await expect(
        aiRepository.actOnOperational(resource, id, {
          action,
          context: {
            reason: "must be denied",
            expectedState: state,
            expectedRevision: revision,
          },
        }),
      ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    }
  });

  test("limits support, security, and billing projections to documented fields", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");
    const billingProviders = await aiRepository.listProviders({
      page: 1,
      pageSize: 25,
    });
    const billingModels = await aiRepository.listModels({
      page: 1,
      pageSize: 25,
    });
    const billingUsage = await aiRepository.listOperational("usage", {
      page: 1,
      pageSize: 25,
    });
    expect(billingProviders.items[0]).toMatchObject({
      accessLevel: "aggregate",
      estimatedCost: expect.any(Object),
      actions: [],
    });
    expect(billingProviders.items[0]).not.toHaveProperty("health");
    expect(billingModels.items[0]).toMatchObject({
      accessLevel: "aggregate",
      actions: [],
    });
    expect(billingModels.items[0]).not.toHaveProperty("assignments");
    expect(billingUsage.items[0]).toMatchObject({ accessLevel: "aggregate" });
    expect(billingUsage.items[0]).not.toHaveProperty("maskedUser");
    expect(billingUsage.items[0]).not.toHaveProperty("originalRequestId");
    const billingOverview = await aiRepository.getOverview({
      platform: "all",
      period: "30d",
    });
    expect(billingOverview.costByCurrency.length).toBeGreaterThan(0);
    expect(billingOverview.featureDistribution).toEqual([]);

    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    const supportProviders = await aiRepository.listProviders({
      page: 1,
      pageSize: 25,
    });
    const supportFailures = await aiRepository.listOperational("failures", {
      page: 1,
      pageSize: 25,
    });
    expect(supportProviders.items[0]).toMatchObject({
      accessLevel: "context",
      health: "healthy",
      actions: [],
    });
    expect(supportProviders.items[0]).not.toHaveProperty("estimatedCost");
    expect(supportProviders.items[0]).not.toHaveProperty("fallbackRoutes");
    expect(supportFailures.items[0]).toMatchObject({
      accessLevel: "context",
      severity: "high",
    });
    const supportOverview = await aiRepository.getOverview({
      platform: "all",
      period: "30d",
    });
    expect(supportOverview.costByCurrency).toEqual([]);
    expect(supportOverview.metrics.map((metric) => metric.key)).toEqual(
      expect.arrayContaining([
        "failed_requests",
        "fallback_attempts",
        "user_reports",
      ]),
    );
  });

  test("maps malformed direct AI input to safe validation errors", async () => {
    const queryResponse = await fetch(
      `/api/v1/admin/ai/providers?search=${"x".repeat(121)}`,
      { headers: { "x-admin-simulated-role": "ai-operator" } },
    );
    const actionResponse = await fetch(
      "/api/v1/admin/ai/providers/AIP-OPENAI/actions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-simulated-role": "ai-operator",
        },
        body: "{}",
      },
    );

    expect(queryResponse.status).toBe(400);
    expect(actionResponse.status).toBe(400);
  });

  test("returns deterministic empty and safe provider-unavailable scenarios", async () => {
    await expect(
      aiRepository.listOperational("reports", {
        page: 1,
        pageSize: 25,
        scenario: "empty",
      }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      aiRepository.listOperational("reports", {
        page: 1,
        pageSize: 25,
        scenario: "unavailable",
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    await expect(
      aiRepository.listOperational("reports", {
        page: 1,
        pageSize: 25,
        scenario: "partial",
      }),
    ).resolves.toMatchObject({
      region: { availability: "partial", retryable: true },
    });
  });
});

const liveId = (suffix: number) =>
  `99000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const liveAt = "2026-09-09T08:00:00.000Z";
const liveResponse = (status: number, value: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(value),
  }) as unknown as Response;

describe("BE009 live Admin AI mapping", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    configureApiTokenProvider(async () => "clerk-token");
    configureApiActorProvider(() => "admin-owner");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("preserves token and money metrics and cumulative cursor totals", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        liveResponse(200, {
          items: [
            {
              id: liveId(1),
              kind: "usage",
              version: 1,
              data: {
                workload: "financial_assistant",
                model: "approved/model",
                provider: "approved",
                inputTokens: 123,
                outputTokens: 45,
                estimatedCost: "0.12340000",
                latencyMs: 87,
                fallbackUsed: false,
                status: "completed",
                createdAt: liveAt,
              },
            },
          ],
          nextCursor: "cursor-2",
        }),
      )
      .mockResolvedValueOnce(
        liveResponse(200, {
          items: [
            {
              id: liveId(2),
              kind: "usage",
              version: 1,
              data: {
                workload: "financial_assistant",
                model: "approved/model",
                provider: "approved",
                inputTokens: 10,
                outputTokens: 5,
                estimatedCost: "0.01000000",
                latencyMs: 20,
                fallbackUsed: true,
                status: "completed",
                createdAt: liveAt,
              },
            },
          ],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", request);

    const first = await aiRepository.listOperational("usage", {
      page: 1,
      pageSize: 25,
    });
    const second = await aiRepository.listOperational("usage", {
      page: 2,
      pageSize: 25,
    });
    expect(first.items[0]).toMatchObject({
      inputUnits: 123,
      outputUnits: 45,
      estimatedCost: {
        amount: "0.12340000",
        currency: "USD",
        freshness: liveAt,
      },
    });
    expect(first.pagination).toMatchObject({ totalItems: 2, totalPages: 2 });
    expect(second.pagination).toMatchObject({ totalItems: 2, totalPages: 2 });
    expect(String(request.mock.calls[1]?.[0])).toContain("cursor=cursor-2");
  });

  test("keeps reports and safety rows metadata-only without invented content or policy", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        liveResponse(200, {
          items: [
            {
              id: liveId(3),
              kind: "response-report",
              version: 2,
              data: {
                reportType: "unsafe",
                status: "open",
                createdAt: liveAt,
                updatedAt: liveAt,
              },
            },
          ],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        liveResponse(200, {
          items: [
            {
              id: liveId(4),
              kind: "safety-rule",
              version: 3,
              data: {
                key: "global.no_tools",
                workload: "financial_assistant",
                ruleType: "output_block",
                configuration: { forbiddenKeys: ["tool"] },
                enabled: true,
                createdAt: liveAt,
                updatedAt: liveAt,
              },
            },
          ],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", request);

    const reports = await aiRepository.listOperational("reports", {
      page: 1,
      pageSize: 25,
    });
    const safety = await aiRepository.listOperational("safety-rules", {
      page: 1,
      pageSize: 25,
    });
    expect(reports.items[0]).not.toHaveProperty("severity");
    expect(reports.items[0]).not.toHaveProperty("sanitizedExcerpt");
    expect(safety.items[0]).not.toHaveProperty("safetyDefinition");
  });

  test("rejects unknown owner fields and forwards exact mutations and recent-MFA errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        liveResponse(200, {
          items: [
            {
              id: liveId(5),
              kind: "usage",
              version: 1,
              data: {
                workload: "financial_assistant",
                model: "approved/model",
                provider: "approved",
                inputTokens: 1,
                outputTokens: 1,
                estimatedCost: "0.1",
                latencyMs: 1,
                fallbackUsed: false,
                status: "completed",
                createdAt: liveAt,
                rawPrompt: "private",
              },
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    await expect(
      aiRepository.listOperational("usage", { page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "contract_mismatch" });

    const mutation = vi
      .fn()
      .mockResolvedValueOnce(
        liveResponse(200, {
          id: liveId(6),
          kind: "provider",
          version: 4,
          data: {
            key: "openai",
            displayName: "OpenAI",
            approved: false,
            zdrCapable: true,
            trainingPolicy: "no_training",
            retentionReviewedAt: liveAt,
            createdAt: liveAt,
            updatedAt: liveAt,
          },
        }),
      )
      .mockResolvedValueOnce(
        liveResponse(403, { code: "RECENT_AUTH_REQUIRED" }),
      );
    vi.stubGlobal("fetch", mutation);
    await aiRepository.actOnProvider(`AIP-${liveId(6)}`, {
      action: "deactivate",
      context: {
        reason: "verified provider decision",
        expectedState: "healthy",
        expectedRevision: 3,
      },
    });
    expect(JSON.parse(String(mutation.mock.calls[0]?.[1]?.body))).toEqual({
      expectedVersion: 3,
      reason: "verified provider decision",
      approved: false,
    });
    await expect(
      aiRepository.actOnProvider(`AIP-${liveId(6)}`, {
        action: "deactivate",
        context: {
          reason: "verified provider decision",
          expectedState: "healthy",
          expectedRevision: 3,
        },
      }),
    ).rejects.toMatchObject({ code: "recent_auth_required", status: 403 });
  });
});
