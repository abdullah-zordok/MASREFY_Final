grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create or replace function private.is_valid_support_scope(p_scope jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
  select jsonb_typeof(p_scope)='array' and jsonb_array_length(p_scope) between 1 and 7
    and pg_column_size(p_scope)<=4096 and not exists(
      select 1 from jsonb_array_elements(p_scope) item
      where jsonb_typeof(item)<>'object' or item-array['resource','actions']<>'{}'::jsonb
        or item->>'resource' not in ('profile-contact','account-status','device-diagnostics','session-diagnostics','subscription-summary','import-summary','financial-report')
        or jsonb_typeof(item->'actions')<>'array' or jsonb_array_length(item->'actions') not between 1 and 3
        or exists(select 1 from jsonb_array_elements_text(item->'actions') action where action not in ('read-masked','read-status','read-aggregate'))
        or (select count(*) from jsonb_array_elements_text(item->'actions'))<>(select count(distinct action) from jsonb_array_elements_text(item->'actions') action)
    ) and (select count(*) from jsonb_array_elements(p_scope))=(select count(distinct item->>'resource') from jsonb_array_elements(p_scope) item)
$$;
alter function private.is_valid_support_scope(jsonb) owner to masarifi_migration;
revoke all on function private.is_valid_support_scope(jsonb) from public;

create or replace function private.assert_support_grant(p_target_user_id text,p_resource_key text,p_action_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare subject_id text:=public.current_clerk_user_id(); grant_id uuid;
begin
  if not private.admin_has_permission(subject_id,'support.access.use',clock_timestamp())
    or p_resource_key not in ('profile-contact','account-status','device-diagnostics','session-diagnostics','subscription-summary','import-summary','financial-report')
    or p_action_key not in ('read-masked','read-status','read-aggregate') then
    raise exception using errcode='42501',message='SUPPORT_GRANT_DENIED';
  end if;
  select g.id into grant_id from private.support_access_grants g join private.support_access_requests r on r.id=g.request_id
  where r.user_id=p_target_user_id and r.assignee=subject_id and r.status='approved'
    and (not r.customer_approval_required or r.customer_approved_at is not null)
    and g.admin_id=subject_id and g.revoked_at is null and g.starts_at<=clock_timestamp() and g.ends_at>clock_timestamp()
    and g.scope @> jsonb_build_array(jsonb_build_object('resource',p_resource_key,'actions',jsonb_build_array(p_action_key)))
  order by g.starts_at desc,g.id limit 1;
  if grant_id is null then raise exception using errcode='42501',message='SUPPORT_GRANT_DENIED'; end if;
  return grant_id;
end $$;
alter function private.assert_support_grant(text,text,text) owner to masarifi_migration;
revoke all on function private.assert_support_grant(text,text,text) from public;
grant execute on function private.assert_support_grant(text,text,text) to masarifi_api;

create function private.read_admin_report_counts(p_platform text,p_days integer)
returns table(total_users bigint,new_users bigint,ios_users bigint,android_users bigint,both_users bigint,ios_devices bigint,android_devices bigint)
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_admin_permission('admin.overview.read');
  if p_platform not in ('all','ios','android') or p_days not in (7,30,90) then raise exception using errcode='22023',message='REPORT_ADMIN_FILTER_INVALID'; end if;
  return query with device_users as (
    select d.user_id,bool_or(d.platform='ios') ios,bool_or(d.platform='android') android,
      count(*) filter(where d.platform='ios') ios_count,count(*) filter(where d.platform='android') android_count
    from public.user_devices d where d.revoked_at is null and d.platform in ('ios','android') group by d.user_id
  ) select
    count(*) filter(where p_platform='all' or (p_platform='ios' and coalesce(u.ios,false)) or (p_platform='android' and coalesce(u.android,false))),
    count(*) filter(where p.created_at>=clock_timestamp()-make_interval(days=>p_days) and (p_platform='all' or (p_platform='ios' and coalesce(u.ios,false)) or (p_platform='android' and coalesce(u.android,false)))),
    count(*) filter(where coalesce(u.ios,false)),count(*) filter(where coalesce(u.android,false)),count(*) filter(where coalesce(u.ios,false) and coalesce(u.android,false)),
    coalesce(sum(u.ios_count),0)::bigint,coalesce(sum(u.android_count),0)::bigint
  from public.profiles p left join device_users u on u.user_id=p.id where p.status<>'deleted';
end $$;
alter function private.read_admin_report_counts(text,integer) owner to masarifi_migration;
revoke all on function private.read_admin_report_counts(text,integer) from public;
grant execute on function private.read_admin_report_counts(text,integer) to masarifi_api;

create function private.read_supported_financial_report(p_target_user_id text,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare grant_id uuid; result jsonb;
begin
  if p_end<p_start or p_end>=p_start+interval '1 year' then raise exception using errcode='22023',message='REPORT_PERIOD_INVALID'; end if;
  grant_id:=private.assert_support_grant(p_target_user_id,'financial-report','read-aggregate');
  select jsonb_build_object('adminAggregate',true,'supportGrantId',grant_id,'summaries',coalesce(jsonb_agg(to_jsonb(s) order by s.currency_code),'[]'::jsonb)) into result
  from (select currency_code,sum(income_minor)::bigint income_minor,sum(expense_minor)::bigint expense_minor,sum(net_cash_flow_minor)::bigint net_cash_flow_minor
    from public.v_monthly_financial_summary where user_id=p_target_user_id and month_start between date_trunc('month',p_start)::date and date_trunc('month',p_end)::date group by currency_code) s;
  return result;
end $$;
alter function private.read_supported_financial_report(text,date,date) owner to masarifi_migration;
revoke all on function private.read_supported_financial_report(text,date,date) from public;
grant execute on function private.read_supported_financial_report(text,date,date) to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
