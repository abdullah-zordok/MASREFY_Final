import { z } from "zod";
import { ADMIN_ROLES } from "@/core/permissions/permissions";

const fixtureId = /^[A-Z][A-Z0-9]*-[A-Z0-9-]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaqueId = (providerPattern: RegExp) =>
  z.string().min(1).max(128).refine(
    (value) => providerPattern.test(value) || uuid.test(value) || fixtureId.test(value),
    "Invalid opaque API identifier",
  );

export const userIdSchema = opaqueId(/^user_[A-Za-z0-9_-]+$/);
export const deviceIdSchema = opaqueId(/^device_[A-Za-z0-9_-]+$/);
export const sessionIdSchema = opaqueId(/^sess_[A-Za-z0-9_-]+$/);
export const auditReferenceSchema = opaqueId(/^audit_[A-Za-z0-9_-]+$/);

export const platformSchema = z.enum(["ios", "android"]);
export type Platform = z.infer<typeof platformSchema>;

export const platformFilterSchema = z.enum(["all", "ios", "android", "multi"]);
export type PlatformFilter = z.infer<typeof platformFilterSchema>;

export const accountStatusSchema = z.enum(["active", "suspended", "pending"]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const verificationStateSchema = z.enum(["verified", "pending"]);
export type VerificationState = z.infer<typeof verificationStateSchema>;

export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const planSchema = z.enum(["Free", "Basic", "Premium"]);
export type Plan = z.infer<typeof planSchema>;

export const capabilityStateSchema = z.enum([
  "enabled",
  "disabled",
  "denied",
  "unavailable",
  "unknown",
  "not-applicable",
]);
export type CapabilityState = z.infer<typeof capabilityStateSchema>;

export const deviceStateSchema = z.enum(["active", "revoked"]);
export type DeviceState = z.infer<typeof deviceStateSchema>;

export const sessionStateSchema = z.enum(["active", "expired", "revoked"]);
export type SessionState = z.infer<typeof sessionStateSchema>;

export const regionAvailabilitySchema = z.enum([
  "available",
  "empty",
  "partial",
  "stale",
  "unavailable",
  "forbidden",
]);
export type RegionAvailability = z.infer<typeof regionAvailabilitySchema>;

export const regionStateSchema = z.object({
  availability: regionAvailabilitySchema,
  message: z.string().max(240).optional(),
  retryable: z.boolean().optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type RegionState = z.infer<typeof regionStateSchema>;

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
}).strict();
export type Pagination = z.infer<typeof paginationSchema>;

export const pageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);

export const adminUsersQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    status: accountStatusSchema.optional(),
    plan: planSchema.optional(),
    country: z.enum(["SA", "AE"]).optional(),
    language: z.enum(["ar", "en"]).optional(),
    registeredFrom: z.iso.date().optional(),
    registeredTo: z.iso.date().optional(),
    lastActiveFrom: z.iso.datetime({ offset: true }).optional(),
    lastActiveTo: z.iso.datetime({ offset: true }).optional(),
    platform: platformFilterSchema.default("all"),
    appVersion: z.string().trim().max(32).optional(),
    verification: verificationStateSchema.optional(),
    risk: riskLevelSchema.optional(),
    sort: z.enum(["name", "registeredAt", "lastActive", "risk"]).default("lastActive"),
    order: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().pipe(pageSizeSchema).default(25),
    scenario: z.string().max(40).optional(),
    role: z.enum(ADMIN_ROLES).optional(),
  })
  .strict()
  .refine((value) => !value.registeredFrom || !value.registeredTo || value.registeredFrom <= value.registeredTo, {
    message: "registeredFrom must not exceed registeredTo",
    path: ["registeredTo"],
  })
  .refine(
    (value) => !value.lastActiveFrom || !value.lastActiveTo || value.lastActiveFrom <= value.lastActiveTo,
    { message: "lastActiveFrom must not exceed lastActiveTo", path: ["lastActiveTo"] },
  );

export type AdminUsersQuery = z.output<typeof adminUsersQuerySchema>;

