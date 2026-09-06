delete from private.job_attempts where run_id in (select id from private.job_runs where job_key like 'operations.perf-fixture.%');
delete from private.job_runs where job_key like 'operations.perf-fixture.%';
delete from private.scheduled_jobs where job_key like 'operations.perf-fixture.%';

insert into public.profiles(id,status) values ('operations-performance','active') on conflict(id) do update set status='active';
insert into public.admin_profiles(user_id,status) values ('operations-performance','active') on conflict(user_id) do update set status='active';
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'operations-performance',id,'operations-performance','Phase 13 measured performance harness' from public.roles where key='super-admin'
on conflict(user_id,role_id) where revoked_at is null do nothing;

insert into private.scheduled_jobs(
  job_key,owner_spec,job_type,schedule,enabled,timeout_seconds,max_attempts,
  retry_safe,cancel_safe,next_run_at
)
select 'operations.perf-fixture.'||value,13,'operations.perf-fixture',
  '{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,
  true,30,3,true,true,clock_timestamp()+interval '1 hour'
from generate_series(1,10000) value;

insert into private.provider_health_checks(provider_key,check_type,status,latency_ms,checked_at)
select (array['database','storage','identity','ai','email','push'])[(value%6)+1],
  'performance','up',value%250,clock_timestamp()-make_interval(secs=>value)
from generate_series(1,10000) value;
