import type { AdminRole, PermissionKey } from "@/core/permissions/permissions";
import type { NavigationGroup, NavigationItem } from "@/features/foundation/contracts";
import { directionForLocale } from "@/core/localization/direction";

export { directionForLocale };

const ROLE_LABELS: Record<AdminRole, string> = {
  "super-admin": "المسؤول الأعلى",
  "support-agent": "وكيل الدعم",
  "billing-operator": "مشغل الفوترة",
  "import-operator": "مشغل الاستيراد",
  "ai-operator": "مشغل الذكاء الاصطناعي",
  "content-manager": "مدير المحتوى",
  "security-administrator": "مسؤول الأمان",
};

type Environment = "production" | "staging" | "development";
type ShellLocale = "ar" | "en";
type Theme = "light" | "dark";

const ENVIRONMENT_LABELS: Record<Environment, Record<ShellLocale, string>> = {
  production: { ar: "الإنتاج", en: "Production" },
  staging: { ar: "الاختبار", en: "Staging" },
  development: { ar: "التطوير", en: "Development" },
};

export function roleLabel(role: AdminRole): string {
  return ROLE_LABELS[role];
}

export function environmentLabel(
  environment: Environment,
  locale: ShellLocale,
): string {
  return ENVIRONMENT_LABELS[environment][locale];
}

export function isActiveRoute(pathname: string, route: string): boolean {
  return route === "/admin" ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function usesMobileDrawer(width: number): boolean {
  return width < 900;
}

export type SidebarNavigationItemNode = {
  kind: "item";
  id: string;
  item: NavigationItem;
  active: boolean;
};

export type SidebarNavigationAccordionNode = {
  kind: "accordion";
  id: string;
  labelKey: string;
  iconKey: string;
  items: SidebarNavigationNode[];
  active: boolean;
  defaultOpen: boolean;
  exclusiveChildren?: boolean;
};

export type SidebarNavigationNode = SidebarNavigationItemNode | SidebarNavigationAccordionNode;

export type SidebarNavigationSection = Omit<NavigationGroup, "items"> & {
  items: SidebarNavigationNode[];
};

function itemNode(item: NavigationItem, pathname: string, labelKey = item.labelKey): SidebarNavigationItemNode {
  const nextItem = labelKey === item.labelKey ? item : { ...item, labelKey };
  return {
    kind: "item",
    id: item.id,
    item: nextItem,
    active: Boolean(item.route && isActiveRoute(pathname, item.route)),
  };
}

function accordionNode(
  id: string,
  labelKey: string,
  iconKey: string,
  items: SidebarNavigationNode[],
  exclusiveChildren = false,
): SidebarNavigationAccordionNode | undefined {
  if (items.length === 0) return undefined;
  const active = items.some((item) => item.active);
  return { kind: "accordion", id, labelKey, iconKey, items, active, defaultOpen: active, exclusiveChildren };
}

function nodesForIds(items: NavigationItem[], pathname: string, ids: string[], labels: Record<string, string> = {}) {
  return ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NavigationItem => Boolean(item))
    .map((item) => itemNode(item, pathname, labels[item.id]));
}

function communicationAccordion(group: NavigationGroup, pathname: string) {
  const groups = [
    accordionNode("communications-support", "Support", "activity", nodesForIds(group.items, pathname, [
      "support-overview",
      "support-tickets",
      "support-ticket-detail",
      "support-categories",
    ])),
    accordionNode("communications-feedback", "Feedback", "activity", nodesForIds(group.items, pathname, [
      "feedback-overview",
      "feedback-detail",
      "feedback-abuse",
    ])),
    accordionNode("communications-content", "Content", "database", nodesForIds(group.items, pathname, [
      "content-categories",
      "content-category-detail",
      "content-tips",
      "content-faqs",
      "content-onboarding",
      "content-help-center",
      "content-announcements",
      "content-email-templates",
      "content-push-templates",
    ])),
    accordionNode("communications-notifications", "Notifications", "activity", nodesForIds(group.items, pathname, [
      "notifications-overview",
      "notification-campaigns",
      "notification-campaign-new",
      "notification-campaign-detail",
      "notification-transactional",
      "notification-delivery-logs",
    ])),
  ].filter((item): item is SidebarNavigationAccordionNode => Boolean(item));
  return accordionNode("communications", group.labelKey, "activity", groups, true);
}

