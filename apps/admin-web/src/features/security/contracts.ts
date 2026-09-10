import { z } from "zod";

const utf8 = new TextEncoder();

function boundedText(maxCodePoints: number, maxBytes = 2048) {
  return z.string().trim().transform((text) => text.normalize("NFC")).pipe(
    z.string()
      .min(1)
      .refine((text) => [...text].length <= maxCodePoints, "too many characters")
      .refine((text) => utf8.encode(text).length <= maxBytes, "too many bytes")
      .refine((text) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text), "unsafe control text")
      .refine((text) => !/<\/?[a-z][\s\S]*>|https?:\/\/|data:/iu.test(text), "unsafe rendered text"),
  );
}

export const securityIdSchema = z.string()
  .max(48)
  .refine((value) => /^(AUTH|SUS|INC|ASA|PCH|SAC|AUD|EXP|DEL|RET|ADM|CUS|DEV|SES|TKT|SUB|SVC|COR)-[A-Za-z0-9-]{1,43}$/u.test(value) || z.uuid().safeParse(value).success, "invalid security id");

export const platformScopeSchema = z.enum(["all", "ios", "android", "unknown", "global"]);
export const riskLevelSchema = z.enum(["informational", "low", "medium", "high", "critical"]);
export const resultSchema = z.enum(["success", "failure", "blocked"]);
export const securityStateSchema = z.enum(["New", "Investigating", "Escalated", "Resolved", "Dismissed"]);
export const incidentStateSchema = z.enum(["Open", "Contained", "Monitoring", "Resolved", "Closed"]);
export const supportAccessStateSchema = z.enum(["active", "expired", "revoked"]);
export const exportStateSchema = z.enum(["Requested", "Validating", "Processing", "Ready", "Expired", "Failed", "Cancelled"]);
export const deletionStateSchema = z.enum(["Requested", "Review Required", "Scheduled", "In Progress", "Blocked", "Completed", "Cancelled"]);
export const retentionStateSchema = z.enum(["active", "suspended", "review_required"]);
export const exportScopeSchema = z.enum([
  "profile",
  "devices_sessions",
  "financial_records",
  "imports",
  "ai_data",
  "support_feedback",
  "notifications",
  "files",
]);

export const pageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);
export const listQuerySchema = z.object({
  search: boundedText(120, 512).optional(),
  platform: platformScopeSchema.optional(),
  state: z.string().max(40).optional(),
  risk: riskLevelSchema.optional(),
  result: resultSchema.optional(),
  period: z.enum(["7d", "30d", "90d"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().pipe(pageSizeSchema).default(25),
}).strict();

export const overviewQuerySchema = z.object({
  platform: platformScopeSchema.default("all"),
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
}).strict();

export const safeReferenceSchema = z.object({
  id: securityIdSchema,
  kind: z.enum(["customer", "admin", "device", "session", "ticket", "incident", "request", "subscription", "service"]),
  label: boundedText(120, 512),
  status: boundedText(80, 256).optional(),
}).strict();

const metadataKeys = new Set(["state", "role", "permission", "scope", "platform", "result", "reasonCode", "revision", "requestState"]);
export const safeMetadataEntrySchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/).refine((key) => metadataKeys.has(key)),
  label: boundedText(80, 256),
  value: z.union([boundedText(500, 1024), z.number().finite(), z.boolean(), z.null()]),
}).strict();

export const auditReferenceSchema = z.object({
  eventId: securityIdSchema.refine((id) => id.startsWith("AUD-")),
  eventName: boundedText(120, 512),
  timestamp: z.iso.datetime({ offset: true }),
}).strict();

export const actionContextSchema = z.object({
  expectedState: z.string().max(40),
  expectedRevision: z.number().int().positive(),
  reason: boundedText(240, 2048),
  confirmationToken: z.literal("CONFIRM-SPEC-008"),
}).strict();

export const actionResultSchema = z.object({
  affectedId: securityIdSchema,
  previousState: z.string().max(40),
  currentState: z.string().max(40),
  outcome: z.enum(["success", "rejected", "conflict"]),
  timestamp: z.iso.datetime({ offset: true }),
  message: boundedText(240, 512),
  currentRevision: z.number().int().positive(),
  auditReference: auditReferenceSchema,
}).strict();

