import { apiClient } from "@/core/api/client";
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
  listProviders(input: AiListQuery): Promise<{ items: AiProviderSummary[]; pagination: AiPagination; region: AiRegionState }>;
  getProvider(id: string): Promise<AiProviderDetail>;
  listModels(input: AiListQuery): Promise<{ items: AiModelSummary[]; pagination: AiPagination; region: AiRegionState }>;
  actOnProvider(id: string, input: ProviderActionRequest): Promise<unknown>;
  actOnModel(id: string, input: AiOperationalActionRequest): Promise<unknown>;
  listOperational(resource: AiOperationalResource, input: AiListQuery): Promise<{ items: AiOperationalRecord[]; pagination: AiPagination; region: AiRegionState }>;
  getPrompt(id: string): Promise<AiPromptDetail>;
  actOnOperational(resource: Exclude<AiOperationalResource, "usage">, id: string, input: AiOperationalActionRequest): Promise<unknown>;
  listRoutes(input: AiListQuery): Promise<{ items: AiAdminResource[]; nextCursor: string | null }>;
  updateRoute(id: string, input: Record<string, unknown>): Promise<AiAdminResource>;
}

const liveProbeSchema = z.object({ status: z.enum(["available", "unavailable"]) }).strict();
const mutationResultSchema = z.object({ id: z.uuid() }).passthrough();
const mocksEnabled = () => process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true" || (process.env.NODE_ENV === "test" && process.env.NEXT_PUBLIC_ENABLE_MOCKS !== "false");
const rawId = (id: string) => id.replace(/^[A-Z]+-(?=[0-9a-f]{8}-)/iu, "");
const prefixed = (prefix: string, id: string) => `${prefix}-${id.toUpperCase()}`;
const freshness = (data: Record<string, unknown>) => typeof data.updatedAt === "string" ? data.updatedAt : typeof data.createdAt === "string" ? data.createdAt : new Date(0).toISOString();
const money = (amount: unknown = "0") => ({ amount: String(amount), currency: "USD", estimated: true as const, freshness: new Date(0).toISOString() });
const liveCursors = new Map<string, string>();
const liveQuery = (input: AiListQuery, resource: string) => {
  const params = new URLSearchParams({ limit: String(input.pageSize ?? 25) }), cursor = liveCursors.get(`${resource}:${String(input.page ?? 1)}`);
  if (cursor) params.set("cursor", cursor);
  return params;
};
function livePagination(resource: string, input: AiListQuery, page: { items: unknown[]; nextCursor: string | null }): AiPagination {
  const current = input.page ?? 1, size = input.pageSize ?? 25;
  if (page.nextCursor) liveCursors.set(`${resource}:${String(current + 1)}`, page.nextCursor);
  return { page: current, pageSize: size, totalItems: (current - 1) * size + page.items.length + (page.nextCursor ? 1 : 0), totalPages: current + (page.nextCursor ? 1 : 0) };
}

function provider(value: AiAdminResource): AiProviderSummary {
  const data = value.data;
  return { id: prefixed("AIP", value.id), name: String(data.displayName ?? data.key ?? "Provider"), freshness: freshness(data), revision: value.version, accessLevel: "full", health: data.approved === true ? "healthy" : "unavailable", defaultModelId: prefixed("AIM", value.id), features: ["financial_assistant"], locales: ["ar", "en"], latencyMs: 0, failureRate: 0, estimatedCost: money(), fallbackRoutes: [], rateLimit: "server_enforced", actions: [data.approved === true ? "deactivate" : "activate"] };
}

function model(value: AiAdminResource): AiModelSummary {
  const data = value.data, policy = data.costPolicy && typeof data.costPolicy === "object" ? data.costPolicy as Record<string, unknown> : {};
  return { id: prefixed("AIM", value.id), name: String(data.modelId ?? "Model"), providerId: prefixed("AIP", String(data.providerId ?? value.id)), revision: value.version, accessLevel: "full", features: ["financial_assistant"], locales: ["ar", "en"], assignments: [], inputLimit: Number(data.maxContext ?? 1), inputCost: money(policy.prompt), outputCost: money(policy.completion), status: data.approved === true ? "active" : "inactive", version: String(value.version), eligible: data.approved === true, actions: [data.approved === true ? "deactivate" : "activate"] };
}

