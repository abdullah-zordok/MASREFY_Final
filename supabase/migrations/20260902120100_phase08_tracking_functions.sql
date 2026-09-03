grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.tracking_request_id() returns text language sql volatile security invoker set search_path='' as $$
  select coalesce(nullif(current_setting('app.request_id',true),''),extensions.gen_random_uuid()::text)
$$;

create function private.get_tracking_preferences(p_user_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.tracking_preferences;
begin
  perform private.assert_active_profile(p_user_id);
  insert into public.tracking_preferences(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into p from public.tracking_preferences where user_id=p_user_id;
  return jsonb_build_object('id',p.id,'enabled',p.enabled,'reviewRequired',p.review_required,
    'duplicateWindowSeconds',p.duplicate_window_seconds,'sourceRetentionDays',p.source_retention_days,
    'historyRetentionDays',p.history_retention_days,'version',p.version,'createdAt',p.created_at,'updatedAt',p.updated_at);
end $$;

create function private.update_tracking_preferences(p_user_id text,p_enabled boolean,p_review_required boolean,
  p_source_retention_days integer,p_history_retention_days integer,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.tracking_preferences; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  perform private.get_tracking_preferences(p_user_id);
  update public.tracking_preferences set enabled=p_enabled,review_required=p_review_required,
    source_retention_days=p_source_retention_days,history_retention_days=p_history_retention_days
  where user_id=p_user_id and version=p_expected_version returning * into p;
  if p.id is null then raise exception using errcode='40001',message='TRACKING_VERSION_CONFLICT'; end if;
  perform private.enqueue_outbox_event('tracking.preference.updated.v1','tracking-preference',p.id,
    jsonb_build_object('preferenceId',p.id,'version',p.version,'enabled',p.enabled,'reviewRequired',p.review_required,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.preference-updated','tracking_preference',p.id::text,null,null,null,request_id,
    jsonb_build_object('version',p.version,'enabled',p.enabled,'reviewRequired',p.review_required));
  return private.get_tracking_preferences(p_user_id);
end $$;

create function private.upsert_keyword_rule(p_user_id text,p_id uuid,p_keyword text,p_group_key text,p_language_code text,
  p_match_type text,p_category_id uuid,p_priority integer,p_enabled boolean,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.user_keyword_rules; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  if p_keyword is null or p_group_key not in ('expense','income','transfer','withdrawal','deposit','refund','subscription','installment','fee','failed_transaction','reversal')
    or p_language_code not in ('ar','en') or p_match_type not in ('exact','contains','safe_pattern') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if p_category_id is not null and not exists(select 1 from public.categories c where c.id=p_category_id and c.active and c.deleted_at is null and (c.user_id is null or c.user_id=p_user_id)) then
    raise exception using errcode='23503',message='TRACKING_CATEGORY_INVALID';
  end if;
  if p_id is null then
    insert into public.user_keyword_rules(user_id,keyword,group_key,language_code,match_type,category_id,priority,enabled)
    values(p_user_id,btrim(p_keyword),p_group_key,p_language_code,p_match_type,p_category_id,p_priority,p_enabled) returning * into r;
  else
    update public.user_keyword_rules set keyword=btrim(p_keyword),group_key=p_group_key,language_code=p_language_code,
      match_type=p_match_type,category_id=p_category_id,priority=p_priority,enabled=p_enabled
    where id=p_id and user_id=p_user_id and version=p_expected_version returning * into r;
    if r.id is null then raise exception using errcode='40001',message='TRACKING_RULE_CONFLICT'; end if;
  end if;
  perform private.enqueue_outbox_event('tracking.rule.changed.v1','tracking-rule',r.id,
    jsonb_build_object('ruleKind','keyword','ruleId',r.id,'action',case when p_id is null then 'created' else 'updated' end,'version',r.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.keyword-rule-changed','tracking_rule',r.id::text,null,null,null,request_id,
    jsonb_build_object('version',r.version,'action',case when p_id is null then 'created' else 'updated' end));
  return to_jsonb(r)-'user_id';
exception when unique_violation or check_violation then raise exception using errcode='22023',message='TRACKING_RULE_INVALID';
end $$;

create function private.delete_keyword_rule(p_user_id text,p_id uuid,p_expected_version bigint) returns void
language plpgsql security definer set search_path='' as $$
declare r public.user_keyword_rules; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  delete from public.user_keyword_rules where id=p_id and user_id=p_user_id and version=p_expected_version returning * into r;
  if r.id is null then raise exception using errcode='40001',message='TRACKING_RULE_CONFLICT'; end if;
  perform private.enqueue_outbox_event('tracking.rule.changed.v1','tracking-rule',r.id,
    jsonb_build_object('ruleKind','keyword','ruleId',r.id,'action','deleted','version',r.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.keyword-rule-deleted','tracking_rule',r.id::text,null,null,null,request_id,
    jsonb_build_object('version',r.version,'action','deleted'));
end $$;

create function private.restore_default_keyword_rules(p_user_id text) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted_count integer; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  delete from public.user_keyword_rules where user_id=p_user_id and origin='default';
  insert into public.user_keyword_rules(user_id,keyword,group_key,language_code,origin,match_type,priority,enabled)
  select p_user_id,v.keyword,v.group_key,v.language_code,'default','contains',100,true
  from (values
    ('مصروف','expense','ar'),('Grocery','expense','en'),('راتب','income','ar'),('Salary','income','en'),
    ('تحويل','transfer','ar'),('Transfer','transfer','en'),('سحب','withdrawal','ar'),('Withdrawal','withdrawal','en'),
    ('إيداع','deposit','ar'),('Deposit','deposit','en'),('استرداد','refund','ar'),('Refund','refund','en'),
    ('اشتراك','subscription','ar'),('Subscription','subscription','en'),('قسط','installment','ar'),('Installment','installment','en'),
    ('رسوم','fee','ar'),('Fee','fee','en'),('عملية فاشلة','failed_transaction','ar'),('Failed transaction','failed_transaction','en'),
    ('عكس قيد','reversal','ar'),('Reversal','reversal','en')
  ) v(keyword,group_key,language_code);
  get diagnostics inserted_count=row_count;
  perform audit.append_event(p_user_id,'user','tracking.keyword-defaults-restored','tracking_preference',p_user_id,null,null,null,request_id,
    jsonb_build_object('count',inserted_count));
  return inserted_count;
end $$;

create function private.upsert_sender_rule(p_user_id text,p_id uuid,p_sender_pattern text,p_display_label text,
  p_institution_id uuid,p_trusted boolean,p_enabled boolean,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.user_sender_rules; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  if p_institution_id is not null and not exists(select 1 from public.financial_institutions where id=p_institution_id and active) then
    raise exception using errcode='23503',message='TRACKING_INSTITUTION_INVALID';
  end if;
  if p_id is null then
    insert into public.user_sender_rules(user_id,sender_pattern,display_label,institution_id,trusted,enabled)
    values(p_user_id,btrim(p_sender_pattern),btrim(p_display_label),p_institution_id,p_trusted,p_enabled) returning * into r;
  else
    update public.user_sender_rules set sender_pattern=btrim(p_sender_pattern),display_label=btrim(p_display_label),institution_id=p_institution_id,trusted=p_trusted,enabled=p_enabled
    where id=p_id and user_id=p_user_id and version=p_expected_version returning * into r;
    if r.id is null then raise exception using errcode='40001',message='TRACKING_RULE_CONFLICT'; end if;
  end if;
  perform private.enqueue_outbox_event('tracking.rule.changed.v1','tracking-rule',r.id,
    jsonb_build_object('ruleKind','sender','ruleId',r.id,'action',case when p_id is null then 'created' else 'updated' end,'version',r.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.sender-rule-changed','tracking_rule',r.id::text,null,null,null,request_id,
    jsonb_build_object('version',r.version,'action',case when p_id is null then 'created' else 'updated' end));
  return to_jsonb(r)-'user_id';
exception when unique_violation or check_violation then raise exception using errcode='22023',message='TRACKING_RULE_INVALID';
end $$;

create function private.delete_sender_rule(p_user_id text,p_id uuid,p_expected_version bigint) returns void
language plpgsql security definer set search_path='' as $$
declare r public.user_sender_rules; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  delete from public.user_sender_rules where id=p_id and user_id=p_user_id and version=p_expected_version returning * into r;
  if r.id is null then raise exception using errcode='40001',message='TRACKING_RULE_CONFLICT'; end if;
  perform private.enqueue_outbox_event('tracking.rule.changed.v1','tracking-rule',r.id,
    jsonb_build_object('ruleKind','sender','ruleId',r.id,'action','deleted','version',r.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.sender-rule-deleted','tracking_rule',r.id::text,null,null,null,request_id,
    jsonb_build_object('version',r.version,'action','deleted'));
end $$;

create function private.create_import_session(p_user_id text,p_source_type text,p_source_name text,p_schema_version integer,
  p_request_hash text,p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; e jsonb; item public.import_items; request_id text:=private.tracking_request_id(); item_total integer;
begin
  perform private.assert_active_profile(p_user_id);
  if p_source_type not in ('sms','file','manual') or p_schema_version<>1 or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_events is null or jsonb_typeof(p_events)<>'array' then raise exception using errcode='22023',message='IMPORT_INVALID'; end if;
  item_total:=jsonb_array_length(p_events);
  if item_total not between 1 and 10000 then raise exception using errcode='22023',message='IMPORT_LIMIT_EXCEEDED'; end if;
  insert into public.import_sessions(user_id,source_type,source_name,schema_version,request_hash,item_count)
  values(p_user_id,p_source_type,p_source_name,p_schema_version,p_request_hash,item_total)
  on conflict(user_id,request_hash) do nothing returning * into s;
  if s.id is null then select * into s from public.import_sessions where user_id=p_user_id and request_hash=p_request_hash; return to_jsonb(s)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if not (e ? 'sourceItemKey') or not (e ? 'receivedAt') or exists(select 1 from jsonb_object_keys(e) k where k not in ('sourceItemKey','sender','body','amountMinor','currency','merchant','receivedAt','occurredAt','metadata','kind','accountId','categoryId')) then
      raise exception using errcode='22023',message='IMPORT_ITEM_INVALID';
    end if;
    insert into public.import_items(user_id,session_id,source_item_key,normalized_hash,source_hash,occurred_at,amount_minor,currency_code,merchant,normalized_payload,status)
    values(p_user_id,s.id,e->>'sourceItemKey',encode(extensions.digest(convert_to(e::text,'UTF8'),'sha256'),'hex'),
      encode(extensions.digest(convert_to(coalesce(e->>'body',e->>'sourceItemKey'),'UTF8'),'sha256'),'hex'),
      (e->>'occurredAt')::timestamptz,(e->>'amountMinor')::bigint,(e->>'currency')::char(3),e->>'merchant',e,'parsed') returning * into item;
    insert into public.tracking_history(user_id,source_type,source_ref,outcome,occurred_at) values(p_user_id,p_source_type,item.id::text,'received',clock_timestamp());
    perform private.enqueue_outbox_event('import.item.changed.v1','import-item',item.id,
      jsonb_build_object('sessionId',s.id,'itemId',item.id,'status','parsed','version',item.version,'occurredAt',clock_timestamp()));
  end loop;
  perform private.enqueue_outbox_event('import.session.changed.v1','import-session',s.id,
    jsonb_build_object('sessionId',s.id,'status',s.status,'itemCount',s.item_count,'failedCount',0,'version',s.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','import.session-created','import_session',s.id::text,null,null,null,request_id,
    jsonb_build_object('status',s.status,'itemCount',s.item_count,'version',s.version));
  return to_jsonb(s)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code';
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
  raise exception using errcode='22023',message='IMPORT_ITEM_INVALID';
end $$;

create function private.record_unsupported_import(p_user_id text,p_content_hash text,p_source_name text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; u public.unsupported_formats;
begin
  perform private.assert_active_profile(p_user_id);
  if p_content_hash !~ '^[0-9a-f]{64}$' or p_reason !~ '^[A-Z][A-Z0-9_]{1,79}$' then
    raise exception using errcode='22023',message='UNSUPPORTED_FORMAT_INVALID';
  end if;
  insert into public.import_sessions(user_id,source_type,source_name,schema_version,request_hash,status,completed_at)
  values(p_user_id,'file',p_source_name,1,p_content_hash,'failed',clock_timestamp())
  on conflict(user_id,request_hash) do nothing returning * into s;
  if s.id is null then select * into s from public.import_sessions where user_id=p_user_id and request_hash=p_content_hash; end if;
  insert into public.unsupported_formats(user_id,session_id,content_hash,reason)
  values(p_user_id,s.id,p_content_hash,p_reason)
  on conflict(session_id,content_hash) do nothing returning * into u;
  if u.id is null then select * into u from public.unsupported_formats where session_id=s.id and content_hash=p_content_hash; end if;
  perform private.enqueue_outbox_event('unsupported.format.recorded.v1','unsupported-format',u.id,
    jsonb_build_object('unsupportedFormatId',u.id,'reasonCode',u.reason,'occurrenceCount',1,'occurredAt',u.created_at));
  return jsonb_build_object('sessionId',s.id,'formatId',u.id,'reasonCode',u.reason,'status',u.status);
exception when check_violation or not_null_violation then
  raise exception using errcode='22023',message='UNSUPPORTED_FORMAT_INVALID';
end $$;

create function private.register_raw_ingestion_payload(p_user_id text,p_session_id uuid,p_storage_ref text,p_payload_hash text,
  p_content_type text,p_size_bytes bigint,p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.raw_ingestion_payloads;
begin
  perform private.assert_active_profile(p_user_id);
  if not exists(select 1 from public.import_sessions s where s.id=p_session_id and s.user_id=p_user_id)
    or p_expires_at<=clock_timestamp() then raise exception using errcode='22023',message='RAW_PAYLOAD_INVALID'; end if;
  insert into private.raw_ingestion_payloads(session_id,storage_ref,payload_hash,content_type,size_bytes,expires_at)
  values(p_session_id,p_storage_ref,p_payload_hash,p_content_type,p_size_bytes,p_expires_at)
  on conflict(storage_ref) do update set session_id=excluded.session_id,scan_status='clean',
    expires_at=greatest(private.raw_ingestion_payloads.expires_at,excluded.expires_at)
  where private.raw_ingestion_payloads.scan_status='cleanup'
    and private.raw_ingestion_payloads.payload_hash=excluded.payload_hash
    and private.raw_ingestion_payloads.content_type=excluded.content_type
    and private.raw_ingestion_payloads.size_bytes=excluded.size_bytes
  returning * into r;
  if r.id is null then raise exception using errcode='23505',message='RAW_PAYLOAD_CONFLICT'; end if;
  return jsonb_build_object('id',r.id,'sessionId',r.session_id,'payloadHash',r.payload_hash,'sizeBytes',r.size_bytes,
    'contentType',r.content_type,'expiresAt',r.expires_at);
end $$;

create function private.raw_ingestion_payload_registered(p_user_id text,p_storage_ref text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from private.raw_ingestion_payloads r
    join public.import_sessions s on s.id=r.session_id
    where s.user_id=p_user_id and r.storage_ref=p_storage_ref and r.scan_status='clean'
  )
$$;

create function private.queue_raw_ingestion_cleanup(p_storage_ref text,p_payload_hash text,p_content_type text,p_size_bytes bigint) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  insert into private.raw_ingestion_payloads(session_id,storage_ref,payload_hash,content_type,size_bytes,scan_status,expires_at)
  values(null,p_storage_ref,p_payload_hash,p_content_type,p_size_bytes,'cleanup',clock_timestamp()+interval '1 second')
  on conflict(storage_ref) do update set purge_token=extensions.gen_random_uuid(),purge_lease_until=clock_timestamp()
  where private.raw_ingestion_payloads.scan_status='purging';
  return found;
exception when check_violation or not_null_violation then
  raise exception using errcode='22023',message='RAW_CLEANUP_INVALID';
end $$;

create function private.create_review_item(p_import_item_id uuid,p_reason text,p_proposed_values jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.import_items; r public.review_items; inserted boolean:=false; source_type text; safe_values jsonb;
begin
  select * into i from public.import_items where id=p_import_item_id for update;
  if i.id is null or i.status not in ('parsed','review') then raise exception using errcode='22023',message='REVIEW_ITEM_INVALID'; end if;
  if p_proposed_values is null or jsonb_typeof(p_proposed_values)<>'object' then raise exception using errcode='22023',message='REVIEW_ITEM_INVALID'; end if;
  safe_values:=p_proposed_values-'body'-'sender'-'metadata'-'sourceText';
  insert into public.review_items(user_id,import_item_id,reason,proposed_values,original_values)
  values(i.user_id,i.id,p_reason,safe_values,safe_values)
  on conflict(import_item_id) where status='pending' do nothing returning * into r;
  if r.id is null then select * into r from public.review_items where import_item_id=i.id and status='pending'; else inserted:=true; end if;
  update public.import_items set status='review' where id=i.id and status='parsed';
  if inserted then
    select s.source_type into source_type from public.import_sessions s where s.id=i.session_id;
    insert into public.tracking_history(user_id,source_type,source_ref,outcome,reason_codes,parser_version_id,applied_rule_ids,review_item_id)
    values(i.user_id,source_type,i.id::text,'reviewed',array[p_reason],i.parser_version_id,i.applied_rule_ids,r.id);
    perform private.enqueue_outbox_event('tracking.review.requested.v1','review-item',r.id,
      jsonb_build_object('reviewId',r.id,'itemId',i.id,'reasonCode',p_reason,'version',r.version,'occurredAt',clock_timestamp()));
  end if;
  return to_jsonb(r)-'user_id'-'decision_token'-'decision_lease_until';
end $$;

create function private.claim_review_decision(p_user_id text,p_review_id uuid,p_decision text,p_expected_version bigint,
  p_decision_token uuid,p_lease_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.review_items;
begin
  perform private.assert_active_profile(p_user_id);
  if p_decision not in ('accept','reject','edit_accept') or p_decision_token is null or p_lease_seconds not between 30 and 300 then
    raise exception using errcode='22023',message='REVIEW_DECISION_INVALID'; end if;
  select * into r from public.review_items where id=p_review_id and user_id=p_user_id for update;
  if r.id is null then raise exception using errcode='P0002',message='REVIEW_NOT_FOUND'; end if;
  if r.status<>'pending' then
    if r.decision_token=p_decision_token and r.decision_action=p_decision then
      return to_jsonb(r)-'user_id'-'decision_token'-'decision_lease_until';
    end if;
    raise exception using errcode='40001',message='REVIEW_VERSION_CONFLICT';
  end if;
  if r.decision_token=p_decision_token and r.decision_action=p_decision then
    update public.review_items set decision_lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) where id=r.id returning * into r;
  elsif r.version<>p_expected_version or (r.decision_token is not null and r.decision_lease_until>clock_timestamp()) then
    raise exception using errcode='40001',message='REVIEW_VERSION_CONFLICT';
  else
    update public.review_items set decision_token=p_decision_token,decision_action=p_decision,
      decision_lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) where id=r.id returning * into r;
  end if;
  return to_jsonb(r)-'user_id'-'decision_token'-'decision_lease_until';
end $$;

create function private.decide_review_item(p_user_id text,p_review_id uuid,p_decision text,p_patch jsonb,
  p_decision_token uuid,p_operation_id uuid,p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.review_items; i public.import_items; request_id text:=private.tracking_request_id(); accepted jsonb;
begin
  perform private.assert_active_profile(p_user_id);
  if p_decision not in ('accept','reject','edit_accept') or p_patch is null or jsonb_typeof(p_patch)<>'object'
    or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('amountMinor','currency','accountId','categoryId','title','merchant','paymentMethod','note','occurredAt')) then
    raise exception using errcode='22023',message='REVIEW_DECISION_INVALID'; end if;
  select * into r from public.review_items where id=p_review_id and user_id=p_user_id for update;
  if r.id is null or r.decision_token<>p_decision_token or r.decision_action<>p_decision then raise exception using errcode='40001',message='REVIEW_VERSION_CONFLICT'; end if;
  if r.status<>'pending' then return to_jsonb(r)-'user_id'-'decision_token'-'decision_lease_until'; end if;
  if r.decision_lease_until<=clock_timestamp() then raise exception using errcode='40001',message='REVIEW_VERSION_CONFLICT'; end if;
  select * into i from public.import_items where id=r.import_item_id and user_id=p_user_id for update;
  if p_decision<>'reject' and (p_transaction_id is null or not exists(select 1 from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id and t.status='confirmed')) then
    raise exception using errcode='23503',message='REVIEW_LEDGER_RESULT_INVALID'; end if;
  if p_decision<>'reject' then
    select jsonb_strip_nulls(jsonb_build_object('kind',t.kind,'amountMinor',t.amount_minor,'currency',btrim(t.currency_code::text),
      'accountId',(select p.account_id from public.transaction_postings p where p.transaction_id=t.id and p.clearing_state='confirmed' order by p.id limit 1),
      'categoryId',t.category_id,'title',t.title,'merchant',t.merchant,'paymentMethod',t.payment_method,'note',t.note,'occurredAt',t.occurred_at))
    into accepted from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id;
  end if;
  update public.review_items set status=case when p_decision='reject' then 'rejected' when p_decision='edit_accept' then 'edited' else 'accepted' end,
    accepted_values=case when p_decision='reject' then null else accepted end,reviewed_at=clock_timestamp(),reviewed_by=p_user_id,
    decision_lease_until=null where id=r.id returning * into r;
  update public.import_items set status=case when p_decision='reject' then 'rejected' else 'accepted' end,
    transaction_id=case when p_decision='reject' then null else p_transaction_id end,
    operation_id=case when p_decision='reject' then null else p_operation_id end where id=i.id;
  insert into public.tracking_history(user_id,source_type,source_ref,outcome,reason_codes,parser_version_id,applied_rule_ids,review_item_id,operation_id,transaction_id)
  select p_user_id,s.source_type,i.id::text,case when p_decision='reject' then 'rejected' else 'accepted' end,array[r.reason],i.parser_version_id,i.applied_rule_ids,r.id,
    case when p_decision='reject' then null else p_operation_id end,case when p_decision='reject' then null else p_transaction_id end from public.import_sessions s where s.id=i.session_id;
  perform private.enqueue_outbox_event('tracking.review.resolved.v1','review-item',r.id,
    jsonb_build_object('reviewId',r.id,'itemId',i.id,'resolution',p_decision,'version',r.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.review-resolved','review_item',r.id::text,null,null,null,request_id,
    jsonb_build_object('decision',p_decision,'version',r.version));
  return to_jsonb(r)-'user_id'-'decision_token'-'decision_lease_until';
end $$;

create function private.compute_duplicate_candidates(p_import_item_id uuid) returns setof public.duplicate_candidates
language plpgsql security definer set search_path='' as $$
declare i public.import_items; window_seconds integer; candidate public.duplicate_candidates;
begin
  select * into i from public.import_items where id=p_import_item_id for update;
  if i.id is null or i.amount_minor is null or i.currency_code is null then return; end if;
  select coalesce(p.duplicate_window_seconds,86400) into window_seconds from public.tracking_preferences p where p.user_id=i.user_id;
  window_seconds:=coalesce(window_seconds,86400);
  for candidate in
  insert into public.duplicate_candidates(user_id,left_item_id,right_transaction_id,score,reasons)
  select i.user_id,i.id,t.id,
    least(1::numeric,0.5000 + case when abs(extract(epoch from (t.occurred_at-i.occurred_at)))<=300 then 0.2000 else 0.1000 end
      + case when lower(coalesce(t.merchant,''))=lower(coalesce(i.merchant,'')) and i.merchant is not null then 0.1500 else 0 end
      + case when t.external_ref is not null and t.external_ref=i.normalized_payload->>'externalRef' then 0.1500 else 0 end),
    array_remove(array['amount_currency',case when abs(extract(epoch from (t.occurred_at-i.occurred_at)))<=300 then 'time_near' else 'time_window' end,
      case when lower(coalesce(t.merchant,''))=lower(coalesce(i.merchant,'')) and i.merchant is not null then 'merchant_exact' end,
      case when t.external_ref is not null and t.external_ref=i.normalized_payload->>'externalRef' then 'external_ref_exact' end],null)
  from public.transactions t where t.user_id=i.user_id and t.status='confirmed' and t.deleted_at is null and t.amount_minor=abs(i.amount_minor)
    and t.currency_code=i.currency_code and i.occurred_at is not null and abs(extract(epoch from (t.occurred_at-i.occurred_at)))<=window_seconds
  on conflict(left_item_id,right_transaction_id) do nothing returning *
  loop
    perform private.enqueue_outbox_event('tracking.duplicate.detected.v1','duplicate-candidate',candidate.id,
      jsonb_build_object('candidateId',candidate.id,'itemId',candidate.left_item_id,'existingTransactionId',candidate.right_transaction_id,
        'scoreBand',case when candidate.score>=0.85 then 'high' when candidate.score>=0.70 then 'medium' else 'low' end,
        'version',candidate.version,'occurredAt',candidate.created_at));
    return next candidate;
  end loop;
end $$;

create function private.claim_duplicate_decision(p_user_id text,p_candidate_id uuid,p_resolution text,p_expected_version bigint,
  p_decision_token uuid,p_lease_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.duplicate_candidates;
begin
  perform private.assert_active_profile(p_user_id);
  if p_resolution not in ('keep_existing','keep_new','keep_both','merge_details') or p_decision_token is null or p_lease_seconds not between 30 and 300 then
    raise exception using errcode='22023',message='DUPLICATE_DECISION_INVALID'; end if;
  select * into c from public.duplicate_candidates where id=p_candidate_id and user_id=p_user_id for update;
  if c.id is null then raise exception using errcode='P0002',message='DUPLICATE_NOT_FOUND'; end if;
  if c.status<>'proposed' then
    if c.decision_token=p_decision_token and c.decision_action=p_resolution then
      return to_jsonb(c)-'user_id'-'decision_token'-'decision_lease_until';
    end if;
    raise exception using errcode='40001',message='DUPLICATE_VERSION_CONFLICT';
  end if;
  if c.decision_token=p_decision_token and c.decision_action=p_resolution then
    update public.duplicate_candidates set decision_lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) where id=c.id returning * into c;
  elsif c.version<>p_expected_version or (c.decision_token is not null and c.decision_lease_until>clock_timestamp()) then
    raise exception using errcode='40001',message='DUPLICATE_VERSION_CONFLICT';
  else
    update public.duplicate_candidates set decision_token=p_decision_token,decision_action=p_resolution,
      decision_lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) where id=c.id returning * into c;
  end if;
  return to_jsonb(c)-'user_id'-'decision_token'-'decision_lease_until';
end $$;

create function private.decide_duplicate_candidate(p_user_id text,p_candidate_id uuid,p_resolution text,p_decision_token uuid,
  p_operation_id uuid,p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.duplicate_candidates; i public.import_items; request_id text:=private.tracking_request_id(); linked_id uuid;
begin
  perform private.assert_active_profile(p_user_id);
  if p_resolution not in ('keep_existing','keep_new','keep_both','merge_details') then raise exception using errcode='22023',message='DUPLICATE_DECISION_INVALID'; end if;
  select * into c from public.duplicate_candidates where id=p_candidate_id and user_id=p_user_id for update;
  if c.id is null or c.decision_token<>p_decision_token or c.decision_action<>p_resolution then raise exception using errcode='40001',message='DUPLICATE_VERSION_CONFLICT'; end if;
  if c.status<>'proposed' then return to_jsonb(c)-'user_id'-'reasons'-'decision_token'-'decision_lease_until'; end if;
  if c.decision_lease_until<=clock_timestamp() then raise exception using errcode='40001',message='DUPLICATE_VERSION_CONFLICT'; end if;
  select * into i from public.import_items where id=c.left_item_id and user_id=p_user_id for update;
  linked_id:=case when p_resolution in ('keep_existing','merge_details') then c.right_transaction_id else p_transaction_id end;
  if linked_id is null or not exists(select 1 from public.transactions t where t.id=linked_id and t.user_id=p_user_id and t.status='confirmed') then
    raise exception using errcode='23503',message='DUPLICATE_LEDGER_RESULT_INVALID'; end if;
  update public.duplicate_candidates set status=case when p_resolution in ('keep_existing','merge_details') then 'duplicate' else 'not_duplicate' end,
    resolution=p_resolution,decided_at=clock_timestamp(),decision_lease_until=null where id=c.id returning * into c;
  update public.import_items set status=case when p_resolution in ('keep_existing','merge_details') then 'duplicate' else 'accepted' end,
    transaction_id=linked_id,operation_id=p_operation_id where id=i.id;
  insert into public.tracking_history(user_id,source_type,source_ref,outcome,reason_codes,parser_version_id,applied_rule_ids,duplicate_candidate_id,operation_id,transaction_id)
  select p_user_id,s.source_type,i.id::text,case when p_resolution in ('keep_existing','merge_details') then 'duplicate' else 'accepted' end,c.reasons,i.parser_version_id,i.applied_rule_ids,c.id,p_operation_id,linked_id
  from public.import_sessions s where s.id=i.session_id;
  perform private.enqueue_outbox_event('tracking.duplicate.resolved.v1','duplicate-candidate',c.id,
    jsonb_build_object('candidateId',c.id,'resolution',p_resolution,'version',c.version,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_user_id,'user','tracking.duplicate-resolved','duplicate_candidate',c.id::text,null,null,null,request_id,
    jsonb_build_object('resolution',p_resolution,'version',c.version));
  return to_jsonb(c)-'user_id'-'reasons'-'decision_token'-'decision_lease_until';
end $$;

create function private.record_tracking_feedback(p_user_id text,p_history_id uuid,p_feedback_type text,p_corrected_category_id uuid,p_comment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.tracking_feedback; request_id text:=private.tracking_request_id();
begin
  perform private.assert_active_profile(p_user_id);
  if p_corrected_category_id is not null and p_feedback_type<>'wrong_category' then
    raise exception using errcode='22023',message='TRACKING_FEEDBACK_INVALID'; end if;
  if p_corrected_category_id is not null and not exists(select 1 from public.categories c where c.id=p_corrected_category_id and c.active and c.deleted_at is null and (c.user_id is null or c.user_id=p_user_id)) then
    raise exception using errcode='23503',message='TRACKING_CATEGORY_INVALID'; end if;
  insert into public.tracking_feedback(user_id,history_id,feedback_type,corrected_category_id,comment)
  values(p_user_id,p_history_id,p_feedback_type,p_corrected_category_id,p_comment)
  on conflict(user_id,history_id,feedback_type) do nothing returning * into f;
  if f.id is null then select * into f from public.tracking_feedback where user_id=p_user_id and history_id=p_history_id and feedback_type=p_feedback_type; end if;
  perform private.enqueue_outbox_event('tracking.feedback.recorded.v1','tracking-feedback',f.id,
    jsonb_build_object('feedbackId',f.id,'historyId',f.history_id,'kind',f.feedback_type,'occurredAt',f.created_at));
  perform audit.append_event(p_user_id,'user','tracking.feedback-recorded','tracking_feedback',f.id::text,null,null,null,request_id,
    jsonb_build_object('kind',f.feedback_type));
  return to_jsonb(f)-'user_id'-'comment'-'corrected_category_id';
end $$;

create function private.publish_parser_version(p_version_id uuid,p_expected_rule_version bigint,p_admin_id text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.parser_rule_versions; r public.parser_rules; request_id text:=private.tracking_request_id(); actor_type text:='admin';
begin
  if p_admin_id='system:seed' and current_user='masarifi_migration' then actor_type:='system';
  else perform private.assert_admin_permission('parsers.versions.manage'); end if;
  if p_reason is null or p_reason<>btrim(p_reason) or char_length(p_reason) not between 10 and 500 then raise exception using errcode='22023',message='ADMIN_REASON_INVALID'; end if;
  select * into v from public.parser_rule_versions where id=p_version_id for update;
  if v.id is null then raise exception using errcode='P0002',message='PARSER_VERSION_NOT_FOUND'; end if;
  select * into r from public.parser_rules where id=v.parser_rule_id for update;
  if r.version<>p_expected_rule_version then raise exception using errcode='40001',message='PARSER_RULE_VERSION_CONFLICT'; end if;
  if v.published_at is not null or v.corpus_status<>'passed' or not exists(select 1 from public.parser_test_cases t where t.parser_version_id=v.id and t.enabled)
    or exists(select 1 from public.parser_test_cases t where t.parser_version_id=v.id and t.enabled and t.last_result is distinct from 'passed')
    or (r.active_version_id is not null and
      (select count(*) from public.parser_test_cases t where t.parser_version_id=v.id and t.enabled and t.last_result='passed') <
      (select count(*) from public.parser_test_cases t where t.parser_version_id=r.active_version_id and t.enabled and t.last_result='passed')) then
    raise exception using errcode='22023',message='PARSER_CORPUS_NOT_PASSED'; end if;
  update public.parser_rule_versions set published_at=clock_timestamp() where id=v.id returning * into v;
  update public.parser_rules set active_version_id=v.id,status='active' where id=r.id returning * into r;
  perform private.enqueue_outbox_event('parser.rule.version.changed.v1','parser-rule',r.id,
    jsonb_build_object('ruleId',r.id,'versionId',v.id,'status','active','versionNumber',v.version_no,'occurredAt',clock_timestamp()));
  perform audit.append_event(p_admin_id,actor_type,'parser.version-published','parser_rule',r.id::text,null,null,p_reason,request_id,
    jsonb_build_object('versionId',v.id::text,'versionNumber',v.version_no));
  return jsonb_build_object('ruleId',r.id,'versionId',v.id,'status',r.status,'versionNumber',v.version_no,'publishedAt',v.published_at);
end $$;

create function private.guard_published_parser_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.published_at is not null and (tg_op='DELETE' or row(
    new.parser_rule_id,new.version_no,new.definition,new.definition_hash,new.created_by,new.published_at,new.created_at
  ) is distinct from row(
    old.parser_rule_id,old.version_no,old.definition,old.definition_hash,old.created_by,old.published_at,old.created_at
  )) then raise exception using errcode='55000',message='PARSER_VERSION_IMMUTABLE'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger parser_rule_versions_immutable before update on public.parser_rule_versions
for each row when(old.published_at is not null) execute function private.guard_published_parser_version();
create trigger parser_rule_versions_delete_guard before delete on public.parser_rule_versions
for each row execute function private.guard_published_parser_version();

create function private.claim_tracking_admin_idempotency(
  p_actor_id text,p_scope text,p_key_hash text,p_request_hash text,p_ttl interval
) returns table(
  outcome text,response_status integer,response_body jsonb,resource_ref text,
  retry_after_seconds integer,lease_token uuid
) language plpgsql security definer set search_path='' as $$
declare existing private.idempotency_keys; inserted_id uuid; new_token uuid:=extensions.gen_random_uuid();
  now_at timestamptz:=clock_timestamp();
begin
  perform private.assert_active_profile(p_actor_id);
  if not exists(select 1 from public.admin_profiles a where a.user_id=p_actor_id and a.status='active') then
    raise exception using errcode='42501',message='ADMIN_PERMISSION_DENIED'; end if;
  if p_scope is null or p_scope !~ '^tracking\.(admin|parser)\.[a-z0-9_.-]+$'
    or p_key_hash is null or p_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_ttl is null or p_ttl<interval '1 minute' or p_ttl>interval '24 hours' then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID'; end if;
  insert into private.idempotency_keys(actor_id,scope,key_hash,request_hash,locked_until,expires_at,lease_token)
  values(p_actor_id,p_scope,p_key_hash,p_request_hash,now_at+p_ttl,now_at+interval '30 days',new_token)
  on conflict(actor_id,scope,key_hash) do nothing returning id into inserted_id;
  if inserted_id is not null then
    return query select 'new'::text,null::integer,null::jsonb,null::text,null::integer,new_token; return;
  end if;
  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash for update;
  if existing.request_hash<>p_request_hash then
    return query select 'hash_mismatch'::text,null::integer,null::jsonb,null::text,null::integer,null::uuid;
  elsif existing.state='completed' then
    return query select 'replay'::text,existing.response_status,existing.response_body,existing.resource_ref,null::integer,null::uuid;
  elsif existing.state='claimed' and existing.locked_until>now_at then
    return query select 'in_progress'::text,null::integer,null::jsonb,null::text,
      greatest(1,ceil(extract(epoch from existing.locked_until-now_at)))::integer,null::uuid;
  else
    update private.idempotency_keys set state='claimed',locked_until=now_at+p_ttl,response_status=null,
      response_body=null,resource_ref=null,lease_token=new_token where id=existing.id;
    return query select 'new'::text,null::integer,null::jsonb,null::text,null::integer,new_token;
  end if;
end $$;

create function private.complete_tracking_admin_idempotency(
  p_actor_id text,p_scope text,p_key_hash text,p_request_hash text,p_lease_token uuid,
  p_response_status integer,p_response_body jsonb,p_resource_ref text
) returns void language plpgsql security definer set search_path='' as $$
declare existing private.idempotency_keys;
begin
  perform private.assert_active_profile(p_actor_id);
  if not exists(select 1 from public.admin_profiles a where a.user_id=p_actor_id and a.status='active')
    or p_scope is null or p_scope !~ '^tracking\.(admin|parser)\.[a-z0-9_.-]+$' then
    raise exception using errcode='42501',message='ADMIN_PERMISSION_DENIED'; end if;
  if p_lease_token is null or p_response_status not between 100 and 599
    or p_response_body is null or jsonb_typeof(p_response_body)<>'object'
    or pg_column_size(p_response_body)>65536 then
    raise exception using errcode='22023',message='IDEMPOTENCY_RESPONSE_INVALID'; end if;
  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash for update;
  if existing.id is null then raise exception using errcode='P0001',message='IDEMPOTENCY_CLAIM_MISSING';
  elsif existing.request_hash<>p_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSED';
  elsif existing.state='completed' then
    if existing.response_status=p_response_status and existing.response_body=p_response_body
      and existing.resource_ref is not distinct from p_resource_ref then return; end if;
    raise exception using errcode='P0001',message='IDEMPOTENCY_RESPONSE_MISMATCH';
  elsif existing.state<>'claimed' or existing.lease_token is distinct from p_lease_token then
    raise exception using errcode='P0001',message='IDEMPOTENCY_LEASE_LOST';
  end if;
  update private.idempotency_keys set state='completed',response_status=p_response_status,
    response_body=p_response_body,resource_ref=p_resource_ref where id=existing.id;
end $$;

create function private.claim_import_session(p_worker_id text,p_limit_count integer,p_lease_seconds integer) returns setof public.import_sessions
language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128 or p_limit_count not between 1 and 100 or p_lease_seconds not between 5 and 300 then
    raise exception using errcode='22023',message='IMPORT_CLAIM_INVALID'; end if;
  perform set_config('synchronous_commit','off',true);
  return query
  with eligible as (
    select s.id from public.import_sessions s where s.status in ('received','processing') and s.next_attempt_at<=clock_timestamp()
      and (s.lease_until is null or s.lease_until<=clock_timestamp()) and s.attempt_count<10
    order by s.next_attempt_at,s.started_at,s.id for update skip locked limit p_limit_count
  ), claimed as (
    update public.import_sessions s set status='processing',claim_token=extensions.gen_random_uuid(),claimed_by=btrim(p_worker_id),
      lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=s.attempt_count+1
    from eligible e where s.id=e.id returning s.*
  ), attempts as (
    insert into private.import_attempts(session_id,attempt_no,worker_id,fence_token,lease_until)
    select c.id,c.attempt_count,c.claimed_by,c.claim_token,c.lease_until from claimed c returning session_id
  ) select c.* from claimed c join attempts a on a.session_id=c.id;
end $$;

create function private.complete_import_attempt(p_session_id uuid,p_fence_token uuid,p_status text,p_error_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; terminal boolean;
begin
  if p_status not in ('succeeded','failed') or (p_status='succeeded' and p_error_code is not null) then raise exception using errcode='22023',message='IMPORT_COMPLETE_INVALID'; end if;
  select * into s from public.import_sessions where id=p_session_id for update;
  if s.id is null or s.claim_token is distinct from p_fence_token or s.lease_until is null or s.lease_until<=clock_timestamp() then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  update private.import_attempts set status=p_status,completed_at=clock_timestamp(),error_code=p_error_code
  where session_id=s.id and fence_token=p_fence_token and status='running';
  terminal:=(p_status='succeeded' and not exists(select 1 from public.import_items i where i.session_id=s.id and i.status in ('parsed','review')))
    or (p_status='failed' and s.attempt_count>=10);
  update public.import_sessions set
    status=case when p_status='succeeded' and exists(select 1 from public.import_items i where i.session_id=s.id and i.status in ('parsed','review')) then 'review'
      when p_status='succeeded' then 'complete' when s.attempt_count>=10 then 'failed' else 'received' end,
    completed_at=case when terminal then clock_timestamp() else null end,
    claim_token=null,claimed_by=null,lease_until=null,last_error_code=p_error_code,
    next_attempt_at=case when terminal then next_attempt_at else clock_timestamp()+make_interval(secs=>least(300,(2^least(s.attempt_count,8))::integer+abs(mod(hashtextextended(s.id::text,s.attempt_count),31))::integer)) end
  where id=s.id returning * into s;
  perform private.enqueue_outbox_event('import.session.changed.v1','import-session',s.id,
    jsonb_build_object('sessionId',s.id,'status',s.status,'itemCount',s.item_count,'failedCount',case when s.status='failed' then 1 else 0 end,'version',s.version,'occurredAt',clock_timestamp()));
  return to_jsonb(s)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code';
end $$;

create function private.finalize_import_session(p_session_id uuid,p_fence_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; i public.import_items; prefs public.tracking_preferences; proposal jsonb; auto_items jsonb:='[]'; duplicates integer;
begin
  select * into s from public.import_sessions where id=p_session_id and claim_token=p_fence_token and lease_until>clock_timestamp() for update;
  if s.id is null then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  select * into prefs from public.tracking_preferences where user_id=s.user_id;
  for i in select * from public.import_items where session_id=s.id and status='parsed' order by id for update loop
    update public.import_items x set
      merchant=coalesce(x.merchant,(select m.normalized_merchant from public.merchant_rules m where m.active and (m.user_id is null or m.user_id=s.user_id) and strpos(lower(coalesce(x.merchant,x.normalized_payload->>'body','')),lower(m.pattern))>0 order by m.user_id nulls last,m.priority,m.id limit 1)),
      normalized_payload=coalesce((select jsonb_build_object('categoryId',c.category_id) from public.category_rules c where c.active and (c.user_id is null or c.user_id=s.user_id) and strpos(lower(coalesce(x.merchant,x.normalized_payload->>'body','')),lower(c.pattern))>0 order by c.user_id nulls last,c.priority,c.id limit 1),'{}'::jsonb)||x.normalized_payload,
      confidence_basis_points=case when x.amount_minor is not null and x.currency_code is not null and x.occurred_at is not null and x.normalized_payload ? 'accountId' then 9000 else 6000 end
    where x.id=i.id returning * into i;
    perform private.compute_duplicate_candidates(i.id);
    select count(*) into duplicates from public.duplicate_candidates d where d.left_item_id=i.id and d.status='proposed';
    proposal:=i.normalized_payload||jsonb_strip_nulls(jsonb_build_object('amountMinor',i.amount_minor,'currency',btrim(i.currency_code::text),'merchant',i.merchant,'occurredAt',i.occurred_at));
    if coalesce(prefs.review_required,true) or i.confidence_basis_points<8000 or duplicates>0
      or coalesce(i.normalized_payload->>'kind','') not in ('income','expense') then
      perform private.create_review_item(i.id,case when duplicates>0 then 'duplicate_candidate' when i.confidence_basis_points<8000 then 'low_confidence' else 'review_required' end,proposal);
    else auto_items:=auto_items||jsonb_build_array(jsonb_build_object('id',i.id,'userId',i.user_id,'values',proposal)); end if;
  end loop;
  return jsonb_build_object('sessionId',s.id,'autoItems',auto_items);
end $$;

create function private.prepare_import_session(p_session_id uuid,p_fence_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; i public.import_items; version_id uuid; definition jsonb; parser_items jsonb:='[]';
begin
  select * into s from public.import_sessions where id=p_session_id and claim_token=p_fence_token and lease_until>clock_timestamp() for update;
  if s.id is null then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  for i in select * from public.import_items where session_id=s.id and status='parsed' order by id for update loop
    select r.active_version_id,v.definition into version_id,definition
    from public.parser_rules r join public.parser_rule_versions v on v.id=r.active_version_id
    join public.institution_senders d on d.institution_id=r.institution_id
    where r.status='active' and r.source_type=s.source_type and d.active and lower(d.sender_pattern)=lower(i.normalized_payload->>'sender')
    order by d.priority,r.id limit 1;
    update public.import_items set parser_version_id=version_id where id=i.id;
    parser_items:=parser_items||jsonb_build_array(jsonb_build_object(
      'id',i.id,'userId',i.user_id,'parserVersionId',version_id,'definition',definition,
      'input',jsonb_build_object('sender',coalesce(i.normalized_payload->>'sender',''),'body',coalesce(i.normalized_payload->>'body',''),
        'language',coalesce(i.normalized_payload->>'language',''),'source',s.source_type)));
  end loop;
  return jsonb_build_object('sessionId',s.id,'parserItems',parser_items);
end $$;

create function private.apply_parser_result(p_item_id uuid,p_fence_token uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.import_items;
begin
  if p_result is null or jsonb_typeof(p_result)<>'object' or exists(
    select 1 from jsonb_object_keys(p_result) key where key not in ('amountMinor','currency','merchant','occurredAt','kind','category','direction')
  ) then raise exception using errcode='22023',message='PARSER_RESULT_INVALID'; end if;
  select x.* into i from public.import_items x join public.import_sessions s on s.id=x.session_id
  where x.id=p_item_id and x.status='parsed' and s.claim_token=p_fence_token and s.lease_until>clock_timestamp() for update of x;
  if i.id is null then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  update public.import_items set
    amount_minor=coalesce(amount_minor,(p_result->>'amountMinor')::bigint),
    currency_code=coalesce(currency_code,(p_result->>'currency')::char(3)),
    merchant=coalesce(merchant,p_result->>'merchant'),
    occurred_at=coalesce(occurred_at,(p_result->>'occurredAt')::timestamptz),
    normalized_payload=p_result||normalized_payload
  where id=i.id returning * into i;
  return to_jsonb(i)-'user_id'-'source_hash'-'normalized_hash'-'normalized_payload';
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
  raise exception using errcode='22023',message='PARSER_RESULT_INVALID';
end $$;

create function private.accept_import_item(p_item_id uuid,p_fence_token uuid,p_operation_id uuid,p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.import_items; s public.import_sessions;
begin
  select x.* into i from public.import_items x join public.import_sessions y on y.id=x.session_id where x.id=p_item_id and y.claim_token=p_fence_token and y.lease_until>clock_timestamp() for update of x;
  if i.id is null then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  select * into s from public.import_sessions where id=i.session_id;
  if not exists(select 1 from public.transactions t where t.id=p_transaction_id and t.user_id=i.user_id and t.status='confirmed') then raise exception using errcode='23503',message='IMPORT_LEDGER_RESULT_INVALID'; end if;
  update public.import_items set status='accepted',operation_id=p_operation_id,transaction_id=p_transaction_id where id=i.id returning * into i;
  insert into public.tracking_history(user_id,source_type,source_ref,outcome,parser_version_id,applied_rule_ids,operation_id,transaction_id)
  values(i.user_id,s.source_type,i.id::text,'accepted',i.parser_version_id,i.applied_rule_ids,p_operation_id,p_transaction_id);
  perform private.enqueue_outbox_event('import.item.changed.v1','import-item',i.id,jsonb_build_object('sessionId',i.session_id,'itemId',i.id,'status','accepted','transactionId',p_transaction_id,'version',i.version,'occurredAt',clock_timestamp()));
  return to_jsonb(i)-'user_id'-'source_hash'-'normalized_hash'-'normalized_payload';
end $$;

create function private.defer_import_item(p_item_id uuid,p_fence_token uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.import_items;
begin
  select x.* into i from public.import_items x join public.import_sessions s on s.id=x.session_id
  where x.id=p_item_id and s.claim_token=p_fence_token and s.lease_until>clock_timestamp() for update of x;
  if i.id is null then raise exception using errcode='40001',message='IMPORT_LEASE_STALE'; end if;
  return private.create_review_item(i.id,p_reason,i.normalized_payload);
end $$;

create function private.guard_tracking_history_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' and current_setting('app.tracking_retention',true)='on' then return old; end if;
  raise exception using errcode='55000',message='IMMUTABLE_ROW';
end $$;
drop trigger tracking_history_immutable on public.tracking_history;
create trigger tracking_history_immutable before update or delete on public.tracking_history for each row execute function private.guard_tracking_history_change();

create function private.clear_tracking_history(p_user_id text) returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  perform private.assert_active_profile(p_user_id); perform set_config('app.tracking_retention','on',true);
  delete from public.tracking_history where user_id=p_user_id and transaction_id is null and outcome not in ('accepted','duplicate');
  get diagnostics removed=row_count; return removed;
end $$;

create function private.compact_tracking_history(p_limit_count integer) returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  if p_limit_count not between 1 and 1000 then raise exception using errcode='22023',message='TRACKING_COMPACT_LIMIT_INVALID'; end if;
  perform set_config('app.tracking_retention','on',true);
  with expired as (select h.id from public.tracking_history h join public.tracking_preferences p on p.user_id=h.user_id
    where h.transaction_id is null and h.outcome not in ('accepted','duplicate') and h.created_at<clock_timestamp()-make_interval(days=>p.history_retention_days)
    order by h.created_at,h.id for update skip locked limit p_limit_count)
  delete from public.tracking_history h using expired e where h.id=e.id;
  get diagnostics removed=row_count; return removed;
end $$;

create function private.purge_raw_ingestion_payloads(p_limit_count integer) returns table(id uuid,storage_ref text,purge_token uuid)
language plpgsql security definer set search_path='' as $$
begin
  if p_limit_count not between 1 and 1000 then raise exception using errcode='22023',message='RAW_PURGE_LIMIT_INVALID'; end if;
  return query
  with due as (
    select r.id from private.raw_ingestion_payloads r
    where (r.scan_status in ('clean','cleanup') and r.expires_at<=clock_timestamp())
      or (r.scan_status='purging' and r.purge_lease_until<=clock_timestamp())
    order by coalesce(r.purge_lease_until,r.expires_at),r.id for update skip locked limit p_limit_count
  )
  update private.raw_ingestion_payloads r set scan_status='purging',purge_token=extensions.gen_random_uuid(),
    purge_lease_until=clock_timestamp()+interval '5 minutes'
  from due where r.id=due.id returning r.id,r.storage_ref,r.purge_token;
end $$;

create function private.complete_raw_ingestion_purge(p_id uuid,p_purge_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;
begin
  select r.session_id into v_session_id from private.raw_ingestion_payloads r
  where r.id=p_id and r.scan_status='purging' and r.purge_token=p_purge_token for update;
  if not found then return false; end if;
  if v_session_id is not null then
    update public.import_items set normalized_payload=normalized_payload-'body'-'sender'-'metadata'-'sourceText'
    where import_items.session_id=v_session_id;
  end if;
  update private.raw_ingestion_payloads set scan_status='purged',purged_at=clock_timestamp(),storage_ref=null,
    purge_token=null,purge_lease_until=null where id=p_id and scan_status='purging' and purge_token=p_purge_token;
  return found;
end $$;

create function private.read_tracking_admin(p_resource text,p_id uuid,p_limit_count integer,p_purpose text,p_admin_id text,
  p_cursor_at timestamptz,p_cursor_id uuid,p_filters jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare permission text; result jsonb; v_search text:=nullif(p_filters->>'search',''); v_status text:=nullif(p_filters->>'status',''); v_source text:=nullif(p_filters->>'sourceType','');
  v_institution uuid:=nullif(p_filters->>'institutionId','')::uuid; v_parser_version uuid:=nullif(p_filters->>'parserVersionId','')::uuid;
  v_from timestamptz:=nullif(p_filters->>'from','')::timestamptz; v_to timestamptz:=nullif(p_filters->>'to','')::timestamptz;
begin
  if p_limit_count not between 1 and 101 then raise exception using errcode='22023',message='ADMIN_LIST_INVALID'; end if;
  if p_filters is null or jsonb_typeof(p_filters)<>'object' or (p_cursor_at is null)<>(p_cursor_id is null) then
    raise exception using errcode='22023',message='ADMIN_LIST_INVALID'; end if;
  permission:=case
    when p_resource in ('overview','sessions') then case when p_id is null then 'imports.read' else 'imports.detail.read' end
    when p_resource in ('failures','low-confidence','duplicates','unsupported') then 'imports.read'
    when p_resource='institutions' then 'parsers.coverage.read'
    when p_resource='senders' then 'parsers.coverage.read'
    when p_resource='rules' then 'parsers.rules.read'
    when p_resource in ('test-cases','versions','merchant-rules','category-rules') then 'parsers.rules.read'
    when p_resource='settings' then 'settings.imports.read'
    else null end;
  if permission is null then raise exception using errcode='22023',message='ADMIN_RESOURCE_INVALID'; end if;
  perform private.assert_admin_permission(permission);
  if p_resource='sessions' and p_id is not null and (p_purpose is null or p_purpose<>btrim(p_purpose) or char_length(p_purpose) not between 10 and 500) then
    raise exception using errcode='22023',message='ADMIN_PURPOSE_REQUIRED';
  end if;
  result:=case p_resource
    when 'overview' then (select jsonb_build_object(
      'totalSessions',count(*),'uniqueCustomers',count(distinct user_id),
      'totalItems',coalesce(sum(item_count),0),'failedSessions',count(*) filter(where status='failed'),
      'reviewSessions',count(*) filter(where status='review'),
      'highestFailureSource',coalesce((select s.source_type from public.import_sessions s where s.status='failed' group by s.source_type order by count(*) desc,s.source_type limit 1),'manual'))
      from public.import_sessions)
    when 'sessions' then (select coalesce(jsonb_agg(to_jsonb(x)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code'),'[]') from (select * from public.import_sessions where (p_id is null or id=p_id) and (v_search is null or strpos(lower(coalesce(source_name,'')||' '||source_type||' '||status),lower(v_search))>0) and (v_status is null or status=v_status) and (v_source is null or source_type=v_source) and (v_from is null or started_at>=v_from) and (v_to is null or started_at<=v_to) and (p_cursor_at is null or (started_at,id)<(p_cursor_at,p_cursor_id)) order by started_at desc,id desc limit p_limit_count) x)
    when 'failures' then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'sessionId',x.session_id,'status',x.status,'createdAt',x.created_at,'updatedAt',x.updated_at)),'[]') from (select i.* from public.import_items i join public.import_sessions s on s.id=i.session_id and s.user_id=i.user_id where i.status='failed' and (v_search is null or strpos(lower(i.id::text||' '||i.session_id::text),lower(v_search))>0) and (v_source is null or s.source_type=v_source) and (v_from is null or i.created_at>=v_from) and (v_to is null or i.created_at<=v_to) and (p_cursor_at is null or (i.created_at,i.id)<(p_cursor_at,p_cursor_id)) order by i.created_at desc,i.id desc limit p_limit_count) x)
    when 'low-confidence' then (select coalesce(jsonb_agg(to_jsonb(x)-'user_id'-'original_values'-'proposed_values'-'accepted_values'-'decision_token'-'decision_lease_until'),'[]') from (select r.* from public.review_items r join public.import_items i on i.id=r.import_item_id left join public.parser_rule_versions v on v.id=i.parser_version_id left join public.parser_rules pr on pr.id=v.parser_rule_id where (v_status is null and r.status='pending' or v_status is not null and r.status=v_status) and (v_search is null or strpos(lower(r.id::text||' '||r.import_item_id::text),lower(v_search))>0) and (v_institution is null or pr.institution_id=v_institution) and (v_parser_version is null or i.parser_version_id=v_parser_version) and (v_from is null or r.created_at>=v_from) and (v_to is null or r.created_at<=v_to) and (p_cursor_at is null or (r.created_at,r.id)<(p_cursor_at,p_cursor_id)) order by r.created_at desc,r.id desc limit p_limit_count) x)
    when 'duplicates' then (select coalesce(jsonb_agg(to_jsonb(x)-'user_id'-'reasons'-'decision_token'-'decision_lease_until'),'[]') from (select * from public.duplicate_candidates where (v_status is null or status=v_status) and (v_from is null or created_at>=v_from) and (v_to is null or created_at<=v_to) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'unsupported' then (select coalesce(jsonb_agg(to_jsonb(x)-'user_id'-'content_hash'-'sample_redacted'),'[]') from (select * from public.unsupported_formats where (v_search is null or strpos(lower(reason||' '||session_id::text),lower(v_search))>0) and (v_status is null or status=v_status) and (v_from is null or created_at>=v_from) and (v_to is null or created_at<=v_to) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'institutions' then (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.financial_institutions where (p_id is null or id=p_id) and (v_search is null or strpos(lower(name||' '||code||' '||country_code),lower(v_search))>0) and (v_status is null or active=(v_status='active')) and (v_institution is null or id=v_institution) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'senders' then (select coalesce(jsonb_agg(to_jsonb(x)-'sender_pattern'),'[]') from (select * from public.institution_senders where (v_search is null or strpos(lower(display_label),lower(v_search))>0) and (v_status is null or active=(v_status='active')) and (v_institution is null or institution_id=v_institution) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'rules' then (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.parser_rules where (p_id is null or id=p_id) and (v_search is null or strpos(lower(name||' '||source_type||' '||status),lower(v_search))>0) and (v_status is null or status=v_status) and (v_source is null or source_type=v_source) and (v_institution is null or institution_id=v_institution) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'test-cases' then (select coalesce(jsonb_agg(to_jsonb(x)-'input_fixture'-'expected_output'),'[]') from (select t.* from public.parser_test_cases t join public.parser_rule_versions v on v.id=t.parser_version_id join public.parser_rules r on r.id=v.parser_rule_id where (v_search is null or strpos(lower(t.name),lower(v_search))>0) and (v_parser_version is null or t.parser_version_id=v_parser_version) and (v_institution is null or r.institution_id=v_institution) and (p_cursor_at is null or (t.created_at,t.id)<(p_cursor_at,p_cursor_id)) order by t.created_at desc,t.id desc limit p_limit_count) x)
    when 'versions' then (select coalesce(jsonb_agg(to_jsonb(x)-'definition'-'corpus_requested_by'-'corpus_reason'-'corpus_claim_token'-'corpus_claimed_by'-'corpus_lease_until'),'[]') from (select v.* from public.parser_rule_versions v join public.parser_rules r on r.id=v.parser_rule_id where (v_parser_version is null or v.id=v_parser_version) and (v_institution is null or r.institution_id=v_institution) and (v_status is null or (v_status='published')=(v.published_at is not null)) and (p_cursor_at is null or (v.created_at,v.id)<(p_cursor_at,p_cursor_id)) order by v.created_at desc,v.id desc limit p_limit_count) x)
    when 'merchant-rules' then (select coalesce(jsonb_agg(to_jsonb(x)-'pattern'),'[]') from (select * from public.merchant_rules where (v_search is null or strpos(lower(normalized_merchant),lower(v_search))>0) and (v_status is null or active=(v_status='active')) and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit_count) x)
    when 'category-rules' then (select coalesce(jsonb_agg(to_jsonb(x)-'pattern'),'[]') from (select c.* from public.category_rules c join public.categories k on k.id=c.category_id where (v_search is null or strpos(lower(k.label_en||' '||k.label_ar),lower(v_search))>0) and (v_status is null or c.active=(v_status='active')) and (p_cursor_at is null or (c.created_at,c.id)<(p_cursor_at,p_cursor_id)) order by c.created_at desc,c.id desc limit p_limit_count) x)
    when 'settings' then jsonb_build_object('rawRetentionDays',30,'historyRetentionDays',365,'maxCsvBytes',6291456,'maxRows',10000)
  end;
  if p_resource='sessions' and p_id is not null then
    perform audit.append_event(p_admin_id,'admin','tracking.import-detail-viewed','import_session',p_id::text,null,null,p_purpose,private.tracking_request_id(),jsonb_build_object('purposeRecorded',true));
  end if;
  return coalesce(result,'[]'::jsonb);
end $$;

create function private.mutate_tracking_admin(p_resource text,p_id uuid,p_action text,p_payload jsonb,
  p_expected_version bigint,p_reason text,p_admin_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare permission text; result jsonb; next_id uuid:=coalesce(p_id,extensions.gen_random_uuid());
  allowed_actions text[]; allowed_fields text[];
  item public.import_items; review public.review_items; candidate public.duplicate_candidates; session_row public.import_sessions;
begin
  permission:=case
    when p_resource='sessions' then 'imports.failures.manage'
    when p_resource='failures' then 'imports.failures.manage'
    when p_resource='low-confidence' then 'imports.confidence.manage'
    when p_resource='duplicates' then 'imports.duplicates.manage'
    when p_resource='unsupported' then 'imports.unsupported.manage'
    when p_resource='institutions' then 'parsers.senders.manage'
    when p_resource='senders' then 'parsers.senders.manage'
    when p_resource='rules' then 'parsers.rules.manage'
    when p_resource='test-cases' then 'parsers.versions.manage'
    when p_resource='versions' then 'parsers.versions.manage'
    when p_resource='merchant-rules' then 'parsers.merchants.manage'
    when p_resource='category-rules' then 'parsers.categories.manage'
    when p_resource='settings' then 'settings.imports.manage'
    else null end;
  if permission is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='ADMIN_RESOURCE_INVALID'; end if;
  perform private.assert_admin_permission(permission);
  if p_reason is null or p_reason<>btrim(p_reason) or char_length(p_reason) not between 10 and 500 then raise exception using errcode='22023',message='ADMIN_REASON_INVALID'; end if;
  allowed_actions:=case p_resource
    when 'sessions' then array['retry','retry_handoff','cancel']
    when 'failures' then array['retry_handoff','assign_parser_issue','mark_unsupported','create_rule_draft_handoff','save']
    when 'low-confidence' then array['accept_suggestion','correct_merchant','correct_category','defer','mark_unsupported']
    when 'duplicates' then array['confirm_duplicate','reject_match','defer']
    when 'unsupported' then array['acknowledge','ignore','covered','assign_parser_issue','mark_unsupported','create_rule_draft_handoff','defer']
    when 'institutions' then array['create','save','activate','deactivate']
    when 'senders' then array['create','save','activate','deactivate']
    when 'rules' then array['create','save','deactivate']
    when 'versions' then array['create','retire','rollback']
    when 'test-cases' then array['create','save','activate','deactivate']
    when 'merchant-rules' then array['create','save','activate','deactivate']
    when 'category-rules' then array['create','save','activate','deactivate']
    when 'settings' then array['save'] end;
  allowed_fields:=case
    when p_resource='low-confidence' and p_action='correct_merchant' then array['title','merchant']
    when p_resource='low-confidence' and p_action='correct_category' then array['categoryId']
    when p_resource='institutions' then array['countryCode','name','code','active']
    when p_resource='senders' then array['institutionId','senderPattern','displayLabel','priority','active']
    when p_resource='rules' then array['institutionId','name','sourceType']
    when p_resource='versions' then array['ruleId','versionNo','definition']
    when p_resource='test-cases' then array['parserVersionId','name','inputFixture','expectedOutput','enabled']
    when p_resource='merchant-rules' then array['pattern','normalizedMerchant','priority','active']
    when p_resource='category-rules' then array['pattern','categoryId','priority','active']
    when p_resource='settings' then array['rawRetentionDays','historyRetentionDays','maxCsvBytes','maxRows']
    else array[]::text[] end;
  if p_action is null or not (p_action=any(allowed_actions))
    or exists(select 1 from jsonb_object_keys(p_payload) payload_key where not (payload_key=any(allowed_fields)))
    or (p_resource='low-confidence' and p_action in ('correct_merchant','correct_category') and p_payload='{}'::jsonb)
    or (p_resource in ('sessions','failures','low-confidence','duplicates','unsupported') and p_id is null)
    or (p_resource in ('institutions','senders','rules','versions','test-cases','merchant-rules','category-rules') and ((p_id is null)<>(p_action='create')))
    or (p_resource='settings' and p_id is not null) then
    raise exception using errcode='22023',message='ADMIN_ACTION_INVALID';
  end if;
  if p_resource='sessions' then
    if p_action not in ('retry','retry_handoff','cancel') then raise exception using errcode='22023',message='ADMIN_ACTION_INVALID'; end if;
    update public.import_sessions set status=case when p_action='cancel' then 'cancelled' else 'received' end,
      completed_at=case when p_action='cancel' then clock_timestamp() else null end,next_attempt_at=clock_timestamp(),
      claim_token=null,claimed_by=null,lease_until=null,last_error_code=null
    where id=p_id and version=p_expected_version and ((p_action='cancel' and status in ('received','processing','review')) or (p_action in ('retry','retry_handoff') and status='failed')) returning to_jsonb(import_sessions)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code' into result;
  elsif p_resource='failures' then
    if p_action not in ('retry_handoff','assign_parser_issue','mark_unsupported','create_rule_draft_handoff','save') then raise exception using errcode='22023',message='ADMIN_ACTION_INVALID'; end if;
    select * into item from public.import_items where id=p_id and status='failed' and version=p_expected_version for update;
    if item.id is not null and p_action='retry_handoff' then
      update public.import_sessions set status='received',completed_at=null,next_attempt_at=clock_timestamp(),claim_token=null,claimed_by=null,lease_until=null,last_error_code=null
      where id=item.session_id and status='failed' returning * into session_row;
      result:=case when session_row.id is null then null else to_jsonb(session_row)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code' end;
    elsif item.id is not null and p_action='mark_unsupported' then
      insert into public.unsupported_formats(user_id,session_id,content_hash,reason)
      values(item.user_id,item.session_id,item.source_hash,'ADMIN_MARKED_UNSUPPORTED')
      on conflict(session_id,content_hash) do update set updated_at=clock_timestamp()
      returning to_jsonb(unsupported_formats)-'user_id'-'content_hash'-'sample_redacted' into result;
    elsif item.id is not null then
      result:=(to_jsonb(item)-'user_id'-'source_hash'-'normalized_hash'-'normalized_payload')||jsonb_build_object('operatorAction',p_action);
    end if;
  elsif p_resource='low-confidence' then
    if p_action not in ('accept_suggestion','correct_merchant','correct_category','defer','mark_unsupported') then raise exception using errcode='22023',message='ADMIN_ACTION_INVALID'; end if;
    select * into review from public.review_items where id=p_id and status='pending' and version=p_expected_version for update;
    if review.id is not null then select * into item from public.import_items where id=review.import_item_id; end if;
    if review.id is not null and p_action in ('correct_merchant','correct_category') then
      update public.review_items set proposed_values=proposed_values||p_payload where id=review.id returning * into review;
      result:=(to_jsonb(review)-'user_id'-'original_values'-'proposed_values'-'accepted_values'-'decision_token'-'decision_lease_until')||jsonb_build_object('operatorAction',p_action);
    elsif review.id is not null and p_action='mark_unsupported' then
      insert into public.unsupported_formats(user_id,session_id,content_hash,reason)
      values(item.user_id,item.session_id,item.source_hash,'ADMIN_MARKED_UNSUPPORTED')
      on conflict(session_id,content_hash) do update set updated_at=clock_timestamp()
      returning to_jsonb(unsupported_formats)-'user_id'-'content_hash'-'sample_redacted' into result;
    elsif review.id is not null then
      result:=(to_jsonb(review)-'user_id'-'original_values'-'proposed_values'-'accepted_values'-'decision_token'-'decision_lease_until')||jsonb_build_object('operatorAction',p_action);
    end if;
  elsif p_resource='duplicates' then
    if p_action not in ('confirm_duplicate','reject_match','defer') then raise exception using errcode='22023',message='ADMIN_ACTION_INVALID'; end if;
    select * into candidate from public.duplicate_candidates where id=p_id and status='proposed' and version=p_expected_version for update;
    if candidate.id is not null then
      result:=(to_jsonb(candidate)-'user_id'-'reasons'-'decision_token'-'decision_lease_until')||jsonb_build_object('operatorAction',p_action);
    end if;
  elsif p_resource='unsupported' then
    if p_action not in ('acknowledge','ignore','covered','assign_parser_issue','mark_unsupported','create_rule_draft_handoff','defer') then raise exception using errcode='22023',message='ADMIN_ACTION_INVALID'; end if;
    update public.unsupported_formats set status=case when p_action in ('acknowledge','ignore','mark_unsupported') then 'ignored' when p_action='covered' then 'covered' else status end,
      reviewed_at=case when p_action in ('acknowledge','ignore','mark_unsupported','covered') then clock_timestamp() else reviewed_at end,
      reviewed_by=case when p_action in ('acknowledge','ignore','mark_unsupported','covered') then p_admin_id else reviewed_by end
    where id=p_id and version=p_expected_version returning to_jsonb(unsupported_formats)-'user_id'-'content_hash'-'sample_redacted' into result;
  elsif p_resource='institutions' then
    if p_id is null then
      insert into public.financial_institutions(id,country_code,name,code,active) values(next_id,(p_payload->>'countryCode')::char(2),p_payload->>'name',p_payload->>'code',coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(financial_institutions) into result;
    else
      update public.financial_institutions set country_code=coalesce((p_payload->>'countryCode')::char(2),country_code),name=coalesce(p_payload->>'name',name),code=coalesce(p_payload->>'code',code),active=case when p_action='activate' then true when p_action='deactivate' then false when p_payload ? 'active' then (p_payload->>'active')::boolean else active end where id=p_id and version=p_expected_version returning to_jsonb(financial_institutions) into result;
    end if;
  elsif p_resource='senders' then
    if p_id is null then
      insert into public.institution_senders(id,institution_id,sender_pattern,display_label,priority,active) values(next_id,(p_payload->>'institutionId')::uuid,p_payload->>'senderPattern',p_payload->>'displayLabel',coalesce((p_payload->>'priority')::integer,100),coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(institution_senders)-'sender_pattern' into result;
    else
      update public.institution_senders set institution_id=coalesce((p_payload->>'institutionId')::uuid,institution_id),sender_pattern=coalesce(p_payload->>'senderPattern',sender_pattern),display_label=coalesce(p_payload->>'displayLabel',display_label),priority=coalesce((p_payload->>'priority')::integer,priority),active=case when p_action='activate' then true when p_action='deactivate' then false when p_payload ? 'active' then (p_payload->>'active')::boolean else active end where id=p_id and version=p_expected_version returning to_jsonb(institution_senders)-'sender_pattern' into result;
    end if;
  elsif p_resource='rules' then
    if p_id is null then
      insert into public.parser_rules(id,institution_id,name,source_type,status) values(next_id,(p_payload->>'institutionId')::uuid,p_payload->>'name',p_payload->>'sourceType','draft') returning to_jsonb(parser_rules) into result;
    else
      update public.parser_rules set institution_id=case when p_payload ? 'institutionId' then (p_payload->>'institutionId')::uuid else institution_id end,name=coalesce(p_payload->>'name',name),source_type=coalesce(p_payload->>'sourceType',source_type),status=case when p_action='deactivate' then 'disabled' else status end,active_version_id=case when p_action='deactivate' then null else active_version_id end where id=p_id and version=p_expected_version returning to_jsonb(parser_rules) into result;
    end if;
  elsif p_resource='versions' then
    if p_id is null then
      insert into public.parser_rule_versions(id,parser_rule_id,version_no,definition,definition_hash,created_by)
      values(next_id,(p_payload->>'ruleId')::uuid,coalesce((p_payload->>'versionNo')::integer,(select coalesce(max(v.version_no),0)+1 from public.parser_rule_versions v where v.parser_rule_id=(p_payload->>'ruleId')::uuid)),p_payload->'definition',encode(extensions.digest(convert_to((p_payload->'definition')::text,'UTF8'),'sha256'),'hex'),p_admin_id)
      returning to_jsonb(parser_rule_versions)-'definition' into result;
    elsif p_action='retire' then
      update public.parser_rules set status='disabled',active_version_id=null where active_version_id=p_id and version=p_expected_version
      returning jsonb_build_object('id',p_id,'ruleId',id,'status',status,'version',version) into result;
    elsif p_action='rollback' then
      update public.parser_rules r set status='active',active_version_id=p_id where r.id=(select v.parser_rule_id from public.parser_rule_versions v where v.id=p_id and v.published_at is not null) and r.version=p_expected_version returning jsonb_build_object('id',p_id,'ruleId',r.id,'status',r.status,'version',r.version) into result;
    end if;
  elsif p_resource='test-cases' then
    if p_id is null then
      insert into public.parser_test_cases(id,parser_version_id,name,input_fixture,expected_output,enabled,last_result,last_run_at)
      values(next_id,(p_payload->>'parserVersionId')::uuid,p_payload->>'name',p_payload->>'inputFixture',p_payload->'expectedOutput',coalesce((p_payload->>'enabled')::boolean,true),null,null) returning to_jsonb(parser_test_cases)-'input_fixture'-'expected_output' into result;
    else
      update public.parser_test_cases set name=coalesce(p_payload->>'name',name),input_fixture=coalesce(p_payload->>'inputFixture',input_fixture),expected_output=coalesce(p_payload->'expectedOutput',expected_output),enabled=case when p_action='activate' then true when p_action='deactivate' then false when p_payload ? 'enabled' then (p_payload->>'enabled')::boolean else enabled end,last_result=null,last_run_at=null where id=p_id and version=p_expected_version and not exists(select 1 from public.parser_rule_versions v where v.id=parser_version_id and v.published_at is not null) returning to_jsonb(parser_test_cases)-'input_fixture'-'expected_output' into result;
    end if;
  elsif p_resource='merchant-rules' then
    if p_id is null then
      insert into public.merchant_rules(id,pattern,normalized_merchant,priority,active) values(next_id,p_payload->>'pattern',p_payload->>'normalizedMerchant',coalesce((p_payload->>'priority')::integer,100),coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(merchant_rules)-'pattern' into result;
    else
      update public.merchant_rules set pattern=coalesce(p_payload->>'pattern',pattern),normalized_merchant=coalesce(p_payload->>'normalizedMerchant',normalized_merchant),priority=coalesce((p_payload->>'priority')::integer,priority),active=case when p_action='activate' then true when p_action='deactivate' then false when p_payload ? 'active' then (p_payload->>'active')::boolean else active end where id=p_id and version=p_expected_version returning to_jsonb(merchant_rules)-'pattern' into result;
    end if;
  elsif p_resource='category-rules' then
    if p_id is null then
      insert into public.category_rules(id,pattern,category_id,priority,active) values(next_id,p_payload->>'pattern',(p_payload->>'categoryId')::uuid,coalesce((p_payload->>'priority')::integer,100),coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(category_rules)-'pattern' into result;
    else
      update public.category_rules set pattern=coalesce(p_payload->>'pattern',pattern),category_id=coalesce((p_payload->>'categoryId')::uuid,category_id),priority=coalesce((p_payload->>'priority')::integer,priority),active=case when p_action='activate' then true when p_action='deactivate' then false when p_payload ? 'active' then (p_payload->>'active')::boolean else active end where id=p_id and version=p_expected_version returning to_jsonb(category_rules)-'pattern' into result;
    end if;
  elsif p_resource='settings' then
    result:=jsonb_build_object('status','deployment_required','accepted',true);
  end if;
  if result is null then raise exception using errcode='40001',message='ADMIN_VERSION_CONFLICT'; end if;
  perform audit.append_event(p_admin_id,'admin','tracking.admin-'||p_action,p_resource,next_id::text,null,null,p_reason,private.tracking_request_id(),jsonb_build_object('version',p_expected_version,'action',p_action));
  perform private.enqueue_outbox_event('tracking.admin.action.v1','tracking-admin-action',next_id,
    jsonb_build_object('resourceId',next_id,'resourceKind',p_resource,'action',p_action,'version',p_expected_version,'occurredAt',clock_timestamp()));
  return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
  raise exception using errcode='22023',message='ADMIN_MUTATION_INVALID';
end $$;

create function private.queue_parser_corpus(p_version_id uuid,p_admin_id text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.parser_rule_versions;
begin
  perform private.assert_admin_permission('parsers.tests.run');
  if p_reason is null or p_reason<>btrim(p_reason) or char_length(p_reason) not between 10 and 500 then
    raise exception using errcode='22023',message='ADMIN_REASON_INVALID'; end if;
  update public.parser_rule_versions set corpus_status='queued',corpus_requested_by=p_admin_id,
    corpus_requested_at=clock_timestamp(),corpus_reason=p_reason,corpus_claim_token=null,
    corpus_claimed_by=null,corpus_lease_until=null,corpus_attempt_count=0,
    corpus_next_attempt_at=clock_timestamp(),corpus_last_error_code=null
  where id=p_version_id and corpus_status<>'running' returning * into v;
  if v.id is null then raise exception using errcode='40001',message='PARSER_CORPUS_CONFLICT'; end if;
  perform audit.append_event(p_admin_id,'admin','parser.corpus-queued','parser_version',v.id::text,null,null,p_reason,
    private.tracking_request_id(),jsonb_build_object('status','queued'));
  return jsonb_build_object('versionId',v.id,'status','queued','requestedAt',v.corpus_requested_at);
end $$;

create function private.claim_parser_corpus(p_worker_id text,p_limit_count integer,p_lease_seconds integer)
returns table(id uuid,claim_token uuid,attempt_count integer) language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_limit_count not between 1 and 20 or p_lease_seconds not between 5 and 300 then
    raise exception using errcode='22023',message='PARSER_CORPUS_CLAIM_INVALID'; end if;
  return query with candidates as (
    select v.id from public.parser_rule_versions v
    where v.corpus_attempt_count<5 and v.corpus_next_attempt_at<=clock_timestamp()
      and (v.corpus_status='queued' or (v.corpus_status='running' and v.corpus_lease_until<=clock_timestamp()))
    order by v.corpus_next_attempt_at,v.id for update skip locked limit p_limit_count
  )
  update public.parser_rule_versions v set corpus_status='running',corpus_claim_token=extensions.gen_random_uuid(),
    corpus_claimed_by=p_worker_id,corpus_lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    corpus_attempt_count=v.corpus_attempt_count+1
  from candidates c where v.id=c.id returning v.id,v.corpus_claim_token,v.corpus_attempt_count;
end $$;

create function private.read_parser_corpus(p_version_id uuid,p_claim_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_claim_token is null then perform private.assert_admin_permission('parsers.tests.run');
  elsif not exists(select 1 from public.parser_rule_versions v where v.id=p_version_id and v.corpus_status='running'
    and v.corpus_claim_token=p_claim_token and v.corpus_lease_until>clock_timestamp()) then
    raise exception using errcode='40001',message='PARSER_CORPUS_LEASE_STALE'; end if;
  return (select jsonb_build_object('versionId',v.id,'definition',v.definition,'cases',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'input',t.input_fixture,'expected',t.expected_output) order by t.id) from public.parser_test_cases t where t.parser_version_id=v.id and t.enabled),'[]')) from public.parser_rule_versions v where v.id=p_version_id);
end $$;

create function private.complete_parser_corpus(p_version_id uuid,p_claim_token uuid,p_results jsonb,p_error_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; passed integer:=0; failed integer:=0; v public.parser_rule_versions; final_status text;
begin
  select * into v from public.parser_rule_versions where id=p_version_id and corpus_status='running'
    and corpus_claim_token=p_claim_token and corpus_lease_until>clock_timestamp() for update;
  if v.id is null then raise exception using errcode='40001',message='PARSER_CORPUS_LEASE_STALE'; end if;
  if p_error_code is not null then
    if p_error_code !~ '^[A-Z][A-Z0-9_]{1,79}$' then raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID'; end if;
    final_status:=case when v.corpus_attempt_count<5 then 'queued' else 'failed' end;
    update public.parser_rule_versions set corpus_status=final_status,corpus_claim_token=null,corpus_claimed_by=null,
      corpus_lease_until=null,corpus_next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,5*(2^greatest(v.corpus_attempt_count-1,0))::integer)),
      corpus_last_error_code=p_error_code where id=v.id returning * into v;
  else
    if p_results is null or jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)>1000
      or jsonb_array_length(p_results)=0 then raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID'; end if;
    for item in select value from jsonb_array_elements(p_results) loop
      if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','passed')) then
        raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID'; end if;
      update public.parser_test_cases set last_result=case when (item->>'passed')::boolean then 'passed' else 'failed' end,last_run_at=clock_timestamp()
      where id=(item->>'id')::uuid and parser_version_id=p_version_id and enabled;
      if not found then raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID'; end if;
      if (item->>'passed')::boolean then passed:=passed+1; else failed:=failed+1; end if;
    end loop;
    if passed+failed<>(select count(*) from public.parser_test_cases where parser_version_id=p_version_id and enabled) then
      raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID'; end if;
    final_status:=case when failed=0 then 'passed' else 'failed' end;
    update public.parser_rule_versions set corpus_status=final_status,corpus_claim_token=null,corpus_claimed_by=null,
      corpus_lease_until=null,corpus_last_error_code=null where id=v.id returning * into v;
  end if;
  perform audit.append_event('system:tracking-worker','system','parser.corpus-completed','parser_version',v.id::text,null,null,
    coalesce(v.corpus_reason,'Parser corpus worker completion'),private.tracking_request_id(),jsonb_build_object('passed',passed,'failed',failed,'status',final_status));
  perform private.enqueue_outbox_event('parser.corpus.completed.v1','parser-version',v.id,
    jsonb_build_object('versionId',v.id,'status',final_status,'passed',passed,'failed',failed,'attempt',v.corpus_attempt_count,'occurredAt',clock_timestamp()));
  return jsonb_build_object('versionId',v.id,'passed',passed,'failed',failed,'status',final_status,'attempt',v.corpus_attempt_count);
exception when invalid_text_representation or invalid_parameter_value then
  raise exception using errcode='22023',message='PARSER_CORPUS_RESULT_INVALID';
end $$;

create function private.read_parser_preview(p_rule_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.assert_admin_permission('parsers.rules.manage');
  return (select jsonb_build_object('versionId',v.id,'definition',v.definition)
    from public.parser_rule_versions v where v.parser_rule_id=p_rule_id order by v.version_no desc limit 1);
end $$;

create function private.export_tracking_data(p_user_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'preferences',(select to_jsonb(p)-'user_id' from public.tracking_preferences p where p.user_id=p_user_id),
    'keywordRules',coalesce((select jsonb_agg(to_jsonb(k)-'user_id' order by k.created_at,k.id) from public.user_keyword_rules k where k.user_id=p_user_id),'[]'),
    'senderRules',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by r.created_at,r.id) from public.user_sender_rules r where r.user_id=p_user_id),'[]'),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code' order by s.created_at,s.id) from public.import_sessions s where s.user_id=p_user_id),'[]'),
    'items',coalesce((select jsonb_agg(to_jsonb(i)-'user_id'-'source_hash'-'normalized_hash' order by i.created_at,i.id) from public.import_items i where i.user_id=p_user_id),'[]'),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by r.created_at,r.id) from public.review_items r where r.user_id=p_user_id),'[]'),
    'duplicates',coalesce((select jsonb_agg(to_jsonb(d)-'user_id' order by d.created_at,d.id) from public.duplicate_candidates d where d.user_id=p_user_id),'[]'),
    'history',coalesce((select jsonb_agg(to_jsonb(h)-'user_id' order by h.created_at,h.id) from public.tracking_history h where h.user_id=p_user_id),'[]'),
    'feedback',coalesce((select jsonb_agg(to_jsonb(f)-'user_id' order by f.created_at,f.id) from public.tracking_feedback f where f.user_id=p_user_id),'[]'))
$$;

create function private.export_tracking_batch(p_user_id text,p_resource text,p_after uuid,p_limit_count integer) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit_count not between 1 and 500 then raise exception using errcode='22023',message='TRACKING_EXPORT_LIMIT_INVALID'; end if;
  if p_resource='preferences' then
    return query select to_jsonb(p)-'user_id' from public.tracking_preferences p where p.user_id=p_user_id and p_after is null;
  elsif p_resource='keyword-rules' then
    return query select to_jsonb(x)-'user_id' from (select * from public.user_keyword_rules where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='sender-rules' then
    return query select to_jsonb(x)-'user_id' from (select * from public.user_sender_rules where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='sessions' then
    return query select to_jsonb(x)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code' from (select * from public.import_sessions where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='items' then
    return query select to_jsonb(x)-'user_id'-'source_hash'-'normalized_hash' from (select * from public.import_items where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='reviews' then
    return query select to_jsonb(x)-'user_id'-'decision_token'-'decision_lease_until' from (select * from public.review_items where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='duplicates' then
    return query select to_jsonb(x)-'user_id'-'decision_token'-'decision_lease_until' from (select * from public.duplicate_candidates where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='history' then
    return query select to_jsonb(x)-'user_id' from (select * from public.tracking_history where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  elsif p_resource='feedback' then
    return query select to_jsonb(x)-'user_id' from (select * from public.tracking_feedback where user_id=p_user_id and (p_after is null or id>p_after) order by id limit p_limit_count) x;
  else
    raise exception using errcode='22023',message='TRACKING_EXPORT_RESOURCE_INVALID';
  end if;
end $$;

create function private.read_tracking_raw_refs(p_user_id text) returns setof text
language sql stable security definer set search_path='' as $$
  select r.storage_ref from private.raw_ingestion_payloads r join public.import_sessions s on s.id=r.session_id
  where s.user_id=p_user_id and r.storage_ref is not null order by r.id
$$;

create function private.delete_tracking_data(p_user_id text) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer:=0; affected integer;
begin
  perform set_config('app.tracking_retention','on',true);
  delete from public.tracking_feedback where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.tracking_history where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.import_sessions where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.user_keyword_rules where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.user_sender_rules where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.tracking_preferences where user_id=p_user_id; get diagnostics affected=row_count; removed:=removed+affected;
  return removed;
end $$;

create function private.reconcile_import_session_counts(p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.import_sessions;
begin
  update public.import_sessions x set item_count=c.total,accepted_count=c.accepted,rejected_count=c.rejected
  from (select count(*)::integer total,count(*) filter(where status='accepted')::integer accepted,
    count(*) filter(where status in ('rejected','duplicate','failed'))::integer rejected from public.import_items where session_id=p_session_id) c
  where x.id=p_session_id returning x.* into s;
  if s.id is null then raise exception using errcode='P0002',message='IMPORT_SESSION_NOT_FOUND'; end if;
  return to_jsonb(s)-'user_id'-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code';
end $$;

create function private.reconcile_import_sessions(p_limit_count integer) returns integer language plpgsql security definer set search_path='' as $$
declare s record; changed integer:=0;
begin
  if p_limit_count not between 1 and 1000 then raise exception using errcode='22023',message='IMPORT_RECONCILE_LIMIT_INVALID'; end if;
  for s in select x.id from public.import_sessions x where (x.item_count,x.accepted_count,x.rejected_count)<>(
    select count(*)::integer,count(*) filter(where i.status='accepted')::integer,count(*) filter(where i.status in ('rejected','duplicate','failed'))::integer
    from public.import_items i where i.session_id=x.id) order by x.updated_at,x.id for update skip locked limit p_limit_count
  loop perform private.reconcile_import_session_counts(s.id); changed:=changed+1; end loop; return changed;
end $$;

create function private.tracking_operational_metrics() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'importBacklog',(select count(*) from public.import_sessions where status in ('received','processing')),
    'reviewBacklog',(select count(*) from public.review_items where status='pending'),
    'duplicateBacklog',(select count(*) from public.duplicate_candidates where status='proposed'),
    'oldestImportAgeSeconds',coalesce((select extract(epoch from clock_timestamp()-min(started_at))::bigint from public.import_sessions where status in ('received','processing')),0),
    'rawPurgeLagSeconds',coalesce((select greatest(0,extract(epoch from clock_timestamp()-min(coalesce(purge_lease_until,expires_at))))::bigint
      from private.raw_ingestion_payloads where (scan_status in ('clean','cleanup') and expires_at<=clock_timestamp())
        or (scan_status='purging' and purge_lease_until<=clock_timestamp())),0))
$$;

create or replace function private.read_support_workspace(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  subject_id text:=public.current_clerk_user_id(); target_id text; grant_id uuid;
  grant_ends_at timestamptz; grant_scope jsonb; sections jsonb;
begin
  if not private.admin_has_permission(subject_id,'support.access.use',clock_timestamp()) then
    raise exception using errcode='42501',message='SUPPORT_GRANT_DENIED';
  end if;
  select request.user_id,access_grant.id,access_grant.ends_at,access_grant.scope
  into target_id,grant_id,grant_ends_at,grant_scope
  from private.support_access_requests request join private.support_access_grants access_grant on access_grant.request_id=request.id
  where request.id=p_request_id and request.assignee=subject_id and request.status='approved'
    and (not request.customer_approval_required or request.customer_approved_at is not null)
    and access_grant.admin_id=subject_id and access_grant.revoked_at is null
    and access_grant.starts_at<=clock_timestamp() and access_grant.ends_at>clock_timestamp()
    and exists(select 1 from public.profiles where id=request.user_id and status='active')
  order by access_grant.starts_at desc,access_grant.id limit 1;
  if grant_id is null then raise exception using errcode='42501',message='SUPPORT_GRANT_DENIED'; end if;
  select coalesce(jsonb_agg(section order by section->>'resource'),'[]'::jsonb) into sections
  from (
    select case scope_entry->>'resource'
      when 'profile-contact' then jsonb_strip_nulls(jsonb_build_object(
        'resource','profile-contact','projection','masked',
        'emailMasked',case when scope_entry->'actions' ? 'read-masked' then (select case when primary_email is null then null else left(primary_email,2)||'***@'||split_part(primary_email,'@',2) end from public.profiles where id=target_id) end,
        'phoneMasked',case when scope_entry->'actions' ? 'read-masked' then (select case when phone_e164 is null then null else left(phone_e164,3)||repeat('*',greatest(length(phone_e164)-5,3))||right(phone_e164,2) end from public.profiles where id=target_id) end))
      when 'account-status' then jsonb_strip_nulls(jsonb_build_object(
        'resource','account-status','projection','status','status',case when scope_entry->'actions' ? 'read-status' then (select status from public.profiles where id=target_id) end))
      when 'device-diagnostics' then jsonb_strip_nulls(jsonb_build_object(
        'resource','device-diagnostics','projection','aggregate',
        'total',case when scope_entry->'actions' ? 'read-aggregate' then (select count(*) from public.user_devices where user_id=target_id) end,
        'active',case when scope_entry->'actions' ? 'read-aggregate' then (select count(*) from public.user_devices where user_id=target_id and revoked_at is null) end,
        'lastSeenAt',case when scope_entry->'actions' ? 'read-status' then (select max(last_seen_at) from public.user_devices where user_id=target_id) end))
      when 'session-diagnostics' then jsonb_strip_nulls(jsonb_build_object(
        'resource','session-diagnostics','projection','aggregate',
        'active',case when scope_entry->'actions' ? 'read-aggregate' or scope_entry->'actions' ? 'read-status' then (select count(*) from public.user_devices where user_id=target_id and revoked_at is null and clerk_session_id is not null) end))
      when 'import-summary' then jsonb_strip_nulls(jsonb_build_object(
        'resource','import-summary','projection','aggregate','available',true,
        'total',case when scope_entry->'actions' ? 'read-aggregate' then (select count(*) from public.import_sessions where user_id=target_id) end,
        'active',case when scope_entry->'actions' ? 'read-status' then (select count(*) from public.import_sessions where user_id=target_id and status in ('received','processing','review')) end,
        'failed',case when scope_entry->'actions' ? 'read-status' then (select count(*) from public.import_sessions where user_id=target_id and status='failed') end,
        'lastUpdatedAt',case when scope_entry->'actions' ? 'read-status' then (select max(updated_at) from public.import_sessions where user_id=target_id) end))
      else jsonb_build_object('resource',scope_entry->>'resource','projection','status','available',false)
    end section from jsonb_array_elements(grant_scope) scope_entry
  ) approved_sections;
  return jsonb_build_object('requestId',p_request_id,'grantId',grant_id,'expiresAt',grant_ends_at,'sections',sections);
end $$;

reset role;
revoke masarifi_migration from current_user;
