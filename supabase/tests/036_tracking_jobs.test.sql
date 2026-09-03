begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private','claim_import_session',array['text','integer','integer'],'claim import exists');
select has_function('private','complete_import_attempt',array['uuid','uuid','text','text'],'complete attempt exists');
select has_function('private','purge_raw_ingestion_payloads',array['integer'],'raw purge exists');
select has_function('private','compact_tracking_history',array['integer'],'history compaction exists');
select has_function('private','reconcile_import_sessions',array['integer'],'reconciliation exists');
select has_function('private','tracking_operational_metrics',array[]::text[],'operational metrics exists');
select has_function('private','claim_parser_corpus',array['text','integer','integer'],'parser corpus claim exists');
select has_function('private','read_parser_corpus',array['uuid','uuid'],'parser corpus leased read exists');
select has_function('private','complete_parser_corpus',array['uuid','uuid','jsonb','text'],'parser corpus completion exists');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('tracking-job-owner','active');
select private.create_import_session(
  'tracking-job-owner','manual',null,1,repeat('b',64),
  '[{"sourceItemKey":"fixture-job","receivedAt":"2026-09-02T08:00:00Z","body":"fictional paid 12"}]'::jsonb
);
create temporary table first_tracking_claim as select id,claim_token,attempt_count from private.claim_import_session('pgtap-worker-1',1,60);
select is((select attempt_count from first_tracking_claim),1,'first claim records attempt one');
select is((select count(*) from private.import_attempts where session_id=(select id from first_tracking_claim)),1::bigint,'claim records one fenced attempt');
select throws_ok(
  $$select private.complete_import_attempt((select id from first_tracking_claim),extensions.gen_random_uuid(),'failed','TEMPORARY_FAILURE')$$,
  '40001',
  'IMPORT_LEASE_STALE',
  'wrong fence token cannot complete an attempt'
);
update public.import_sessions set lease_until=clock_timestamp()-interval '1 second' where id=(select id from first_tracking_claim);
create temporary table second_tracking_claim as select id,claim_token,attempt_count from private.claim_import_session('pgtap-worker-2',1,60);
select is((select attempt_count from second_tracking_claim),2,'expired lease is reclaimed as a new attempt');
select isnt((select claim_token from second_tracking_claim),(select claim_token from first_tracking_claim),'reclaim rotates the fence token');
select lives_ok(
  $$select private.complete_import_attempt((select id from second_tracking_claim),(select claim_token from second_tracking_claim),'failed','TEMPORARY_FAILURE')$$,
  'retryable failure completes the fenced attempt'
);
select is((select status from public.import_sessions where id=(select id from second_tracking_claim)),'received','retryable failure returns session to received');

update public.import_sessions set attempt_count=9,next_attempt_at=clock_timestamp() where id=(select id from second_tracking_claim);
create temporary table final_tracking_claim as select id,claim_token,attempt_count from private.claim_import_session('pgtap-worker-3',1,60);
select lives_ok(
  $$select private.complete_import_attempt((select id from final_tracking_claim),(select claim_token from final_tracking_claim),'failed','EXHAUSTED')$$,
  'tenth failure completes terminally'
);
select is((select status from public.import_sessions where id=(select id from final_tracking_claim)),'failed','attempt exhaustion is terminal');

