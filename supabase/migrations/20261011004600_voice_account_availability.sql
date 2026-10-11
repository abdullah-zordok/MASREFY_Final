grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

-- Keep capped aliases and their order intact: removing unavailable references
-- could incorrectly make a truncated account window appear complete.
alter function private.get_ai_work_input(text,uuid,uuid) rename to get_ai_work_input_before_account_availability;
revoke all on function private.get_ai_work_input_before_account_availability(text,uuid,uuid) from public,anon,authenticated,masarifi_api,masarifi_worker;

create function private.get_ai_work_input(p_kind text,p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; owner_id text;
begin
  result:=private.get_ai_work_input_before_account_availability(p_kind,p_id,p_token);
  if p_kind='voice.transcribe_extract' then
    select user_id into owner_id from public.voice_sessions where id=p_id;
    result:=jsonb_set(result,'{aliases}',coalesce((
      select jsonb_agg(case when ref->>'kind'='account' then
        jsonb_set(ref,'{data}',ref->'data'||jsonb_build_object('available',exists(
          select 1 from public.accounts a join public.currencies c on c.code=a.currency_code
          where a.id=(ref->>'id')::uuid and a.user_id=owner_id and a.status='active' and a.deleted_at is null and c.enabled
        ))) else ref end order by ordinality)
      from jsonb_array_elements(result->'aliases') with ordinality refs(ref,ordinality)
    ),'[]'::jsonb));
  end if;
  return result;
end $$;

revoke all on function private.get_ai_work_input(text,uuid,uuid) from public,anon,authenticated,masarifi_api;
grant execute on function private.get_ai_work_input(text,uuid,uuid) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
