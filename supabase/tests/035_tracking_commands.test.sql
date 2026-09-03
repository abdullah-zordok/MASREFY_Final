begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private',function_name,arguments,function_name || ' exists')
from (values
  ('get_tracking_preferences',array['text']),
  ('update_tracking_preferences',array['text','boolean','boolean','integer','integer','bigint']),
  ('upsert_keyword_rule',array['text','uuid','text','text','text','text','uuid','integer','boolean','bigint']),
  ('delete_keyword_rule',array['text','uuid','bigint']),
  ('restore_default_keyword_rules',array['text']),
  ('upsert_sender_rule',array['text','uuid','text','text','uuid','boolean','boolean','bigint']),
  ('delete_sender_rule',array['text','uuid','bigint']),
  ('create_import_session',array['text','text','text','integer','text','jsonb']),
  ('raw_ingestion_payload_registered',array['text','text']),
  ('queue_raw_ingestion_cleanup',array['text','text','text','bigint']),
  ('create_review_item',array['uuid','text','jsonb']),
  ('claim_review_decision',array['text','uuid','text','bigint','uuid','integer']),
  ('decide_review_item',array['text','uuid','text','jsonb','uuid','uuid','uuid']),
  ('compute_duplicate_candidates',array['uuid']),
  ('claim_duplicate_decision',array['text','uuid','text','bigint','uuid','integer']),
  ('decide_duplicate_candidate',array['text','uuid','text','uuid','uuid','uuid']),
  ('record_tracking_feedback',array['text','uuid','text','uuid','text']),
  ('claim_tracking_admin_idempotency',array['text','text','text','text','interval']),
  ('complete_tracking_admin_idempotency',array['text','text','text','text','uuid','integer','jsonb','text']),
  ('publish_parser_version',array['uuid','bigint','text','text']),
  ('queue_parser_corpus',array['uuid','text','text']),
  ('clear_tracking_history',array['text']),
  ('reconcile_import_session_counts',array['uuid'])
) expected(function_name,arguments);

select ok((select count(*) >= 2 from public.financial_institutions),'fictional institutions are seeded');
select ok((select count(*) >= 2 from public.institution_senders),'fictional senders are seeded');
select ok((select count(*) >= 1 from public.parser_rule_versions),'a parser version is seeded');
select ok((select count(*) >= 2 from public.parser_test_cases),'parser corpus is seeded');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('tracking-pgtap-owner','active');
select is(private.get_tracking_preferences('tracking-pgtap-owner')->>'enabled','false','preferences default to paused');
select is(
  private.update_tracking_preferences('tracking-pgtap-owner',true,true,7,90,1)->>'version',
  '2',
  'preference update is optimistic and versioned'
);
select throws_ok(
  $$select private.update_tracking_preferences('tracking-pgtap-owner',false,true,7,90,1)$$,
  '40001',
  'TRACKING_VERSION_CONFLICT',
  'stale preference update is rejected'
);
select is(private.restore_default_keyword_rules('tracking-pgtap-owner'),22,'all bilingual default groups restore');

create temporary table tracking_command_ids as
select private.create_import_session(
  'tracking-pgtap-owner','sms',null,1,repeat('a',64),
  '[{"sourceItemKey":"fixture-1","receivedAt":"2026-09-02T08:00:00Z","body":"fictional paid 12"}]'::jsonb
) result;
select is(
  (select private.create_import_session(
    'tracking-pgtap-owner','sms',null,1,repeat('a',64),
    '[{"sourceItemKey":"fixture-1","receivedAt":"2026-09-02T08:00:00Z","body":"fictional paid 12"}]'::jsonb
  )->>'id'),
  (select result->>'id' from tracking_command_ids),
  'import creation replays one natural-key session'
);
select is((select count(*) from public.import_items where user_id='tracking-pgtap-owner'),1::bigint,'import replay creates one item');
select private.register_raw_ingestion_payload(
  'tracking-pgtap-owner',(select (result->>'id')::uuid from tracking_command_ids),
  'tracking/85000000-0000-4000-8000-000000000001/85000000-0000-4000-8000-000000000002',
  repeat('b',64),'application/json',128,clock_timestamp()+interval '1 day'
);
select ok(private.raw_ingestion_payload_registered(
  'tracking-pgtap-owner',
  'tracking/85000000-0000-4000-8000-000000000001/85000000-0000-4000-8000-000000000002'
),'registered raw ownership is distinguishable from an orphan');