function operational(value: AiAdminResource, resource: AiOperationalResource): AiOperationalRecord {
  const data = value.data, feature = data.workload === "voice_transcription" ? "voice_parsing" : "financial_assistant";
  const status = String(data.status ?? (data.enabled === false ? "inactive" : "active"));
  const actions = resource === "prompts" ? status === "draft" ? ["test"] : status === "testing" && data.evaluationPassed === true ? ["activate"] : []
    : resource === "failures" ? status === "open" ? ["acknowledge", "resolve"] : status === "acknowledged" ? ["resolve"] : []
    : resource === "reports" ? ["confirmed_issue", "no_issue", "duplicate"] : resource === "safety-rules" ? [data.enabled === false ? "activate" : "deactivate"] : [];
  const base: Record<string, unknown> = { id: prefixed(resource === "prompts" ? "AIPR" : resource === "usage" ? "AIU" : resource === "failures" ? "AIF" : resource === "reports" ? "AIR" : "AIS", value.id), resource, accessLevel: "full", title: String(data.key ?? data.model ?? data.reportType ?? value.kind), feature, status, updatedAt: freshness(data), revision: value.version, actions };
  if (resource === "usage") Object.assign(base, { inputUnits: Number(data.inputTokens ?? 0), outputUnits: Number(data.outputTokens ?? 0), estimatedCost: money(data.estimatedCost) });
  if (resource === "failures") Object.assign(base, { severity: "high", safeErrorClass: String(data.failureCode ?? "AI_FAILURE"), attemptCount: 1 });
  if (resource === "reports") Object.assign(base, { severity: "high", sanitizedExcerpt: "Sensitive content omitted", sanitizedBy: "future_backend", omissionLabel: "Sensitive values omitted" });
  if (resource === "safety-rules") Object.assign(base, { safetyDefinition: { conditions: [{ field: "feature", operator: "equals", value: feature }], outcome: "require_review", requiredCoverage: true } });
  return aiOperationalRecordSchema.parse(base);
}

function actionResult(id: string, previousState: string, currentState: string) {
  return aiActionResultSchema.parse({ affectedId: id, previousState, currentState, outcome: "success", message: "Saved" });
}

