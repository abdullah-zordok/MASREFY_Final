import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { mockServer } from "@/mocks/server";
import { foundationRepository } from "./repository";

describe("foundation repository", () => {
  test("parses the authoritative Admin self-context contract", async () => {
    mockServer.use(
      http.get("/api/v1/admin/access/me", () =>
        HttpResponse.json({
          id: "user_admin_001",
          displayName: "Waleed",
          roleKeys: ["super-admin"],
          effectivePermissionKeys: [
            "admin.overview.read",
            "users.read",
            "imports.read",
            "system-health.read",
            "global-search.use",
            "attention.read",
          ],
          mfaStatus: "enabled",
          activeSessionCount: 2,
          version: 3,
        }),
      ),
    );

    await expect(foundationRepository.getSession()).resolves.toMatchObject({
      id: "user_admin_001",
      roleKeys: ["super-admin"],
      activeSessionCount: 2,
    });
  });

  test("rejects malformed responses with a safe validation error", async () => {
    mockServer.use(
      http.get("/api/v1/admin/access/me", () => HttpResponse.json({ displayName: "unsafe incomplete" })),
    );

    await expect(foundationRepository.getSession()).rejects.toMatchObject({
      code: "contract_mismatch",
      status: 502,
    });
  });

  test("orders attention by severity, recency, and id while filtering by platform and permission", async () => {
    const result = await foundationRepository.getAttention("super-admin", {
      platform: "android",
      period: "30d",
      page: 1,
      pageSize: 10,
    });

    expect(result.items.every((item) => ["android", "global", "all"].includes(item.platformScope))).toBe(true);
    expect(result.items.map((item) => item.severity).slice(0, 3)).toEqual([
      "critical",
      "critical",
      "high",
    ]);
  });

  test("removes attention destinations the role cannot open", async () => {
    const result = await foundationRepository.getAttention("billing-operator", {
      platform: "all",
      period: "30d",
      page: 1,
      pageSize: 10,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.permission === "attention.read")).toBe(true);
    expect(result.items.every((item) => item.destination === undefined)).toBe(true);
  });

  test("returns ten exact attention event types with governance targets projected by role", async () => {
    const result = await foundationRepository.getAttention("super-admin", {
      platform: "all",
      period: "30d",
      page: 1,
      pageSize: 25,
    });
    const types = new Set(result.items.map((item) => item.type));
    expect(types).toEqual(new Set([
      "incident",
      "payment",
      "import",
      "ai-provider",
      "queue",
      "security",
      "account-deletion",
      "support",
      "admin-governance",
      "settings",
    ]));
    expect(result.items.find((item) => item.type === "admin-governance")?.destination).toBe("/admin/admin-team");
  });

  test("omits navigation entries denied to the simulated role", async () => {
    const navigation = await foundationRepository.getNavigation("billing-operator");
    const itemIds = navigation.groups.flatMap((group) => group.items.map((item) => item.id));

    // Billing operator should see billing-related items but not users/access/imports
    expect(itemIds).toContain("subscriptions");
    expect(itemIds).toContain("payments");
    expect(itemIds).not.toContain("users");
    expect(itemIds).not.toContain("access-requests");
    expect(itemIds).not.toContain("imports");
  });

  test("returns exactly the Spec 010 global search groups for authorized results", async () => {
    const result = await foundationRepository.search("super-admin", {
      query: "demo",
      page: 1,
      pageSize: 25,
    });

    expect(new Set(result.items.map((item) => item.entityType))).toEqual(new Set([
      "navigation",
      "user",
      "subscription",
      "payment_event",
      "import",
      "support_ticket",
      "audit_event",
      "job",
      "parser_rule",
      "bank",
      "admin_user",
    ]));
  });
});
