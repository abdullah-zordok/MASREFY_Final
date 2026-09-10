import { z } from "zod";
import { chartPointSchema, incidentSchema, serviceHealthSchema } from "@/features/shared/admin-schemas";

const offsetDateTimeSchema = z.iso.datetime({ offset: true });
const controlsOrBidi = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export const operationalRangeSchema = z.enum(["1h", "24h", "7d", "30d"]);
export const platformScopeSchema = z.enum(["all", "ios", "android", "unknown", "global"]);
export const freshnessStateSchema = z.enum(["fresh", "stale", "unknown"]);

export const freshnessSchema = z.union([
  z.object({
    observedAt: offsetDateTimeSchema,
    staleAt: offsetDateTimeSchema,
    state: freshnessStateSchema.exclude(["unknown"]),
    sourceLabel: z.string().min(1).max(80).optional(),
  }).strict().superRefine((value, context) => {
    if (Date.parse(value.observedAt) >= Date.parse(value.staleAt)) {
      context.addIssue({
        code: "custom",
        message: "staleAt must be later than observedAt",
        path: ["staleAt"],
      });
    }
  }),
  z.object({
    observedAt: z.null(),
    staleAt: z.null(),
    state: z.literal("unknown"),
    sourceLabel: z.string().min(1).max(80).optional(),
  }).strict(),
]);

export const metricValueSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
  label: z.string().min(1).max(120),
  value: z.number().finite().nullable(),
  unit: z.enum(["count", "percent", "milliseconds", "seconds", "bytes", "ratio"]),
  semantic: z.enum(["snapshot", "selected_range"]),
  completeness: z.enum(["complete", "partial", "unavailable", "not_applicable"]),
  freshness: freshnessSchema,
  trend: z.number().finite().nullable().optional(),
  summary: z.string().max(240).optional(),
}).strict();

export const pageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);
export const jobRunIdSchema = z.string().max(64).refine(
  (value) => /^JOB-[A-Za-z0-9-]+$/u.test(value) || z.uuid().safeParse(value).success,
  "invalid job run id",
);
export const searchSchema = z.string().max(120).transform((value) => value.normalize("NFC"));
export const actionReasonSchema = z.string()
  .transform((value) => value.trim().normalize("NFC"))
  .pipe(z.string().min(10).max(500).refine((value) => !controlsOrBidi.test(value), "unsafe control character"));

export const safeMetadataEntrySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
  label: z.string().min(1).max(120),
  value: z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
}).strict();

export const operationalApiErrorSchema = z.object({
  status: z.number().int().min(400).max(599),
  code: z.enum([
    "unauthorized",
    "forbidden",
    "not_found",
    "validation_error",
    "conflict",
    "stale_version",
    "duplicate_submission",
    "ineligible_transition",
    "rate_limited",
    "provider_unavailable",
    "internal_error",
  ]),
  message: z.string().min(1).max(240),
  fieldErrors: z.record(z.string(), z.array(z.string().max(160)).max(5)).optional(),
  retryable: z.boolean(),
  correlationId: z.string().min(1).max(64),
}).strict();

export const healthStatusSchema = z.enum([
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "unknown",
]);

export const platformOperationalBreakdownSchema = z.object({
  total: z.number().int().nonnegative(),
  ios: z.number().int().nonnegative(),
  android: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative().optional(),
  semantic: z.enum(["events", "jobs", "requests", "failures", "unique_customers"]),
  completeness: z.enum(["complete", "partial", "unavailable"]),
}).strict();

export const safeReferenceSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(["service", "provider", "queue", "job", "schedule", "incident", "audit", "domain_record"]),
  label: z.string().max(120),
  href: z.string().max(200).optional(),
}).strict();

export const serviceHealthSummarySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  status: healthStatusSchema,
  uptime: metricValueSchema,
  latency: metricValueSchema,
  errorRate: metricValueSchema,
  freshness: freshnessSchema,
  lastIncident: safeReferenceSchema.nullable().optional(),
  impactSummary: z.string().max(240).optional(),
  platformImpact: platformOperationalBreakdownSchema.optional(),
}).strict();

export const healthOverviewSchema = z.object({
  range: operationalRangeSchema,
  summary: z.string().max(240),
  services: z.array(serviceHealthSummarySchema).max(20),
  attention: z.array(safeReferenceSchema).max(20).optional(),
  freshness: freshnessSchema,
  partial: z.boolean(),
  partialReason: z.string().max(240).nullable().optional(),
}).strict();

export const timeSeriesPointSchema = z.object({
  at: offsetDateTimeSchema,
  value: z.number().finite().nullable(),
}).strict();