function systemHealthAccordion(group: NavigationGroup, pathname: string) {
  const jobs = accordionNode("jobs-and-queues", "Jobs and Queues", "activity", nodesForIds(group.items, pathname, [
    "jobs",
    "job-runs",
    "scheduled-jobs",
  ], {
    jobs: "Queue Overview",
  }));
  const items = [
    ...nodesForIds(group.items, pathname, [
      "health",
      "health-api",
      "health-database",
      "health-storage",
      "health-providers",
    ], {
      health: "Health Overview",
    }),
    ...(jobs ? [jobs] : []),
  ];
  return accordionNode("system-health", "System Health", "heart-pulse", items);
}

export function flattenSidebarNodes(nodes: SidebarNavigationNode[]): SidebarNavigationItemNode[] {
  return nodes.flatMap((node) => node.kind === "item" ? [node] : flattenSidebarNodes(node.items));
}

export function strongestActiveRoute(pathname: string, nodes: SidebarNavigationNode[]): string | undefined {
  const routes: string[] = [];
  for (const node of flattenSidebarNodes(nodes)) {
    if (typeof node.item.route === "string" && isActiveRoute(pathname, node.item.route)) {
      routes.push(node.item.route);
    }
  }
  return routes.sort((a, b) => b.length - a.length)[0];
}

export function buildSidebarSections(groups: NavigationGroup[], pathname: string): SidebarNavigationSection[] {
  return groups
    .map((group): SidebarNavigationSection => {
      if (group.id === "communications") {
        const communications = communicationAccordion(group, pathname);
        return { ...group, items: communications ? [communications] : [] };
      }
      if (group.id === "platform") {
        const groupedIds = new Set(["health", "health-api", "health-database", "health-storage", "health-providers", "jobs", "job-runs", "scheduled-jobs"]);
        const flatItems = group.items
          .filter((item) => !groupedIds.has(item.id))
          .map((item) => itemNode(item, pathname));
        const health = systemHealthAccordion(group, pathname);
        return { ...group, items: health ? [...flatItems, health] : flatItems };
      }
      return { ...group, items: group.items.map((item) => itemNode(item, pathname)) };
    })
    .filter((group) => group.items.length > 0);
}

