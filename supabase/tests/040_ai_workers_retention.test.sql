begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private',function_name,arguments,function_name||' exists')
from (values
 ('claim_ai_work',array['text','text','integer','integer']),
 ('complete_ai_work',array['text','uuid','uuid','text','text']),
 ('expire_ai_proposals',array['integer']),
 ('claim_voice_media_purge',array['text','integer','integer']),
 ('complete_voice_media_purge',array['uuid','uuid','boolean','text']),
 ('reconcile_ai_state',array['integer']),
 ('export_ai_batch',array['text','text','timestamptz','integer']),
 ('delete_ai_owner_data',array['text','integer'])
) expected(function_name,arguments);

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('ai-worker-owner','active');
insert into public.voice_sessions(id,user_id,locale,status,duration_ms,expires_at,storage_ref,content_type,size_bytes,operation_id)
values('99100000-0000-4000-8000-000000000001','ai-worker-owner','ar','uploaded',1000,
 clock_timestamp()+interval '1 hour','voice/99100000-0000-4000-8000-000000000001/99100000-0000-4000-8000-000000000002',
 'audio/m4a',100,'99100000-0000-4000-8000-000000000003');
insert into public.voice_proposals(id,user_id,session_id,schema_version,proposal_type,payload,status,expires_at,created_at)
values('99200000-0000-4000-8000-000000000001','ai-worker-owner','99100000-0000-4000-8000-000000000001',1,
 'transaction.create','{"schemaVersion":1,"type":"transaction.create","amountMinor":"1","currency":"SAR","categoryId":null,"accountId":null,"date":"2026-09-03","merchant":null,"note":null,"confidence":1}','validated',clock_timestamp()-interval '1 second',clock_timestamp()-interval '1 minute');
select is(private.expire_ai_proposals(100),1,'expiry job expires one eligible proposal');
select is((select status from public.voice_proposals where id='99200000-0000-4000-8000-000000000001'),'expired','proposal is terminal expired');
select is((select count(*) from private.export_ai_batch('ai-worker-owner','voice',null,100)),1::bigint,
  'privacy export is bounded and includes owner voice session');
select ok(not (select value ?| array['storage_ref','user_id'] from private.export_ai_batch('ai-worker-owner','voice',null,100) value),
  'privacy export excludes storage and owner internals');
reset role;

select * from finish();
rollback;
