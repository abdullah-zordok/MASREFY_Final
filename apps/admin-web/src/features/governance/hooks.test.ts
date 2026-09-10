import { describe, expect, test } from "vitest";
import { configureApiActorProvider } from "@/core/api/client";
import { governanceMutationLockKeys, governanceQueryKeys } from "./hooks";

describe("US1 governance hooks", () => {
  test("uses role and version relevant admin query keys", () => {
    expect(governanceQueryKeys.adminUsers({ role: "super-admin", page: 1, pageSize: 25, search: "Salem" }))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "admin-users", { page: 1, pageSize: 25 }, "Salem"]);
    expect(governanceQueryKeys.adminUser("security-administrator", "ADM-DEMO-SECURITY-02"))
      .toEqual(["phase9-governance", "test-admin-actor", "security-administrator", "admin-user", "ADM-DEMO-SECURITY-02"]);
    expect(governanceQueryKeys.adminInvitations({ role: "super-admin", page: 1, pageSize: 25 }))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "admin-invitations", { page: 1, pageSize: 25 }, ""]);
  });

  test("uses locked mutation keys for every admin-team mutation", () => {
    expect(governanceMutationLockKeys.admin("invite", "new")).toBe("governance:admin:invite:new");
    expect(governanceMutationLockKeys.admin("assign-roles", "ADM-DEMO-SUPPORT-03"))
      .toBe("governance:admin:assign-roles:ADM-DEMO-SUPPORT-03");
    expect(governanceMutationLockKeys.admin("revoke-sessions", "ADM-DEMO-SUPPORT-03"))
      .toBe("governance:admin:revoke-sessions:ADM-DEMO-SUPPORT-03");
    expect(governanceMutationLockKeys.admin("disable", "ADM-DEMO-SUPPORT-03"))
      .toBe("governance:admin:disable:ADM-DEMO-SUPPORT-03");
  });
});

describe("US2 role hooks", () => {
  test("uses role list/detail/matrix keys and mutation locks", () => {
    expect(governanceQueryKeys.roles({ role: "super-admin", page: 1, pageSize: 25, search: "risk" }))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "roles", { page: 1, pageSize: 25 }, "risk"]);
    expect(governanceQueryKeys.role("super-admin", "ROLE-DEMO-CUSTOM-RISK"))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "role", "ROLE-DEMO-CUSTOM-RISK"]);
    expect(governanceQueryKeys.permissionMatrix("security-administrator"))
      .toEqual(["phase9-governance", "test-admin-actor", "security-administrator", "permission-matrix"]);
    expect(governanceMutationLockKeys.role("create", "new")).toBe("governance:role:create:new");
    expect(governanceMutationLockKeys.role("update", "ROLE-DEMO-CUSTOM-RISK")).toBe("governance:role:update:ROLE-DEMO-CUSTOM-RISK");
  });
});

describe("US3 settings hooks", () => {
  test("uses group-scoped query keys and mutation locks", () => {
    expect(governanceQueryKeys.settingsGroup("super-admin", "security"))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "settings", "security"]);
    expect(governanceMutationLockKeys.settings("mobile")).toBe("governance:settings:mobile");
  });
});

describe("US4 flag and maintenance hooks", () => {
  test("uses entity scoped keys and locks", () => {
    expect(governanceQueryKeys.featureFlags({ role: "super-admin", page: 1, pageSize: 25 }))
      .toEqual(["phase9-governance", "test-admin-actor", "super-admin", "feature-flags", { page: 1, pageSize: 25 }, ""]);
    expect(governanceQueryKeys.maintenance("super-admin")).toEqual(["phase9-governance", "test-admin-actor", "super-admin", "maintenance"]);
    expect(governanceMutationLockKeys.flag("FLAG-DEMO-IOS-SHORTCUT")).toBe("governance:flag:FLAG-DEMO-IOS-SHORTCUT");
    expect(governanceMutationLockKeys.maintenance()).toBe("governance:maintenance");
  });

  test("partitions live cache keys by verified actor", () => {
    configureApiActorProvider(() => "admin-a");
    const first = governanceQueryKeys.maintenance("super-admin");
    configureApiActorProvider(() => "admin-b");
    const second = governanceQueryKeys.maintenance("super-admin");
    configureApiActorProvider(() => "test-admin-actor");
    expect(first).not.toEqual(second);
  });
});
