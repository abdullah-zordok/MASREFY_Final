import type {
  AdminSession,
  AttentionItem,
  GlobalSearchResult,
  NavigationGroup,
  PlatformBreakdown,
  PlatformOption,
} from "@/features/foundation/contracts";

export const adminSessionFixture: AdminSession = {
  id: "user_demo_admin_001",
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
  activeSessionCount: 1,
  version: 1,
};

export const navigationFixture: NavigationGroup[] = [
  {
    id: "platform",
    labelKey: "المنصة",
    items: [
      { id: "overview", labelKey: "نظرة عامة", route: "/admin", iconKey: "layout-dashboard", permission: "admin.overview.read", availability: "active" },
      { id: "health", labelKey: "صحة النظام", route: "/admin/system-health", iconKey: "heart-pulse", permission: "system-health.read", availability: "active" },
      { id: "health-api", labelKey: "API Monitoring", route: "/admin/system-health/api", iconKey: "activity", permission: "system-health.api.read", availability: "active" },
      { id: "health-database", labelKey: "Database Monitoring", route: "/admin/system-health/database", iconKey: "database", permission: "system-health.database.read", availability: "active" },
      { id: "health-storage", labelKey: "Storage Monitoring", route: "/admin/system-health/storage", iconKey: "database", permission: "system-health.storage.read", availability: "active" },
      { id: "health-providers", labelKey: "Provider Health", route: "/admin/system-health/providers", iconKey: "activity", permission: "system-health.providers.read", availability: "active" },
      { id: "jobs", labelKey: "المهام وقوائم الانتظار", route: "/admin/jobs/queues", iconKey: "activity", permission: "jobs.queues.read", availability: "active" },
      { id: "job-runs", labelKey: "Job Runs", route: "/admin/jobs/runs", iconKey: "activity", permission: "jobs.runs.read", availability: "active" },
      { id: "scheduled-jobs", labelKey: "Scheduled Jobs", route: "/admin/jobs/scheduled", iconKey: "activity", permission: "jobs.schedules.read", availability: "active" },
    ],
  },
  {
    id: "customers",
    labelKey: "العملاء والإيرادات",
    items: [
      { id: "users", labelKey: "المستخدمون", route: "/admin/users", iconKey: "users", permission: "users.read", availability: "active" },
      { id: "access-requests", labelKey: "طلبات الوصول", route: "/admin/access-requests", iconKey: "shield-check", permission: "support.access.read", availability: "active" },
      { id: "subscriptions", labelKey: "الاشتراكات", route: "/admin/subscriptions", iconKey: "credit-card", permission: "subscriptions.read", availability: "active" },
      { id: "payments", labelKey: "المدفوعات", route: "/admin/payments", iconKey: "dollar-sign", permission: "payments.read", availability: "active" },
    ],
  },
  {
    id: "operations",
    labelKey: "العمليات",
    items: [
      { id: "imports", labelKey: "الاستيراد والمعاملات", route: "/admin/imports", iconKey: "file-input", permission: "imports.read", availability: "active" },
      { id: "parsers", labelKey: "إدارة المحللات", route: "/admin/parsers/banks", iconKey: "database", permission: "parsers.coverage.read", availability: "active" },
      { id: "ai", labelKey: "إدارة الذكاء الاصطناعي", route: "/admin/ai", iconKey: "activity", permission: "ai.overview.read", availability: "active" },
    ],
  },
  {
    id: "communications",
    labelKey: "Communications",
    items: [
      { id: "support-overview", labelKey: "Support overview", route: "/admin/support", iconKey: "activity", permission: "support.tickets.read", availability: "active" },
      { id: "support-tickets", labelKey: "Support tickets", route: "/admin/support/tickets", iconKey: "activity", permission: "support.tickets.read", availability: "active" },
      { id: "support-ticket-detail", labelKey: "Ticket TKT-1001", route: "/admin/support/tickets/TKT-1001", iconKey: "activity", permission: "support.tickets.read", availability: "active" },
      { id: "support-categories", labelKey: "Support categories", route: "/admin/support/categories", iconKey: "database", permission: "support.categories.manage", availability: "active" },
      { id: "feedback-overview", labelKey: "Feedback overview", route: "/admin/feedback", iconKey: "activity", permission: "feedback.read", availability: "active" },
      { id: "feedback-detail", labelKey: "Feedback FDB-1001", route: "/admin/feedback/FDB-1001", iconKey: "activity", permission: "feedback.read", availability: "active" },
      { id: "feedback-abuse", labelKey: "Abuse reports", route: "/admin/feedback/abuse", iconKey: "shield-check", permission: "feedback.abuse.manage", availability: "active" },
      { id: "content-categories", labelKey: "Default categories", route: "/admin/content/categories", iconKey: "database", permission: "content.categories.manage", availability: "active" },
      { id: "content-category-detail", labelKey: "Category CAT-1001", route: "/admin/content/categories/CAT-1001", iconKey: "database", permission: "content.categories.manage", availability: "active" },
      { id: "content-tips", labelKey: "Financial tips", route: "/admin/content/tips", iconKey: "activity", permission: "content.manage", availability: "active" },
      { id: "content-faqs", labelKey: "FAQs", route: "/admin/content/faqs", iconKey: "activity", permission: "content.manage", availability: "active" },
      { id: "content-onboarding", labelKey: "Onboarding", route: "/admin/content/onboarding", iconKey: "activity", permission: "content.manage", availability: "active" },
      { id: "content-help-center", labelKey: "Help center", route: "/admin/content/help-center", iconKey: "activity", permission: "content.manage", availability: "active" },
      { id: "content-announcements", labelKey: "Announcements", route: "/admin/content/announcements", iconKey: "activity", permission: "communications.templates.manage", availability: "active" },
      { id: "content-email-templates", labelKey: "Email templates", route: "/admin/content/email-templates", iconKey: "activity", permission: "communications.templates.manage", availability: "active" },
      { id: "content-push-templates", labelKey: "Push templates", route: "/admin/content/push-templates", iconKey: "activity", permission: "communications.templates.manage", availability: "active" },
      { id: "notifications-overview", labelKey: "Notifications", route: "/admin/notifications", iconKey: "activity", permission: "notifications.read", availability: "active" },
      { id: "notification-campaigns", labelKey: "Campaigns", route: "/admin/notifications/campaigns", iconKey: "activity", permission: "notifications.campaigns.manage", availability: "active" },
      { id: "notification-campaign-new", labelKey: "New campaign", route: "/admin/notifications/campaigns/new", iconKey: "activity", permission: "notifications.campaigns.manage", availability: "active" },
      { id: "notification-campaign-detail", labelKey: "Campaign CMP-1001", route: "/admin/notifications/campaigns/CMP-1001", iconKey: "activity", permission: "notifications.campaigns.manage", availability: "active" },
      { id: "notification-transactional", labelKey: "Transactional templates", route: "/admin/notifications/transactional", iconKey: "activity", permission: "notifications.read", availability: "active" },
      { id: "notification-delivery-logs", labelKey: "Delivery logs", route: "/admin/notifications/delivery-logs", iconKey: "activity", permission: "notifications.read", availability: "active" },
    ],
  },
  {
    id: "governance",
    labelKey: "الحوكمة",
    items: [
      { id: "security", labelKey: "الأمان", route: "/admin/security", iconKey: "shield-check", permission: "security.events.read", availability: "active" },
      { id: "audit-logs", labelKey: "سجلات التدقيق", route: "/admin/audit", iconKey: "activity", permission: "audit.logs.read", availability: "active" },
      { id: "data-requests", labelKey: "طلبات البيانات", route: "/admin/data-requests/exports", iconKey: "database", permission: "data_requests.exports.read", availability: "active" },
      { id: "admin-team", labelKey: "Admin Team", route: "/admin/admin-team", iconKey: "users", permission: "admin-team.read", availability: "active" },
      { id: "roles", labelKey: "Roles and Permissions", route: "/admin/roles", iconKey: "shield-check", permission: "roles.read", availability: "active" },
      { id: "settings", labelKey: "System Settings", route: "/admin/settings", iconKey: "settings", permission: "settings.general.read", availability: "active" },
    ],
  },
];

