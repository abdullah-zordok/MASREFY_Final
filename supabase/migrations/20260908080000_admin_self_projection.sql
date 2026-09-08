grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create function private.admin_active_session_count(p_user_id text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
  evaluated_at timestamptz := statement_timestamp();
  active_count integer;
begin
  if p_user_id is null
    or p_user_id <> btrim(p_user_id)
    or char_length(p_user_id) not between 1 and 128
  then
    raise exception using errcode = '22023', message = 'ADMIN_ID_INVALID';
  end if;

  if subject_id is null
    or (subject_id <> p_user_id
      and not private.admin_has_permission(subject_id, 'admin-team.read', evaluated_at))
  then
    raise exception using errcode = '42501', message = 'ADMIN_SESSION_COUNT_DENIED';
  end if;

  select count(distinct device.clerk_session_id)::integer
  into active_count
  from public.user_devices as device
  where device.user_id = p_user_id
    and device.revoked_at is null
    and device.clerk_session_id is not null;

  return active_count;
end;
$$;

alter function private.admin_active_session_count(text) owner to masarifi_migration;
revoke all on function private.admin_active_session_count(text)
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
grant execute on function private.admin_active_session_count(text) to masarifi_api;

create function private.get_admin_self_context()
returns table (
  id text,
  display_name text,
  role_keys text[],
  effective_permission_keys text[],
  active_session_count integer,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
  evaluated_at timestamptz := statement_timestamp();
begin
  if not private.admin_has_permission(subject_id, 'admin.overview.read', evaluated_at) then
    raise exception using errcode = '42501', message = 'ADMIN_SELF_CONTEXT_DENIED';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.display_name, 'Administrator'),
    array_agg(distinct role.key order by role.key)::text[],
    array_agg(distinct permission.key order by permission.key)::text[],
    private.admin_active_session_count(profile.id),
    admin.version::integer
  from public.profiles as profile
  join public.admin_profiles as admin on admin.user_id = profile.id
  join public.admin_role_assignments as assignment on assignment.user_id = admin.user_id
  join public.roles as role on role.id = assignment.role_id
  join public.role_permissions as mapping on mapping.role_id = role.id
  join public.permissions as permission on permission.id = mapping.permission_id
  where profile.id = subject_id
    and profile.status = 'active'
    and admin.status = 'active'
    and role.enabled
    and assignment.revoked_at is null
    and assignment.starts_at <= evaluated_at
    and (assignment.ends_at is null or assignment.ends_at > evaluated_at)
  group by profile.id, profile.display_name, admin.version;
end;
$$;

alter function private.get_admin_self_context() owner to masarifi_migration;
revoke all on function private.get_admin_self_context()
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
grant execute on function private.get_admin_self_context() to masarifi_api;

reset role;
revoke masarifi_migration from current_user;
