insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tracking-imports','tracking-imports',false,6291456,array['text/csv','application/json'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

insert into public.financial_institutions(id,country_code,name,code) values
  ('08000000-0000-4000-8000-000000000001','SA','Example Crescent Bank','example-crescent-bank'),
  ('08000000-0000-4000-8000-000000000002','SA','Example Palm Wallet','example-palm-wallet')
on conflict(id) do nothing;

insert into public.institution_senders(id,institution_id,sender_pattern,display_label,priority) values
  ('08000000-0000-4000-8000-000000000011','08000000-0000-4000-8000-000000000001','EXAMPLE-CRESCENT','Example Crescent Bank',10),
  ('08000000-0000-4000-8000-000000000012','08000000-0000-4000-8000-000000000002','EXAMPLE-PALM','Example Palm Wallet',10)
on conflict(id) do nothing;

insert into public.parser_rules(id,institution_id,name,source_type,status) values
  ('08000000-0000-4000-8000-000000000021','08000000-0000-4000-8000-000000000001','Example English SMS','sms','draft')
on conflict(id) do nothing;

insert into public.parser_rule_versions(id,parser_rule_id,version_no,definition,definition_hash,created_by,corpus_status) values
  ('08000000-0000-4000-8000-000000000031','08000000-0000-4000-8000-000000000021',1,
   '{"matches":[{"field":"body","operator":"safe_pattern","value":"^paid {amount} {currency}$"}],"captures":[{"field":"amount","sourceGroup":"amount"},{"field":"currency","sourceGroup":"currency"}],"normalizations":[{"field":"amount","operation":"localized_digits"},{"field":"amount","operation":"minor_units"},{"field":"currency","operation":"uppercase"}],"mappings":[{"sourceField":"amount","targetField":"amount"},{"sourceField":"currency","targetField":"currency"}]}',
   encode(extensions.digest(convert_to('{"matches":[{"field":"body","operator":"safe_pattern","value":"^paid {amount} {currency}$"}],"captures":[{"field":"amount","sourceGroup":"amount"},{"field":"currency","sourceGroup":"currency"}],"normalizations":[{"field":"amount","operation":"localized_digits"},{"field":"amount","operation":"minor_units"},{"field":"currency","operation":"uppercase"}],"mappings":[{"sourceField":"amount","targetField":"amount"},{"sourceField":"currency","targetField":"currency"}]}','UTF8'),'sha256'),'hex'),'system:seed','passed')
on conflict(id) do nothing;

insert into public.parser_test_cases(id,parser_version_id,name,input_fixture,expected_output,last_result,last_run_at) values
  ('08000000-0000-4000-8000-000000000041','08000000-0000-4000-8000-000000000031','matches payment','paid 120 SAR','{"amountMinor":12000,"currency":"SAR"}','passed',clock_timestamp()),
  ('08000000-0000-4000-8000-000000000042','08000000-0000-4000-8000-000000000031','rejects unrelated','salary received','{}','passed',clock_timestamp())
on conflict(id) do nothing;

select private.publish_parser_version('08000000-0000-4000-8000-000000000031',1,'system:seed','Reviewed deterministic seed corpus');
set constraints parser_rules_active_version_fk immediate;

insert into public.merchant_rules(id,user_id,pattern,normalized_merchant,priority) values
  ('08000000-0000-4000-8000-000000000051',null,'example market','Example Market',100)
on conflict(id) do nothing;
insert into public.category_rules(id,user_id,pattern,category_id,priority) values
  ('08000000-0000-4000-8000-000000000061',null,'grocery','04000000-0000-4000-8000-000000000002',100),
  ('08000000-0000-4000-8000-000000000062',null,'salary','04000000-0000-4000-8000-000000000016',100)
on conflict(id) do nothing;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'tracking_preferences','user_keyword_rules','user_sender_rules','import_sessions','import_items',
    'review_items','duplicate_candidates','tracking_history','tracking_feedback','financial_institutions',
    'institution_senders','parser_rules','parser_rule_versions','parser_test_cases','merchant_rules',
    'category_rules','unsupported_formats'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role,masarifi_api,masarifi_worker',table_name);
    execute format('create policy %I on public.%I for all to masarifi_migration using(true) with check(true)','tracking_'||table_name||'_migration_all',table_name);
  end loop;
end $$;

