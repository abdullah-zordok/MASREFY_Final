grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.admin_has_permission(
  p_admin_id text,
  p_permission_key text,
  p_at_time timestamptz default clock_timestamp()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_admin_id is not null
    and p_permission_key is not null
    and p_at_time is not null
    and p_admin_id = btrim(p_admin_id)
    and char_length(p_admin_id) between 1 and 128
    and p_permission_key ~ '^[a-z][a-z0-9_.-]{2,127}$'
    and exists (
      select 1
      from public.profiles as profile
      join public.admin_profiles as admin on admin.user_id = profile.id
      join public.admin_role_assignments as assignment on assignment.user_id = admin.user_id
      join public.roles as role on role.id = assignment.role_id
      join public.role_permissions as mapping on mapping.role_id = role.id
      join public.permissions as permission on permission.id = mapping.permission_id
      where profile.id = p_admin_id
        and profile.status = 'active'
        and admin.status = 'active'
        and role.enabled
        and assignment.revoked_at is null
        and assignment.starts_at <= p_at_time
        and (assignment.ends_at is null or assignment.ends_at > p_at_time)
        and permission.key = p_permission_key
    )
$$;
alter function private.admin_has_permission(text, text, timestamptz) owner to masarifi_migration;
revoke all on function private.admin_has_permission(text, text, timestamptz) from public;

create function private.assert_admin_permission(p_permission_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
begin
  if subject_id is null or not private.admin_has_permission(subject_id, p_permission_key, clock_timestamp()) then
    raise exception using errcode = '42501', message = 'ADMIN_PERMISSION_DENIED';
  end if;
end;
$$;
alter function private.assert_admin_permission(text) owner to masarifi_migration;
revoke all on function private.assert_admin_permission(text) from public;

create function audit.append_event(
  p_actor_id text,
  p_actor_type text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_before_hash text,
  p_after_hash text,
  p_reason text,
  p_request_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if p_actor_type not in ('user','admin','system','provider')
    or p_action is null or p_action !~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
    or p_resource_type is null or p_resource_type !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
    or jsonb_array_length(jsonb_path_query_array(p_metadata, '$.*')) > 20 or pg_column_size(p_metadata) > 4096
    or jsonb_path_exists(p_metadata, '$.* ? (@.type() == "object" || @.type() == "array")')
  then
    raise exception using errcode = '22023', message = 'AUDIT_EVENT_INVALID';
  end if;

  insert into audit.audit_events (
    actor_id, actor_type, action, resource_type, resource_id,
    before_hash, after_hash, reason, request_id, metadata
  ) values (
    p_actor_id, p_actor_type, p_action, p_resource_type, p_resource_id,
    p_before_hash, p_after_hash, p_reason, p_request_id, p_metadata
  ) returning id into event_id;
  return event_id;
end;
$$;
alter function audit.append_event(text,text,text,text,text,text,text,text,text,jsonb) owner to masarifi_migration;
revoke all on function audit.append_event(text,text,text,text,text,text,text,text,text,jsonb) from public;

create function private.assert_support_grant(
  p_target_user_id text,
  p_resource_key text,
  p_action_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
  grant_id uuid;
begin
  if not private.admin_has_permission(subject_id, 'support.access.use', clock_timestamp())
    or p_resource_key not in ('profile-contact','account-status','device-diagnostics','session-diagnostics','subscription-summary','import-summary')
    or p_action_key not in ('read-masked','read-status','read-aggregate')
  then
    raise exception using errcode = '42501', message = 'SUPPORT_GRANT_DENIED';
  end if;

  select access_grant.id into grant_id
  from private.support_access_grants as access_grant
  join private.support_access_requests as request on request.id = access_grant.request_id
  where request.user_id = p_target_user_id
    and request.assignee = subject_id
    and request.status = 'approved'
    and (not request.customer_approval_required or request.customer_approved_at is not null)
    and access_grant.admin_id = subject_id
    and access_grant.revoked_at is null
    and access_grant.starts_at <= clock_timestamp()
    and access_grant.ends_at > clock_timestamp()
    and access_grant.scope @> jsonb_build_array(jsonb_build_object(
      'resource', p_resource_key,
      'actions', jsonb_build_array(p_action_key)
    ))
  order by access_grant.starts_at desc, access_grant.id
  limit 1;

  if grant_id is null then
    raise exception using errcode = '42501', message = 'SUPPORT_GRANT_DENIED';
  end if;
  return grant_id;
end;
$$;
alter function private.assert_support_grant(text,text,text) owner to masarifi_migration;
revoke all on function private.assert_support_grant(text,text,text) from public;

create function private.protect_security_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'permissions' and (tg_op = 'DELETE' or new.key is distinct from old.key or new.resource is distinct from old.resource or new.action is distinct from old.action) then
    raise exception using errcode = '42501', message = 'PERMISSION_DEFINITION_PROTECTED';
  end if;
  if tg_table_name = 'roles' and old.system_role and (tg_op = 'DELETE' or not new.system_role or new.key is distinct from old.key) then
    raise exception using errcode = '42501', message = 'SYSTEM_ROLE_PROTECTED';
  end if;
  return coalesce(new, old);
end;
$$;
alter function private.protect_security_definition() owner to masarifi_migration;
revoke all on function private.protect_security_definition() from public;
create trigger permissions_protected before update or delete on public.permissions
for each row execute function private.protect_security_definition();
create trigger roles_system_protected before update or delete on public.roles
for each row execute function private.protect_security_definition();

alter table public.admin_profiles enable row level security;
alter table public.admin_profiles force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.admin_role_assignments enable row level security;
alter table public.admin_role_assignments force row level security;
alter table public.admin_invitations enable row level security;
alter table public.admin_invitations force row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table audit.audit_events enable row level security;
alter table audit.audit_events force row level security;
alter table private.support_access_requests enable row level security;
alter table private.support_access_requests force row level security;
alter table private.support_access_grants enable row level security;
alter table private.support_access_grants force row level security;
alter table private.security_incidents enable row level security;
alter table private.security_incidents force row level security;
alter table private.security_incident_timeline enable row level security;
alter table private.security_incident_timeline force row level security;
alter table private.privacy_export_requests enable row level security;
alter table private.privacy_export_requests force row level security;
alter table private.account_deletion_requests enable row level security;
alter table private.account_deletion_requests force row level security;
alter table private.retention_policies enable row level security;
alter table private.retention_policies force row level security;
alter table private.retention_holds enable row level security;
alter table private.retention_holds force row level security;

revoke all on public.admin_profiles, public.roles, public.permissions, public.role_permissions,
  public.admin_role_assignments, public.admin_invitations, public.security_events
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
revoke all on audit.audit_events, private.support_access_requests, private.support_access_grants,
  private.security_incidents, private.security_incident_timeline, private.privacy_export_requests,
  private.account_deletion_requests, private.retention_policies, private.retention_holds
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
revoke all on function private.admin_has_permission(text,text,timestamptz),
  private.assert_admin_permission(text), private.assert_support_grant(text,text,text),
  audit.append_event(text,text,text,text,text,text,text,text,text,jsonb)
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;

grant usage on schema audit to masarifi_api, masarifi_worker;
grant select, insert, update on public.admin_profiles, public.roles,
  public.admin_role_assignments, public.admin_invitations to masarifi_api;
grant select on public.permissions to masarifi_api;
grant select, insert, delete on public.role_permissions to masarifi_api;
grant select, insert on public.security_events to masarifi_api;
grant select on public.security_events to authenticated;
grant insert on public.security_events to masarifi_worker;
grant select on audit.audit_events to masarifi_api;
grant select, insert, update on private.support_access_requests, private.support_access_grants,
  private.security_incidents, private.privacy_export_requests, private.account_deletion_requests,
  private.retention_policies, private.retention_holds to masarifi_api;
grant select, insert on private.security_incident_timeline to masarifi_api;
grant select, update on private.support_access_requests, private.support_access_grants,
  private.privacy_export_requests, private.account_deletion_requests to masarifi_worker;
grant select on private.retention_policies, private.retention_holds to masarifi_worker;

grant execute on function private.admin_has_permission(text,text,timestamptz),
  private.assert_admin_permission(text), private.assert_support_grant(text,text,text)
  to masarifi_api;
grant execute on function audit.append_event(text,text,text,text,text,text,text,text,text,jsonb)
  to masarifi_api, masarifi_worker;

create policy admin_profiles_api_select on public.admin_profiles for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy admin_profiles_api_insert on public.admin_profiles for insert to masarifi_api
with check (private.admin_has_permission(public.current_clerk_user_id(), 'access.invites.write', clock_timestamp()) and exists(select 1 from public.profiles where id = user_id and status = 'active'));
create policy admin_profiles_api_update on public.admin_profiles for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.disable', clock_timestamp()))
with check (status <> 'active' or exists(select 1 from public.profiles where id = user_id and status = 'active'));

create policy roles_api_select on public.roles for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.read', clock_timestamp()));
create policy roles_api_insert on public.roles for insert to masarifi_api
with check (not system_role and private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));
create policy roles_api_update on public.roles for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));
create policy permissions_api_select on public.permissions for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'permissions.read', clock_timestamp()));
create policy role_permissions_api_select on public.role_permissions for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.read', clock_timestamp()));
create policy role_permissions_api_insert on public.role_permissions for insert to masarifi_api
with check (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));
create policy role_permissions_api_delete on public.role_permissions for delete to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));

