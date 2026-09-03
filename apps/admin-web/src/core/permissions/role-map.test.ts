import { describe, expect, test } from "vitest";
import {
  ADMIN_ROLES,
  PERMISSION_KEYS,
  type AdminRole,
  type PermissionKey,
} from "./permissions";
import { SIMULATED_ACTORS, hasPermission, permissionsByRole } from "./role-map";

const routePermissions: Record<AdminRole, PermissionKey[]> = {
  "super-admin": ["admin.overview.read", "users.read", "imports.read", "system-health.read"],
  "support-agent": ["admin.overview.read", "users.read", "imports.read"],
  "billing-operator": ["admin.overview.read"],
  "import-operator": ["admin.overview.read", "imports.read"],
  "ai-operator": ["admin.overview.read"],
  "content-manager": ["admin.overview.read"],
  "security-administrator": [
    "admin.overview.read",
    "users.read",
    "imports.read",
    "system-health.read",
  ],
};

const SPEC_005_PERMISSIONS: PermissionKey[] = [
  "imports.read",
  "imports.detail.read", 
  "imports.failures.manage",
  "imports.confidence.manage",
  "imports.duplicates.manage",
  "imports.unsupported.manage",
  "parsers.coverage.read",
  "parsers.senders.manage",
  "parsers.rules.read",
  "parsers.rules.manage",
  "parsers.tests.run",
  "parsers.versions.manage",
  "parsers.merchants.manage",
  "parsers.categories.manage",
];

const SPEC_006_PERMISSIONS: PermissionKey[] = [
  "ai.overview.read",
  "ai.providers.read",
  "ai.providers.manage",
  "ai.routes.read",
  "ai.routes.manage",
  "ai.models.read",
  "ai.models.manage",
  "ai.prompts.read",
  "ai.prompts.manage",
  "ai.prompts.publish",
  "ai.usage.read",
  "ai.operations.manage",
  "ai.failures.manage",
  "ai.reports.manage",
  "ai.reports.read",
  "ai.safety.read",
  "ai.safety.manage",
];

const PHASE2_PERMISSIONS: PermissionKey[] = [
  "users.read",
  "devices.read",
  "sessions.read",
  "users.status.manage",
  "users.verification.manage",
  "devices.revoke",
  "sessions.revoke",
  "users.export_summary",
  "support.request_access",
  "support.access.read",
  "support.access.approve",
  "support.access.revoke",
  "support.access.use",
];

const expectedActors: Record<AdminRole, string> = {
  "super-admin": "ADM-DEMO-SUPER",
  "support-agent": "ADM-DEMO-SUPPORT",
  "billing-operator": "ADM-DEMO-BILLING",
  "import-operator": "ADM-DEMO-IMPORT",
  "ai-operator": "ADM-DEMO-AI",
  "content-manager": "ADM-DEMO-CONTENT",
  "security-administrator": "ADM-DEMO-SECURITY",
};

