import { z } from "zod";

function boundedUtf8(maxBytes: number) {
  return z.string().trim().refine(
    (text) => new TextEncoder().encode(text).length <= maxBytes,
    { message: `exceeds ${maxBytes} UTF-8 bytes` },
  );
}

function boundedCodePoints(max: number) {
  return z.string().refine((text) => [...text].length <= max, {
    message: `exceeds ${max} Unicode code points`,
  });
}

const pageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);

export const safeAiIdSchema = z.string()
  .max(48)
  .regex(/^(AIP|AIM|AIPR|AIU|AIF|AIR|AIS|AIA)-[A-Za-z0-9-]{1,43}$/);

export const platformScopeSchema = z.enum(["all", "ios", "android", "unknown"]);
export const localeScopeSchema = z.enum(["ar", "en"]);
export const aiFeatureSchema = z.enum([
  "receipt_analysis",
  "screenshot_analysis",
  "voice_parsing",
  "categorization",
  "financial_assistant",
  "spending_insights",
  "budget_suggestions",
  "behavior_analysis",
  "report_explanation",
]);

export const safeScenarioSchema = z.enum([
  "success",
  "empty",
  "large",
  "slow",
  "partial",
  "unauthorized",
  "forbidden",
  "not-found",
  "expired",
  "validation",
  "conflict",
  "rate-limited",
  "unavailable",
  "unsafe-response",
  "masking-violation",
  "duplicate-pending",
  "internal-error",
]);

export const searchTextSchema = boundedUtf8(120);
export const reasonTextSchema = boundedUtf8(500).refine((text) => text.length >= 3, {
  message: "reason must contain at least 3 characters",
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().pipe(pageSizeSchema).default(25),
  totalItems: z.number().int().nonnegative().default(0),
  totalPages: z.number().int().nonnegative().default(0),
}).strict();

export const reportingPeriodSchema = z.enum(["7d", "30d", "90d"]);

