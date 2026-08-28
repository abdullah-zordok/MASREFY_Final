\set ON_ERROR_STOP on

insert into public.profiles(id,status)
select 'perf_device_user_' || value, 'active' from generate_series(1,1000) value
on conflict(id) do nothing;

insert into public.user_devices(user_id,device_fingerprint,platform,app_version,last_seen_at)
select
  'perf_device_user_' || (1 + (value % 1000)),
  'h1:' || md5('device-a-' || value) || md5('device-b-' || value),
  case when value % 2 = 0 then 'android' else 'ios' end,
  '1.0.0', now() - (value || ' seconds')::interval
from generate_series(1,10000) value
on conflict(user_id,device_fingerprint) do nothing;

analyze public.user_devices;

explain (analyze,buffers,format text)
select id,platform,app_version,device_name,trusted_at,last_seen_at,revoked_at,created_at,version
from public.user_devices
where user_id='perf_device_user_1'
order by last_seen_at desc,id desc
limit 51;

do $budget$
declare
  samples double precision[] := '{}';
  started_at timestamptz;
  p95_ms double precision;
begin
  for sample in 1..100 loop
    started_at := clock_timestamp();
    perform id from public.user_devices
    where user_id='perf_device_user_1'
    order by last_seen_at desc,id desc limit 51;
    samples := array_append(samples,extract(epoch from clock_timestamp()-started_at)*1000);
  end loop;
  select percentile_cont(0.95) within group(order by value)
  into p95_ms from unnest(samples) measured(value);
  if p95_ms >= 50 then raise exception 'DEVICE_QUERY_P95_BUDGET_EXCEEDED'; end if;
end
$budget$;

delete from public.user_devices where user_id like 'perf\_device\_user\_%' escape '\';
delete from public.profiles where id like 'perf\_device\_user\_%' escape '\';