export const attentionFixture: AttentionItem[] = [
  { id: "ATT-DEMO-queue-1", type: "queue", severity: "medium", summary: "تراكم تجريبي في قائمة انتظار التقارير.", occurredAt: "2026-07-27T04:05:00+03:00", platformScope: "global", permission: "system-health.read", destination: "/admin/system-health" },
  { id: "ATT-DEMO-payment-1", type: "payment", severity: "high", summary: "ارتفاع تجريبي في فشل المدفوعات.", occurredAt: "2026-07-27T08:10:00+03:00", platformScope: "all", permission: "attention.read" },
  { id: "ATT-DEMO-incident-1", type: "incident", severity: "critical", summary: "حادث تجريبي حرج في مزود الذكاء الاصطناعي.", occurredAt: "2026-07-27T07:42:00+03:00", platformScope: "global", permission: "system-health.read", destination: "/admin/system-health" },
  { id: "ATT-DEMO-import-1", type: "import", severity: "high", summary: "ارتفاع تجريبي في فشل الاستيراد.", occurredAt: "2026-07-27T06:18:00+03:00", platformScope: "android", permission: "imports.read", destination: "/admin/imports" },
  { id: "ATT-DEMO-ai-1", type: "ai-provider", severity: "critical", summary: "انقطاع تجريبي جزئي لمزود الذكاء الاصطناعي.", occurredAt: "2026-07-27T09:30:00+03:00", platformScope: "global", permission: "attention.read" },
  { id: "ATT-DEMO-security-1", type: "security", severity: "high", summary: "تنبيه أمان تجريبي يتطلب مراجعة.", occurredAt: "2026-07-27T09:05:00+03:00", platformScope: "all", permission: "attention.read" },
  { id: "ATT-DEMO-deletion-1", type: "account-deletion", severity: "medium", summary: "فشل تجريبي في إكمال حذف حساب.", occurredAt: "2026-07-27T03:40:00+03:00", platformScope: "ios", permission: "attention.read" },
  { id: "ATT-DEMO-support-1", type: "support", severity: "low", summary: "تذكرة دعم تجريبية ذات أولوية عالية.", occurredAt: "2026-07-27T09:45:00+03:00", platformScope: "all", permission: "users.read", destination: "/admin/users" },
  { id: "ATT-DEMO-info-1", type: "incident", severity: "info", summary: "ملاحظة تشغيلية تجريبية.", occurredAt: "2026-07-27T10:00:00+03:00", platformScope: "global", permission: "attention.read" },
  { id: "ATT-DEMO-admin-governance-1", type: "admin-governance", severity: "high", summary: "Admin role governance review requires attention.", occurredAt: "2026-08-01T12:00:00+03:00", platformScope: "global", permission: "admin-team.read", destination: "/admin/admin-team" },
  { id: "ATT-DEMO-settings-1", type: "settings", severity: "medium", summary: "Maintenance settings are scheduled for mock review.", occurredAt: "2026-08-01T11:30:00+03:00", platformScope: "global", permission: "settings.maintenance.read", destination: "/admin/settings/maintenance" },
];