export const aiListQuerySchema = z.object({
  search: searchTextSchema.optional(),
  platform: platformScopeSchema.optional(),
  locale: localeScopeSchema.optional(),
  feature: aiFeatureSchema.optional(),
  providerId: safeAiIdSchema.optional(),
  modelId: safeAiIdSchema.optional(),
  plan: z.enum(["free", "basic", "premium"]).optional(),
  status: z.string().max(40).optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().pipe(pageSizeSchema).default(25),
  sort: z.enum(["name", "status", "updatedAt", "severity", "cost", "latency", "feature", "provider", "model", "time"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  scenario: safeScenarioSchema.optional(),
}).strict();

export const aiOverviewQuerySchema = z.object({
  platform: platformScopeSchema.default("all"),
  period: reportingPeriodSchema.default("30d"),
  feature: aiFeatureSchema.optional(),
  providerId: safeAiIdSchema.optional(),
  modelId: safeAiIdSchema.optional(),
  plan: z.enum(["free", "basic", "premium"]).optional(),
  status: z.string().max(40).optional(),
  scenario: safeScenarioSchema.optional(),
}).strict();

export const apiErrorSchema = z.object({
  status: z.number().int().min(400).max(599),
  code: z.enum([
    "validation_error",
    "forbidden",
    "not_found",
    "conflict",
    "session_expired",
    "gone",
    "rate_limited",
    "provider_unavailable",
    "internal_error",
  ]),
  message: z.string().max(240),
  fieldErrors: z.record(z.string(), z.array(z.string().max(160)).max(10)).optional(),
  correlationId: z.string().max(48).optional(),
}).strict();

export const auditReferenceSchema = z.object({
  eventId: safeAiIdSchema.refine((id) => id.startsWith("AIA-")),
  eventName: z.string().max(120),
  timestamp: z.iso.datetime({ offset: true }),
}).strict();

export const moneyEstimateSchema = z.object({
  amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  estimated: z.literal(true),
  freshness: z.iso.datetime({ offset: true }),
  normalizedAmount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/).optional(),
  normalizedCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  conversionTimestamp: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((money, context) => {
  const normalizedFields = [
    money.normalizedAmount,
    money.normalizedCurrency,
    money.conversionTimestamp,
  ].filter((field) => field !== undefined).length;

  if (normalizedFields !== 0 && normalizedFields !== 3) {
    context.addIssue({ code: "custom", message: "normalized money fields must appear together" });
  }
});

export const regionStateSchema = z.object({
  availability: z.enum(["available", "empty", "stale", "partial", "unavailable", "forbidden"]),
  message: z.string().max(240).optional(),
  retryable: z.boolean().optional(),
}).strict();

export const aiMetricSchema = z.object({
  key: z.string().max(80),
  label: z.string().max(120),
  value: z.number().min(0),
  unit: z.enum([
    "requests",
    "attempts",
    "failures",
    "reports",
    "percent",
    "duration_ms",
    "input_units",
    "output_units",
    "customers",
    "estimated_cost",
  ]),
  platform: platformScopeSchema,
  denominator: z.enum(["original_requests", "attempts", "failures", "reports", "customers"]),
  freshness: z.iso.datetime({ offset: true }),
  cost: moneyEstimateSchema.optional(),
}).strict();

export const chartPointSchema = z.object({
  label: z.string().max(120),
  value: z.number().min(0),
}).strict();

export const aiOverviewSchema = z.object({
  query: aiOverviewQuerySchema,
  metrics: z.array(aiMetricSchema).max(30),
  totalOriginalRequests: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  fallbackAttempts: z.number().int().nonnegative(),
  costByCurrency: z.array(moneyEstimateSchema).max(10),
  featureDistribution: z.array(chartPointSchema).max(20),
  providerDistribution: z.array(chartPointSchema).max(20),
  platformDistribution: z.array(chartPointSchema).max(4),
  trend: z.array(chartPointSchema).max(100),
  regions: z.object({
    metrics: regionStateSchema,
    charts: regionStateSchema,
  }).strict(),
}).strict().superRefine((overview, context) => {
  if (overview.totalAttempts < overview.totalOriginalRequests) {
    context.addIssue({
      code: "custom",
      message: "attempts cannot be less than original requests",
      path: ["totalAttempts"],
    });
  }
});

export const fallbackRouteSchema = z.object({
  feature: aiFeatureSchema,
  locale: localeScopeSchema,
  priority: z.number().int().positive(),
  providerId: safeAiIdSchema.refine((id) => id.startsWith("AIP-")),
  modelId: safeAiIdSchema.refine((id) => id.startsWith("AIM-")),
  compatible: z.boolean(),
  terminalEligible: z.boolean(),
  enabled: z.boolean(),
}).strict();

export const fallbackRoutesSchema = z.array(fallbackRouteSchema).min(1).max(180).superRefine((routes, context) => {
  const priorities = new Set<string>();
  const terminalCoverage = new Set<string>();

  for (const [index, route] of routes.entries()) {
    const scope = `${route.feature}:${route.locale}`;
    const priorityKey = `${scope}:${route.priority}`;
    if (priorities.has(priorityKey)) {
      context.addIssue({ code: "custom", message: "fallback priorities must be unique per feature/locale", path: [index, "priority"] });
    }
    priorities.add(priorityKey);
    if (!route.compatible) {
      context.addIssue({ code: "custom", message: "fallback route must be compatible", path: [index, "compatible"] });
    }
    if (route.enabled && route.terminalEligible) terminalCoverage.add(scope);
  }

  for (const route of routes) {
    if (!terminalCoverage.has(`${route.feature}:${route.locale}`)) {
      context.addIssue({ code: "custom", message: "fallback chain requires terminal coverage" });
      break;
    }
  }
});

export const accessLevelSchema = z.enum(["full", "aggregate", "context"]);

const providerCoreSchema = z.object({
  id: safeAiIdSchema.refine((id) => id.startsWith("AIP-")),
  name: searchTextSchema,
  freshness: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
}).strict();

const fullProviderSchema = providerCoreSchema.extend({
  accessLevel: z.literal("full"),
  health: z.enum(["healthy", "degraded", "partial_outage", "unavailable"]),
  defaultModelId: safeAiIdSchema.refine((id) => id.startsWith("AIM-")),
  features: z.array(aiFeatureSchema).min(1).max(20),
  locales: z.array(localeScopeSchema).min(1).max(2),
  latencyMs: z.number().min(0),
  failureRate: z.number().min(0).max(1),
  estimatedCost: moneyEstimateSchema,
  fallbackRoutes: fallbackRoutesSchema,
  rateLimit: z.string().max(120),
  actions: z.array(z.enum(["activate", "deactivate", "update_fallback"])).max(3),
}).strict();

const contextProviderSchema = providerCoreSchema.extend({
  accessLevel: z.literal("context"),
  health: z.enum(["healthy", "degraded", "partial_outage", "unavailable"]),
  latencyMs: z.number().min(0),
  failureRate: z.number().min(0).max(1),
  rateLimit: z.string().max(120),
  actions: z.tuple([]),
}).strict();

const aggregateProviderSchema = providerCoreSchema.extend({
  accessLevel: z.literal("aggregate"),
  estimatedCost: moneyEstimateSchema,
  actions: z.tuple([]),
}).strict();

export const aiProviderSummarySchema = z.discriminatedUnion("accessLevel", [
  fullProviderSchema,
  contextProviderSchema,
  aggregateProviderSchema,
]);

export const aiProviderDetailSchema = aiProviderSummarySchema;

const modelCoreSchema = z.object({
  id: safeAiIdSchema.refine((id) => id.startsWith("AIM-")),
  name: searchTextSchema,
  providerId: safeAiIdSchema.refine((id) => id.startsWith("AIP-")),
  revision: z.number().int().positive(),
}).strict();

const fullModelSchema = modelCoreSchema.extend({
  accessLevel: z.literal("full"),
  features: z.array(aiFeatureSchema).min(1).max(20),
  locales: z.array(localeScopeSchema).min(1).max(2),
  assignments: z.array(z.object({
    feature: aiFeatureSchema,
    locale: localeScopeSchema,
    primary: z.boolean(),
  }).strict()).max(20),
  inputLimit: z.number().int().positive(),
  inputCost: moneyEstimateSchema,
  outputCost: moneyEstimateSchema,
  status: z.enum(["active", "limited", "inactive", "unavailable"]),
  version: z.string().max(40),
  eligible: z.boolean(),
  actions: z.array(z.enum(["assign", "unassign", "activate", "deactivate"])).max(4),
}).strict();

const aggregateModelSchema = modelCoreSchema.extend({
  accessLevel: z.literal("aggregate"),
  inputCost: moneyEstimateSchema,
  outputCost: moneyEstimateSchema,
  actions: z.tuple([]),
}).strict();

export const aiModelSummarySchema = z.discriminatedUnion("accessLevel", [
  fullModelSchema,
  aggregateModelSchema,
]);

function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    pagination: paginationSchema,
    region: regionStateSchema,
  }).strict();
}

