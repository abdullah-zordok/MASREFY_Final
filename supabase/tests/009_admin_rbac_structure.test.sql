begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'admin_profiles', 'admin profiles exist');
select has_table('public', 'roles', 'roles exist');
select has_table('public', 'permissions', 'permissions exist');
select has_table('public', 'role_permissions', 'role permissions exist');
select has_table('public', 'admin_role_assignments', 'Admin assignments exist');
select has_table('public', 'admin_invitations', 'Admin invitations exist');
select has_table('public', 'security_events', 'security events exist');
select has_table('audit', 'audit_events', 'audit events exist');
select has_table('private', 'support_access_requests', 'support requests exist');
select has_table('private', 'support_access_grants', 'support grants exist');
select has_table('private', 'security_incidents', 'security incidents exist');
select has_table('private', 'security_incident_timeline', 'incident timeline exists');
select has_table('private', 'privacy_export_requests', 'privacy exports exist');
select has_table('private', 'account_deletion_requests', 'deletion requests exist');
select has_table('private', 'retention_policies', 'retention policies exist');
select has_table('private', 'retention_holds', 'retention holds exist');

select has_function('private', 'admin_has_permission', array['text', 'text', 'timestamp with time zone'], 'permission evaluator exists');
select has_function('private', 'assert_admin_permission', array['text'], 'permission assertion exists');
select has_function('private', 'assert_support_grant', array['text', 'text', 'text'], 'support assertion exists');
select has_function('audit', 'append_event', array['text','text','text','text','text','text','text','text','text','jsonb'], 'audit append exists');

select is((select count(*)::integer from public.roles where system_role), 7, 'seven system roles seed');
select is((select count(*)::integer from public.permissions), 154, '151 client plus three backend-only canonical permissions seeded');
select is((select count(*)::integer from public.roles where system_role and enabled), 7, 'all system roles start enabled');

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid = any(array[
  'public.admin_profiles'::regclass, 'public.roles'::regclass, 'public.permissions'::regclass,
  'public.role_permissions'::regclass, 'public.admin_role_assignments'::regclass,
  'public.admin_invitations'::regclass, 'public.security_events'::regclass
])), 'all owned public tables enable and force RLS');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid = any(array[
  'audit.audit_events'::regclass, 'private.support_access_requests'::regclass,
  'private.support_access_grants'::regclass, 'private.security_incidents'::regclass,
  'private.security_incident_timeline'::regclass, 'private.privacy_export_requests'::regclass,
  'private.account_deletion_requests'::regclass, 'private.retention_policies'::regclass,
  'private.retention_holds'::regclass
])), 'all owned private and audit tables enable and force RLS');

select is((select count(*)::integer from information_schema.role_table_grants where grantee in ('PUBLIC','anon','authenticated') and table_schema in ('public','private','audit') and table_name in (
  'admin_profiles','roles','permissions','role_permissions','admin_role_assignments','admin_invitations',
  'security_events','audit_events','support_access_requests','support_access_grants','security_incidents',
  'security_incident_timeline','privacy_export_requests','account_deletion_requests','retention_policies','retention_holds'
)), 0, 'no owned table grants expose every column to client roles');
select ok(has_column_privilege('authenticated', 'public.security_events', 'event_type', 'SELECT'), 'authenticated can select owner-safe security event fields');
select ok(not has_column_privilege('authenticated', 'public.security_events', 'ip_hash', 'SELECT'), 'authenticated cannot select network evidence');
select ok(not has_table_privilege('authenticated', 'audit.audit_events', 'SELECT'), 'authenticated cannot read audit evidence');
select ok(not has_table_privilege('masarifi_api', 'audit.audit_events', 'UPDATE'), 'API cannot update audit evidence');
select ok(not has_table_privilege('masarifi_worker', 'public.security_events', 'UPDATE'), 'worker cannot update security evidence');
select ok(not has_function_privilege('public', 'private.admin_has_permission(text,text,timestamptz)', 'EXECUTE'), 'PUBLIC cannot execute permission evaluator');
select ok(not has_function_privilege('authenticated', 'audit.append_event(text,text,text,text,text,text,text,text,text,jsonb)', 'EXECUTE'), 'authenticated cannot append audit evidence');

select * from finish();
rollback;
