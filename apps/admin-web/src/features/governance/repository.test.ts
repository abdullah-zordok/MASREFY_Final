import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { mockServer } from "@/mocks/server";
import { governanceRepository } from "./repository";

const liveId = "13000000-0000-4000-8000-000000000001";
const liveAt = "2026-09-10T08:00:00.000Z";

describe("US1 governance repository", () => {
  test("lists admins, details, and invitations through strict safe responses", async () => {
    await expect(governanceRepository.listAdminUsers({ page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: "ADM-DEMO-SUPER-01" })]) });
    await expect(governanceRepository.getAdminUser("ADM-DEMO-SECURITY-02"))
      .resolves.toMatchObject({ id: "ADM-DEMO-SECURITY-02", assignedTickets: { openCount: 2 } });
    await expect(governanceRepository.listAdminInvitations({ page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ status: "pending" })]) });
  });

  test("creates pending invitations and rejects duplicate normalized emails safely", async () => {
    await expect(governanceRepository.inviteAdmin({
      email: "Repo.Admin@Example.Test",
      name: "Repo Admin",
      roleId: "ROLE-DEMO-SUPPORT",
      department: "Support",
      expiryDays: 7,
      message: "Welcome through a repository test.",
      submissionKey: "SUB-DEMO-REPO-INVITE",
    })).resolves.toMatchObject({ invitation: { status: "pending", maskedEmail: "r***@example.test" } });

    await expect(governanceRepository.inviteAdmin({
      email: "repo.admin@example.test",
      name: "Repo Admin Duplicate",
      roleId: "ROLE-DEMO-SUPPORT",
      department: "Support",
      expiryDays: 7,
      submissionKey: "SUB-DEMO-REPO-DUPLICATE",
    })).rejects.toMatchObject({ status: 409 });
  });

  test("assigns roles, revokes sessions, disables admins, and protects permission/privacy cases", async () => {
    await expect(governanceRepository.assignAdminRoles("ADM-DEMO-SUPPORT-03", {
      adminId: "ADM-DEMO-SUPPORT-03",
      roleIds: ["ROLE-DEMO-SECURITY"],
      reason: "Repository role assignment with version guard.",
      expectedVersion: 1,
      submissionKey: "SUB-DEMO-REPO-ASSIGN",
    })).resolves.toMatchObject({ admin: { version: 2 } });

    await expect(governanceRepository.revokeAdminSessions("ADM-DEMO-SUPPORT-03", {
      adminId: "ADM-DEMO-SUPPORT-03",
      sessionIds: ["ASES-DEMO-SUPPORT-03"],
      revokeAllEligible: false,
      reason: "Repository session revoke with version guard.",
      expectedVersion: 2,
      submissionKey: "SUB-DEMO-REPO-REVOKE",
    })).resolves.toMatchObject({ revokedSessionIds: ["ASES-DEMO-SUPPORT-03"] });

    await expect(governanceRepository.disableAdmin("ADM-DEMO-SECURITY-02", {
      adminId: "ADM-DEMO-SECURITY-02",
      reason: "Repository disable with replacement selection.",
      revokeEligibleSessions: true,
      replacementAdminId: "ADM-DEMO-SUPPORT-03",
      expectedStatus: "active",
      expectedVersion: 1,
      submissionKey: "SUB-DEMO-REPO-DISABLE",
    })).resolves.toMatchObject({ admin: { status: "disabled" } });

    await expect(governanceRepository.getAdminUser("ADM-DEMO-MISSING-99")).rejects.toMatchObject({ status: 404 });
    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");
    await expect(governanceRepository.listAdminUsers({ page: 1, pageSize: 25 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("US2 role repository", () => {
  test("lists, reads, creates, updates roles, and reads permission matrix", async () => {
    await expect(governanceRepository.listRoles({ page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: "ROLE-DEMO-SUPER", kind: "system" })]) });
    await expect(governanceRepository.getRole("ROLE-DEMO-CUSTOM-RISK"))
      .resolves.toMatchObject({ kind: "custom", assignmentCount: 0 });
    await expect(governanceRepository.getRole("ROLE-DEMO-CUSTOM-01"))
      .resolves.toMatchObject({ id: "ROLE-DEMO-CUSTOM-RISK", kind: "custom" });
    await expect(governanceRepository.getPermissionMatrix({ page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ permissionCount: expect.any(Number) });

    const created = await governanceRepository.createRole({
      key: "repository-reviewer",
      name: { ar: "Repository Reviewer", en: "Repository Reviewer" },
      description: "Repository-created least privilege role.",
      permissionKeys: ["admin-team.read"],
      reason: "Create role through repository test.",
      submissionKey: "SUB-DEMO-REPO-ROLE-CREATE",
    }) as { role: { id: string; version: number } };
    expect(created.role.version).toBe(1);
    await expect(governanceRepository.updateRole(created.role.id, {
      status: "disabled",
      reason: "Disable unassigned repository role.",
      expectedVersion: 1,
      submissionKey: "SUB-DEMO-REPO-ROLE-DISABLE",
    })).resolves.toMatchObject({ role: { status: "disabled" } });
  });

  test("protects role permissions, immutable system roles, stale versions, and duplicate keys", async () => {
    await expect(governanceRepository.updateRole("ROLE-DEMO-SUPER", {
      status: "disabled",
      reason: "System role mutation must be rejected.",
      expectedVersion: 1,
      submissionKey: "SUB-DEMO-REPO-SYSTEM",
    })).rejects.toMatchObject({ status: 409 });

    await expect(governanceRepository.createRole({
      key: "risk-reviewer",
      name: { ar: "Duplicate", en: "Duplicate" },
      description: "Duplicate custom role key rejected.",
      permissionKeys: ["admin-team.read"],
      reason: "Duplicate role key should fail safely.",
      submissionKey: "SUB-DEMO-REPO-ROLE-DUPE",
    })).rejects.toMatchObject({ status: 409 });

    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    await expect(governanceRepository.listRoles({ page: 1, pageSize: 25 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("US3 settings repository", () => {
  test("gets and atomically updates six settings groups", async () => {
    for (const group of ["general", "mobile", "imports", "ai", "subscriptions", "security"] as const) {
      await expect(governanceRepository.getSettingsGroup(group)).resolves.toMatchObject({ group, version: 1 });
    }
    await expect(governanceRepository.updateSettingsGroup("mobile", {
      expectedVersion: 1,
      changes: { forceUpdate: true },
      reason: "Repository changed-fields-only settings update.",
      submissionKey: "SUB-DEMO-REPO-SETTINGS-MOBILE",
    })).resolves.toMatchObject({ group: "mobile", version: 2, values: { forceUpdate: true } });
  });

  test("rejects invalid group, stale settings, invalid payload, and unauthorized reads safely", async () => {
    expect(() => governanceRepository.getSettingsGroup("unknown")).toThrow();
    await expect(governanceRepository.updateSettingsGroup("security", {
      expectedVersion: 9,
      changes: { sessionMinutes: 90 },
      reason: "Stale settings update should be rejected.",
      submissionKey: "SUB-DEMO-REPO-SETTINGS-STALE",
    })).rejects.toMatchObject({ status: 409 });
    await expect(governanceRepository.updateSettingsGroup("security", {
      expectedVersion: 1,
      changes: { riskThresholds: { low: 90, medium: 50, high: 80 } },
      reason: "Invalid thresholds should be rejected.",
      submissionKey: "SUB-DEMO-REPO-SETTINGS-INVALID",
    })).rejects.toMatchObject({ status: 400 });
    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    await expect(governanceRepository.getSettingsGroup("security")).rejects.toMatchObject({ status: 403 });
  });
});

describe("US4 flag and maintenance repository", () => {
  test("lists and updates feature flags and maintenance", async () => {
    await expect(governanceRepository.listFeatureFlags({ page: 1, pageSize: 25 }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: "FLAG-DEMO-IOS-SHORTCUT" })]) });
    await expect(governanceRepository.updateFeatureFlag("FLAG-DEMO-IOS-SHORTCUT", {
      audience: "all_customers",
      rolloutPercent: 30,
      expectedVersion: 1,
      reason: "Repository flag update.",
      submissionKey: "SUB-DEMO-REPO-FLAG",
    })).resolves.toMatchObject({ flag: { rolloutPercent: 30 } });
    await expect(governanceRepository.getMaintenance()).resolves.toMatchObject({ state: "off", mockOnly: true });
    await expect(governanceRepository.updateMaintenance({
      nextState: "scheduled",
      message: { ar: "Scheduled maintenance", en: "Scheduled maintenance" },
      startsAt: "2026-08-02T12:00:00+03:00",
      endsAt: "2026-08-02T13:00:00+03:00",
      expectedVersion: 1,
      reason: "Schedule maintenance through repository.",
      submissionKey: "SUB-DEMO-REPO-MAINTENANCE",
    })).resolves.toMatchObject({ maintenance: { state: "scheduled" } });
  });

  test("rejects ended flags and invalid maintenance transitions", async () => {
    await expect(governanceRepository.updateFeatureFlag("FLAG-DEMO-ENDED", {
      rolloutPercent: 90,
      expectedVersion: 1,
      reason: "Ended flags are read-only.",
      submissionKey: "SUB-DEMO-REPO-FLAG-ENDED",
    })).rejects.toMatchObject({ status: 409 });
    await expect(governanceRepository.updateMaintenance({
      nextState: "off",
      message: { ar: "Already off", en: "Already off" },
      expectedVersion: 1,
      reason: "Off to off is rejected.",
      submissionKey: "SUB-DEMO-REPO-MAINTENANCE-OFF",
    })).rejects.toMatchObject({ status: 409 });
  });
});

describe("BE013 exact live governance mapping", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  test("preserves redaction and sends every setting value field", async () => {
    let body: unknown;
    mockServer.use(
      http.get("/api/v1/admin/settings/operations.history.retention_days", () =>
        HttpResponse.json({
          key: "operations.history.retention_days",
          sensitivity: "restricted",
          redacted: true,
          version: 4,
          updatedAt: liveAt,
        }),
      ),
      http.patch("/api/v1/admin/settings/operations.history.retention_days", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ resourceId: "operations.history.retention_days", status: "updated", version: 5 });
      }),
    );

    await expect(governanceRepository.getSettingsGroup("general")).resolves.toMatchObject({
      values: { settingKey: "operations.history.retention_days", redacted: true, value: null },
    });
    await governanceRepository.updateSettingsGroup("general", {
      expectedVersion: 4,
      changes: { minimumDays: 30, maximumDays: 365 },
      reason: "Update the complete bounded retention configuration.",
      submissionKey: "phase13-settings-fields",
    });
    expect(body).toEqual({
      value: { minimumDays: 30, maximumDays: 365 },
      expectedVersion: 4,
      reason: "Update the complete bounded retention configuration.",
    });
  });

  test("keeps one-percent cohorts and targeting rules exact", async () => {
    let body: unknown;
    const flag = {
      id: liveId,
      key: "mobile.safe-demo",
      description: "Safe bounded mobile rollout",
      defaultEnabled: false,
      status: "active",
      rules: [
        { id: "13000000-0000-4000-8000-000000000002", priority: 1, audience: { platform: "ios" }, enabled: true, version: 1 },
        { id: "13000000-0000-4000-8000-000000000003", priority: 800, audience: { cohort: "percent-00" }, enabled: true, version: 1 },
      ],
      version: 7,
    };
    mockServer.use(
      http.get("/api/v1/admin/feature-flags", () => HttpResponse.json({ items: [flag], nextCursor: null })),
      http.patch("/api/v1/admin/feature-flags/mobile.safe-demo", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ resourceId: "mobile.safe-demo", status: "updated", version: 8 });
      }),
    );

    const page = await governanceRepository.listFeatureFlags({ page: 1, pageSize: 25 });
    expect(page).toMatchObject({ items: [{ rolloutPercent: 1, updatedAt: null, targetingRules: expect.arrayContaining([expect.objectContaining({ audience: { platform: "ios" } })]) }] });
    await governanceRepository.updateFeatureFlag("mobile.safe-demo", {
      rolloutPercent: 2,
      expectedVersion: 7,
      reason: "Advance the stable bounded cohort after review.",
      submissionKey: "phase13-flag-percent",
    });
    expect(body).toMatchObject({ defaultEnabled: false, expectedVersion: 7 });
    const rules = (body as { rules: Array<{ audience: Record<string, string> }> }).rules;
    expect(rules.filter((rule) => rule.audience.platform === "ios")).toHaveLength(1);
    expect(rules.filter((rule) => percentageRule(rule.audience.cohort))).toHaveLength(2);
  });

  test("selects only active or scheduled maintenance and preserves canonical edits", async () => {
    let body: unknown;
    const scheduled = {
      id: liveId,
      startsAt: liveAt,
      endsAt: "2026-09-10T09:00:00.000Z",
      scopes: ["api", "database"],
      message: { ar: "صيانة مجدولة", en: "Scheduled maintenance" },
      status: "scheduled",
      version: 3,
    };
    mockServer.use(
      http.get("/api/v1/admin/maintenance", () => HttpResponse.json({
        items: [{ ...scheduled, id: "13000000-0000-4000-8000-000000000009", status: "completed" }, scheduled],
        nextCursor: null,
      })),
      http.patch(`/api/v1/admin/maintenance/${liveId}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ resourceId: liveId, status: "updated", version: 4 });
      }),
    );

    await expect(governanceRepository.getMaintenance()).resolves.toMatchObject({
      state: "scheduled",
      startsAt: liveAt,
      updatedAt: null,
    });
    await governanceRepository.updateMaintenance({
      nextState: "active",
      message: { ar: "صيانة جارية", en: "Maintenance active" },
      startsAt: liveAt,
      endsAt: "2026-09-10T09:30:00.000Z",
      expectedVersion: 3,
      reason: "Activate the reviewed maintenance window now.",
      submissionKey: "phase13-maintenance-edit",
    });
    expect(body).toEqual({
      status: "active",
      startsAt: liveAt,
      endsAt: "2026-09-10T09:30:00.000Z",
      message: { ar: "صيانة جارية", en: "Maintenance active" },
      expectedVersion: 3,
      reason: "Activate the reviewed maintenance window now.",
    });
  });
});

describe("BE003 exact live access governance mapping", () => {
  const roleId = "23000000-0000-4000-8000-000000000001";
  const permissionId = "23000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  test("uses exact access routes and preserves role and permission values", async () => {
    let roleCalls = 0;
    let permissionCalls = 0;
    mockServer.use(
      http.get("/api/v1/admin/access/roles", ({ request }) => {
        roleCalls += 1;
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor
          ? { items: [{ id: roleId, key: "operations-reviewer", name: "Operations reviewer", description: null, systemRole: false, enabled: true, permissionKeys: ["operations.incidents.read"], assignmentCount: 2, version: 4 }], nextCursor: null }
          : { items: [], nextCursor: "roles-page-2" });
      }),
      http.get("/api/v1/admin/access/permissions", ({ request }) => {
        permissionCalls += 1;
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor
          ? { items: [{ id: permissionId, key: "operations.incidents.read", resource: "operations.incidents", action: "read", description: null }], nextCursor: null, manifestHash: "sha256:permissions" }
          : { items: [], nextCursor: "permissions-page-2", manifestHash: "sha256:permissions" });
      }),
    );

    await expect(governanceRepository.listRoles({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      total: 1,
      items: [{ id: roleId, key: "operations-reviewer", description: null, systemRole: false, enabled: true, permissionKeys: ["operations.incidents.read"], assignmentCount: 2, version: 4 }],
    });
    await expect(governanceRepository.getPermissionMatrix({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      total: 1,
      items: [{ id: permissionId, key: "operations.incidents.read", resource: "operations.incidents", action: "read", description: null }],
    });
    expect(roleCalls).toBe(2);
    expect(permissionCalls).toBe(2);
  });

  test("combines invite permission with the exact BE003 body and automatic idempotency header", async () => {
    let body: unknown;
    let idempotencyKey: string | null = null;
    mockServer.use(
      http.post("/api/v1/admin/access/invitations", async ({ request }) => {
        body = await request.json();
        idempotencyKey = request.headers.get("idempotency-key");
        return HttpResponse.json({ id: "23000000-0000-4000-8000-000000000003", emailMasked: "o***@example.test", roleId, department: "Operations", status: "pending", expiresAt: "2026-09-17T08:00:00.000Z", version: 1 }, { status: 201 });
      }),
    );

    await governanceRepository.inviteAdmin({
      email: "operator@example.test",
      name: "Operations Reviewer",
      roleId,
      department: "Operations",
      expiryDays: 7,
      message: "Review operations incidents.",
      submissionKey: "phase14-live-invite",
    });
    expect(body).toEqual({
      email: "operator@example.test",
      name: "Operations Reviewer",
      roleId,
      department: "Operations",
      expiresInHours: 168,
      message: "Review operations incidents.",
    });
    expect(idempotencyKey).toBeTruthy();
  });
});

function percentageRule(value: string | undefined): boolean {
  return /^percent-(?:0\d|[1-9]\d)$/u.test(value ?? "");
}