update public.import_items set normalized_payload=normalized_payload||'{"sender":"EXAMPLE-CRESCENT"}'::jsonb
where user_id='tracking-pgtap-owner';
update public.import_sessions set source_type='manual',claim_token='85000000-0000-4000-8000-000000000099',
  claimed_by='pgtap',lease_until=clock_timestamp()+interval '1 minute' where user_id='tracking-pgtap-owner';
select lives_ok(
  $$select private.prepare_import_session((select id from public.import_sessions where user_id='tracking-pgtap-owner'),'85000000-0000-4000-8000-000000000099')$$,
  'parser preparation respects source-specific rules'
);
select is((select parser_version_id from public.import_items where user_id='tracking-pgtap-owner'),null::uuid,
  'an SMS parser is not selected for a manual source');

select lives_ok(
  $$select private.create_review_item((select id from public.import_items where user_id='tracking-pgtap-owner'),'low_confidence','{"kind":"expense"}'::jsonb)$$,
  'review creation succeeds'
);
select is((select count(*) from public.review_items where user_id='tracking-pgtap-owner'),1::bigint,'review creation is unique while pending');
select lives_ok(
  $$select private.claim_review_decision('tracking-pgtap-owner',(select id from public.review_items where user_id='tracking-pgtap-owner'),'reject',1,'85000000-0000-4000-8000-000000000001',120)$$,
  'owner can reserve one pending review decision'
);
select throws_ok(
  $$select private.claim_review_decision('tracking-pgtap-owner',(select id from public.review_items where user_id='tracking-pgtap-owner'),'accept',2,'85000000-0000-4000-8000-000000000002',120)$$,
  '40001',
  'REVIEW_VERSION_CONFLICT',
  'a concurrent review action cannot pass an active decision lease'
);
select lives_ok(
  $$select private.decide_review_item('tracking-pgtap-owner',(select id from public.review_items where user_id='tracking-pgtap-owner'),'reject','{}'::jsonb,'85000000-0000-4000-8000-000000000001',null,null)$$,
  'owner can reject a pending review without a ledger result'
);
select is((select status from public.import_items where user_id='tracking-pgtap-owner'),'rejected','review rejection transitions the item');

select lives_ok(
  $$select private.record_tracking_feedback('tracking-pgtap-owner',(select id from public.tracking_history where user_id='tracking-pgtap-owner' order by created_at limit 1),'wrong_detection',null,'fictional correction')$$,
  'owner feedback is accepted for owned history'
);
select lives_ok(
  $$select private.record_tracking_feedback('tracking-pgtap-owner',(select id from public.tracking_history where user_id='tracking-pgtap-owner' order by created_at limit 1),'wrong_detection',null,'fictional correction')$$,
  'feedback replay is idempotent'
);
select is((select count(*) from public.tracking_feedback where user_id='tracking-pgtap-owner'),1::bigint,'feedback natural key prevents duplicates');

select is((select count(*) from private.export_tracking_batch('tracking-pgtap-owner','items',null,1)),1::bigint,'privacy export is bounded');
select ok(
  not (select value ?| array['user_id','source_hash','normalized_hash'] from private.export_tracking_batch('tracking-pgtap-owner','items',null,1) value),
  'privacy export strips owner and hash internals'
);
select throws_ok(
  $$update public.parser_rule_versions set definition='{"version":1,"output":{"kind":"income"}}' where published_at is not null$$,
  '55000',
  'PARSER_VERSION_IMMUTABLE',
  'published parser versions are immutable'
);

select * from finish();
rollback;
