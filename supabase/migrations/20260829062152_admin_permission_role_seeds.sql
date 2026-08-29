grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

-- manifest-sha256:76e18f746da574fbcc356fbc389790fcd586a67fdab6232d6a5d7c4d58220788
insert into public.permissions (key, resource, action) values
  ('abuse.overview.read', 'abuse', 'overview.read'),
  ('abuse.reports.detail.read', 'abuse', 'reports.detail.read'),
  ('abuse.reports.manage', 'abuse', 'reports.manage'),
  ('abuse.reports.read', 'abuse', 'reports.read'),
  ('access.assignments.write', 'access', 'assignments.write'),
  ('access.invites.write', 'access', 'invites.write'),
  ('access.roles.read', 'access', 'roles.read'),
  ('access.roles.write', 'access', 'roles.write'),
  ('admin-team.disable', 'admin-team', 'disable'),
  ('admin-team.read', 'admin-team', 'read'),
  ('admin-team.sessions.revoke', 'admin-team', 'sessions.revoke'),
  ('admin.overview.read', 'admin', 'overview.read'),
  ('ai.failures.manage', 'ai', 'failures.manage'),
  ('ai.models.manage', 'ai', 'models.manage'),
  ('ai.models.read', 'ai', 'models.read'),
  ('ai.overview.read', 'ai', 'overview.read'),
  ('ai.prompts.manage', 'ai', 'prompts.manage'),
  ('ai.prompts.read', 'ai', 'prompts.read'),
  ('ai.providers.manage', 'ai', 'providers.manage'),
  ('ai.providers.read', 'ai', 'providers.read'),
  ('ai.reports.manage', 'ai', 'reports.manage'),
  ('ai.safety.manage', 'ai', 'safety.manage'),
  ('ai.safety.read', 'ai', 'safety.read'),
  ('ai.usage.read', 'ai', 'usage.read'),
  ('attention.read', 'attention', 'read'),
  ('audit.read', 'audit', 'read'),
  ('billing_reconciliation.manage', 'billing_reconciliation', 'manage'),
  ('billing_reconciliation.read', 'billing_reconciliation', 'read'),
  ('communications.templates.manage', 'communications', 'templates.manage'),
  ('content.announcements.manage', 'content', 'announcements.manage'),
  ('content.announcements.read', 'content', 'announcements.read'),
  ('content.categories.manage', 'content', 'categories.manage'),
  ('content.categories.read', 'content', 'categories.read'),
  ('content.faqs.manage', 'content', 'faqs.manage'),
  ('content.faqs.read', 'content', 'faqs.read'),
  ('content.help_center.manage', 'content', 'help_center.manage'),
  ('content.help_center.read', 'content', 'help_center.read'),
  ('content.manage', 'content', 'manage'),
  ('content.onboarding.manage', 'content', 'onboarding.manage'),
  ('content.onboarding.read', 'content', 'onboarding.read'),
  ('content.tips.manage', 'content', 'tips.manage'),
  ('content.tips.read', 'content', 'tips.read'),
  ('devices.read', 'devices', 'read'),
  ('devices.revoke', 'devices', 'revoke'),
  ('feedback.abuse.manage', 'feedback', 'abuse.manage'),
  ('feedback.items.detail.read', 'feedback', 'items.detail.read'),
  ('feedback.items.link', 'feedback', 'items.link'),
  ('feedback.items.manage', 'feedback', 'items.manage'),
  ('feedback.items.read', 'feedback', 'items.read'),
  ('feedback.manage', 'feedback', 'manage'),
  ('feedback.overview.read', 'feedback', 'overview.read'),
  ('feedback.read', 'feedback', 'read'),
  ('global-search.use', 'global-search', 'use'),
  ('imports.confidence.manage', 'imports', 'confidence.manage'),
  ('imports.detail.read', 'imports', 'detail.read'),
  ('imports.duplicates.manage', 'imports', 'duplicates.manage'),
  ('imports.failures.manage', 'imports', 'failures.manage'),
  ('imports.read', 'imports', 'read'),
  ('imports.unsupported.manage', 'imports', 'unsupported.manage'),
  ('jobs.queues.read', 'jobs', 'queues.read'),
  ('jobs.runs.cancel', 'jobs', 'runs.cancel'),
  ('jobs.runs.read', 'jobs', 'runs.read'),
  ('jobs.runs.retry', 'jobs', 'runs.retry'),
  ('jobs.schedules.read', 'jobs', 'schedules.read'),
  ('notifications.audience.preview', 'notifications', 'audience.preview'),
  ('notifications.campaigns.detail.read', 'notifications', 'campaigns.detail.read'),
  ('notifications.campaigns.manage', 'notifications', 'campaigns.manage'),
  ('notifications.campaigns.read', 'notifications', 'campaigns.read'),
  ('notifications.delivery.read', 'notifications', 'delivery.read'),
  ('notifications.overview.read', 'notifications', 'overview.read'),
  ('notifications.read', 'notifications', 'read'),
  ('parsers.categories.manage', 'parsers', 'categories.manage'),
  ('parsers.coverage.read', 'parsers', 'coverage.read'),
  ('parsers.merchants.manage', 'parsers', 'merchants.manage'),
  ('parsers.rules.manage', 'parsers', 'rules.manage'),
  ('parsers.rules.read', 'parsers', 'rules.read'),
  ('parsers.senders.manage', 'parsers', 'senders.manage'),
  ('parsers.tests.run', 'parsers', 'tests.run'),
  ('parsers.versions.manage', 'parsers', 'versions.manage'),
  ('payment_failures.manage', 'payment_failures', 'manage'),
  ('payments.detail.read', 'payments', 'detail.read'),
  ('payments.read', 'payments', 'read'),
  ('permissions.manage', 'permissions', 'manage'),
  ('permissions.read', 'permissions', 'read'),
  ('plans.manage', 'plans', 'manage'),
  ('plans.read', 'plans', 'read'),
  ('privacy.deletions.manage', 'privacy', 'deletions.manage'),
  ('privacy.deletions.read', 'privacy', 'deletions.read'),
  ('privacy.exports.manage', 'privacy', 'exports.manage'),
  ('privacy.exports.read', 'privacy', 'exports.read'),
  ('promotions.manage', 'promotions', 'manage'),
  ('promotions.read', 'promotions', 'read'),
  ('retention.read', 'retention', 'read'),
  ('retention.write', 'retention', 'write'),
  ('security.admins.read', 'security', 'admins.read'),
  ('security.events.read', 'security', 'events.read'),
  ('security.incidents.manage', 'security', 'incidents.manage'),
  ('security.permissions.read', 'security', 'permissions.read'),
  ('security.support_access.read', 'security', 'support_access.read'),
  ('security.support_access.revoke', 'security', 'support_access.revoke'),
  ('sessions.read', 'sessions', 'read'),
  ('sessions.revoke', 'sessions', 'revoke'),
  ('settings.ai.manage', 'settings', 'ai.manage'),
  ('settings.ai.read', 'settings', 'ai.read'),
  ('settings.flags.manage', 'settings', 'flags.manage'),
  ('settings.flags.read', 'settings', 'flags.read'),
  ('settings.general.manage', 'settings', 'general.manage'),
  ('settings.general.read', 'settings', 'general.read'),
  ('settings.imports.manage', 'settings', 'imports.manage'),
  ('settings.imports.read', 'settings', 'imports.read'),
  ('settings.maintenance.manage', 'settings', 'maintenance.manage'),
  ('settings.maintenance.read', 'settings', 'maintenance.read'),
  ('settings.mobile.manage', 'settings', 'mobile.manage'),
  ('settings.mobile.read', 'settings', 'mobile.read'),
  ('settings.security.manage', 'settings', 'security.manage'),
  ('settings.security.read', 'settings', 'security.read'),
  ('settings.subscriptions.manage', 'settings', 'subscriptions.manage'),
  ('settings.subscriptions.read', 'settings', 'subscriptions.read'),
  ('subscriptions.detail.read', 'subscriptions', 'detail.read'),
  ('subscriptions.manage', 'subscriptions', 'manage'),
  ('subscriptions.read', 'subscriptions', 'read'),
  ('support.access.approve', 'support', 'access.approve'),
  ('support.access.read', 'support', 'access.read'),
  ('support.access.request', 'support', 'access.request'),
  ('support.access.revoke', 'support', 'access.revoke'),
  ('support.access.use', 'support', 'access.use'),
  ('support.categories.manage', 'support', 'categories.manage'),
  ('support.categories.read', 'support', 'categories.read'),
  ('support.overview.read', 'support', 'overview.read'),
  ('support.tickets.assign', 'support', 'tickets.assign'),
  ('support.tickets.detail.read', 'support', 'tickets.detail.read'),
  ('support.tickets.manage', 'support', 'tickets.manage'),
  ('support.tickets.notes', 'support', 'tickets.notes'),
  ('support.tickets.priority', 'support', 'tickets.priority'),
  ('support.tickets.read', 'support', 'tickets.read'),
  ('support.tickets.reply', 'support', 'tickets.reply'),
  ('support.tickets.resolve', 'support', 'tickets.resolve'),
  ('system-health.api.read', 'system-health', 'api.read'),
  ('system-health.database.read', 'system-health', 'database.read'),
  ('system-health.providers.read', 'system-health', 'providers.read'),
  ('system-health.read', 'system-health', 'read'),
  ('system-health.storage.read', 'system-health', 'storage.read'),
  ('templates.email.manage', 'templates', 'email.manage'),
  ('templates.email.read', 'templates', 'email.read'),
  ('templates.push.manage', 'templates', 'push.manage'),
  ('templates.push.read', 'templates', 'push.read'),
  ('templates.transactional.read', 'templates', 'transactional.read'),
  ('users.export_summary', 'users', 'export_summary'),
  ('users.read', 'users', 'read'),
  ('users.status.manage', 'users', 'status.manage'),
  ('users.verification.manage', 'users', 'verification.manage')