export const adminUserListItemSchema = z
  .object({
    id: userIdSchema,
    displayName: z.string().min(1).max(100),
    maskedEmail: z.string().regex(/^[^@]*\*{3}[^@]*@example\.test$/).max(160),
    country: z.enum(["SA", "AE"]),
    language: z.enum(["ar", "en"]),
    primaryPlatform: platformSchema,
    registeredPlatforms: z
      .array(platformSchema)
      .min(1)
      .max(2)
      .refine((arr) => new Set(arr).size === arr.length, "Platforms must be unique"),
    iosDeviceCount: z.number().int().min(0),
    androidDeviceCount: z.number().int().min(0),
    totalDeviceCount: z.number().int().min(0),
    plan: planSchema,
    status: accountStatusSchema,
    verification: verificationStateSchema,
    registeredAt: z.iso.datetime({ offset: true }),
    lastActiveAt: z.iso.datetime({ offset: true }),
    risk: riskLevelSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const hasIos = value.registeredPlatforms.includes("ios");
    const hasAndroid = value.registeredPlatforms.includes("android");
    if (hasIos !== (value.iosDeviceCount > 0)) {
      context.addIssue({
        code: "custom",
        message: "iOS platform membership must match iosDeviceCount",
        path: ["registeredPlatforms"],
      });
    }
    if (hasAndroid !== (value.androidDeviceCount > 0)) {
      context.addIssue({
        code: "custom",
        message: "Android platform membership must match androidDeviceCount",
        path: ["registeredPlatforms"],
      });
    }
    if (value.totalDeviceCount !== value.iosDeviceCount + value.androidDeviceCount) {
      context.addIssue({
        code: "custom",
        message: "totalDeviceCount must equal iosDeviceCount plus androidDeviceCount",
        path: ["totalDeviceCount"],
      });
    }
    if (!value.registeredPlatforms.includes(value.primaryPlatform)) {
      context.addIssue({
        code: "custom",
        message: "primaryPlatform must be in registeredPlatforms",
        path: ["primaryPlatform"],
      });
    }
  });

export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;

export const adminUsersPageSchema = z
  .object({
    items: z.array(adminUserListItemSchema).max(100),
    pagination: paginationSchema,
    uniqueCustomersTotal: z.number().int().min(0),
    iosCustomers: z.number().int().min(0),
    androidCustomers: z.number().int().min(0),
    multiPlatformCustomers: z.number().int().min(0),
    region: regionStateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const item of value.items) {
      if (ids.has(item.id)) {
        context.addIssue({ code: "custom", message: "Duplicate user ID within page", path: ["items"] });
      }
      ids.add(item.id);
    }
    const expectedPages = value.pagination.totalItems === 0
      ? 0
      : Math.ceil(value.pagination.totalItems / value.pagination.pageSize);
    if (value.pagination.totalPages !== expectedPages || value.items.length > value.pagination.pageSize) {
      context.addIssue({ code: "custom", message: "Pagination envelope is inconsistent", path: ["pagination"] });
    }
    if (
      value.multiPlatformCustomers > value.iosCustomers
      || value.multiPlatformCustomers > value.androidCustomers
      || value.iosCustomers > value.uniqueCustomersTotal
      || value.androidCustomers > value.uniqueCustomersTotal
    ) {
      context.addIssue({ code: "custom", message: "Platform totals are inconsistent", path: ["multiPlatformCustomers"] });
    }
  });

export type AdminUsersPage = z.infer<typeof adminUsersPageSchema>;

const readScenarioSchema = z.string().max(40).optional();
const simulatedRoleSchema = z.enum(ADMIN_ROLES).optional();

export const userDetailRequestSchema = z.object({
  userId: userIdSchema,
  role: simulatedRoleSchema,
  scenario: readScenarioSchema,
}).strict();
export type UserDetailRequest = z.infer<typeof userDetailRequestSchema>;

export const riskSummarySchema = z.object({
  level: riskLevelSchema,
  label: z.string().min(1).max(100),
  updatedAt: z.iso.datetime({ offset: true }),
  signalsCount: z.number().int().min(0),
}).strict();
export type RiskSummary = z.infer<typeof riskSummarySchema>;

