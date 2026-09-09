import type { RequestHandler } from "msw";
import { delay, http, HttpResponse } from "msw";
import {
  ADMIN_ROLES,
  type AdminRole,
  type PermissionKey,
} from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import {
  aiModelsPageSchema,
  aiListQuerySchema,
  aiOverviewQuerySchema,
  aiOverviewSchema,
  aiProvidersPageSchema,
  aiProviderDetailSchema,
  providerActionRequestSchema,
  aiOperationalActionRequestSchema,
  aiOperationalPageSchema,
  aiPromptDetailSchema,
  safeAiIdSchema,
  type SafeScenario,
  type AiListQuery,
  type AiOperationalRecord,
  type AiProviderSummary,
  type AiModelSummary,
  type AiOverviewData,
} from "@/features/ai/contracts";
import {
  buildAiOverview,
  aiModelsFixture,
  aiOperationalFixture,
  aiPromptDetailsFixture,
  aiProviderDetailFixture,
  aiProvidersFixture,
} from "@/mocks/fixtures/ai";
import {
  applyAiRecordAction,
  applyProviderAction,
  phase5ProviderFallbackRoutes,
  phase5Record,
  phase5RollbackDraftIds,
} from "@/mocks/phase5-ai-state";
import { readAiScenario } from "@/mocks/scenarios/ai";

function simulatedRole(request: Request): AdminRole | null {
  const candidate = request.headers.get("x-admin-simulated-role");
  if (candidate === null) return "super-admin";
  return ADMIN_ROLES.find((role) => role === candidate) ?? null;
}

function denied(request: Request, permission: PermissionKey): Response | null {
  const role = simulatedRole(request);
  return role && hasPermission(role, permission)
    ? null
    : safeAiError("forbidden", 403);
}

function queryValues(request: Request): Record<string, string> {
  return Object.fromEntries(
    [...new URL(request.url).searchParams.entries()].map(([key, value]) => [
      key === "__scenario" ? "scenario" : key,
      value,
    ]),
  );
}

function operationalPage(items: AiOperationalRecord[], query: AiListQuery) {
  const filtered = items.filter((item) => {
    const search = query.search?.toLocaleLowerCase();
    return (
      (!search ||
        `${item.id} ${item.title}`.toLocaleLowerCase().includes(search)) &&
      (!query.feature || item.feature === query.feature) &&
      (!query.providerId || item.providerId === query.providerId) &&
      (!query.modelId || item.modelId === query.modelId) &&
      (!query.platform ||
        item.platform === query.platform ||
        query.platform === "all") &&
      (!query.status || item.status === query.status) &&
      (!query.severity || item.severity === query.severity) &&
      (!query.dateFrom || item.updatedAt.slice(0, 10) >= query.dateFrom) &&
      (!query.dateTo || item.updatedAt.slice(0, 10) <= query.dateTo)
    );
  });
  const direction = query.order === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    const leftValue =
      query.sort === "name"
        ? left.title
        : query.sort === "severity"
          ? left.severity
          : query.sort === "feature"
            ? left.feature
            : left.updatedAt;
    const rightValue =
      query.sort === "name"
        ? right.title
        : query.sort === "severity"
          ? right.severity
          : query.sort === "feature"
            ? right.feature
            : right.updatedAt;
    return (
      String(leftValue ?? "").localeCompare(String(rightValue ?? "")) *
      direction
    );
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / query.pageSize),
    },
    region: {
      availability: filtered.length
        ? ("available" as const)
        : ("empty" as const),
    },
  };
}

function paginated<T>(items: T[], query: AiListQuery) {
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / query.pageSize),
    },
    region: {
      availability: items.length ? ("available" as const) : ("empty" as const),
    },
  };
}

function projectProvider(
  provider: AiProviderSummary,
  role: AdminRole,
): AiProviderSummary {
  if (provider.accessLevel !== "full") return provider;
  const core = {
    id: provider.id,
    name: provider.name,
    freshness: provider.freshness,
    revision: provider.revision,
    actions: [] as [],
  };
  if (role === "billing-operator") {
    return {
      ...core,
      accessLevel: "aggregate",
      estimatedCost: provider.estimatedCost!,
    };
  }
  if (role === "support-agent" || role === "security-administrator") {
    return {
      ...core,
      accessLevel: "context",
      health: provider.health,
      latencyMs: provider.latencyMs!,
      failureRate: provider.failureRate!,
      rateLimit: provider.rateLimit!,
    };
  }
  return provider;
}

