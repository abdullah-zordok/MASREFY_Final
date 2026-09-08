import { describe, expect, test } from "vitest";
import {
  adminUserListItemSchema,
  adminUsersPageSchema,
  adminUsersQuerySchema,
  userDeviceSchema,
  userDevicesResponseSchema,
  userDetailRequestSchema,
  userIdSchema,
  userProfileSummarySchema,
  userSessionSchema,
  userSessionsResponseSchema,
  suspendUserRequestSchema,
  reactivateUserRequestSchema,
  updateVerificationRequestSchema,
  revokeDeviceRequestSchema,
  revokeSessionsRequestSchema,
  userActionResultSchema,
  userBulkActionRequestSchema,
  userBulkActionResultSchema,
} from "./contracts";

const validItem = {
  id: "USR-10482",
  displayName: "نورة العتيبي",
  maskedEmail: "n***@example.test",
  country: "SA",
  language: "ar",
  primaryPlatform: "ios" as const,
  registeredPlatforms: ["ios" as const],
  iosDeviceCount: 2,
  androidDeviceCount: 0,
  totalDeviceCount: 2,
  plan: "Premium" as const,
  status: "active" as const,
  verification: "verified" as const,
  registeredAt: "2026-01-11T00:00:00+03:00",
  lastActiveAt: "2026-07-25T08:20:00+03:00",
  risk: "low" as const,
};

describe("userId schema", () => {
  test("accepts opaque API and demo user ids and rejects malformed values", () => {
    expect(userIdSchema.safeParse("USR-10482").success).toBe(true);
    expect(userIdSchema.safeParse("user_2abcDEF123").success).toBe(true);
    expect(userIdSchema.safeParse("usr-10482").success).toBe(false);
    expect(userIdSchema.safeParse("user id").success).toBe(false);
    expect(userIdSchema.safeParse(`user_${"A".repeat(130)}`).success).toBe(false);
  });
});

describe("controlled user action contracts", () => {
  test("accepts bounded action inputs and trims operator text", () => {
    expect(suspendUserRequestSchema.parse({
      reason: "  مراجعة أمنية  ", durationDays: 7, internalNote: "", notifyUser: false,
    }).reason).toBe("مراجعة أمنية");
    expect(reactivateUserRequestSchema.safeParse({ reason: "تمت المراجعة", internalNote: "" }).success).toBe(true);
    expect(updateVerificationRequestSchema.safeParse({ nextState: "pending", reason: "إعادة تحقق" }).success).toBe(true);
    expect(revokeDeviceRequestSchema.safeParse({ reason: "جهاز غير موثوق" }).success).toBe(true);
  });

  test.each([
    [{ scope: "selected", sessionIds: [], reason: "سبب صالح" }, false],
    [{ scope: "selected", sessionIds: ["SES-10482-A", "SES-10482-A"], reason: "سبب صالح" }, false],
    [{ scope: "all", sessionIds: ["SES-10482-A"], reason: "سبب صالح" }, false],
    [{ scope: "all", sessionIds: [], reason: "سبب صالح" }, true],
  ])("enforces selected/all session scope for %o", (input, accepted) => {
    expect(revokeSessionsRequestSchema.safeParse(input).success).toBe(accepted);
  });

  test("rejects unsafe action result fields", () => {
    expect(userActionResultSchema.safeParse({
      userId: "USR-10482", action: "suspend", previousState: "active", currentState: "suspended",
      outcome: "success", affectedCount: 1, occurredAt: "2026-07-28T10:00:00.000Z",
      message: "تم التنفيذ", auditReference: "raw-token",
    }).success).toBe(false);
  });
});

