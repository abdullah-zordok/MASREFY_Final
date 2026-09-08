import { describe, expect, test } from "vitest";
import { navigationFixture } from "@/mocks/fixtures/foundation";
import { buildSidebarSections, resolveRoutePermission } from "./shell-state";

function sectionItemIds(sectionId: string, pathname = "/admin") {
  return buildSidebarSections(navigationFixture, pathname)
    .find((section) => section.id === sectionId)
    ?.items.map((item) => item.id) ?? [];
}

function accordion(sectionId: string, accordionId: string, pathname = "/admin") {
  const node = buildSidebarSections(navigationFixture, pathname)
    .find((section) => section.id === sectionId)
    ?.items.find((item) => item.id === accordionId);
  return node?.kind === "accordion" ? node : undefined;
}

function childAccordion(parentId: string, childId: string, pathname = "/admin") {
  const parent = buildSidebarSections(navigationFixture, pathname)
    .flatMap((section) => section.items)
    .find((item) => item.id === parentId);
  if (parent?.kind !== "accordion") return undefined;
  const child = parent.items.find((item) => item.id === childId);
  return child?.kind === "accordion" ? child : undefined;
}

describe("Spec 005 route permissions", () => {
  test.each([
    ["/admin/imports", "imports.read"],
    ["/admin/imports/sessions", "imports.read"],
    ["/admin/imports/sessions/IMP-77241", "imports.detail.read"],
    ["/admin/imports/failed", "imports.failures.manage"],
    ["/admin/imports/low-confidence", "imports.confidence.manage"],
    ["/admin/imports/duplicates", "imports.duplicates.manage"],
    ["/admin/imports/unsupported", "imports.unsupported.manage"],
    ["/admin/parsers/banks", "parsers.coverage.read"],
    ["/admin/parsers/banks/BNK-001", "parsers.coverage.read"],
    ["/admin/parsers/senders", "parsers.senders.manage"],
    ["/admin/parsers/rules", "parsers.rules.read"],
    ["/admin/parsers/rules/PRL-001", "parsers.rules.read"],
    ["/admin/parsers/test-cases", "parsers.tests.run"],
    ["/admin/parsers/versions", "parsers.versions.manage"],
    ["/admin/parsers/merchant-rules", "parsers.merchants.manage"],
    ["/admin/parsers/category-rules", "parsers.categories.manage"],
  ])("maps %s to %s", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });
});

describe("Spec 008 security, audit, and privacy route permissions", () => {
  test.each([
    ["/admin/security", "security.events.read"],
    ["/admin/security/authentication-events", "security.events.read"],
    ["/admin/security/suspicious-activity", "security.incidents.manage"],
    ["/admin/security/admins", "security.admins.read"],
    ["/admin/security/permission-changes", "security.permissions.read"],
    ["/admin/security/support-access", "security.support_access.read"],
    ["/admin/security/incidents/INC-1001", "security.incidents.manage"],
    ["/admin/audit", "audit.logs.read"],
    ["/admin/audit/AUD-1001", "audit.logs.read"],
    ["/admin/data-requests/exports", "data_requests.exports.read"],
    ["/admin/data-requests/exports/EXP-1001", "data_requests.exports.read"],
    ["/admin/data-requests/deletions", "data_requests.deletions.read"],
    ["/admin/data-requests/deletions/DEL-1001", "data_requests.deletions.read"],
    ["/admin/data-requests/retention", "data_retention.read"],
  ])("maps %s to %s before broad fallbacks", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });
});

describe("Spec 009 system health and jobs route permissions", () => {
  test.each([
    ["/admin/system-health", "system-health.read"],
    ["/admin/system-health/api", "system-health.api.read"],
    ["/admin/system-health/database", "system-health.database.read"],
    ["/admin/system-health/storage", "system-health.storage.read"],
    ["/admin/system-health/providers", "system-health.providers.read"],
    ["/admin/jobs/queues", "jobs.queues.read"],
    ["/admin/jobs/runs", "jobs.runs.read"],
    ["/admin/jobs/runs/JOB-DEMO-FAILED-01", "jobs.runs.read"],
    ["/admin/jobs/scheduled", "jobs.schedules.read"],
  ])("maps %s to %s before broad fallbacks", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });

  test("uses the specific job-run detail rule before broad jobs rules", () => {
    expect(resolveRoutePermission("/admin/jobs/runs/JOB-DEMO-FAILED-01")).toBe("jobs.runs.read");
    expect(resolveRoutePermission("/admin/jobs/runs/JOB-DEMO-FAILED-01/retry")).toBe("forbidden");
    expect(resolveRoutePermission("/admin/jobs/runs/not-a-job-id")).toBe("forbidden");
    expect(resolveRoutePermission("/admin/jobs")).toBe("forbidden");
  });
});

