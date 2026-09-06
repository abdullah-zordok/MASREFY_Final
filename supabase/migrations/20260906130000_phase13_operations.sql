grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.jsonb_object_key_count(value jsonb) returns integer
language sql immutable set search_path='' as $$
  select count(*)::integer from jsonb_object_keys(value)
$$;

create function private.valid_feature_audience(value jsonb) returns boolean
language sql immutable set search_path='' as $$
  select jsonb_typeof(value)='object'
    and private.jsonb_object_key_count(value) between 1 and 4
    and not exists(select 1 from jsonb_object_keys(value) key
      where key not in ('platform','locale','appVersion','cohort'))
    and (not value?'platform' or value->>'platform' in ('ios','android','admin'))
    and (not value?'locale' or value->>'locale' in ('ar','en'))
    and (not value?'appVersion' or value->>'appVersion' ~ '^[0-9]+(\.[0-9]+){0,2}$')
    and (not value?'cohort' or value->>'cohort' ~ '^[a-z][a-z0-9_-]{1,31}$')
    and pg_catalog.octet_length(value::text)<=1024
$$;

create function private.valid_safe_summary(value jsonb) returns boolean
language sql immutable set search_path='' as $$
  select jsonb_typeof(value)='object'
    and private.jsonb_object_key_count(value)<=20
    and pg_catalog.octet_length(value::text)<=2048
    and not exists(
      select 1 from jsonb_each(value) entry
      where entry.key !~ '^[a-z][a-zA-Z0-9_.-]{0,79}$'
        or entry.key ~* 'secret|token|password|credential|private.?key|connection|url|sql|command'
        or jsonb_typeof(entry.value) not in ('null','string','number','boolean')
        or (jsonb_typeof(entry.value)='string' and (
          char_length(entry.value#>>'{}')>500 or entry.value#>>'{}' ~ '[[:cntrl:]]'
          or entry.value#>>'{}' ~* '(https?://|postgres(ql)?://|bearer[[:space:]]+[a-z0-9._~-]{8,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
        ))
    )
$$;

create table private.scheduled_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  job_key text not null,
  owner_spec smallint not null,
  job_type text not null,
  schedule jsonb,
  enabled boolean not null default true,
  timeout_seconds integer not null,
  max_attempts smallint not null,
  configuration jsonb not null default '{}'::jsonb,
  retry_safe boolean not null default false,
  cancel_safe boolean not null default false,
  next_run_at timestamptz,
  last_registered_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  constraint scheduled_jobs_job_key_check check(job_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint scheduled_jobs_owner_check check(owner_spec between 1 and 13 and owner_spec<>12),
  constraint scheduled_jobs_type_check check(job_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint scheduled_jobs_schedule_check check(schedule is null or (
    jsonb_typeof(schedule)='object' and private.jsonb_object_key_count(schedule)=3
    and schedule->>'kind'='interval' and schedule->>'timezone'='UTC'
    and (schedule->>'everySeconds')::integer between 10 and 2678400
  )),
  constraint scheduled_jobs_schedule_time_check check((schedule is null)=(next_run_at is null)),
  constraint scheduled_jobs_timeout_check check(timeout_seconds between 1 and 600),
  constraint scheduled_jobs_attempts_check check(max_attempts between 1 and 10),
  constraint scheduled_jobs_configuration_check check(jsonb_typeof(configuration)='object' and private.jsonb_object_key_count(configuration)<=20 and pg_catalog.octet_length(configuration::text)<=2048),
  constraint scheduled_jobs_version_check check(version>0)
);
alter table private.scheduled_jobs owner to masarifi_migration;
create unique index scheduled_jobs_job_key_uq on private.scheduled_jobs(job_key);
create index scheduled_jobs_owner_idx on private.scheduled_jobs(owner_spec,job_key);
create index scheduled_jobs_due_idx on private.scheduled_jobs(next_run_at,job_key) where enabled and schedule is not null;
create index scheduled_jobs_type_idx on private.scheduled_jobs(job_type,enabled,job_key);
create trigger scheduled_jobs_version before update on private.scheduled_jobs for each row execute function private.set_updated_at_and_version();

create table private.job_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  scheduled_job_id uuid references private.scheduled_jobs(id) on delete restrict,
  job_key text not null,
  job_type text not null,
  owner_spec smallint not null,
  status text not null default 'queued',
  queued_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  correlation_id text not null,
  result_summary jsonb not null default '{}'::jsonb,
  cancel_requested_at timestamptz,
  retry_of_run_id uuid references private.job_runs(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  constraint job_runs_key_check check(job_key ~ '^[a-z][a-z0-9_.-]{2,127}$' and job_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint job_runs_owner_check check(owner_spec between 1 and 13 and owner_spec<>12),
  constraint job_runs_status_check check(status in ('queued','running','succeeded','failed','retrying','dead_lettered','canceled')),
  constraint job_runs_time_check check(started_at is null or started_at>=queued_at),
  constraint job_runs_completion_check check(
    (status in ('succeeded','failed','dead_lettered','canceled'))=(completed_at is not null)
    and (completed_at is null or (started_at is not null and completed_at>=started_at))
  ),
  constraint job_runs_correlation_check check(char_length(correlation_id) between 1 and 128 and correlation_id !~ '[[:cntrl:]]'),
  constraint job_runs_summary_check check(private.valid_safe_summary(result_summary)),
  constraint job_runs_version_check check(version>0)
);
alter table private.job_runs owner to masarifi_migration;
create index job_runs_status_time_idx on private.job_runs(status,queued_at,id);
create index job_runs_job_time_idx on private.job_runs(job_key,queued_at desc,id desc);
create index job_runs_correlation_idx on private.job_runs(correlation_id,queued_at desc);
create index job_runs_scheduled_idx on private.job_runs(scheduled_job_id,queued_at desc);
create unique index job_runs_active_uq on private.job_runs(scheduled_job_id) where status in ('queued','running','retrying');
create trigger job_runs_version before update on private.job_runs for each row execute function private.set_updated_at_and_version();

create table private.job_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references private.job_runs(id) on delete restrict,
  attempt_no smallint not null,
  worker_id text not null,
  status text not null default 'running',
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  completed_at timestamptz,
  safe_error_code text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint job_attempts_number_check check(attempt_no between 1 and 10),
  constraint job_attempts_worker_check check(char_length(worker_id) between 1 and 128 and worker_id !~ '[[:cntrl:]]'),
  constraint job_attempts_status_check check(status in ('running','succeeded','failed')),
  constraint job_attempts_completion_check check((status='running')=(completed_at is null) and heartbeat_at>=started_at and (completed_at is null or completed_at>=started_at)),
  constraint job_attempts_error_check check(safe_error_code is null or safe_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  constraint job_attempts_retry_check check(next_attempt_at is null or (status='failed' and completed_at is not null and next_attempt_at>=completed_at))
);
alter table private.job_attempts owner to masarifi_migration;
create unique index job_attempts_run_number_uq on private.job_attempts(run_id,attempt_no);
create index job_attempts_retry_idx on private.job_attempts(next_attempt_at,run_id) where status='failed' and next_attempt_at is not null;
create index job_attempts_running_idx on private.job_attempts(heartbeat_at,run_id) where status='running';

create table private.provider_health_checks (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_key text not null check(provider_key in ('database','storage','identity','ai','email','push')),
  check_type text not null check(check_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  status text not null check(status in ('up','degraded','down','unknown')),
  latency_ms integer not null check(latency_ms between 0 and 60000),
  checked_at timestamptz not null default clock_timestamp(),
  safe_error_code text check(safe_error_code is null or safe_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$')
);
alter table private.provider_health_checks owner to masarifi_migration;
create index provider_checks_key_time_idx on private.provider_health_checks(provider_key,checked_at desc,id desc);
create index provider_checks_status_time_idx on private.provider_health_checks(status,checked_at desc,id desc);

create table private.system_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null check(title=btrim(title) and char_length(title) between 5 and 160 and title !~ '[[:cntrl:]]'),
  severity text not null check(severity in ('info','warning','critical')),
  status text not null default 'open' check(status in ('open','investigating','monitoring','resolved')),
  started_at timestamptz not null,
  resolved_at timestamptz,
  public_summary text check(public_summary is null or (public_summary=btrim(public_summary) and char_length(public_summary) between 1 and 500 and public_summary !~ '[[:cntrl:]]')),
  assigned_admin_id text,
  created_by_admin_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check(version>0),
  constraint system_incidents_resolution_check check((status='resolved')=(resolved_at is not null) and (resolved_at is null or resolved_at>=started_at))
);
alter table private.system_incidents owner to masarifi_migration;
create index system_incidents_status_time_idx on private.system_incidents(status,started_at desc,id desc);
create index system_incidents_severity_time_idx on private.system_incidents(severity,started_at desc,id desc);
create index system_incidents_open_idx on private.system_incidents(started_at desc,id desc) where status<>'resolved';
create trigger system_incidents_version before update on private.system_incidents for each row execute function private.set_updated_at_and_version();

create table private.system_settings (
  setting_key text primary key check(setting_key ~ '^[a-z][a-z0-9_.-]{2,127}$' and setting_key !~* 'secret|token|password|credential|private.?key|connection|url|sql|command'),
  value jsonb not null check(jsonb_typeof(value) in ('object','array','string','number','boolean') and pg_catalog.octet_length(value::text)<=4096),
  sensitivity text not null check(sensitivity in ('public','internal','restricted')),
  updated_by_admin_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check(version>0)
);
alter table private.system_settings owner to masarifi_migration;
create trigger system_settings_version before update on private.system_settings for each row execute function private.set_updated_at_and_version();

create table private.feature_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  flag_key text not null,
  description text not null check(description=btrim(description) and char_length(description) between 10 and 240 and description !~ '[[:cntrl:]]'),
  default_enabled boolean not null default false,
  status text not null default 'draft' check(status in ('draft','active','retired')),
  created_by_admin_id text not null,
  updated_by_admin_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check(version>0),
  constraint feature_flags_key_check check(flag_key ~ '^[a-z][a-z0-9.-]{2,79}$' and flag_key !~* 'auth|permission|role|rls|audit|idempot|ledger|webhook|encrypt|release|billing|payment|subscription|entitlement|checkout|promotion|stripe')
);
alter table private.feature_flags owner to masarifi_migration;
create unique index feature_flags_key_uq on private.feature_flags(flag_key);
create index feature_flags_status_key_idx on private.feature_flags(status,flag_key);
create trigger feature_flags_version before update on private.feature_flags for each row execute function private.set_updated_at_and_version();

create table private.feature_flag_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  feature_flag_id uuid not null references private.feature_flags(id) on delete cascade,
  priority smallint not null check(priority between 1 and 1000),
  audience jsonb not null check(private.valid_feature_audience(audience)),
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check(version>0)
);
alter table private.feature_flag_rules owner to masarifi_migration;
create unique index feature_flag_rules_priority_uq on private.feature_flag_rules(feature_flag_id,priority);
create index feature_flag_rules_eval_idx on private.feature_flag_rules(feature_flag_id,enabled,priority);
create trigger feature_flag_rules_version before update on private.feature_flag_rules for each row execute function private.set_updated_at_and_version();

create table private.maintenance_windows (
  id uuid primary key default extensions.gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scope text[] not null,
  public_message jsonb not null,
  status text not null default 'scheduled' check(status in ('scheduled','active','completed','canceled')),
  created_by_admin_id text not null,
  updated_by_admin_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check(version>0),
  constraint maintenance_time_check check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
  constraint maintenance_scope_check check(cardinality(scope) between 1 and 10 and scope <@ array['api','database','storage','identity','ai','email','push','imports','reports','notifications']::text[]),
  constraint maintenance_message_check check(jsonb_typeof(public_message)='object' and private.jsonb_object_key_count(public_message)=2 and public_message?&array['ar','en'] and char_length(public_message->>'ar') between 1 and 240 and char_length(public_message->>'en') between 1 and 240)
);
alter table private.maintenance_windows owner to masarifi_migration;
create index maintenance_status_time_idx on private.maintenance_windows(status,starts_at,ends_at,id);
create trigger maintenance_windows_version before update on private.maintenance_windows for each row execute function private.set_updated_at_and_version();

create function private.guard_maintenance_overlap() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status in ('scheduled','active') and exists(
    select 1 from private.maintenance_windows existing
    where existing.id<>new.id and existing.status in ('scheduled','active')
      and existing.starts_at<new.ends_at and existing.ends_at>new.starts_at
      and existing.scope && new.scope
  ) then
    raise exception using errcode='23P01',message='OPERATIONS_MAINTENANCE_OVERLAP';
  end if;
  return new;
end $$;
alter function private.guard_maintenance_overlap() owner to masarifi_migration;
create trigger maintenance_windows_overlap before insert or update on private.maintenance_windows for each row execute function private.guard_maintenance_overlap();

create function private.guard_job_attempt_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.status<>'running' or new.id<>old.id or new.run_id<>old.run_id or new.attempt_no<>old.attempt_no
    or new.worker_id<>old.worker_id or new.started_at<>old.started_at or new.created_at<>old.created_at then
    raise exception using errcode='55000',message='OPERATIONS_ATTEMPT_IMMUTABLE';
  end if;
  return new;
end $$;
alter function private.guard_job_attempt_update() owner to masarifi_migration;
create trigger job_attempts_append_only before update on private.job_attempts for each row execute function private.guard_job_attempt_update();

create function private.register_job(
  p_job_key text,p_owner_spec smallint,p_job_type text,p_schedule jsonb,p_enabled boolean,
  p_timeout_seconds integer,p_max_attempts smallint,p_configuration jsonb,p_retry_safe boolean,p_cancel_safe boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.scheduled_jobs%rowtype; saved private.scheduled_jobs%rowtype;
begin
  if p_job_key is null or p_job_key !~ '^[a-z][a-z0-9_.-]{2,127}$'
    or p_owner_spec not between 1 and 13 or p_owner_spec=12 then
    raise exception using errcode='22023',message='OPERATIONS_JOB_OWNER_INVALID';
  end if;
  if p_job_type is null or p_job_type !~ '^[a-z][a-z0-9_.-]{2,79}$'
    or p_timeout_seconds not between 1 and 600 or p_max_attempts not between 1 and 10
    or p_enabled is null or p_retry_safe is null or p_cancel_safe is null
    or p_configuration is null or jsonb_typeof(p_configuration)<>'object'
    or private.jsonb_object_key_count(p_configuration)>20 or pg_catalog.octet_length(p_configuration::text)>2048
    or (p_schedule is not null and not (
      jsonb_typeof(p_schedule)='object' and private.jsonb_object_key_count(p_schedule)=3
      and p_schedule->>'kind'='interval' and p_schedule->>'timezone'='UTC'
      and (p_schedule->>'everySeconds')::integer between 10 and 2678400
    )) then
    raise exception using errcode='22023',message='OPERATIONS_JOB_INPUT_INVALID';
  end if;
  select * into existing from private.scheduled_jobs where job_key=p_job_key for update;
  if found then
    if existing.owner_spec<>p_owner_spec or existing.job_type<>p_job_type then
      raise exception using errcode='22023',message='OPERATIONS_JOB_OWNERSHIP_CONFLICT';
    end if;
    if (not existing.retry_safe and p_retry_safe) or (not existing.cancel_safe and p_cancel_safe) then
      raise exception using errcode='22023',message='OPERATIONS_JOB_SAFETY_BROADENING';
    end if;
    update private.scheduled_jobs set schedule=p_schedule,enabled=p_enabled,timeout_seconds=p_timeout_seconds,
      max_attempts=p_max_attempts,configuration=p_configuration,retry_safe=p_retry_safe,cancel_safe=p_cancel_safe,
      next_run_at=case when p_schedule is null then null else coalesce(next_run_at,clock_timestamp()) end,
      last_registered_at=clock_timestamp()
    where id=existing.id returning * into saved;
    return jsonb_build_object('id',saved.id,'jobKey',saved.job_key,'ownerSpec',saved.owner_spec,'version',saved.version,'outcome','updated');
  end if;
  insert into private.scheduled_jobs(job_key,owner_spec,job_type,schedule,enabled,timeout_seconds,max_attempts,configuration,retry_safe,cancel_safe,next_run_at)
    values(p_job_key,p_owner_spec,p_job_type,p_schedule,p_enabled,p_timeout_seconds,p_max_attempts,p_configuration,p_retry_safe,p_cancel_safe,
      case when p_schedule is null then null else clock_timestamp() end)
    returning * into saved;
  return jsonb_build_object('id',saved.id,'jobKey',saved.job_key,'ownerSpec',saved.owner_spec,'version',saved.version,'outcome','created');
end $$;
alter function private.register_job(text,smallint,text,jsonb,boolean,integer,smallint,jsonb,boolean,boolean) owner to masarifi_migration;

create function private.heartbeat_job_attempt(p_attempt_id uuid,p_worker_id text,p_now timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or char_length(p_worker_id) not between 1 and 128 or p_now is null then
    raise exception using errcode='22023',message='OPERATIONS_HEARTBEAT_INPUT_INVALID';
  end if;
  update private.job_attempts set heartbeat_at=p_now
  where id=p_attempt_id and worker_id=p_worker_id and status='running';
  if not found then raise exception using errcode='P0002',message='OPERATIONS_ATTEMPT_UNAVAILABLE'; end if;
end $$;
alter function private.heartbeat_job_attempt(uuid,text,timestamptz) owner to masarifi_migration;

create function private.claim_due_jobs(p_worker_id text,p_limit integer,p_now timestamptz)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare job private.scheduled_jobs%rowtype; retry record; stale record; run_id uuid; attempt_id uuid; remaining integer:=p_limit;
begin
  if p_worker_id is null or char_length(p_worker_id) not between 1 and 128 or p_worker_id ~ '[[:cntrl:]]'
    or p_limit not between 1 and 100 or p_now is null then
    raise exception using errcode='22023',message='OPERATIONS_CLAIM_INPUT_INVALID';
  end if;

  for stale in
    select a.id attempt_id,a.run_id,a.attempt_no,j.max_attempts,j.retry_safe
    from private.job_attempts a join private.job_runs r on r.id=a.run_id
    join private.scheduled_jobs j on j.id=r.scheduled_job_id
    where a.status='running' and a.heartbeat_at+make_interval(secs=>j.timeout_seconds)<=p_now
    order by a.heartbeat_at,a.id for update of a skip locked limit p_limit
  loop
    update private.job_attempts set status='failed',completed_at=p_now,safe_error_code='WORKER_LEASE_EXPIRED',
      next_attempt_at=case when stale.retry_safe and stale.attempt_no<stale.max_attempts
        then p_now+make_interval(secs=>least(300,(2^greatest(0,stale.attempt_no-1))::integer*5)) end
      where id=stale.attempt_id;
    update private.job_runs set status=case when stale.retry_safe and stale.attempt_no<stale.max_attempts then 'retrying' else 'dead_lettered' end,
      completed_at=case when stale.retry_safe and stale.attempt_no<stale.max_attempts then null else p_now end
      where id=stale.run_id;
  end loop;

  for retry in
    select a.id,a.run_id,a.attempt_no,j.job_key,j.owner_spec,j.job_type,j.timeout_seconds,j.configuration
    from private.job_attempts a join private.job_runs r on r.id=a.run_id
    join private.scheduled_jobs j on j.id=r.scheduled_job_id
    where a.status='failed' and a.next_attempt_at<=p_now and r.status='retrying'
      and not exists(select 1 from private.job_attempts newer where newer.run_id=a.run_id and newer.attempt_no>a.attempt_no)
    order by a.next_attempt_at,a.id for update of a skip locked limit remaining
  loop
    insert into private.job_attempts(run_id,attempt_no,worker_id,status,started_at,heartbeat_at)
      values(retry.run_id,retry.attempt_no+1,p_worker_id,'running',p_now,p_now) returning id into attempt_id;
    update private.job_runs set status='running',started_at=coalesce(started_at,p_now) where id=retry.run_id;
    remaining:=remaining-1;
    return next jsonb_build_object('jobKey',retry.job_key,'jobType',retry.job_type,'ownerSpec',retry.owner_spec,'runId',retry.run_id,'attemptId',attempt_id,
      'timeoutSeconds',retry.timeout_seconds,'configuration',retry.configuration);
    exit when remaining=0;
  end loop;

  if remaining=0 then return; end if;
  for job in select * from private.scheduled_jobs
    where enabled and schedule is not null and next_run_at<=p_now
      and not exists(select 1 from private.job_runs r where r.scheduled_job_id=scheduled_jobs.id and r.status in ('queued','running','retrying'))
    order by next_run_at,job_key for update skip locked limit remaining
  loop
    insert into private.job_runs(scheduled_job_id,job_key,job_type,owner_spec,status,queued_at,started_at,correlation_id)
      values(job.id,job.job_key,job.job_type,job.owner_spec,'running',p_now,p_now,extensions.gen_random_uuid()::text)
      returning id into run_id;
    insert into private.job_attempts(run_id,attempt_no,worker_id,status,started_at,heartbeat_at)
      values(run_id,1,p_worker_id,'running',p_now,p_now) returning id into attempt_id;
    update private.scheduled_jobs set next_run_at=greatest(next_run_at,p_now)+make_interval(secs=>(schedule->>'everySeconds')::integer)
      where id=job.id;
    return next jsonb_build_object('jobKey',job.job_key,'jobType',job.job_type,'ownerSpec',job.owner_spec,'runId',run_id,'attemptId',attempt_id,
      'timeoutSeconds',job.timeout_seconds,'configuration',job.configuration);
  end loop;
end $$;
alter function private.claim_due_jobs(text,integer,timestamptz) owner to masarifi_migration;

create function private.complete_job_attempt(
  p_attempt_id uuid,p_worker_id text,p_outcome text,p_safe_error_code text,p_result_summary jsonb,p_now timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt private.job_attempts%rowtype; run private.job_runs%rowtype; job private.scheduled_jobs%rowtype; final_status text; retry_at timestamptz; updated_version bigint;
begin
  if p_outcome not in ('succeeded','failed') or p_now is null
    or p_result_summary is null or not private.valid_safe_summary(p_result_summary)
    or (p_safe_error_code is not null and p_safe_error_code !~ '^[A-Z][A-Z0-9_]{2,79}$') then
    raise exception using errcode='22023',message='OPERATIONS_COMPLETION_INPUT_INVALID';
  end if;
  select * into attempt from private.job_attempts where id=p_attempt_id for update;
  if not found or attempt.status<>'running' or attempt.worker_id<>p_worker_id then
    raise exception using errcode='P0002',message='OPERATIONS_ATTEMPT_UNAVAILABLE';
  end if;
  select * into run from private.job_runs where id=attempt.run_id for update;
  select * into job from private.scheduled_jobs where id=run.scheduled_job_id;
  if run.status='canceled' then
    update private.job_attempts set status='failed',completed_at=p_now,safe_error_code='JOB_CANCELED' where id=attempt.id;
    return jsonb_build_object('runId',run.id,'attemptId',attempt.id,'status','canceled');
  end if;
  retry_at:=case when p_outcome='failed' and job.retry_safe and attempt.attempt_no<job.max_attempts
    then p_now+make_interval(secs=>least(300,(2^greatest(0,attempt.attempt_no-1))::integer*5)) end;
  final_status:=case when p_outcome='succeeded' then 'succeeded' when retry_at is not null then 'retrying' else 'dead_lettered' end;
  update private.job_attempts set status=p_outcome,completed_at=p_now,safe_error_code=case when p_outcome='failed' then coalesce(p_safe_error_code,'JOB_FAILED') end,
    next_attempt_at=retry_at
    where id=attempt.id;
  update private.job_runs set status=final_status,completed_at=case when final_status='retrying' then null else p_now end,result_summary=p_result_summary where id=run.id returning version into updated_version;
  perform private.enqueue_outbox_event(
    case when final_status='succeeded' then 'operations.job-succeeded' when final_status='dead_lettered' then 'operations.job-dead-lettered' else 'operations.job-failed' end,
    'job_run',run.id,jsonb_build_object('jobKey',run.job_key,'ownerSpec',run.owner_spec,'version',updated_version,
      'safeCode',case when p_outcome='failed' then coalesce(p_safe_error_code,'JOB_FAILED') end,
      'durationBucket',case when p_now-attempt.started_at<interval '1 second' then 'under_1s' when p_now-attempt.started_at<interval '10 seconds' then '1s_to_10s' else 'over_10s' end));
  return jsonb_build_object('runId',run.id,'attemptId',attempt.id,'status',final_status);
end $$;
alter function private.complete_job_attempt(uuid,text,text,text,jsonb,timestamptz) owner to masarifi_migration;

create function private.request_job_action(
  p_run_id uuid,p_action text,p_expected_version bigint,p_actor text,p_reason text,p_request_id text,p_idempotency_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare run private.job_runs%rowtype; job private.scheduled_jobs%rowtype; new_id uuid; result jsonb; request_hash text; prior audit.audit_events%rowtype;
begin
  if p_action not in ('retry','cancel') or p_actor is null or char_length(p_actor) not between 1 and 128
    or p_reason is null or char_length(btrim(p_reason)) not between 10 and 500
    or p_request_id is null or char_length(p_request_id) not between 1 and 128
    or p_idempotency_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='OPERATIONS_ACTION_INPUT_INVALID';
  end if;
  perform private.assert_admin_permission('operations.jobs.manage');
  if p_actor is distinct from public.current_clerk_user_id() then
    raise exception using errcode='42501',message='OPERATIONS_ACTOR_INVALID';
  end if;
  request_hash:='sha256:'||encode(extensions.digest(convert_to(jsonb_build_object('runId',p_run_id,'action',p_action,'version',p_expected_version,'reason',btrim(p_reason))::text,'UTF8'),'sha256'),'hex');
  select * into prior from audit.audit_events where actor_id=p_actor and action='operations.job.'||p_action
    and resource_id=p_run_id::text and metadata->>'idempotencyHash'=p_idempotency_hash order by occurred_at desc limit 1;
  if found then
    if prior.metadata->>'requestHash'<>request_hash then
      raise exception using errcode='22023',message='OPERATIONS_IDEMPOTENCY_REUSED';
    end if;
    return jsonb_build_object('runId',p_run_id,'status',prior.metadata->>'status','version',(prior.metadata->>'version')::bigint,'replayed',true);
  end if;
  select * into run from private.job_runs where id=p_run_id for update;
  if not found or run.version<>p_expected_version then
    raise exception using errcode='40001',message='OPERATIONS_RUN_STALE';
  end if;
  select * into job from private.scheduled_jobs where id=run.scheduled_job_id;
  if p_action='cancel' then
    if not found or not job.cancel_safe or run.status not in ('queued','retrying') then
      raise exception using errcode='22023',message='OPERATIONS_CANCEL_UNSAFE';
    end if;
    update private.job_runs set status='canceled',cancel_requested_at=clock_timestamp(),completed_at=clock_timestamp(),
      started_at=coalesce(started_at,clock_timestamp()) where id=run.id;
    select jsonb_build_object('runId',id,'status',status,'version',version) into result from private.job_runs where id=run.id;
    perform private.enqueue_outbox_event('operations.job-canceled','job_run',run.id,
      jsonb_build_object('jobKey',run.job_key,'ownerSpec',run.owner_spec,'version',result->>'version','actorType','admin'));
  else
    if not found or not job.retry_safe or run.status not in ('failed','dead_lettered') then
      raise exception using errcode='22023',message='OPERATIONS_RETRY_UNSAFE';
    end if;
    insert into private.job_runs(scheduled_job_id,job_key,job_type,owner_spec,status,queued_at,correlation_id,retry_of_run_id)
      values(run.scheduled_job_id,run.job_key,run.job_type,run.owner_spec,'queued',clock_timestamp(),p_request_id,run.id)
      returning id into new_id;
    result:=jsonb_build_object('runId',new_id,'status','queued','version',1,'retryOfRunId',run.id);
  end if;
  perform audit.append_event(p_actor,'admin','operations.job.'||p_action,'job_run',p_run_id::text,null,null,btrim(p_reason),p_request_id,
    jsonb_build_object('idempotencyHash',p_idempotency_hash,'requestHash',request_hash,'status',result->>'status','version',result->>'version'));
  return result;
end $$;
alter function private.request_job_action(uuid,text,bigint,text,text,text,text) owner to masarifi_migration;

create function private.evaluate_feature_flag(p_key text,p_context jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare flag private.feature_flags%rowtype; rule private.feature_flag_rules%rowtype; valid boolean;
begin
  valid:=p_context is not null and jsonb_typeof(p_context)='object' and private.jsonb_object_key_count(p_context)<=4
    and not exists(select 1 from jsonb_object_keys(p_context) key where key not in ('platform','locale','appVersion','cohort'))
    and (not p_context?'platform' or p_context->>'platform' in ('ios','android','admin'))
    and (not p_context?'locale' or p_context->>'locale' in ('ar','en'))
    and (not p_context?'appVersion' or p_context->>'appVersion' ~ '^[0-9]+(\.[0-9]+){0,2}$')
    and (not p_context?'cohort' or p_context->>'cohort' ~ '^[a-z][a-z0-9_-]{1,31}$');
  if not valid then return jsonb_build_object('key',p_key,'enabled',false,'version',0,'source','invalid_context'); end if;
  select * into flag from private.feature_flags where flag_key=p_key;
  if not found then return jsonb_build_object('key',p_key,'enabled',false,'version',0,'source','missing'); end if;
  if flag.status<>'active' then return jsonb_build_object('key',p_key,'enabled',false,'version',flag.version,'source','retired'); end if;
  for rule in select * from private.feature_flag_rules where feature_flag_id=flag.id and enabled order by priority
  loop
    if (not rule.audience?'platform' or rule.audience->>'platform'=p_context->>'platform')
      and (not rule.audience?'locale' or rule.audience->>'locale'=p_context->>'locale')
      and (not rule.audience?'appVersion' or p_context->>'appVersion' like rule.audience->>'appVersion'||'%')
      and (not rule.audience?'cohort' or rule.audience->>'cohort'=p_context->>'cohort') then
      return jsonb_build_object('key',p_key,'enabled',true,'version',flag.version,'source','rule');
    end if;
  end loop;
  return jsonb_build_object('key',p_key,'enabled',flag.default_enabled,'version',flag.version,'source','default');
end $$;
alter function private.evaluate_feature_flag(text,jsonb) owner to masarifi_migration;

create function private.read_safe_platform_meta(p_context jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'maintenance',coalesce((
      select jsonb_build_object('active',true,'scopes',scope,'message',public_message)
      from private.maintenance_windows
      where status='active' and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
      order by starts_at,id limit 1
    ),jsonb_build_object('active',false,'scopes','[]'::jsonb,'message',null)),
    'featureFlags',coalesce((
      select jsonb_object_agg(flag_key,(private.evaluate_feature_flag(flag_key,p_context)->>'enabled')::boolean order by flag_key)
      from (select flag_key from private.feature_flags where status='active' order by flag_key limit 50) active_flags
    ),'{}'::jsonb),
    'configurationVersion',greatest(
      1,
      coalesce((select max(version) from private.system_settings),1),
      coalesce((select max(version) from private.feature_flags),1),
      coalesce((select max(version) from private.maintenance_windows),1)
    )::integer
  )
$$;
alter function private.read_safe_platform_meta(jsonb) owner to masarifi_migration;

create function private.read_operations(p_kind text,p_query jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare permission_key text; page_limit integer; result jsonb; resource_key text; observed timestamptz:=clock_timestamp(); range_interval interval; bucket_interval interval;
begin
  permission_key:=case
    when p_kind='health' then 'operations.health.read'
    when p_kind='providers' then 'operations.providers.read'
    when p_kind in ('queues','scheduled-jobs','job-runs','job-run') then 'operations.jobs.read'
    when p_kind='incidents' then 'operations.incidents.read'
    when p_kind in ('settings','setting') then 'operations.settings.read'
    when p_kind='flags' then 'operations.flags.read'
    when p_kind='maintenance' then 'operations.maintenance.read'
    when p_kind='performance' then 'operations.performance.read'
    when p_kind='recovery' then 'operations.recovery.read'
  end;
  if permission_key is null or p_query is null or jsonb_typeof(p_query)<>'object'
    or private.jsonb_object_key_count(p_query)>10 or pg_catalog.octet_length(p_query::text)>2048 then
    raise exception using errcode='22023',message='OPERATIONS_READ_INPUT_INVALID';
  end if;
  perform private.assert_admin_permission(permission_key);
  page_limit:=least(100,greatest(1,coalesce((p_query->>'limit')::integer,25)));

  if p_kind='health' then
    with latest as (
      select distinct on (provider_key) provider_key,status,latency_ms,checked_at,safe_error_code
      from private.provider_health_checks order by provider_key,checked_at desc,id desc
    )
    select jsonb_build_object(
      'status',case
        when exists(select 1 from private.maintenance_windows where status='active' and scope&&array['api','database','storage']) then 'maintenance'
        when exists(select 1 from latest where provider_key in ('database','storage') and status='down' and checked_at>observed-interval '5 minutes') then 'outage'
        when exists(select 1 from latest where status in ('down','degraded') and checked_at>observed-interval '5 minutes') then 'degraded'
        when not exists(select 1 from latest) then 'unknown' else 'operational' end,
      'services',coalesce((select jsonb_agg(jsonb_build_object(
        'key',provider_key,'status',case status when 'up' then 'operational' when 'down' then 'outage' else status end,
        'latencyMs',latency_ms,'safeCode',safe_error_code,'freshness',jsonb_build_object(
          'observedAt',checked_at,'staleAt',checked_at+interval '5 minutes','state',case when checked_at<observed-interval '5 minutes' then 'stale' else 'fresh' end)) order by provider_key) from latest),'[]'::jsonb),
      'partial',(select count(*)<6 from latest),
      'freshness',jsonb_build_object('observedAt',coalesce((select max(checked_at) from latest),observed),'staleAt',coalesce((select max(checked_at) from latest),observed)+interval '5 minutes','state',case when not exists(select 1 from latest) then 'unknown' when (select max(checked_at) from latest)<observed-interval '5 minutes' then 'stale' else 'fresh' end)
    ) into result;
  elsif p_kind='providers' then
    select jsonb_build_object(
      'items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),
      'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end
    ) into result from (
      select jsonb_build_object('provider',provider_key,'status',status,'latencyMs',latency_ms,'checkedAt',checked_at,'safeCode',safe_error_code) value,
        id::text cursor_key,row_number() over(order by checked_at desc,id desc) ord
      from private.provider_health_checks
      where (p_query->>'provider' is null or provider_key=p_query->>'provider')
        and (p_query->>'status' is null or status=p_query->>'status')
        and (p_query->>'cursor' is null or (checked_at,id)<(select checked_at,id from private.provider_health_checks where id=(p_query->>'cursor')::uuid))
      order by checked_at desc,id desc limit page_limit+1
    ) rows;
  elsif p_kind='queues' then
    select jsonb_build_object(
      'items',coalesce(jsonb_agg(jsonb_build_object('key',job_key,'waiting',waiting,'active',active,'failed',failed,'oldestWaitingSeconds',oldest,'status',case when dead_letters>0 then 'outage' when failed>0 then 'degraded' else 'operational' end) order by job_key),'[]'::jsonb),
      'freshness',jsonb_build_object('observedAt',observed,'staleAt',observed+interval '1 minute','state','fresh'),'partial',false
    ) into result from (
      select s.job_key,count(r.id) filter(where r.status in ('queued','retrying')) waiting,count(r.id) filter(where r.status='running') active,
        count(r.id) filter(where r.status='failed') failed,count(r.id) filter(where r.status='dead_lettered') dead_letters,
        extract(epoch from observed-min(r.queued_at) filter(where r.status in ('queued','retrying')))::integer oldest
      from private.scheduled_jobs s left join private.job_runs r on r.scheduled_job_id=s.id group by s.job_key
    ) queues;
  elsif p_kind='scheduled-jobs' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end) into result from (
      select jsonb_build_object('id',id,'key',job_key,'ownerSpec',owner_spec,'type',job_type,'schedule',schedule,'enabled',enabled,'timeoutSeconds',timeout_seconds,'maxAttempts',max_attempts,'retrySafe',retry_safe,'cancelSafe',cancel_safe,'nextRunAt',next_run_at,'version',version) value,
        job_key cursor_key,row_number() over(order by job_key) ord
      from private.scheduled_jobs where (p_query->>'cursor' is null or job_key>p_query->>'cursor')
        and (p_query->>'ownerSpec' is null or owner_spec=(p_query->>'ownerSpec')::smallint)
        and (p_query->>'enabled' is null or enabled=(p_query->>'enabled')::boolean)
      order by job_key limit page_limit+1
    ) rows;
  elsif p_kind='job-runs' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end) into result from (
      select jsonb_build_object('id',id,'jobKey',job_key,'ownerSpec',owner_spec,'status',status,'queuedAt',queued_at,'startedAt',started_at,'completedAt',completed_at,'correlationId',correlation_id,'summary',result_summary,'version',version) value,
        id::text cursor_key,row_number() over(order by queued_at desc,id desc) ord
      from private.job_runs where (p_query->>'jobKey' is null or job_key=p_query->>'jobKey')
        and (p_query->>'status' is null or status=p_query->>'status')
        and (p_query->>'cursor' is null or (queued_at,id)<(select queued_at,id from private.job_runs where id=(p_query->>'cursor')::uuid))
      order by queued_at desc,id desc limit page_limit+1
    ) rows;
  elsif p_kind='job-run' then
    resource_key:=p_query->>'runId';
    if resource_key is null or resource_key !~* '^[0-9a-f-]{36}$' then raise exception using errcode='22023',message='OPERATIONS_READ_INPUT_INVALID'; end if;
    select jsonb_build_object(
      'run',jsonb_build_object('id',r.id,'jobKey',r.job_key,'ownerSpec',r.owner_spec,'status',r.status,'queuedAt',r.queued_at,'startedAt',r.started_at,'completedAt',r.completed_at,'correlationId',r.correlation_id,'summary',r.result_summary,'version',r.version),
      'attempts',coalesce((select jsonb_agg(jsonb_build_object('attempt',a.attempt_no,'status',a.status,'workerId',a.worker_id,'startedAt',a.started_at,'completedAt',a.completed_at,'safeCode',a.safe_error_code,'nextAttemptAt',a.next_attempt_at) order by a.attempt_no) from private.job_attempts a where a.run_id=r.id),'[]'::jsonb),
      'allowedActions',case when r.status in ('failed','dead_lettered') and s.retry_safe then '["retry"]'::jsonb when r.status in ('queued','retrying') and s.cancel_safe then '["cancel"]'::jsonb else '[]'::jsonb end
    ) into result from private.job_runs r left join private.scheduled_jobs s on s.id=r.scheduled_job_id where r.id=resource_key::uuid;
  elsif p_kind='incidents' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end) into result from (
      select jsonb_build_object('id',id,'title',title,'severity',severity,'status',status,'startedAt',started_at,'resolvedAt',resolved_at,'publicSummary',public_summary,'assignedAdminId',assigned_admin_id,'version',version) value,
        id::text cursor_key,row_number() over(order by started_at desc,id desc) ord
      from private.system_incidents where (p_query->>'status' is null or status=p_query->>'status')
        and (p_query->>'severity' is null or severity=p_query->>'severity')
        and (p_query->>'cursor' is null or (started_at,id)<(select started_at,id from private.system_incidents where id=(p_query->>'cursor')::uuid))
      order by started_at desc,id desc limit page_limit+1
    ) rows;
  elsif p_kind='settings' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by setting_key),'[]'::jsonb)) into result from (
      select setting_key,case when sensitivity='restricted'
        then jsonb_build_object('key',setting_key,'sensitivity',sensitivity,'redacted',true,'version',version,'updatedAt',updated_at)
        else jsonb_build_object('key',setting_key,'value',value,'sensitivity',sensitivity,'redacted',false,'version',version,'updatedAt',updated_at) end value
      from private.system_settings order by setting_key limit 500
    ) rows;
  elsif p_kind='setting' then
    resource_key:=p_query->>'settingKey';
    select case when sensitivity='restricted'
      then jsonb_build_object('key',setting_key,'sensitivity',sensitivity,'redacted',true,'version',version,'updatedAt',updated_at)
      else jsonb_build_object('key',setting_key,'value',value,'sensitivity',sensitivity,'redacted',false,'version',version,'updatedAt',updated_at) end
      into result from private.system_settings where setting_key=resource_key;
  elsif p_kind='flags' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end) into result from (
      select jsonb_build_object('id',f.id,'key',f.flag_key,'description',f.description,'defaultEnabled',f.default_enabled,'status',f.status,'version',f.version,
        'rules',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'priority',r.priority,'audience',r.audience,'enabled',r.enabled,'version',r.version) order by r.priority) from private.feature_flag_rules r where r.feature_flag_id=f.id),'[]'::jsonb)) value,
        f.flag_key cursor_key,row_number() over(order by f.flag_key) ord
      from private.feature_flags f where (p_query->>'cursor' is null or f.flag_key>p_query->>'cursor') order by f.flag_key limit page_limit+1
    ) rows;
  elsif p_kind='maintenance' then
    select jsonb_build_object('items',coalesce(jsonb_agg(value order by ord) filter(where ord<=page_limit),'[]'::jsonb),'nextCursor',case when count(*)>page_limit then (array_agg(cursor_key order by ord))[page_limit] end) into result from (
      select jsonb_build_object('id',id,'startsAt',starts_at,'endsAt',ends_at,'scopes',scope,'message',public_message,'status',status,'version',version) value,
        id::text cursor_key,row_number() over(order by starts_at desc,id desc) ord
      from private.maintenance_windows where (p_query->>'cursor' is null or (starts_at,id)<(select starts_at,id from private.maintenance_windows where id=(p_query->>'cursor')::uuid))
      order by starts_at desc,id desc limit page_limit+1
    ) rows;
  elsif p_kind='performance' then
    range_interval:=case coalesce(p_query->>'range','24h') when '1h' then interval '1 hour' when '7d' then interval '7 days' when '30d' then interval '30 days' else interval '24 hours' end;
    bucket_interval:=case coalesce(p_query->>'range','24h') when '1h' then interval '5 minutes' when '7d' then interval '6 hours' when '30d' then interval '1 day' else interval '1 hour' end;
    with attempt_samples as (
      select completed_at,extract(epoch from completed_at-started_at)*1000 latency_ms
      from private.job_attempts where completed_at>=observed-range_interval and completed_at is not null
    ), attempt_stats as (
      select count(*) sample_count,max(completed_at) latest,
        round(percentile_cont(0.50) within group(order by latency_ms)::numeric,2)::float8 p50,
        round(percentile_cont(0.95) within group(order by latency_ms)::numeric,2)::float8 p95,
        round(percentile_cont(0.99) within group(order by latency_ms)::numeric,2)::float8 p99
      from attempt_samples
    ), provider_stats as (
      select count(*) sample_count,max(checked_at) latest,
        round(percentile_cont(0.50) within group(order by latency_ms)::numeric,2)::float8 p50,
        round(percentile_cont(0.95) within group(order by latency_ms)::numeric,2)::float8 p95,
        round(percentile_cont(0.99) within group(order by latency_ms)::numeric,2)::float8 p99
      from private.provider_health_checks where checked_at>=observed-range_interval and status<>'unknown'
    ), series as (
      select date_bin(bucket_interval,completed_at,'2000-01-01T00:00:00Z'::timestamptz) at,
        round(percentile_cont(0.95) within group(order by latency_ms)::numeric,2)::float8 value
      from attempt_samples group by 1 order by 1 limit 720
    )
    select jsonb_build_object('range',coalesce(p_query->>'range','24h'),'budgets',jsonb_build_object(
      'operations.jobs',jsonb_build_object('p50',a.p50,'p95',a.p95,'p99',a.p99,'unit','milliseconds','status',case when a.sample_count=0 then 'unavailable' when a.p95<=300 and a.p99<=750 then 'within_budget' else 'breached' end),
      'providers.shallow',jsonb_build_object('p50',p.p50,'p95',p.p95,'p99',p.p99,'unit','milliseconds','status',case when p.sample_count=0 then 'unavailable' when p.p95<=2000 then 'within_budget' else 'breached' end)),
      'series',coalesce((select jsonb_agg(jsonb_build_object('at',at,'value',value) order by at) from series),'[]'::jsonb),
      'freshness',jsonb_build_object('observedAt',coalesce(a.latest,p.latest,observed),'staleAt',coalesce(a.latest,p.latest,observed)+interval '5 minutes','state',case when a.sample_count+p.sample_count=0 then 'unknown' when greatest(a.latest,p.latest)<observed-interval '5 minutes' then 'stale' else 'fresh' end))
      into result from attempt_stats a cross join provider_stats p;
  elsif p_kind='recovery' then
    result:=jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('scope','database','status','unavailable','observedAt',observed,'evidenceRef','local-recovery-evidence','rpoSeconds',null,'rtoSeconds',null,'safeCode','LOCAL_EVIDENCE_PENDING'),
      jsonb_build_object('scope','full_dr','status','external_required','observedAt',observed,'evidenceRef','hosted-provider-evidence','rpoSeconds',null,'rtoSeconds',null,'safeCode','HOSTED_EVIDENCE_REQUIRED')),
      'rpoTargetSeconds',900,'rtoTargetSeconds',7200);
  end if;
  if result is null then raise exception using errcode='P0002',message='OPERATIONS_RESOURCE_UNAVAILABLE'; end if;
  return result;
