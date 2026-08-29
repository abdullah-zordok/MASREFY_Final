grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create function private.read_support_workspace(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
  target_id text;
  grant_id uuid;
  grant_ends_at timestamptz;
  grant_scope jsonb;
  sections jsonb;
begin
  if not private.admin_has_permission(subject_id, 'support.access.use', clock_timestamp()) then
    raise exception using errcode = '42501', message = 'SUPPORT_GRANT_DENIED';
  end if;

  select request.user_id, access_grant.id, access_grant.ends_at, access_grant.scope
    into target_id, grant_id, grant_ends_at, grant_scope
  from private.support_access_requests as request
  join private.support_access_grants as access_grant on access_grant.request_id = request.id
  where request.id = p_request_id
    and request.assignee = subject_id
    and request.status = 'approved'
    and (not request.customer_approval_required or request.customer_approved_at is not null)
    and access_grant.admin_id = subject_id
    and access_grant.revoked_at is null
    and access_grant.starts_at <= clock_timestamp()
    and access_grant.ends_at > clock_timestamp()
    and exists (select 1 from public.profiles where id = request.user_id and status = 'active')
  order by access_grant.starts_at desc, access_grant.id
  limit 1;

  if grant_id is null then
    raise exception using errcode = '42501', message = 'SUPPORT_GRANT_DENIED';
  end if;

  select coalesce(jsonb_agg(section order by section->>'resource'), '[]'::jsonb)
    into sections
  from (
    select case scope_entry->>'resource'
      when 'profile-contact' then jsonb_strip_nulls(jsonb_build_object(
        'resource', 'profile-contact', 'projection', 'masked',
        'emailMasked', case when scope_entry->'actions' ? 'read-masked' then
          (select case when primary_email is null then null else left(primary_email, 2)||'***@'||split_part(primary_email, '@', 2) end from public.profiles where id = target_id) end,
        'phoneMasked', case when scope_entry->'actions' ? 'read-masked' then
          (select case when phone_e164 is null then null else left(phone_e164, 3)||repeat('*', greatest(length(phone_e164)-5, 3))||right(phone_e164, 2) end from public.profiles where id = target_id) end
      ))
      when 'account-status' then jsonb_strip_nulls(jsonb_build_object(
        'resource', 'account-status', 'projection', 'status',
        'status', case when scope_entry->'actions' ? 'read-status' then (select status from public.profiles where id = target_id) end
      ))
      when 'device-diagnostics' then jsonb_strip_nulls(jsonb_build_object(
        'resource', 'device-diagnostics', 'projection', 'aggregate',
        'total', case when scope_entry->'actions' ? 'read-aggregate' then (select count(*) from public.user_devices where user_id = target_id) end,
        'active', case when scope_entry->'actions' ? 'read-aggregate' then (select count(*) from public.user_devices where user_id = target_id and revoked_at is null) end,
        'lastSeenAt', case when scope_entry->'actions' ? 'read-status' then (select max(last_seen_at) from public.user_devices where user_id = target_id) end
      ))
      when 'session-diagnostics' then jsonb_strip_nulls(jsonb_build_object(
        'resource', 'session-diagnostics', 'projection', 'aggregate',
        'active', case when scope_entry->'actions' ? 'read-aggregate' or scope_entry->'actions' ? 'read-status'
          then (select count(*) from public.user_devices where user_id = target_id and revoked_at is null and clerk_session_id is not null) end
      ))
      else jsonb_build_object('resource', scope_entry->>'resource', 'projection', 'status', 'available', false)
    end as section
    from jsonb_array_elements(grant_scope) as scope_entry
  ) as approved_sections;

  return jsonb_build_object(
    'requestId', p_request_id,
    'grantId', grant_id,
    'expiresAt', grant_ends_at,
    'sections', sections
  );
end;
$$;

alter function private.read_support_workspace(uuid) owner to masarifi_migration;
revoke all on function private.read_support_workspace(uuid) from public, anon, authenticated, service_role, masarifi_worker;
grant execute on function private.read_support_workspace(uuid) to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