revoke all on table private.import_attempts,private.raw_ingestion_payloads from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
alter table private.import_attempts enable row level security;
alter table private.import_attempts force row level security;
alter table private.raw_ingestion_payloads enable row level security;
alter table private.raw_ingestion_payloads force row level security;
create policy tracking_import_attempts_migration_all on private.import_attempts for all to masarifi_migration using(true) with check(true);
create policy tracking_raw_payloads_migration_all on private.raw_ingestion_payloads for all to masarifi_migration using(true) with check(true);

grant select on public.tracking_preferences,public.user_keyword_rules,public.user_sender_rules to authenticated,masarifi_api;
grant select on public.import_sessions,public.import_items,public.review_items,public.duplicate_candidates,
  public.tracking_history,public.tracking_feedback,public.unsupported_formats to masarifi_api;
grant select on public.financial_institutions,public.institution_senders,public.parser_rules to authenticated,masarifi_api;
grant select on public.merchant_rules,public.category_rules to masarifi_api;

create policy tracking_preferences_owner_read on public.tracking_preferences for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_keyword_owner_read on public.user_keyword_rules for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_sender_owner_read on public.user_sender_rules for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_sessions_owner_read on public.import_sessions for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_items_owner_read on public.import_items for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_reviews_owner_read on public.review_items for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_duplicates_owner_read on public.duplicate_candidates for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_history_owner_read on public.tracking_history for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_feedback_owner_read on public.tracking_feedback for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy tracking_unsupported_owner_read on public.unsupported_formats for select to authenticated,masarifi_api
  using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));

