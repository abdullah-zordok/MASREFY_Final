begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','report_schedules','report schedules exist');
select columns_are('public','report_schedules',array[
  'id','user_id','report_type','frequency','timezone','next_run_at','delivery_channel',
  'recipient','enabled','last_run_at','created_at','updated_at','version'
], 'schedule columns match the owned contract');
select has_index('public','report_schedules','report_schedules_owner_frequency_uq','schedule uniqueness exists');
select has_index('public','report_schedules','report_schedules_due_idx','due schedule index exists');
select table_privs_are('public','report_schedules','masarifi_api',array['SELECT'],'API receives read-only table access');

grant masarifi_migration,masarifi_api,masarifi_worker to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;
set local role masarifi_migration;
insert into public.profiles(id,status) values('schedule-owner-a','active'),('schedule-owner-b','active');
reset role;
select set_config('request.jwt.claims','{"sub":"schedule-owner-a","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table schedule_created as select * from private.create_report_schedule(
  'schedule-owner-a','financial_summary','monthly','Asia/Riyadh','2026-10-01T05:00:00Z',
  'email','owner@example.test',true
);
select is((select version from schedule_created),1::bigint,'schedule starts at version one');
select is((select count(*) from public.report_schedules),1::bigint,'owner RLS exposes only own schedule');
select throws_ok(
  $$insert into public.report_schedules(user_id,report_type,frequency,timezone,next_run_at,delivery_channel,enabled) values('schedule-owner-a','financial_summary','monthly','UTC',now(),'download',true)$$,
  '42501','permission denied for table report_schedules','direct API writes are denied');
reset role;
select set_config('request.jwt.claims','{"sub":"schedule-owner-b","role":"authenticated"}',true);
set local role masarifi_api;
select is((select count(*) from public.report_schedules),0::bigint,'other owner cannot enumerate schedules');
select throws_ok(
  $$select * from private.update_report_schedule('schedule-owner-a',(select id from schedule_created),1,'financial_summary','monthly','UTC','2026-10-01T00:00:00Z','download',null,false)$$,
  '42501','REPORT_OWNER_FORBIDDEN','guarded update enforces owner');
reset role;
select set_config('request.jwt.claims','{"role":"worker"}',true);
set local role masarifi_worker;
select is((select count(*) from private.list_due_report_schedules('2026-11-01T00:00:00Z',10)),1::bigint,'worker lists a bounded due batch');
reset role;

select * from finish();
rollback;