export const aiProvidersPageSchema = pageSchema(aiProviderSummarySchema);
export const aiModelsPageSchema = pageSchema(aiModelSummarySchema);

export const aiActionContextSchema = z.object({
  reason: reasonTextSchema,
  expectedState: z.string().max(40),
  expectedRevision: z.number().int().positive(),
}).strict();

export const aiAdminResourceSchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1).max(40),
  version: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
}).strict();

export const aiAdminPageSchema = z.object({
  items: z.array(aiAdminResourceSchema).max(100),
  nextCursor: z.string().nullable(),
}).strict();

export type AiAdminResource = z.infer<typeof aiAdminResourceSchema>;

export const providerActionRequestSchema = z.object({
  context: aiActionContextSchema,
  action: z.enum(["update_fallback", "activate", "deactivate"]),
  fallbackRoutes: fallbackRoutesSchema.optional(),
}).strict();

export const aiActionResultSchema = z.object({
  affectedId: safeAiIdSchema,
  previousState: z.string().max(40),
  currentState: z.string().max(40),
  outcome: z.enum(["success", "rejected", "conflict"]),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  message: z.string().max(240),
  auditReference: auditReferenceSchema.optional(),
}).strict();

export const aiOperationalResourceSchema = z.enum([
  "prompts",
  "usage",
  "failures",
  "reports",
  "safety-rules",
]);

export const aiSafetyDefinitionSchema = z.object({
  conditions: z.array(z.object({
    field: z.enum(["feature", "locale", "severity", "attempt_count", "safe_error_class"]),
    operator: z.enum(["equals", "not_equals", "greater_than", "in"]),
    value: z.union([z.string().max(120), z.number().finite(), z.array(z.string().max(120)).max(20)]),
  }).strict()).min(1).max(20),
  outcome: z.enum(["block", "require_review", "fallback", "mask"]),
  requiredCoverage: z.boolean(),
}).strict().refine(
  (definition) => new TextEncoder().encode(JSON.stringify(definition)).length <= 8192,
  { message: "safety definition exceeds 8 KiB" },
);

