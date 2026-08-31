begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

grant authenticated,masarifi_api,masarifi_worker,masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;

select ok(coalesce((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid=any(array[
  to_regclass('public.client_sync_state'),to_regclass('public.client_mutations'),
  to_regclass('public.transaction_conflicts')])) ,false),'all public sync tables force RLS');

select ok(coalesce(not has_table_privilege('anon',to_regclass('public.client_sync_state'),'SELECT'),false),'anonymous cannot read checkpoints');
select ok(coalesce(not has_table_privilege('authenticated',to_regclass('public.client_sync_state'),'SELECT'),false),'authenticated cannot read checkpoints directly');
select ok(coalesce(not has_table_privilege('authenticated',to_regclass('public.client_mutations'),'SELECT'),false),'authenticated cannot read mutations directly');
select ok(coalesce(not has_table_privilege('authenticated',to_regclass('public.transaction_conflicts'),'SELECT'),false),'authenticated cannot read conflicts directly');
select ok(coalesce(has_table_privilege('masarifi_api',to_regclass('public.client_sync_state'),'SELECT'),false),'API may owner-read checkpoints');
select ok(coalesce(has_table_privilege('masarifi_api',to_regclass('public.client_mutations'),'SELECT'),false),'API may owner-read mutations');
select ok(coalesce(has_table_privilege('masarifi_api',to_regclass('public.transaction_conflicts'),'SELECT'),false),'API may owner-read conflicts');
select ok(coalesce(not has_table_privilege('masarifi_api',to_regclass('public.client_mutations'),'INSERT'),false),'API cannot insert mutations directly');
select ok(coalesce(not has_table_privilege('masarifi_api',to_regclass('public.client_sync_state'),'UPDATE'),false),'API cannot update checkpoints directly');
select ok(coalesce(not has_table_privilege('masarifi_worker',to_regclass('public.client_mutations'),'UPDATE'),false),'worker cannot update mutations directly');

select has_function('private','claim_sync_idempotency_key',array['text','text','text','text','interval'],'fenced idempotency claim exists');
select has_function('private','complete_sync_idempotency_key',array['text','text','text','text','uuid','integer','jsonb','text'],'fenced idempotency completion exists');
select has_function('private','receive_client_mutation',array['text','uuid','integer','uuid','text','text','integer','uuid[]','text','text','bigint','text','jsonb'],'mutation receipt function exists');
select has_function('private','claim_client_mutations',array['text','integer','integer'],'mutation claim function exists');
select has_function('private','complete_client_mutation',array['uuid','uuid','text','jsonb','jsonb'],'mutation completion function exists');
select has_function('private','ack_client_sync_cursor',array['text','uuid','text','bigint','uuid'],'cursor ack function exists');

select ok(coalesce(has_function_privilege('masarifi_api',to_regprocedure('private.claim_sync_idempotency_key(text,text,text,text,interval)'),'EXECUTE'),false),'API can claim sync idempotency');
select ok(coalesce(has_function_privilege('masarifi_api',to_regprocedure('private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb)'),'EXECUTE'),false),'API can receive mutations');
select ok(coalesce(has_function_privilege('masarifi_api',to_regprocedure('private.ack_client_sync_cursor(text,uuid,text,bigint,uuid)'),'EXECUTE'),false),'API can ack a cursor');
select ok(coalesce(has_function_privilege('masarifi_worker',to_regprocedure('private.claim_client_mutations(text,integer,integer)'),'EXECUTE'),false),'worker can claim mutations');
select ok(coalesce(has_function_privilege('masarifi_worker',to_regprocedure('private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb)'),'EXECUTE'),false),'worker can complete mutations');
select ok(coalesce(not has_function_privilege('public',to_regprocedure('private.claim_client_mutations(text,integer,integer)'),'EXECUTE'),false),'PUBLIC cannot claim mutations');
select ok(coalesce(not has_function_privilege('authenticated',to_regprocedure('private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb)'),'EXECUTE'),false),'authenticated cannot bypass API receipt boundary');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='client_sync_state' and roles && array['masarifi_api']::name[]),1,'one checkpoint owner policy exists');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='client_mutations' and roles && array['masarifi_api']::name[]),1,'one mutation owner policy exists');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='transaction_conflicts' and roles && array['masarifi_api']::name[]),1,'one conflict owner policy exists');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in (
    'claim_sync_idempotency_key','complete_sync_idempotency_key','receive_client_mutation',
    'claim_client_mutations','complete_client_mutation','ack_client_sync_cursor'
  ) and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') !~ 'search_path='
),'all sync definer functions pin search_path');

reset role;
select * from finish();
rollback;