const ROUTE_PERMISSION_RULES: ReadonlyArray<{ match: string; permission: PermissionKey }> = [
  { match: "/admin/security/authentication-events", permission: "security.events.read" },
  { match: "/admin/security/suspicious-activity", permission: "security.incidents.manage" },
  { match: "/admin/security/admins", permission: "security.admins.read" },
  { match: "/admin/security/permission-changes", permission: "security.permissions.read" },
  { match: "/admin/security/support-access", permission: "security.support_access.read" },
  { match: "/admin/security", permission: "security.events.read" },
  { match: "/admin/audit", permission: "audit.logs.read" },
  { match: "/admin/data-requests/exports", permission: "data_requests.exports.read" },
  { match: "/admin/data-requests/deletions", permission: "data_requests.deletions.read" },
  { match: "/admin/data-requests/retention", permission: "data_retention.read" },
  { match: "/admin/ai/providers", permission: "ai.providers.read" },
  { match: "/admin/ai/models", permission: "ai.models.read" },
  { match: "/admin/ai/prompts", permission: "ai.prompts.read" },
  { match: "/admin/ai/usage", permission: "ai.usage.read" },
  { match: "/admin/ai/failures", permission: "ai.failures.manage" },
  { match: "/admin/ai/reports", permission: "ai.reports.manage" },
  { match: "/admin/ai/safety-rules", permission: "ai.safety.read" },
  { match: "/admin/ai", permission: "ai.overview.read" },
  { match: "/admin/access-requests", permission: "support.access.read" },
  { match: "/admin/users", permission: "users.read" },
  { match: "/admin/imports/sessions", permission: "imports.read" },
  { match: "/admin/imports/failed", permission: "imports.failures.manage" },
  { match: "/admin/imports/low-confidence", permission: "imports.confidence.manage" },
  { match: "/admin/imports/duplicates", permission: "imports.duplicates.manage" },
  { match: "/admin/imports/unsupported", permission: "imports.unsupported.manage" },
  { match: "/admin/parsers/banks", permission: "parsers.coverage.read" },
  { match: "/admin/parsers/senders", permission: "parsers.senders.manage" },
  { match: "/admin/parsers/rules", permission: "parsers.rules.read" },
  { match: "/admin/parsers/test-cases", permission: "parsers.tests.run" },
  { match: "/admin/parsers/versions", permission: "parsers.versions.manage" },
  { match: "/admin/parsers/merchant-rules", permission: "parsers.merchants.manage" },
  { match: "/admin/parsers/category-rules", permission: "parsers.categories.manage" },
  { match: "/admin/imports", permission: "imports.read" },
  { match: "/admin/system-health/api", permission: "system-health.api.read" },
  { match: "/admin/system-health/database", permission: "system-health.database.read" },
  { match: "/admin/system-health/storage", permission: "system-health.storage.read" },
  { match: "/admin/system-health/providers", permission: "system-health.providers.read" },
  { match: "/admin/system-health", permission: "system-health.read" },
  { match: "/admin/jobs/queues", permission: "jobs.queues.read" },
  { match: "/admin/jobs/runs", permission: "jobs.runs.read" },
  { match: "/admin/jobs/scheduled", permission: "jobs.schedules.read" },
  { match: "/admin/subscriptions/plans", permission: "plans.read" },
  { match: "/admin/subscriptions/promotional-codes", permission: "promotions.read" },
  { match: "/admin/payments/events", permission: "payments.detail.read" },
  { match: "/admin/payments/failed", permission: "payment_failures.manage" },
  { match: "/admin/payments/reconciliation", permission: "billing_reconciliation.read" },
  { match: "/admin/subscriptions", permission: "subscriptions.read" },
  { match: "/admin/payments", permission: "payments.read" },
  { match: "/admin/support/tickets", permission: "support.tickets.read" },
  { match: "/admin/support/categories", permission: "support.categories.manage" },
  { match: "/admin/support", permission: "support.tickets.read" },
  { match: "/admin/feedback/abuse", permission: "feedback.abuse.manage" },
  { match: "/admin/feedback", permission: "feedback.read" },
  { match: "/admin/content/categories", permission: "content.categories.manage" },
  { match: "/admin/content/tips", permission: "content.manage" },
  { match: "/admin/content/faqs", permission: "content.manage" },
  { match: "/admin/content/onboarding", permission: "content.manage" },
  { match: "/admin/content/help-center", permission: "content.manage" },
  { match: "/admin/content/announcements", permission: "communications.templates.manage" },
  { match: "/admin/content/email-templates", permission: "communications.templates.manage" },
  { match: "/admin/content/push-templates", permission: "communications.templates.manage" },
  { match: "/admin/notifications/campaigns", permission: "notifications.campaigns.manage" },
  { match: "/admin/notifications/transactional", permission: "notifications.read" },
  { match: "/admin/notifications/delivery-logs", permission: "notifications.read" },
  { match: "/admin/notifications", permission: "notifications.read" },
  { match: "/admin", permission: "admin.overview.read" },
];

const PHASE9_EXACT_ROUTE_PERMISSIONS: Partial<Record<string, PermissionKey>> = {
  "/admin/admin-team": "admin-team.read",
  "/admin/admin-team/invite": "admin-team.invite",
  "/admin/roles": "roles.read",
  "/admin/roles/new": "roles.manage",
  "/admin/roles/permissions": "permissions.read",
  "/admin/settings": "settings.general.read",
  "/admin/settings/mobile": "settings.mobile.read",
  "/admin/settings/feature-flags": "settings.flags.read",
  "/admin/settings/imports": "settings.imports.read",
  "/admin/settings/ai": "settings.ai.read",
  "/admin/settings/subscriptions": "settings.subscriptions.read",
  "/admin/settings/security": "settings.security.read",
  "/admin/settings/maintenance": "settings.maintenance.read",
};