on conflict (key) do nothing;

insert into public.roles (key, name, description, system_role, enabled) values
  ('super-admin', 'Super Admin', 'System role super-admin', true, true),
  ('support-agent', 'Support Agent', 'System role support-agent', true, true),
  ('billing-operator', 'Billing Operator', 'System role billing-operator', true, true),
  ('import-operator', 'Import Operator', 'System role import-operator', true, true),
  ('ai-operator', 'Ai Operator', 'System role ai-operator', true, true),
  ('content-manager', 'Content Manager', 'System role content-manager', true, true),
  ('security-administrator', 'Security Administrator', 'System role security-administrator', true, true)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    system_role = true,
    enabled = true
where (roles.name, roles.description, roles.system_role, roles.enabled)
  is distinct from (excluded.name, excluded.description, true, true);

create temporary table expected_system_role_permissions (
  role_key text not null,
  permission_key text not null,
  primary key (role_key, permission_key)
) on commit drop;

insert into expected_system_role_permissions
select role_key, jsonb_array_elements_text(permission_keys)
from jsonb_each('{"super-admin":["abuse.overview.read","abuse.reports.detail.read","abuse.reports.manage","abuse.reports.read","access.assignments.write","access.invites.write","access.roles.read","access.roles.write","admin-team.disable","admin-team.read","admin-team.sessions.revoke","admin.overview.read","ai.failures.manage","ai.models.manage","ai.models.read","ai.overview.read","ai.prompts.manage","ai.prompts.read","ai.providers.manage","ai.providers.read","ai.reports.manage","ai.safety.manage","ai.safety.read","ai.usage.read","attention.read","audit.read","billing_reconciliation.manage","billing_reconciliation.read","communications.templates.manage","content.announcements.manage","content.announcements.read","content.categories.manage","content.categories.read","content.faqs.manage","content.faqs.read","content.help_center.manage","content.help_center.read","content.manage","content.onboarding.manage","content.onboarding.read","content.tips.manage","content.tips.read","devices.read","devices.revoke","feedback.abuse.manage","feedback.items.detail.read","feedback.items.link","feedback.items.manage","feedback.items.read","feedback.manage","feedback.overview.read","feedback.read","global-search.use","imports.confidence.manage","imports.detail.read","imports.duplicates.manage","imports.failures.manage","imports.read","imports.unsupported.manage","jobs.queues.read","jobs.runs.cancel","jobs.runs.read","jobs.runs.retry","jobs.schedules.read","notifications.audience.preview","notifications.campaigns.detail.read","notifications.campaigns.manage","notifications.campaigns.read","notifications.delivery.read","notifications.overview.read","notifications.read","parsers.categories.manage","parsers.coverage.read","parsers.merchants.manage","parsers.rules.manage","parsers.rules.read","parsers.senders.manage","parsers.tests.run","parsers.versions.manage","payment_failures.manage","payments.detail.read","payments.read","permissions.manage","permissions.read","plans.manage","plans.read","privacy.deletions.manage","privacy.deletions.read","privacy.exports.manage","privacy.exports.read","promotions.manage","promotions.read","retention.read","retention.write","security.admins.read","security.events.read","security.incidents.manage","security.permissions.read","security.support_access.read","security.support_access.revoke","sessions.read","sessions.revoke","settings.ai.manage","settings.ai.read","settings.flags.manage","settings.flags.read","settings.general.manage","settings.general.read","settings.imports.manage","settings.imports.read","settings.maintenance.manage","settings.maintenance.read","settings.mobile.manage","settings.mobile.read","settings.security.manage","settings.security.read","settings.subscriptions.manage","settings.subscriptions.read","subscriptions.detail.read","subscriptions.manage","subscriptions.read","support.access.approve","support.access.read","support.access.request","support.access.revoke","support.access.use","support.categories.manage","support.categories.read","support.overview.read","support.tickets.assign","support.tickets.detail.read","support.tickets.manage","support.tickets.notes","support.tickets.priority","support.tickets.read","support.tickets.reply","support.tickets.resolve","system-health.api.read","system-health.database.read","system-health.providers.read","system-health.read","system-health.storage.read","templates.email.manage","templates.email.read","templates.push.manage","templates.push.read","templates.transactional.read","users.export_summary","users.read","users.status.manage","users.verification.manage"],"support-agent":["admin.overview.read","ai.failures.manage","ai.overview.read","ai.providers.read","ai.reports.manage","attention.read","devices.read","feedback.items.detail.read","feedback.items.link","feedback.items.manage","feedback.items.read","feedback.manage","feedback.overview.read","feedback.read","global-search.use","imports.read","notifications.delivery.read","sessions.read","sessions.revoke","support.access.read","support.access.request","support.access.revoke","support.access.use","support.categories.manage","support.categories.read","support.tickets.assign","support.tickets.detail.read","support.tickets.manage","support.tickets.notes","support.tickets.priority","support.tickets.read","support.tickets.reply","support.tickets.resolve","users.export_summary","users.read","users.status.manage","users.verification.manage"],"billing-operator":["admin.overview.read","ai.models.read","ai.overview.read","ai.providers.read","ai.usage.read","attention.read","billing_reconciliation.manage","billing_reconciliation.read","global-search.use","jobs.queues.read","jobs.runs.read","jobs.runs.retry","jobs.schedules.read","payment_failures.manage","payments.detail.read","payments.read","plans.manage","plans.read","promotions.manage","promotions.read","subscriptions.detail.read","subscriptions.manage","subscriptions.read","system-health.providers.read"],"import-operator":["admin.overview.read","attention.read","global-search.use","imports.confidence.manage","imports.detail.read","imports.duplicates.manage","imports.failures.manage","imports.read","imports.unsupported.manage","jobs.queues.read","jobs.runs.cancel","jobs.runs.read","jobs.runs.retry","jobs.schedules.read","parsers.categories.manage","parsers.coverage.read","parsers.merchants.manage","parsers.rules.manage","parsers.rules.read","parsers.senders.manage","parsers.tests.run","parsers.versions.manage","system-health.providers.read"],"ai-operator":["admin.overview.read","ai.failures.manage","ai.models.manage","ai.models.read","ai.overview.read","ai.prompts.manage","ai.prompts.read","ai.providers.manage","ai.providers.read","ai.reports.manage","ai.safety.manage","ai.safety.read","ai.usage.read","attention.read","global-search.use","jobs.queues.read","jobs.runs.cancel","jobs.runs.read","jobs.runs.retry","jobs.schedules.read","system-health.providers.read"],"content-manager":["admin.overview.read","attention.read","communications.templates.manage","content.announcements.manage","content.announcements.read","content.categories.manage","content.categories.read","content.faqs.manage","content.faqs.read","content.help_center.manage","content.help_center.read","content.manage","content.onboarding.manage","content.onboarding.read","content.tips.manage","content.tips.read","feedback.overview.read","feedback.read","global-search.use","jobs.queues.read","jobs.runs.cancel","jobs.runs.read","jobs.runs.retry","jobs.schedules.read","notifications.audience.preview","notifications.campaigns.detail.read","notifications.campaigns.manage","notifications.campaigns.read","notifications.delivery.read","notifications.overview.read","notifications.read","support.overview.read","system-health.providers.read","templates.email.manage","templates.email.read","templates.push.manage","templates.push.read","templates.transactional.read"],"security-administrator":["abuse.overview.read","abuse.reports.detail.read","abuse.reports.manage","abuse.reports.read","access.roles.read","admin-team.read","admin.overview.read","ai.failures.manage","ai.overview.read","ai.providers.read","ai.reports.manage","ai.safety.read","attention.read","audit.read","billing_reconciliation.read","devices.read","devices.revoke","feedback.abuse.manage","global-search.use","imports.read","jobs.queues.read","jobs.runs.read","jobs.schedules.read","parsers.coverage.read","parsers.rules.read","payments.read","permissions.read","privacy.deletions.manage","privacy.deletions.read","privacy.exports.manage","privacy.exports.read","retention.read","retention.write","security.admins.read","security.events.read","security.incidents.manage","security.permissions.read","security.support_access.read","security.support_access.revoke","sessions.read","sessions.revoke","settings.maintenance.read","settings.security.manage","settings.security.read","support.access.approve","support.access.read","support.access.request","support.access.revoke","support.access.use","support.overview.read","system-health.api.read","system-health.database.read","system-health.providers.read","system-health.read","system-health.storage.read","users.export_summary","users.read","users.status.manage","users.verification.manage"]}'::jsonb) as mapping(role_key, permission_keys);

delete from public.role_permissions as mapping
using public.roles as role
where mapping.role_id = role.id
  and role.system_role
  and not exists (
    select 1
    from expected_system_role_permissions as expected
    join public.permissions as permission on permission.key = expected.permission_key
    where expected.role_key = role.key
      and permission.id = mapping.permission_id
  );

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from expected_system_role_permissions as expected
join public.roles as role on role.key = expected.role_key
join public.permissions as permission on permission.key = expected.permission_key
on conflict do nothing;

comment on table public.permissions is 'SPEC-BE-003 manifest-sha256:76e18f746da574fbcc356fbc389790fcd586a67fdab6232d6a5d7c4d58220788';

reset role;
revoke masarifi_migration from current_user granted by current_user;