describe("admin permission matrix", () => {
  test("defines exactly the seven clarified roles and the full permission set", () => {
    expect(ADMIN_ROLES).toHaveLength(7);
    expect(Object.keys(permissionsByRole)).toEqual([...ADMIN_ROLES]);
    for (const key of PHASE2_PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  test("exports one stable fictional actor id per role", () => {
    const ids = Object.values(SIMULATED_ACTORS);
    expect(new Set(ids).size).toBe(ADMIN_ROLES.length);
    for (const role of ADMIN_ROLES) {
      expect(SIMULATED_ACTORS[role]).toBe(expectedActors[role]);
    }
  });

  test("every role receives shell permissions", () => {
    for (const role of ADMIN_ROLES) {
      expect(hasPermission(role, "global-search.use")).toBe(true);
      expect(hasPermission(role, "attention.read")).toBe(true);
    }
  });

  test.each(ADMIN_ROLES)("%s follows its clarified route matrix", (role) => {
    const allowed = routePermissions[role];
    for (const routeKey of [
      "admin.overview.read",
      "users.read",
      "imports.read",
      "system-health.read",
    ] as PermissionKey[]) {
      expect(hasPermission(role, routeKey)).toBe(allowed.includes(routeKey));
    }
  });

  test("super admin has all thirteen phase 2 permissions", () => {
    for (const key of PHASE2_PERMISSIONS) {
      expect(hasPermission("super-admin", key)).toBe(true);
    }
  });

  test("security administrator has all thirteen phase 2 permissions", () => {
    for (const key of PHASE2_PERMISSIONS) {
      expect(hasPermission("security-administrator", key)).toBe(true);
    }
  });

  test("support agent has phase 2 permissions except device revoke and approval", () => {
    const allowed = PHASE2_PERMISSIONS.filter(
      (key) => key !== "devices.revoke" && key !== "support.access.approve",
    );
    const denied = ["devices.revoke", "support.access.approve"] as PermissionKey[];
    for (const key of allowed) {
      expect(hasPermission("support-agent", key)).toBe(true);
    }
    for (const key of denied) {
      expect(hasPermission("support-agent", key)).toBe(false);
    }
  });

  test("billing, import, ai, and content roles have no phase 2 customer permissions", () => {
    const noAccessRoles: AdminRole[] = [
      "billing-operator",
      "import-operator",
      "ai-operator",
      "content-manager",
    ];
    for (const role of noAccessRoles) {
      for (const key of PHASE2_PERMISSIONS) {
        expect(hasPermission(role, key)).toBe(false);
      }
    }
  });

  describe("Spec 005 import and parser permissions", () => {
    test("all 14 Spec 005 permission keys exist in PERMISSION_KEYS", () => {
      for (const permission of SPEC_005_PERMISSIONS) {
        expect(PERMISSION_KEYS).toContain(permission);
      }
    });

    test("super-admin has all 14 Spec 005 permissions", () => {
      for (const permission of SPEC_005_PERMISSIONS) {
        expect(hasPermission("super-admin", permission)).toBe(true);
      }
    });

    test("import-operator has all 14 Spec 005 permissions", () => {
      for (const permission of SPEC_005_PERMISSIONS) {
        expect(hasPermission("import-operator", permission)).toBe(true);
      }
    });

    test("support-agent has only imports.read from Spec 005", () => {
      expect(hasPermission("support-agent", "imports.read")).toBe(true);
      
      const otherPermissions = SPEC_005_PERMISSIONS.filter(p => p !== "imports.read");
      for (const permission of otherPermissions) {
        expect(hasPermission("support-agent", permission)).toBe(false);
      }
    });

    test("security-administrator has read-only Spec 005 permissions", () => {
      const readonlyPermissions = ["imports.read", "parsers.coverage.read", "parsers.rules.read"] as PermissionKey[];
      const actionPermissions = SPEC_005_PERMISSIONS.filter(p => !readonlyPermissions.includes(p));

      for (const permission of readonlyPermissions) {
        expect(hasPermission("security-administrator", permission)).toBe(true);
      }
      
      for (const permission of actionPermissions) {
        expect(hasPermission("security-administrator", permission)).toBe(false);
      }
    });

    test("billing-operator, ai-operator, and content-manager have no Spec 005 permissions", () => {
      const noAccessRoles: AdminRole[] = ["billing-operator", "ai-operator", "content-manager"];
      
      for (const role of noAccessRoles) {
        for (const permission of SPEC_005_PERMISSIONS) {
          expect(hasPermission(role, permission)).toBe(false);
        }
      }
    });

    test("role permissions follow least-privilege principle", () => {
      const spec005Count = (role: AdminRole) =>
        SPEC_005_PERMISSIONS.filter((permission) => hasPermission(role, permission)).length;
      for (const role of ["support-agent", "billing-operator", "ai-operator", "content-manager", "security-administrator"] as const) {
        expect(spec005Count(role)).toBeLessThan(spec005Count("import-operator"));
      }
    });
  });

  describe("Spec 006 AI permissions", () => {
    test("all Spec 006 permission keys exist in PERMISSION_KEYS", () => {
      for (const permission of SPEC_006_PERMISSIONS) {
        expect(PERMISSION_KEYS).toContain(permission);
      }
    });

    test("super-admin and ai-operator have full AI operations access", () => {
      for (const permission of SPEC_006_PERMISSIONS) {
        expect(hasPermission("super-admin", permission)).toBe(true);
        expect(hasPermission("ai-operator", permission)).toBe(true);
      }
    });

    test("limited roles receive only their documented AI projections", () => {
      expect(hasPermission("support-agent", "ai.overview.read")).toBe(true);
      expect(hasPermission("support-agent", "ai.providers.read")).toBe(true);
      expect(hasPermission("support-agent", "ai.failures.manage")).toBe(true);
      expect(hasPermission("support-agent", "ai.reports.manage")).toBe(true);
      expect(hasPermission("support-agent", "ai.prompts.read")).toBe(false);
      expect(hasPermission("security-administrator", "ai.safety.read")).toBe(true);
      expect(hasPermission("security-administrator", "ai.reports.manage")).toBe(true);
      expect(hasPermission("security-administrator", "ai.safety.manage")).toBe(false);
      expect(hasPermission("billing-operator", "ai.overview.read")).toBe(true);
      expect(hasPermission("billing-operator", "ai.usage.read")).toBe(true);
      expect(hasPermission("billing-operator", "ai.providers.read")).toBe(true);
      expect(hasPermission("billing-operator", "ai.models.read")).toBe(true);
      expect(hasPermission("billing-operator", "ai.providers.manage")).toBe(false);
      expect(hasPermission("import-operator", "ai.overview.read")).toBe(false);
      expect(hasPermission("import-operator", "ai.providers.read")).toBe(false);
      expect(hasPermission("content-manager", "ai.overview.read")).toBe(false);
    });
  });

  test("rejects unknown permission keys", () => {
    expect(hasPermission("super-admin", "users.write")).toBe(false);
  });

  describe("Spec 007 Phase 6 permissions", () => {
    const SPEC_007_PERMISSIONS: PermissionKey[] = [
      "support.tickets.read",
      "support.tickets.manage",
      "support.categories.manage",
      "feedback.read",
      "feedback.manage",
      "feedback.abuse.manage",
      "content.categories.manage",
      "content.manage",
      "communications.templates.manage",
      "notifications.read",
      "notifications.campaigns.manage",
    ];

    test("all Spec 007 permission keys exist in PERMISSION_KEYS", () => {
      for (const permission of SPEC_007_PERMISSIONS) {
        expect(PERMISSION_KEYS).toContain(permission);
      }
    });

    test("super-admin has all Spec 007 permissions", () => {
      for (const permission of SPEC_007_PERMISSIONS) {
        expect(hasPermission("super-admin", permission)).toBe(true);
      }
    });

    test("support-agent has support permissions and limited feedback/content read", () => {
      const supportPermissions = [
        "support.tickets.read",
        "support.tickets.manage",
        "support.categories.manage",
        "feedback.read",
        "feedback.manage",
      ] as PermissionKey[];
      
      for (const permission of supportPermissions) {
        expect(hasPermission("support-agent", permission)).toBe(true);
      }
      
      const deniedPermissions = [
        "feedback.abuse.manage",
        "content.categories.manage",
        "content.manage",
        "communications.templates.manage",
        "notifications.read",
        "notifications.campaigns.manage",
      ] as PermissionKey[];
      
      for (const permission of deniedPermissions) {
        expect(hasPermission("support-agent", permission)).toBe(false);
      }
    });

    test("content-manager has content and notification permissions", () => {
      const contentManagerPermissions = [
        "content.categories.manage",
        "content.manage",
        "communications.templates.manage",
        "notifications.read",
        "notifications.campaigns.manage",
        "feedback.read",
      ] as PermissionKey[];
      
      for (const permission of contentManagerPermissions) {
        expect(hasPermission("content-manager", permission)).toBe(true);
      }
      
      const deniedPermissions = [
        "support.tickets.read",
        "support.tickets.manage",
        "support.categories.manage",
        "feedback.manage",
        "feedback.abuse.manage",
      ] as PermissionKey[];
      
      for (const permission of deniedPermissions) {
        expect(hasPermission("content-manager", permission)).toBe(false);
      }
    });

    test("security-administrator has abuse-report permissions only", () => {
      const securityPermissions = [
        "feedback.abuse.manage",
      ] as PermissionKey[];
      
      for (const permission of securityPermissions) {
        expect(hasPermission("security-administrator", permission)).toBe(true);
      }
      
      const deniedPermissions = [
        "support.tickets.read",
        "support.tickets.manage",
        "support.categories.manage",
        "feedback.read",
        "feedback.manage",
        "content.categories.manage",
        "content.manage",
        "communications.templates.manage",
        "notifications.read",
        "notifications.campaigns.manage",
      ] as PermissionKey[];
      
      for (const permission of deniedPermissions) {
        expect(hasPermission("security-administrator", permission)).toBe(false);
      }
    });

    test("billing-operator, import-operator, and ai-operator have no Spec 007 permissions", () => {
      const noAccessRoles: AdminRole[] = [
        "billing-operator",
        "import-operator",
        "ai-operator",
      ];
      
      for (const role of noAccessRoles) {
        for (const permission of SPEC_007_PERMISSIONS) {
          expect(hasPermission(role, permission)).toBe(false);
        }
      }
    });

    test("direct route denial for unauthorized roles", () => {
      expect(hasPermission("content-manager", "support.tickets.read")).toBe(false);
      expect(hasPermission("content-manager", "feedback.abuse.manage")).toBe(false);
      expect(hasPermission("security-administrator", "support.tickets.read")).toBe(false);
      expect(hasPermission("security-administrator", "notifications.read")).toBe(false);
      expect(hasPermission("support-agent", "feedback.abuse.manage")).toBe(false);
      expect(hasPermission("support-agent", "content.categories.manage")).toBe(false);
    });

    test("linked-only projection restrictions", () => {
      expect(hasPermission("content-manager", "feedback.read")).toBe(true);
      expect(hasPermission("content-manager", "feedback.manage")).toBe(false);
      expect(hasPermission("security-administrator", "feedback.read")).toBe(false);
      expect(hasPermission("security-administrator", "feedback.abuse.manage")).toBe(true);
    });
  });
});
