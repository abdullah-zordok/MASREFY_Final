begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public','assistant_messages','intent','assistant messages persist canonical intent');
select has_column('public','assistant_messages','context_payload','assistant messages persist bounded structured context');
select has_column('public','assistant_messages','history_payload','assistant messages persist bounded conversation context');
select is((select retention_days from private.retention_policies where resource_type='ai'),365,'assistant retention uses the existing configurable policy framework');
select is((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.user.rolling_limit'),5,'AI rolling quota is database-configured');
select is((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.assistant.history_turns'),4,'AI history bound is database-configured');
select has_function('private','ai_history_turn_limit',array[]::text[],'bounded history setting is exposed safely to the API role');
select has_function(
  'private',
  'save_deterministic_assistant_message',
  array['text','uuid','text','text','text','jsonb','jsonb','text','uuid'],
  'deterministic response persistence exists'
);
select has_table('public','financial_insights','deterministic proactive insights are stored');
select has_function('private','refresh_financial_insights',array['integer'],'insight signal refresh exists');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('assistant-routing-owner','active');
insert into public.assistant_consents(user_id,policy_version,granted_at)
values('assistant-routing-owner','assistant-privacy-v1',clock_timestamp());
insert into public.assistant_conversations(id,user_id,title,status)
values('99600000-0000-4000-8000-000000000001','assistant-routing-owner','Routing','active');

select private.save_deterministic_assistant_message(
  'assistant-routing-owner',
  '99600000-0000-4000-8000-000000000001',
  'صرفي كام؟',
  'spending_summary',
  'صرفت 2,350 ريال هذا الشهر.',
  '{"monthlySpendingMinor":235000,"currency":"SAR"}',
  '[{"kind":"ledger","version":12}]',
  'async',
  '99600000-0000-4000-8000-000000000002'
);

select is(
  (select count(*) from public.assistant_messages where user_id='assistant-routing-owner'),
  2::bigint,
  'deterministic exchange persists both conversation turns'
);
select is(
  (select count(*) from private.ai_usage_events where user_id='assistant-routing-owner'),
  0::bigint,
  'deterministic exchange does not reserve AI quota'
);
select is(
  (select provider from public.assistant_response_snapshots where user_id='assistant-routing-owner'),
  'masarifi',
  'snapshot identifies backend truth rather than an AI provider'
);
reset role;

select * from finish();
rollback;