end $$;
alter function private.read_operations(text,jsonb) owner to masarifi_migration;

create function private.execute_operations_command(
  p_operation text,p_resource_key text,p_body jsonb,p_actor text,p_request_id text,p_idempotency_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare permission_key text; action_name text; request_hash text; resource_id text; result jsonb; prior audit.audit_events%rowtype; current_status text; current_version bigint; scopes text[]; event_id uuid; event_type text; event_payload jsonb;
begin
  permission_key:=case
    when p_operation in ('createIncident','updateIncident') then 'operations.incidents.manage'
    when p_operation='updateSetting' then 'operations.settings.manage'
    when p_operation in ('createFeatureFlag','updateFeatureFlag') then 'operations.flags.manage'
    when p_operation in ('createMaintenance','updateMaintenance') then 'operations.maintenance.manage'
  end;
  action_name:=case p_operation
    when 'createIncident' then 'operations.incident.create' when 'updateIncident' then 'operations.incident.update'
    when 'updateSetting' then 'operations.setting.update' when 'createFeatureFlag' then 'operations.flag.create'
    when 'updateFeatureFlag' then 'operations.flag.update' when 'createMaintenance' then 'operations.maintenance.create'
    when 'updateMaintenance' then 'operations.maintenance.update' end;
  if permission_key is null or p_body is null or jsonb_typeof(p_body)<>'object'
    or private.jsonb_object_key_count(p_body)>20 or pg_catalog.octet_length(p_body::text)>4096
    or p_actor is distinct from public.current_clerk_user_id()
    or char_length(coalesce(p_body->>'reason','')) not between 10 and 500
    or p_body::text ~* '(https?://|postgres(ql)?://|bearer[[:space:]]+[a-z0-9._~-]{8,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
    or p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_idempotency_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='OPERATIONS_COMMAND_INPUT_INVALID';
  end if;
  perform private.assert_admin_permission(permission_key);
  request_hash:='sha256:'||encode(extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'resourceKey',p_resource_key,'body',p_body)::text,'UTF8'),'sha256'),'hex');
  select * into prior from audit.audit_events where actor_id=p_actor and action=action_name
    and metadata->>'idempotencyHash'=p_idempotency_hash order by occurred_at desc limit 1;
  if found then
    if prior.metadata->>'requestHash'<>request_hash then raise exception using errcode='22023',message='OPERATIONS_IDEMPOTENCY_REUSED'; end if;
    return jsonb_build_object('resourceId',prior.resource_id,'status',prior.metadata->>'status','version',(prior.metadata->>'version')::bigint,'replayed',true);
  end if;

  if p_operation='createIncident' then
    insert into private.system_incidents(title,severity,started_at,public_summary,assigned_admin_id,created_by_admin_id)
      values(p_body->>'title',p_body->>'severity',(p_body->>'startedAt')::timestamptz,p_body->>'publicSummary',p_body->>'assignedAdminId',p_actor)
      returning id::text,jsonb_build_object('resourceId',id,'status',status,'version',version) into resource_id,result;
  elsif p_operation='updateIncident' then
    select status,version into current_status,current_version from private.system_incidents where id=p_resource_key::uuid for update;
    if current_version is null then raise exception using errcode='P0002',message='OPERATIONS_INCIDENT_NOT_FOUND'; end if;
    if current_version<>(p_body->>'expectedVersion')::bigint then raise exception using errcode='40001',message='OPERATIONS_INCIDENT_STALE'; end if;
    if p_body?'status' and not ((current_status='open' and p_body->>'status' in ('investigating','resolved')) or (current_status='investigating' and p_body->>'status' in ('monitoring','resolved')) or (current_status='monitoring' and p_body->>'status'='resolved')) then
      raise exception using errcode='22023',message='OPERATIONS_INCIDENT_TRANSITION_INVALID';
    end if;
    update private.system_incidents set status=coalesce(p_body->>'status',status),severity=coalesce(p_body->>'severity',severity),
      public_summary=case when p_body?'publicSummary' then p_body->>'publicSummary' else public_summary end,
      assigned_admin_id=case when p_body?'assignedAdminId' then p_body->>'assignedAdminId' else assigned_admin_id end,
      resolved_at=case when p_body->>'status'='resolved' then clock_timestamp() else resolved_at end
      where id=p_resource_key::uuid returning id::text,jsonb_build_object('resourceId',id,'status',status,'version',version) into resource_id,result;
  elsif p_operation='updateSetting' then
    select version into current_version from private.system_settings where setting_key=p_resource_key for update;
    if current_version is null then raise exception using errcode='P0002',message='OPERATIONS_SETTING_NOT_FOUND'; end if;
    if current_version<>(p_body->>'expectedVersion')::bigint then raise exception using errcode='40001',message='OPERATIONS_SETTING_STALE'; end if;
    update private.system_settings set value=p_body->'value',updated_by_admin_id=p_actor where setting_key=p_resource_key and version=(p_body->>'expectedVersion')::bigint
      and sensitivity<>'restricted' and (
        (setting_key='operations.ai.allowance' and p_body->'value'='5'::jsonb) or
        (setting_key='operations.history.retention_days' and (p_body->>'value')::integer between 30 and 365) or
        (setting_key='operations.provider.timeout_ms' and (p_body->>'value')::integer between 100 and 10000) or
        (setting_key='operations.performance.series_limit' and (p_body->>'value')::integer between 24 and 720)
      ) returning setting_key,jsonb_build_object('resourceId',setting_key,'status','updated','version',version) into resource_id,result;
    if result is null then raise exception using errcode='22023',message='OPERATIONS_SETTING_VALUE_INVALID'; end if;
  elsif p_operation='createFeatureFlag' then
    insert into private.feature_flags(flag_key,description,default_enabled,created_by_admin_id,updated_by_admin_id)
      values(p_body->>'key',p_body->>'description',(p_body->>'defaultEnabled')::boolean,p_actor,p_actor)
      returning flag_key,jsonb_build_object('resourceId',flag_key,'status',status,'version',version) into resource_id,result;
  elsif p_operation='updateFeatureFlag' then
    select status,version into current_status,current_version from private.feature_flags where flag_key=p_resource_key for update;
    if current_version is null then raise exception using errcode='P0002',message='OPERATIONS_FLAG_NOT_FOUND'; end if;
    if current_version<>(p_body->>'expectedVersion')::bigint then raise exception using errcode='40001',message='OPERATIONS_FLAG_STALE'; end if;
    if current_status='retired' or (p_body?'status' and not (
      (current_status='draft' and p_body->>'status' in ('draft','active','retired')) or
      (current_status='active' and p_body->>'status' in ('active','retired'))
    )) then raise exception using errcode='22023',message='OPERATIONS_FLAG_TRANSITION_INVALID'; end if;
    update private.feature_flags set description=coalesce(p_body->>'description',description),
      default_enabled=coalesce((p_body->>'defaultEnabled')::boolean,default_enabled),status=coalesce(p_body->>'status',status),updated_by_admin_id=p_actor
      where flag_key=p_resource_key and version=(p_body->>'expectedVersion')::bigint
      returning flag_key,jsonb_build_object('resourceId',flag_key,'status',status,'version',version) into resource_id,result;
    if result is not null and p_body?'rules' then
      delete from private.feature_flag_rules where feature_flag_id=(select id from private.feature_flags where flag_key=p_resource_key);
      insert into private.feature_flag_rules(feature_flag_id,priority,audience,enabled)
      select f.id,(rule->>'priority')::smallint,rule->'audience',coalesce((rule->>'enabled')::boolean,true)
      from private.feature_flags f cross join jsonb_array_elements(p_body->'rules') rule where f.flag_key=p_resource_key;
    end if;
  elsif p_operation='createMaintenance' then
    select array_agg(value order by value) into scopes from jsonb_array_elements_text(p_body->'scopes') value;
    insert into private.maintenance_windows(starts_at,ends_at,scope,public_message,created_by_admin_id,updated_by_admin_id)
      values((p_body->>'startsAt')::timestamptz,(p_body->>'endsAt')::timestamptz,scopes,p_body->'message',p_actor,p_actor)
      returning id::text,jsonb_build_object('resourceId',id,'status',status,'version',version) into resource_id,result;
  elsif p_operation='updateMaintenance' then
    select status,version into current_status,current_version from private.maintenance_windows where id=p_resource_key::uuid for update;
    if current_version is null then raise exception using errcode='P0002',message='OPERATIONS_MAINTENANCE_NOT_FOUND'; end if;
    if current_version<>(p_body->>'expectedVersion')::bigint then raise exception using errcode='40001',message='OPERATIONS_MAINTENANCE_STALE'; end if;
    if p_body?'status' and not ((current_status='scheduled' and p_body->>'status' in ('active','canceled')) or (current_status='active' and p_body->>'status'='completed')) then
      raise exception using errcode='22023',message='OPERATIONS_MAINTENANCE_TRANSITION_INVALID';
    end if;
    if p_body?'scopes' then select array_agg(value order by value) into scopes from jsonb_array_elements_text(p_body->'scopes') value; end if;
    update private.maintenance_windows set starts_at=coalesce((p_body->>'startsAt')::timestamptz,starts_at),ends_at=coalesce((p_body->>'endsAt')::timestamptz,ends_at),
      scope=coalesce(scopes,scope),public_message=coalesce(p_body->'message',public_message),status=coalesce(p_body->>'status',status),updated_by_admin_id=p_actor
      where id=p_resource_key::uuid and version=(p_body->>'expectedVersion')::bigint
      returning id::text,jsonb_build_object('resourceId',id,'status',status,'version',version) into resource_id,result;
  end if;
  if result is null then raise exception using errcode='P0002',message='OPERATIONS_RESOURCE_UNAVAILABLE'; end if;
  perform audit.append_event(p_actor,'admin',action_name,case when p_operation like '%Incident' then 'system_incident' when p_operation like '%Setting' then 'system_setting' when p_operation like '%Flag' then 'feature_flag' else 'maintenance_window' end,
    resource_id,null,'sha256:'||encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex'),p_body->>'reason',p_request_id,
    jsonb_build_object('idempotencyHash',p_idempotency_hash,'requestHash',request_hash,'status',result->>'status','version',result->>'version'));
  if p_operation in ('createIncident','updateIncident') then
    event_id:=resource_id::uuid; event_type:='operations.incident-changed';
    select jsonb_build_object('incidentId',id,'status',status,'severity',severity,'version',version) into event_payload from private.system_incidents where id=event_id;
  elsif p_operation='updateSetting' then
    event_id:=extensions.gen_random_uuid(); event_type:='operations.setting-changed';
    select jsonb_build_object('settingKey',setting_key,'sensitivity',sensitivity,'version',version) into event_payload from private.system_settings where setting_key=resource_id;
  elsif p_operation in ('createFeatureFlag','updateFeatureFlag') then
    event_type:='operations.feature-flag-changed';
    select id,jsonb_build_object('flagKey',flag_key,'status',status,'version',version) into event_id,event_payload from private.feature_flags where flag_key=resource_id;
  else
    event_id:=resource_id::uuid; event_type:='operations.maintenance-changed';
    select jsonb_build_object('maintenanceId',id,'status',status,'version',version) into event_payload from private.maintenance_windows where id=event_id;
  end if;
  perform private.enqueue_outbox_event(event_type,case event_type when 'operations.incident-changed' then 'system_incident' when 'operations.setting-changed' then 'system_setting' when 'operations.feature-flag-changed' then 'feature_flag' else 'maintenance_window' end,event_id,event_payload);
  return result;