describe("sidebar accordion grouping", () => {
  test("groups Phase 8 system health and jobs into one reusable accordion tree", () => {
    expect(sectionItemIds("platform")).toEqual(["overview", "system-health"]);
    const health = accordion("platform", "system-health");
    expect(health?.labelKey).toBe("System Health");
    expect(health?.defaultOpen).toBe(false);
    expect(health?.items.map((item) => item.id)).toEqual([
      "health",
      "health-api",
      "health-database",
      "health-storage",
      "health-providers",
      "jobs-and-queues",
    ]);
    const jobs = health?.items.find((item) => item.id === "jobs-and-queues");
    expect(jobs?.kind).toBe("accordion");
    expect(jobs?.kind === "accordion" ? jobs.items.map((item) => item.id) : []).toEqual([
      "jobs",
      "job-runs",
      "scheduled-jobs",
    ]);
  });

  test("groups all communications routes into four internal accordions without losing routes", () => {
    const communications = accordion("communications", "communications");
    expect(communications?.items.map((item) => item.id)).toEqual([
      "communications-support",
      "communications-feedback",
      "communications-content",
      "communications-notifications",
    ]);
    expect(communications?.items.flatMap((group) =>
      group.kind === "accordion" ? group.items.map((item) => item.kind === "item" ? item.item.route : undefined) : [],
    )).toEqual([
      "/admin/support",
      "/admin/support/tickets",
      "/admin/support/tickets/TKT-1001",
      "/admin/support/categories",
      "/admin/feedback",
      "/admin/feedback/FDB-1001",
      "/admin/feedback/abuse",
      "/admin/content/categories",
      "/admin/content/categories/CAT-1001",
      "/admin/content/tips",
      "/admin/content/faqs",
      "/admin/content/onboarding",
      "/admin/content/help-center",
      "/admin/content/announcements",
      "/admin/content/email-templates",
      "/admin/content/push-templates",
      "/admin/notifications",
      "/admin/notifications/campaigns",
      "/admin/notifications/campaigns/new",
      "/admin/notifications/campaigns/CMP-1001",
      "/admin/notifications/transactional",
      "/admin/notifications/delivery-logs",
    ]);
  });

  test("opens accordion parents for active communications and jobs routes", () => {
    expect(accordion("communications", "communications", "/admin/support/tickets/TKT-1001")?.defaultOpen).toBe(true);
    expect(childAccordion("communications", "communications-support", "/admin/support/tickets/TKT-1001")?.defaultOpen).toBe(true);
    expect(childAccordion("communications", "communications-notifications", "/admin/support/tickets/TKT-1001")?.defaultOpen).toBe(false);

    expect(accordion("communications", "communications", "/admin/notifications/campaigns/CMP-1001")?.defaultOpen).toBe(true);
    expect(childAccordion("communications", "communications-notifications", "/admin/notifications/campaigns/CMP-1001")?.defaultOpen).toBe(true);

    expect(accordion("platform", "system-health", "/admin/system-health/providers")?.defaultOpen).toBe(true);
    expect(accordion("platform", "system-health", "/admin/jobs/runs")?.defaultOpen).toBe(true);
    expect(childAccordion("system-health", "jobs-and-queues", "/admin/jobs/runs")?.defaultOpen).toBe(true);
  });

  test("omits empty accordion groups after permission filtering", () => {
    const communications = navigationFixture.find((group) => group.id === "communications");
    const platform = navigationFixture.find((group) => group.id === "platform");
    const sections = buildSidebarSections([
      ...(platform ? [{ ...platform, items: platform.items.filter((item) => item.id === "overview") }] : []),
      ...(communications ? [{ ...communications, items: communications.items.filter((item) => item.id.startsWith("content-")) }] : []),
    ], "/admin/content/faqs");

    expect(sections.find((section) => section.id === "platform")?.items.map((item) => item.id)).toEqual(["overview"]);
    const communicationsAccordion = sections.find((section) => section.id === "communications")?.items[0];
    expect(communicationsAccordion?.kind).toBe("accordion");
    expect(communicationsAccordion?.kind === "accordion" ? communicationsAccordion.items.map((item) => item.id) : []).toEqual(["communications-content"]);
  });
});