export const userAggregatesSchema = z.object({
  accountsCount: z.number().int().min(0),
  transactionsCount: z.number().int().min(0),
  goalsCount: z.number().int().min(0),
  activeDebtsCount: z.number().int().min(0),
  importSourcesCount: z.number().int().min(0),
  lastSyncAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export type UserAggregates = z.infer<typeof userAggregatesSchema>;

export const userProfileSummarySchema = z
  .object({
    id: userIdSchema,
    displayName: z.string().min(1).max(100),
    maskedEmail: z.string().regex(/^[^@]*\*{3}[^@]*@example\.test$/).max(160),
    country: z.enum(["SA", "AE"]),
    language: z.enum(["ar", "en"]),
    currency: z.enum(["SAR", "AED"]),
    timezone: z.string().min(1).max(64),
    registeredAt: z.iso.datetime({ offset: true }),
    lastActiveAt: z.iso.datetime({ offset: true }),
    lastActivityByPlatform: z.object({
      ios: z.iso.datetime({ offset: true }).optional(),
      android: z.iso.datetime({ offset: true }).optional(),
    }).strict(),
    status: accountStatusSchema,
    onboardingStatus: z.enum(["complete", "incomplete"]),
    verification: verificationStateSchema,
    risk: riskSummarySchema,
    primaryPlatform: platformSchema,
    registeredPlatforms: z.array(platformSchema).min(1).max(2)
      .refine((platforms) => new Set(platforms).size === platforms.length),
    currentPlan: planSchema,
    aggregates: userAggregatesSchema,
    region: regionStateSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (!profile.registeredPlatforms.includes(profile.primaryPlatform)) {
      context.addIssue({
        code: "custom",
        message: "primaryPlatform must be registered",
        path: ["primaryPlatform"],
      });
    }
    for (const platform of platformSchema.options) {
      if (profile.lastActivityByPlatform[platform] && !profile.registeredPlatforms.includes(platform)) {
        context.addIssue({
          code: "custom",
          message: "Platform activity requires registration",
          path: ["lastActivityByPlatform", platform],
        });
      }
    }
  });
export type UserProfileSummary = z.infer<typeof userProfileSummarySchema>;

export const userDevicesQuerySchema = userDetailRequestSchema;
export type UserDevicesQuery = z.infer<typeof userDevicesQuerySchema>;

export const userDeviceSchema = z
  .object({
    id: deviceIdSchema,
    userId: userIdSchema,
    safeLabel: z.string().min(1).max(80),
    platform: platformSchema,
    osVersion: z.string().min(1).max(32),
    appVersion: z.string().min(1).max(32),
    lastSeenAt: z.iso.datetime({ offset: true }),
    pushState: capabilityStateSchema,
    shortcutState: capabilityStateSchema,
    shareExtensionState: capabilityStateSchema,
    smsTrackingState: capabilityStateSchema,
    notificationListenerState: capabilityStateSchema,
    backgroundState: capabilityStateSchema,
    sessionState: z.enum(["active", "none", "revoked"]),
    state: deviceStateSchema,
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((device, context) => {
    const iosCapabilities = [device.shortcutState, device.shareExtensionState];
    const androidCapabilities = [
      device.smsTrackingState,
      device.notificationListenerState,
      device.backgroundState,
    ];
    if (device.platform === "ios" && androidCapabilities.some((state) => state !== "not-applicable")) {
      context.addIssue({ code: "custom", message: "Android capabilities do not apply to iOS" });
    }
    if (device.platform === "android" && iosCapabilities.some((state) => state !== "not-applicable")) {
      context.addIssue({ code: "custom", message: "iOS capabilities do not apply to Android" });
    }
    if ((device.state === "revoked") !== (device.revokedAt !== null)) {
      context.addIssue({ code: "custom", message: "Device state and revokedAt must agree" });
    }
  });
export type UserDevice = z.infer<typeof userDeviceSchema>;

export const userDevicesResponseSchema = z
  .object({
    items: z.array(userDeviceSchema).max(100),
    iosDeviceCount: z.number().int().min(0),
    androidDeviceCount: z.number().int().min(0),
    totalDeviceCount: z.number().int().min(0),
    activeDeviceCount: z.number().int().min(0),
    revokedDeviceCount: z.number().int().min(0),
    region: regionStateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    const ios = response.items.filter(({ platform }) => platform === "ios").length;
    const android = response.items.length - ios;
    const active = response.items.filter(({ state }) => state === "active").length;
    const revoked = response.items.length - active;
    if (
      response.iosDeviceCount !== ios
      || response.androidDeviceCount !== android
      || response.totalDeviceCount !== ios + android
      || response.activeDeviceCount !== active
      || response.revokedDeviceCount !== revoked
    ) {
      context.addIssue({ code: "custom", message: "Device response counts must match items" });
    }
  });
export type UserDevicesResponse = z.infer<typeof userDevicesResponseSchema>;

export const userSessionsQuerySchema = userDetailRequestSchema;
export type UserSessionsQuery = z.infer<typeof userSessionsQuerySchema>;

export const userSessionSchema = z
  .object({
    id: sessionIdSchema,
    userId: userIdSchema,
    deviceId: deviceIdSchema,
    safeDeviceLabel: z.string().min(1).max(80),
    platform: platformSchema,
    coarseRegion: z.string().min(1).max(80),
    startedAt: z.iso.datetime({ offset: true }),
    lastActivityAt: z.iso.datetime({ offset: true }),
    state: sessionStateSchema,
    risk: riskLevelSchema,
    isCurrentAdminVisibleSession: z.boolean(),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((session, context) => {
    if (Date.parse(session.lastActivityAt) < Date.parse(session.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "Session activity cannot precede its start",
        path: ["lastActivityAt"],
      });
    }
    if ((session.state === "revoked") !== (session.revokedAt !== null)) {
      context.addIssue({ code: "custom", message: "Session state and revokedAt must agree" });
    }
  });
export type UserSession = z.infer<typeof userSessionSchema>;

export const userSessionsResponseSchema = z
  .object({
    items: z.array(userSessionSchema).max(100),
    activeCount: z.number().int().min(0),
    expiredCount: z.number().int().min(0),
    revokedCount: z.number().int().min(0),
    region: regionStateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    const active = response.items.filter(({ state }) => state === "active").length;
    const expired = response.items.filter(({ state }) => state === "expired").length;
    const revoked = response.items.filter(({ state }) => state === "revoked").length;
    if (
      response.activeCount !== active
      || response.expiredCount !== expired
      || response.revokedCount !== revoked
    ) {
      context.addIssue({ code: "custom", message: "Session response counts must match items" });
    }
  });
export type UserSessionsResponse = z.infer<typeof userSessionsResponseSchema>;

const actionReasonSchema = z.string().trim().min(5).max(200);
const internalNoteSchema = z.string().trim().max(500);
const uniqueUserIdsSchema = z.array(userIdSchema).min(1).max(100)
  .refine((ids) => new Set(ids).size === ids.length, "User IDs must be unique");

export const suspendUserRequestSchema = z.object({
  reason: actionReasonSchema,
  durationDays: z.number().int().min(1).max(365),
  internalNote: internalNoteSchema,
  notifyUser: z.boolean(),
}).strict();
export type SuspendUserRequest = z.infer<typeof suspendUserRequestSchema>;

export const reactivateUserRequestSchema = z.object({
  reason: actionReasonSchema,
  internalNote: internalNoteSchema,
}).strict();
export type ReactivateUserRequest = z.infer<typeof reactivateUserRequestSchema>;

export const updateVerificationRequestSchema = z.object({
  nextState: verificationStateSchema,
  reason: actionReasonSchema,
}).strict();
export type UpdateVerificationRequest = z.infer<typeof updateVerificationRequestSchema>;

export const revokeDeviceRequestSchema = z.object({ reason: actionReasonSchema }).strict();
export type RevokeDeviceRequest = z.infer<typeof revokeDeviceRequestSchema>;

export const revokeSessionsRequestSchema = z.object({
  scope: z.enum(["selected", "all"]),
  sessionIds: z.array(sessionIdSchema).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Session IDs must be unique"),
  reason: actionReasonSchema,
}).strict().superRefine((request, context) => {
  const validSelection = request.scope === "selected"
    ? request.sessionIds.length > 0
    : request.sessionIds.length === 0;
  if (!validSelection) {
    context.addIssue({ code: "custom", path: ["sessionIds"], message: "Session IDs must match scope" });
  }
});
export type RevokeSessionsRequest = z.infer<typeof revokeSessionsRequestSchema>;

export const userActionResultSchema = z.object({
  userId: userIdSchema,
  action: z.enum(["suspend", "reactivate", "verification", "revoke-device", "revoke-sessions"]),
  previousState: z.string().max(40),
  currentState: z.string().max(40),
  outcome: z.enum(["success", "partial"]),
  affectedCount: z.number().int().min(0),
  occurredAt: z.iso.datetime({ offset: true }),
  message: z.string().max(200),
  auditReference: auditReferenceSchema,
}).strict();
export type UserActionResult = z.infer<typeof userActionResultSchema>;

export const userBulkActionRequestSchema = z.object({
  action: z.enum(["export-summary", "suspend", "reactivate", "force-logout", "notification-handoff"]),
  userIds: uniqueUserIdsSchema,
  reason: actionReasonSchema.optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  notifyUser: z.boolean().optional(),
}).strict().superRefine((request, context) => {
  const needsReason = ["suspend", "reactivate", "force-logout"].includes(request.action);
  if (needsReason && !request.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Reason is required" });
  }
  if (request.action === "suspend" && request.durationDays === undefined) {
    context.addIssue({ code: "custom", path: ["durationDays"], message: "Duration is required" });
  }
});
export type UserBulkActionRequest = z.infer<typeof userBulkActionRequestSchema>;

export const bulkFailureSchema = z.object({
  userId: userIdSchema,
  code: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/),
  message: z.string().min(1).max(200),
}).strict();
export type BulkFailure = z.infer<typeof bulkFailureSchema>;

export const userBulkActionResultSchema = z.object({
  requestedCount: z.number().int().min(1),
  eligibleCount: z.number().int().min(0),
  succeededCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  failures: z.array(bulkFailureSchema).max(100),
  auditReference: auditReferenceSchema,
}).strict().superRefine((result, context) => {
  if (
    result.eligibleCount > result.requestedCount
    || result.succeededCount > result.eligibleCount
    || result.failedCount !== result.requestedCount - result.succeededCount
    || result.failures.length !== result.failedCount
  ) {
    context.addIssue({ code: "custom", message: "Bulk result counts are inconsistent" });
  }
});
export type UserBulkActionResult = z.infer<typeof userBulkActionResultSchema>;