create policy admin_role_assignments_api_select on public.admin_role_assignments for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy admin_role_assignments_api_insert on public.admin_role_assignments for insert to masarifi_api
with check (assigned_by = public.current_clerk_user_id() and user_id <> assigned_by and private.admin_has_permission(assigned_by, 'access.assignments.write', clock_timestamp()));
create policy admin_role_assignments_api_update on public.admin_role_assignments for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.assignments.write', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'access.assignments.write', clock_timestamp()));
create policy admin_invitations_api_select on public.admin_invitations for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy admin_invitations_api_insert on public.admin_invitations for insert to masarifi_api
with check (invited_by = public.current_clerk_user_id() and private.admin_has_permission(invited_by, 'access.invites.write', clock_timestamp()));
create policy admin_invitations_api_update on public.admin_invitations for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.invites.write', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'access.invites.write', clock_timestamp()));

create policy security_events_owner_select on public.security_events for select to authenticated
using (user_id = public.current_clerk_user_id() and exists(select 1 from public.profiles where id = user_id and status = 'active'));
create policy security_events_api_select on public.security_events for select to masarifi_api
using (user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'security.events.read', clock_timestamp()));
create policy security_events_api_insert on public.security_events for insert to masarifi_api
with check (user_id is null or user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'security.events.read', clock_timestamp()));
create policy security_events_worker_insert on public.security_events for insert to masarifi_worker with check (true);