describe("Spec 010 governance and settings route permissions", () => {
  test.each([
    ["/admin/admin-team", "admin-team.read"],
    ["/admin/admin-team/invite", "admin-team.invite"],
    ["/admin/admin-team/ADM-DEMO-SECURITY-02", "admin-team.read"],
    ["/admin/roles", "roles.read"],
    ["/admin/roles/new", "roles.manage"],
    ["/admin/roles/permissions", "permissions.read"],
    ["/admin/roles/ROLE-DEMO-SUPPORT", "roles.read"],
    ["/admin/roles/ROLE-DEMO-CUSTOM-01/edit", "roles.manage"],
    ["/admin/settings", "settings.general.read"],
    ["/admin/settings/mobile", "settings.mobile.read"],
    ["/admin/settings/feature-flags", "settings.flags.read"],
    ["/admin/settings/imports", "settings.imports.read"],
    ["/admin/settings/ai", "settings.ai.read"],
    ["/admin/settings/subscriptions", "settings.subscriptions.read"],
    ["/admin/settings/security", "settings.security.read"],
    ["/admin/settings/maintenance", "settings.maintenance.read"],
  ])("maps %s to %s before dynamic or broad fallbacks", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });

  test.each([
    "/admin/admin-team/not-valid",
    "/admin/admin-team/ADM-",
    "/admin/roles/not-valid",
    "/admin/roles/ROLE-/edit",
    "/admin/roles/ROLE-DEMO-CUSTOM-01/delete",
  ])("denies malformed or unsupported Spec 010 path %s", (path) => {
    expect(resolveRoutePermission(path)).toBe("forbidden");
  });
});

describe("Spec 006 AI route permissions", () => {
  test.each([
    ["/admin/ai", "ai.overview.read"],
    ["/admin/ai/providers", "ai.providers.read"],
    ["/admin/ai/providers/AIP-OPENAI", "ai.providers.read"],
    ["/admin/ai/models", "ai.models.read"],
    ["/admin/ai/prompts", "ai.prompts.read"],
    ["/admin/ai/prompts/AIPR-VOICE-AR-001", "ai.prompts.read"],
    ["/admin/ai/usage", "ai.usage.read"],
    ["/admin/ai/failures", "ai.failures.manage"],
    ["/admin/ai/reports", "ai.reports.manage"],
    ["/admin/ai/safety-rules", "ai.safety.read"],
  ])("maps %s before the /admin fallback", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });
});

describe("Spec 007 communications route permissions", () => {
  test.each([
    ["/admin/support", "support.tickets.read"],
    ["/admin/support/tickets", "support.tickets.read"],
    ["/admin/support/tickets/TKT-1001", "support.tickets.read"],
    ["/admin/support/categories", "support.categories.manage"],
    ["/admin/feedback", "feedback.read"],
    ["/admin/feedback/FDB-1001", "feedback.read"],
    ["/admin/feedback/abuse", "feedback.abuse.manage"],
    ["/admin/content/categories", "content.categories.manage"],
    ["/admin/content/categories/CAT-1001", "content.categories.manage"],
    ["/admin/content/tips", "content.manage"],
    ["/admin/content/faqs", "content.manage"],
    ["/admin/content/onboarding", "content.manage"],
    ["/admin/content/help-center", "content.manage"],
    ["/admin/content/announcements", "communications.templates.manage"],
    ["/admin/content/email-templates", "communications.templates.manage"],
    ["/admin/content/push-templates", "communications.templates.manage"],
    ["/admin/notifications", "notifications.read"],
    ["/admin/notifications/campaigns", "notifications.campaigns.manage"],
    ["/admin/notifications/campaigns/new", "notifications.campaigns.manage"],
    ["/admin/notifications/campaigns/CMP-1001", "notifications.campaigns.manage"],
    ["/admin/notifications/transactional", "notifications.read"],
    ["/admin/notifications/delivery-logs", "notifications.read"],
  ])("maps %s to %s", (path, permission) => {
    expect(resolveRoutePermission(path)).toBe(permission);
  });
});