export const platformMetricSchema = z.object({
  key: z.string().max(80),
  label: boundedText(120, 512),
  value: z.number().int().nonnegative(),
  unit: z.enum(["events", "sessions", "accounts", "grants", "permission_changes", "requests", "policies"]),
  entitySemantic: boundedText(80, 256),
  freshness: z.iso.datetime({ offset: true }),
  ios: z.number().int().nonnegative().optional(),
  android: z.number().int().nonnegative().optional(),
  unknown: z.number().int().nonnegative().optional(),
  uniqueCustomers: z.number().int().nonnegative().optional(),
}).strict();

export const securityOverviewSchema = z.object({
  query: overviewQuerySchema,
  freshness: z.iso.datetime({ offset: true }),
  partial: z.boolean(),
  metrics: z.array(platformMetricSchema).max(20),
}).strict();

export const timelineEntrySchema = z.object({
  at: z.iso.datetime({ offset: true }),
  label: boundedText(160, 512),
  actor: safeReferenceSchema.optional(),
}).strict();

export const authenticationEventSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("AUTH-")),
  actor: safeReferenceSchema,
  actorType: z.enum(["customer", "admin", "system"]),
  eventType: boundedText(120, 512),
  deviceLabel: boundedText(120, 512),
  broadRegion: boundedText(80, 256),
  platform: platformScopeSchema,
  risk: riskLevelSchema,
  result: resultSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: securityIdSchema.refine((id) => id.startsWith("COR-")),
}).strict();

export const suspiciousActivitySchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("SUS-")),
  actor: safeReferenceSchema,
  label: boundedText(120, 512),
  riskScore: z.number().int().min(0).max(100),
  risk: riskLevelSchema,
  signals: z.array(boundedText(80, 256)).min(1).max(10),
  platform: platformScopeSchema,
  state: securityStateSchema,
  reviewer: safeReferenceSchema.optional(),
  incident: safeReferenceSchema.optional(),
  revision: z.number().int().positive(),
  allowedActions: z.array(z.enum(["assign_reviewer", "escalate", "resolve", "dismiss"])).max(4),
  timeline: z.array(timelineEntrySchema).max(20),
}).strict();

export const suspiciousActionSchema = z.object({
  action: z.enum(["assign_reviewer", "escalate", "resolve", "dismiss"]),
  incidentId: securityIdSchema.refine((id) => id.startsWith("INC-")).optional(),
  context: actionContextSchema,
}).strict();

export const adminSecuritySchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("ASA-")),
  admin: safeReferenceSchema,
  roleSummary: boundedText(120, 512),
  twoFactorState: z.enum(["enabled", "disabled", "recovery_required"]),
  lastLoginAt: z.iso.datetime({ offset: true }),
  activeSessionCount: z.number().int().nonnegative(),
  risk: riskLevelSchema,
}).strict();

export const permissionChangeSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("PCH-")),
  subject: safeReferenceSchema,
  previousValue: boundedText(160, 512),
  newValue: boundedText(160, 512),
  actor: safeReferenceSchema,
  reason: boundedText(240, 1024),
  result: resultSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: securityIdSchema.refine((id) => id.startsWith("COR-")),
}).strict();

export const supportAccessGrantSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("SAC-")),
  agent: safeReferenceSchema,
  customer: safeReferenceSchema,
  ticket: safeReferenceSchema,
  scopes: z.array(boundedText(80, 256)).min(1).max(8),
  startedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  state: supportAccessStateSchema,
  revision: z.number().int().positive(),
  timeline: z.array(timelineEntrySchema).max(20),
}).strict();

export const supportAccessRevokeSchema = z.object({ context: actionContextSchema }).strict();

export const incidentDetailSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("INC-") || z.uuid().safeParse(id).success),
  title: boundedText(160, 512).optional(),
  publicSummary: boundedText(500, 2048).nullable().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  resolvedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  assignedAdminId: z.string().min(1).max(128).nullable().optional(),
  severity: riskLevelSchema.or(z.enum(["info", "warning"])),
  state: incidentStateSchema.or(z.enum(["open", "investigating", "monitoring", "resolved"])),
  owner: safeReferenceSchema.nullable(),
  affectedServices: z.array(safeReferenceSchema).max(10),
  affectedCustomerCount: z.number().int().nonnegative().nullable(),
  platform: platformScopeSchema,
  revision: z.number().int().positive(),
  timeline: z.array(timelineEntrySchema).max(30),
  allowedActions: z.array(z.enum(["contain", "monitor", "resolve", "close", "reopen_monitoring", "note"])).max(6),
  auditReferences: z.array(auditReferenceSchema).max(10),
}).strict();