export const endpointGroupSchema = z.object({
  routePattern: z.string().min(1).max(160),
  requestVolume: metricValueSchema,
  errorRate: metricValueSchema,
  p95Latency: metricValueSchema,
  statusCodeGroup: z.enum(["2xx", "3xx", "4xx", "5xx", "mixed"]).optional(),
}).strict();

export const statusCodeCountSchema = z.object({
  group: z.enum(["2xx", "3xx", "4xx", "5xx"]),
  count: z.number().int().nonnegative(),
}).strict();

export const apiMonitoringSchema = z.object({
  range: operationalRangeSchema,
  requestVolume: metricValueSchema,
  errorRate: metricValueSchema,
  latency: metricValueSchema,
  series: z.array(timeSeriesPointSchema).max(720),
  endpoints: z.array(endpointGroupSchema).max(50),
  statusCodes: z.array(statusCodeCountSchema).max(4),
  freshness: freshnessSchema,
  partialReason: z.string().max(240).nullable().optional(),
}).strict();

export const slowQueryGroupSchema = z.object({
  label: z.string().min(1).max(80),
  operation: z.enum(["select", "insert", "update", "delete", "maintenance", "unknown"]),
  count: metricValueSchema,
  p95Duration: metricValueSchema,
}).strict();

export const databaseMonitoringSchema = z.object({
  range: operationalRangeSchema,
  connectionUsage: metricValueSchema,
  queryLatency: metricValueSchema,
  storageUsage: metricValueSchema,
  slowQueries: z.array(slowQueryGroupSchema).max(30),
  backupState: z.enum(["healthy", "delayed", "failed", "unavailable"]),
  recoveryState: z.enum(["healthy", "degraded", "unavailable", "not_applicable"]),
  freshness: freshnessSchema,
  incident: safeReferenceSchema.nullable().optional(),
}).strict();

export const storageMonitoringSchema = z.object({
  range: operationalRangeSchema,
  storageUsage: metricValueSchema,
  uploadCount: metricValueSchema,
  failedUploads: metricValueSchema,
  temporaryFiles: metricValueSchema,
  cleanupState: z.enum(["healthy", "delayed", "failed", "unavailable"]),
  freshness: freshnessSchema,
  incident: safeReferenceSchema.nullable().optional(),
}).strict();

export const accessProjectionSchema = z.enum(["full", "domain", "linked_status", "denied"]);
export const providerCategorySchema = z.enum(["database", "storage", "identity", "ai", "email", "push", "stripe", "exchange_rates"]);
export const fallbackStateSchema = z.enum(["active", "available", "unavailable", "not_applicable"]);

export const providerHealthSummarySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  category: providerCategorySchema,
  status: healthStatusSchema,
  latency: metricValueSchema,
  errorRate: metricValueSchema,
  lastSuccessAt: offsetDateTimeSchema.nullable(),
  lastCheckedAt: offsetDateTimeSchema,
  freshness: freshnessSchema,
  capabilities: z.array(z.string().min(1).max(40)).max(10),
  fallbackState: fallbackStateSchema,
  safeError: z.string().max(120).nullable(),
  platformImpact: platformOperationalBreakdownSchema,
  access: accessProjectionSchema,
  incident: safeReferenceSchema.nullable().optional(),
}).strict();

