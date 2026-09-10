import type { AdminRole, PermissionKey } from "./permissions";

const PHASE2_FULL: readonly PermissionKey[] = [
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

const PHASE2_SUPPORT: readonly PermissionKey[] = [
  "users.read",
  "devices.read",
  "sessions.read",
  "users.status.manage",
  "users.verification.manage",
  "sessions.revoke",
  "users.export_summary",
  "support.request_access",
  "support.access.read",
  "support.access.revoke",
  "support.access.use",
];

const PHASE4_IMPORT_PARSER: readonly PermissionKey[] = [
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

const PHASE5_AI_FULL: readonly PermissionKey[] = [
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

const PHASE6_SUPPORT: readonly PermissionKey[] = [
  "support.overview.read",
  "support.tickets.read",
  "support.tickets.manage",
  "support.tickets.detail.read",
  "support.tickets.assign",
  "support.tickets.priority",
  "support.tickets.reply",
  "support.tickets.notes",
  "support.tickets.resolve",
  "support.categories.read",
  "support.categories.manage",
];

const PHASE6_FEEDBACK: readonly PermissionKey[] = [
  "feedback.read",
  "feedback.manage",
  "feedback.overview.read",
  "feedback.items.read",
  "feedback.items.detail.read",
  "feedback.items.link",
  "feedback.items.manage",
];

const PHASE6_ABUSE: readonly PermissionKey[] = [
  "feedback.abuse.manage",
  "abuse.overview.read",
  "abuse.reports.read",
  "abuse.reports.detail.read",
  "abuse.reports.manage",
];

const PHASE6_CONTENT: readonly PermissionKey[] = [
  "content.categories.read",
  "content.categories.manage",
  "content.manage",
  "content.tips.read",
  "content.tips.manage",
  "content.faqs.read",
  "content.faqs.manage",
  "content.onboarding.read",
  "content.onboarding.manage",
  "content.help_center.read",
  "content.help_center.manage",
  "content.announcements.read",
  "content.announcements.manage",
];

const PHASE6_TEMPLATES: readonly PermissionKey[] = [
  "communications.templates.manage",
  "templates.email.read",
  "templates.email.manage",
  "templates.push.read",
  "templates.push.manage",
  "templates.transactional.read",
];

const PHASE6_NOTIFICATIONS: readonly PermissionKey[] = [
  "notifications.read",
  "notifications.overview.read",
  "notifications.campaigns.read",
  "notifications.campaigns.detail.read",
  "notifications.campaigns.manage",
  "notifications.audience.preview",
  "notifications.delivery.read",
];

const PHASE6_FULL: readonly PermissionKey[] = [
  ...PHASE6_SUPPORT,
  ...PHASE6_FEEDBACK,
  ...PHASE6_ABUSE,
  ...PHASE6_CONTENT,
  ...PHASE6_TEMPLATES,
  ...PHASE6_NOTIFICATIONS,
];

const PHASE6_CONTENT_MANAGER: readonly PermissionKey[] = [
  ...PHASE6_CONTENT,
  ...PHASE6_TEMPLATES,
  ...PHASE6_NOTIFICATIONS,
  "feedback.read",
  "feedback.overview.read",
  "support.overview.read",
];

const PHASE6_SECURITY_ADMIN: readonly PermissionKey[] = [
  ...PHASE6_ABUSE,
  "support.overview.read",
];

const PHASE6_SUPPORT_AGENT: readonly PermissionKey[] = [
  "support.tickets.read",
  "support.tickets.manage",
  "support.tickets.detail.read",
  "support.tickets.assign",
  "support.tickets.priority",
  "support.tickets.reply",
  "support.tickets.notes",
  "support.tickets.resolve",
  "support.categories.read",
  "support.categories.manage",
  "feedback.read",
  "feedback.manage",
  "feedback.overview.read",
  "feedback.items.read",
  "feedback.items.detail.read",
  "feedback.items.link",
  "feedback.items.manage",
  "notifications.delivery.read",
];

const PHASE7_FULL: readonly PermissionKey[] = [
  "security.events.read",
  "security.incidents.manage",
  "security.admins.read",
  "security.permissions.read",
  "security.support_access.read",
  "security.support_access.revoke",
  "audit.logs.read",
  "data_requests.exports.read",
  "data_requests.exports.manage",
  "data_requests.deletions.read",
  "data_requests.deletions.manage",
  "data_retention.read",
  "data_retention.manage",
];

const PHASE8_READ: readonly PermissionKey[] = [
  "system-health.api.read",
  "system-health.database.read",
  "system-health.storage.read",
  "system-health.providers.read",
  "jobs.queues.read",
  "jobs.runs.read",
  "jobs.schedules.read",
];

const PHASE8_FULL: readonly PermissionKey[] = [
  ...PHASE8_READ,
  "jobs.runs.retry",
  "jobs.runs.cancel",
  "operations.health.read",
  "operations.providers.read",
  "operations.jobs.read",
  "operations.jobs.manage",
  "operations.incidents.read",
  "operations.incidents.manage",
  "operations.settings.read",
  "operations.settings.manage",
  "operations.flags.read",
  "operations.flags.manage",
  "operations.maintenance.read",
  "operations.maintenance.manage",
  "operations.performance.read",
  "operations.recovery.read",
];

const PHASE8_DOMAIN_RETRY: readonly PermissionKey[] = [
  "system-health.providers.read",
  "jobs.queues.read",
  "jobs.runs.read",
  "jobs.runs.retry",
  "jobs.schedules.read",
  "operations.providers.read",
  "operations.jobs.read",
  "operations.jobs.manage",
];

const PHASE8_DOMAIN_ACTIONS: readonly PermissionKey[] = [
  ...PHASE8_DOMAIN_RETRY,
  "jobs.runs.cancel",
];

const PHASE9_FULL: readonly PermissionKey[] = [
  "admin-team.read",
  "admin-team.invite",
  "admin-team.disable",
  "admin-team.sessions.revoke",
  "admin-team.roles.assign",
  "access.invites.write",
  "access.roles.read",
  "access.roles.write",
  "access.assignments.write",
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
];

const PHASE9_SECURITY_ADMIN: readonly PermissionKey[] = [
  "admin-team.read",
  "roles.read",
  "access.roles.read",
  "permissions.read",
  "settings.security.read",
  "settings.security.manage",
  "settings.maintenance.read",
  "operations.settings.read",
  "operations.settings.manage",
  "operations.flags.read",
  "operations.flags.manage",
  "operations.maintenance.read",
  "operations.maintenance.manage",
  "operations.incidents.read",
  "operations.incidents.manage",
];

export const permissionsByRole: Record<AdminRole, readonly PermissionKey[]> = {
  "super-admin": [
    "admin.overview.read",
    "system-health.read",
    "global-search.use",
    "attention.read",
    ...PHASE2_FULL,
    ...PHASE4_IMPORT_PARSER,
    "subscriptions.read",
    "subscriptions.detail.read",
    "subscriptions.manage",
    "plans.read",
    "plans.manage",
    "promotions.read",
    "promotions.manage",
    "payments.read",
    "payments.detail.read",
    "payment_failures.manage",
    "billing_reconciliation.read",
    "billing_reconciliation.manage",
    ...PHASE5_AI_FULL,
    ...PHASE6_FULL,
    ...PHASE7_FULL,
    ...PHASE8_FULL,
    ...PHASE9_FULL,
  ],
  "support-agent": [
    "admin.overview.read",
    "global-search.use",
    "attention.read",
    ...PHASE2_SUPPORT,
    "imports.read",
    "ai.overview.read",
    "ai.providers.read",
    "ai.failures.manage",
    "ai.reports.manage",
    ...PHASE6_SUPPORT_AGENT,
  ],
  "billing-operator": [
    "admin.overview.read",
    "global-search.use",
    "attention.read",
    "subscriptions.read",
    "subscriptions.detail.read",
    "subscriptions.manage",
    "plans.read",
    "plans.manage",
    "promotions.read",
    "promotions.manage",
    "payments.read",
    "payments.detail.read",
    "payment_failures.manage",
    "billing_reconciliation.read",
    "billing_reconciliation.manage",
    "ai.overview.read",
    "ai.providers.read",
    "ai.models.read",
    "ai.usage.read",
    ...PHASE8_DOMAIN_RETRY,
  ],
  "import-operator": [
    "admin.overview.read",
    ...PHASE4_IMPORT_PARSER,
    "global-search.use",
    "attention.read",
    ...PHASE8_DOMAIN_ACTIONS,
  ],
  "ai-operator": ["admin.overview.read", "global-search.use", "attention.read", ...PHASE5_AI_FULL, ...PHASE8_DOMAIN_ACTIONS],
  "content-manager": ["admin.overview.read", "global-search.use", "attention.read", ...PHASE6_CONTENT_MANAGER, ...PHASE8_DOMAIN_ACTIONS],
  "security-administrator": [
    "admin.overview.read",
    "system-health.read",
    "global-search.use",
    "attention.read",
    ...PHASE2_FULL,
    "payments.read",
    "billing_reconciliation.read",
    "imports.read",
    "parsers.coverage.read",
    "parsers.rules.read",
    "ai.overview.read",
    "ai.providers.read",
    "ai.failures.manage",
    "ai.reports.manage",
    "ai.safety.read",
    ...PHASE6_SECURITY_ADMIN,
    ...PHASE7_FULL,
    ...PHASE8_READ,
    ...PHASE9_SECURITY_ADMIN,
  ],
};

export const SIMULATED_ACTORS: Record<AdminRole, string> = {
  "super-admin": "ADM-DEMO-SUPER",
  "support-agent": "ADM-DEMO-SUPPORT",
  "billing-operator": "ADM-DEMO-BILLING",
  "import-operator": "ADM-DEMO-IMPORT",
  "ai-operator": "ADM-DEMO-AI",
  "content-manager": "ADM-DEMO-CONTENT",
  "security-administrator": "ADM-DEMO-SECURITY",
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  return permissionsByRole[role].includes(permission as PermissionKey);
}
