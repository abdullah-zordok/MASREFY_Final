set local enable_seqscan=off;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.scheduled_jobs where enabled and schedule is not null and next_run_at<=clock_timestamp() order by next_run_at,job_key limit 10;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.job_runs where status='failed' order by queued_at desc,id desc limit 100;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.provider_health_checks where provider_key='database' order by checked_at desc,id desc limit 100;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.system_incidents where status='open' order by started_at desc,id desc limit 100;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.feature_flag_rules where feature_flag_id='00000000-0000-4000-8000-000000000013' order by enabled desc,priority limit 100;
explain (analyze false,buffers false,costs false,timing false,summary false)
select id from private.maintenance_windows where status='active' order by starts_at,ends_at,id limit 100;