function projectModel(model: AiModelSummary, role: AdminRole): AiModelSummary {
  if (model.accessLevel !== "full" || role !== "billing-operator") return model;
  return {
    id: model.id,
    name: model.name,
    providerId: model.providerId,
    revision: model.revision,
    accessLevel: "aggregate",
    inputCost: model.inputCost,
    outputCost: model.outputCost,
    actions: [],
  };
}

function projectOperational(
  item: AiOperationalRecord,
  role: AdminRole,
): AiOperationalRecord {
  if (role === "billing-operator" && item.resource === "usage") {
    const projection = structuredClone(item);
    projection.accessLevel = "aggregate";
    projection.title = "Aggregate usage";
    delete projection.maskedUser;
    delete projection.originalRequestId;
    delete projection.providerId;
    delete projection.modelId;
    return projection;
  }
  if (
    (role === "support-agent" || role === "security-administrator") &&
    (item.resource === "reports" || item.resource === "failures")
  ) {
    const projection = structuredClone(item);
    projection.accessLevel = "context";
    delete projection.providerId;
    delete projection.modelId;
    return projection;
  }
  return item;
}

function actionsForOperationalState(
  item: AiOperationalRecord,
  status: string,
): string[] {
  if (item.resource === "failures") {
    if (status === "resolved") return ["reopen"];
    if (status === "acknowledged" || status === "assigned")
      return ["resolve", "escalate"];
    if (status === "escalated") return ["resolve"];
  }
  if (item.resource === "reports" && status !== "pending_review")
    return ["reopen"];
  if (item.resource === "prompts") {
    if (status === "active") return ["test", "retire", "rollback"];
    if (status === "draft") return ["test", "retire"];
  }
  if (
    item.resource === "safety-rules" &&
    status === "active" &&
    item.safetyDefinition?.requiredCoverage
  )
    return [];
  return item.actions;
}

function projectOverview(
  overview: AiOverviewData,
  role: AdminRole,
): AiOverviewData {
  if (role === "billing-operator") {
    return {
      ...overview,
      metrics: overview.metrics.filter((metric) =>
        ["original_requests", "attempts"].includes(metric.key),
      ),
      featureDistribution: [],
      providerDistribution: [],
      trend: [],
      regions: { ...overview.regions, charts: { availability: "forbidden" } },
    };
  }
  if (role === "support-agent" || role === "security-administrator") {
    return {
      ...overview,
      metrics: overview.metrics.filter((metric) =>
        ["failed_requests", "fallback_attempts", "user_reports"].includes(
          metric.key,
        ),
      ),
      costByCurrency: [],
      featureDistribution: [],
      trend: [],
    };
  }
  return overview;
}

