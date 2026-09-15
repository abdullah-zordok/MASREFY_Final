grant masarifi_migration to current_user with inherit true,set true;
set role masarifi_migration;

alter table public.assistant_messages
  add column intent text,
  add column context_payload jsonb not null default '{}'::jsonb,
  add column evidence_payload jsonb not null default '[]'::jsonb,
  add column history_payload jsonb not null default '[]'::jsonb,
  add constraint assistant_messages_intent_check check(intent is null or intent in (
    'spending_summary','income_summary','category_breakdown','budget_status','savings_status',
    'obligations_status','upcoming_obligations','salary_status','period_comparison',
    'recent_transactions','transaction_search','financial_health','financial_advice',
    'purchase_affordability','general_finance','create_transaction','update_transaction',
    'update_budget','create_savings_goal','record_obligation_payment',
    'resolve_tracking_review','unsupported','unrelated'
  )),
  add constraint assistant_messages_context_check check(
    jsonb_typeof(context_payload)='object' and pg_column_size(context_payload)<=32768
  ),
  add constraint assistant_messages_evidence_check check(
    jsonb_typeof(evidence_payload)='array' and jsonb_array_length(evidence_payload)<=32
    and pg_column_size(evidence_payload)<=8192
  ),
  add constraint assistant_messages_history_check check(
    jsonb_typeof(history_payload)='array' and jsonb_array_length(history_payload)<=4
    and pg_column_size(history_payload)<=8192
  );

insert into private.retention_policies(resource_type,retention_days,deletion_mode,legal_basis)
values('ai',365,'delete','Assistant conversations are retained for product continuity, then removed to minimize personal data.')
on conflict(resource_type) do nothing;

create function private.enqueue_assistant_message_v2(
  p_user_id text,
  p_conversation_id uuid,
  p_content text,
  p_intent text,
  p_context jsonb,
  p_evidence jsonb,
  p_history jsonb,
  p_response_mode text,
  p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.assistant_messages%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_consents where user_id=p_user_id and revoked_at is null)
    then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  if not exists(select 1 from public.assistant_conversations where id=p_conversation_id and user_id=p_user_id and status='active')
    or octet_length(btrim(p_content)) not between 1 and 8192
    or p_response_mode not in ('async','stream')
    or p_intent is null
    then raise exception using errcode='22023',message='AI_MESSAGE_INVALID'; end if;
  select * into m from public.assistant_messages where operation_id=p_operation_id and user_id=p_user_id;
  if not found then
    insert into public.assistant_messages(
      user_id,conversation_id,role,content_redacted,intent,context_payload,evidence_payload,
      history_payload,operation_id,work_status,response_mode
    ) values(
      p_user_id,p_conversation_id,'user',left(btrim(p_content),8192),p_intent,p_context,p_evidence,
      p_history,p_operation_id,'queued',p_response_mode
    ) returning * into m;
    update public.assistant_conversations set last_message_at=m.created_at where id=p_conversation_id;
  end if;
  return to_jsonb(m)-array[
    'user_id','claim_token','claimed_by','lease_until','context_scope','context_payload',
    'evidence_payload','history_payload'
  ];
end $$;
alter function private.enqueue_assistant_message_v2(text,uuid,text,text,jsonb,jsonb,jsonb,text,uuid) owner to masarifi_migration;
revoke all on function private.enqueue_assistant_message_v2(text,uuid,text,text,jsonb,jsonb,jsonb,text,uuid) from public;

