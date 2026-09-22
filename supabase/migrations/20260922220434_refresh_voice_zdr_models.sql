grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

insert into private.ai_models (
  id, provider_id, model_id, capabilities, approved, max_context, structured_output, cost_policy
) values (
  '99020000-0000-4000-8000-000000000006',
  '99010000-0000-4000-8000-000000000003',
  'google/gemini-2.5-flash',
  array['text','audio_input','structured_output'],
  true,
  1048576,
  true,
  '{"prompt":"0.0000003","completion":"0.0000025","audio":"0.000001","reviewedAt":"2026-09-23"}'
)
on conflict (model_id) do update set
  provider_id=excluded.provider_id,
  capabilities=excluded.capabilities,
  approved=excluded.approved,
  max_context=excluded.max_context,
  structured_output=excluded.structured_output,
  cost_policy=excluded.cost_policy,
  deleted_at=null;

update private.ai_feature_routes
set primary_model_id=(select id from private.ai_models where model_id='google/gemini-2.5-flash'),
    fallback_model_ids=array[(select id from private.ai_models where model_id='google/gemini-2.5-flash-lite')],
    provider_allowlist=array['google'],
    enabled=false
where workload='voice_transcription';

update private.ai_models
set approved=false
where model_id='openai/gpt-audio-mini';

update private.ai_providers
set retention_reviewed_at='2026-09-23T00:00:00Z'
where key='google';

reset role;
revoke masarifi_migration from current_user granted by current_user;