create policy audit_events_api_select on audit.audit_events for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'audit.read', clock_timestamp()));
create policy support_requests_api_all on private.support_access_requests for all to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'support.access.read', clock_timestamp()) or user_id = public.current_clerk_user_id())
with check (private.admin_has_permission(public.current_clerk_user_id(), 'support.access.request', clock_timestamp()) or user_id = public.current_clerk_user_id());
create policy support_grants_api_all on private.support_access_grants for all to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'support.access.read', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp()));
create policy support_requests_worker_select on private.support_access_requests for select to masarifi_worker using (true);
create policy support_requests_worker_update on private.support_access_requests for update to masarifi_worker using (true) with check (true);
create policy support_grants_worker_select on private.support_access_grants for select to masarifi_worker using (true);
create policy support_grants_worker_update on private.support_access_grants for update to masarifi_worker using (true) with check (true);

create policy security_incidents_api_all on private.security_incidents for all to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'security.incidents.manage', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'security.incidents.manage', clock_timestamp()));
create policy security_incident_timeline_api_select on private.security_incident_timeline for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'security.incidents.manage', clock_timestamp()));
create policy security_incident_timeline_api_insert on private.security_incident_timeline for insert to masarifi_api
with check (private.admin_has_permission(public.current_clerk_user_id(), 'security.incidents.manage', clock_timestamp()));