export const providerHealthQuerySchema = z.object({
  category: providerCategorySchema.or(z.literal("all")).default("all"),
  status: healthStatusSchema.or(z.literal("all")).default("all"),
  platform: platformScopeSchema.extract(["all", "ios", "android"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema.default(25),
  sort: z.enum(["name", "status", "latency", "lastCheckedAt"]).default("status"),
  scenario: z.string().max(40).optional(),
}).strict();

export const providerHealthPageSchema = z.object({
  items: z.array(providerHealthSummarySchema).max(100),
  page: z.number().int().positive(),
  pageSize: pageSizeSchema,
  total: z.number().int().nonnegative(),
  freshness: freshnessSchema,
  partial: z.boolean(),
  partialReason: z.string().max(240).nullable().optional(),
}).strict();

export const queueKeySchema = z.enum([
  "platform",
  "identity",
  "security",
  "ledger",
  "sync",
  "planning",
  "tracking",
  "ai",
  "operations",
  "imports",
  "ai_processing",
  "notifications",
  "reports",
  "data_exports",
  "account_deletion",
  "subscription_reconciliation",
]);

export const jobStateSchema = z.enum(["waiting", "active", "completed", "failed", "delayed", "cancelled"]);

export const queueCountersSchema = z.object({
  waiting: metricValueSchema,
  active: metricValueSchema,
  delayed: metricValueSchema,
  completed: metricValueSchema,
  failed: metricValueSchema,
  retried: metricValueSchema,
}).strict();

export const queueSnapshotSchema = z.object({
  queue: queueKeySchema,
  label: z.string().min(1).max(80),
  counters: queueCountersSchema,
  oldestWaitingSeconds: z.number().int().nonnegative().nullable(),
  throughput: metricValueSchema,
  failureRate: metricValueSchema,
  lastProcessedAt: offsetDateTimeSchema.nullable(),
  freshness: freshnessSchema,
  backlogState: healthStatusSchema,
  platformImpact: platformOperationalBreakdownSchema.optional(),
  access: accessProjectionSchema,
}).strict();

export const queueHealthPageSchema = z.object({
  items: z.array(queueSnapshotSchema).max(50),
  range: operationalRangeSchema,
  platform: platformScopeSchema.extract(["all", "ios", "android"]),
  freshness: freshnessSchema,
  partial: z.boolean(),
}).strict();

export const jobRunSummarySchema = z.object({
  id: jobRunIdSchema,
  name: z.string().min(1).max(100),
  queue: queueKeySchema,
  state: jobStateSchema,
  attempt: z.number().int().positive(),
  startedAt: offsetDateTimeSchema.nullable(),
  completedAt: offsetDateTimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  safeErrorCode: z.string().max(80).nullable(),
  summary: z.string().max(240),
  correlationId: z.string().min(1).max(80),
  platform: platformScopeSchema.extract(["ios", "android", "unknown"]).nullable(),
  appVersion: z.string().max(40).nullable(),
  version: z.number().int().positive(),
  retryOfJobRunId: jobRunIdSchema.nullable(),
  access: accessProjectionSchema,
}).strict();

export const paginatedJobRunsSchema = z.object({
  items: z.array(jobRunSummarySchema).max(100),
  page: z.number().int().positive(),
  pageSize: pageSizeSchema,
  total: z.number().int().nonnegative(),
  freshness: freshnessSchema,
  partial: z.boolean(),
}).strict();

export const jobTimelineEntrySchema = z.object({
  event: z.enum(["queued", "started", "completed", "failed", "delayed", "retry_requested", "cancelled"]),
  at: offsetDateTimeSchema,
  summary: z.string().min(1).max(180),
  linkedJobRunId: jobRunIdSchema.optional(),
}).strict();

export const jobRunDetailSchema = z.object({
  run: jobRunSummarySchema,
  metadata: z.array(safeMetadataEntrySchema).max(20),
  timeline: z.array(jobTimelineEntrySchema).max(20),
  references: z.array(safeReferenceSchema).max(10),
  allowedActions: z.array(z.enum(["retry", "cancel"])).max(2),
}).strict();

export const queueHealthQuerySchema = z.object({
  range: operationalRangeSchema.default("24h"),
  platform: platformScopeSchema.extract(["all", "ios", "android"]).default("all"),
}).strict();

export const jobRunsQuerySchema = z.object({
  queue: queueKeySchema.or(z.literal("all")).default("all"),
  state: jobStateSchema.or(z.literal("all")).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema.default(25),
  search: searchSchema.optional(),
}).strict();

export const jobActionRequestSchema = z.object({
  jobRunId: jobRunIdSchema,
  expectedVersion: z.number().int().positive(),
  reason: actionReasonSchema,
  submissionKey: z.string().min(8).max(80).regex(/^SUB-[A-Za-z0-9-]+$/u),
}).strict();

export const actionOutcomeSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  message: z.string().min(1).max(160),
  audit: safeReferenceSchema,
}).strict();

export const retryJobResultSchema = z.object({
  source: jobRunSummarySchema,
  retry: jobRunDetailSchema,
  queue: queueSnapshotSchema,
  outcome: actionOutcomeSchema,
}).strict();

export const cancelJobResultSchema = z.object({
  cancelled: jobRunSummarySchema,
  queue: queueSnapshotSchema,
  outcome: actionOutcomeSchema,
}).strict();

export const scheduledJobSummarySchema = z.object({
  id: z.string().max(64).refine(
    (value) => /^SCH-[A-Za-z0-9-]+$/u.test(value) || z.uuid().safeParse(value).success,
    "invalid scheduled job id",
  ),
  name: z.string().min(1).max(100),
  queue: queueKeySchema,
  schedule: z.string().min(1).max(120),
  lastRun: safeReferenceSchema.nullable(),
  lastRunAt: offsetDateTimeSchema.nullable(),
  nextRunAt: offsetDateTimeSchema.nullable(),
  lastState: jobStateSchema.nullable(),
  enabled: z.boolean(),
  freshness: freshnessSchema,
  access: accessProjectionSchema,
}).strict();