export const incidentActionSchema = z.object({
  action: z.enum(["contain", "monitor", "resolve", "close", "reopen_monitoring", "note"]),
  context: actionContextSchema,
}).strict();

export const operationsIncidentSchema = z.object({
  id: z.uuid(),
  title: boundedText(160, 512),
  severity: z.enum(["info", "warning", "critical"]),
  status: z.enum(["open", "investigating", "monitoring", "resolved"]),
  startedAt: z.iso.datetime({ offset: true }),
  resolvedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  publicSummary: boundedText(500, 2048).nullable().optional(),
  assignedAdminId: z.string().min(1).max(128).nullable().optional(),
  version: z.number().int().positive(),
}).strict();

export const operationsIncidentPageSchema = z.object({
  items: z.array(operationsIncidentSchema).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
}).strict();

export const operationsIncidentMutationResultSchema = z.object({
  resourceId: z.uuid(),
  status: z.string().min(1).max(40),
  version: z.number().int().positive(),
}).strict();

export const auditEventSummarySchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("AUD-")),
  occurredAt: z.iso.datetime({ offset: true }),
  actor: safeReferenceSchema,
  action: boundedText(120, 512),
  resource: boundedText(80, 256),
  target: safeReferenceSchema,
  result: resultSchema,
  severity: riskLevelSchema,
  correlationId: securityIdSchema.refine((id) => id.startsWith("COR-")),
}).strict();

export const auditEventDetailSchema = auditEventSummarySchema.extend({
  region: boundedText(80, 256),
  metadata: z.array(safeMetadataEntrySchema).max(40),
  before: z.array(safeMetadataEntrySchema).max(20),
  after: z.array(safeMetadataEntrySchema).max(20),
  related: z.array(safeReferenceSchema).max(10).default([]),
}).strict();

export const exportFileMetadataSchema = z.object({
  basename: z.string().regex(/^[A-Za-z0-9._-]+\.zip$/),
  mediaType: z.literal("application/zip"),
  sizeBytes: z.number().int().nonnegative(),
  checksumLabel: boundedText(80, 256),
  state: z.enum(["unavailable", "ready", "expired"]),
}).strict();

export const exportRequestDetailSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("EXP-")),
  customer: safeReferenceSchema,
  scopes: z.array(exportScopeSchema).min(1).max(8),
  state: exportStateSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  file: exportFileMetadataSchema.optional(),
  safeError: boundedText(160, 512).optional(),
  timeline: z.array(timelineEntrySchema).max(20),
  revision: z.number().int().positive(),
  allowedActions: z.array(z.enum(["validate", "process", "mark_ready", "fail", "cancel", "retry", "expire", "simulate_download"])).max(8),
  auditReferences: z.array(auditReferenceSchema).max(10),
}).strict();

export const exportActionSchema = z.object({
  action: z.enum(["validate", "process", "mark_ready", "fail", "cancel", "retry", "expire"]),
  context: actionContextSchema,
}).strict();

export const exportDownloadRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export const exportDownloadResultSchema = z.object({
  requestId: securityIdSchema.refine((id) => id.startsWith("EXP-")),
  allowed: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }),
  message: boundedText(240, 512),
}).strict();

export const deletionChecklistItemSchema = z.object({
  category: z.enum([
    "customer_notified",
    "subscription_cancelled",
    "sessions_revoked",
    "exports_handled",
    "files_removed",
    "financial_data_deleted_or_anonymized",
    "ai_data_deleted",
    "audit_records_preserved",
    "completion_confirmed",
  ]),
  state: z.enum(["pending", "in_progress", "completed", "blocked", "preserved"]),
  responsible: boundedText(120, 512),
  reason: boundedText(160, 512).optional(),
  required: z.boolean(),
  preserved: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();

export const deletionRequestDetailSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("DEL-")),
  customer: safeReferenceSchema,
  state: deletionStateSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  completedAt: z.iso.datetime({ offset: true }).optional(),
  legalHold: z.boolean(),
  subscriptionStatus: boundedText(120, 512),
  checklist: z.array(deletionChecklistItemSchema).length(9),
  revision: z.number().int().positive(),
  allowedActions: z.array(z.enum(["review", "schedule", "start", "complete", "block", "retry", "cancel"])).max(7),
  auditReferences: z.array(auditReferenceSchema).max(10),
}).strict();