export const searchFixture: GlobalSearchResult[] = [
  { id: "NAV-OVERVIEW", entityType: "navigation", primaryLabel: "Demo navigation overview", route: "/admin", permission: "admin.overview.read" },
  { id: "USR-10***", entityType: "user", primaryLabel: "Noura user demo", secondaryLabel: "n***@example.test", route: "/admin/users", permission: "users.read" },
  { id: "SUB-DEMO-PREMIUM", entityType: "subscription", primaryLabel: "Premium subscription demo", secondaryLabel: "masked customer summary", route: "/admin/subscriptions", permission: "subscriptions.read" },
  { id: "PAY-DEMO-FAILED", entityType: "payment_event", primaryLabel: "Failed payment event demo", secondaryLabel: "safe payment reference", route: "/admin/payments", permission: "payments.read" },
  { id: "IMP-77***", entityType: "import", primaryLabel: "Import session demo", route: "/admin/imports", permission: "imports.read" },
  { id: "TKT-DEMO-URGENT", entityType: "support_ticket", primaryLabel: "Urgent support ticket demo", secondaryLabel: "no customer message", route: "/admin/support/tickets/TKT-1001", permission: "support.tickets.read" },
  { id: "AUD-DEMO-GOVERNANCE", entityType: "audit_event", primaryLabel: "Governance audit event demo", secondaryLabel: "safe audit reference", route: "/admin/audit", permission: "audit.logs.read" },
  { id: "JOB-DEMO-QUEUE", entityType: "job", primaryLabel: "Queue job run demo", secondaryLabel: "retry-safe operation", route: "/admin/jobs/runs", permission: "jobs.runs.read" },
  { id: "PRL-DEMO-RULE", entityType: "parser_rule", primaryLabel: "Parser rule demo", secondaryLabel: "safe rule metadata", route: "/admin/parsers/rules", permission: "parsers.rules.read" },
  { id: "BNK-DEMO-SUPPORTED", entityType: "bank", primaryLabel: "Supported bank demo", secondaryLabel: "coverage summary", route: "/admin/parsers/banks", permission: "parsers.coverage.read" },
  { id: "NAV-IMPORT-SESSIONS", entityType: "navigation", primaryLabel: "Import sessions", route: "/admin/imports/sessions", permission: "imports.read" },
  { id: "NAV-IMPORT-FAILURES", entityType: "navigation", primaryLabel: "Failed imports", route: "/admin/imports/failed", permission: "imports.failures.manage" },
  { id: "NAV-PARSER-BANKS", entityType: "navigation", primaryLabel: "Supported banks", route: "/admin/parsers/banks", permission: "parsers.coverage.read" },
  { id: "NAV-PARSER-RULES", entityType: "navigation", primaryLabel: "Parser rules", route: "/admin/parsers/rules", permission: "parsers.rules.read" },
  { id: "NAV-PARSER-VERSIONS", entityType: "navigation", primaryLabel: "Parser versions", route: "/admin/parsers/versions", permission: "parsers.versions.manage" },
  { id: "NAV-AI-OVERVIEW", entityType: "navigation", primaryLabel: "AI overview", route: "/admin/ai", permission: "ai.overview.read" },
  { id: "NAV-AI-PROVIDERS", entityType: "navigation", primaryLabel: "AI providers", route: "/admin/ai/providers", permission: "ai.providers.read" },
  { id: "NAV-AI-USAGE", entityType: "navigation", primaryLabel: "AI usage", route: "/admin/ai/usage", permission: "ai.usage.read" },
  { id: "ADM-DEMO-SEARCH-SECURITY", entityType: "admin_user", primaryLabel: "Maha Security demo", secondaryLabel: "m***@example.test - Security", route: "/admin/admin-team/ADM-DEMO-SECURITY-02", permission: "admin-team.read" },
];

export const platformOptionsFixture: PlatformOption[] = [
  { value: "all", labelKey: "الكل", isDefault: true },
  { value: "ios", labelKey: "iOS", isDefault: false },
  { value: "android", labelKey: "Android", isDefault: false },
];

export const platformBreakdownsFixture: Record<string, PlatformBreakdown> = {
  "ios-only": { total: 54, ios: 54, android: 0, metricKind: "devices" },
  "android-only": { total: 46, ios: 0, android: 46, metricKind: "devices" },
  "multi-platform": { total: 90, ios: 54, android: 46, multiPlatformCustomers: 10, metricKind: "unique-customers" },
  "multi-device": { total: 120, ios: 64, android: 56, metricKind: "devices" },
};
