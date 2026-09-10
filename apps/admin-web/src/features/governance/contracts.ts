import { z } from "zod";
import { PERMISSION_KEYS } from "@/core/permissions/permissions";

const unsafeText = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

function prefixedId(prefix: string) {
  return z.string().trim().regex(new RegExp(`^${prefix}-[A-Z0-9-]{3,64}$`, "u"));
}

const safeBoundedText = (min: number, max: number) =>
  z.string()
    .trim()
    .transform((text) => text.normalize("NFC"))
    .pipe(z.string().min(min).max(max).refine((text) => !unsafeText.test(text), "unsafe text"));

export const adminIdSchema = prefixedId("ADM").or(z.string().trim().min(6).max(128).regex(/^user_[A-Za-z0-9_-]+$/u));
export const invitationIdSchema = prefixedId("INV").or(z.uuid());
export const roleIdSchema = prefixedId("ROLE").or(z.uuid());
export const sessionReferenceSchema = prefixedId("ASES");
export const flagIdSchema = prefixedId("FLAG").or(z.uuid()).or(z.string().regex(/^[a-z][a-z0-9.-]{2,79}$/u));
export const auditReferenceIdSchema = z.string().trim().regex(/^AUD-[A-Z0-9-]{3,80}$/u);
export const submissionKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._~-]+$/u);

export const versionSchema = z.number().int().positive();
export const isoTimestampSchema = z.iso.datetime({ offset: true });
export const fixedAudienceSchema = z.enum([
  "all_customers",
  "free_plan",
  "basic_plan",
  "premium_plan",
  "internal_testers",
]);

export const pageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().pipe(pageSizeSchema).default(25),
}).strict();

export const safeTextSchema = safeBoundedText(1, 500);
export const reasonSchema = safeBoundedText(10, 500);
export const adminNameSchema = safeBoundedText(1, 120);
export const departmentSchema = safeBoundedText(1, 80);
export const invitationMessageSchema = z.string()
  .trim()
  .transform((text) => text.normalize("NFC"))
  .pipe(z.string().max(1000).refine((text) => !unsafeText.test(text), "unsafe text"))
  .optional();

export const normalizedEmailSchema = z.string().trim().max(254).pipe(z.email()).transform((email) => email.normalize("NFC").toLowerCase());
export const expiryDaysSchema = z.coerce.number().int().min(1).max(30).default(7);

export const roleReferenceSchema = z.object({
  id: roleIdSchema,
  key: z.string().trim().min(2).max(80),
  label: z.string().trim().min(1).max(120),
}).strict();

export const safeReferenceSchema = z.object({
  id: z.string().trim().min(3).max(100),
  kind: z.string().trim().min(3).max(80),
  label: z.string().trim().min(1).max(160),
}).strict();

export const adminStatusSchema = z.enum(["invited", "active", "disabled"]);
export const invitationStatusSchema = z.enum(["pending", "accepted", "expired", "revoked"]);
export const sessionStateSchema = z.enum(["active", "revoked", "expired"]);
export const riskLabelSchema = z.enum(["low", "medium", "high"]);
export const twoFactorStateSchema = z.enum(["required_enabled", "optional_enabled", "missing"]);
export const adminAllowedActionSchema = z.enum(["assign_roles", "revoke_sessions", "disable"]);
export const permissionKeySchema = z.enum(PERMISSION_KEYS);

export const adminSessionSchema = z.object({
  id: sessionReferenceSchema,
  deviceLabel: safeBoundedText(1, 80),
  broadRegion: safeBoundedText(1, 80),
  startedAt: isoTimestampSchema,
  lastActivityAt: isoTimestampSchema,
  isCurrentSession: z.boolean(),
  riskLabel: riskLabelSchema,
  state: sessionStateSchema,
  version: versionSchema,
}).strict().refine((session) => Date.parse(session.lastActivityAt) >= Date.parse(session.startedAt), {
  message: "last activity must be after start",
});

export const ticketAssignmentSummarySchema = z.object({
  openCount: z.number().int().min(0),
  references: z.array(safeReferenceSchema).max(5),
}).strict();