export const aiHandlers: RequestHandler[] = [
  http.get("/api/v1/admin/ai/overview", async ({ request }) => {
    const permissionError = denied(request, "ai.overview.read");
    if (permissionError) return permissionError;
    const scenario = readAiScenario(request);
    if (scenario === "slow") await delay(250);
    const scenarioError = aiScenarioError(scenario);
    if (scenarioError) return scenarioError;

    const url = new URL(request.url);
    const parsedQuery = aiOverviewQuerySchema.safeParse({
      platform: url.searchParams.get("platform") || undefined,
      period: url.searchParams.get("period") || undefined,
      feature: url.searchParams.get("feature") || undefined,
      providerId: url.searchParams.get("providerId") || undefined,
      modelId: url.searchParams.get("modelId") || undefined,
      plan: url.searchParams.get("plan") || undefined,
      status: url.searchParams.get("status") || undefined,
      scenario: url.searchParams.get("__scenario") || undefined,
    });
    if (!parsedQuery.success) return safeAiError("validation_error", 400);
    const query = parsedQuery.data;
    const overview = buildAiOverview(query.platform);
    const response =
      scenario === "empty"
        ? {
            ...overview,
            metrics: [],
            totalOriginalRequests: 0,
            totalAttempts: 0,
            fallbackAttempts: 0,
            costByCurrency: [],
            featureDistribution: [],
            providerDistribution: [],
            platformDistribution: [],
            trend: [],
            regions: {
              metrics: { availability: "empty" as const },
              charts: { availability: "empty" as const },
            },
          }
        : { ...overview, query };

    return HttpResponse.json(
      aiOverviewSchema.parse(
        projectOverview(response, simulatedRole(request) ?? "content-manager"),
      ),
    );
  }),
  http.get("/api/v1/admin/ai/providers", async ({ request }) => {
    const permissionError = denied(request, "ai.providers.read");
    if (permissionError) return permissionError;
    const scenario = readAiScenario(request);
    if (scenario === "slow") await delay(250);
    const scenarioError = aiScenarioError(scenario);
    if (scenarioError) return scenarioError;
    const parsedQuery = aiListQuerySchema.safeParse(queryValues(request));
    if (!parsedQuery.success) return safeAiError("validation_error", 400);
    const role = simulatedRole(request);
    const query = parsedQuery.data;
    const items =
      scenario === "empty" || !role
        ? []
        : aiProvidersFixture
            .filter(
              (provider) =>
                (!query.search ||
                  `${provider.id} ${provider.name}`
                    .toLocaleLowerCase()
                    .includes(query.search.toLocaleLowerCase())) &&
                (!query.status ||
                  ("health" in provider && provider.health === query.status)),
            )
            .map((provider) => {
              if (provider.accessLevel !== "full")
                return projectProvider(provider, role);
              const current = phase5Record(provider.id);
              return projectProvider(
                current
                  ? {
                      ...provider,
                      health:
                        current.status === "unavailable"
                          ? "unavailable"
                          : "healthy",
                      revision: current.revision,
                    }
                  : provider,
                role,
              );
            });
    return HttpResponse.json(
      aiProvidersPageSchema.parse(paginated(items, query)),
    );
  }),
  http.get("/api/v1/admin/ai/providers/:providerId", ({ params, request }) => {
    const permissionError = denied(request, "ai.providers.read");
    if (permissionError) return permissionError;
    const parsedId = safeAiIdSchema.safeParse(String(params.providerId));
    if (!parsedId.success) return safeAiError("validation_error", 400);
    const providerId = parsedId.data;
    const role = simulatedRole(request);
    const current = phase5Record(providerId);
    return providerId === aiProviderDetailFixture.id && role
      ? HttpResponse.json(
          projectProvider(
            aiProviderDetailSchema.parse({
              ...aiProviderDetailFixture,
              fallbackRoutes: phase5ProviderFallbackRoutes(),
              ...(current
                ? {
                    health:
                      current.status === "unavailable"
                        ? "unavailable"
                        : "healthy",
                    revision: current.revision,
                  }
                : {}),
            }),
            role,
          ),
        )
      : HttpResponse.json({ code: "not_found" }, { status: 404 });
  }),
  http.post(
    "/api/v1/admin/ai/providers/:providerId/actions",
    async ({ params, request }) => {
      const permissionError = denied(request, "ai.providers.manage");
      if (permissionError) return permissionError;
      const parsedId = safeAiIdSchema.safeParse(String(params.providerId));
      if (!parsedId.success) return safeAiError("validation_error", 400);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return safeAiError("validation_error", 400);
      }
      const parsedBody = providerActionRequestSchema.safeParse(body);
      if (!parsedBody.success) return safeAiError("validation_error", 400);
      return HttpResponse.json(
        applyProviderAction(parsedId.data, parsedBody.data),
      );
    },
  ),
  http.get("/api/v1/admin/ai/models", async ({ request }) => {
    const permissionError = denied(request, "ai.models.read");
    if (permissionError) return permissionError;
    const scenario = readAiScenario(request);
    if (scenario === "slow") await delay(250);
    const scenarioError = aiScenarioError(scenario);
    if (scenarioError) return scenarioError;
    const parsedQuery = aiListQuerySchema.safeParse(queryValues(request));
    if (!parsedQuery.success) return safeAiError("validation_error", 400);
    const role = simulatedRole(request);
    const query = parsedQuery.data;
    const items =
      scenario === "empty" || !role
        ? []
        : aiModelsFixture
            .filter(
              (model) =>
                (!query.search ||
                  `${model.id} ${model.name}`
                    .toLocaleLowerCase()
                    .includes(query.search.toLocaleLowerCase())) &&
                (!query.providerId || model.providerId === query.providerId) &&
                (!query.status ||
                  ("status" in model && model.status === query.status)) &&
                (!query.feature ||
                  ("features" in model &&
                    (model.features?.includes(query.feature) ?? false))),
            )
            .map((model) => {
              if (model.accessLevel !== "full")
                return projectModel(model, role);
              const current = phase5Record(model.id);
              return projectModel(
                current
                  ? {
                      ...model,
                      status:
                        current.status === "inactive" ? "inactive" : "active",
                      revision: current.revision,
                    }
                  : model,
                role,
              );
            });
    return HttpResponse.json(aiModelsPageSchema.parse(paginated(items, query)));
  }),
  http.post(
    "/api/v1/admin/ai/models/:modelId/actions",
    async ({ params, request }) => {
      const permissionError = denied(request, "ai.models.manage");
      if (permissionError) return permissionError;
      const parsedId = safeAiIdSchema.safeParse(String(params.modelId));
      if (!parsedId.success) return safeAiError("validation_error", 400);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return safeAiError("validation_error", 400);
      }
      const parsedBody = aiOperationalActionRequestSchema.safeParse(body);
      if (!parsedBody.success) return safeAiError("validation_error", 400);
      const model = aiModelsFixture.find((item) => item.id === parsedId.data);
      if (!model || model.accessLevel !== "full")
        return safeAiError("not_found", 404);
      if (!model.actions.some((action) => action === parsedBody.data.action)) {
        return safeAiError("validation_error", 400);
      }
      const current = phase5Record(model.id);
      if (!current) return safeAiError("not_found", 404);
      if (
        parsedBody.data.context.expectedState !== current.status ||
        parsedBody.data.context.expectedRevision !== current.revision
      )
        return safeAiError("conflict", 409);
      return HttpResponse.json(applyAiRecordAction(model.id, parsedBody.data));
    },
  ),
  http.get("/api/v1/admin/ai/prompts/:promptId", ({ params, request }) => {
    const permissionError = denied(request, "ai.prompts.read");
    if (permissionError) return permissionError;
    const parsedId = safeAiIdSchema.safeParse(String(params.promptId));
    if (!parsedId.success) return safeAiError("validation_error", 400);
    const prompt = aiPromptDetailsFixture.find(
      (item) => item.id === parsedId.data,
    );
    return prompt
      ? HttpResponse.json(aiPromptDetailSchema.parse(prompt))
      : safeAiError("not_found", 404);
  }),
  ...(
    [
      ["prompts", "ai.prompts.read"],
      ["usage", "ai.usage.read"],
      ["failures", "ai.failures.manage"],
      ["reports", "ai.reports.manage"],
      ["safety-rules", "ai.safety.read"],
    ] as const
  ).map(([resource, permission]) =>
    http.get(`/api/v1/admin/ai/${resource}`, async ({ request }) => {
      const permissionError = denied(request, permission);
      if (permissionError) return permissionError;
      const parsedQuery = aiListQuerySchema.safeParse(queryValues(request));
      if (!parsedQuery.success) return safeAiError("validation_error", 400);
      const scenario = readAiScenario(request);
      if (scenario === "slow") await delay(250);
      const scenarioError = aiScenarioError(scenario);
      if (scenarioError) return scenarioError;
      const baseItems = aiOperationalFixture.filter(
        (item) => item.resource === resource,
      );
      const promptBase = baseItems[0];
      const promptDrafts =
        resource === "prompts" && promptBase
          ? phase5RollbackDraftIds().map((id, index) => ({
              ...promptBase,
              id,
              title: `${promptBase.title} rollback draft`,
              status: "draft",
              version: `rollback-${index + 1}`,
              revision: 1,
              actions: ["test"],
            }))
          : [];
      const role = simulatedRole(request);
      const items = [...baseItems, ...promptDrafts].map((item) => {
        const current = phase5Record(item.id);
        const projected = {
          ...item,
          ...(current ?? {}),
          actions: actionsForOperationalState(
            item,
            current?.status ?? item.status,
          ),
        };
        return projectOperational(projected, role ?? "content-manager");
      });
      const page = operationalPage(
        scenario === "empty" ? [] : items,
        parsedQuery.data,
      );
      return HttpResponse.json(
        aiOperationalPageSchema.parse({
          ...page,
          region:
            scenario === "partial"
              ? {
                  availability: "partial",
                  message: "Some AI metadata is delayed.",
                  retryable: true,
                }
              : page.region,
        }),
      );
    }),
  ),
  ...(
    [
      ["prompts", "ai.prompts.manage"],
      ["failures", "ai.failures.manage"],
      ["reports", "ai.reports.manage"],
      ["safety-rules", "ai.safety.manage"],
    ] as const
  ).map(([resource, permission]) =>
    http.post(
      `/api/v1/admin/ai/${resource}/:recordId/actions`,
      async ({ params, request }) => {
        const permissionError = denied(request, permission);
        if (permissionError) return permissionError;
        const parsedId = safeAiIdSchema.safeParse(String(params.recordId));
        if (!parsedId.success) return safeAiError("validation_error", 400);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return safeAiError("validation_error", 400);
        }
        const parsedBody = aiOperationalActionRequestSchema.safeParse(body);
        if (!parsedBody.success) return safeAiError("validation_error", 400);
        const record = aiOperationalFixture.find(
          (item) => item.resource === resource && item.id === parsedId.data,
        );
        if (!record) return safeAiError("not_found", 404);
        const current = phase5Record(record.id);
        if (!current) return safeAiError("not_found", 404);
        const prompt =
          resource === "prompts"
            ? aiPromptDetailsFixture.find((item) => item.id === record.id)
            : undefined;
        if (
          resource === "prompts" &&
          parsedBody.data.action === "activate" &&
          !prompt?.fictionalTests
            .filter((test) => test.required)
            .every((test) => test.passed)
        )
          return safeAiError("validation_error", 400);
        if (
          resource === "safety-rules" &&
          ["deactivate", "retire"].includes(parsedBody.data.action) &&
          record.safetyDefinition?.requiredCoverage
        )
          return safeAiError("conflict", 409);
        if (
          !actionsForOperationalState(record, current.status).includes(
            parsedBody.data.action,
          )
        ) {
          return safeAiError("validation_error", 400);
        }
        if (
          parsedBody.data.context.expectedState !== current.status ||
          parsedBody.data.context.expectedRevision !== current.revision
        )
          return safeAiError("conflict", 409);
        return HttpResponse.json(
          applyAiRecordAction(record.id, parsedBody.data),
        );
      },
    ),
  ),
];

export function safeAiError(code: string, status: number): Response {
  return HttpResponse.json({ code }, { status });
}

export function unsafeAiScenario(scenario: SafeScenario): Response | null {
  if (scenario === "unsafe-response" || scenario === "masking-violation") {
    return HttpResponse.json({ code: "validation_error" }, { status: 502 });
  }
  return null;
}

export function aiScenarioError(scenario: SafeScenario): Response | null {
  const errors: Partial<Record<SafeScenario, [string, number]>> = {
    unauthorized: ["session_expired", 401],
    forbidden: ["forbidden", 403],
    "not-found": ["not_found", 404],
    expired: ["gone", 410],
    validation: ["validation_error", 400],
    conflict: ["conflict", 409],
    "rate-limited": ["rate_limited", 429],
    unavailable: ["provider_unavailable", 503],
    "internal-error": ["internal_error", 500],
    "duplicate-pending": ["conflict", 409],
  };
  const error = errors[scenario];
  return (
    unsafeAiScenario(scenario) ??
    (error ? safeAiError(error[0], error[1]) : null)
  );
}