create function private.save_deterministic_assistant_message(
  p_user_id text,
  p_conversation_id uuid,
  p_content text,
  p_intent text,
  p_answer text,
  p_context jsonb,
  p_evidence jsonb,
  p_response_mode text,
  p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.assistant_messages%rowtype; response_row public.assistant_messages%rowtype;
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_consents where user_id=p_user_id and revoked_at is null)
    then raise exception using errcode='42501',message='AI_CONSENT_REQUIRED'; end if;
  if not exists(select 1 from public.assistant_conversations where id=p_conversation_id and user_id=p_user_id and status='active')
    or octet_length(btrim(p_content)) not between 1 and 8192
    or octet_length(btrim(p_answer)) not between 1 and 16384
    or p_response_mode not in ('async','stream')
    or p_intent is null
    then raise exception using errcode='22023',message='AI_MESSAGE_INVALID'; end if;
  select * into request_row from public.assistant_messages where operation_id=p_operation_id and user_id=p_user_id;
  if not found then
    insert into public.assistant_messages(
      user_id,conversation_id,role,content_redacted,intent,context_payload,evidence_payload,
      operation_id,work_status,response_mode
    ) values(
      p_user_id,p_conversation_id,'user',left(btrim(p_content),8192),p_intent,p_context,p_evidence,
      p_operation_id,'completed',p_response_mode
    ) returning * into request_row;
    insert into public.assistant_messages(
      user_id,conversation_id,reply_to_message_id,role,content_redacted,work_status
    ) values(
      p_user_id,p_conversation_id,request_row.id,'assistant',btrim(p_answer),'completed'
    ) returning * into response_row;
    insert into public.assistant_response_snapshots(
      user_id,message_id,schema_version,evidence_refs,model,provider
    ) values(p_user_id,response_row.id,1,p_evidence,'deterministic-v1','masarifi');
    update public.assistant_conversations set last_message_at=response_row.created_at
      where id=p_conversation_id;
    perform private.enqueue_outbox_event(
      'assistant.response_ready.v1','assistant-message',response_row.id,
      jsonb_build_object(
        'conversationId',p_conversation_id,'messageId',response_row.id,
        'hasPreview',false,'schemaVersion',1,'occurredAt',clock_timestamp()
      )
    );
  end if;
  return to_jsonb(request_row)-array[
    'user_id','claim_token','claimed_by','lease_until','context_scope','context_payload',
    'evidence_payload','history_payload'
  ];
end $$;
alter function private.save_deterministic_assistant_message(text,uuid,text,text,text,jsonb,jsonb,text,uuid) owner to masarifi_migration;
revoke all on function private.save_deterministic_assistant_message(text,uuid,text,text,text,jsonb,jsonb,text,uuid) from public;

create function private.get_assistant_work_input_v2(p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',m.id,
    'operationId',m.operation_id,
    'content',m.content_redacted,
    'intent',m.intent,
    'contextPayload',m.context_payload,
    'historyPayload',m.history_payload,
    'evidence',m.evidence_payload,
    'aliases',coalesce((select jsonb_agg(reference order by reference->>'alias') from (
      select jsonb_build_object(
        'alias','ACCOUNT-'||a.ordinality,'kind','account','id',a.id,'version',a.version,
        'data',jsonb_build_object('currency',btrim(a.currency_code::text),'type',a.type,'isDefault',a.is_default)
      ) reference
      from (
        select a.*,row_number() over(order by a.is_default desc,a.sort_order,a.id) ordinality
        from public.accounts a where a.user_id=m.user_id and a.status='active' and a.deleted_at is null
      ) a where a.ordinality<=10 and m.intent in ('create_transaction','update_transaction','create_savings_goal')
      union all
      select jsonb_build_object(
        'alias','CATEGORY-'||c.ordinality,'kind','category','id',c.id,'version',c.version,
        'data',jsonb_build_object('kind',c.kind,'labelAr',c.label_ar,'labelEn',c.label_en)
      )
      from (
        select c.*,row_number() over(order by c.user_id nulls first,c.sort_order,c.id) ordinality
        from public.categories c
        where c.active and c.deleted_at is null and (c.user_id is null or c.user_id=m.user_id)
      ) c where c.ordinality<=20 and m.intent in ('create_transaction','update_transaction','update_budget')
      union all
      select jsonb_build_object(
        'alias','TRANSACTION-'||t.ordinality,'kind','transaction','id',t.id,'version',t.version,
        'data',jsonb_build_object('kind',t.kind,'amountMinor',t.amount_minor::text,'currency',btrim(t.currency_code::text),'occurredAt',t.occurred_at)
      )
      from (
        select t.*,row_number() over(order by t.occurred_at desc,t.id) ordinality
        from public.transactions t where t.user_id=m.user_id and t.deleted_at is null
      ) t where t.ordinality<=20 and m.intent='update_transaction'
      union all
      select jsonb_build_object(
        'alias','BUDGET-'||b.ordinality,'kind','budget','id',b.id,'version',b.version,
        'data',jsonb_build_object('name',b.name,'currency',btrim(b.currency_code::text),'periodStart',b.period_start,'periodEnd',b.period_end)
      )
      from (
        select b.*,row_number() over(order by b.period_start desc,b.id) ordinality
        from public.budgets b where b.user_id=m.user_id and b.deleted_at is null
      ) b where b.ordinality<=10 and m.intent='update_budget'
      union all
      select jsonb_build_object(
        'alias','OBLIGATION-'||o.ordinality,'kind','obligation','id',o.id,'version',o.version,
        'data',jsonb_build_object('name',o.name,'currency',btrim(o.currency_code::text),'direction',o.direction,'status',o.status)
      )
      from (
        select o.*,row_number() over(order by o.created_at desc,o.id) ordinality
        from public.obligations o where o.user_id=m.user_id and o.deleted_at is null
      ) o where o.ordinality<=10 and m.intent='record_obligation_payment'
      union all
      select jsonb_build_object(
        'alias','REVIEW-'||r.ordinality,'kind','review','id',r.id,'version',r.version,
        'data',jsonb_build_object('reason',r.reason,'status',r.status)
      )
      from (
        select r.*,row_number() over(order by r.created_at desc,r.id) ordinality
        from public.review_items r where r.user_id=m.user_id and r.status='pending'
      ) r where r.ordinality<=10 and m.intent='resolve_tracking_review'
    ) aliases),'[]'::jsonb)
  ) into result
  from public.assistant_messages m
  where m.id=p_id and m.claim_token=p_claim_token and m.work_status='processing'
    and m.lease_until>clock_timestamp()
    and exists(select 1 from public.assistant_consents c where c.user_id=m.user_id and c.revoked_at is null);
  if result is null then raise exception using errcode='40001',message='AI_WORK_FENCE_INVALID'; end if;
  return result;