describe("bulk user action contracts", () => {
  test.each([
    [{ action: "export-summary", userIds: ["USR-10482"] }, true],
    [{ action: "suspend", userIds: ["USR-10482"], reason: "مراجعة مطلوبة", durationDays: 3 }, true],
    [{ action: "suspend", userIds: ["USR-10482"], reason: "مراجعة مطلوبة" }, false],
    [{ action: "reactivate", userIds: ["USR-10482"] }, false],
    [{ action: "notification-handoff", userIds: ["USR-10482"], notifyUser: true }, true],
    [{ action: "export-summary", userIds: ["USR-10482", "USR-10482"] }, false],
  ])("validates conditional bulk input %o", (input, accepted) => {
    expect(userBulkActionRequestSchema.safeParse(input).success).toBe(accepted);
  });

  test("enforces bulk count equations and bounded safe failures", () => {
    expect(userBulkActionResultSchema.safeParse({
      requestedCount: 2, eligibleCount: 1, succeededCount: 1, failedCount: 1,
      failures: [{ userId: "USR-10443", code: "ineligible_state", message: "الحالة غير مؤهلة" }],
      auditReference: "AUD-BULK-1",
    }).success).toBe(true);
    expect(userBulkActionResultSchema.safeParse({
      requestedCount: 2, eligibleCount: 1, succeededCount: 1, failedCount: 0,
      failures: [], auditReference: "AUD-BULK-1",
    }).success).toBe(false);
  });
});

