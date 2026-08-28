\set ON_ERROR_STOP on

insert into public.profiles(id,status)
select 'perf_profile_user_' || value, 'active'
from generate_series(1,10000) value
on conflict(id) do nothing;

insert into public.user_preferences(user_id)
select 'perf_profile_user_' || value
from generate_series(1,10000) value
on conflict(user_id) do nothing;

analyze public.profiles;
analyze public.user_preferences;

explain (analyze,buffers,format text)
select id,display_name,locale,timezone,status,version
from public.profiles where id='perf_profile_user_5000';

explain (analyze,buffers,format text)
select default_currency,language,theme,calendar,week_start,privacy_settings,version
from public.user_preferences where user_id='perf_profile_user_5000';

do $budget$
declare
  samples double precision[] := '{}';
  started_at timestamptz;
  p95_ms double precision;
begin
  for sample in 1..100 loop
    started_at := clock_timestamp();
    perform profile.id, preferences.user_id
    from public.profiles profile
    join public.user_preferences preferences on preferences.user_id=profile.id
    where profile.id='perf_profile_user_5000';
    samples := array_append(samples,extract(epoch from clock_timestamp()-started_at)*1000);
  end loop;
  select percentile_cont(0.95) within group(order by value)
  into p95_ms from unnest(samples) measured(value);
  if p95_ms >= 50 then raise exception 'PROFILE_QUERY_P95_BUDGET_EXCEEDED'; end if;
end
$budget$;

delete from public.user_preferences where user_id like 'perf\_profile\_user\_%' escape '\';
delete from public.profiles where id like 'perf\_profile\_user\_%' escape '\';