export const deletionActionSchema = z.object({
  action: z.enum(["review", "schedule", "start", "complete", "block", "retry", "cancel"]),
  context: actionContextSchema,
}).strict();

export const retentionPolicyDetailSchema = z.object({
  id: securityIdSchema.refine((id) => id.startsWith("RET-")),
  dataCategory: boundedText(120, 512),
  storageCategory: boundedText(120, 512),
  retentionDays: z.number().int().positive(),
  minimumDays: z.number().int().positive(),
  maximumDays: z.number().int().positive(),
  cleanupProcess: boundedText(120, 512),
  lastCleanupAt: z.iso.datetime({ offset: true }).optional(),
  state: retentionStateSchema,
  effectiveCleanupState: z.enum(["active", "suspended"]),
  legalHold: z.boolean(),
  protectedAuditPolicy: z.boolean(),
  revision: z.number().int().positive(),
  changeHistory: z.array(timelineEntrySchema).max(20),
  allowedActions: z.array(z.enum(["update"])).max(1),
}).strict().refine((policy) => policy.minimumDays <= policy.retentionDays && policy.retentionDays <= policy.maximumDays);

export const retentionUpdateSchema = z.object({
  retentionDays: z.number().int().positive(),
  reason: boundedText(240, 2048),
  impactAcknowledged: z.literal(true),
  expectedRevision: z.number().int().positive(),
  confirmationToken: z.literal("CONFIRM-SPEC-008"),
}).strict();

export const apiErrorSchema = z.object({
  code: z.enum(["validation_error", "forbidden", "not_found", "conflict", "gone", "internal_error"]),
}).strict();

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: pageSizeSchema,
      totalItems: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }).strict(),
    region: z.object({
      availability: z.enum(["available", "empty", "partial", "unavailable", "forbidden"]),
      message: boundedText(160, 512).optional(),
    }).strict(),
  }).strict();
}

export const authenticationEventsPageSchema = pageSchema(authenticationEventSchema);
export const suspiciousActivityPageSchema = pageSchema(suspiciousActivitySchema);
export const adminSecurityPageSchema = pageSchema(adminSecuritySchema);
export const permissionChangePageSchema = pageSchema(permissionChangeSchema);
export const supportAccessPageSchema = pageSchema(supportAccessGrantSchema);
export const auditEventsPageSchema = pageSchema(auditEventSummarySchema);
export const exportRequestsPageSchema = pageSchema(exportRequestDetailSchema);
export const deletionRequestsPageSchema = pageSchema(deletionRequestDetailSchema);
export const retentionPoliciesPageSchema = pageSchema(retentionPolicyDetailSchema);

export function buildSecurityQuery(input: z.input<typeof listQuerySchema>): URLSearchParams {
  const parsed = listQuerySchema.parse(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}

export type ListQuery = z.input<typeof listQuerySchema>;
export type OverviewQuery = z.input<typeof overviewQuerySchema>;
export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
export type AuthenticationEvent = z.infer<typeof authenticationEventSchema>;
export type SuspiciousActivity = z.infer<typeof suspiciousActivitySchema>;
export type AdminSecurity = z.infer<typeof adminSecuritySchema>;
export type PermissionChange = z.infer<typeof permissionChangeSchema>;
export type SupportAccessGrant = z.infer<typeof supportAccessGrantSchema>;
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;
export type AuditEventDetail = z.infer<typeof auditEventDetailSchema>;
export type AuditEventSummary = z.infer<typeof auditEventSummarySchema>;
export type ExportRequestDetail = z.infer<typeof exportRequestDetailSchema>;
export type DeletionRequestDetail = z.infer<typeof deletionRequestDetailSchema>;
export type RetentionPolicyDetail = z.infer<typeof retentionPolicyDetailSchema>;
export type ActionResult = z.infer<typeof actionResultSchema>;
export type OperationsIncidentMutationResult = z.infer<typeof operationsIncidentMutationResultSchema>;
