begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private','report_output_attempts','private report attempts exist');
select has_table('private','report_delivery_webhook_receipts','durable webhook replay receipts exist');
select columns_are('private','report_output_attempts',array[
  'id','schedule_id','user_id','report_type','period_start','period_end','ledger_version',
  'snapshot','storage_ref','delivery_status','provider_message_id','attempt_count',
  'error_code','expires_at','created_at'
], 'report attempts have the exact owned columns');
select has_function('private','capture_report_snapshot',array['text','text','date','date','bigint','jsonb','uuid','timestamptz'],'snapshot capture function exists');
select has_function('private','transition_report_output',array['uuid','text','text','text','text'],'guarded transition function exists');
select has_function('private','capture_report_delivery_webhook',array['text','text'],'webhook receipt capture function exists');
select has_index('private','report_output_attempts','report_attempts_user_created_idx','owner cursor index exists');
select has_index('private','report_output_attempts','report_attempts_active_idx','active worker index exists');
select has_index('private','report_output_attempts','report_attempts_expiry_idx','expiry index exists');

grant masarifi_migration,masarifi_api,masarifi_worker to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;
set local role masarifi_migration;
insert into public.profiles(id,status) values('report-attempt-owner','active');
reset role;
select set_config('request.jwt.claims','{"sub":"report-attempt-owner","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table captured as select * from private.capture_report_snapshot(
  'report-attempt-owner','financial_summary','2026-08-01','2026-08-31',0,
  '{"schemaVersion":1,"generatedAt":"2026-09-04T00:00:00.000Z","ledgerVersion":0,"reportType":"financial_summary","period":{"startDate":"2026-08-01","endDate":"2026-08-31","timezone":"Asia/Riyadh","kind":"monthly"},"format":"json","delivery":"download","currencyCode":"SAR","dataState":"empty","evidence":[],"summary":{},"breakdowns":[],"detailedRows":[]}'::jsonb,
  null,'2026-09-05T00:00:00Z'
);
reset role;
grant select on captured to masarifi_worker;
select is((select delivery_status from captured),'queued','capture returns queued state');
select is((select ledger_version from captured),0::bigint,'capture preserves ledger version');
select extensions.throws_ok(
  $$update private.report_output_attempts set snapshot='{}' where user_id='report-attempt-owner'$$,
  '42501','REPORT_SNAPSHOT_IMMUTABLE','snapshot is immutable');
select throws_ok(
  $$select private.transition_report_output((select id from captured),'ready',null,null,null)$$,
  '42501','REPORT_TRANSITION_FORBIDDEN','API role cannot mutate worker state');
select set_config('request.jwt.claims','{"sub":"report-attempt-owner","role":"worker"}',true);
set local role masarifi_worker;
select is(private.capture_report_delivery_webhook('evt-1',repeat('a',64)),'new','first webhook receipt is new');
select is(private.capture_report_delivery_webhook('evt-1',repeat('a',64)),'replay','identical webhook receipt replays');
select is(private.capture_report_delivery_webhook('evt-1',repeat('b',64)),'conflict','changed webhook receipt conflicts');
select extensions.lives_ok(
  $$select private.transition_report_output((select id from captured),'generating',null,null,null)$$,
  'worker may claim a queued output');
select extensions.throws_ok(
  $$select private.transition_report_output((select id from captured),'delivered',null,null,null)$$,
  'P0001','REPORT_TRANSITION_INVALID','illegal transitions fail closed');
reset role;
select set_config('request.jwt.claims','{"sub":"another-owner","role":"authenticated"}',true);
set local role masarifi_api;
select extensions.throws_ok(
  $$select * from private.capture_report_snapshot('report-attempt-owner','financial_summary','2026-08-01','2026-08-31',0,'{}',null,now()+interval '1 hour')$$,
  '42501','REPORT_OWNER_FORBIDDEN','capture enforces owner context');
reset role;

select * from finish();
rollback;
