import { describe, expect, test } from "vitest";
import { ADMIN_ROLES, PERMISSION_KEYS } from "./permissions";
import { hasPermission } from "./role-map";

const PHASE9_PERMISSIONS = [
  "admin-team.read",
  "admin-team.invite",
  "admin-team.disable",
  "admin-team.sessions.revoke",
  "admin-team.roles.assign",
  "roles.read",
  "roles.manage",
  "permissions.read",
  "permissions.manage",
  "settings.general.read",
  "settings.general.manage",
  "settings.mobile.read",
  "settings.mobile.manage",
  "settings.flags.read",
  "settings.flags.manage",
  "settings.imports.read",
  "settings.imports.manage",
  "settings.ai.read",
  "settings.ai.manage",
  "settings.subscriptions.read",
  "settings.subscriptions.manage",
  "settings.security.read",
  "settings.security.manage",
  "settings.maintenance.read",
  "settings.maintenance.manage",
] as const;

const SECURITY_ADMINISTRATOR_PHASE9_PERMISSIONS = [
  "admin-team.read",
  "roles.read",
  "permissions.read",
  "settings.security.read",
  "settings.security.manage",
  "settings.maintenance.read",
] as const;

describe("Spec 010 role matrix", () => {
  test("defines every Phase 9 permission key exactly once", () => {
    for (const permission of PHASE9_PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(permission);
    }
    expect(new Set(PHASE9_PERMISSIONS).size).toBe(PHASE9_PERMISSIONS.length);
  });

  test("keeps the seven established switcher roles", () => {
    expect(ADMIN_ROLES).toEqual([
      "super-admin",
      "support-agent",
      "billing-operator",
      "import-operator",
      "ai-operator",
      "content-manager",
      "security-administrator",
    ]);
  });

  test("Super Admin receives every Phase 9 permission", () => {
    for (const permission of PHASE9_PERMISSIONS) {
      expect(hasPermission("super-admin", permission)).toBe(true);
    }
  });

  test("Security Administrator receives only the documented Phase 9 subset", () => {
    for (const permission of PHASE9_PERMISSIONS) {
      expect(hasPermission("security-administrator", permission)).toBe(
        (SECURITY_ADMINISTRATOR_PHASE9_PERMISSIONS as readonly string[]).includes(permission),
      );
    }
  });

  test.each(["support-agent", "billing-operator", "import-operator", "ai-operator", "content-manager"] as const)(
    "%s receives no Phase 9 governance permission",
    (role) => {
      for (const permission of PHASE9_PERMISSIONS) {
        expect(hasPermission(role, permission)).toBe(false);
      }
    },
  );

  test("evaluates canonical access aliases without expanding the client manifest", () => {
    expect(hasPermission("super-admin", "access.invites.write")).toBe(true);
    expect(hasPermission("security-administrator", "access.roles.read")).toBe(true);
    expect(hasPermission("security-administrator", "access.roles.write")).toBe(false);
    expect(hasPermission("support-agent", "access.assignments.write")).toBe(false);
  });

  test("keeps backend-only operations permissions super-admin-only", () => {
    expect(hasPermission("super-admin", "operations.jobs.manage")).toBe(true);
    expect(hasPermission("security-administrator", "operations.jobs.manage")).toBe(false);
    expect(hasPermission("super-admin", "operations.billing.read")).toBe(false);
  });
});