create policy privacy_exports_api_select on private.privacy_export_requests for select to masarifi_api
using (user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'privacy.exports.read', clock_timestamp()));
create policy privacy_exports_api_insert on private.privacy_export_requests for insert to masarifi_api
with check (user_id = public.current_clerk_user_id());
create policy privacy_exports_api_update on private.privacy_export_requests for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'privacy.exports.manage', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'privacy.exports.manage', clock_timestamp()));
create policy privacy_exports_worker_select on private.privacy_export_requests for select to masarifi_worker using (true);
create policy privacy_exports_worker_update on private.privacy_export_requests for update to masarifi_worker using (true) with check (true);

create policy deletion_requests_api_select on private.account_deletion_requests for select to masarifi_api
using (user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'privacy.deletions.read', clock_timestamp()));
create policy deletion_requests_api_insert on private.account_deletion_requests for insert to masarifi_api
with check (user_id = public.current_clerk_user_id());
create policy deletion_requests_api_update on private.account_deletion_requests for update to masarifi_api
using (user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'privacy.deletions.manage', clock_timestamp()))
with check (user_id = public.current_clerk_user_id() or private.admin_has_permission(public.current_clerk_user_id(), 'privacy.deletions.manage', clock_timestamp()));
create policy deletion_requests_worker_select on private.account_deletion_requests for select to masarifi_worker using (true);
create policy deletion_requests_worker_update on private.account_deletion_requests for update to masarifi_worker using (true) with check (true);

create policy retention_policies_api_all on private.retention_policies for all to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'retention.read', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()));
create policy retention_holds_api_all on private.retention_holds for all to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'retention.read', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()));
create policy retention_policies_worker_select on private.retention_policies for select to masarifi_worker using (true);
create policy retention_holds_worker_select on private.retention_holds for select to masarifi_worker using (true);

create policy admin_profiles_migration_all on public.admin_profiles for all to masarifi_migration using (true) with check (true);
create policy roles_migration_all on public.roles for all to masarifi_migration using (true) with check (true);
create policy permissions_migration_all on public.permissions for all to masarifi_migration using (true) with check (true);
create policy role_permissions_migration_all on public.role_permissions for all to masarifi_migration using (true) with check (true);
create policy admin_role_assignments_migration_all on public.admin_role_assignments for all to masarifi_migration using (true) with check (true);
create policy admin_invitations_migration_all on public.admin_invitations for all to masarifi_migration using (true) with check (true);
create policy security_events_migration_all on public.security_events for all to masarifi_migration using (true) with check (true);
create policy audit_events_migration_all on audit.audit_events for all to masarifi_migration using (true) with check (true);
create policy support_requests_migration_all on private.support_access_requests for all to masarifi_migration using (true) with check (true);
create policy support_grants_migration_all on private.support_access_grants for all to masarifi_migration using (true) with check (true);
create policy security_incidents_migration_all on private.security_incidents for all to masarifi_migration using (true) with check (true);
create policy security_incident_timeline_migration_all on private.security_incident_timeline for all to masarifi_migration using (true) with check (true);
create policy privacy_exports_migration_all on private.privacy_export_requests for all to masarifi_migration using (true) with check (true);
create policy deletion_requests_migration_all on private.account_deletion_requests for all to masarifi_migration using (true) with check (true);
create policy retention_policies_migration_all on private.retention_policies for all to masarifi_migration using (true) with check (true);
create policy retention_holds_migration_all on private.retention_holds for all to masarifi_migration using (true) with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