end $$;
alter function private.execute_operations_command(text,text,jsonb,text,text,text) owner to masarifi_migration;

create function private.execute_operations_job(p_job_key text,p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare changed integer:=0; retention_days integer; runs_deleted integer:=0; attempts_deleted integer:=0; checks_deleted integer:=0; schedule_count integer:=0; active_count integer:=0; retry_count integer:=0; dead_letter_count integer:=0; database_latency integer; provider text; previous_status text; next_status text;
begin
  if p_job_key not in ('operations.provider-health','operations.capacity-evaluate','operations.cache-invalidate','operations.backup-verify','operations.restore-drill','operations.dr-rehearse','operations.maintenance-activate','operations.maintenance-complete','operations.job-history-retain') or p_now is null then
    raise exception using errcode='22023',message='OPERATIONS_JOB_UNKNOWN';
  end if;
  if p_job_key='operations.provider-health' then
    database_latency:=greatest(0,(extract(epoch from clock_timestamp()-p_now)*1000)::integer);
    foreach provider in array array['database','storage','identity','ai','email','push'] loop
      next_status:=case when provider='database' then 'up' else 'unknown' end;
      select status into previous_status from private.provider_health_checks where provider_key=provider order by checked_at desc,id desc limit 1;
      insert into private.provider_health_checks(provider_key,check_type,status,latency_ms,checked_at)
        values(provider,'shallow',next_status,case when provider='database' then database_latency else 0 end,p_now);
      if coalesce(previous_status,'unknown')<>next_status then
        perform private.enqueue_outbox_event('operations.provider-state-changed','provider_health_check',extensions.gen_random_uuid(),
          jsonb_build_object('provider',provider,'previousStatus',coalesce(previous_status,'unknown'),'status',next_status));
      end if;
      changed:=changed+1;
    end loop;
  elsif p_job_key='operations.capacity-evaluate' then
    select count(*)::integer into schedule_count from private.scheduled_jobs;
    select count(*) filter(where status='running')::integer,count(*) filter(where status='retrying')::integer,count(*) filter(where status='dead_lettered')::integer
      into active_count,retry_count,dead_letter_count from private.job_runs;
    return jsonb_build_object('outcome','succeeded','jobKey',p_job_key,'status',case when schedule_count<=10000 and active_count<=100 and retry_count<=1000 then 'within_budget' else 'breached' end,
      'scheduleCount',schedule_count,'activeRuns',active_count,'retryingRuns',retry_count,'deadLetterRuns',dead_letter_count);
  elsif p_job_key='operations.backup-verify' then
    update private.system_settings set value=jsonb_build_object('state','external_required','checkedAt',p_now) where setting_key='operations.backup.status'; get diagnostics changed=row_count;
  elsif p_job_key in ('operations.restore-drill','operations.dr-rehearse') then
    update private.system_settings set value=jsonb_build_object('state','external_required','checkedAt',p_now) where setting_key='operations.restore.status'; get diagnostics changed=row_count;
  elsif p_job_key='operations.maintenance-activate' then
    update private.maintenance_windows set status='active' where status='scheduled' and starts_at<=p_now and ends_at>p_now; get diagnostics changed=row_count;
  elsif p_job_key='operations.maintenance-complete' then
    update private.maintenance_windows set status='completed' where status='active' and ends_at<=p_now; get diagnostics changed=row_count;
  elsif p_job_key='operations.job-history-retain' then
    retention_days:=coalesce((select (value#>>'{}')::integer from private.system_settings where setting_key='operations.history.retention_days'),90);
    delete from private.job_attempts where id in (select a.id from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.completed_at<p_now-make_interval(days=>retention_days) order by a.id limit 1000); get diagnostics attempts_deleted=row_count;
    delete from private.job_runs where id in (select id from private.job_runs where completed_at<p_now-make_interval(days=>retention_days) and not exists(select 1 from private.job_runs child where child.retry_of_run_id=job_runs.id) order by id limit greatest(0,1000-attempts_deleted)); get diagnostics runs_deleted=row_count;
    delete from private.provider_health_checks where id in (select id from private.provider_health_checks where checked_at<p_now-interval '35 days' order by id limit 1000); get diagnostics checks_deleted=row_count;
    return jsonb_build_object('outcome','succeeded','jobKey',p_job_key,'runsDeleted',runs_deleted,'attemptsDeleted',attempts_deleted,'checksDeleted',checks_deleted);
  end if;
  return jsonb_build_object('outcome','succeeded','changed',changed,'jobKey',p_job_key,
    'status',case when p_job_key in ('operations.backup-verify','operations.restore-drill','operations.dr-rehearse') then 'external_required' end,
    'latencyMs',case when p_job_key='operations.provider-health' then database_latency end);
end $$;
alter function private.execute_operations_job(text,timestamptz) owner to masarifi_migration;

do $$ declare table_name text;
begin
  foreach table_name in array array['scheduled_jobs','job_runs','job_attempts','provider_health_checks','system_incidents','system_settings','feature_flags','feature_flag_rules','maintenance_windows']
  loop
    execute format('alter table private.%I enable row level security',table_name);
    execute format('alter table private.%I force row level security',table_name);
    execute format('create policy operations_%s_migration_all on private.%I for all to masarifi_migration using (true) with check (true)',table_name,table_name);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role,masarifi_api,masarifi_worker',table_name);
  end loop;
end $$;

revoke all on function private.jsonb_object_key_count(jsonb),private.valid_feature_audience(jsonb),private.valid_safe_summary(jsonb),private.guard_maintenance_overlap(),private.guard_job_attempt_update(),
  private.register_job(text,smallint,text,jsonb,boolean,integer,smallint,jsonb,boolean,boolean),
  private.heartbeat_job_attempt(uuid,text,timestamptz),private.claim_due_jobs(text,integer,timestamptz),private.complete_job_attempt(uuid,text,text,text,jsonb,timestamptz),
  private.request_job_action(uuid,text,bigint,text,text,text,text),private.evaluate_feature_flag(text,jsonb),private.read_safe_platform_meta(jsonb),
  private.read_operations(text,jsonb),private.execute_operations_command(text,text,jsonb,text,text,text),private.execute_operations_job(text,timestamptz)
  from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
grant execute on function private.register_job(text,smallint,text,jsonb,boolean,integer,smallint,jsonb,boolean,boolean),
  private.heartbeat_job_attempt(uuid,text,timestamptz),private.claim_due_jobs(text,integer,timestamptz),private.complete_job_attempt(uuid,text,text,text,jsonb,timestamptz),private.execute_operations_job(text,timestamptz)
  to masarifi_worker;
grant execute on function private.request_job_action(uuid,text,bigint,text,text,text,text),private.evaluate_feature_flag(text,jsonb),private.read_safe_platform_meta(jsonb),
  private.read_operations(text,jsonb),private.execute_operations_command(text,text,jsonb,text,text,text)
  to masarifi_api;
grant execute on function private.evaluate_feature_flag(text,jsonb) to masarifi_worker;

insert into public.permissions(key,resource,action) values
  ('operations.health.read','operations','health.read'),
  ('operations.providers.read','operations','providers.read'),
  ('operations.jobs.read','operations','jobs.read'),
  ('operations.jobs.manage','operations','jobs.manage'),
  ('operations.incidents.read','operations','incidents.read'),
  ('operations.incidents.manage','operations','incidents.manage'),
  ('operations.settings.read','operations','settings.read'),
  ('operations.settings.manage','operations','settings.manage'),
  ('operations.flags.read','operations','flags.read'),
  ('operations.flags.manage','operations','flags.manage'),
  ('operations.maintenance.read','operations','maintenance.read'),
  ('operations.maintenance.manage','operations','maintenance.manage'),
  ('operations.performance.read','operations','performance.read'),
  ('operations.recovery.read','operations','recovery.read')
on conflict(key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role cross join public.permissions permission
where role.key='super-admin' and permission.key like 'operations.%'
on conflict do nothing;

insert into private.system_settings(setting_key,value,sensitivity) values
  ('operations.ai.allowance','5','public'),
  ('operations.history.retention_days','90','internal'),
  ('operations.provider.timeout_ms','2000','internal'),
  ('operations.performance.series_limit','720','internal'),
  ('operations.backup.status','{"state":"unknown"}','restricted'),
  ('operations.restore.status','{"state":"unknown"}','restricted');

-- Existing business handlers remain owned by their originating Specs; this table owns only
-- their validated schedule and execution history.
select private.register_job('platform.outbox.dispatch',1::smallint,'platform.outbox.dispatch','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,60,8::smallint,'{}'::jsonb,true,false);
select private.register_job('clerk.webhook.process',2::smallint,'clerk.webhook.process','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,60,8::smallint,'{}'::jsonb,true,false);
select private.register_job('clerk.identity.reconcile',2::smallint,'clerk.identity.reconcile','{"kind":"interval","everySeconds":86400,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('clerk.session-revoke.retry',2::smallint,'clerk.session-revoke.retry','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,60,8::smallint,'{}'::jsonb,true,false);
select private.register_job('security.support-expire',3::smallint,'security.support-expire','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,60,3::smallint,'{}'::jsonb,true,false);
select private.register_job('security.alert-dispatch',3::smallint,'security.alert-dispatch','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,60,3::smallint,'{}'::jsonb,true,false);
select private.register_job('privacy.export-generate',3::smallint,'privacy.export-generate','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('privacy.export-expire',3::smallint,'privacy.export-expire','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('privacy.account-delete',3::smallint,'privacy.account-delete','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('retention.apply',3::smallint,'retention.apply','{"kind":"interval","everySeconds":86400,"timezone":"UTC"}'::jsonb,true,600,3::smallint,'{}'::jsonb,true,false);
select private.register_job('ledger.reconcile',5::smallint,'ledger.reconcile','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('sync-mutations.retry',6::smallint,'sync-mutations.retry','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('idempotency.cleanup',6::smallint,'idempotency.cleanup','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('sync-state.cleanup',6::smallint,'sync-state.cleanup','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('conflicts.expire',6::smallint,'conflicts.expire','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.salary-cycle.generate',7::smallint,'planning.salary-cycle.generate','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.obligation-schedule.generate',7::smallint,'planning.obligation-schedule.generate','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.payment-match.propose',7::smallint,'planning.payment-match.propose','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.overdue.mark',7::smallint,'planning.overdue.mark','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.reminders.emit',7::smallint,'planning.reminders.emit','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('planning.reconcile',7::smallint,'planning.reconcile','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('import.parse',8::smallint,'import.parse','{"kind":"interval","everySeconds":30,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('parser.corpus',8::smallint,'parser.corpus',null,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('raw.purge',8::smallint,'raw.purge','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,600,3::smallint,'{}'::jsonb,true,false);
select private.register_job('tracking.reconcile',8::smallint,'tracking.reconcile','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('ai.evaluate_route',9::smallint,'ai.evaluate_route','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('voice.transcribe_extract',9::smallint,'voice.transcribe_extract','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('assistant.respond',9::smallint,'assistant.respond','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('ai.usage_rollup',9::smallint,'ai.usage_rollup','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('voice-media.purge',9::smallint,'voice-media.purge','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('ai.reconcile',9::smallint,'ai.reconcile','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('report.generate',10::smallint,'report.generate','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,600,8::smallint,'{}'::jsonb,true,true);
select private.register_job('report.email.deliver',10::smallint,'report.email.deliver','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,true);
select private.register_job('report.output.expire',10::smallint,'report.output.expire','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('report.schedule.enqueue',10::smallint,'report.schedule.enqueue','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('source.consume',11::smallint,'source.consume','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,false);
select private.register_job('notification.dispatch',11::smallint,'notification.dispatch','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,true);
select private.register_job('notification.expire',11::smallint,'notification.expire','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);
select private.register_job('notification.campaign.expand',11::smallint,'notification.campaign.expand','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,true);
select private.register_job('support-attachment.scan',11::smallint,'support-attachment.scan','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,300,8::smallint,'{}'::jsonb,true,true);
select private.register_job('support-attachment.cleanup',11::smallint,'support-attachment.cleanup','{"kind":"interval","everySeconds":3600,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);

select private.register_job('operations.provider-health',13::smallint,'operations.provider-health','{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,30,3::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.capacity-evaluate',13::smallint,'operations.capacity-evaluate','{"kind":"interval","everySeconds":300,"timezone":"UTC"}'::jsonb,true,60,3::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.cache-invalidate',13::smallint,'operations.cache-invalidate',null,true,30,3::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.backup-verify',13::smallint,'operations.backup-verify','{"kind":"interval","everySeconds":86400,"timezone":"UTC"}'::jsonb,true,600,2::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.restore-drill',13::smallint,'operations.restore-drill',null,false,600,1::smallint,'{}'::jsonb,false,false);
select private.register_job('operations.dr-rehearse',13::smallint,'operations.dr-rehearse',null,false,600,1::smallint,'{}'::jsonb,false,false);
select private.register_job('operations.maintenance-activate',13::smallint,'operations.maintenance-activate','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,30,3::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.maintenance-complete',13::smallint,'operations.maintenance-complete','{"kind":"interval","everySeconds":10,"timezone":"UTC"}'::jsonb,true,30,3::smallint,'{}'::jsonb,true,false);
select private.register_job('operations.job-history-retain',13::smallint,'operations.job-history-retain','{"kind":"interval","everySeconds":86400,"timezone":"UTC"}'::jsonb,true,300,3::smallint,'{}'::jsonb,true,false);

reset role;
revoke masarifi_migration from current_user granted by current_user;
