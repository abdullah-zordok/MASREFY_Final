import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { mockServer } from "@/mocks/server";
import { usersRepository } from "./repository";

describe("users repository", () => {
  test("normalizes defaults and returns the typed pagination envelope", async () => {
    const page = await usersRepository.getUsers({});
    expect(page.pagination).toMatchObject({ page: 1, pageSize: 25, totalItems: 8, totalPages: 1 });
    expect(page.uniqueCustomersTotal).toBe(8);
    expect(new Set(page.items.map(({ id }) => id)).size).toBe(page.items.length);
  });

  test("supports every customer discovery filter", async () => {
    const queries = [
      { query: "USR-10461" }, { status: "suspended" as const }, { plan: "Premium" as const },
      { country: "AE" as const }, { language: "en" as const }, { registeredFrom: "2026-07-01" },
      { lastActiveTo: "2026-07-18T02:00:00+03:00" }, { platform: "multi" as const },
      { appVersion: "4.7.8" }, { verification: "pending" as const }, { risk: "high" as const },
    ];
    for (const query of queries) {
      const page = await usersRepository.getUsers(query);
      expect(page.items.length, JSON.stringify(query)).toBeGreaterThan(0);
    }
  });

  test("sorts and paginates deterministically", async () => {
    const first = await usersRepository.getUsers({ sort: "name", order: "asc", page: 1, pageSize: 25 });
    const second = await usersRepository.getUsers({ sort: "name", order: "desc", page: 1, pageSize: 25 });
    expect(first.items[0].id).not.toBe(second.items[0].id);
  });

  test("returns authoritative overlapping platform totals", async () => {
    const page = await usersRepository.getUsers({});
    expect(page.iosCustomers).toBe(5);
    expect(page.androidCustomers).toBe(5);
    expect(page.multiPlatformCustomers).toBe(2);
    expect(page.uniqueCustomersTotal).toBe(8);
    expect(page.uniqueCustomersTotal).not.toBe(page.iosCustomers + page.androidCustomers);
  });

  test("rejects an unsafe response", async () => {
    mockServer.use(http.get("/api/v1/admin/users", () => HttpResponse.json({
      items: [{ id: "USR-1", displayName: "Unsafe", maskedEmail: "unsafe@example.test" }],
    })));
    await expect(usersRepository.getUsers({})).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test.each([
    ["forbidden", "forbidden", 403],
    ["rate-limited", "rate_limited", 429],
    ["internal-error", "internal_error", 500],
  ])("maps %s safely", async (scenario, code, status) => {
    await expect(usersRepository.getUsers({ scenario })).rejects.toMatchObject({ code, status });
  });

  test("supports an explicit empty scenario", async () => {
    const page = await usersRepository.getUsers({ scenario: "empty" });
    expect(page).toMatchObject({
      items: [],
      pagination: { totalItems: 0, totalPages: 0 },
      region: { availability: "empty" },
    });
  });

  test("enforces users.read for simulated roles", async () => {
    await expect(usersRepository.getUsers({ role: "billing-operator" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });
});

describe("user detail repository", () => {
  test("returns independently parsed profile, devices, and sessions", async () => {
    const request = { userId: "USR-10482", role: "support-agent" as const };
    const [profile, devices, sessions] = await Promise.all([
      usersRepository.getUser(request),
      usersRepository.getDevices(request),
      usersRepository.getSessions(request),
    ]);
    expect(profile).toMatchObject({ id: request.userId, maskedEmail: "n***@example.test" });
    expect(devices).toMatchObject({ iosDeviceCount: 2, androidDeviceCount: 0, totalDeviceCount: 2 });
    expect(sessions.activeCount + sessions.expiredCount + sessions.revokedCount).toBe(sessions.items.length);
  });

  test.each([
    ["profile", "/api/v1/admin/users/USR-10482", () => usersRepository.getUser({ userId: "USR-10482" })],
    ["devices", "/api/v1/admin/users/USR-10482/devices", () => usersRepository.getDevices({ userId: "USR-10482" })],
    ["sessions", "/api/v1/admin/users/USR-10482/sessions", () => usersRepository.getSessions({ userId: "USR-10482" })],
  ])("rejects an unsafe %s response", async (_region, path, readRegion) => {
    mockServer.use(http.get(path, () => HttpResponse.json({ unexpectedPrivateField: "redacted" })));
    await expect(readRegion()).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("keeps empty and partial region scenarios independent", async () => {
    const devices = await usersRepository.getDevices({ userId: "USR-10482", scenario: "empty" });
    const sessions = await usersRepository.getSessions({ userId: "USR-10482", scenario: "partial" });
    const profile = await usersRepository.getUser({ userId: "USR-10482" });
    expect(devices).toMatchObject({ items: [], totalDeviceCount: 0, region: { availability: "empty" } });
    expect(sessions.region.availability).toBe("partial");
    expect(profile.region.availability).toBe("available");
  });

  test.each([
    ["getUser", () => usersRepository.getUser({ userId: "USR-40400" }), "not_found", 404],
    ["getDevices", () => usersRepository.getDevices({ userId: "USR-10482", role: "billing-operator" }), "forbidden", 403],
    ["getSessions", () => usersRepository.getSessions({ userId: "USR-10482", scenario: "unavailable" }), "provider_unavailable", 503],
  ])("maps %s failures safely", async (_method, readRegion, code, status) => {
    await expect(readRegion()).rejects.toMatchObject({ code, status });
  });
});

describe("controlled user action repository", () => {
  test("applies valid actions and parses safe audit results", async () => {
    const suspended = await usersRepository.suspendUser("USR-10482", {
      reason: "مراجعة أمنية", durationDays: 3, internalNote: "", notifyUser: false,
    }, "super-admin");
    expect(suspended).toMatchObject({
      userId: "USR-10482", action: "suspend", previousState: "active", currentState: "suspended",
    });
    expect(suspended.auditReference).toMatch(/^AUD-/);

    const revoked = await usersRepository.revokeSessions("USR-10482", {
      scope: "selected", sessionIds: ["SES-10482-A"], reason: "إنهاء الجلسة",
    }, "support-agent");
    expect(revoked).toMatchObject({ affectedCount: 1, outcome: "success" });
  });

  test("enforces granular permission and stale-state conflicts", async () => {
    await expect(usersRepository.revokeDevice("USR-10482", "DEV-IOS-10482-A", {
      reason: "جهاز غير موثوق",
    }, "support-agent")).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(usersRepository.reactivateUser("USR-10482", {
      reason: "مراجعة مكتملة", internalNote: "",
    }, "super-admin")).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  test("keeps bulk scope explicit and reports partial outcomes", async () => {
    const result = await usersRepository.runBulkAction({
      action: "suspend",
      userIds: ["USR-10482", "USR-10443"],
      reason: "مراجعة جماعية",
      durationDays: 2,
    }, "super-admin");
    expect(result).toMatchObject({
      requestedCount: 2, eligibleCount: 1, succeededCount: 1, failedCount: 1,
    });
    expect(result.failures[0]).toMatchObject({ userId: "USR-10443", code: "ineligible_state" });
  });
});
