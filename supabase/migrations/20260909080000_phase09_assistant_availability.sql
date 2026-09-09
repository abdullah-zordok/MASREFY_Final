grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create function private.get_assistant_availability(p_user_id text, p_policy_version text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  used_count integer;
  first_used_at timestamptz;
  consented boolean;
  available boolean;
begin
  perform private.ai_assert_owner(p_user_id);

  select exists(
    select 1
    from public.assistant_consents
    where user_id = p_user_id
      and policy_version = p_policy_version
      and revoked_at is null
  ) into consented;

  select count(*), min(created_at)
  into used_count, first_used_at
  from private.ai_usage_events
  where user_id = p_user_id
    and created_at > statement_timestamp() - interval '24 hours'
    and reservation_status <> 'released';

  available := private.ai_workload_available('financial_assistant');

  return jsonb_build_object(
    'status', case
      when not consented or not available then 'disabled'
      when used_count >= 5 then 'limit_reached'
      else 'available'
    end,
    'limit', 5,
    'used', used_count,
    'remaining', greatest(0, 5 - used_count),
    'resetsAt', coalesce(first_used_at, statement_timestamp()) + interval '24 hours'
  );
end;
$$;

alter function private.get_assistant_availability(text, text) owner to masarifi_migration;
revoke all on function private.get_assistant_availability(text, text)
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
grant execute on function private.get_assistant_availability(text, text) to masarifi_api;

alter table public.assistant_consents
  add column version bigint not null default 1 check (version > 0);

update public.assistant_consents
set revoked_at = clock_timestamp()
where revoked_at is null
  and policy_version <> 'assistant-privacy-v1';

alter table public.assistant_consents
  add constraint assistant_consents_active_policy_ck
  check (revoked_at is not null or policy_version = 'assistant-privacy-v1');

create or replace function private.get_assistant_consent(
  p_user_id text,
  p_policy_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  consent_row public.assistant_consents%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  select * into consent_row
  from public.assistant_consents
  where user_id = p_user_id
    and policy_version = p_policy_version;
  return jsonb_build_object(
    'policyVersion', p_policy_version,
    'granted', consent_row.id is not null and consent_row.revoked_at is null,
    'grantedAt', consent_row.granted_at,
    'revokedAt', consent_row.revoked_at,
    'version', coalesce(consent_row.version, 1)
  );
end;
$$;

alter function private.get_assistant_consent(text, text) owner to masarifi_migration;

revoke all on function private.set_assistant_consent(text, text, boolean)
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
drop function private.set_assistant_consent(text, text, boolean);

create function private.set_assistant_consent(
  p_user_id text,
  p_policy_version text,
  p_enabled boolean,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent_row public.assistant_consents%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai-consent:' || p_user_id, 0));
  if p_policy_version <> 'assistant-privacy-v1' then
    raise exception using errcode = '40001', message = 'AI_CONSENT_POLICY_CONFLICT';
  end if;

  select * into consent_row
  from public.assistant_consents
  where user_id = p_user_id
    and policy_version = p_policy_version
  for update;

  if consent_row.id is null then
    if p_expected_version <> 1 then
      raise exception using errcode = '40001', message = 'AI_CONSENT_VERSION_CONFLICT';
    end if;
    insert into public.assistant_consents(
      user_id,
      policy_version,
      granted_at,
      revoked_at,
      version
    )
    values (
      p_user_id,
      p_policy_version,
      clock_timestamp(),
      case when p_enabled then null else clock_timestamp() end,
      2
    )
    returning * into consent_row;
  else
    if consent_row.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'AI_CONSENT_VERSION_CONFLICT';
    end if;
    update public.assistant_consents
    set granted_at = case when p_enabled then clock_timestamp() else granted_at end,
        revoked_at = case when p_enabled then null else clock_timestamp() end,
        version = version + 1
    where id = consent_row.id
    returning * into consent_row;
  end if;

  if not p_enabled then
    update public.assistant_messages
    set work_status = 'cancelled',
        failure_code = 'AI_CONSENT_REVOKED',
        claim_token = null,
        claimed_by = null,
        lease_until = null
    where user_id = p_user_id
      and role = 'user'
      and work_status = 'queued';
  end if;

  return jsonb_build_object(
    'policyVersion', p_policy_version,
    'granted', p_enabled,
    'grantedAt', consent_row.granted_at,
    'revokedAt', consent_row.revoked_at,
    'version', consent_row.version
  );
end;
$$;

alter function private.set_assistant_consent(text, text, boolean, bigint)
  owner to masarifi_migration;
revoke all on function private.set_assistant_consent(text, text, boolean, bigint)
  from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
grant execute on function private.set_assistant_consent(text, text, boolean, bigint)
  to masarifi_api;

reset role;
revoke masarifi_migration from current_user;