export const scheduledJobsQuerySchema = z.object({
  queue: queueKeySchema.or(z.literal("all")).default("all"),
  search: searchSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema.default(25),
}).strict();

export const scheduledJobsPageSchema = z.object({
  items: z.array(scheduledJobSummarySchema).max(100),
  page: z.number().int().positive(),
  pageSize: pageSizeSchema,
  total: z.number().int().nonnegative(),
  freshness: freshnessSchema,
  partial: z.boolean(),
}).strict();

export type OperationalRange = z.infer<typeof operationalRangeSchema>;
export type PlatformScope = z.infer<typeof platformScopeSchema>;
export type Freshness = z.infer<typeof freshnessSchema>;
export type MetricValue = z.infer<typeof metricValueSchema>;
export type OperationalApiError = z.infer<typeof operationalApiErrorSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type ServiceHealthSummary = z.infer<typeof serviceHealthSummarySchema>;
export type HealthOverview = z.infer<typeof healthOverviewSchema>;
export type ApiMonitoring = z.infer<typeof apiMonitoringSchema>;
export type DatabaseMonitoring = z.infer<typeof databaseMonitoringSchema>;
export type StorageMonitoring = z.infer<typeof storageMonitoringSchema>;
export type ProviderCategory = z.infer<typeof providerCategorySchema>;
export type ProviderHealthSummary = z.infer<typeof providerHealthSummarySchema>;
export type ProviderHealthPage = z.infer<typeof providerHealthPageSchema>;
export type ProviderHealthQuery = z.input<typeof providerHealthQuerySchema>;
export type QueueKey = z.infer<typeof queueKeySchema>;
export type JobState = z.infer<typeof jobStateSchema>;
export type QueueSnapshot = z.infer<typeof queueSnapshotSchema>;
export type QueueHealthPage = z.infer<typeof queueHealthPageSchema>;
export type JobRunSummary = z.infer<typeof jobRunSummarySchema>;
export type PaginatedJobRuns = z.infer<typeof paginatedJobRunsSchema>;
export type JobRunDetail = z.infer<typeof jobRunDetailSchema>;
export type QueueHealthQuery = z.input<typeof queueHealthQuerySchema>;
export type JobRunsQuery = z.input<typeof jobRunsQuerySchema>;
export type JobActionRequest = z.infer<typeof jobActionRequestSchema>;
export type RetryJobResult = z.infer<typeof retryJobResultSchema>;
export type CancelJobResult = z.infer<typeof cancelJobResultSchema>;
export type ScheduledJobSummary = z.infer<typeof scheduledJobSummarySchema>;
export type ScheduledJobsPage = z.infer<typeof scheduledJobsPageSchema>;
export type ScheduledJobsQuery = z.input<typeof scheduledJobsQuerySchema>;

export const phase13FreshnessSchema = z.object({
  observedAt: offsetDateTimeSchema,
  staleAt: offsetDateTimeSchema,
  state: z.enum(["fresh", "stale", "unknown"]),
}).strict();

export const phase13HealthOverviewSchema = z.object({
  status: z.enum(["operational", "degraded", "outage", "maintenance", "unknown"]),
  services: z.array(z.object({
    key: z.string().min(1).max(80),
    status: z.enum(["operational", "degraded", "outage", "maintenance", "unknown"]),
    latencyMs: z.number().int().min(0).max(60_000).optional(),
    safeCode: z.string().max(80).nullable().optional(),
    freshness: phase13FreshnessSchema,
  }).strict()).max(20),
  partial: z.boolean(),
  freshness: phase13FreshnessSchema,
}).strict();

export const phase13ProviderPageSchema = z.object({
  items: z.array(z.object({
    provider: z.enum(["database", "storage", "identity", "ai", "email", "push"]),
    status: z.enum(["up", "degraded", "down", "unknown"]),
    latencyMs: z.number().int().min(0).max(60_000),
    checkedAt: offsetDateTimeSchema,
    safeCode: z.string().max(80).nullable().optional(),
  }).strict()).max(100),
  nextCursor: z.string().max(256).nullable(),
}).strict();

export const phase13QueueSummarySchema = z.object({
  items: z.array(z.object({
    key: z.string().min(3).max(128),
    waiting: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    oldestWaitingSeconds: z.number().int().nonnegative().nullable(),
    status: z.enum(["operational", "degraded", "outage", "unknown"]),
  }).strict()).max(50),
  freshness: phase13FreshnessSchema,
  partial: z.boolean(),
}).strict();