describe("adminUsersQuery defaults and bounds", () => {
  test("applies normalized defaults", () => {
    const parsed = adminUsersQuerySchema.parse({});
    expect(parsed.platform).toBe("all");
    expect(parsed.sort).toBe("lastActive");
    expect(parsed.order).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  test("bounds text, page size, and app version", () => {
    expect(adminUsersQuerySchema.safeParse({ query: "x".repeat(101) }).success).toBe(false);
    expect(adminUsersQuerySchema.safeParse({ pageSize: 10 }).success).toBe(false);
    expect(adminUsersQuerySchema.safeParse({ pageSize: 100 }).success).toBe(true);
    expect(adminUsersQuerySchema.safeParse({ appVersion: "x".repeat(33) }).success).toBe(false);
  });

  test("rejects out-of-order date ranges", () => {
    expect(
      adminUsersQuerySchema.safeParse({ registeredFrom: "2026-05-01", registeredTo: "2026-04-01" })
        .success,
    ).toBe(false);
    expect(
      adminUsersQuerySchema.safeParse({
        lastActiveFrom: "2026-07-25T10:00:00+03:00",
        lastActiveTo: "2026-07-25T09:00:00+03:00",
      }).success,
    ).toBe(false);
  });
});

describe("adminUserListItem invariants", () => {
  test("masked email must contain masking", () => {
    const bad = { ...validItem, maskedEmail: "nora@example.test" };
    expect(adminUserListItemSchema.safeParse(bad).success).toBe(false);
  });

  test("registered platforms match device counts", () => {
    const mismatch = { ...validItem, registeredPlatforms: ["ios", "android"], androidDeviceCount: 0 };
    expect(adminUserListItemSchema.safeParse(mismatch).success).toBe(false);
  });

  test("total device count equals ios plus android", () => {
    const bad = { ...validItem, totalDeviceCount: 5 };
    expect(adminUserListItemSchema.safeParse(bad).success).toBe(false);
  });

  test("primary platform must be in registered platforms", () => {
    const bad = { ...validItem, primaryPlatform: "android" };
    expect(adminUserListItemSchema.safeParse(bad).success).toBe(false);
  });

  test("accepts a valid multi-platform item", () => {
    const multi = {
      ...validItem,
      primaryPlatform: "ios",
      registeredPlatforms: ["ios", "android"],
      iosDeviceCount: 1,
      androidDeviceCount: 2,
      totalDeviceCount: 3,
    };
    expect(adminUserListItemSchema.safeParse(multi).success).toBe(true);
  });
});

describe("adminUsersPage invariants", () => {
  const region = { availability: "available" as const };

  test("rejects duplicate user ids within a page", () => {
    const page = {
      items: [validItem, { ...validItem }],
      pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
      uniqueCustomersTotal: 2,
      iosCustomers: 1,
      androidCustomers: 0,
      multiPlatformCustomers: 0,
      region,
    };
    expect(adminUsersPageSchema.safeParse(page).success).toBe(false);
  });

  test("accepts a valid page", () => {
    const page = {
      items: [validItem],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      uniqueCustomersTotal: 1,
      iosCustomers: 1,
      androidCustomers: 0,
      multiPlatformCustomers: 0,
      region,
    };
    expect(adminUsersPageSchema.safeParse(page).success).toBe(true);
  });

  test("rejects inconsistent pagination and platform totals", () => {
    const page = {
      items: [validItem],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 2 },
      uniqueCustomersTotal: 1,
      iosCustomers: 1,
      androidCustomers: 0,
      multiPlatformCustomers: 1,
      region,
    };
    expect(adminUsersPageSchema.safeParse(page).success).toBe(false);
  });

  test("rejects unknown response fields", () => {
    expect(adminUserListItemSchema.safeParse({ ...validItem, fullEmail: "private@example.test" }).success)
      .toBe(false);
  });
});

const profile = {
  id: "USR-10482",
  displayName: "نورة العتيبي",
  maskedEmail: "n***@example.test",
  country: "SA",
  language: "ar",
  currency: "SAR",
  timezone: "Asia/Riyadh",
  registeredAt: "2026-01-11T00:00:00+03:00",
  lastActiveAt: "2026-07-25T08:20:00+03:00",
  lastActivityByPlatform: { ios: "2026-07-25T08:20:00+03:00" },
  status: "active",
  onboardingStatus: "complete",
  verification: "verified",
  risk: {
    level: "low",
    label: "مخاطر منخفضة",
    updatedAt: "2026-07-25T08:15:00+03:00",
    signalsCount: 1,
  },
  primaryPlatform: "ios",
  registeredPlatforms: ["ios"],
  currentPlan: "Premium",
  aggregates: {
    accountsCount: 3,
    transactionsCount: 48,
    goalsCount: 2,
    activeDebtsCount: 1,
    importSourcesCount: 2,
    lastSyncAt: "2026-07-25T08:10:00+03:00",
  },
  region: { availability: "available" },
} as const;

describe("user profile contracts", () => {
  test("validates the route identifier and role context", () => {
    expect(userDetailRequestSchema.safeParse({ userId: "USR-10482", role: "support-agent" }).success)
      .toBe(true);
    expect(userDetailRequestSchema.safeParse({ userId: "../private", role: "support-agent" }).success)
      .toBe(false);
  });

  test("accepts a masked aggregate-only profile", () => {
    expect(userProfileSummarySchema.safeParse(profile).success).toBe(true);
  });

  test.each([
    ["unmasked email", { ...profile, maskedEmail: "noura@example.test" }],
    ["financial amount", { ...profile, balance: 1200 }],
    ["raw transaction", { ...profile, transactions: [{ merchant: "Private" }] }],
    ["unknown platform activity", {
      ...profile,
      lastActivityByPlatform: { ...profile.lastActivityByPlatform, android: profile.lastActiveAt },
    }],
  ])("rejects %s", (_label, candidate) => {
    expect(userProfileSummarySchema.safeParse(candidate).success).toBe(false);
  });
});

const iosDevice = {
  id: "DEV-IOS-10482",
  userId: "USR-10482",
  safeLabel: "iPhone رئيسي",
  platform: "ios",
  osVersion: "18.5",
  appVersion: "4.8.2",
  lastSeenAt: "2026-07-25T08:20:00+03:00",
  pushState: "enabled",
  shortcutState: "enabled",
  shareExtensionState: "disabled",
  smsTrackingState: "not-applicable",
  notificationListenerState: "not-applicable",
  backgroundState: "not-applicable",
  sessionState: "active",
  state: "active",
  revokedAt: null,
} as const;

const androidDevice = {
  ...iosDevice,
  id: "DEV-ANDROID-10482",
  safeLabel: "Android احتياطي",
  platform: "android",
  shortcutState: "not-applicable",
  shareExtensionState: "not-applicable",
  smsTrackingState: "enabled",
  notificationListenerState: "denied",
  backgroundState: "enabled",
} as const;

describe("user device contracts", () => {
  test("accepts platform-applicable capabilities", () => {
    expect(userDeviceSchema.safeParse(iosDevice).success).toBe(true);
    expect(userDeviceSchema.safeParse(androidDevice).success).toBe(true);
  });

  test.each([
    ["iOS Android capability", { ...iosDevice, smsTrackingState: "enabled" }],
    ["Android iOS capability", { ...androidDevice, shortcutState: "enabled" }],
    ["revoked device without timestamp", { ...iosDevice, state: "revoked", revokedAt: null }],
    ["active device with timestamp", { ...iosDevice, revokedAt: "2026-07-25T09:00:00+03:00" }],
    ["prohibited token", { ...iosDevice, pushToken: "redacted" }],
  ])("rejects %s", (_label, candidate) => {
    expect(userDeviceSchema.safeParse(candidate).success).toBe(false);
  });

  test("enforces response counts and the 100-item bound", () => {
    const response = {
      items: [iosDevice, androidDevice],
      iosDeviceCount: 1,
      androidDeviceCount: 1,
      totalDeviceCount: 2,
      activeDeviceCount: 2,
      revokedDeviceCount: 0,
      region: { availability: "available" },
    };
    expect(userDevicesResponseSchema.safeParse(response).success).toBe(true);
    expect(userDevicesResponseSchema.safeParse({ ...response, totalDeviceCount: 3 }).success).toBe(false);
    expect(userDevicesResponseSchema.safeParse({ ...response, items: Array(101).fill(iosDevice) }).success)
      .toBe(false);
  });
});

const activeSession = {
  id: "SES-10482-A",
  userId: "USR-10482",
  deviceId: "DEV-IOS-10482",
  safeDeviceLabel: "iPhone رئيسي",
  platform: "ios",
  coarseRegion: "الرياض، السعودية",
  startedAt: "2026-07-25T07:00:00+03:00",
  lastActivityAt: "2026-07-25T08:20:00+03:00",
  state: "active",
  risk: "low",
  isCurrentAdminVisibleSession: true,
  revokedAt: null,
} as const;

describe("user session contracts", () => {
  test("accepts a sanitized coarse-region session", () => {
    expect(userSessionSchema.safeParse(activeSession).success).toBe(true);
  });

  test.each([
    ["activity before start", { ...activeSession, lastActivityAt: "2026-07-25T06:00:00+03:00" }],
    ["revoked without timestamp", { ...activeSession, state: "revoked", revokedAt: null }],
    ["active with revoked timestamp", { ...activeSession, revokedAt: "2026-07-25T09:00:00+03:00" }],
    ["raw IP", { ...activeSession, ipAddress: "redacted" }],
    ["token", { ...activeSession, token: "redacted" }],
  ])("rejects %s", (_label, candidate) => {
    expect(userSessionSchema.safeParse(candidate).success).toBe(false);
  });

  test("enforces state counts and the 100-item bound", () => {
    const response = {
      items: [activeSession],
      activeCount: 1,
      expiredCount: 0,
      revokedCount: 0,
      region: { availability: "available" },
    };
    expect(userSessionsResponseSchema.safeParse(response).success).toBe(true);
    expect(userSessionsResponseSchema.safeParse({ ...response, activeCount: 0 }).success).toBe(false);
    expect(userSessionsResponseSchema.safeParse({ ...response, items: Array(101).fill(activeSession) }).success)
      .toBe(false);
  });
});
