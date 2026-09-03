begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(schema_name, table_name, schema_name || '.' || table_name || ' exists')
from (values
  ('public','tracking_preferences'),('public','user_keyword_rules'),('public','user_sender_rules'),
  ('public','import_sessions'),('public','import_items'),('private','import_attempts'),
  ('private','raw_ingestion_payloads'),('public','review_items'),('public','duplicate_candidates'),
  ('public','tracking_history'),('public','tracking_feedback'),('public','financial_institutions'),
  ('public','institution_senders'),('public','parser_rules'),('public','parser_rule_versions'),
  ('public','parser_test_cases'),('public','merchant_rules'),('public','category_rules'),
  ('public','unsupported_formats')
) expected(schema_name,table_name);

select has_pk(schema_name, table_name, schema_name || '.' || table_name || ' has a primary key')
from (values
  ('public','tracking_preferences'),('public','user_keyword_rules'),('public','user_sender_rules'),
  ('public','import_sessions'),('public','import_items'),('private','import_attempts'),
  ('private','raw_ingestion_payloads'),('public','review_items'),('public','duplicate_candidates'),
  ('public','tracking_history'),('public','tracking_feedback'),('public','financial_institutions'),
  ('public','institution_senders'),('public','parser_rules'),('public','parser_rule_versions'),
  ('public','parser_test_cases'),('public','merchant_rules'),('public','category_rules'),
  ('public','unsupported_formats')
) expected(schema_name,table_name);

select has_column('public','tracking_preferences',column_name,'tracking_preferences.' || column_name)
from unnest(array['user_id','enabled','review_required','duplicate_window_seconds','source_retention_days','version']) column_name;
select has_column('public','import_sessions',column_name,'import_sessions.' || column_name)
from unnest(array['user_id','source_type','schema_version','request_hash','status','item_count','accepted_count','rejected_count','claim_token','lease_until','version']) column_name;
select has_column('public','import_items',column_name,'import_items.' || column_name)
from unnest(array['user_id','session_id','source_item_key','normalized_hash','source_hash','parser_version_id','normalized_payload','confidence_basis_points','status','transaction_id','operation_id','version']) column_name;
select has_column('public','parser_rule_versions',column_name,'parser_rule_versions.' || column_name)
from unnest(array['parser_rule_id','version_no','definition','definition_hash','created_by','published_at']) column_name;
select has_column('public','duplicate_candidates',column_name,'duplicate_candidates.' || column_name)
from unnest(array['user_id','left_item_id','right_transaction_id','score','score_version','reasons','status','resolution','decision_token','decision_action','decision_lease_until','version']) column_name;
select has_column('public','review_items',column_name,'review_items.' || column_name)
from unnest(array['decision_token','decision_action','decision_lease_until']) column_name;

select ok(exists(
  select 1 from pg_constraint c
  where c.conrelid=to_regclass('public.' || table_name)
    and c.conname=constraint_name and c.contype='f'
),constraint_name || ' enforces same-owner parentage')
from (values
  ('import_items','import_items_session_owner_fk'),
  ('review_items','review_items_item_owner_fk'),
  ('duplicate_candidates','duplicate_candidates_item_owner_fk'),
  ('tracking_feedback','tracking_feedback_history_owner_fk'),
  ('unsupported_formats','unsupported_formats_session_owner_fk')
) expected(table_name,constraint_name);

select has_index('public',table_name,index_name,index_name || ' exists')
from (values
  ('import_sessions','import_sessions_owner_status_cursor_idx'),
  ('import_sessions','import_sessions_claim_idx'),
  ('import_items','import_items_session_source_uq'),
  ('import_items','import_items_owner_review_idx'),
  ('review_items','review_items_pending_item_uq'),
  ('review_items','review_items_decision_lease_idx'),
  ('duplicate_candidates','duplicate_candidates_pair_uq'),
  ('duplicate_candidates','duplicate_candidates_decision_lease_idx'),
  ('tracking_history','tracking_history_owner_cursor_idx'),
  ('parser_rule_versions','parser_rule_versions_rule_number_uq')
) expected(table_name,index_name);

select * from finish();
rollback;