select lives_ok(
  $$select private.register_raw_ingestion_payload('tracking-job-owner',(select id from final_tracking_claim),'tracking/80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000002',repeat('c',64),'application/json',10,clock_timestamp()+interval '1 hour')$$,
  'raw retention metadata registers'
);
update private.raw_ingestion_payloads set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 second' where session_id=(select id from final_tracking_claim);
create temporary table raw_retention_claim as select * from private.purge_raw_ingestion_payloads(100);
select is((select count(*) from raw_retention_claim),1::bigint,'expired raw reference is claimed for purge');
select ok(private.complete_raw_ingestion_purge((select id from raw_retention_claim),(select purge_token from raw_retention_claim)),'raw purge completion succeeds');
select ok(not private.complete_raw_ingestion_purge((select id from raw_retention_claim),(select purge_token from raw_retention_claim)),'raw purge completion is idempotent');
select ok(private.queue_raw_ingestion_cleanup(
  'tracking/80000000-0000-4000-8000-000000000003/80000000-0000-4000-8000-000000000004',repeat('d',64),'application/json',10
),'failed upload cleanup is queued durably');
update private.raw_ingestion_payloads set created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' where scan_status='cleanup';
create temporary table raw_cleanup_claim_one as select * from private.purge_raw_ingestion_payloads(100);
select is((select count(*) from raw_cleanup_claim_one),1::bigint,'orphan cleanup is durably claimed for purge');
select throws_ok(
  $$select private.register_raw_ingestion_payload('tracking-job-owner',(select id from final_tracking_claim),'tracking/80000000-0000-4000-8000-000000000003/80000000-0000-4000-8000-000000000004',repeat('d',64),'application/json',10,clock_timestamp()+interval '1 hour')$$,
  '23505','RAW_PAYLOAD_CONFLICT','registration cannot race an active purge claim'
);
select ok(private.queue_raw_ingestion_cleanup(
  'tracking/80000000-0000-4000-8000-000000000003/80000000-0000-4000-8000-000000000004',repeat('d',64),'application/json',10
),'failed compensation invalidates the in-flight purge claim');
create temporary table raw_cleanup_claim_two as select * from private.purge_raw_ingestion_payloads(100);
select isnt((select purge_token from raw_cleanup_claim_two),(select purge_token from raw_cleanup_claim_one),'invalidated purge claims receive a new fence token');
select ok(not private.complete_raw_ingestion_purge((select id from raw_cleanup_claim_one),(select purge_token from raw_cleanup_claim_one)),'stale purge completion is fenced');
select ok(private.complete_raw_ingestion_purge((select id from raw_cleanup_claim_two),(select purge_token from raw_cleanup_claim_two)),'current orphan cleanup completion succeeds');
select is((private.tracking_operational_metrics()->>'importBacklog')::bigint,0::bigint,'terminal sessions leave no import backlog');

insert into public.profiles(id,status) values('tracking-parser-admin','active');
insert into public.admin_profiles(user_id,status) values('tracking-parser-admin','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'tracking-parser-admin',id,'tracking-parser-admin','Parser corpus job verification' from public.roles where key='import-operator';
select set_config('request.jwt.claims','{"sub":"tracking-parser-admin","role":"authenticated"}',true);
select lives_ok(
  $$select private.queue_parser_corpus('08000000-0000-4000-8000-000000000031','tracking-parser-admin','Queue deterministic parser corpus verification')$$,
  'authorized Admin queues a parser corpus job'
);
create temporary table tracking_corpus_claim as
select * from private.claim_parser_corpus('pgtap-parser-worker',1,60);
select is((select attempt_count from tracking_corpus_claim),1,'parser corpus claim records its first attempt');
select is(
  jsonb_array_length(private.read_parser_corpus(
    (select id from tracking_corpus_claim),(select claim_token from tracking_corpus_claim)
  )->'cases'),
  2,
  'leased parser corpus exposes the bounded enabled cases'
);
select is(
  private.complete_parser_corpus(
    (select id from tracking_corpus_claim),(select claim_token from tracking_corpus_claim),
    '[{"id":"08000000-0000-4000-8000-000000000041","passed":true},{"id":"08000000-0000-4000-8000-000000000042","passed":true}]'::jsonb,
    null
  )->>'status',
  'passed',
  'parser corpus completion records a passing terminal result'
);
select throws_ok(
  $$select private.complete_parser_corpus((select id from tracking_corpus_claim),(select claim_token from tracking_corpus_claim),'[]'::jsonb,null)$$,
  '40001',
  'PARSER_CORPUS_LEASE_STALE',
  'parser corpus completion rejects a consumed lease'
);

select * from finish();
rollback;