export const aiRepository: AiRepository = {
  probe() {
    return mocksEnabled() ? apiClient.get(`${AI_BASE_PATH}/probe`, apiErrorSchema) : apiClient.get(`${AI_BASE_PATH}/probe`, liveProbeSchema);
  },
  getOverview(input) {
    if (!mocksEnabled()) return apiClient.get(`${AI_BASE_PATH}/overview`, aiAdminResourceSchema).then((value) => {
      const data = value.data, requests = Number(data.requests ?? 0), failures = Number(data.failures ?? 0);
      return aiOverviewSchema.parse({ query: aiOverviewQuerySchema.parse(input), metrics: [{ key: "original_requests", label: "Original requests", value: requests, unit: "requests", platform: "all", denominator: "original_requests", freshness: new Date().toISOString() }, { key: "failed_requests", label: "Failed requests", value: failures, unit: "failures", platform: "all", denominator: "failures", freshness: new Date().toISOString() }], totalOriginalRequests: requests, totalAttempts: requests, fallbackAttempts: 0, costByCurrency: [money(data.estimatedCost)], featureDistribution: [], providerDistribution: [], platformDistribution: [], trend: [], regions: { metrics: { availability: "available" }, charts: { availability: "empty" } } });
    });
    const params = buildAiQuery(aiOverviewQuerySchema, input);
    return apiClient.get(`${AI_BASE_PATH}/overview?${params}`, aiOverviewSchema);
  },
  listProviders(input) {
    if (!mocksEnabled()) return apiClient.get(`${AI_BASE_PATH}/providers?${liveQuery(input, "providers")}`, aiAdminPageSchema).then((page) => ({ items: page.items.map(provider), pagination: livePagination("providers", input, page), region: { availability: page.items.length ? "available" as const : "empty" as const } }));
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(`${AI_BASE_PATH}/providers?${params}`, aiProvidersPageSchema);
  },
  getProvider(id) {
    if (!mocksEnabled()) return apiClient.get(`${AI_BASE_PATH}/providers/${encodeURIComponent(rawId(id))}`, aiAdminResourceSchema).then(provider);
    return apiClient.get(`${AI_BASE_PATH}/providers/${encodeAiId(id)}`, aiProviderDetailSchema);
  },
  listModels(input) {
    if (!mocksEnabled()) return apiClient.get(`${AI_BASE_PATH}/models?${liveQuery(input, "models")}`, aiAdminPageSchema).then((page) => ({ items: page.items.map(model), pagination: livePagination("models", input, page), region: { availability: page.items.length ? "available" as const : "empty" as const } }));
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(`${AI_BASE_PATH}/models?${params}`, aiModelsPageSchema);
  },
  actOnProvider(id, input) {
    const request = providerActionRequestSchema.parse(input);
    if (!mocksEnabled()) {
      if (request.action === "update_fallback") throw new Error("AI_ROUTE_ID_REQUIRED");
      return apiClient.patch(`${AI_BASE_PATH}/providers/${encodeURIComponent(rawId(id))}`, { expectedVersion: request.context.expectedRevision, reason: request.context.reason, approved: request.action === "activate" }, aiAdminResourceSchema).then(() => actionResult(id, request.context.expectedState, request.action === "activate" ? "healthy" : "unavailable"));
    }
    return apiClient.post(`${AI_BASE_PATH}/providers/${encodeAiId(id)}/actions`, request, aiActionResultSchema);
  },
  actOnModel(id, input) {
    const request = aiOperationalActionRequestSchema.parse(input);
    if (!mocksEnabled()) return apiClient.patch(`${AI_BASE_PATH}/models/${encodeURIComponent(rawId(id))}`, { expectedVersion: request.context.expectedRevision, reason: request.context.reason, approved: request.action === "activate" }, aiAdminResourceSchema).then(() => actionResult(id, request.context.expectedState, request.action === "activate" ? "active" : "inactive"));
    return apiClient.post(`${AI_BASE_PATH}/models/${encodeAiId(id)}/actions`, request, aiActionResultSchema);
  },
  listOperational(resource, input) {
    if (!mocksEnabled()) { const path = resource === "reports" ? "response-reports" : resource; return apiClient.get(`${AI_BASE_PATH}/${path}?${liveQuery(input, path)}`, aiAdminPageSchema).then((page) => ({ items: page.items.map((item) => operational(item, resource)), pagination: livePagination(path, input, page), region: { availability: page.items.length ? "available" as const : "empty" as const } })); }
    const params = buildAiQuery(aiListQuerySchema, input);
    return apiClient.get(`${AI_BASE_PATH}/${resource}?${params}`, aiOperationalPageSchema);
  },
  getPrompt(id) {
    if (!mocksEnabled()) return apiClient.get(`${AI_BASE_PATH}/prompts/${encodeURIComponent(rawId(id))}`, aiAdminResourceSchema).then((value) => {
      const item = operational(value, "prompts"), data = value.data;
      return aiPromptDetailSchema.parse({ ...item, resource: "prompts", sanitizedPreview: "Prompt content omitted from transport logs", variables: [], outputSchemaSummary: [`schema-v${String(data.schemaVersion ?? 1)}`], validationRules: ["Server-side structured output validation"], fictionalTests: [], history: [{ version: String(value.version), status: data.status === "approved" ? "active" : data.status === "testing" ? "testing" : data.status === "retired" ? "retired" : "draft", immutable: true }] });
    });
    return apiClient.get(`${AI_BASE_PATH}/prompts/${encodeAiId(id)}`, aiPromptDetailSchema);
  },
  actOnOperational(resource, id, input) {
    const request = aiOperationalActionRequestSchema.parse(input);
    if (!mocksEnabled()) {
      const path = resource === "reports" ? "response-reports" : resource;
      const body: Record<string, unknown> = { expectedVersion: request.context.expectedRevision, reason: request.context.reason };
      if (resource === "reports") body.status = request.action === "confirmed_issue" ? "actioned" : request.action === "resolve" ? "reviewed" : "dismissed";
      if (resource === "safety-rules") body.enabled = request.action === "activate";
      if (resource === "failures") body.status = request.action === "resolve" ? "resolved" : request.action === "reopen" ? "open" : "acknowledged";
      if (resource === "prompts" && !["test", "activate"].includes(request.action)) throw new Error("AI_PROMPT_ACTION_UNAVAILABLE");
      const endpoint = resource === "prompts" ? `${AI_BASE_PATH}/prompts/${encodeURIComponent(rawId(id))}/${request.action === "test" ? "test" : "publish"}` : resource === "failures" ? `${AI_BASE_PATH}/failures/${encodeURIComponent(rawId(id))}/actions` : `${AI_BASE_PATH}/${path}/${encodeURIComponent(rawId(id))}`;
      const operation = resource === "prompts" || resource === "failures" ? apiClient.post(endpoint, body, mutationResultSchema) : apiClient.patch(endpoint, body, aiAdminResourceSchema);
      return operation.then(() => actionResult(id, request.context.expectedState, String(body.status ?? (body.enabled === true ? "active" : "inactive"))));
    }
    return apiClient.post(`${AI_BASE_PATH}/${resource}/${encodeAiId(id)}/actions`, request, aiActionResultSchema);
  },
  listRoutes(input) { return apiClient.get(`${AI_BASE_PATH}/routes?${liveQuery(input, "routes")}`, aiAdminPageSchema); },
  updateRoute(id, input) { return apiClient.patch(`${AI_BASE_PATH}/routes/${encodeURIComponent(rawId(id))}`, input, aiAdminResourceSchema); },
};

export function aiQuery(input: AiListQuery): URLSearchParams {
  return buildAiQuery(aiListQuerySchema, input);
}
