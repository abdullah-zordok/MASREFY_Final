grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.ai_assert_owner(p_user_id text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if p_user_id is null or p_user_id<>public.current_clerk_user_id() then
    raise exception using errcode='42501',message='AI_OWNER_REQUIRED';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and p.status='active' and p.deleted_at is null) then
    raise exception using errcode='42501',message='AI_OWNER_INACTIVE';
  end if;
end $$;
alter function private.ai_assert_owner(text) owner to masarifi_migration;
revoke all on function private.ai_assert_owner(text) from public;

create function private.ai_route_is_compliant(p_route private.ai_feature_routes)
returns boolean language sql stable security definer set search_path='' as $$
  select p_route.enabled and p_route.deleted_at is null and p_route.zdr_required
    and cardinality(p_route.fallback_model_ids) between 1 and 4
    and cardinality(p_route.fallback_model_ids)=(select count(distinct id) from unnest(p_route.fallback_model_ids) id)
    and not p_route.primary_model_id=any(p_route.fallback_model_ids)
    and not exists(
      select 1 from unnest(array_prepend(p_route.primary_model_id,p_route.fallback_model_ids)) candidate(id)
      left join private.ai_models m on m.id=candidate.id
      left join private.ai_providers p on p.id=m.provider_id
      where m.id is null or p.id is null or not m.approved or m.deleted_at is not null or not m.structured_output
        or not 'structured_output'=any(m.capabilities)
        or not (case when p_route.workload='voice_transcription' then 'audio_input' else 'text' end)=any(m.capabilities)
        or not p.approved or not p.zdr_capable or p.training_policy<>'no_training' or p.retention_reviewed_at is null or p.deleted_at is not null
        or not p.key=any(p_route.provider_allowlist) or (p_route.limits->>'inputTokens')::integer>m.max_context
        or case when coalesce(m.cost_policy->>'prompt','')~'^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$' then (m.cost_policy->>'prompt')::numeric>(p_route.max_price->>'prompt')::numeric else true end
        or case when coalesce(m.cost_policy->>'completion','')~'^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$' then (m.cost_policy->>'completion')::numeric>(p_route.max_price->>'completion')::numeric else true end
    )
    and not exists(select 1 from unnest(p_route.provider_allowlist) allowed where not exists(
      select 1 from private.ai_models m join private.ai_providers p on p.id=m.provider_id
      where m.id=any(array_prepend(p_route.primary_model_id,p_route.fallback_model_ids)) and p.key=allowed))
    and exists(select 1 from private.ai_prompt_versions p where p.workload=p_route.workload and p.status='approved' and p.evaluation_passed)
    and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload='all' and s.rule_type='input_block'
      and s.configuration->>'denyControl'='true' and s.configuration->>'denyBidiControls'='true' and (s.configuration->>'maxUtf8Bytes')::integer between 1 and 8192)
    and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload='all' and s.rule_type='output_block'
      and s.configuration->'forbiddenKeys' @> '["tool","tools","sql","url","callback","authorization","secret"]'::jsonb)
    and (p_route.workload<>'financial_assistant' or (
      exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',p_route.workload) and s.rule_type='action_allowlist')
      and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',p_route.workload) and s.rule_type='evidence_limit' and s.configuration->>'aliasOnly'='true' and (s.configuration->>'maxItems')::integer between 1 and 32)
    ));
$$;
alter function private.ai_route_is_compliant(private.ai_feature_routes) owner to masarifi_migration;
revoke all on function private.ai_route_is_compliant(private.ai_feature_routes) from public;