export const adminUserSummarySchema = z.object({
  id: adminIdSchema,
  displayName: adminNameSchema,
  maskedEmail: z.string().trim().min(5).max(254).regex(/^\S+\*+\S*@example\.test$/u),
  roleSummaries: z.array(roleReferenceSchema).min(1),
  department: departmentSchema,
  status: adminStatusSchema,
  twoFactorState: twoFactorStateSchema,
  lastLoginAt: isoTimestampSchema.nullable(),
  activeSessionCount: z.number().int().min(0),
  createdAt: isoTimestampSchema,
  version: versionSchema,
  allowedActions: z.array(adminAllowedActionSchema),
}).strict();

export const adminUserDetailSchema = adminUserSummarySchema.extend({
  profile: z.object({
    title: safeBoundedText(1, 120),
    locale: z.enum(["ar", "en"]),
  }).strict(),
  assignedTickets: ticketAssignmentSummarySchema,
  sessions: z.array(adminSessionSchema),
  recentActions: z.array(safeReferenceSchema).max(8),
  auditReferences: z.array(safeReferenceSchema).max(8),
}).strict();

export const adminInvitationSchema = z.object({
  id: invitationIdSchema,
  maskedEmail: z.string().trim().min(5).max(254).regex(/^\S+\*+\S*@example\.test$/u),
  name: adminNameSchema,
  role: roleReferenceSchema,
  department: departmentSchema,
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  status: invitationStatusSchema,
  version: versionSchema,
  auditReference: safeReferenceSchema,
}).strict().refine((invitation) => Date.parse(invitation.expiresAt) > Date.parse(invitation.createdAt), {
  message: "expiry must be after creation",
});

export const adminListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(2).max(120).optional(),
  status: adminStatusSchema.or(z.literal("all")).default("all"),
}).strict();

