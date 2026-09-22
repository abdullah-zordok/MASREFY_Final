begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private',function_name,arguments,function_name||' exists')
from (values
 ('get_effective_ai_route',array['text']),
 ('reserve_ai_quota',array['text','uuid']),
 ('validate_ai_proposal',array['text','integer','jsonb','text']),
 ('confirm_ai_action',array['uuid','bigint','uuid']),
 ('publish_ai_prompt_version',array['uuid','bigint','text','text']),
 ('record_ai_usage',array['text','text','text','text','integer','integer','numeric','integer','boolean','text']),
 ('record_ai_failure',array['text','text','text','text','text','boolean','text'])
) expected(function_name,arguments);

select is((select count(*) from private.ai_providers where key='openrouter'),1::bigint,
  'OpenRouter provider metadata is seeded once');
select is((select count(*) from private.ai_models where model_id in
 ('openai/gpt-audio-mini','google/gemini-2.5-flash-lite','anthropic/claude-haiku-4.5',
  'openai/gpt-5.2','anthropic/claude-sonnet-5','google/gemini-2.5-flash')),6::bigint,
  'reviewed model candidates are seeded');
select is((select m.model_id from private.ai_feature_routes r join private.ai_models m on m.id=r.primary_model_id
  where r.workload='voice_transcription'),'google/gemini-2.5-flash','voice primary uses a reviewed ZDR audio model');
select is((select array_agg(m.model_id order by f.ordinality) from private.ai_feature_routes r
  cross join lateral unnest(r.fallback_model_ids) with ordinality f(id,ordinality)
  join private.ai_models m on m.id=f.id where r.workload='voice_transcription'),
  array['google/gemini-2.5-flash-lite']::text[],'voice fallback uses a reviewed ZDR audio model');
select is((select provider_allowlist from private.ai_feature_routes where workload='voice_transcription'),
  array['google']::text[],'voice route allows only the reviewed ZDR provider');
select ok(not (select approved from private.ai_models where model_id='openai/gpt-audio-mini'),
  'audio model without a current ZDR endpoint is not approved');
select is((select count(*) from private.ai_feature_routes where enabled),0::bigint,
  'all routes are disabled until deployment/provider approval');
select ok((select bool_and(zdr_required) from private.ai_feature_routes),
  'every seeded route requires ZDR');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('ai-command-owner','active');
select ok((private.reserve_ai_quota('ai-command-owner','99000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'first quota reservation succeeds');
select private.reserve_ai_quota('ai-command-owner',('99000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid)
from generate_series(2,5) i;
select ok(not (private.reserve_ai_quota('ai-command-owner','99000000-0000-4000-8000-000000000006')->>'allowed')::boolean,
  'sixth rolling-window reservation is denied');
select is((private.reserve_ai_quota('ai-command-owner','99000000-0000-4000-8000-000000000001')->>'used')::integer,5,
  'replay does not consume quota twice');
select throws_ok(
 $$select private.validate_ai_proposal('voice_transcription',1,'{"schemaVersion":1,"type":"transaction.create","amountMinor":"1","currency":"SAR","categoryId":null,"accountId":null,"date":"2026-09-03","merchant":null,"note":null,"confidence":1,"tool":"sql"}'::jsonb,'ai-command-owner')$$,
 '22023','AI_SCHEMA_INVALID','unknown proposal keys are rejected');
reset role;

select * from finish();
rollback;