export const phase13ScheduledJobPageSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    key: z.string().min(3).max(128),
    ownerSpec: z.number().int(),
    type: z.string().min(3).max(80),
    schedule: z.object({ kind: z.literal("interval"), everySeconds: z.number().int(), timezone: z.literal("UTC") }).strict().nullable(),
    enabled: z.boolean(),
    timeoutSeconds: z.number().int(),
    maxAttempts: z.number().int(),
    retrySafe: z.boolean(),
    cancelSafe: z.boolean(),
    nextRunAt: offsetDateTimeSchema.nullable(),
    version: z.number().int().positive(),
  }).strict()).max(100),
  nextCursor: z.string().max(256).nullable(),
}).strict();

export const phase13JobRunSchema = z.object({
  id: z.uuid(),
  jobKey: z.string().min(3).max(128),
  ownerSpec: z.number().int(),
  status: z.enum(["queued", "running", "succeeded", "failed", "retrying", "dead_lettered", "canceled"]),
  queuedAt: offsetDateTimeSchema,
  startedAt: offsetDateTimeSchema.nullable(),
  completedAt: offsetDateTimeSchema.nullable(),
  correlationId: z.string().min(1).max(128),
  summary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  version: z.number().int().positive(),
}).strict();

export const phase13JobRunPageSchema = z.object({
  items: z.array(phase13JobRunSchema).max(100),
  nextCursor: z.string().max(256).nullable(),
}).strict();

export const phase13JobRunDetailSchema = z.object({
  run: phase13JobRunSchema,
  attempts: z.array(z.object({
    attempt: z.number().int().positive(),
    status: z.enum(["running", "succeeded", "failed"]),
    workerId: z.string().min(1).max(128),
    startedAt: offsetDateTimeSchema,
    completedAt: offsetDateTimeSchema.nullable(),
    safeCode: z.string().max(80).nullable().optional(),
    nextAttemptAt: offsetDateTimeSchema.nullable().optional(),
  }).strict()).max(10),
  allowedActions: z.array(z.enum(["retry", "cancel"])).max(2),
}).strict();

const phase13PercentileSchema = z.object({
  p50: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
  p99: z.number().nonnegative().nullable(),
  unit: z.enum(["milliseconds", "seconds", "count", "percent", "bytes"]),
  status: z.enum(["within_budget", "breached", "unavailable", "not_applicable"]),
}).strict();

export const phase13PerformanceSchema = z.object({
  range: operationalRangeSchema,
  budgets: z.record(z.string(), phase13PercentileSchema),
  series: z.array(z.object({ at: offsetDateTimeSchema, value: z.number().nonnegative().nullable() }).strict()).max(720),
  freshness: phase13FreshnessSchema,
}).strict();

export const phase13RecoverySchema = z.object({
  items: z.array(z.object({
    scope: z.string(),
    status: z.enum(["verified", "failed", "external_required", "unavailable"]),
    observedAt: offsetDateTimeSchema,
    evidenceRef: z.string().min(1).max(160),
    rpoSeconds: z.number().int().nonnegative().nullable().optional(),
    rtoSeconds: z.number().int().nonnegative().nullable().optional(),
    safeCode: z.string().max(80).nullable().optional(),
  }).strict()).max(50),
  rpoTargetSeconds: z.literal(900),
  rtoTargetSeconds: z.literal(7200),
}).strict();

export const phase13JobActionResultSchema = z.object({
  status: z.enum(["accepted", "canceled", "queued"]),
  runId: z.uuid(),
  version: z.number().int().positive(),
  retryOfRunId: z.uuid().optional(),
  replayed: z.boolean().optional(),
}).strict();

export const systemHealthResponseSchema = z.object({
  summary: z.array(z.object({ label: z.string(), value: z.string() })),
  services: z.array(serviceHealthSchema),
  incidents: z.array(incidentSchema),
  requestVolume: z.array(chartPointSchema),
  latencyTrend: z.array(chartPointSchema),
  errorRateTrend: z.array(chartPointSchema),
  queueSummary: z.array(z.object({ label: z.string(), value: z.string() })),
  partial: z.boolean().optional(),
  warning: z.string().optional(),
});

export const refreshHealthResponseSchema = z.object({
  status: z.literal("scheduled"),
  checkedAt: z.iso.datetime({ offset: true }),
});

export type SystemHealthResponse = z.infer<typeof systemHealthResponseSchema>;