const aiOperationalRecordBaseSchema = z.object({
  id: safeAiIdSchema,
  resource: aiOperationalResourceSchema,
  accessLevel: accessLevelSchema,
  title: searchTextSchema,
  feature: aiFeatureSchema,
  status: z.string().min(1).max(40),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  platform: platformScopeSchema.optional(),
  locale: localeScopeSchema.optional(),
  providerId: safeAiIdSchema.optional(),
  modelId: safeAiIdSchema.optional(),
  maskedUser: z.string().regex(/^USR-\*{3,12}[A-Z0-9]{2,6}$/).optional(),
  originalRequestId: safeAiIdSchema.optional(),
  attemptCount: z.number().int().positive().optional(),
  fallbackCount: z.number().int().nonnegative().optional(),
  inputUnits: z.number().int().nonnegative().optional(),
  outputUnits: z.number().int().nonnegative().optional(),
  estimatedCost: moneyEstimateSchema.optional(),
  safeErrorClass: z.string().max(80).optional(),
  correlationReference: z.string().max(48).optional(),
  sanitizedExcerpt: boundedCodePoints(280).optional(),
  sanitizedBy: z.literal("future_backend").optional(),
  omissionLabel: z.string().max(120).optional(),
  version: z.string().max(40).optional(),
  triggerCount: z.number().int().nonnegative().optional(),
  safetyDefinition: aiSafetyDefinitionSchema.optional(),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
  actions: z.array(z.string().min(1).max(40)).max(6),
}).strict();

export const aiOperationalRecordSchema = aiOperationalRecordBaseSchema.superRefine((record, context) => {
  if (record.resource === "reports" && (!record.sanitizedExcerpt || record.sanitizedBy !== "future_backend" || !record.omissionLabel)) {
    context.addIssue({ code: "custom", message: "reports require a future-backend sanitized excerpt and omission label" });
  }
  if (record.resource === "safety-rules" && !record.safetyDefinition) {
    context.addIssue({ code: "custom", message: "safety rules require a declarative definition" });
  }
  if (
    record.accessLevel === "aggregate"
    && (record.maskedUser || record.originalRequestId || record.sanitizedExcerpt || record.safeErrorClass || record.correlationReference)
  ) {
    context.addIssue({ code: "custom", message: "aggregate projections cannot contain record-level sensitive fields" });
  }
});

export const aiOperationalPageSchema = pageSchema(aiOperationalRecordSchema);

export const aiPromptDetailSchema = aiOperationalRecordBaseSchema.extend({
  resource: z.literal("prompts"),
  sanitizedPreview: boundedUtf8(4096),
  variables: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)).max(30),
  outputSchemaSummary: z.array(z.string().max(120)).max(30),
  validationRules: z.array(z.string().max(160)).max(30),
  fictionalTests: z.array(z.object({
    name: z.string().max(120),
    required: z.boolean(),
    passed: z.boolean(),
  }).strict()).max(30),
  history: z.array(z.object({
    version: z.string().max(40),
    status: z.enum(["draft", "testing", "active", "retired"]),
    immutable: z.literal(true),
  }).strict()).max(50),
}).strict();

export const aiOperationalActionRequestSchema = z.object({
  context: aiActionContextSchema,
  action: z.enum([
    "activate", "deactivate", "assign", "unassign", "test", "retire",
    "rollback", "acknowledge", "resolve", "reopen", "escalate",
    "confirmed_issue", "no_issue", "duplicate",
  ]),
}).strict();

export function buildAiQuery<T extends z.ZodType<Record<string, unknown>>>(
  schema: T,
  input: z.input<T>,
): URLSearchParams {
  const parsed = schema.parse(input);
  const params = new URLSearchParams();

  for (const [key, queryValue] of Object.entries(parsed)) {
    if (queryValue !== undefined && queryValue !== null && queryValue !== "") {
      params.set(key === "scenario" ? "__scenario" : key, String(queryValue));
    }
  }

  return params;
}

export type AiListQuery = z.infer<typeof aiListQuerySchema>;
export type AiOverviewQuery = z.input<typeof aiOverviewQuerySchema>;
export type AiOverviewData = z.infer<typeof aiOverviewSchema>;
export type AiProviderSummary = z.infer<typeof aiProviderSummarySchema>;
export type AiProviderDetail = z.infer<typeof aiProviderDetailSchema>;
export type AiModelSummary = z.infer<typeof aiModelSummarySchema>;
export type ProviderActionRequest = z.infer<typeof providerActionRequestSchema>;
export type AiActionResult = z.infer<typeof aiActionResultSchema>;
export type AiOperationalResource = z.infer<typeof aiOperationalResourceSchema>;
export type AiOperationalRecord = z.infer<typeof aiOperationalRecordSchema>;
export type AiPromptDetail = z.infer<typeof aiPromptDetailSchema>;
export type AiOperationalActionRequest = z.infer<typeof aiOperationalActionRequestSchema>;
export type FallbackRoute = z.infer<typeof fallbackRouteSchema>;
export type AiPagination = z.infer<typeof paginationSchema>;
export type AiRegionState = z.infer<typeof regionStateSchema>;
export type PlatformScope = z.infer<typeof platformScopeSchema>;
export type SafeScenario = z.infer<typeof safeScenarioSchema>;