end $$;
alter function private.get_assistant_work_input_v2(uuid,uuid) owner to masarifi_migration;
revoke all on function private.get_assistant_work_input_v2(uuid,uuid) from public;

create table public.financial_insights (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete cascade,
  signal_key text not null check(char_length(signal_key) between 3 and 160),
  kind text not null check(kind in ('budget_threshold')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=4096),
  source_version bigint not null check(source_version>=0),
  status text not null default 'active' check(status in ('active','dismissed','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(user_id,signal_key,source_version),
  check(expires_at>created_at)
);
alter table public.financial_insights owner to masarifi_migration;
create index financial_insights_owner_active_idx
  on public.financial_insights(user_id,created_at desc,id desc) where status='active';
alter table public.financial_insights enable row level security;
alter table public.financial_insights force row level security;
create policy financial_insights_owner_select on public.financial_insights for select to masarifi_api
  using(user_id=public.current_clerk_user_id());
create policy financial_insights_worker_all on public.financial_insights for all to masarifi_worker
  using(true) with check(true);
create policy financial_insights_migration_all on public.financial_insights for all to masarifi_migration
  using(true) with check(true);
grant select on public.financial_insights to masarifi_api;
grant select,insert,update on public.financial_insights to masarifi_worker;

create function private.refresh_financial_insights(p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='AI_LIMIT_INVALID';
  end if;
  insert into public.financial_insights(
    user_id,signal_key,kind,payload,source_version,expires_at
  )
  select b.user_id,'budget:'||b.id::text||':85','budget_threshold',jsonb_build_object(
      'budgetName',b.name,
      'currency',btrim(b.currency_code::text),
      'budgetMinor',b.total_minor::text,
      'spentMinor',coalesce(sum(u.spent_minor),0)::text,
      'remainingMinor',(b.total_minor-coalesce(sum(u.spent_minor),0))::text,
      'utilizationBps',case when b.total_minor=0 then 10000
        else ((coalesce(sum(u.spent_minor),0)*10000)/b.total_minor)::integer end
    ),coalesce(max(u.ledger_version),0),clock_timestamp()+interval '14 days'
  from public.budgets b
  left join public.v_budget_utilization u on u.budget_id=b.id
  where b.status='active' and b.deleted_at is null and b.period_end>=current_date
  group by b.id
  having case when b.total_minor=0 then true
    else coalesce(sum(u.spent_minor),0)*10000/b.total_minor>=8500 end
  order by coalesce(max(u.ledger_version),0) desc,b.id
  limit p_limit
  on conflict(user_id,signal_key,source_version) do nothing;
  get diagnostics changed=row_count;
  update public.financial_insights set status='expired'
    where status='active' and expires_at<=clock_timestamp();
  return changed;
end $$;
alter function private.refresh_financial_insights(integer) owner to masarifi_migration;
revoke all on function private.refresh_financial_insights(integer) from public;

create function private.list_financial_insights(p_user_id text,p_limit integer)
returns table(value jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  perform private.ai_assert_owner(p_user_id);
  if not exists(select 1 from public.assistant_consents where user_id=p_user_id and policy_version='assistant-privacy-v1' and revoked_at is null) then
    raise exception using errcode='42501',message='AI_CONSENT_REQUIRED';
  end if;
  if p_limit not between 1 and 50 then
    raise exception using errcode='22023',message='AI_LIMIT_INVALID';
  end if;
  return query select to_jsonb(i)-'user_id' from public.financial_insights i
    where i.user_id=p_user_id and i.status='active' and i.expires_at>clock_timestamp()
    order by i.created_at desc,i.id desc limit p_limit;
end $$;
alter function private.list_financial_insights(text,integer) owner to masarifi_migration;
revoke all on function private.list_financial_insights(text,integer) from public;

select private.register_job(
  'financial-insights.generate',9::smallint,'financial-insights.generate',
  '{"kind":"interval","everySeconds":900,"timezone":"UTC"}'::jsonb,
  true,120,3::smallint,'{}'::jsonb,true,true
);

insert into private.ai_prompt_versions(id,workload,version,template,schema_version,status)
values(
  '99030000-0000-4000-8000-000000000009',
  'financial_assistant',
  2,
  'You are Masarifi''s financial assistant. Stay within personal finance, spending, income, budgeting, saving, obligations, financial planning, and Masarifi-supported actions. Never invent financial facts or calculate authoritative totals. Use only the structured financial truth and aliases supplied by Masarifi. Refuse unrelated general-purpose tasks. Actions are proposals only; never claim execution before confirmed backend success. Do not use tools.',
  1,
  'draft'
) on conflict(workload,version) do nothing;

insert into private.system_settings(setting_key,value,sensitivity) values
  ('ai.user.rolling_limit','5','internal'),
  ('ai.user.rolling_hours','24','internal'),
  ('ai.global.monthly_budget','200.00000000','internal'),
  ('ai.assistant.history_turns','4','internal')
on conflict(setting_key) do nothing;

create function private.ai_history_turn_limit()
returns integer language sql stable security definer set search_path='' as $$
  select least(4,greatest(0,coalesce(
    (select (value#>>'{}')::integer from private.system_settings where setting_key='ai.assistant.history_turns'),4
  )))
$$;
alter function private.ai_history_turn_limit() owner to masarifi_migration;
revoke all on function private.ai_history_turn_limit() from public;
grant execute on function private.ai_history_turn_limit() to masarifi_api;

create or replace function private.reserve_ai_quota(p_user_id text,p_operation_id uuid,p_workload text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare used_count integer; first_time timestamptz; existing private.ai_usage_events%rowtype;
  route_row private.ai_feature_routes%rowtype; spent numeric; global_spent numeric; reservation numeric;
  budget numeric; global_budget numeric; percent integer; crossed smallint[]; threshold smallint;
  rolling_limit integer; rolling_hours integer; rolling_window interval;
begin
  perform private.ai_assert_owner(p_user_id);
  select coalesce((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.user.rolling_limit'),5),
    coalesce((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.user.rolling_hours'),24),
    coalesce((select (value#>>'{}')::numeric from private.system_settings where setting_key='ai.global.monthly_budget'),200)
    into rolling_limit,rolling_hours,global_budget;
  if rolling_limit not between 1 and 1000 or rolling_hours not between 1 and 720 or global_budget<=0 then
    raise exception using errcode='55000',message='AI_QUOTA_CONFIG_INVALID';
  end if;
  rolling_window:=make_interval(hours=>rolling_hours);
  select * into existing from private.ai_usage_events where request_id=p_operation_id::text;
  if found then
    select count(*),min(created_at) into used_count,first_time from private.ai_usage_events
      where user_id=p_user_id and created_at>clock_timestamp()-rolling_window and reservation_status<>'released';
    return jsonb_build_object('allowed',true,'limit',rolling_limit,'used',used_count,
      'resetsAt',coalesce(first_time,clock_timestamp())+rolling_window,'replayed',true);
  end if;
  if p_workload not in ('voice_transcription','financial_assistant','transaction_classification') then
    raise exception using errcode='22023',message='AI_WORKLOAD_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-quota:'||p_user_id,0));
  perform pg_advisory_xact_lock(hashtextextended('ai-budget:global:'||date_trunc('month',current_date)::date,0));
  perform pg_advisory_xact_lock(hashtextextended('ai-budget:'||p_workload||':'||date_trunc('month',current_date)::date,0));
  select count(*),min(created_at) into used_count,first_time from private.ai_usage_events
    where user_id=p_user_id and created_at>clock_timestamp()-rolling_window and reservation_status<>'released';
  if used_count>=rolling_limit then
    return jsonb_build_object('allowed',false,'limit',rolling_limit,'used',used_count,
      'resetsAt',coalesce(first_time,clock_timestamp())+rolling_window,'replayed',false);
  end if;
  select * into route_row from private.ai_feature_routes where workload=p_workload and deleted_at is null;
  if not found then raise exception using errcode='55000',message='AI_ROUTE_UNAVAILABLE'; end if;
  budget:=(route_row.limits->>'monthlyBudget')::numeric;
  reservation:=((route_row.limits->>'inputTokens')::numeric*(route_row.max_price->>'prompt')::numeric)
    +((route_row.limits->>'outputTokens')::numeric*(route_row.max_price->>'completion')::numeric);
  select coalesce(sum(estimated_cost),0) into spent from private.ai_usage_events
    where workload=p_workload and budget_period=date_trunc('month',current_date)::date and reservation_status in ('reserved','completed','failed');
  select coalesce(sum(estimated_cost),0) into global_spent from private.ai_usage_events
    where budget_period=date_trunc('month',current_date)::date and reservation_status in ('reserved','completed','failed');
  if budget<=0 or spent+reservation>=budget or global_spent+reservation>=global_budget then
    return jsonb_build_object('allowed',false,'limit',rolling_limit,'used',used_count,
      'resetsAt',coalesce(first_time,clock_timestamp())+rolling_window,'replayed',false,'reason','AI_BUDGET_EXHAUSTED');
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
  return jsonb_build_object('allowed',true,'limit',rolling_limit,'used',used_count+1,
    'resetsAt',coalesce(first_time,clock_timestamp())+rolling_window,'replayed',false,'reservedCost',reservation);
end $$;

create or replace function private.get_assistant_availability(p_user_id text,p_policy_version text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare used_count integer; first_used_at timestamptz; consented boolean; available boolean;
  rolling_limit integer; rolling_hours integer; rolling_window interval;
begin
  perform private.ai_assert_owner(p_user_id);
  select coalesce((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.user.rolling_limit'),5),
    coalesce((select (value#>>'{}')::integer from private.system_settings where setting_key='ai.user.rolling_hours'),24)
    into rolling_limit,rolling_hours;
  rolling_window:=make_interval(hours=>rolling_hours);
  select exists(select 1 from public.assistant_consents where user_id=p_user_id and policy_version=p_policy_version and revoked_at is null) into consented;
  select count(*),min(created_at) into used_count,first_used_at from private.ai_usage_events
    where user_id=p_user_id and created_at>statement_timestamp()-rolling_window and reservation_status<>'released';
  available:=private.ai_workload_available('financial_assistant');
  return jsonb_build_object(
    'status',case when not consented or not available then 'disabled' when used_count>=rolling_limit then 'limit_reached' else 'available' end,
    'limit',rolling_limit,'used',used_count,'remaining',greatest(0,rolling_limit-used_count),
    'resetsAt',coalesce(first_used_at,statement_timestamp())+rolling_window
  );
end $$;

reset role;
revoke masarifi_migration from current_user;
