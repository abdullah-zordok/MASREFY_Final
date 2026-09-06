delete from private.job_attempts where run_id in (select id from private.job_runs where job_key like 'operations.perf-fixture.%');
delete from private.job_runs where job_key like 'operations.perf-fixture.%';
delete from private.scheduled_jobs where job_key like 'operations.perf-fixture.%';
delete from private.provider_health_checks where check_type='performance';
delete from public.admin_role_assignments where user_id='operations-performance';
delete from public.admin_profiles where user_id='operations-performance';
delete from public.profiles where id='operations-performance';
