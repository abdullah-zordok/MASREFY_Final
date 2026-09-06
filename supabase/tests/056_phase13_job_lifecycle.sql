begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_worker,masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_worker,masarifi_api;
grant execute on all functions in schema extensions to masarifi_worker,masarifi_api;

set local role masarifi_worker;
select extensions.lives_ok($$select private.register_job('operations.test',13::smallint,'operations.test',
  '{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,30,3::smallint,'{}'::jsonb,true,true)$$,
  'worker registers one bounded job');
select extensions.lives_ok($$select private.register_job('operations.test',13::smallint,'operations.test',
  '{"kind":"interval","everySeconds":60,"timezone":"UTC"}'::jsonb,true,30,3::smallint,'{}'::jsonb,true,true)$$,
  'compatible registration is idempotent');
select extensions.throws_ok($$select private.register_job('operations.test',11::smallint,'operations.test',null,true,30,3::smallint,'{}'::jsonb,true,true)$$,
  '22023','OPERATIONS_JOB_OWNERSHIP_CONFLICT','job ownership cannot move');
select extensions.throws_ok($$select private.register_job('billing.test',12::smallint,'billing.test',null,true,30,3::smallint,'{}'::jsonb,true,true)$$,
  '22023','OPERATIONS_JOB_OWNER_INVALID','Spec 012 cannot register a job');

reset role;
set local role masarifi_migration;
update private.scheduled_jobs set enabled=false where job_key<>'operations.test';
insert into public.profiles(id,status) values ('phase13-job-admin','active');
insert into public.admin_profiles(user_id,status) values ('phase13-job-admin','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'phase13-job-admin',id,'phase13-job-admin','Phase 13 job lifecycle test' from public.roles where key='super-admin';
reset role;
set local role masarifi_worker;

select is((select count(*) from private.claim_due_jobs('worker-a',1,clock_timestamp()+interval '1 second')),1::bigint,
  'one due execution is claimed');
select is((select count(*) from private.claim_due_jobs('worker-b',1,clock_timestamp()+interval '1 second')),0::bigint,
  'the same due execution is not claimed twice');
reset role;

set local role masarifi_migration;
select is((select count(*) from private.job_runs where job_key='operations.test'),1::bigint,'one authoritative run is retained');
select is((select count(*) from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test'),1::bigint,'one authoritative attempt is retained');
select ok((select result_summary='{}'::jsonb from private.job_runs where job_key='operations.test'),'no arbitrary run payload is retained');
create temporary table phase13_attempt(id uuid primary key);
insert into phase13_attempt select a.id from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test' and a.status='running';
grant select on phase13_attempt to masarifi_worker;
reset role;

set local role masarifi_worker;
select extensions.lives_ok($$select private.complete_job_attempt(
  (select id from phase13_attempt),
  'worker-a','failed','TRANSIENT_FAILURE','{}'::jsonb,clock_timestamp()+interval '2 seconds')$$,'a retry-safe failure schedules a bounded retry');
select is((select count(*) from private.claim_due_jobs('worker-b',1,clock_timestamp()+interval '20 seconds')),1::bigint,'a due retry is reclaimed once');
reset role;
set local role masarifi_migration;
select is((select max(attempt_no)::integer from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test'),2,'retry attempt numbers increase');
truncate phase13_attempt;
insert into phase13_attempt select a.id from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test' and a.status='running';
reset role;
set local role masarifi_worker;
select extensions.throws_ok($$select private.complete_job_attempt(
  '00000000-0000-4000-8000-000000000013'::uuid,
  'worker-b','succeeded',null,'{"token":"unsafe"}'::jsonb,clock_timestamp())$$,
  '22023','OPERATIONS_COMPLETION_INPUT_INVALID','unsafe result summaries are rejected');
select extensions.lives_ok($$select private.complete_job_attempt(
  (select id from phase13_attempt),
  'worker-b','failed','TRANSIENT_FAILURE','{}'::jsonb,clock_timestamp()+interval '21 seconds')$$,'a second retry-safe failure schedules the final attempt');
select is((select count(*) from private.claim_due_jobs('worker-c',1,clock_timestamp()+interval '40 seconds')),1::bigint,'only the latest failed attempt is reclaimed');
reset role;
set local role masarifi_migration;
select is((select max(attempt_no)::integer from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test'),3,'retry attempts reach the configured maximum');
update private.scheduled_jobs set enabled=false where job_key='operations.test';
truncate phase13_attempt;
insert into phase13_attempt select a.id from private.job_attempts a join private.job_runs r on r.id=a.run_id where r.job_key='operations.test' and a.status='running';
reset role;
set local role masarifi_worker;
select extensions.lives_ok($$select private.complete_job_attempt(
  (select id from phase13_attempt),
  'worker-c','failed','TRANSIENT_FAILURE','{}'::jsonb,clock_timestamp()+interval '41 seconds')$$,'the final failed attempt completes safely');
select is((select count(*) from private.claim_due_jobs('worker-d',1,clock_timestamp()+interval '5 minutes')),0::bigint,'an exhausted run is never reclaimed');
reset role;
set local role masarifi_migration;
select is((select status from private.job_runs where job_key='operations.test'),'dead_lettered','the authoritative run exhausts exactly three attempts');
reset role;

set local role masarifi_worker;
select extensions.is(private.execute_operations_job('operations.provider-health',clock_timestamp())->>'changed','6','the fixed provider allowlist is checked');
reset role;
set local role masarifi_migration;
select is((select status from private.provider_health_checks where provider_key='database' order by checked_at desc,id desc limit 1),'up','database connectivity is measured as available');
select is((select count(distinct provider_key) from private.provider_health_checks where checked_at>clock_timestamp()-interval '1 minute'),6::bigint,'only six fixed Free-only providers are persisted');
select is((select count(*) from private.outbox_events where event_type='operations.provider-state-changed' and payload->>'provider'='database'),1::bigint,'a real provider state transition emits one safe event');
reset role;
set local role masarifi_worker;
select extensions.is(private.execute_operations_job('operations.capacity-evaluate',clock_timestamp())->>'status','within_budget','capacity evaluation reports the bounded inventory honestly');
reset role;

set local role masarifi_migration;
create temporary table phase13_cancel_run(id uuid primary key);
with queued as (
  insert into private.job_runs(scheduled_job_id,job_key,job_type,owner_spec,status,queued_at,correlation_id)
  select id,job_key,job_type,owner_spec,'queued',clock_timestamp(),'phase13-cancel-queued'
  from private.scheduled_jobs where job_key='operations.test'
  returning id
)
insert into phase13_cancel_run select id from queued;
grant select,delete,insert on phase13_cancel_run to masarifi_api;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"phase13-job-admin","sid":"sess"}',true);
set local role masarifi_api;
select extensions.lives_ok($$select private.request_job_action((select id from phase13_cancel_run),'cancel',1,'phase13-job-admin','Cancel before dispatch is safe.','cancel-queued','sha256:'||repeat('5',64))$$,'queued cancel-safe work can be canceled');
reset role;
set local role masarifi_migration;
delete from phase13_cancel_run;
with running as (
  insert into private.job_runs(scheduled_job_id,job_key,job_type,owner_spec,status,queued_at,started_at,correlation_id)
  select id,job_key,job_type,owner_spec,'running',clock_timestamp(),clock_timestamp(),'phase13-cancel-running'
  from private.scheduled_jobs where job_key='operations.test'
  returning id
)
insert into phase13_cancel_run select id from running;
reset role;
set local role masarifi_api;
select extensions.throws_ok($$select private.request_job_action((select id from phase13_cancel_run),'cancel',1,'phase13-job-admin','Reject running cancellation safely.','cancel-running','sha256:'||repeat('6',64))$$,'22023','OPERATIONS_CANCEL_UNSAFE','running work cannot be marked canceled without cooperative abort');
reset role;
set local role masarifi_migration;
select is((select count(*) from private.outbox_events where event_type='operations.job-failed'),2::bigint,'retryable failures emit two safe failure events');
select is((select count(*) from private.outbox_events where event_type='operations.job-dead-lettered'),1::bigint,'attempt exhaustion emits one dead-letter event');
select is((select count(*) from private.outbox_events where event_type='operations.job-canceled'),1::bigint,'a safe queued cancellation emits one event');
reset role;
set local role masarifi_api;
select ok((private.read_operations('performance','{"range":"24h"}'::jsonb)#>>'{budgets,operations.jobs,p95}')::numeric>=0,'performance reads measured attempt latency');
select ok(jsonb_array_length(private.read_operations('performance','{"range":"24h"}'::jsonb)->'series')>0,'performance reads a measured bounded series');
reset role;

select * from finish();
rollback;
