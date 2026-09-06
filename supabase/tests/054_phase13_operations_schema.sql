begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private','scheduled_jobs','scheduled jobs are private');
select has_table('private','job_runs','job runs are private');
select has_table('private','job_attempts','job attempts are private');
select has_table('private','provider_health_checks','provider checks are private');
select has_table('private','system_incidents','incidents are private');
select has_table('private','system_settings','settings are private');
select has_table('private','feature_flags','feature flags are private');
select has_table('private','feature_flag_rules','feature rules are private');
select has_table('private','maintenance_windows','maintenance windows are private');

select has_column('private','scheduled_jobs','owner_spec','jobs retain immutable Spec ownership');
select has_column('private','scheduled_jobs','retry_safe','jobs declare retry safety');
select has_column('private','scheduled_jobs','cancel_safe','jobs declare cancel safety');
select has_column('private','job_runs','correlation_id','runs retain bounded correlation');
select has_column('private','job_attempts','safe_error_code','attempts retain only safe errors');
select has_column('private','job_attempts','heartbeat_at','running attempts retain a worker lease heartbeat');
select has_column('private','provider_health_checks','latency_ms','provider checks retain latency');
select has_column('private','system_incidents','public_summary','incidents separate public summary');
select has_column('private','system_settings','sensitivity','settings declare sensitivity');
select has_column('private','feature_flag_rules','audience','feature rules retain bounded audience');
select has_column('private','maintenance_windows','public_message','maintenance has bounded public copy');

select ok(to_regclass('private.scheduled_jobs_due_idx') is not null,'due jobs have a bounded claim index');
select ok(to_regclass('private.job_runs_active_uq') is not null,'one active run exists per schedule');
select ok(to_regclass('private.job_attempts_run_number_uq') is not null,'attempt numbers are unique per run');
select ok(to_regclass('private.provider_checks_key_time_idx') is not null,'provider history is bounded by key and time');
select ok(to_regclass('private.system_incidents_status_time_idx') is not null,'incident history is bounded by status and time');
select ok(to_regclass('private.feature_flag_rules_priority_uq') is not null,'flag priorities are deterministic');
select ok(to_regclass('private.maintenance_status_time_idx') is not null,'maintenance projection is bounded by status and time');

select is((select count(*)::integer from private.scheduled_jobs),50,'all Specs 001-011 and 013 jobs are inventoried once');
select is((select count(distinct job_key)::integer from private.scheduled_jobs),50,'job ownership keys are unique');
select is((select count(*)::integer from private.scheduled_jobs where owner_spec=13),9,'Phase 13 owns exactly nine jobs');
select is((select count(*)::integer from private.scheduled_jobs where owner_spec=12),0,'deferred Spec 012 owns no job');
select is((select count(*)::integer from private.scheduled_jobs where job_key ~* 'billing|stripe|subscription|entitlement|checkout|promotion'),0,'Free-only inventory excludes paid work');
select is(
  (select array_agg(schedule->>'everySeconds' order by job_key) from private.scheduled_jobs where job_key in ('operations.maintenance-activate','operations.maintenance-complete')),
  array['10','10'],
  'maintenance lifecycle jobs use the contracted ten-second schedule'
);

select * from finish();
rollback;
