begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(coalesce(c.relrowsecurity and c.relforcerowsecurity,false),
  'public.' || expected.table_name || ' enables and forces RLS')
from (values
  ('tracking_preferences'),('user_keyword_rules'),('user_sender_rules'),('import_sessions'),
  ('import_items'),('review_items'),('duplicate_candidates'),('tracking_history'),
  ('tracking_feedback'),('financial_institutions'),('institution_senders'),('parser_rules'),
  ('parser_rule_versions'),('parser_test_cases'),('merchant_rules'),('category_rules'),
  ('unsupported_formats')
) expected(table_name)
left join pg_class c on c.oid=to_regclass('public.' || expected.table_name);

select ok(not coalesce(has_table_privilege(role_name,'public.' || table_name,'INSERT,UPDATE,DELETE'),false),
  role_name || ' cannot mutate public.' || table_name)
from unnest(array['anon','authenticated','service_role']) role_name
cross join unnest(array[
  'tracking_preferences','user_keyword_rules','user_sender_rules','import_sessions','import_items',
  'review_items','duplicate_candidates','tracking_history','tracking_feedback','financial_institutions',
  'institution_senders','parser_rules','parser_rule_versions','parser_test_cases','merchant_rules',
  'category_rules','unsupported_formats'
]) table_name;

select ok(not coalesce(has_table_privilege(role_name,'private.' || table_name,'SELECT,INSERT,UPDATE,DELETE'),false),
  role_name || ' has no direct private.' || table_name || ' access')
from unnest(array['anon','authenticated','service_role','masarifi_api']) role_name
cross join unnest(array['import_attempts','raw_ingestion_payloads']) table_name;

select ok(not has_table_privilege('authenticated','public.' || table_name,'SELECT'),
  'authenticated cannot bypass API redaction on public.' || table_name)
from unnest(array['import_sessions','import_items','review_items','duplicate_candidates','tracking_history','tracking_feedback','unsupported_formats','merchant_rules','category_rules']) table_name;

select function_privs_are('private','claim_import_session',array['text','integer','integer'],'masarifi_worker',array['EXECUTE'],
  'worker executes import claim');
select function_privs_are('private','complete_import_attempt',array['uuid','uuid','text','text'],'masarifi_worker',array['EXECUTE'],
  'worker executes import completion');
select function_privs_are('private','claim_tracking_admin_idempotency',array['text','text','text','text','interval'],'masarifi_api',array['EXECUTE'],
  'API executes scoped Admin idempotency claims');
select function_privs_are('private','complete_tracking_admin_idempotency',array['text','text','text','text','uuid','integer','jsonb','text'],'masarifi_api',array['EXECUTE'],
  'API executes scoped Admin idempotency completion');

grant masarifi_migration,authenticated to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('tracking-rls-owner-a','active'),('tracking-rls-owner-b','active');
select private.get_tracking_preferences('tracking-rls-owner-a');
select private.get_tracking_preferences('tracking-rls-owner-b');
select private.upsert_keyword_rule('tracking-rls-owner-a',null,'Fictional A','expense','en','contains',null,10,true,null);
select private.upsert_keyword_rule('tracking-rls-owner-b',null,'Fictional B','expense','en','contains',null,10,true,null);
reset role;
select set_config('request.jwt.claims','{"sub":"tracking-rls-owner-a","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.tracking_preferences),1::bigint,'owner RLS exposes one preference row');
select is((select count(*) from public.user_keyword_rules),1::bigint,'owner RLS exposes one keyword row');
select is((select keyword from public.user_keyword_rules),'Fictional A','cross-owner rule stays hidden');
reset role;

select * from finish();
rollback;