create policy tracking_institutions_active_read on public.financial_institutions for select to authenticated,masarifi_api
  using(active and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy tracking_institution_senders_active_read on public.institution_senders for select to authenticated,masarifi_api
  using(active and exists(select 1 from public.financial_institutions f where f.id=institution_id and f.active)
    and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy tracking_parser_rules_active_read on public.parser_rules for select to authenticated,masarifi_api
  using(status='active' and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy tracking_merchant_rules_read on public.merchant_rules for select to masarifi_api
  using((user_id is null or user_id=public.current_clerk_user_id()) and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy tracking_category_rules_read on public.category_rules for select to masarifi_api
  using((user_id is null or user_id=public.current_clerk_user_id()) and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));

do $$ declare signature text; begin
  foreach signature in array array[
    'private.tracking_request_id()','private.get_tracking_preferences(text)',
    'private.update_tracking_preferences(text,boolean,boolean,integer,integer,bigint)',
    'private.upsert_keyword_rule(text,uuid,text,text,text,text,uuid,integer,boolean,bigint)',
    'private.delete_keyword_rule(text,uuid,bigint)','private.restore_default_keyword_rules(text)',
    'private.upsert_sender_rule(text,uuid,text,text,uuid,boolean,boolean,bigint)',
    'private.delete_sender_rule(text,uuid,bigint)','private.create_import_session(text,text,text,integer,text,jsonb)',
    'private.record_unsupported_import(text,text,text,text)','private.raw_ingestion_payload_registered(text,text)',
    'private.queue_raw_ingestion_cleanup(text,text,text,bigint)',
    'private.register_raw_ingestion_payload(text,uuid,text,text,text,bigint,timestamp with time zone)',
    'private.create_review_item(uuid,text,jsonb)','private.claim_review_decision(text,uuid,text,bigint,uuid,integer)','private.decide_review_item(text,uuid,text,jsonb,uuid,uuid,uuid)',
    'private.compute_duplicate_candidates(uuid)','private.claim_duplicate_decision(text,uuid,text,bigint,uuid,integer)','private.decide_duplicate_candidate(text,uuid,text,uuid,uuid,uuid)',
    'private.record_tracking_feedback(text,uuid,text,uuid,text)','private.publish_parser_version(uuid,bigint,text,text)',
    'private.claim_tracking_admin_idempotency(text,text,text,text,interval)',
    'private.complete_tracking_admin_idempotency(text,text,text,text,uuid,integer,jsonb,text)',
    'private.claim_import_session(text,integer,integer)','private.complete_import_attempt(uuid,uuid,text,text)',
    'private.prepare_import_session(uuid,uuid)','private.apply_parser_result(uuid,uuid,jsonb)','private.finalize_import_session(uuid,uuid)','private.accept_import_item(uuid,uuid,uuid,uuid)','private.defer_import_item(uuid,uuid,text)',
    'private.clear_tracking_history(text)','private.compact_tracking_history(integer)',
    'private.purge_raw_ingestion_payloads(integer)','private.complete_raw_ingestion_purge(uuid,uuid)',
    'private.reconcile_import_session_counts(uuid)','private.reconcile_import_sessions(integer)','private.tracking_operational_metrics()',
    'private.read_tracking_admin(text,uuid,integer,text,text,timestamp with time zone,uuid,jsonb)',
    'private.mutate_tracking_admin(text,uuid,text,jsonb,bigint,text,text)',
    'private.queue_parser_corpus(uuid,text,text)','private.claim_parser_corpus(text,integer,integer)',
    'private.read_parser_corpus(uuid,uuid)','private.read_parser_preview(uuid)','private.complete_parser_corpus(uuid,uuid,jsonb,text)',
    'private.export_tracking_data(text)','private.export_tracking_batch(text,text,uuid,integer)','private.read_tracking_raw_refs(text)','private.delete_tracking_data(text)'
  ] loop execute format('revoke all on function %s from public,anon,authenticated,service_role,masarifi_api,masarifi_worker',signature); end loop;
end $$;

grant execute on function private.get_tracking_preferences(text),
  private.update_tracking_preferences(text,boolean,boolean,integer,integer,bigint),
  private.upsert_keyword_rule(text,uuid,text,text,text,text,uuid,integer,boolean,bigint),private.delete_keyword_rule(text,uuid,bigint),
  private.restore_default_keyword_rules(text),private.upsert_sender_rule(text,uuid,text,text,uuid,boolean,boolean,bigint),
  private.delete_sender_rule(text,uuid,bigint),private.create_import_session(text,text,text,integer,text,jsonb),
  private.record_unsupported_import(text,text,text,text),
  private.register_raw_ingestion_payload(text,uuid,text,text,text,bigint,timestamp with time zone),
  private.raw_ingestion_payload_registered(text,text),private.queue_raw_ingestion_cleanup(text,text,text,bigint),
  private.claim_review_decision(text,uuid,text,bigint,uuid,integer),private.decide_review_item(text,uuid,text,jsonb,uuid,uuid,uuid),
  private.claim_duplicate_decision(text,uuid,text,bigint,uuid,integer),private.decide_duplicate_candidate(text,uuid,text,uuid,uuid,uuid),
  private.record_tracking_feedback(text,uuid,text,uuid,text),private.clear_tracking_history(text),private.publish_parser_version(uuid,bigint,text,text)
  to masarifi_api;

grant execute on function private.read_tracking_admin(text,uuid,integer,text,text,timestamp with time zone,uuid,jsonb) to masarifi_api;
grant execute on function private.mutate_tracking_admin(text,uuid,text,jsonb,bigint,text,text) to masarifi_api;
grant execute on function private.claim_tracking_admin_idempotency(text,text,text,text,interval),
  private.complete_tracking_admin_idempotency(text,text,text,text,uuid,integer,jsonb,text) to masarifi_api;
grant execute on function private.queue_parser_corpus(uuid,text,text),private.read_parser_corpus(uuid,uuid),private.read_parser_preview(uuid) to masarifi_api;

grant execute on function private.claim_import_session(text,integer,integer),private.complete_import_attempt(uuid,uuid,text,text),
  private.prepare_import_session(uuid,uuid),private.apply_parser_result(uuid,uuid,jsonb),private.finalize_import_session(uuid,uuid),private.accept_import_item(uuid,uuid,uuid,uuid),private.defer_import_item(uuid,uuid,text),
  private.create_review_item(uuid,text,jsonb),private.compute_duplicate_candidates(uuid),private.compact_tracking_history(integer),
  private.claim_parser_corpus(text,integer,integer),private.read_parser_corpus(uuid,uuid),private.complete_parser_corpus(uuid,uuid,jsonb,text),
  private.purge_raw_ingestion_payloads(integer),private.complete_raw_ingestion_purge(uuid,uuid),
  private.reconcile_import_session_counts(uuid),private.reconcile_import_sessions(integer),private.tracking_operational_metrics() to masarifi_worker;
grant execute on function private.export_tracking_batch(text,text,uuid,integer),private.read_tracking_raw_refs(text),private.delete_tracking_data(text) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user;
