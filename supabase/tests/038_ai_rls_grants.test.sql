begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(coalesce(c.relrowsecurity and c.relforcerowsecurity,false),
  'public.'||expected.table_name||' enables and forces RLS')
from (values
 ('voice_sessions'),('voice_transcripts'),('voice_proposals'),('voice_proposal_fields'),
 ('voice_category_preferences'),('assistant_consents'),('assistant_conversations'),
 ('assistant_messages'),('assistant_response_snapshots'),('assistant_action_previews'),
 ('assistant_feedback'),('ai_response_reports')
) expected(table_name)
left join pg_class c on c.oid=to_regclass('public.'||expected.table_name);

select ok(not coalesce(has_table_privilege(role_name,'private.'||table_name,'SELECT,INSERT,UPDATE,DELETE'),false),
  role_name||' has no direct private.'||table_name||' access')
from unnest(array['anon','authenticated','service_role','masarifi_api']) role_name
cross join unnest(array['ai_providers','ai_models','ai_feature_routes','ai_prompt_versions',
 'ai_prompt_test_cases','ai_usage_events','ai_failure_events','ai_safety_rules']) table_name;

select ok(not coalesce(has_table_privilege(role_name,'public.'||table_name,'INSERT,UPDATE,DELETE'),false),
  role_name||' cannot directly mutate public.'||table_name)
from unnest(array['anon','authenticated','service_role']) role_name
cross join unnest(array['voice_sessions','voice_transcripts','voice_proposals','voice_proposal_fields',
 'assistant_consents','assistant_conversations','assistant_messages','assistant_response_snapshots',
 'assistant_action_previews','assistant_feedback','ai_response_reports']) table_name;

select function_privs_are('private','get_effective_ai_route',array['text'],'masarifi_worker',array['EXECUTE'],
  'worker alone reads effective routes');
select function_privs_are('private','reserve_ai_quota',array['text','uuid'],'masarifi_api',array['EXECUTE'],
  'API reserves owner quota through one function');
select function_privs_are('private','claim_ai_work',array['text','text','integer','integer'],'masarifi_worker',array['EXECUTE'],
  'worker claims bounded AI work');

grant masarifi_migration,authenticated to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('ai-rls-owner-a','active'),('ai-rls-owner-b','active');
insert into public.assistant_conversations(user_id,title) values('ai-rls-owner-a','A'),('ai-rls-owner-b','B');
reset role;
select set_config('request.jwt.claims','{"sub":"ai-rls-owner-a","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.assistant_conversations),1::bigint,'owner sees only own conversation');
select is((select title from public.assistant_conversations),'A','other owner content stays hidden');
reset role;

select * from finish();
rollback;