create function private.get_effective_ai_route(p_workload text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'routeId',r.id,'workload',r.workload,'version',r.version,
    'primary',jsonb_build_object('id',m.id,'modelId',m.model_id,'provider',p.key,'capabilities',m.capabilities),
    'fallbacks',coalesce((select jsonb_agg(jsonb_build_object('id',fm.id,'modelId',fm.model_id,'provider',fp.key,'capabilities',fm.capabilities) order by f.ordinality)
      from unnest(r.fallback_model_ids) with ordinality f(id,ordinality)
      join private.ai_models fm on fm.id=f.id join private.ai_providers fp on fp.id=fm.provider_id),'[]'::jsonb),
    'providerAllowlist',r.provider_allowlist,'zdrRequired',r.zdr_required,
    'maxPrice',r.max_price,'limits',r.limits,
    'prompt',jsonb_build_object('id',pv.id,'versionNo',pv.version_no,'template',pv.template,'schemaVersion',pv.schema_version),
    'safetyRules',coalesce((select jsonb_agg(jsonb_build_object('key',s.key,'type',s.rule_type,'configuration',s.configuration) order by s.key)
      from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',r.workload)),'[]'::jsonb)
  )
  from private.ai_feature_routes r
  join private.ai_models m on m.id=r.primary_model_id and m.approved and m.deleted_at is null
  join private.ai_providers p on p.id=m.provider_id and p.approved and p.zdr_capable and p.training_policy='no_training' and p.deleted_at is null
  join private.ai_prompt_versions pv on pv.workload=r.workload and pv.status='approved' and pv.evaluation_passed
  where r.workload=p_workload and private.ai_route_is_compliant(r);
$$;
alter function private.get_effective_ai_route(text) owner to masarifi_migration;
revoke all on function private.get_effective_ai_route(text) from public;

create function private.ai_workload_available(p_workload text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.get_effective_ai_route(p_workload) is not null;
$$;
alter function private.ai_workload_available(text) owner to masarifi_migration;
revoke all on function private.ai_workload_available(text) from public;

create function private.reserve_ai_quota(p_user_id text,p_operation_id uuid,p_workload text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare used_count integer; first_time timestamptz; existing private.ai_usage_events%rowtype;
  route_row private.ai_feature_routes%rowtype; spent numeric; reservation numeric; budget numeric; percent integer; crossed smallint[]; threshold smallint;
begin
  perform private.ai_assert_owner(p_user_id);
  select * into existing from private.ai_usage_events where request_id=p_operation_id::text;
  if found then
    select count(*),min(created_at) into used_count,first_time from private.ai_usage_events
      where user_id=p_user_id and created_at>clock_timestamp()-interval '24 hours' and reservation_status<>'released';
    return jsonb_build_object('allowed',true,'limit',5,'used',used_count,'resetsAt',first_time+interval '24 hours','replayed',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-quota:'||p_user_id,0));
  perform pg_advisory_xact_lock(hashtextextended('ai-budget:'||p_workload||':'||date_trunc('month',current_date)::date,0));
  select count(*),min(created_at) into used_count,first_time from private.ai_usage_events
    where user_id=p_user_id and created_at>clock_timestamp()-interval '24 hours' and reservation_status<>'released';
  if used_count>=5 then
    return jsonb_build_object('allowed',false,'limit',5,'used',used_count,'resetsAt',first_time+interval '24 hours','replayed',false);
  end if;
  if p_workload not in ('voice_transcription','financial_assistant','transaction_classification') then
    raise exception using errcode='22023',message='AI_WORKLOAD_INVALID';
  end if;
  select * into route_row from private.ai_feature_routes where workload=p_workload and deleted_at is null;
  if not found then raise exception using errcode='55000',message='AI_ROUTE_UNAVAILABLE'; end if;
  budget:=(route_row.limits->>'monthlyBudget')::numeric;
  reservation:=((route_row.limits->>'inputTokens')::numeric*(route_row.max_price->>'prompt')::numeric)
    +((route_row.limits->>'outputTokens')::numeric*(route_row.max_price->>'completion')::numeric);
  select coalesce(sum(estimated_cost),0) into spent from private.ai_usage_events
    where workload=p_workload and budget_period=date_trunc('month',current_date)::date and reservation_status in ('reserved','completed','failed');
  if budget<=0 or spent+reservation>=budget then
    return jsonb_build_object('allowed',false,'limit',5,'used',used_count,'resetsAt',coalesce(first_time,clock_timestamp())+interval '24 hours','replayed',false,'reason','AI_BUDGET_EXHAUSTED');
  end if;
  percent:=floor(((spent+reservation)/budget)*100);
  crossed:=array(select candidate::smallint from unnest(array[70,85,95]) candidate
    where spent/budget*100<candidate and percent>=candidate and not exists(
      select 1 from private.ai_usage_events prior where prior.workload=p_workload
        and prior.budget_period=date_trunc('month',current_date)::date and candidate=any(prior.threshold_events)));
  insert into private.ai_usage_events(user_id,workload,model,provider,request_id,estimated_cost,threshold_events)
  values(p_user_id,p_workload,'pending','pending',p_operation_id::text,reservation,crossed);
  foreach threshold in array crossed loop
    perform private.enqueue_outbox_event('ai.budget_threshold.v1','ai-budget',p_operation_id,
      jsonb_build_object('workload',p_workload,'period',date_trunc('month',current_date)::date,'threshold',threshold,'occurredAt',clock_timestamp()));
  end loop;
  return jsonb_build_object('allowed',true,'limit',5,'used',used_count+1,'resetsAt',coalesce(first_time,clock_timestamp())+interval '24 hours','replayed',false,'reservedCost',reservation);
end $$;
alter function private.reserve_ai_quota(text,uuid,text) owner to masarifi_migration;
revoke all on function private.reserve_ai_quota(text,uuid,text) from public;

create function private.reserve_ai_quota(p_user_id text,p_operation_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.reserve_ai_quota(p_user_id,p_operation_id,'financial_assistant');
$$;
alter function private.reserve_ai_quota(text,uuid) owner to masarifi_migration;
revoke all on function private.reserve_ai_quota(text,uuid) from public;

create function private.create_voice_session(
  p_user_id text,p_locale text,p_duration_ms integer,p_content_type text,p_size_bytes bigint,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.voice_sessions%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if p_locale not in ('ar','en') or p_duration_ms not between 1 and 120000 or p_size_bytes not between 1 and 12582912
    or p_content_type not in ('audio/m4a','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/webm') then
    raise exception using errcode='22023',message='VOICE_SESSION_INVALID';
  end if;
  select * into row_value from public.voice_sessions where operation_id=p_operation_id and user_id=p_user_id;
  if not found then
    row_value.id:=extensions.gen_random_uuid();
    insert into public.voice_sessions(id,user_id,locale,storage_ref,content_type,size_bytes,status,duration_ms,expires_at,operation_id)
      values(row_value.id,p_user_id,p_locale,'voice/'||row_value.id||'/'||extensions.gen_random_uuid(),p_content_type,p_size_bytes,'uploaded',p_duration_ms,now()+interval '24 hours',p_operation_id)
      returning * into row_value;
  end if;
  return jsonb_build_object('id',row_value.id,'locale',row_value.locale,'status',row_value.status,'durationMs',row_value.duration_ms,
    'contentType',row_value.content_type,'sizeBytes',row_value.size_bytes,'storageRef',row_value.storage_ref,
    'expiresAt',row_value.expires_at,'version',row_value.version,'createdAt',row_value.created_at);
end $$;
alter function private.create_voice_session(text,text,integer,text,bigint,uuid) owner to masarifi_migration;
revoke all on function private.create_voice_session(text,text,integer,text,bigint,uuid) from public;

create function private.finalize_voice_session(p_user_id text,p_session_id uuid,p_expected_version bigint,p_content_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.voice_sessions%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  update public.voice_sessions set finalized_at=coalesce(finalized_at,clock_timestamp()),content_hash=coalesce(content_hash,p_content_hash),next_attempt_at=clock_timestamp()
   where id=p_session_id and user_id=p_user_id and version=p_expected_version and status='uploaded' and deleted_at is null
     and p_content_hash ~ '^[0-9a-f]{64}$' and (content_hash is null or content_hash=p_content_hash)
   returning * into row_value;
  if not found then raise exception using errcode='40001',message='VOICE_VERSION_CONFLICT'; end if;
  return to_jsonb(row_value)-array['user_id','storage_ref','content_hash','claim_token','claimed_by','lease_until'];
end $$;
alter function private.finalize_voice_session(text,uuid,bigint,text) owner to masarifi_migration;
revoke all on function private.finalize_voice_session(text,uuid,bigint,text) from public;

create function private.get_voice_session(p_user_id text,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.ai_assert_owner(p_user_id);
  select to_jsonb(s)-array['user_id','storage_ref','content_hash','claim_token','claimed_by','lease_until'] into result
    from public.voice_sessions s where s.id=p_session_id and s.user_id=p_user_id and s.deleted_at is null;
  if result is null then raise exception using errcode='P0002',message='VOICE_SESSION_NOT_FOUND'; end if;
  return result;
end $$;
alter function private.get_voice_session(text,uuid) owner to masarifi_migration;
revoke all on function private.get_voice_session(text,uuid) from public;

create function private.get_voice_proposal(p_user_id text,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.ai_assert_owner(p_user_id);
  select (to_jsonb(p)-array['user_id','decision_token','decision_action','decision_lease_until'])||jsonb_build_object(
    'redactedTranscript',(select t.text_redacted from public.voice_transcripts t where t.session_id=p.session_id order by t.created_at desc,t.id desc limit 1),
    'fields',coalesce((select jsonb_agg(to_jsonb(f)-array['user_id','proposal_id'] order by f.field_name) from public.voice_proposal_fields f where f.proposal_id=p.id),'[]'::jsonb))
    into result from public.voice_proposals p where p.session_id=p_session_id and p.user_id=p_user_id and p.deleted_at is null order by p.created_at desc limit 1;
  if result is null then raise exception using errcode='P0002',message='VOICE_PROPOSAL_NOT_FOUND'; end if;
  return result;
end $$;
alter function private.get_voice_proposal(text,uuid) owner to masarifi_migration;
revoke all on function private.get_voice_proposal(text,uuid) from public;

create function private.list_voice_category_preferences(p_user_id text)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  perform private.ai_assert_owner(p_user_id);
  return query select to_jsonb(p)-array['user_id','deleted_at'] from public.voice_category_preferences p
    where p.user_id=p_user_id and p.deleted_at is null order by p.updated_at desc,p.id limit 100;
end $$;
alter function private.list_voice_category_preferences(text) owner to masarifi_migration;
revoke all on function private.list_voice_category_preferences(text) from public;

create function private.upsert_voice_category_preference(p_user_id text,p_id uuid,p_expected_version bigint,p_pattern text,p_category_id uuid,p_confidence numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.voice_category_preferences%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if char_length(btrim(p_pattern)) not between 1 and 160 or p_confidence not between 0 and 1
    or not exists(select 1 from public.categories c where c.id=p_category_id and c.deleted_at is null and (c.user_id is null or c.user_id=p_user_id))
    then raise exception using errcode='22023',message='VOICE_PREFERENCE_INVALID'; end if;
  if p_id is null then
    insert into public.voice_category_preferences(user_id,merchant_pattern,category_id,confidence)
      values(p_user_id,btrim(p_pattern),p_category_id,p_confidence) returning * into row_value;
  else
    update public.voice_category_preferences set merchant_pattern=btrim(p_pattern),category_id=p_category_id,confidence=p_confidence
      where id=p_id and user_id=p_user_id and version=p_expected_version and deleted_at is null returning * into row_value;
    if not found then raise exception using errcode='40001',message='VOICE_PREFERENCE_CONFLICT'; end if;
  end if;
  return to_jsonb(row_value)-array['user_id','deleted_at'];
end $$;
alter function private.upsert_voice_category_preference(text,uuid,bigint,text,uuid,numeric) owner to masarifi_migration;
revoke all on function private.upsert_voice_category_preference(text,uuid,bigint,text,uuid,numeric) from public;

create function private.delete_voice_category_preference(p_user_id text,p_id uuid,p_expected_version bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  perform private.ai_assert_owner(p_user_id);
  update public.voice_category_preferences set deleted_at=clock_timestamp() where id=p_id and user_id=p_user_id and version=p_expected_version and deleted_at is null;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception using errcode='40001',message='VOICE_PREFERENCE_CONFLICT'; end if;
  return true;
end $$;
alter function private.delete_voice_category_preference(text,uuid,bigint) owner to masarifi_migration;
revoke all on function private.delete_voice_category_preference(text,uuid,bigint) from public;

create function private.validate_ai_proposal(p_workload text,p_schema integer,p_payload jsonb,p_user_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account_value uuid; category_value uuid; amount_value text; date_value date;
begin
  if p_workload not in ('voice_transcription','transaction_classification','financial_assistant') or p_schema<>1 or jsonb_typeof(p_payload)<>'object'
    or p_payload ?| array['tool','tools','sql','url','callback','userId','expiresAt','provider','model']
    or p_payload-array['schemaVersion','type','amountMinor','currency','categoryId','accountId','date','merchant','note','confidence']<>'{}'::jsonb
    or not (p_payload ?& array['schemaVersion','type','amountMinor','currency','categoryId','accountId','date','merchant','note','confidence'])
    or p_payload->>'schemaVersion'<>'1' or p_payload->>'type'<>'transaction.create' then
    raise exception using errcode='22023',message='AI_SCHEMA_INVALID';
  end if;
  amount_value:=p_payload->>'amountMinor';
  if amount_value !~ '^-?[1-9][0-9]{0,15}$' or (p_payload->>'currency') !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023',message='AI_FINANCIAL_VALUE_INVALID';
  end if;
  begin date_value:=(p_payload->>'date')::date; exception when others then raise exception using errcode='22023',message='AI_DATE_INVALID'; end;
  if date_value<current_date-interval '5 years' or date_value>current_date+interval '1 year' then raise exception using errcode='22023',message='AI_DATE_INVALID'; end if;
  if p_payload->>'accountId' is null then raise exception using errcode='22023',message='AI_ACCOUNT_INVALID'; end if;
  if p_payload->>'accountId' is not null then
    begin account_value:=(p_payload->>'accountId')::uuid; exception when others then raise exception using errcode='22023',message='AI_ACCOUNT_INVALID'; end;
    if not exists(select 1 from public.accounts a where a.id=account_value and a.user_id=p_user_id and a.deleted_at is null) then raise exception using errcode='42501',message='AI_ACCOUNT_INVALID'; end if;
  end if;
  if p_payload->>'categoryId' is not null then
    begin category_value:=(p_payload->>'categoryId')::uuid; exception when others then raise exception using errcode='22023',message='AI_CATEGORY_INVALID'; end;
    if not exists(select 1 from public.categories c where c.id=category_value and c.deleted_at is null and (c.user_id is null or c.user_id=p_user_id)) then raise exception using errcode='42501',message='AI_CATEGORY_INVALID'; end if;
  end if;
  return p_payload;
end $$;
alter function private.validate_ai_proposal(text,integer,jsonb,text) owner to masarifi_migration;
revoke all on function private.validate_ai_proposal(text,integer,jsonb,text) from public;

create function private.validate_assistant_action(p_action text,p_payload jsonb,p_user_id text)
returns void language plpgsql stable security definer set search_path='' as $$
declare resource_id uuid; expected_version bigint; item jsonb;
begin
  if jsonb_typeof(p_payload)<>'object' or p_payload ?| array['tool','tools','sql','url','callback','userId','provider','model'] then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
  if p_action='transaction.create' then
    if p_payload-array['amountMinor','currency','accountId','categoryId','date','merchant','note']<>'{}'::jsonb or not (p_payload ?& array['amountMinor','currency','accountId','categoryId','date','merchant','note']) then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    perform private.validate_ai_proposal('financial_assistant',1,jsonb_build_object('schemaVersion',1,'type','transaction.create','confidence',1)||p_payload,p_user_id);
  elsif p_action='transaction.update' then
    if p_payload-array['transactionId','expectedVersion','reason','amountMinor','accountId','categoryId','title','merchant','paymentMethod','note','occurredAt']<>'{}'::jsonb or not (p_payload ?& array['transactionId','expectedVersion','reason']) then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    begin resource_id:=(p_payload->>'transactionId')::uuid; expected_version:=(p_payload->>'expectedVersion')::bigint; exception when others then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end;
    if not exists(select 1 from public.transactions t where t.id=resource_id and t.user_id=p_user_id and t.version=expected_version and t.deleted_at is null) then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
  elsif p_action='budget.update' then
    if p_payload-array['budgetId','expectedVersion','patch']<>'{}'::jsonb or not (p_payload ?& array['budgetId','expectedVersion','patch']) or jsonb_typeof(p_payload->'patch')<>'object' or p_payload->'patch'='{}'::jsonb then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    begin resource_id:=(p_payload->>'budgetId')::uuid; expected_version:=(p_payload->>'expectedVersion')::bigint; exception when others then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end;
    if not exists(select 1 from public.budgets b where b.id=resource_id and b.user_id=p_user_id and b.version=expected_version and b.deleted_at is null) then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
  elsif p_action='savings_goal.create' then
    if p_payload-array['name','targetMinor','openingTrackedMinor','currencyCode','targetDate','linkedAccountId','iconKey','emergencyFund']<>'{}'::jsonb or not (p_payload ?& array['name','targetMinor','currencyCode']) then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    if (p_payload->>'targetMinor')!~'^[1-9][0-9]{0,15}$' or (p_payload->>'currencyCode')!~'^[A-Z]{3}$' or not exists(select 1 from public.currencies c where btrim(c.code::text)=p_payload->>'currencyCode') then raise exception using errcode='22023',message='AI_FINANCIAL_VALUE_INVALID'; end if;
    if p_payload->>'linkedAccountId' is not null then begin resource_id:=(p_payload->>'linkedAccountId')::uuid; exception when others then raise exception using errcode='22023',message='AI_ACCOUNT_INVALID'; end; if not exists(select 1 from public.accounts a where a.id=resource_id and a.user_id=p_user_id and a.deleted_at is null) then raise exception using errcode='42501',message='AI_ACCOUNT_INVALID'; end if; end if;
  elsif p_action='obligation.payment.record' then
    if p_payload-array['obligationId','transactionId','expectedVersion','paymentMethod','paymentCase','allocationIntent','source','allocations']<>'{}'::jsonb or not (p_payload ?& array['obligationId','transactionId','expectedVersion','paymentMethod','paymentCase','allocationIntent','source','allocations']) or jsonb_typeof(p_payload->'allocations')<>'array' or jsonb_array_length(p_payload->'allocations') not between 1 and 100 then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    begin resource_id:=(p_payload->>'obligationId')::uuid; expected_version:=(p_payload->>'expectedVersion')::bigint; exception when others then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end;
    if not exists(select 1 from public.obligations o where o.id=resource_id and o.user_id=p_user_id and o.version=expected_version and o.deleted_at is null) then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
    if not exists(select 1 from public.transactions t where t.id=(p_payload->>'transactionId')::uuid and t.user_id=p_user_id and t.deleted_at is null) then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
    for item in select value from jsonb_array_elements(p_payload->'allocations') loop
      if item-array['scheduleItemId','amountMinor']<>'{}'::jsonb or not (item ?& array['scheduleItemId','amountMinor']) or (item->>'amountMinor')!~'^[1-9][0-9]{0,15}$'
        or not exists(select 1 from public.obligation_schedule_items i where i.id=(item->>'scheduleItemId')::uuid and i.user_id=p_user_id and i.obligation_id=resource_id) then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
    end loop;
  elsif p_action='tracking.review.resolve' then
    if p_payload-array['reviewId','decision','expectedVersion','edit']<>'{}'::jsonb or not (p_payload ?& array['reviewId','decision','expectedVersion','edit']) or p_payload->>'decision' not in ('accept','reject','edit_accept') or jsonb_typeof(p_payload->'edit')<>'object' then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    begin resource_id:=(p_payload->>'reviewId')::uuid; expected_version:=(p_payload->>'expectedVersion')::bigint; exception when others then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end;
    if not exists(select 1 from public.review_items r where r.id=resource_id and r.user_id=p_user_id and r.version=expected_version and r.status='pending') then raise exception using errcode='42501',message='AI_ACTION_REFERENCE_INVALID'; end if;
  else raise exception using errcode='22023',message='AI_ACTION_NOT_ALLOWED'; end if;
end $$;
alter function private.validate_assistant_action(text,jsonb,text) owner to masarifi_migration;
revoke all on function private.validate_assistant_action(text,jsonb,text) from public;

create function private.save_voice_result(p_session_id uuid,p_claim_token uuid,p_provider text,p_model text,p_transcript text,p_confidence numeric,p_language text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare session_row public.voice_sessions%rowtype; proposal_row public.voice_proposals%rowtype; item record;
begin
  select * into session_row from public.voice_sessions where id=p_session_id and claim_token=p_claim_token and status='processing' and lease_until>clock_timestamp() for update;
  if not found then raise exception using errcode='40001',message='AI_WORK_FENCE_INVALID'; end if;
  perform private.validate_ai_proposal('voice_transcription',1,p_payload,session_row.user_id);
  insert into public.voice_transcripts(user_id,session_id,provider,model,text_redacted,confidence,language)
    values(session_row.user_id,session_row.id,p_provider,p_model,left(p_transcript,8192),p_confidence,p_language);
  insert into public.voice_proposals(user_id,session_id,schema_version,proposal_type,payload,status,expires_at)
    values(session_row.user_id,session_row.id,1,'transaction.create',p_payload,'validated',now()+interval '15 minutes') returning * into proposal_row;
  for item in select key,value from jsonb_each(p_payload) where key in ('amountMinor','currency','categoryId','accountId','date','merchant','note') loop
    insert into public.voice_proposal_fields(user_id,proposal_id,field_name,value_json,confidence)
    values(session_row.user_id,proposal_row.id,item.key,item.value,p_confidence);
  end loop;
  update public.voice_sessions set status='proposed',claim_token=null,claimed_by=null,lease_until=null where id=session_row.id;
  perform private.enqueue_outbox_event('voice.proposal_ready.v1','voice-proposal',proposal_row.id,
    jsonb_build_object('sessionId',session_row.id,'proposalId',proposal_row.id,'schemaVersion',1,'version',proposal_row.version,'expiresAt',proposal_row.expires_at,'occurredAt',clock_timestamp()));
  return jsonb_build_object('sessionId',session_row.id,'proposalId',proposal_row.id,'version',proposal_row.version);
end $$;
alter function private.save_voice_result(uuid,uuid,text,text,text,numeric,text,jsonb) owner to masarifi_migration;
revoke all on function private.save_voice_result(uuid,uuid,text,text,text,numeric,text,jsonb) from public;

create function private.get_assistant_consent(p_user_id text,p_policy_version text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.assistant_consents%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  select * into c from public.assistant_consents where user_id=p_user_id and revoked_at is null order by granted_at desc limit 1;
  return jsonb_build_object('policyVersion',p_policy_version,'granted',c.id is not null and c.policy_version=p_policy_version,
    'grantedAt',c.granted_at,'revokedAt',c.revoked_at);
end $$;
alter function private.get_assistant_consent(text,text) owner to masarifi_migration;
revoke all on function private.get_assistant_consent(text,text) from public;

create function private.set_assistant_consent(p_user_id text,p_policy_version text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.assistant_consents%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai-consent:'||p_user_id,0));
  if p_enabled then
    update public.assistant_consents set revoked_at=clock_timestamp() where user_id=p_user_id and revoked_at is null and policy_version<>p_policy_version;
    insert into public.assistant_consents(user_id,policy_version) values(p_user_id,p_policy_version)
      on conflict(user_id,policy_version) do update set revoked_at=null,granted_at=clock_timestamp()
      returning * into c;
  else
    update public.assistant_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id and revoked_at is null returning * into c;
    update public.assistant_messages set work_status='cancelled',failure_code='AI_CONSENT_REVOKED',claim_token=null,claimed_by=null,lease_until=null
      where user_id=p_user_id and role='user' and work_status='queued';
  end if;
  return jsonb_build_object('policyVersion',p_policy_version,'granted',p_enabled,'grantedAt',c.granted_at,'revokedAt',c.revoked_at);
end $$;
alter function private.set_assistant_consent(text,text,boolean) owner to masarifi_migration;
revoke all on function private.set_assistant_consent(text,text,boolean) from public;

create function private.create_assistant_conversation(p_user_id text,p_title text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.assistant_conversations%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_consents where user_id=p_user_id and revoked_at is null) then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  insert into public.assistant_conversations(user_id,title) values(p_user_id,nullif(btrim(p_title),'')) returning * into c;
  return to_jsonb(c)-array['user_id','deleted_at'];
end $$;
alter function private.create_assistant_conversation(text,text) owner to masarifi_migration;
revoke all on function private.create_assistant_conversation(text,text) from public;

create function private.list_assistant_conversations(p_user_id text,p_cursor_time timestamptz,p_cursor_id uuid,p_limit integer)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  perform private.ai_assert_owner(p_user_id);
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  return query select to_jsonb(c)-array['user_id','deleted_at'] from public.assistant_conversations c
    where c.user_id=p_user_id and c.status<>'deleted' and (p_cursor_time is null or (c.last_message_at,c.id)<(p_cursor_time,p_cursor_id))
    order by c.last_message_at desc,c.id desc limit p_limit;
end $$;
alter function private.list_assistant_conversations(text,timestamptz,uuid,integer) owner to masarifi_migration;
revoke all on function private.list_assistant_conversations(text,timestamptz,uuid,integer) from public;

create function private.update_assistant_conversation(p_user_id text,p_id uuid,p_title text,p_status text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.assistant_conversations%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  update public.assistant_conversations set title=coalesce(nullif(btrim(p_title),''),title),status=coalesce(p_status,status),
    deleted_at=case when p_status='deleted' then clock_timestamp() else deleted_at end
    where id=p_id and user_id=p_user_id and version=p_expected_version and status<>'deleted'
      and (p_status is null or p_status in ('active','archived','deleted')) returning * into c;
  if not found then raise exception using errcode='40001',message='AI_CONVERSATION_CONFLICT'; end if;
  return to_jsonb(c)-array['user_id','deleted_at'];
end $$;
alter function private.update_assistant_conversation(text,uuid,text,text,bigint) owner to masarifi_migration;
revoke all on function private.update_assistant_conversation(text,uuid,text,text,bigint) from public;

create function private.enqueue_assistant_message(p_user_id text,p_conversation_id uuid,p_content text,p_context_scope text[],p_response_mode text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.assistant_messages%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_consents where user_id=p_user_id and revoked_at is null) then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  if not exists(select 1 from public.assistant_conversations where id=p_conversation_id and user_id=p_user_id and status='active')
    or octet_length(btrim(p_content)) not between 1 and 8192 or p_response_mode not in ('async','stream')
    or not p_context_scope <@ array['accounts_summary','recent_transactions','budgets','obligations','tracking_reviews']::text[]
    or cardinality(p_context_scope) not between 1 and 5 then raise exception using errcode='22023',message='AI_MESSAGE_INVALID'; end if;
  select * into m from public.assistant_messages where operation_id=p_operation_id and user_id=p_user_id;
  if not found then
    insert into public.assistant_messages(user_id,conversation_id,role,content_redacted,context_scope,operation_id,work_status,response_mode)
      values(p_user_id,p_conversation_id,'user',left(btrim(p_content),8192),p_context_scope,p_operation_id,'queued',p_response_mode) returning * into m;
    update public.assistant_conversations set last_message_at=m.created_at where id=p_conversation_id;
  end if;
  return to_jsonb(m)-array['user_id','claim_token','claimed_by','lease_until','context_scope'];
end $$;
alter function private.enqueue_assistant_message(text,uuid,text,text[],text,uuid) owner to masarifi_migration;
revoke all on function private.enqueue_assistant_message(text,uuid,text,text[],text,uuid) from public;

create function private.list_assistant_messages(p_user_id text,p_conversation_id uuid,p_cursor_time timestamptz,p_cursor_id uuid,p_limit integer)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  perform private.ai_assert_owner(p_user_id);
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  return query select (to_jsonb(m)-array['user_id','claim_token','claimed_by','lease_until','context_scope'])||jsonb_build_object(
      'snapshot',(select to_jsonb(s)-array['user_id','message_id'] from public.assistant_response_snapshots s where s.message_id=m.id),
      'preview',(select to_jsonb(a)-array['user_id','decision_token','decision_action','decision_lease_until','deleted_at'] from public.assistant_action_previews a where a.message_id=m.id order by a.created_at limit 1))
    from public.assistant_messages m where m.conversation_id=p_conversation_id and m.user_id=p_user_id
      and (p_cursor_time is null or (m.created_at,m.id)<(p_cursor_time,p_cursor_id)) order by m.created_at desc,m.id desc limit p_limit;
end $$;
alter function private.list_assistant_messages(text,uuid,timestamptz,uuid,integer) owner to masarifi_migration;
revoke all on function private.list_assistant_messages(text,uuid,timestamptz,uuid,integer) from public;

create function private.get_assistant_message_result(p_user_id text,p_user_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare request_row public.assistant_messages%rowtype; response_row public.assistant_messages%rowtype; result jsonb;
begin
  perform private.ai_assert_owner(p_user_id);
  select * into request_row from public.assistant_messages where id=p_user_message_id and user_id=p_user_id and role='user';
  if not found then raise exception using errcode='P0002',message='AI_MESSAGE_NOT_FOUND'; end if;
  select * into response_row from public.assistant_messages where reply_to_message_id=request_row.id and user_id=p_user_id;
  result:=jsonb_build_object('id',request_row.id,'status',request_row.work_status,'failureCode',request_row.failure_code);
  if response_row.id is not null then
    result:=result||jsonb_build_object('response',jsonb_build_object('id',response_row.id,'content',response_row.content_redacted,'createdAt',response_row.created_at),
      'preview',(select to_jsonb(a)-array['user_id','decision_token','decision_action','decision_lease_until','deleted_at'] from public.assistant_action_previews a where a.message_id=response_row.id order by a.created_at limit 1));
  end if;
  return result;
end $$;
alter function private.get_assistant_message_result(text,uuid) owner to masarifi_migration;
revoke all on function private.get_assistant_message_result(text,uuid) from public;

create function private.cancel_assistant_message(p_user_id text,p_user_message_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  perform private.ai_assert_owner(p_user_id);
  update public.assistant_messages set work_status='cancelled',failure_code='AI_CLIENT_CANCELLED',claim_token=null,claimed_by=null,lease_until=null
    where id=p_user_message_id and user_id=p_user_id and role='user' and work_status in ('queued','processing');
  get diagnostics changed=row_count;
  return changed=1;
end $$;
alter function private.cancel_assistant_message(text,uuid) owner to masarifi_migration;
revoke all on function private.cancel_assistant_message(text,uuid) from public;

create function private.save_assistant_result(p_user_message_id uuid,p_claim_token uuid,p_provider text,p_model text,p_content text,p_evidence jsonb,p_preview jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.assistant_messages%rowtype; response_row public.assistant_messages%rowtype; preview_row public.assistant_action_previews%rowtype;
begin
  select * into request_row from public.assistant_messages where id=p_user_message_id and claim_token=p_claim_token and work_status='processing' and lease_until>clock_timestamp() for update;
  if not found then raise exception using errcode='40001',message='AI_WORK_FENCE_INVALID'; end if;
  if not exists(select 1 from public.assistant_consents where user_id=request_row.user_id and revoked_at is null) then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  if octet_length(p_content) not between 1 and 16384 or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)>32 then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
  insert into public.assistant_messages(user_id,conversation_id,reply_to_message_id,role,content_redacted,prompt_version_id,work_status)
    select request_row.user_id,request_row.conversation_id,request_row.id,'assistant',p_content,pv.id,'completed'
    from private.ai_prompt_versions pv where pv.workload='financial_assistant' and pv.status='approved' returning * into response_row;
  if not found then raise exception using errcode='55000',message='AI_PROMPT_UNAVAILABLE'; end if;
  insert into public.assistant_response_snapshots(user_id,message_id,schema_version,evidence_refs,model,provider)
    values(request_row.user_id,response_row.id,1,p_evidence,p_model,p_provider);
  if p_preview is not null and jsonb_typeof(p_preview)='object' then
    if not (p_preview ?& array['schemaVersion','actionType','payload','evidenceIds']) or p_preview-array['schemaVersion','actionType','payload','evidenceIds']<>'{}'::jsonb or p_preview ?| array['tool','sql','url','callback'] then raise exception using errcode='22023',message='AI_SCHEMA_INVALID'; end if;
    perform private.validate_assistant_action(p_preview->>'actionType',p_preview->'payload',request_row.user_id);
    insert into public.assistant_action_previews(user_id,message_id,schema_version,action_type,payload,status,expires_at)
      values(request_row.user_id,response_row.id,1,p_preview->>'actionType',p_preview->'payload','validated',now()+interval '15 minutes') returning * into preview_row;
  end if;
  update public.assistant_messages set work_status='completed',claim_token=null,claimed_by=null,lease_until=null where id=request_row.id;
  update public.assistant_conversations set last_message_at=response_row.created_at where id=response_row.conversation_id;
  perform private.enqueue_outbox_event('assistant.response_ready.v1','assistant-message',response_row.id,
    jsonb_build_object('conversationId',response_row.conversation_id,'messageId',response_row.id,'hasPreview',preview_row.id is not null,'schemaVersion',1,'occurredAt',clock_timestamp()));
  return jsonb_build_object('messageId',response_row.id,'previewId',preview_row.id);
end $$;
alter function private.save_assistant_result(uuid,uuid,text,text,text,jsonb,jsonb) owner to masarifi_migration;
revoke all on function private.save_assistant_result(uuid,uuid,text,text,text,jsonb,jsonb) from public;

create function private.confirm_ai_action(p_preview_id uuid,p_expected_version bigint,p_operation_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare voice_row public.voice_proposals%rowtype; assistant_row public.assistant_action_previews%rowtype; token uuid:=extensions.gen_random_uuid(); owner_id text; final_payload jsonb;
begin
  owner_id:=public.current_clerk_user_id();
  select * into voice_row from public.voice_proposals where id=p_preview_id and user_id=owner_id for update;
  if found then
    if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch-array['amountMinor','currency','categoryId','accountId','date','merchant','note']<>'{}'::jsonb then raise exception using errcode='22023',message='AI_EDIT_INVALID'; end if;
    if voice_row.status='executed' and voice_row.confirmation_operation_id=p_operation_id then
      return jsonb_build_object('sourceKind','voice','id',voice_row.id,'actionType',voice_row.proposal_type,'resourceId',voice_row.executed_transaction_id,'operationId',p_operation_id,'replayed',true);
    end if;
    if voice_row.status='confirmed' and voice_row.confirmation_operation_id=p_operation_id then
      if voice_row.payload||p_patch<>voice_row.payload then raise exception using errcode='40001',message='IDEMPOTENCY_KEY_REUSED'; end if;
      update public.voice_proposals set decision_token=token,decision_lease_until=clock_timestamp()+interval '2 minutes' where id=voice_row.id;
      return jsonb_build_object('sourceKind','voice','id',voice_row.id,'actionType',voice_row.proposal_type,'payload',voice_row.payload,'decisionToken',token,'operationId',p_operation_id,'replayed',false,'resumed',true);
    end if;
    if voice_row.version<>p_expected_version or voice_row.status<>'validated' then raise exception using errcode='40001',message='AI_ACTION_CONFLICT'; end if;
    if voice_row.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='AI_ACTION_EXPIRED'; end if;
    final_payload:=voice_row.payload||p_patch;
    perform private.validate_ai_proposal('voice_transcription',voice_row.schema_version,final_payload,owner_id);
    update public.voice_proposals set payload=final_payload,status='confirmed',confirmed_at=clock_timestamp(),confirmation_operation_id=p_operation_id,decision_token=token,decision_action='confirm',decision_lease_until=clock_timestamp()+interval '2 minutes' where id=voice_row.id;
    return jsonb_build_object('sourceKind','voice','id',voice_row.id,'actionType',voice_row.proposal_type,'payload',final_payload,'decisionToken',token,'operationId',p_operation_id,'replayed',false);
  end if;
  select * into assistant_row from public.assistant_action_previews where id=p_preview_id and user_id=owner_id for update;
  if not found then raise exception using errcode='P0002',message='AI_ACTION_NOT_FOUND'; end if;
  if assistant_row.status='executed' and assistant_row.confirmation_operation_id=p_operation_id then
    return jsonb_build_object('sourceKind','assistant','id',assistant_row.id,'actionType',assistant_row.action_type,'resourceId',assistant_row.executed_resource_id,'operationId',p_operation_id,'replayed',true);
  end if;
  if p_patch is null or p_patch<>'{}'::jsonb then raise exception using errcode='22023',message='AI_EDIT_INVALID'; end if;
  if assistant_row.status='confirmed' and assistant_row.confirmation_operation_id=p_operation_id then
    update public.assistant_action_previews set decision_token=token,decision_lease_until=clock_timestamp()+interval '2 minutes' where id=assistant_row.id;
    return jsonb_build_object('sourceKind','assistant','id',assistant_row.id,'actionType',assistant_row.action_type,'payload',assistant_row.payload,'decisionToken',token,'operationId',p_operation_id,'replayed',false,'resumed',true);
  end if;
  if assistant_row.version<>p_expected_version or assistant_row.status<>'validated' then raise exception using errcode='40001',message='AI_ACTION_CONFLICT'; end if;
  if assistant_row.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='AI_ACTION_EXPIRED'; end if;
  if not exists(select 1 from public.assistant_consents where user_id=owner_id and revoked_at is null) then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  update public.assistant_action_previews set status='confirmed',confirmed_at=clock_timestamp(),confirmation_operation_id=p_operation_id,decision_token=token,decision_action='confirm',decision_lease_until=clock_timestamp()+interval '2 minutes' where id=assistant_row.id;
  return jsonb_build_object('sourceKind','assistant','id',assistant_row.id,'actionType',assistant_row.action_type,'payload',assistant_row.payload,'decisionToken',token,'operationId',p_operation_id,'replayed',false);
end $$;
alter function private.confirm_ai_action(uuid,bigint,uuid,jsonb) owner to masarifi_migration;
revoke all on function private.confirm_ai_action(uuid,bigint,uuid,jsonb) from public;

create function private.confirm_ai_action(p_preview_id uuid,p_expected_version bigint,p_operation_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.confirm_ai_action(p_preview_id,p_expected_version,p_operation_id,'{}'::jsonb);
$$;
alter function private.confirm_ai_action(uuid,bigint,uuid) owner to masarifi_migration;
revoke all on function private.confirm_ai_action(uuid,bigint,uuid) from public;

create function private.complete_ai_action(p_preview_id uuid,p_decision_token uuid,p_resource_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update public.voice_proposals set status='executed',executed_transaction_id=p_resource_id,decision_token=null,decision_action=null,decision_lease_until=null
    where id=p_preview_id and status='confirmed' and decision_token=p_decision_token and decision_lease_until>clock_timestamp()
    returning jsonb_build_object('sourceKind','voice','id',id,'resourceId',executed_transaction_id,'version',version+1) into result;
  if result is null then
    update public.assistant_action_previews set status='executed',executed_resource_id=p_resource_id,decision_token=null,decision_action=null,decision_lease_until=null
      where id=p_preview_id and status='confirmed' and decision_token=p_decision_token and decision_lease_until>clock_timestamp()
      returning jsonb_build_object('sourceKind','assistant','id',id,'resourceId',executed_resource_id,'version',version+1) into result;
  end if;
  if result is null then raise exception using errcode='40001',message='AI_ACTION_FENCE_INVALID'; end if;
  perform private.enqueue_outbox_event(case when result->>'sourceKind'='voice' then 'voice.proposal_confirmed.v1' else 'assistant.action_confirmed.v1' end,
    'ai-action',p_preview_id,jsonb_build_object('sourceId',p_preview_id,'resourceId',p_resource_id,'occurredAt',clock_timestamp()));
  return result;
end $$;
alter function private.complete_ai_action(uuid,uuid,uuid) owner to masarifi_migration;
revoke all on function private.complete_ai_action(uuid,uuid,uuid) from public;

create function private.reject_ai_action(p_user_id text,p_preview_id uuid,p_expected_version bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.ai_assert_owner(p_user_id);
  update public.voice_proposals set status='rejected' where id=p_preview_id and user_id=p_user_id and version=p_expected_version and status in ('draft','validated') returning to_jsonb(voice_proposals)-array['user_id','decision_token','decision_action','decision_lease_until'] into result;
  if result is null then
    update public.assistant_action_previews set status='rejected' where id=p_preview_id and user_id=p_user_id and version=p_expected_version and status in ('draft','validated') returning to_jsonb(assistant_action_previews)-array['user_id','decision_token','decision_action','decision_lease_until'] into result;
    if result is not null then perform private.enqueue_outbox_event('assistant.action_rejected.v1','assistant-action',p_preview_id,jsonb_build_object('sourceId',p_preview_id,'occurredAt',clock_timestamp())); end if;
  end if;
  if result is null then raise exception using errcode='40001',message='AI_ACTION_CONFLICT'; end if;
  return result;
end $$;
alter function private.reject_ai_action(text,uuid,bigint,text) owner to masarifi_migration;
revoke all on function private.reject_ai_action(text,uuid,bigint,text) from public;

create function private.record_assistant_feedback(p_user_id text,p_message_id uuid,p_rating smallint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.assistant_feedback%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_messages where id=p_message_id and user_id=p_user_id and role='assistant') then raise exception using errcode='P0002',message='AI_MESSAGE_NOT_FOUND'; end if;
  insert into public.assistant_feedback(user_id,message_id,rating,reason) values(p_user_id,p_message_id,p_rating,nullif(btrim(p_reason),''))
    on conflict(user_id,message_id) do update set rating=excluded.rating,reason=excluded.reason returning * into row_value;
  return to_jsonb(row_value)-'user_id';
end $$;
alter function private.record_assistant_feedback(text,uuid,smallint,text) owner to masarifi_migration;
revoke all on function private.record_assistant_feedback(text,uuid,smallint,text) from public;

create function private.create_ai_response_report(p_user_id text,p_message_id uuid,p_report_type text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.ai_response_reports%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_messages where id=p_message_id and user_id=p_user_id and role='assistant') then raise exception using errcode='P0002',message='AI_MESSAGE_NOT_FOUND'; end if;
  insert into public.ai_response_reports(user_id,message_id,report_type,reason) values(p_user_id,p_message_id,p_report_type,p_reason)
    on conflict(user_id,message_id,report_type) where status='open' and deleted_at is null do update set reason=excluded.reason returning * into row_value;
  return to_jsonb(row_value)-array['user_id','deleted_at'];
end $$;
alter function private.create_ai_response_report(text,uuid,text,text) owner to masarifi_migration;
revoke all on function private.create_ai_response_report(text,uuid,text,text) from public;

create function private.get_ai_work_input(p_kind text,p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; work_user text; scopes text[];
begin
  if p_kind='voice.transcribe_extract' then
    select jsonb_build_object('id',s.id,'userId',s.user_id,'storageRef',s.storage_ref,'contentType',s.content_type,
      'sizeBytes',s.size_bytes,'durationMs',s.duration_ms,'locale',s.locale,'operationId',s.operation_id,
      'aliases',coalesce((select jsonb_agg(reference order by reference->>'alias') from (
        select jsonb_build_object('alias','ACCOUNT-'||a.ordinality,'kind','account','id',a.id,'version',a.version,
          'data',jsonb_build_object('currency',btrim(a.currency_code::text),'type',a.type,'isDefault',a.is_default)) reference
          from (select a.*,row_number() over(order by a.is_default desc,a.sort_order,a.id) ordinality from public.accounts a
            where a.user_id=s.user_id and a.status='active' and a.deleted_at is null) a where a.ordinality<=20
        union all
        select jsonb_build_object('alias','CATEGORY-'||c.ordinality,'kind','category','id',c.id,'version',c.version,
          'data',jsonb_build_object('kind',c.kind,'labelAr',c.label_ar,'labelEn',c.label_en))
          from (select c.*,row_number() over(order by c.user_id nulls first,c.sort_order,c.id) ordinality from public.categories c
            where c.active and c.deleted_at is null and (c.user_id is null or c.user_id=s.user_id)) c where c.ordinality<=80
      ) aliases),'[]'::jsonb))
      into result from public.voice_sessions s where s.id=p_id and s.claim_token=p_claim_token and s.status='processing' and s.lease_until>clock_timestamp();
  elsif p_kind='assistant.respond' then
    select m.user_id,m.context_scope into work_user,scopes from public.assistant_messages m
      where m.id=p_id and m.claim_token=p_claim_token and m.work_status='processing' and m.lease_until>clock_timestamp();
    if work_user is not null and exists(select 1 from public.assistant_consents c where c.user_id=work_user and c.revoked_at is null) then
      select jsonb_build_object('id',m.id,'userId',m.user_id,'operationId',m.operation_id,'content',m.content_redacted,
        'contextScope',m.context_scope,'evidence',coalesce((
          select jsonb_agg(entry order by entry->>'alias') from (
            select jsonb_build_object('kind','accounts_summary','alias','ACCOUNTS-1','version',coalesce(max(a.version),0),
              'data',jsonb_build_object('count',count(*),'currencies',coalesce(jsonb_agg(distinct btrim(a.currency_code::text)),'[]'::jsonb))) entry
              from public.accounts a where a.user_id=work_user and a.deleted_at is null having 'accounts_summary'=any(scopes)
            union all
            select jsonb_build_object('kind','recent_transactions','alias','TRANSACTIONS-1','version',coalesce(max(t.version),0),
              'data',jsonb_build_object('count',count(*),'amountMinor',coalesce(sum(t.amount_minor),0)::text))
              from (select * from public.transactions where user_id=work_user and deleted_at is null order by occurred_at desc,id desc limit 50) t having 'recent_transactions'=any(scopes)
            union all
            select jsonb_build_object('kind','budgets','alias','BUDGETS-1','version',coalesce(max(b.version),0),'data',jsonb_build_object('count',count(*)))
              from public.budgets b where b.user_id=work_user and b.deleted_at is null having 'budgets'=any(scopes)
            union all
            select jsonb_build_object('kind','obligations','alias','OBLIGATIONS-1','version',coalesce(max(o.version),0),'data',jsonb_build_object('count',count(*)))
              from public.obligations o where o.user_id=work_user and o.deleted_at is null having 'obligations'=any(scopes)
            union all
            select jsonb_build_object('kind','tracking_reviews','alias','REVIEWS-1','version',coalesce(max(r.version),0),'data',jsonb_build_object('count',count(*)))
              from public.review_items r where r.user_id=work_user and r.status='pending' having 'tracking_reviews'=any(scopes)
          ) x
        ),'[]'::jsonb),
        'aliases',coalesce((select jsonb_agg(reference order by reference->>'alias') from (
          select jsonb_build_object('alias','ACCOUNT-'||a.ordinality,'kind','account','id',a.id,'version',a.version,
            'data',jsonb_build_object('currency',btrim(a.currency_code::text),'type',a.type,'isDefault',a.is_default)) reference
            from (select a.*,row_number() over(order by a.is_default desc,a.sort_order,a.id) ordinality from public.accounts a
              where a.user_id=work_user and a.status='active' and a.deleted_at is null) a where a.ordinality<=10
          union all
          select jsonb_build_object('alias','CATEGORY-'||c.ordinality,'kind','category','id',c.id,'version',c.version,
            'data',jsonb_build_object('kind',c.kind,'labelAr',c.label_ar,'labelEn',c.label_en))
            from (select c.*,row_number() over(order by c.user_id nulls first,c.sort_order,c.id) ordinality from public.categories c
              where c.active and c.deleted_at is null and (c.user_id is null or c.user_id=work_user)) c where c.ordinality<=20
          union all
          select jsonb_build_object('alias','TRANSACTION-'||t.ordinality,'kind','transaction','id',t.id,'version',t.version,
            'data',jsonb_build_object('kind',t.kind,'amountMinor',t.amount_minor::text,'currency',btrim(t.currency_code::text),'occurredAt',t.occurred_at))
            from (select t.*,row_number() over(order by t.occurred_at desc,t.id) ordinality from public.transactions t
              where t.user_id=work_user and t.deleted_at is null) t where t.ordinality<=20
          union all
          select jsonb_build_object('alias','BUDGET-'||b.ordinality,'kind','budget','id',b.id,'version',b.version,
            'data',jsonb_build_object('currency',btrim(b.currency_code::text),'periodStart',b.period_start,'periodEnd',b.period_end,'status',b.status))
            from (select b.*,row_number() over(order by b.period_start desc,b.id) ordinality from public.budgets b
              where b.user_id=work_user and b.deleted_at is null) b where b.ordinality<=10
          union all
          select jsonb_build_object('alias','OBLIGATION-'||o.ordinality,'kind','obligation','id',o.id,'version',o.version,
            'data',jsonb_build_object('currency',btrim(o.currency_code::text),'direction',o.direction,'status',o.status))
            from (select o.*,row_number() over(order by o.created_at desc,o.id) ordinality from public.obligations o
              where o.user_id=work_user and o.deleted_at is null) o where o.ordinality<=10
          union all
          select jsonb_build_object('alias','SCHEDULE-'||i.ordinality,'kind','schedule','id',i.id,'version',i.version,
            'data',jsonb_build_object('amountMinor',i.amount_minor::text,'paidMinor',i.paid_minor::text,'dueAt',i.due_at,'status',i.status))
            from (select i.*,row_number() over(order by i.due_at,i.id) ordinality from public.obligation_schedule_items i
              where i.user_id=work_user and i.status in ('due','partial','overdue')) i where i.ordinality<=20
          union all
          select jsonb_build_object('alias','REVIEW-'||r.ordinality,'kind','review','id',r.id,'version',r.version,
            'data',jsonb_build_object('reason',r.reason,'status',r.status))
            from (select r.*,row_number() over(order by r.created_at desc,r.id) ordinality from public.review_items r
              where r.user_id=work_user and r.status='pending') r where r.ordinality<=10
        ) aliases),'[]'::jsonb)) into result from public.assistant_messages m where m.id=p_id;
    end if;
  elsif p_kind='ai.evaluate_route' then
    select jsonb_build_object('id',p.id,'workload',p.workload,'template',p.template,'schemaVersion',p.schema_version,
      'cases',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'fixture',c.fixture_redacted,'expected',c.expected_rules) order by c.id)
        from private.ai_prompt_test_cases c where c.prompt_version_id=p.id and c.enabled and c.deleted_at is null),'[]'::jsonb))
      into result from private.ai_prompt_versions p where p.id=p_id and p.claim_token=p_claim_token and p.lease_until>clock_timestamp();
  else raise exception using errcode='22023',message='AI_JOB_KIND_INVALID'; end if;
  if result is null then raise exception using errcode='40001',message='AI_WORK_FENCE_INVALID'; end if;
  return result;
end $$;
alter function private.get_ai_work_input(text,uuid,uuid) owner to masarifi_migration;
revoke all on function private.get_ai_work_input(text,uuid,uuid) from public;

create function private.claim_ai_work(p_kind text,p_worker_id text,p_limit integer,p_lease_seconds integer)
returns table(kind text,id uuid,user_id text,claim_token uuid,attempt_count integer) language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 10 and 300 or char_length(p_worker_id) not between 1 and 128 then raise exception using errcode='22023',message='AI_CLAIM_INVALID'; end if;
  if p_kind='voice.transcribe_extract' then
    return query with claimed as (select s.id from public.voice_sessions s where s.status in ('uploaded','processing') and s.finalized_at is not null and s.next_attempt_at<=clock_timestamp() and (s.lease_until is null or s.lease_until<=clock_timestamp()) order by s.next_attempt_at,s.id for update skip locked limit p_limit), updated as (
      update public.voice_sessions s set status='processing',claim_token=extensions.gen_random_uuid(),claimed_by=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=s.attempt_count+1 from claimed where s.id=claimed.id returning s.id,s.user_id,s.claim_token,s.attempt_count)
      select p_kind,u.id,u.user_id,u.claim_token,u.attempt_count from updated u;
  elsif p_kind='assistant.respond' then
    return query with claimed as (select m.id from public.assistant_messages m where m.role='user' and m.work_status in ('queued','processing') and m.next_attempt_at<=clock_timestamp() and (m.lease_until is null or m.lease_until<=clock_timestamp()) order by m.next_attempt_at,m.id for update skip locked limit p_limit), updated as (
      update public.assistant_messages m set work_status='processing',claim_token=extensions.gen_random_uuid(),claimed_by=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=m.attempt_count+1 from claimed where m.id=claimed.id returning m.id,m.user_id,m.claim_token,m.attempt_count)
      select p_kind,u.id,u.user_id,u.claim_token,u.attempt_count from updated u;
  elsif p_kind='ai.evaluate_route' then
    return query with claimed as (select p.id from private.ai_prompt_versions p where p.status='testing' and p.next_attempt_at<=clock_timestamp() and (p.lease_until is null or p.lease_until<=clock_timestamp()) order by p.next_attempt_at,p.id for update skip locked limit p_limit), updated as (
      update private.ai_prompt_versions p set claim_token=extensions.gen_random_uuid(),claimed_by=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=p.attempt_count+1 from claimed where p.id=claimed.id returning p.id,p.claim_token,p.attempt_count)
      select p_kind,u.id,null::text,u.claim_token,u.attempt_count from updated u;
  else raise exception using errcode='22023',message='AI_JOB_KIND_INVALID'; end if;
end $$;
alter function private.claim_ai_work(text,text,integer,integer) owner to masarifi_migration;
revoke all on function private.claim_ai_work(text,text,integer,integer) from public;

create function private.complete_ai_work(p_kind text,p_id uuid,p_claim_token uuid,p_status text,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_status not in ('completed','failed','retry') then raise exception using errcode='22023',message='AI_WORK_STATUS_INVALID'; end if;
  if p_kind='voice.transcribe_extract' then
    update public.voice_sessions set status=case when p_status='failed' then 'failed' else status end,failure_code=case when p_status='failed' then p_error_code else null end,
      next_attempt_at=case when p_status='retry' then clock_timestamp()+interval '30 seconds' else next_attempt_at end,claim_token=null,claimed_by=null,lease_until=null
      where id=p_id and claim_token=p_claim_token; get diagnostics changed=row_count;
    if changed=1 and p_status='failed' then
      perform private.enqueue_outbox_event('voice.proposal_failed.v1','voice-session',p_id,jsonb_build_object('sessionId',p_id,'failureCode',p_error_code,'occurredAt',clock_timestamp()));
    end if;
  elsif p_kind='assistant.respond' then
    update public.assistant_messages set work_status=case when p_status='retry' then 'queued' else p_status end,failure_code=p_error_code,
      next_attempt_at=case when p_status='retry' then clock_timestamp()+interval '30 seconds' else next_attempt_at end,claim_token=null,claimed_by=null,lease_until=null
      where id=p_id and claim_token=p_claim_token; get diagnostics changed=row_count;
  elsif p_kind='ai.evaluate_route' then
    update private.ai_prompt_versions set evaluation_passed=p_status='completed',evaluation_summary=jsonb_build_object('status',p_status,'errorCode',p_error_code),
      status=case when p_status='completed' then 'testing' when p_status='retry' then 'testing' else 'draft' end,
      next_attempt_at=case when p_status='retry' then clock_timestamp()+interval '30 seconds' else next_attempt_at end,claim_token=null,claimed_by=null,lease_until=null
      where id=p_id and claim_token=p_claim_token; get diagnostics changed=row_count;
  else raise exception using errcode='22023',message='AI_JOB_KIND_INVALID'; end if;
  if changed=1 and p_status='failed' and p_kind in ('assistant.respond','ai.evaluate_route') then
    perform private.enqueue_outbox_event('ai.provider_failed.v1','ai-work',p_id,jsonb_build_object('workKind',p_kind,'failureCode',p_error_code,'occurredAt',clock_timestamp()));
  end if;
  return changed=1;
end $$;
alter function private.complete_ai_work(text,uuid,uuid,text,text) owner to masarifi_migration;
revoke all on function private.complete_ai_work(text,uuid,uuid,text,text) from public;

create function private.record_ai_usage(p_user_id text,p_workload text,p_model text,p_provider text,p_input integer,p_output integer,p_cost numeric,p_latency integer,p_fallback boolean,p_request_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.ai_usage_events set model=p_model,provider=p_provider,input_tokens=p_input,output_tokens=p_output,estimated_cost=greatest(estimated_cost,p_cost),
    latency_ms=p_latency,fallback_used=p_fallback,reservation_status='completed' where request_id=p_request_id and (user_id=p_user_id or p_user_id is null);
  if not found then insert into private.ai_usage_events(user_id,workload,model,provider,input_tokens,output_tokens,estimated_cost,latency_ms,fallback_used,request_id,reservation_status)
    values(p_user_id,p_workload,p_model,p_provider,p_input,p_output,p_cost,p_latency,p_fallback,p_request_id,'completed'); end if;
  if p_fallback then perform private.enqueue_outbox_event('ai.fallback_used.v1','ai-usage',extensions.gen_random_uuid(),jsonb_build_object('workload',p_workload,'provider',p_provider,'model',p_model,'occurredAt',clock_timestamp())); end if;
end $$;
alter function private.record_ai_usage(text,text,text,text,integer,integer,numeric,integer,boolean,text) owner to masarifi_migration;
revoke all on function private.record_ai_usage(text,text,text,text,integer,integer,numeric,integer,boolean,text) from public;

create function private.record_ai_failure(p_user_id text,p_workload text,p_model text,p_provider text,p_failure_code text,p_schema_failure boolean,p_retryable boolean,p_latency integer,p_request_id text)
returns void language sql security definer set search_path='' as $$
  insert into private.ai_failure_events(user_id,workload,model,provider,failure_code,schema_failure,retryable,latency_ms,request_id)
  values(p_user_id,p_workload,p_model,p_provider,p_failure_code,p_schema_failure,p_retryable,p_latency,p_request_id);
$$;
alter function private.record_ai_failure(text,text,text,text,text,boolean,boolean,integer,text) owner to masarifi_migration;
revoke all on function private.record_ai_failure(text,text,text,text,text,boolean,boolean,integer,text) from public;

create function private.record_ai_failure(p_user_id text,p_workload text,p_model text,p_provider text,p_failure_code text,p_schema_failure boolean,p_request_id text)
returns void language sql security definer set search_path='' as $$
  select private.record_ai_failure(p_user_id,p_workload,p_model,p_provider,p_failure_code,p_schema_failure,false,0,p_request_id);
$$;
alter function private.record_ai_failure(text,text,text,text,text,boolean,text) owner to masarifi_migration;
revoke all on function private.record_ai_failure(text,text,text,text,text,boolean,text) from public;

create function private.record_ai_generation_hash(p_request_id text,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='AI_GENERATION_HASH_INVALID'; end if;
  update private.ai_usage_events set provider_generation_hash=coalesce(provider_generation_hash,p_hash)
    where request_id=p_request_id and (provider_generation_hash is null or provider_generation_hash=p_hash);
  get diagnostics changed=row_count; return changed=1;
end $$;
alter function private.record_ai_generation_hash(text,text) owner to masarifi_migration;
revoke all on function private.record_ai_generation_hash(text,text) from public;

create function private.expire_ai_proposals(p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer:=0; count_one integer;
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  with due as (select id from public.voice_proposals where status in ('draft','validated') and expires_at<=clock_timestamp() order by expires_at,id for update skip locked limit p_limit)
  update public.voice_proposals p set status='expired' from due where p.id=due.id; get diagnostics changed=row_count;
  with due as (select id from public.assistant_action_previews where status in ('draft','validated') and expires_at<=clock_timestamp() order by expires_at,id for update skip locked limit greatest(0,p_limit-changed))
  update public.assistant_action_previews p set status='expired' from due where p.id=due.id; get diagnostics count_one=row_count;
  return changed+count_one;
end $$;
alter function private.expire_ai_proposals(integer) owner to masarifi_migration;
revoke all on function private.expire_ai_proposals(integer) from public;

create function private.claim_voice_media_purge(p_worker_id text,p_limit integer,p_lease_seconds integer)
returns table(id uuid,storage_ref text,purge_token uuid) language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 10 and 300 then raise exception using errcode='22023',message='AI_CLAIM_INVALID'; end if;
  return query with due as (select s.id from public.voice_sessions s where s.storage_ref is not null and (s.expires_at<=clock_timestamp() or s.status in ('proposed','confirmed','failed','expired')) and (s.lease_until is null or s.lease_until<=clock_timestamp()) order by s.expires_at,s.id for update skip locked limit p_limit), updated as (
    update public.voice_sessions s set claim_token=extensions.gen_random_uuid(),claimed_by=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) from due where s.id=due.id returning s.id,s.storage_ref,s.claim_token)
    select u.id,u.storage_ref,u.claim_token from updated u;
end $$;
alter function private.claim_voice_media_purge(text,integer,integer) owner to masarifi_migration;
revoke all on function private.claim_voice_media_purge(text,integer,integer) from public;

create function private.complete_voice_media_purge(p_id uuid,p_purge_token uuid,p_deleted boolean,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update public.voice_sessions set storage_ref=case when p_deleted then null else storage_ref end,
    failure_code=case when not p_deleted and status='failed' then coalesce(p_error_code,'VOICE_PURGE_FAILED') else failure_code end,
    next_attempt_at=case when p_deleted then next_attempt_at else clock_timestamp()+interval '5 minutes' end,
    claim_token=null,claimed_by=null,lease_until=null where id=p_id and claim_token=p_purge_token;
  get diagnostics changed=row_count; return changed=1;
end $$;
alter function private.complete_voice_media_purge(uuid,uuid,boolean,text) owner to masarifi_migration;
revoke all on function private.complete_voice_media_purge(uuid,uuid,boolean,text) from public;

create function private.publish_ai_prompt_version(p_id uuid,p_expected_version bigint,p_admin_id text,p_reason text,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ai_prompt_versions%rowtype;
begin
  if char_length(btrim(p_reason)) not between 10 and 500 or not private.admin_has_permission(p_admin_id,'ai.prompts.publish',clock_timestamp()) then raise exception using errcode='42501',message='AI_PROMPT_PUBLISH_DENIED'; end if;
  select * into p from private.ai_prompt_versions where id=p_id for update;
  if not found or p.version_no<>p_expected_version or p.status<>'testing' or not p.evaluation_passed
    or not exists(select 1 from private.ai_prompt_test_cases c where c.prompt_version_id=p.id and c.enabled and c.deleted_at is null) then raise exception using errcode='40001',message='AI_PROMPT_PUBLISH_CONFLICT'; end if;
  update private.ai_prompt_versions set status='retired' where workload=p.workload and status='approved';
  update private.ai_prompt_versions set status='approved',approved_by=p_admin_id,published_at=clock_timestamp() where id=p.id;
  perform audit.append_event(p_admin_id,'admin','ai.prompt-published','ai_prompt',p.id::text,null,null,p_reason,p_request_id,jsonb_build_object('workload',p.workload,'version',p.version_no));
  return jsonb_build_object('id',p.id,'workload',p.workload,'status','approved','versionNo',p.version_no);
end $$;
alter function private.publish_ai_prompt_version(uuid,bigint,text,text,text) owner to masarifi_migration;
revoke all on function private.publish_ai_prompt_version(uuid,bigint,text,text,text) from public;

create function private.publish_ai_prompt_version(p_id uuid,p_expected_version bigint,p_admin_id text,p_reason text)
returns jsonb language sql security definer set search_path='' as $$
  select private.publish_ai_prompt_version(p_id,p_expected_version,p_admin_id,p_reason,'ai-prompt-publish');
$$;
alter function private.publish_ai_prompt_version(uuid,bigint,text,text) owner to masarifi_migration;
revoke all on function private.publish_ai_prompt_version(uuid,bigint,text,text) from public;

create function private.read_admin_ai(p_resource text,p_id uuid,p_limit integer,p_exact boolean)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
declare admin_id text:=public.current_clerk_user_id(); permission text;
begin
  permission:=case p_resource when 'overview' then 'ai.overview.read' when 'providers' then 'ai.providers.read' when 'models' then 'ai.models.read'
    when 'routes' then 'ai.routes.read' when 'prompts' then 'ai.prompts.read' when 'usage' then 'ai.usage.read'
    when 'failures' then 'ai.failures.manage' when 'response-reports' then 'ai.reports.read' when 'safety-rules' then 'ai.safety.read' end;
  if permission is null or not private.admin_has_permission(admin_id,permission,clock_timestamp()) then raise exception using errcode='42501',message='ADMIN_PERMISSION_DENIED'; end if;
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  if p_resource='overview' then
    return query select jsonb_build_object('id','99000000-0000-4000-8000-000000000001','kind','overview','version',1,'data',jsonb_build_object(
      'providers',(select count(*) from private.ai_providers where deleted_at is null),'models',(select count(*) from private.ai_models where deleted_at is null),
      'enabledRoutes',(select count(*) from private.ai_feature_routes where enabled and deleted_at is null),
      'requests',(select count(*) from private.ai_usage_events where created_at>clock_timestamp()-interval '30 days'),
      'estimatedCost',(select coalesce(sum(estimated_cost),0)::text from private.ai_usage_events where created_at>clock_timestamp()-interval '30 days'),
      'failures',(select count(*) from private.ai_failure_events where created_at>clock_timestamp()-interval '30 days')));
  elsif p_resource='providers' then return query select jsonb_build_object('id',p.id,'kind','provider','version',p.version,'data',to_jsonb(p)-array['id','version','deleted_at']) from private.ai_providers p where p.deleted_at is null and (p_id is null or (p_exact and p.id=p_id) or (not p_exact and p.id>p_id)) order by p.id limit p_limit;
  elsif p_resource='models' then return query select jsonb_build_object('id',m.id,'kind','model','version',m.version,'data',to_jsonb(m)-array['id','version','deleted_at']) from private.ai_models m where m.deleted_at is null and (p_id is null or (p_exact and m.id=p_id) or (not p_exact and m.id>p_id)) order by m.id limit p_limit;
  elsif p_resource='routes' then return query select jsonb_build_object('id',r.id,'kind','route','version',r.version,'data',to_jsonb(r)-array['id','version','deleted_at']) from private.ai_feature_routes r where r.deleted_at is null and (p_id is null or (p_exact and r.id=p_id) or (not p_exact and r.id>p_id)) order by r.id limit p_limit;
  elsif p_resource='prompts' then return query select jsonb_build_object('id',p.id,'kind','prompt','version',p.version_no,'data',(to_jsonb(p)-array['id','version_no','claim_token','claimed_by','lease_until','deleted_at'])) from private.ai_prompt_versions p where (p_id is null or (p_exact and p.id=p_id) or (not p_exact and p.id>p_id)) order by p.id limit p_limit;
  elsif p_resource='usage' then return query select jsonb_build_object('id',u.id,'kind','usage','version',1,'data',jsonb_build_object('workload',u.workload,'model',u.model,'provider',u.provider,'inputTokens',u.input_tokens,'outputTokens',u.output_tokens,'estimatedCost',u.estimated_cost::text,'latencyMs',u.latency_ms,'fallbackUsed',u.fallback_used,'status',u.reservation_status,'createdAt',u.created_at)) from private.ai_usage_events u where (p_id is null or (p_exact and u.id=p_id) or (not p_exact and u.id>p_id)) order by u.id limit p_limit;
  elsif p_resource='failures' then return query select jsonb_build_object('id',f.id,'kind','failure','version',f.version,'data',to_jsonb(f)-array['id','user_id','version']) from private.ai_failure_events f where (p_id is null or (p_exact and f.id=p_id) or (not p_exact and f.id>p_id)) order by f.id limit p_limit;
  elsif p_resource='response-reports' then return query select jsonb_build_object('id',r.id,'kind','response-report','version',r.version,'data',jsonb_build_object('reportType',r.report_type,'status',r.status,'createdAt',r.created_at,'updatedAt',r.updated_at)) from public.ai_response_reports r where r.deleted_at is null and (p_id is null or (p_exact and r.id=p_id) or (not p_exact and r.id>p_id)) order by r.id limit p_limit;
  elsif p_resource='safety-rules' then return query select jsonb_build_object('id',s.id,'kind','safety-rule','version',s.version,'data',to_jsonb(s)-array['id','version','deleted_at']) from private.ai_safety_rules s where s.deleted_at is null and (p_id is null or (p_exact and s.id=p_id) or (not p_exact and s.id>p_id)) order by s.id limit p_limit;
  else raise exception using errcode='22023',message='AI_RESOURCE_INVALID'; end if;
end $$;
alter function private.read_admin_ai(text,uuid,integer,boolean) owner to masarifi_migration;
revoke all on function private.read_admin_ai(text,uuid,integer,boolean) from public;

create function private.read_admin_ai(p_resource text,p_id uuid,p_limit integer)
returns table(value jsonb) language sql stable security definer set search_path='' as $$
  select * from private.read_admin_ai(p_resource,p_id,p_limit,true);
$$;
alter function private.read_admin_ai(text,uuid,integer) owner to masarifi_migration;
revoke all on function private.read_admin_ai(text,uuid,integer) from public;

create function private.mutate_admin_ai(p_resource text,p_id uuid,p_expected_version bigint,p_patch jsonb,p_admin_id text,p_reason text,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; permission text; changed_id uuid;
begin
  permission:=case p_resource when 'providers' then 'ai.providers.manage' when 'models' then 'ai.models.manage' when 'routes' then 'ai.routes.manage'
    when 'failures' then 'ai.operations.manage' when 'response-reports' then 'ai.reports.manage' when 'safety-rules' then 'ai.safety.manage' when 'prompts' then 'ai.prompts.manage' end;
  if permission is null or p_admin_id<>public.current_clerk_user_id() or not private.admin_has_permission(p_admin_id,permission,clock_timestamp()) or char_length(btrim(p_reason)) not between 10 and 500 or jsonb_typeof(p_patch)<>'object' then raise exception using errcode='42501',message='ADMIN_PERMISSION_DENIED'; end if;
  if p_resource='providers' then
    if p_patch-array['approved','zdrCapable','trainingPolicy','displayName']<>'{}'::jsonb then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update private.ai_providers set approved=coalesce((p_patch->>'approved')::boolean,approved),zdr_capable=coalesce((p_patch->>'zdrCapable')::boolean,zdr_capable),training_policy=coalesce(p_patch->>'trainingPolicy',training_policy),display_name=coalesce(p_patch->>'displayName',display_name),retention_reviewed_at=case when p_patch?'approved' then clock_timestamp() else retention_reviewed_at end where id=p_id and version=p_expected_version and deleted_at is null returning id into changed_id;
  elsif p_resource='models' then
    if p_patch-array['approved','capabilities','maxContext','structuredOutput','costPolicy']<>'{}'::jsonb then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update private.ai_models set approved=coalesce((p_patch->>'approved')::boolean,approved),capabilities=case when p_patch?'capabilities' then array(select jsonb_array_elements_text(p_patch->'capabilities')) else capabilities end,max_context=coalesce((p_patch->>'maxContext')::integer,max_context),structured_output=coalesce((p_patch->>'structuredOutput')::boolean,structured_output),cost_policy=coalesce(p_patch->'costPolicy',cost_policy) where id=p_id and version=p_expected_version and deleted_at is null returning id into changed_id;
  elsif p_resource='routes' then
    if p_patch-array['primaryModelId','fallbackModelIds','providerAllowlist','enabled','maxPrice','limits']<>'{}'::jsonb then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update private.ai_feature_routes set primary_model_id=coalesce((p_patch->>'primaryModelId')::uuid,primary_model_id),fallback_model_ids=case when p_patch?'fallbackModelIds' then array(select jsonb_array_elements_text(p_patch->'fallbackModelIds'))::uuid[] else fallback_model_ids end,provider_allowlist=case when p_patch?'providerAllowlist' then array(select jsonb_array_elements_text(p_patch->'providerAllowlist')) else provider_allowlist end,enabled=coalesce((p_patch->>'enabled')::boolean,enabled),max_price=coalesce(p_patch->'maxPrice',max_price),limits=coalesce(p_patch->'limits',limits) where id=p_id and version=p_expected_version and deleted_at is null returning id into changed_id;
  elsif p_resource='response-reports' then
    if p_patch-array['status']<>'{}'::jsonb or p_patch->>'status' not in ('reviewed','actioned','dismissed') then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update public.ai_response_reports set status=p_patch->>'status',reviewed_at=clock_timestamp() where id=p_id and version=p_expected_version and deleted_at is null returning id into changed_id;
  elsif p_resource='failures' then
    if p_patch-array['status']<>'{}'::jsonb or p_patch->>'status' not in ('open','acknowledged','resolved') then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update private.ai_failure_events set status=p_patch->>'status' where id=p_id and version=p_expected_version returning id into changed_id;
  elsif p_resource='safety-rules' and p_id is null then
    if not (p_patch ?& array['key','workload','ruleType','configuration','enabled']) then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    insert into private.ai_safety_rules(key,workload,rule_type,configuration,enabled) values(p_patch->>'key',p_patch->>'workload',p_patch->>'ruleType',p_patch->'configuration',(p_patch->>'enabled')::boolean) returning id into changed_id;
  elsif p_resource='safety-rules' then
    if p_patch-array['key','workload','ruleType','configuration','enabled']<>'{}'::jsonb then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    update private.ai_safety_rules set key=coalesce(p_patch->>'key',key),workload=coalesce(p_patch->>'workload',workload),rule_type=coalesce(p_patch->>'ruleType',rule_type),configuration=coalesce(p_patch->'configuration',configuration),enabled=coalesce((p_patch->>'enabled')::boolean,enabled) where id=p_id and version=p_expected_version and deleted_at is null returning id into changed_id;
  elsif p_resource='prompts' and p_id is null then
    if not (p_patch ?& array['workload','template','schemaVersion']) then raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
    insert into private.ai_prompt_versions(workload,version_no,template,schema_version) values(p_patch->>'workload',(select coalesce(max(version_no),0)+1 from private.ai_prompt_versions where workload=p_patch->>'workload'),p_patch->>'template',(p_patch->>'schemaVersion')::integer) returning id into changed_id;
  else raise exception using errcode='22023',message='AI_MUTATION_INVALID'; end if;
  if changed_id is null then raise exception using errcode='40001',message='AI_ADMIN_CONFLICT'; end if;
  if p_resource in ('providers','models','routes','safety-rules') and exists(select 1 from private.ai_feature_routes r where r.enabled and r.deleted_at is null and not private.ai_route_is_compliant(r)) then
    raise exception using errcode='22023',message='AI_ROUTE_POLICY_INVALID';
  end if;
  perform audit.append_event(p_admin_id,'admin','ai.config-updated','ai_config',changed_id::text,null,null,p_reason,p_request_id,jsonb_build_object('resource',p_resource));
  select value into result from private.read_admin_ai(p_resource,changed_id,1); return result;
end $$;
alter function private.mutate_admin_ai(text,uuid,bigint,jsonb,text,text,text) owner to masarifi_migration;
revoke all on function private.mutate_admin_ai(text,uuid,bigint,jsonb,text,text,text) from public;

create function private.test_ai_prompt_version(p_id uuid,p_expected_version bigint,p_admin_id text,p_reason text,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value private.ai_prompt_versions%rowtype;
begin
  if p_admin_id<>public.current_clerk_user_id() or not private.admin_has_permission(p_admin_id,'ai.prompts.publish',clock_timestamp()) or char_length(btrim(p_reason)) not between 10 and 500 then raise exception using errcode='42501',message='ADMIN_PERMISSION_DENIED'; end if;
  if not exists(select 1 from private.ai_prompt_test_cases c where c.prompt_version_id=p_id and c.enabled and c.deleted_at is null) then raise exception using errcode='22023',message='AI_EVALUATION_CASES_REQUIRED'; end if;
  update private.ai_prompt_versions set status='testing',evaluation_passed=false,evaluation_summary='{}',next_attempt_at=clock_timestamp() where id=p_id and version_no=p_expected_version and status='draft' returning * into row_value;
  if not found then raise exception using errcode='40001',message='AI_PROMPT_TEST_CONFLICT'; end if;
  perform audit.append_event(p_admin_id,'admin','ai.prompt-test-queued','ai_prompt',p_id::text,null,null,p_reason,p_request_id,'{}');
  return jsonb_build_object('id',row_value.id,'status','queued');
end $$;
alter function private.test_ai_prompt_version(uuid,bigint,text,text,text) owner to masarifi_migration;
revoke all on function private.test_ai_prompt_version(uuid,bigint,text,text,text) from public;

create function private.reconcile_ai_state(p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_count integer; media_count bigint; reservation_count bigint;
begin
  expired_count:=private.expire_ai_proposals(least(greatest(p_limit,1),1000));
  select count(*) into media_count from public.voice_sessions where storage_ref is not null and expires_at<clock_timestamp();
  select count(*) into reservation_count from private.ai_usage_events where reservation_status='reserved' and created_at<clock_timestamp()-interval '2 hours';
  return jsonb_build_object('expired',expired_count,'mediaDue',media_count,'staleReservations',reservation_count);
end $$;
alter function private.reconcile_ai_state(integer) owner to masarifi_migration;
revoke all on function private.reconcile_ai_state(integer) from public;

create function private.rollup_ai_usage(p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare released integer;
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  with stale as (select id from private.ai_usage_events where reservation_status='reserved' and created_at<clock_timestamp()-interval '2 hours' order by created_at,id for update skip locked limit p_limit)
  update private.ai_usage_events u set reservation_status='released' from stale where u.id=stale.id;
  get diagnostics released=row_count;
  return jsonb_build_object('released',released,'rolledUpAt',clock_timestamp());
end $$;
alter function private.rollup_ai_usage(integer) owner to masarifi_migration;
revoke all on function private.rollup_ai_usage(integer) from public;

create function private.export_ai_batch(p_user_id text,p_kind text,p_after timestamptz,p_after_id uuid,p_limit integer)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  if (p_after is null)<>(p_after_id is null) then raise exception using errcode='22023',message='AI_CURSOR_INVALID'; end if;
  if p_kind in ('voice','voice_sessions') then return query select to_jsonb(s)-array['user_id','storage_ref','content_hash','claim_token','claimed_by','lease_until'] from public.voice_sessions s where s.user_id=p_user_id and (p_after is null or (s.created_at,s.id)>(p_after,p_after_id)) order by s.created_at,s.id limit p_limit;
  elsif p_kind='voice_transcripts' then return query select to_jsonb(t)-array['user_id'] from public.voice_transcripts t where t.user_id=p_user_id and (p_after is null or (t.created_at,t.id)>(p_after,p_after_id)) order by t.created_at,t.id limit p_limit;
  elsif p_kind='voice_proposals' then return query select to_jsonb(v)-array['user_id','decision_token','decision_action','decision_lease_until'] from public.voice_proposals v where v.user_id=p_user_id and (p_after is null or (v.created_at,v.id)>(p_after,p_after_id)) order by v.created_at,v.id limit p_limit;
  elsif p_kind='voice_proposal_fields' then return query select to_jsonb(f)-array['user_id'] from public.voice_proposal_fields f where f.user_id=p_user_id and (p_after is null or (f.created_at,f.id)>(p_after,p_after_id)) order by f.created_at,f.id limit p_limit;
  elsif p_kind='voice_category_preferences' then return query select to_jsonb(v)-array['user_id','deleted_at'] from public.voice_category_preferences v where v.user_id=p_user_id and (p_after is null or (v.created_at,v.id)>(p_after,p_after_id)) order by v.created_at,v.id limit p_limit;
  elsif p_kind='assistant_consents' then return query select to_jsonb(c)-array['user_id'] from public.assistant_consents c where c.user_id=p_user_id and (p_after is null or (c.created_at,c.id)>(p_after,p_after_id)) order by c.created_at,c.id limit p_limit;
  elsif p_kind='conversations' then return query select to_jsonb(c)-array['user_id','deleted_at'] from public.assistant_conversations c where c.user_id=p_user_id and (p_after is null or (c.created_at,c.id)>(p_after,p_after_id)) order by c.created_at,c.id limit p_limit;
  elsif p_kind='messages' then return query select to_jsonb(m)-array['user_id','claim_token','claimed_by','lease_until','context_scope'] from public.assistant_messages m where m.user_id=p_user_id and (p_after is null or (m.created_at,m.id)>(p_after,p_after_id)) order by m.created_at,m.id limit p_limit;
  elsif p_kind='assistant_snapshots' then return query select to_jsonb(s)-array['user_id'] from public.assistant_response_snapshots s where s.user_id=p_user_id and (p_after is null or (s.created_at,s.id)>(p_after,p_after_id)) order by s.created_at,s.id limit p_limit;
  elsif p_kind='assistant_previews' then return query select to_jsonb(a)-array['user_id','decision_token','decision_action','decision_lease_until'] from public.assistant_action_previews a where a.user_id=p_user_id and (p_after is null or (a.created_at,a.id)>(p_after,p_after_id)) order by a.created_at,a.id limit p_limit;
  elsif p_kind='assistant_feedback' then return query select to_jsonb(f)-array['user_id'] from public.assistant_feedback f where f.user_id=p_user_id and (p_after is null or (f.created_at,f.id)>(p_after,p_after_id)) order by f.created_at,f.id limit p_limit;
  elsif p_kind='response_reports' then return query select to_jsonb(r)-array['user_id','deleted_at'] from public.ai_response_reports r where r.user_id=p_user_id and (p_after is null or (r.created_at,r.id)>(p_after,p_after_id)) order by r.created_at,r.id limit p_limit;
  else raise exception using errcode='22023',message='AI_EXPORT_KIND_INVALID'; end if;
end $$;
alter function private.export_ai_batch(text,text,timestamptz,uuid,integer) owner to masarifi_migration;
revoke all on function private.export_ai_batch(text,text,timestamptz,uuid,integer) from public;

create function private.export_ai_batch(p_user_id text,p_kind text,p_after timestamptz,p_limit integer)
returns table(value jsonb) language sql stable security definer set search_path='' as $$
  select * from private.export_ai_batch(p_user_id,p_kind,p_after,case when p_after is null then null else 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid end,p_limit);
$$;
alter function private.export_ai_batch(text,text,timestamptz,integer) owner to masarifi_migration;
revoke all on function private.export_ai_batch(text,text,timestamptz,integer) from public;

create function private.read_ai_voice_refs(p_user_id text,p_after uuid,p_limit integer)
returns table(id uuid,storage_ref text) language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  return query select s.id,s.storage_ref from public.voice_sessions s
    where s.user_id=p_user_id and s.storage_ref is not null and (p_after is null or s.id>p_after)
    order by s.id limit p_limit;
end $$;
alter function private.read_ai_voice_refs(text,uuid,integer) owner to masarifi_migration;
revoke all on function private.read_ai_voice_refs(text,uuid,integer) from public;

create function private.read_ai_voice_refs(p_user_id text)
returns table(storage_ref text) language sql stable security definer set search_path='' as $$
  select r.storage_ref from private.read_ai_voice_refs(p_user_id,null,1000) r;
$$;
alter function private.read_ai_voice_refs(text) owner to masarifi_migration;
revoke all on function private.read_ai_voice_refs(text) from public;

create function private.ai_owner_data_counts(p_user_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('deleted',(
    select sum(count) from (
      select count(*) from public.voice_sessions where user_id=p_user_id union all
      select count(*) from public.voice_transcripts where user_id=p_user_id union all
      select count(*) from public.voice_proposals where user_id=p_user_id union all
      select count(*) from public.voice_proposal_fields where user_id=p_user_id union all
      select count(*) from public.voice_category_preferences where user_id=p_user_id union all
      select count(*) from public.assistant_consents where user_id=p_user_id union all
      select count(*) from public.assistant_conversations where user_id=p_user_id union all
      select count(*) from public.assistant_messages where user_id=p_user_id union all
      select count(*) from public.assistant_response_snapshots where user_id=p_user_id union all
      select count(*) from public.assistant_action_previews where user_id=p_user_id union all
      select count(*) from public.assistant_feedback where user_id=p_user_id union all
      select count(*) from public.ai_response_reports where user_id=p_user_id
    ) totals
  ),'anonymized',(select count(*) from private.ai_usage_events where user_id=p_user_id)+(select count(*) from private.ai_failure_events where user_id=p_user_id));
$$;
alter function private.ai_owner_data_counts(text) owner to masarifi_migration;
revoke all on function private.ai_owner_data_counts(text) from public;

create function private.delete_ai_owner_data(p_user_id text,p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer:=0; part integer;
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='AI_LIMIT_INVALID'; end if;
  perform set_config('masarifi.ai_privacy_delete','on',true);
  delete from public.assistant_conversations where id in (select id from public.assistant_conversations where user_id=p_user_id order by id limit p_limit); get diagnostics changed=row_count;
  delete from public.assistant_consents where id in (select id from public.assistant_consents where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.voice_category_preferences where id in (select id from public.voice_category_preferences where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.voice_sessions where id in (select id from public.voice_sessions where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  update private.ai_usage_events set user_id=null where id in (select id from private.ai_usage_events where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  update private.ai_failure_events set user_id=null where id in (select id from private.ai_failure_events where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count;
  return changed+part;
end $$;
alter function private.delete_ai_owner_data(text,integer) owner to masarifi_migration;
revoke all on function private.delete_ai_owner_data(text,integer) from public;

reset role;
revoke masarifi_migration from current_user;
