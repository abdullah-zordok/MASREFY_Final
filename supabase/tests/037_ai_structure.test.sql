begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(schema_name,table_name,schema_name||'.'||table_name||' exists')
from (values
 ('public','voice_sessions'),('public','voice_transcripts'),('public','voice_proposals'),
 ('public','voice_proposal_fields'),('public','voice_category_preferences'),
 ('public','assistant_consents'),('public','assistant_conversations'),('public','assistant_messages'),
 ('public','assistant_response_snapshots'),('public','assistant_action_previews'),
 ('public','assistant_feedback'),('public','ai_response_reports'),
 ('private','ai_providers'),('private','ai_models'),('private','ai_feature_routes'),
 ('private','ai_prompt_versions'),('private','ai_prompt_test_cases'),
 ('private','ai_usage_events'),('private','ai_failure_events'),('private','ai_safety_rules')
) expected(schema_name,table_name);

select has_pk(schema_name,table_name,schema_name||'.'||table_name||' has a primary key')
from (values
 ('public','voice_sessions'),('public','voice_transcripts'),('public','voice_proposals'),
 ('public','voice_proposal_fields'),('public','voice_category_preferences'),
 ('public','assistant_consents'),('public','assistant_conversations'),('public','assistant_messages'),
 ('public','assistant_response_snapshots'),('public','assistant_action_previews'),
 ('public','assistant_feedback'),('public','ai_response_reports'),
 ('private','ai_providers'),('private','ai_models'),('private','ai_feature_routes'),
 ('private','ai_prompt_versions'),('private','ai_prompt_test_cases'),
 ('private','ai_usage_events'),('private','ai_failure_events'),('private','ai_safety_rules')
) expected(schema_name,table_name);

select has_column('public','voice_sessions',column_name,'voice_sessions.'||column_name)
from unnest(array['user_id','locale','storage_ref','status','duration_ms','expires_at','confirmed_at','failure_code','version']) column_name;
select has_column('public','voice_proposals',column_name,'voice_proposals.'||column_name)
from unnest(array['user_id','session_id','schema_version','proposal_type','payload','status','expires_at','confirmed_at','executed_transaction_id','version']) column_name;
select has_column('public','assistant_action_previews',column_name,'assistant_action_previews.'||column_name)
from unnest(array['user_id','message_id','schema_version','action_type','payload','status','expires_at','confirmed_at','executed_resource_id','version']) column_name;
select has_column('private','ai_feature_routes',column_name,'ai_feature_routes.'||column_name)
from unnest(array['workload','primary_model_id','fallback_model_ids','provider_allowlist','zdr_required','max_price','limits','enabled','version']) column_name;
select has_column('private','ai_usage_events',column_name,'ai_usage_events.'||column_name)
from unnest(array['user_id','workload','model','provider','input_tokens','output_tokens','estimated_cost','latency_ms','fallback_used','request_id']) column_name;

select has_index(schema_name,table_name,index_name,index_name||' exists')
from (values
 ('public','voice_sessions','voice_sessions_owner_status_idx'),
 ('public','voice_proposals','voice_proposals_owner_status_idx'),
 ('public','assistant_conversations','assistant_conversations_owner_cursor_idx'),
 ('public','assistant_messages','assistant_messages_conversation_cursor_idx'),
 ('public','assistant_action_previews','assistant_previews_owner_status_idx'),
 ('private','ai_usage_events','ai_usage_events_owner_time_idx'),
 ('private','ai_failure_events','ai_failure_events_workload_time_idx')
) expected(schema_name,table_name,index_name);

select * from finish();
rollback;