export function resolveRoutePermission(pathname: string): PermissionKey | "forbidden" | undefined {
  const phase9ExactPermission = PHASE9_EXACT_ROUTE_PERMISSIONS[pathname];
  if (phase9ExactPermission) return phase9ExactPermission;
  if (/^\/admin\/admin-team\/ADM-[A-Z0-9-]{3,64}$/.test(pathname)) {
    return "admin-team.read";
  }
  if (/^\/admin\/roles\/ROLE-[A-Z0-9-]{3,64}$/.test(pathname)) {
    return "roles.read";
  }
  if (/^\/admin\/roles\/ROLE-[A-Z0-9-]{3,64}\/edit$/.test(pathname)) {
    return "roles.manage";
  }
  if (
    pathname.startsWith("/admin/admin-team/")
    || pathname.startsWith("/admin/roles/")
    || pathname.startsWith("/admin/settings/")
  ) {
    return "forbidden";
  }
  if (/^\/admin\/security\/incidents\/INC-[A-Za-z0-9-]+$/.test(pathname)) {
    return "security.incidents.manage";
  }
  if (/^\/admin\/audit\/AUD-[A-Za-z0-9-]+$/.test(pathname)) {
    return "audit.logs.read";
  }
  if (/^\/admin\/data-requests\/exports\/EXP-[A-Za-z0-9-]+$/.test(pathname)) {
    return "data_requests.exports.read";
  }
  if (/^\/admin\/data-requests\/deletions\/DEL-[A-Za-z0-9-]+$/.test(pathname)) {
    return "data_requests.deletions.read";
  }
  if (/^\/admin\/jobs\/runs\/JOB-[A-Za-z0-9-]+$/.test(pathname)) {
    return "jobs.runs.read";
  }
  if (pathname === "/admin/jobs" || pathname.startsWith("/admin/jobs/runs/")) {
    return "forbidden";
  }
  if (/^\/admin\/imports\/sessions\/[^/]+$/.test(pathname)) {
    return "imports.detail.read";
  }
  if (/^\/admin\/access-requests\/[^/]+\/workspace$/.test(pathname)) {
    return "support.access.use";
  }
  if (/^\/admin\/subscriptions\/(?!plans$|promotional-codes$)[^/]+$/.test(pathname)) {
    return "subscriptions.detail.read";
  }
  if (/^\/admin\/support\/tickets\/[^/]+$/.test(pathname)) {
    return "support.tickets.read";
  }
  if (/^\/admin\/feedback\/(?!abuse$)[^/]+$/.test(pathname)) {
    return "feedback.read";
  }
  if (/^\/admin\/feedback\/abuse-reports\/[^/]+$/.test(pathname)) {
    return "feedback.abuse.manage";
  }
  if (/^\/admin\/content\/categories\/[^/]+$/.test(pathname)) {
    return "content.categories.manage";
  }
  if (/^\/admin\/content\/tips\/[^/]+$/.test(pathname)) {
    return "content.manage";
  }
  if (/^\/admin\/content\/faqs\/[^/]+$/.test(pathname)) {
    return "content.manage";
  }
  if (/^\/admin\/content\/onboarding\/[^/]+$/.test(pathname)) {
    return "content.manage";
  }
  if (/^\/admin\/content\/help-center\/[^/]+$/.test(pathname)) {
    return "content.manage";
  }
  if (/^\/admin\/content\/announcements\/[^/]+$/.test(pathname)) {
    return "communications.templates.manage";
  }
  if (/^\/admin\/content\/email-templates\/[^/]+$/.test(pathname)) {
    return "communications.templates.manage";
  }
  if (/^\/admin\/content\/push-templates\/[^/]+$/.test(pathname)) {
    return "communications.templates.manage";
  }
  if (/^\/admin\/notifications\/campaigns\/[^/]+$/.test(pathname)) {
    return "notifications.campaigns.manage";
  }
  if (/^\/admin\/notifications\/campaigns\/new$/.test(pathname)) {
    return "notifications.campaigns.manage";
  }
  if (/^\/admin\/notifications\/transactional\/[^/]+$/.test(pathname)) {
    return "notifications.read";
  }
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (
      pathname === rule.match
      || (rule.match !== "/admin" && pathname.startsWith(`${rule.match}/`))
    ) {
      return rule.permission;
    }
  }
  return pathname.startsWith("/admin") ? "forbidden" : undefined;
}
