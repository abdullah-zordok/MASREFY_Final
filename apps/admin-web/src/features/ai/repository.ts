import {
  apiClient,
  liveCursor,
  mocksEnabled,
  rememberLiveCursor,
} from "@/core/api/client";
import { ApiError, safeApiMessage } from "@/core/api/errors";
import { z } from "zod";
import {
  aiListQuerySchema,
  aiOverviewQuerySchema,
  aiOverviewSchema,
  aiProvidersPageSchema,
  aiProviderDetailSchema,
  aiModelsPageSchema,
  aiActionResultSchema,
  providerActionRequestSchema,
  aiOperationalPageSchema,
  aiOperationalRecordSchema,
  aiPromptDetailSchema,
  aiOperationalActionRequestSchema,
  apiErrorSchema,
  aiAdminPageSchema,
  aiAdminResourceSchema,
  buildAiQuery,
  safeAiIdSchema,
  type AiListQuery,
  type AiOverviewData,
  type AiOverviewQuery,
  type AiModelSummary,
  type AiProviderDetail,
  type AiProviderSummary,
  type ProviderActionRequest,
  type AiOperationalActionRequest,
  type AiOperationalRecord,
  type AiOperationalResource,
  type AiPromptDetail,
  type AiPagination,
  type AiRegionState,
  type AiAdminResource,
} from "./contracts";

export { buildAiQuery };

export const AI_BASE_PATH = "/api/v1/admin/ai";

export function encodeAiId(id: string): string {
  return encodeURIComponent(safeAiIdSchema.parse(id));
}

export interface AiRepository {
  probe(): Promise<unknown>;
  getOverview(input: AiOverviewQuery): Promise<AiOverviewData>;
  listProviders(input: AiListQuery): Promise<{
    items: AiProviderSummary[];
    pagination: AiPagination;
    region: AiRegionState;
  }>;
  getProvider(id: string): Promise<AiProviderDetail>;
  listModels(input: AiListQuery): Promise<{
    items: AiModelSummary[];
    pagination: AiPagination;
    region: AiRegionState;
  }>;
  actOnProvider(id: string, input: ProviderActionRequest): Promise<unknown>;
  actOnModel(id: string, input: AiOperationalActionRequest): Promise<unknown>;
  listOperational(
    resource: AiOperationalResource,
    input: AiListQuery,
  ): Promise<{
    items: AiOperationalRecord[];
    pagination: AiPagination;
    region: AiRegionState;
  }>;
  getPrompt(id: string): Promise<AiPromptDetail>;
  actOnOperational(
    resource: Exclude<AiOperationalResource, "usage">,
    id: string,
    input: AiOperationalActionRequest,
  ): Promise<unknown>;
  listRoutes(
    input: AiListQuery,
  ): Promise<{ items: AiAdminResource[]; nextCursor: string | null }>;
  updateRoute(
    id: string,
    input: Record<string, unknown>,
  ): Promise<AiAdminResource>;
}

const liveProbeSchema = z
  .object({ status: z.enum(["available", "unavailable"]) })
  .strict();
const acceptedWorkSchema = z
  .object({
    id: z.uuid(),
    status: z.enum([
      "queued",
      "processing",
      "completed",
      "failed",
      "cancelled",
    ]),
  })
  .strict();
