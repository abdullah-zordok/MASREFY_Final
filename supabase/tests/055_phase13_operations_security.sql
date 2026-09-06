begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in ('scheduled_jobs','job_runs','job_attempts','provider_health_checks','system_incidents','system_settings','feature_flags','feature_flag_rules','maintenance_windows')
    and c.relrowsecurity and c.relforcerowsecurity),'all nine operations tables force RLS');
select ok((select count(*)=9 from pg_policies where schemaname='private'
  and policyname like 'operations_%_migration_all' and roles=array['masarifi_migration']::name[]),'migration-only policies cover all operations tables');

select ok(not has_table_privilege('anon','private.scheduled_jobs','SELECT'),'anonymous clients cannot read jobs');
select ok(not has_table_privilege('authenticated','private.system_settings','SELECT'),'authenticated clients cannot read settings');
select ok(not has_table_privilege('service_role','private.feature_flags','SELECT'),'generic service role cannot read flags');
select ok(not has_table_privilege('masarifi_api','private.system_incidents','SELECT'),'API reads incidents only through functions');
select ok(not has_table_privilege('masarifi_worker','private.job_runs','UPDATE'),'workers mutate runs only through functions');

select has_function('private','register_job',array['text','smallint','text','jsonb','boolean','integer','smallint','jsonb','boolean','boolean'],'job registration has one bounded signature');
select has_function('private','claim_due_jobs',array['text','integer','timestamp with time zone'],'claiming has one bounded signature');
select has_function('private','heartbeat_job_attempt',array['uuid','text','timestamp with time zone'],'heartbeats bind one attempt to one worker');
select has_function('private','complete_job_attempt',array['uuid','text','text','text','jsonb','timestamp with time zone'],'completion has one bounded signature');
select has_function('private','request_job_action',array['uuid','text','bigint','text','text','text','text'],'admin job actions have no arbitrary payload');
select has_function('private','evaluate_feature_flag',array['text','jsonb'],'flag evaluation has one bounded signature');
select has_function('private','read_safe_platform_meta',array['jsonb'],'safe Mobile metadata has one bounded signature');
select has_function('private','read_operations',array['text','jsonb'],'operations reads use one closed projection function');
select has_function('private','execute_operations_command',array['text','text','jsonb','text','text','text'],'operations mutations use one closed command function');
select has_function('private','execute_operations_job',array['text','timestamp with time zone'],'operations jobs use one closed execution function');

select ok(has_function_privilege('masarifi_worker','private.claim_due_jobs(text,integer,timestamp with time zone)','EXECUTE'),'worker can claim due jobs');
select ok(has_function_privilege('masarifi_worker','private.heartbeat_job_attempt(uuid,text,timestamp with time zone)','EXECUTE'),'worker can extend only its active attempt lease');
select ok(not has_function_privilege('masarifi_api','private.heartbeat_job_attempt(uuid,text,timestamp with time zone)','EXECUTE'),'API cannot extend worker leases');
select ok(not has_function_privilege('masarifi_api','private.claim_due_jobs(text,integer,timestamp with time zone)','EXECUTE'),'API cannot claim due jobs');
select ok(has_function_privilege('masarifi_api','private.evaluate_feature_flag(text,jsonb)','EXECUTE'),'API can evaluate safe flags');
select ok(has_function_privilege('masarifi_api','private.read_safe_platform_meta(jsonb)','EXECUTE'),'API can read resolved safe metadata');
select ok(not has_function_privilege('authenticated','private.read_safe_platform_meta(jsonb)','EXECUTE'),'direct clients cannot call safe metadata storage function');
select ok(not has_function_privilege('anon','private.evaluate_feature_flag(text,jsonb)','EXECUTE'),'anonymous clients cannot evaluate internal flags directly');

select * from finish();
rollback;