export const adminListResponseSchema = z.object({
  items: z.array(adminUserSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: pageSizeSchema,
}).strict();

export const invitationListResponseSchema = z.object({
  items: z.array(adminInvitationSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: pageSizeSchema,
}).strict();

export const inviteAdminRequestSchema = z.object({
  email: normalizedEmailSchema,
  name: adminNameSchema,
  roleId: roleIdSchema,
  department: departmentSchema,
  expiryDays: expiryDaysSchema,
  message: invitationMessageSchema,
  submissionKey: submissionKeySchema,
}).strict();

export const inviteAdminResultSchema = z.object({
  invitation: adminInvitationSchema,
  message: z.string().trim().min(1).max(160),
}).strict();

export const assignAdminRolesRequestSchema = z.object({
  adminId: adminIdSchema,
  roleIds: z.array(roleIdSchema).min(1).max(10).refine((ids) => new Set(ids).size === ids.length, "duplicate roles"),
  reason: reasonSchema,
  expectedVersion: versionSchema,
  submissionKey: submissionKeySchema,
}).strict();

export const assignAdminRolesResultSchema = z.object({
  admin: adminUserDetailSchema,
  message: z.string().trim().min(1).max(160),
}).strict();

export const revokeAdminSessionsRequestSchema = z.object({
  adminId: adminIdSchema,
  sessionIds: z.array(sessionReferenceSchema).max(20).default([]),
  revokeAllEligible: z.boolean().default(false),
  reason: reasonSchema,
  expectedVersion: versionSchema,
  submissionKey: submissionKeySchema,
}).strict().refine((request) => request.revokeAllEligible || request.sessionIds.length > 0, {
  message: "select at least one session",
});

export const revokeAdminSessionsResultSchema = z.object({
  admin: adminUserDetailSchema,
  revokedSessionIds: z.array(sessionReferenceSchema),
  message: z.string().trim().min(1).max(160),
}).strict();

export const replacementSelectionSchema = z.object({
  adminId: adminIdSchema,
  label: z.string().trim().min(1).max(160),
}).strict();

export const disableAdminRequestSchema = z.object({
  adminId: adminIdSchema,
  reason: reasonSchema,
  revokeEligibleSessions: z.boolean(),
  replacementAdminId: adminIdSchema.optional(),
  expectedStatus: z.literal("active"),
  expectedVersion: versionSchema,
  submissionKey: submissionKeySchema,
}).strict();

export const disableAdminResultSchema = z.object({
  admin: adminUserDetailSchema,
  replacementCandidates: z.array(replacementSelectionSchema),
  message: z.string().trim().min(1).max(160),
}).strict();

export const safeApiErrorSchema = z.object({
  code: z.enum([
    "validation_error",
    "session_expired",
    "forbidden",
    "not_found",
    "conflict",
    "stale_version",
    "duplicate_submission",
    "ineligible_transition",
    "rate_limited",
    "unavailable",
    "internal_error",
  ]),
  message: z.string().trim().min(1).max(240),
  fieldErrors: z.record(z.string(), z.array(z.string().max(160)).max(5)).optional(),
  correlationId: z.string().trim().min(1).max(80).optional(),
}).strict();

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminInvitation = z.infer<typeof adminInvitationSchema>;
export type AdminListQuery = z.input<typeof adminListQuerySchema>;
export type AdminListResponse = z.infer<typeof adminListResponseSchema>;
export type InviteAdminRequest = z.input<typeof inviteAdminRequestSchema>;
export type AssignAdminRolesRequest = z.input<typeof assignAdminRolesRequestSchema>;
export type RevokeAdminSessionsRequest = z.input<typeof revokeAdminSessionsRequestSchema>;
export type DisableAdminRequest = z.input<typeof disableAdminRequestSchema>;
export type GovernanceApiError = z.infer<typeof safeApiErrorSchema>;

export const localizedTextSchema = z.object({
  ar: safeBoundedText(1, 120),
  en: safeBoundedText(1, 120),
}).strict();

export const roleKeySchema = z.string().trim().min(3).max(80).regex(/^[a-z][a-z0-9-]*$/u);
export const roleKindSchema = z.enum(["system", "custom"]);
export const roleStatusSchema = z.enum(["active", "disabled"]);

export const permissionMetadataSchema = z.object({
  key: permissionKeySchema,
  group: z.string().trim().min(2).max(80),
  label: localizedTextSchema,
  description: safeBoundedText(10, 240),
  approvalDescription: safeBoundedText(10, 240),
}).strict();

export const roleSchema = z.object({
  id: roleIdSchema,
  key: roleKeySchema,
  name: localizedTextSchema,
  description: safeBoundedText(10, 240),
  kind: roleKindSchema,
  status: roleStatusSchema,
  permissionKeys: z.array(permissionKeySchema).min(1).refine((keys) => new Set(keys).size === keys.length, "duplicate permissions"),
  assignmentCount: z.number().int().min(0),
  approval: z.object({
    required: z.boolean(),
    description: safeBoundedText(10, 240),
  }).strict(),
  version: versionSchema,
}).strict();

export const roleListResponseSchema = z.object({
  items: z.array(roleSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: pageSizeSchema,
}).strict();

export const roleCreateRequestSchema = z.object({
  key: roleKeySchema,
  name: localizedTextSchema,
  description: safeBoundedText(10, 240),
  permissionKeys: z.array(permissionKeySchema).min(1),
  reason: reasonSchema,
  submissionKey: submissionKeySchema,
}).strict();

export const roleUpdateRequestSchema = z.object({
  name: localizedTextSchema.optional(),
  description: safeBoundedText(10, 240).optional(),
  permissionKeys: z.array(permissionKeySchema).min(1).optional(),
  status: roleStatusSchema.optional(),
  reason: reasonSchema,
  expectedVersion: versionSchema,
  submissionKey: submissionKeySchema,
}).strict().refine((request) => request.name || request.description || request.permissionKeys || request.status, {
  message: "at least one role field must change",
});

export const roleMutationResultSchema = z.object({
  role: roleSchema,
  message: z.string().trim().min(1).max(160),
}).strict();

export const permissionGroupSchema = z.object({
  group: z.string().trim().min(2).max(80),
  permissions: z.array(permissionMetadataSchema).min(1),
}).strict();

export const permissionMatrixSchema = z.object({
  groups: z.array(permissionGroupSchema).min(1),
  roles: z.array(roleSchema),
  permissionCount: z.number().int().min(PERMISSION_KEYS.length).max(PERMISSION_KEYS.length),
}).strict();

export type GovernanceRole = z.infer<typeof roleSchema>;
export type RoleCreateRequest = z.input<typeof roleCreateRequestSchema>;
export type RoleUpdateRequest = z.input<typeof roleUpdateRequestSchema>;

export const settingsGroupNameSchema = z.enum(["general", "mobile", "imports", "ai", "subscriptions", "security"]);
const urlSchema = z.url().refine((value) => new URL(value).hostname.endsWith("example.test"), "must use fictional host");
const uniqueStrings = (items: string[]) => new Set(items).size === items.length;
const increasingNumbers = (items: number[]) => items.every((item, index) => index === 0 || item > items[index - 1]);

export const generalSettingsValuesSchema = z.object({
  platformName: safeBoundedText(1, 80),
  defaultLocale: z.enum(["ar", "en"]),
  timezone: z.enum(["Asia/Riyadh", "Asia/Dubai", "UTC"]),
  supportUrl: urlSchema,
}).strict();

export const mobileSettingsValuesSchema = z.object({
  iosMinBuild: z.number().int().min(1).max(9999),
  androidMinBuild: z.number().int().min(1).max(9999),
  forceUpdate: z.boolean(),
  storeUrls: z.object({ ios: urlSchema, android: urlSchema }).strict(),
}).strict();

export const importsSettingsValuesSchema = z.object({
  maxFileMb: z.number().int().min(1).max(100),
  duplicateWindowDays: z.number().int().min(1).max(90),
  priorityOrder: z.array(z.enum(["csv", "pdf", "email"])).length(3).refine(uniqueStrings, "priority order must be unique"),
}).strict();

export const aiSettingsValuesSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(0).max(100000),
  enabledModels: z.array(z.enum(["classifier", "extractor", "summarizer"])).min(1).refine(uniqueStrings, "models must be unique"),
  failClosed: z.boolean(),
}).strict();

export const subscriptionsSettingsValuesSchema = z.object({
  gracePeriodDays: z.number().int().min(0).max(30),
  retryDays: z.array(z.number().int().min(1).max(30)).min(1).max(5).refine(increasingNumbers, "retry days must increase"),
  providerMode: z.enum(["mock_stripe", "disabled"]),
}).strict();

export const securitySettingsValuesSchema = z.object({
  sessionMinutes: z.number().int().min(5).max(1440),
  mfaRequired: z.boolean(),
  riskThresholds: z.object({
    low: z.number().int().min(0).max(100),
    medium: z.number().int().min(0).max(100),
    high: z.number().int().min(0).max(100),
  }).strict().refine((value) => value.low < value.medium && value.medium < value.high, "thresholds must increase"),
}).strict();

export const settingsValueSchemas = {
  general: generalSettingsValuesSchema,
  mobile: mobileSettingsValuesSchema,
  imports: importsSettingsValuesSchema,
  ai: aiSettingsValuesSchema,
  subscriptions: subscriptionsSettingsValuesSchema,
  security: securitySettingsValuesSchema,
} as const;

export const settingsGroupSchema = z.discriminatedUnion("group", [
  z.object({ group: z.literal("general"), values: generalSettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
  z.object({ group: z.literal("mobile"), values: mobileSettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
  z.object({ group: z.literal("imports"), values: importsSettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
  z.object({ group: z.literal("ai"), values: aiSettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
  z.object({ group: z.literal("subscriptions"), values: subscriptionsSettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
  z.object({ group: z.literal("security"), values: securitySettingsValuesSchema, version: versionSchema, updatedAt: isoTimestampSchema }).strict(),
]);

export const updateSettingsGroupRequestSchema = z.object({
  expectedVersion: versionSchema,
  changes: z.record(z.string(), z.unknown()),
  reason: reasonSchema,
  submissionKey: submissionKeySchema,
}).strict();

export type SettingsGroupName = z.infer<typeof settingsGroupNameSchema>;
export type SettingsGroup = z.infer<typeof settingsGroupSchema>;
export type UpdateSettingsGroupRequest = z.input<typeof updateSettingsGroupRequestSchema>;

export const featureFlagStatusSchema = z.enum(["disabled", "scheduled", "active", "ended"]);
export const platformScopeSchema = z.enum(["ios", "android", "shared"]);
export const featureTargetRuleSchema = z.object({
  priority: z.number().int().min(1).max(1000),
  audience: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  enabled: z.boolean(),
}).strict();
export const featureFlagSchema = z.object({
  id: flagIdSchema,
  key: z.string().trim().min(3).max(80).regex(/^[a-z][a-z0-9.-]*$/u),
  label: localizedTextSchema,
  platform: platformScopeSchema,
  audience: fixedAudienceSchema,
  rolloutPercent: z.number().int().min(0).max(100),
  status: featureFlagStatusSchema,
  startsAt: isoTimestampSchema.nullable(),
  endsAt: isoTimestampSchema.nullable(),
  version: versionSchema,
  updatedAt: isoTimestampSchema.nullable(),
  targetingRules: z.array(featureTargetRuleSchema).max(100).default([]),
}).strict();

export const featureFlagListResponseSchema = z.object({
  items: z.array(featureFlagSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: pageSizeSchema,
}).strict();

export const updateFeatureFlagRequestSchema = z.object({
  audience: fixedAudienceSchema.optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  status: featureFlagStatusSchema.exclude(["ended"]).optional(),
  expectedVersion: versionSchema,
  reason: reasonSchema,
  submissionKey: submissionKeySchema,
}).strict().refine((request) => request.audience || request.rolloutPercent !== undefined || request.status, {
  message: "at least one flag field must change",
});

export const featureFlagResultSchema = z.object({
  flag: featureFlagSchema,
  message: z.string().trim().min(1).max(160),
}).strict();

export const maintenanceStateSchema = z.enum(["off", "scheduled", "active"]);
export const maintenanceSchema = z.object({
  state: maintenanceStateSchema,
  message: localizedTextSchema.nullable(),
  startsAt: isoTimestampSchema.nullable(),
  endsAt: isoTimestampSchema.nullable(),
  version: versionSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable(),
  mockOnly: z.boolean(),
}).strict();

export const updateMaintenanceRequestSchema = z.object({
  nextState: maintenanceStateSchema,
  message: localizedTextSchema,
  startsAt: isoTimestampSchema.nullable().optional(),
  endsAt: isoTimestampSchema.nullable().optional(),
  expectedVersion: versionSchema,
  reason: reasonSchema,
  submissionKey: submissionKeySchema,
}).strict();

export const maintenanceResultSchema = z.object({
  maintenance: maintenanceSchema,
  message: z.string().trim().min(1).max(160),
}).strict();

export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export type UpdateFeatureFlagRequest = z.input<typeof updateFeatureFlagRequestSchema>;
export type Maintenance = z.infer<typeof maintenanceSchema>;
export type UpdateMaintenanceRequest = z.input<typeof updateMaintenanceRequestSchema>;

export const phase13SettingSchema = z.object({
  key: z.string().min(3).max(128),
  value: z.unknown().optional(),
  sensitivity: z.enum(["public", "internal", "restricted"]),
  redacted: z.boolean(),
  version: versionSchema,
  updatedAt: isoTimestampSchema,
}).strict().refine((setting) => !setting.redacted || setting.value === undefined, {
  message: "redacted settings must omit value",
});

const phase13FeatureRuleSchema = featureTargetRuleSchema.extend({
  id: z.uuid(),
  version: versionSchema,
}).strict();

export const phase13FeatureFlagPageSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    key: z.string().min(3).max(80),
    description: z.string().min(10).max(240),
    defaultEnabled: z.boolean(),
    status: z.enum(["draft", "active", "retired"]),
    rules: z.array(phase13FeatureRuleSchema).max(100),
    version: versionSchema,
  }).strict()).max(100),
  nextCursor: z.string().max(256).nullable(),
}).strict();

export const phase13MaintenancePageSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    startsAt: isoTimestampSchema,
    endsAt: isoTimestampSchema,
    scopes: z.array(z.string()).min(1).max(10),
    message: localizedTextSchema,
    status: z.enum(["scheduled", "active", "completed", "canceled"]),
    version: versionSchema,
  }).strict()).max(100),
  nextCursor: z.string().max(256).nullable(),
}).strict();

export const phase13MutationResultSchema = z.object({
  resourceId: z.string().min(1).max(128),
  status: z.string().min(1).max(32),
  version: versionSchema,
  replayed: z.boolean().optional(),
}).strict();

const be3CursorSchema = z.object({ nextCursor: z.string().min(1).max(512).nullable() });
export const be3AdminSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().max(120).nullable(),
  emailMasked: z.string().max(254).nullable(),
  status: z.enum(["invited", "active", "suspended", "revoked"]),
  department: z.string().max(80).nullable().optional(),
  roleKeys: z.array(z.string().max(64)).max(50),
  mfaStatus: z.enum(["enabled", "missing", "unknown"]),
  activeSessionCount: z.number().int().nonnegative(),
  version: versionSchema,
}).strict();
export const be3AssignmentSchema = z.object({
  id: z.uuid(), userId: z.string().min(1).max(128), roleId: z.uuid(),
  startsAt: isoTimestampSchema, endsAt: isoTimestampSchema.nullable(), revokedAt: isoTimestampSchema.nullable(), version: versionSchema,
}).strict();
export const be3AdminDetailSchema = be3AdminSchema.extend({
  assignments: z.array(be3AssignmentSchema).max(100),
  effectivePermissionKeys: z.array(z.string().min(1).max(128)).max(500),
  eligibleActions: z.array(z.string().min(1).max(64)).max(20),
}).strict();
export const be3AdminPageSchema = be3CursorSchema.extend({ items: z.array(be3AdminSchema).max(200) }).strict();
export const be3InvitationSchema = z.object({
  id: z.uuid(), emailMasked: z.string().min(3).max(254), roleId: z.uuid(),
  department: z.string().max(80).nullable().optional(), status: invitationStatusSchema,
  expiresAt: isoTimestampSchema, version: versionSchema,
}).strict();
export const be3InvitationPageSchema = be3CursorSchema.extend({ items: z.array(be3InvitationSchema).max(200) }).strict();
export const be3RoleSchema = z.object({
  id: z.uuid(), key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u), name: z.string().min(1).max(120),
  description: z.string().max(500).nullable(), systemRole: z.boolean(), enabled: z.boolean(),
  permissionKeys: z.array(z.string().min(1).max(128)).max(500), assignmentCount: z.number().int().nonnegative(), version: versionSchema,
}).strict();
export const be3RolePageSchema = be3CursorSchema.extend({ items: z.array(be3RoleSchema).max(200) }).strict();
export const be3PermissionSchema = z.object({
  id: z.uuid(), key: z.string().min(1).max(128), resource: z.string().min(1).max(64),
  action: z.string().min(1).max(64), description: z.string().max(500).nullable(),
}).strict();
export const be3PermissionPageSchema = be3CursorSchema.extend({
  items: z.array(be3PermissionSchema).max(200), manifestHash: z.string().max(128),
}).strict();
export const be3SessionRevokeResultSchema = z.object({
  sessionReferences: z.array(z.string().min(1).max(128)).max(100), version: versionSchema,
}).strict();
export type AccessRole = z.infer<typeof be3RoleSchema>;
export type AccessPermission = z.infer<typeof be3PermissionSchema>;
export type AccessAdmin = z.infer<typeof be3AdminSchema>;
export type AccessAdminDetail = z.infer<typeof be3AdminDetailSchema>;