const liveDate = z.iso.datetime({ offset: true });
const decimal = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/);
const providerDataSchema = z
  .object({
    key: z.string().min(1),
    displayName: z.string().min(1),
    approved: z.boolean(),
    zdrCapable: z.boolean(),
    trainingPolicy: z.enum(["unknown", "no_training", "may_train"]),
    retentionReviewedAt: liveDate.nullable(),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const modelDataSchema = z
  .object({
    providerId: z.uuid(),
    modelId: z.string().min(1),
    capabilities: z.array(z.enum(["text", "audio_input", "structured_output"])),
    approved: z.boolean(),
    maxContext: z.number().int().positive(),
    structuredOutput: z.boolean(),
    costPolicy: z
      .object({
        prompt: decimal,
        completion: decimal,
        audio: decimal.optional(),
        reviewedAt: z.iso.date().optional(),
      })
      .strict(),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const routeDataSchema = z
  .object({
    workload: z.string().min(1),
    primaryModelId: z.uuid(),
    fallbackModelIds: z.array(z.uuid()),
    providerAllowlist: z.array(z.string().min(1)),
    zdrRequired: z.literal(true),
    maxPrice: z.object({ prompt: decimal, completion: decimal }).strict(),
    limits: z
      .object({
        inputTokens: z.number().int().positive(),
        outputTokens: z.number().int().positive(),
        timeoutMs: z.number().int().positive(),
        monthlyBudget: decimal,
      })
      .strict(),
    enabled: z.boolean(),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const overviewDataSchema = z
  .object({
    providers: z.number().int().nonnegative(),
    models: z.number().int().nonnegative(),
    enabledRoutes: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    estimatedCost: decimal,
    failures: z.number().int().nonnegative(),
  })
  .strict();
const usageDataSchema = z
  .object({
    workload: z.string().min(1),
    model: z.string().min(1),
    provider: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCost: decimal,
    latencyMs: z.number().int().nonnegative(),
    fallbackUsed: z.boolean(),
    status: z.enum(["reserved", "completed", "failed", "released"]),
    createdAt: liveDate,
  })
  .strict();
const failureDataSchema = z
  .object({
    workload: z.string().min(1),
    model: z.string().nullable(),
    provider: z.string().nullable(),
    failureCode: z.string().min(1),
    schemaFailure: z.boolean(),
    retryable: z.boolean(),
    latencyMs: z.number().int().nonnegative(),
    requestId: z.string().min(1),
    status: z.enum(["open", "acknowledged", "resolved"]),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const reportDataSchema = z
  .object({
    reportType: z.enum([
      "unsafe",
      "inaccurate",
      "irrelevant",
      "privacy",
      "other",
    ]),
    status: z.enum(["open", "reviewed", "actioned", "dismissed"]),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const safetyDataSchema = z
  .object({
    key: z.string().min(1),
    workload: z.string().min(1),
    ruleType: z.enum([
      "input_block",
      "output_block",
      "field_limit",
      "action_allowlist",
      "evidence_limit",
    ]),
    configuration: z.record(z.string(), z.unknown()),
    enabled: z.boolean(),
    createdAt: liveDate,
    updatedAt: liveDate,
  })
  .strict();
const promptDataSchema = z
  .object({
    workload: z.string().min(1),
    template: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    status: z.enum(["draft", "testing", "approved", "retired"]),
    approvedBy: z.string().nullable(),
    publishedAt: liveDate.nullable(),
    evaluationPassed: z.boolean(),
    evaluationSummary: z.record(z.string(), z.unknown()),
    attemptCount: z.number().int().nonnegative(),
    nextAttemptAt: liveDate,
    createdAt: liveDate,
  })
  .strict();
const liveResource = <T extends z.ZodType>(kind: string, data: T) =>
  z
    .object({
      id: z.uuid(),
      kind: z.literal(kind),
      version: z.number().int().positive(),
      data,
    })
    .strict();
function parseLive<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      "contract_mismatch",
      safeApiMessage("contract_mismatch"),
      502,
    );
  return parsed.data;
}
const rawId = (id: string) => id.replace(/^[A-Z]+-(?=[0-9a-f]{8}-)/iu, "");
const prefixed = (prefix: string, id: string) =>
  `${prefix}-${id.toUpperCase()}`;
const money = (amount: unknown, freshness: string) => ({
  amount: String(amount),
  currency: "USD",
  estimated: true as const,
  freshness,
});
const loadedByCursor = new Map<string, number>();
const liveQuery = (input: AiListQuery, resource: string) => {
  const current = input.page ?? 1;
  const cursor = liveCursor(
    `ai:${resource}:${String(input.pageSize ?? 25)}`,
    current,
  );
  const params = new URLSearchParams({ limit: String(input.pageSize ?? 25) });
  if (cursor) params.set("cursor", cursor);
  return params;
};
function livePagination(
  resource: string,
  input: AiListQuery,
  page: { items: unknown[]; nextCursor: string | null },
): AiPagination {
  const current = input.page ?? 1,
    size = input.pageSize ?? 25;
  const scope = `ai:${resource}:${String(size)}`;
  const cursor = liveCursor(scope, current);
  const loaded =
    (cursor ? (loadedByCursor.get(`${resource}:${cursor}`) ?? 0) : 0) +
    page.items.length;
  rememberLiveCursor(scope, current, page.nextCursor);
  if (page.nextCursor)
    loadedByCursor.set(`${resource}:${page.nextCursor}`, loaded);
  return {
    page: current,
    pageSize: size,
    totalItems: loaded + (page.nextCursor ? 1 : 0),
    totalPages: current + (page.nextCursor ? 1 : 0),
  };
}

function provider(value: AiAdminResource): AiProviderSummary {
  const row = parseLive(liveResource("provider", providerDataSchema), value),
    data = row.data;
  return {
    id: prefixed("AIP", row.id),
    name: data.displayName,
    freshness: data.updatedAt,
    revision: row.version,
    accessLevel: "full",
    health: data.approved ? "healthy" : "unavailable",
    actions: [data.approved ? "deactivate" : "activate"],
  };
}

function model(value: AiAdminResource): AiModelSummary {
  const row = parseLive(liveResource("model", modelDataSchema), value),
    data = row.data;
  return {
    id: prefixed("AIM", row.id),
    name: data.modelId,
    providerId: prefixed("AIP", data.providerId),
    revision: row.version,
    accessLevel: "full",
    inputLimit: data.maxContext,
    inputCost: money(data.costPolicy.prompt, data.updatedAt),
    outputCost: money(data.costPolicy.completion, data.updatedAt),
    status: data.approved ? "active" : "inactive",
    version: String(row.version),
    eligible: data.approved && data.structuredOutput,
    actions: [data.approved ? "deactivate" : "activate"],
  };
}

function operational(
  value: AiAdminResource,
  resource: AiOperationalResource,
): AiOperationalRecord {
  const schemas = {
    usage: usageDataSchema,
    failures: failureDataSchema,
    reports: reportDataSchema,
    "safety-rules": safetyDataSchema,
    prompts: promptDataSchema,
  } as const;
  const kinds = {
    usage: "usage",
    failures: "failure",
    reports: "response-report",
    "safety-rules": "safety-rule",
    prompts: "prompt",
  } as const;
  const row = parseLive(
    liveResource(kinds[resource], schemas[resource]),
    value,
  );
  const data = row.data as Record<string, unknown>,
    feature =
      data.workload === "voice_transcription"
        ? "voice_parsing"
        : data.workload === "transaction_classification"
          ? "categorization"
          : data.workload === "report_summarization"
            ? "report_explanation"
            : data.workload === "financial_insights"
              ? "spending_insights"
              : "financial_assistant";
  const status = String(
    data.status ?? (data.enabled === false ? "inactive" : "active"),
  );
  const actions =
    resource === "prompts"
      ? status === "draft"
        ? ["test"]
        : status === "testing" && data.evaluationPassed === true
          ? ["activate"]
          : []
      : resource === "failures"
        ? status === "open"
          ? ["acknowledge", "resolve"]
          : status === "acknowledged"
            ? ["resolve"]
            : []
        : resource === "reports"
          ? ["confirmed_issue", "no_issue", "duplicate"]
          : resource === "safety-rules"
            ? [data.enabled === false ? "activate" : "deactivate"]
            : [];
  const base: Record<string, unknown> = {
    id: prefixed(
      resource === "prompts"
        ? "AIPR"
        : resource === "usage"
          ? "AIU"
          : resource === "failures"
            ? "AIF"
            : resource === "reports"
              ? "AIR"
              : "AIS",
      row.id,
    ),
    resource,
    accessLevel: "full",
    title: String(
      data.key ?? data.model ?? data.reportType ?? data.failureCode ?? row.kind,
    ),
    feature,
    status,
    updatedAt: String(data.updatedAt ?? data.createdAt),
    revision: row.version,
    actions,
  };
  if (resource === "usage")
    Object.assign(base, {
      inputUnits: data.inputTokens,
      outputUnits: data.outputTokens,
      estimatedCost: money(data.estimatedCost, String(data.createdAt)),
    });
  if (resource === "failures")
    Object.assign(base, { safeErrorClass: data.failureCode });
  if (resource === "safety-rules")
    Object.assign(base, { version: String(data.ruleType) });
  return aiOperationalRecordSchema.parse(base);
}

export const aiRepository: AiRepository = {
  probe() {
    return mocksEnabled()
      ? apiClient.get(`${AI_BASE_PATH}/probe`, apiErrorSchema)
      : apiClient.get(`${AI_BASE_PATH}/probe`, liveProbeSchema);
  },
  getOverview(input) {
    if (!mocksEnabled())
      return apiClient
        .get(`${AI_BASE_PATH}/overview`, aiAdminResourceSchema)
        .then((value) => {
          const data = parseLive(
              liveResource("overview", overviewDataSchema),
              value,
            ).data,
            requests = data.requests,
            failures = data.failures;
          const observedAt = new Date().toISOString();
          return aiOverviewSchema.parse({
            query: aiOverviewQuerySchema.parse(input),
            metrics: [
              {
                key: "original_requests",
                label: "Original requests",
                value: requests,
                unit: "requests",
                platform: "all",
                denominator: "original_requests",
                freshness: observedAt,
              },
              {
                key: "failed_requests",
                label: "Failed requests",
                value: failures,
                unit: "failures",
                platform: "all",
                denominator: "failures",
                freshness: observedAt,
              },
            ],
            totalOriginalRequests: requests,
            totalAttempts: requests,
            fallbackAttempts: 0,
            costByCurrency: [money(data.estimatedCost, observedAt)],
            featureDistribution: [],
            providerDistribution: [],
            platformDistribution: [],
            trend: [],
            regions: {
              metrics: { availability: "available" },
              charts: { availability: "empty" },
            },
          });
        });
    const params = buildAiQuery(aiOverviewQuerySchema, input);
    return apiClient.get(
      `${AI_BASE_PATH}/overview?${params}`,
      aiOverviewSchema,
    );
  },
  listProviders(input) {
    if (!mocksEnabled())
      return apiClient
        .get(
          `${AI_BASE_PATH}/providers?${liveQuery(input, "providers")}`,
          aiAdminPageSchema,
        )
        .then((page) => ({
          items: page.items.map(provider),
          pagination: livePagination("providers", input, page),
          region: {
            availability: page.items.length
              ? ("available" as const)
              : ("empty" as const),
          },
        }));
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(
      `${AI_BASE_PATH}/providers?${params}`,
      aiProvidersPageSchema,
    );
  },
  getProvider(id) {
    if (!mocksEnabled())
      return apiClient
        .get(
          `${AI_BASE_PATH}/providers/${encodeURIComponent(rawId(id))}`,
          aiAdminResourceSchema,
        )
        .then(provider);
    return apiClient.get(
      `${AI_BASE_PATH}/providers/${encodeAiId(id)}`,
      aiProviderDetailSchema,
    );
  },
  listModels(input) {
    if (!mocksEnabled())
      return apiClient
        .get(
          `${AI_BASE_PATH}/models?${liveQuery(input, "models")}`,
          aiAdminPageSchema,
        )
        .then((page) => ({
          items: page.items.map(model),
          pagination: livePagination("models", input, page),
          region: {
            availability: page.items.length
              ? ("available" as const)
              : ("empty" as const),
          },
        }));
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(
      `${AI_BASE_PATH}/models?${params}`,
      aiModelsPageSchema,
    );
  },
  actOnProvider(id, input) {
    const request = providerActionRequestSchema.parse(input);
    if (!mocksEnabled()) {
      if (request.action === "update_fallback")
        throw new Error("AI_ROUTE_ID_REQUIRED");
      return apiClient
        .patch(
          `${AI_BASE_PATH}/providers/${encodeURIComponent(rawId(id))}`,
          {
            expectedVersion: request.context.expectedRevision,
            reason: request.context.reason,
            approved: request.action === "activate",
          },
          aiAdminResourceSchema,
        )
        .then(provider);
    }
    return apiClient.post(
      `${AI_BASE_PATH}/providers/${encodeAiId(id)}/actions`,
      request,
      aiActionResultSchema,
    );
  },
  actOnModel(id, input) {
    const request = aiOperationalActionRequestSchema.parse(input);
    if (!mocksEnabled())
      return apiClient
        .patch(
          `${AI_BASE_PATH}/models/${encodeURIComponent(rawId(id))}`,
          {
            expectedVersion: request.context.expectedRevision,
            reason: request.context.reason,
            approved: request.action === "activate",
          },
          aiAdminResourceSchema,
        )
        .then(model);
    return apiClient.post(
      `${AI_BASE_PATH}/models/${encodeAiId(id)}/actions`,
      request,
      aiActionResultSchema,
    );
  },
  listOperational(resource, input) {
    if (!mocksEnabled()) {
      const path = resource === "reports" ? "response-reports" : resource;
      return apiClient
        .get(
          `${AI_BASE_PATH}/${path}?${liveQuery(input, path)}`,
          aiAdminPageSchema,
        )
        .then((page) => ({
          items: page.items.map((item) => operational(item, resource)),
          pagination: livePagination(path, input, page),
          region: {
            availability: page.items.length
              ? ("available" as const)
              : ("empty" as const),
          },
        }));
    }
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(
      `${AI_BASE_PATH}/${resource}?${params}`,
      aiOperationalPageSchema,
    );
  },
  getPrompt(id) {
    if (!mocksEnabled())
      return apiClient
        .get(
          `${AI_BASE_PATH}/prompts/${encodeURIComponent(rawId(id))}`,
          aiAdminResourceSchema,
        )
        .then((value) => {
          const row = parseLive(
              liveResource("prompt", promptDataSchema),
              value,
            ),
            item = operational(value, "prompts"),
            data = row.data;
          return aiPromptDetailSchema.parse({
            ...item,
            resource: "prompts",
            sanitizedPreview: data.template,
            variables: [],
            outputSchemaSummary: [`schema-v${String(data.schemaVersion)}`],
            validationRules: [],
            fictionalTests: [],
            history: [
              {
                version: String(row.version),
                status: data.status === "approved" ? "active" : data.status,
                immutable: true,
              },
            ],
          });
        });
    return apiClient.get(
      `${AI_BASE_PATH}/prompts/${encodeAiId(id)}`,
      aiPromptDetailSchema,
    );
  },
  actOnOperational(resource, id, input) {
    const request = aiOperationalActionRequestSchema.parse(input);
    if (!mocksEnabled()) {
      const path = resource === "reports" ? "response-reports" : resource;
      const body: Record<string, unknown> = {
        expectedVersion: request.context.expectedRevision,
        reason: request.context.reason,
      };
      if (resource === "reports")
        body.status =
          request.action === "confirmed_issue"
            ? "actioned"
            : request.action === "resolve"
              ? "reviewed"
              : "dismissed";
      if (resource === "safety-rules")
        body.enabled = request.action === "activate";
      if (resource === "failures")
        body.status =
          request.action === "resolve"
            ? "resolved"
            : request.action === "reopen"
              ? "open"
              : "acknowledged";
      if (
        resource === "prompts" &&
        !["test", "activate"].includes(request.action)
      )
        throw new Error("AI_PROMPT_ACTION_UNAVAILABLE");
      const endpoint =
        resource === "prompts"
          ? `${AI_BASE_PATH}/prompts/${encodeURIComponent(rawId(id))}/${request.action === "test" ? "test" : "publish"}`
          : resource === "failures"
            ? `${AI_BASE_PATH}/failures/${encodeURIComponent(rawId(id))}/actions`
            : `${AI_BASE_PATH}/${path}/${encodeURIComponent(rawId(id))}`;
      if (resource === "prompts" && request.action === "test")
        return apiClient.post(endpoint, body, acceptedWorkSchema);
      const operation =
        resource === "prompts" || resource === "failures"
          ? apiClient.post(endpoint, body, aiAdminResourceSchema)
          : apiClient.patch(endpoint, body, aiAdminResourceSchema);
      return operation.then((value) => operational(value, resource));
    }
    return apiClient.post(
      `${AI_BASE_PATH}/${resource}/${encodeAiId(id)}/actions`,
      request,
      aiActionResultSchema,
    );
  },
  listRoutes(input) {
    return apiClient
      .get(
        `${AI_BASE_PATH}/routes?${liveQuery(input, "routes")}`,
        aiAdminPageSchema,
      )
      .then((page) => {
        livePagination("routes", input, page);
        return {
          ...page,
          items: page.items.map((item) =>
            parseLive(liveResource("route", routeDataSchema), item),
          ),
        };
      });
  },
  updateRoute(id, input) {
    return apiClient
      .patch(
        `${AI_BASE_PATH}/routes/${encodeURIComponent(rawId(id))}`,
        input,
        aiAdminResourceSchema,
      )
      .then((item) => parseLive(liveResource("route", routeDataSchema), item));
  },
};

export function aiQuery(input: AiListQuery): URLSearchParams {
  return buildAiQuery(aiListQuerySchema, input);
}
