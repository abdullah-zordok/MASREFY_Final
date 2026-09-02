grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create table private.planning_job_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  job_name text not null,
  resource_id uuid not null,
  natural_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  lease_token uuid,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_job_claims_job_check check(job_name in (
    'planning.salary-cycle.generate','planning.obligation-schedule.generate',
    'planning.payment-match.propose','planning.overdue.mark','planning.reminders.emit'
  )),
  constraint planning_job_claims_natural_key_check check(char_length(natural_key) between 1 and 200),
  constraint planning_job_claims_status_check check(status in ('pending','running','completed','failed','exhausted')),
  constraint planning_job_claims_attempt_check check(attempt_count between 0 and 8),
  constraint planning_job_claims_lease_check check(
    (status='running' and locked_by is not null and locked_until is not null and lease_token is not null)
    or (status<>'running' and locked_by is null and locked_until is null and lease_token is null)
  ),
  constraint planning_job_claims_result_check check(result is null or (jsonb_typeof(result)='object' and pg_column_size(result)<=4096)),
  constraint planning_job_claims_error_check check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
);
alter table private.planning_job_claims owner to masarifi_migration;
alter table private.planning_job_claims enable row level security;
alter table private.planning_job_claims force row level security;
create unique index planning_job_claims_natural_key_uq on private.planning_job_claims(job_name,natural_key);
create index planning_job_claims_due_idx on private.planning_job_claims(job_name,status,available_at,resource_id)
  where status in ('pending','failed','running');

create table private.planning_reminder_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  due_at timestamptz not null,
  reason_code text not null,
  created_at timestamptz not null default now(),
  constraint planning_reminder_intents_resource_check check(resource_type in ('salary_profile','obligation','savings_goal')),
  constraint planning_reminder_intents_reason_check check(reason_code ~ '^[a-z][a-z0-9_.-]{1,63}$')
);
alter table private.planning_reminder_intents owner to masarifi_migration;
alter table private.planning_reminder_intents enable row level security;
alter table private.planning_reminder_intents force row level security;
create unique index planning_reminder_intents_natural_key_uq on private.planning_reminder_intents(resource_type,resource_id,due_at,reason_code);

create view public.v_salary_cycle_summary with (security_invoker=true) as
select p.id salary_profile_id,p.user_id,
  receipt.id salary_receipt_id,
  date_trunc('month',clock_timestamp()) cycle_start,
  receipt.expected_at next_expected_at,
  coalesce((select sum(t.amount_minor) from public.transactions t
    where t.user_id=p.user_id and t.kind='income' and t.status='confirmed'
      and t.currency_code=p.currency_code and t.occurred_at>=date_trunc('month',clock_timestamp())
      and t.occurred_at<date_trunc('month',clock_timestamp())+interval '1 month'),0)::bigint actual_income_minor,
  coalesce((select sum(t.amount_minor) from public.transactions t
    where t.user_id=p.user_id and t.kind='expense' and t.status='confirmed'
      and t.currency_code=p.currency_code and t.occurred_at>=date_trunc('month',clock_timestamp())
      and t.occurred_at<date_trunc('month',clock_timestamp())+interval '1 month'),0)::bigint actual_expense_minor,
  coalesce((select sum(greatest(i.amount_minor-i.paid_minor,0)) from public.obligation_schedule_items i
    join public.obligations o on o.id=i.obligation_id
    where i.user_id=p.user_id and o.currency_code=p.currency_code
      and i.status in ('due','partial','overdue')
      and i.due_at<date_trunc('month',clock_timestamp())+interval '1 month'),0)::bigint reserved_obligation_minor,
  p.status salary_state,
  coalesce((select max(b.ledger_version) from public.account_balances b
    join public.accounts a on a.id=b.account_id where a.user_id=p.user_id),0)::bigint ledger_version
from public.salary_profiles p
left join lateral (
  select r.id,r.expected_at from public.salary_receipts r
  where r.salary_profile_id=p.id and r.status in ('expected','received','corrected')
  order by r.expected_at desc,r.id desc limit 1
) receipt on true
where p.status<>'archived';
alter view public.v_salary_cycle_summary owner to masarifi_migration;

create view public.v_budget_utilization with (security_invoker=true) as
select b.id budget_id,b.user_id,c.id budget_category_id,c.category_id,c.limit_minor,
  spend.spent_minor,
  c.limit_minor-spend.spent_minor remaining_minor,
  case when c.limit_minor=0 then null
    else round(10000.0*spend.spent_minor/c.limit_minor)::integer end utilization_bps,
  coalesce((select max(ab.ledger_version) from public.account_balances ab
    join public.accounts a on a.id=ab.account_id where a.user_id=b.user_id),0)::bigint ledger_version,
  case when spend.missing_rate then 'partial' else 'complete' end::text data_state,
  case when spend.missing_rate then 'missing_rate' else null end::text unavailable_reason
from public.budgets b join public.budget_categories c on c.budget_id=b.id
cross join lateral (
  select coalesce(sum(case when item.rate is null then 0
      when item.kind='expense' then round(item.amount_minor*item.rate)
      else -round(item.amount_minor*item.rate) end),0)::bigint spent_minor,
    coalesce(bool_or(item.rate is null),false) missing_rate
  from (
    select t.kind,t.amount_minor,
      case when t.currency_code=b.currency_code then 1::numeric
        else (select r.rate from public.exchange_rates r
          where r.base_currency=t.currency_code and r.quote_currency=b.currency_code
            and r.effective_at<=t.occurred_at and r.effective_at>=t.occurred_at-interval '30 days'
          order by r.effective_at desc,r.provider,r.id limit 1) end rate
    from public.transactions t
    left join public.transactions original
      on original.id=t.reverses_transaction_id and original.user_id=t.user_id
    where t.user_id=b.user_id and coalesce(t.category_id,original.category_id)=c.category_id
      and t.status='confirmed' and t.kind in ('expense','refund')
      and t.occurred_at>=b.period_start::timestamptz
      and t.occurred_at<(b.period_end+1)::timestamptz
  ) item
) spend
where b.status<>'deleted' and c.status<>'deleted';
alter view public.v_budget_utilization owner to masarifi_migration;

create view public.v_obligation_status with (security_invoker=true) as
select o.id obligation_id,o.user_id,o.direction,o.currency_code,
  coalesce((select sum(i.amount_minor) from public.obligation_schedule_items i where i.obligation_id=o.id),0)::bigint scheduled_minor,
  coalesce((select sum(a.amount_minor) from public.obligation_payment_allocations a
    join public.obligation_payments p on p.id=a.payment_id
    where p.obligation_id=o.id and p.status='confirmed'),0)::bigint allocated_minor,
  (o.opening_paid_minor+coalesce((select sum(p.amount_minor) from public.obligation_payments p
    where p.obligation_id=o.id and p.status='confirmed'),0))::bigint paid_minor,
  greatest(o.principal_minor-o.opening_paid_minor-coalesce((select sum(p.amount_minor) from public.obligation_payments p
    where p.obligation_id=o.id and p.status='confirmed'),0),0)::bigint remaining_minor,
  coalesce((select sum(i.amount_minor-i.paid_minor) from public.obligation_schedule_items i
    where i.obligation_id=o.id and i.status='overdue'),0)::bigint overdue_minor,
  (select min(i.due_at) from public.obligation_schedule_items i
    where i.obligation_id=o.id and i.status in ('due','partial','overdue')) next_due_at,
  (select count(*)::integer from public.obligation_schedule_items i where i.obligation_id=o.id and i.status='paid') completed_installment_count,
  o.status,
  coalesce((select max(ab.ledger_version) from public.account_balances ab
    join public.accounts a on a.id=ab.account_id where a.user_id=o.user_id),0)::bigint ledger_version
from public.obligations o where o.status<>'archived';
alter view public.v_obligation_status owner to masarifi_migration;

create function private.attach_planning_sync_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
declare owner_id text;resource_type text;sync_operation text;resource_version bigint;
  resource_snapshot jsonb;deleted_at timestamptz;next_cursor bigint;
begin
  if new.payload?'sync' or new.aggregate_type not in ('salary-profile','salary-receipt','budget','obligation',
    'obligation-schedule','obligation-payment','payment-match','savings-goal','savings-movement') then return new; end if;
  resource_type=new.aggregate_type;
  if resource_type='salary-profile' then
    select p.user_id,p.version,(to_jsonb(p)-'user_id')||jsonb_build_object('amount_minor',p.amount_minor::text),p.deleted_at
      into owner_id,resource_version,resource_snapshot,deleted_at from public.salary_profiles p where p.id=new.aggregate_id;
  elsif resource_type='salary-receipt' then
    select r.user_id,r.version,(to_jsonb(r)-'user_id')||jsonb_build_object('amount_minor',r.amount_minor::text),null
      into owner_id,resource_version,resource_snapshot,deleted_at from public.salary_receipts r where r.id=new.aggregate_id;
  elsif resource_type='budget' then
    select b.user_id,b.version,(to_jsonb(b)-'user_id')||jsonb_build_object('total_minor',b.total_minor::text,
      'income_target_minor',b.income_target_minor::text,'savings_target_minor',b.savings_target_minor::text,
      'rollover_minor',b.rollover_minor::text,'categories',coalesce((select jsonb_agg((to_jsonb(c)-'user_id')||
        jsonb_build_object('limit_minor',c.limit_minor::text,'rollover_minor',c.rollover_minor::text) order by c.id)
        from public.budget_categories c where c.budget_id=b.id),'[]'::jsonb)),b.deleted_at
      into owner_id,resource_version,resource_snapshot,deleted_at from public.budgets b where b.id=new.aggregate_id;
  elsif resource_type='obligation' then
    select o.user_id,o.version,(to_jsonb(o)-'user_id')||jsonb_build_object('principal_minor',o.principal_minor::text,
      'opening_paid_minor',o.opening_paid_minor::text,'installment_amount_minor',case when o.installment_amount_minor is null then null else o.installment_amount_minor::text end),o.deleted_at
      into owner_id,resource_version,resource_snapshot,deleted_at from public.obligations o where o.id=new.aggregate_id;
  elsif resource_type='obligation-schedule' then
    select i.user_id,i.version,(to_jsonb(i)-'user_id')||jsonb_build_object('amount_minor',i.amount_minor::text,
      'paid_minor',i.paid_minor::text),null into owner_id,resource_version,resource_snapshot,deleted_at
      from public.obligation_schedule_items i where i.id=new.aggregate_id;
  elsif resource_type='obligation-payment' then
    select p.user_id,p.version,(to_jsonb(p)-'user_id')||jsonb_build_object('amount_minor',p.amount_minor::text,
      'principal_reduction_minor',p.principal_reduction_minor::text,'settlement_adjustment_minor',p.settlement_adjustment_minor::text,
      'allocations',coalesce((select jsonb_agg((to_jsonb(a)-'user_id')||jsonb_build_object('amount_minor',a.amount_minor::text) order by a.id)
        from public.obligation_payment_allocations a where a.payment_id=p.id),'[]'::jsonb)),null
      into owner_id,resource_version,resource_snapshot,deleted_at from public.obligation_payments p where p.id=new.aggregate_id;
  elsif resource_type='payment-match' then
    select m.user_id,m.version,jsonb_build_object('id',m.id,'transaction_id',m.transaction_id,'obligation_id',m.obligation_id,
      'schedule_item_id',m.schedule_item_id,'confidence',m.confidence,'status',m.status,'reviewed_at',m.reviewed_at,
      'created_at',m.created_at,'updated_at',m.updated_at,'version',m.version),null
      into owner_id,resource_version,resource_snapshot,deleted_at from public.payment_matches m where m.id=new.aggregate_id;
  elsif resource_type='savings-goal' then
    select g.user_id,g.version,(to_jsonb(g)-'user_id')||jsonb_build_object('target_minor',g.target_minor::text,
      'opening_tracked_minor',g.opening_tracked_minor::text),g.deleted_at
      into owner_id,resource_version,resource_snapshot,deleted_at from public.savings_goals g where g.id=new.aggregate_id;
  else
    select m.user_id,1,(to_jsonb(m)-'user_id')||jsonb_build_object('amount_minor',m.amount_minor::text,'version',1),null
      into owner_id,resource_version,resource_snapshot,deleted_at from public.savings_goal_movements m where m.id=new.aggregate_id;
  end if;
  if owner_id is null or resource_snapshot is null then return new; end if;
  sync_operation=case when new.event_type in ('planning.salary_profile_archived','planning.salary_receipt_undone',
    'planning.budget_deleted','planning.obligation_archived','planning.obligation_payment_reversed','planning.savings_goal_deleted')
    then 'delete' else 'upsert' end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id||chr(31)||'planning',0));
  select coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0)+1 into next_cursor from private.outbox_events o
    where o.payload?'sync' and o.payload#>>'{sync,userId}'=owner_id and o.payload#>>'{sync,domain}'='planning';
  new.payload=new.payload||jsonb_build_object('sync',jsonb_strip_nulls(jsonb_build_object('userId',owner_id,
    'domain','planning','cursor',next_cursor,'resourceId',new.aggregate_id,'resourceType',resource_type,
    'operation',sync_operation,'version',resource_version,'snapshot',case when sync_operation='upsert' then resource_snapshot else null end,
    'deletedAt',case when sync_operation='delete' then coalesce(deleted_at,clock_timestamp()) else null end)));
  return new;
end $$;
alter function private.attach_planning_sync_metadata() owner to masarifi_migration;
revoke all on function private.attach_planning_sync_metadata() from public;
create trigger planning_outbox_sync_metadata before insert on private.outbox_events
for each row execute function private.attach_planning_sync_metadata();

create or replace function private.get_sync_bounds(p_user_id text,p_domain text)
returns table(oldest bigint,current_cursor bigint)
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if p_domain not in ('accounts','categories','transactions','planning') then
    raise exception using errcode='22023',message='SYNC_DOMAIN_INVALID';
  end if;
  return query select coalesce(min((o.payload#>>'{sync,cursor}')::bigint),0),
    coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0)
  from private.outbox_events o where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain;
end $$;

create or replace function private.get_sync_delta(p_user_id text,p_domain text,p_after bigint,p_limit integer)
returns table("position" bigint,resource_id text,resource_type text,operation text,
  resource_version bigint,snapshot jsonb,deleted_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if p_domain not in ('accounts','categories','transactions','planning') or p_after<0 or p_limit not between 1 and 501 then
    raise exception using errcode='22023',message='SYNC_DELTA_INVALID';
  end if;
  return query select (o.payload#>>'{sync,cursor}')::bigint,o.payload#>>'{sync,resourceId}',
    o.payload#>>'{sync,resourceType}',o.payload#>>'{sync,operation}',
    (o.payload#>>'{sync,version}')::bigint,o.payload#>'{sync,snapshot}',
    (o.payload#>>'{sync,deletedAt}')::timestamptz
  from private.outbox_events o where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain
    and (o.payload#>>'{sync,cursor}')::bigint>p_after
  order by (o.payload#>>'{sync,cursor}')::bigint,o.id limit p_limit;
end $$;

create or replace function private.receive_client_mutation(
  p_user_id text,p_device_id uuid,p_factor_age_seconds integer,p_operation_id uuid,p_domain text,
  p_resource_type text,p_schema_version integer,p_depends_on uuid[],p_operation text,
  p_resource_id text,p_base_version bigint,p_payload_hash text,p_payload jsonb
) returns table(outcome text,mutation_id uuid,status text,result jsonb,error jsonb)
language plpgsql security definer set search_path='' as $$
declare existing public.client_mutations;inserted_id uuid;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_operation_id is null or p_domain not in ('accounts','categories','transactions','planning')
    or not ((p_domain='accounts' and p_resource_type='account')
      or (p_domain='categories' and p_resource_type='category')
      or (p_domain='transactions' and p_resource_type='transaction')
      or (p_domain='planning' and p_resource_type in ('salary-profile','salary-receipt','budget','budget-category',
        'obligation','obligation-schedule','obligation-payment','payment-match','savings-goal','savings-movement')))
    or p_schema_version<>1 or p_depends_on is null or cardinality(p_depends_on)>100
    or array_position(p_depends_on,null) is not null or p_operation_id=any(p_depends_on)
    or exists(select 1 from unnest(p_depends_on) d group by d having count(*)>1)
    or exists(select 1 from unnest(p_depends_on) d where not exists(
      select 1 from public.client_mutations dependency where dependency.user_id=p_user_id and dependency.operation_id=d))
    or p_operation not in ('create','update','archive','restore','delete')
    or (p_resource_id is not null and (p_resource_id<>btrim(p_resource_id)
      or char_length(p_resource_id) not between 1 and 128 or p_resource_id~'[[:cntrl:]]'))
    or (p_base_version is not null and p_base_version<0)
    or (p_factor_age_seconds is not null and p_factor_age_seconds<0)
    or p_payload_hash is null or p_payload_hash!~'^sha256:[0-9a-f]{64}$'
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>65536 then
    raise exception using errcode='22023',message='SYNC_MUTATION_INVALID';
  end if;
  insert into public.client_mutations(user_id,device_id,factor_age_seconds,operation_id,domain,resource_type,
    schema_version,depends_on,operation,resource_id,base_version,payload_hash,payload)
  values(p_user_id,p_device_id,p_factor_age_seconds,p_operation_id,p_domain,p_resource_type,p_schema_version,
    p_depends_on,p_operation,p_resource_id,p_base_version,p_payload_hash,p_payload)
  on conflict(user_id,operation_id) do nothing returning id into inserted_id;
  if inserted_id is not null then
    return query select 'received'::text,inserted_id,'received'::text,null::jsonb,null::jsonb;return;
  end if;
  select * into existing from public.client_mutations m where m.user_id=p_user_id and m.operation_id=p_operation_id;
  if existing.payload_hash<>p_payload_hash then
    return query select 'hash_mismatch'::text,existing.id,existing.status,existing.result,existing.error;
  else return query select 'replay'::text,existing.id,existing.status,existing.result,existing.error;end if;
end $$;

create or replace function private.record_sync_cursor_issued(
  p_user_id text,p_device_id uuid,p_domain text,p_cursor bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare issued bigint;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_domain not in ('accounts','categories','transactions','planning') or p_cursor is null or p_cursor<0 then
    raise exception using errcode='22023',message='SYNC_CURSOR_INVALID';
  end if;
  insert into public.client_sync_state(user_id,device_id,domain,last_issued_cursor)
  values(p_user_id,p_device_id,p_domain,p_cursor)
  on conflict(user_id,device_id,domain) do update set
    last_issued_cursor=greatest(public.client_sync_state.last_issued_cursor,excluded.last_issued_cursor),
    updated_at=clock_timestamp()
  returning last_issued_cursor into issued;
  return issued;
end $$;

create or replace function private.ack_client_sync_cursor(
  p_user_id text,p_device_id uuid,p_domain text,p_cursor bigint,p_last_mutation uuid
) returns table(last_cursor bigint,last_synced_at timestamptz,last_ack_mutation uuid)
language plpgsql security definer set search_path='' as $$
declare server_cursor bigint;checkpoint public.client_sync_state;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_domain not in ('accounts','categories','transactions','planning') or p_cursor is null or p_cursor<0 then
    raise exception using errcode='22023',message='SYNC_CURSOR_INVALID';
  end if;
  select coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0) into server_cursor
    from private.outbox_events o where o.payload?'sync' and o.payload#>>'{sync,userId}'=p_user_id
      and o.payload#>>'{sync,domain}'=p_domain;
  if p_cursor>server_cursor then raise exception using errcode='P0001',message='SYNC_CURSOR_AHEAD'; end if;
  if p_cursor>coalesce((select s.last_issued_cursor from public.client_sync_state s
    where s.user_id=p_user_id and s.device_id=p_device_id and s.domain=p_domain),0) then
    raise exception using errcode='P0001',message='SYNC_CURSOR_NOT_ISSUED';
  end if;
  if p_last_mutation is not null and not exists(select 1 from public.client_mutations m
    where m.id=p_last_mutation and m.user_id=p_user_id and m.device_id=p_device_id
      and m.domain=p_domain and m.status in ('applied','conflict','rejected')) then
    raise exception using errcode='P0001',message='SYNC_MUTATION_NOT_FOUND';
  end if;
  insert into public.client_sync_state(user_id,device_id,domain,last_cursor,last_issued_cursor,last_synced_at,last_ack_mutation)
  values(p_user_id,p_device_id,p_domain,p_cursor,p_cursor,clock_timestamp(),p_last_mutation)
  on conflict(user_id,device_id,domain) do update set
    last_cursor=greatest(public.client_sync_state.last_cursor,excluded.last_cursor),
    last_synced_at=excluded.last_synced_at,
    last_ack_mutation=coalesce(excluded.last_ack_mutation,public.client_sync_state.last_ack_mutation),
    updated_at=clock_timestamp() returning * into checkpoint;
  return query select checkpoint.last_cursor,checkpoint.last_synced_at,checkpoint.last_ack_mutation;
end $$;

create function private.save_salary_profile(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation'; profile public.salary_profiles; patch jsonb;
  profile_id uuid; request_id text:=p_body->>'requestId'; event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>8192
    or operation not in ('create','update','archive')
    or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;

  if operation='create' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','operationId','requestId','name','amountMinor','currencyCode',
      'frequency','expectedDay','customIntervalDays','accountId','automaticDetectionEnabled'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    profile_id:=(p_body->>'profileId')::uuid;
    if not exists(select 1 from public.currencies c where c.code=(p_body->>'currencyCode')::char(3) and c.enabled)
      or ((p_body->>'accountId') is not null and not exists(
        select 1 from public.accounts a where a.id=(p_body->>'accountId')::uuid
          and a.user_id=p_user_id and a.status='active' and a.currency_code=(p_body->>'currencyCode')::char(3)
      )) then raise exception using errcode='P0001',message='SALARY_REFERENCE_INVALID'; end if;
    insert into public.salary_profiles(
      id,user_id,name,amount_minor,currency_code,frequency,expected_day,custom_interval_days,
      account_id,automatic_detection_enabled
    ) values(
      profile_id,p_user_id,p_body->>'name',(p_body->>'amountMinor')::bigint,
      (p_body->>'currencyCode')::char(3),p_body->>'frequency',(p_body->>'expectedDay')::smallint,
      (p_body->>'customIntervalDays')::smallint,(p_body->>'accountId')::uuid,
      coalesce((p_body->>'automaticDetectionEnabled')::boolean,false)
    ) returning * into profile;
    event_type='planning.salary_profile_created';
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','operationId','requestId','expectedVersion','patch'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    profile_id:=(p_body->>'profileId')::uuid;
    select * into profile from public.salary_profiles p where p.id=profile_id and p.user_id=p_user_id for update;
    if profile.id is null then raise exception using errcode='P0001',message='SALARY_PROFILE_NOT_FOUND'; end if;
    if profile.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=profile.version::text;
    end if;
    if profile.status='archived' then raise exception using errcode='P0001',message='SALARY_PROFILE_INELIGIBLE'; end if;
    patch:=case when operation='archive' then jsonb_build_object('status','archived') else p_body->'patch' end;
    if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb
      or exists(select 1 from jsonb_object_keys(patch) key where key not in (
        'name','amountMinor','currencyCode','frequency','expectedDay','customIntervalDays',
        'accountId','automaticDetectionEnabled','status'
      )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    if patch ? 'currencyCode' and not exists(select 1 from public.currencies c where c.code=(patch->>'currencyCode')::char(3) and c.enabled) then
      raise exception using errcode='P0001',message='SALARY_REFERENCE_INVALID';
    end if;
    update public.salary_profiles p set
      name=case when patch?'name' then patch->>'name' else p.name end,
      amount_minor=case when patch?'amountMinor' then (patch->>'amountMinor')::bigint else p.amount_minor end,
      currency_code=case when patch?'currencyCode' then (patch->>'currencyCode')::char(3) else p.currency_code end,
      frequency=case when patch?'frequency' then patch->>'frequency' else p.frequency end,
      expected_day=case when patch?'expectedDay' then (patch->>'expectedDay')::smallint else p.expected_day end,
      custom_interval_days=case when patch?'customIntervalDays' then (patch->>'customIntervalDays')::smallint else p.custom_interval_days end,
      account_id=case when patch?'accountId' then (patch->>'accountId')::uuid else p.account_id end,
      automatic_detection_enabled=case when patch?'automaticDetectionEnabled' then (patch->>'automaticDetectionEnabled')::boolean else p.automatic_detection_enabled end,
      status=case when patch?'status' then patch->>'status' else p.status end,
      deleted_at=case when patch->>'status'='archived' then clock_timestamp() else null end
    where p.id=profile_id returning * into profile;
    if profile.account_id is not null and not exists(
      select 1 from public.accounts a where a.id=profile.account_id and a.user_id=p_user_id
        and a.status='active' and a.currency_code=profile.currency_code
    ) then raise exception using errcode='P0001',message='SALARY_REFERENCE_INVALID'; end if;
    event_type=case when profile.status='archived' then 'planning.salary_profile_archived' else 'planning.salary_profile_updated' end;
  end if;

  perform private.enqueue_outbox_event(event_type,'salary-profile',profile.id,jsonb_build_object(
    'profileId',profile.id,'userId',p_user_id,'version',profile.version,'status',profile.status,
    'currencyCode',profile.currency_code,'occurredAt',clock_timestamp(),'requestId',request_id
  ));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'salary_profile',profile.id::text,
    null,null,null,request_id,jsonb_build_object('version',profile.version,'status',profile.status));
  return jsonb_build_object(
    'id',profile.id,'name',profile.name,'amountMinor',profile.amount_minor::text,
    'currencyCode',profile.currency_code,'frequency',profile.frequency,'expectedDay',profile.expected_day,
    'customIntervalDays',profile.custom_interval_days,'accountId',profile.account_id,
    'automaticDetectionEnabled',profile.automatic_detection_enabled,'status',profile.status,
    'deletedAt',profile.deleted_at,'createdAt',profile.created_at,'updatedAt',profile.updated_at,
    'version',profile.version
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;

create function private.link_salary_receipt(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation'; profile public.salary_profiles; receipt public.salary_receipts;
  transaction_row public.transactions; request_id text:=p_body->>'requestId'; event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>4096
    or operation not in ('link','unlink') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select * into profile from public.salary_profiles p
  where p.id=(p_body->>'profileId')::uuid and p.user_id=p_user_id for update;
  if profile.id is null or profile.status='archived' then raise exception using errcode='P0001',message='SALARY_PROFILE_NOT_FOUND'; end if;

  if operation='link' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','transactionId','expectedAt','replacesReceiptId','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into receipt from public.salary_receipts r
    where r.salary_profile_id=profile.id and r.user_id=p_user_id
      and r.expected_at=(p_body->>'expectedAt')::timestamptz for update;
    if receipt.id is null or receipt.status not in ('expected','missed','ignored') then
      raise exception using errcode='P0001',message='SALARY_RECEIPT_NOT_FOUND';
    end if;
    select * into transaction_row from public.transactions t
    where t.id=(p_body->>'transactionId')::uuid and t.user_id=p_user_id for update;
    if transaction_row.id is null or transaction_row.kind<>'income' or transaction_row.status<>'confirmed'
      or transaction_row.currency_code<>profile.currency_code then
      raise exception using errcode='P0001',message='SALARY_TRANSACTION_INVALID';
    end if;
    update public.salary_receipts r set transaction_id=transaction_row.id,
      received_at=transaction_row.occurred_at,amount_minor=transaction_row.amount_minor,
      status=case when (p_body->>'replacesReceiptId') is null then 'received' else 'corrected' end,
      operation_id=(p_body->>'operationId')::uuid,
      replaces_receipt_id=(p_body->>'replacesReceiptId')::uuid
    where r.id=receipt.id returning * into receipt;
    event_type=case when receipt.status='corrected' then 'planning.salary_receipt_corrected' else 'planning.salary_receipt_received' end;
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','receiptId','expectedVersion','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into receipt from public.salary_receipts r
    where r.id=(p_body->>'receiptId')::uuid and r.salary_profile_id=profile.id and r.user_id=p_user_id for update;
    if receipt.id is null then raise exception using errcode='P0001',message='SALARY_RECEIPT_NOT_FOUND'; end if;
    if receipt.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=receipt.version::text;
    end if;
    if receipt.status not in ('received','corrected') then raise exception using errcode='P0001',message='SALARY_RECEIPT_INELIGIBLE'; end if;
    update public.salary_receipts r set status='undone',received_at=null,operation_id=(p_body->>'operationId')::uuid
    where r.id=receipt.id returning * into receipt;
    event_type='planning.salary_receipt_undone';
  end if;

  perform private.enqueue_outbox_event(event_type,'salary-receipt',receipt.id,jsonb_build_object(
    'profileId',profile.id,'receiptId',receipt.id,'userId',p_user_id,'version',receipt.version,
    'status',receipt.status,'cycleDate',receipt.expected_at::date,'ledgerVersion',
    coalesce((select max(b.ledger_version) from public.account_balances b join public.accounts a on a.id=b.account_id where a.user_id=p_user_id),0),
    'occurredAt',clock_timestamp(),'requestId',request_id
  ));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'salary_receipt',receipt.id::text,
    null,null,null,request_id,jsonb_build_object('version',receipt.version,'status',receipt.status));
  return jsonb_build_object(
    'id',receipt.id,'salaryProfileId',receipt.salary_profile_id,'transactionId',receipt.transaction_id,
    'expectedAt',receipt.expected_at,'receivedAt',receipt.received_at,'amountMinor',receipt.amount_minor::text,
    'status',receipt.status,'operationId',receipt.operation_id,'replacesReceiptId',receipt.replaces_receipt_id,
    'createdAt',receipt.created_at,'updatedAt',receipt.updated_at,'version',receipt.version
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.save_budget(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation'; request_id text:=p_body->>'requestId';
  patch jsonb; budget public.budgets; source_budget public.budgets; next_status text; event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>8192
    or operation not in ('create','update','delete') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;

  if operation='create' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','budgetId','operationId','requestId','name','currencyCode','periodStart','periodEnd',
      'totalMinor','incomeTargetMinor','savingsTargetMinor','rolloverEnabled','rolloverMinor','copiedFromBudgetId'
    )) or not exists(select 1 from public.currencies c where c.code=(p_body->>'currencyCode')::char(3) and c.enabled) then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    if p_body->>'copiedFromBudgetId' is not null then
      select * into source_budget from public.budgets b
      where b.id=(p_body->>'copiedFromBudgetId')::uuid and b.user_id=p_user_id and b.status<>'deleted';
      if source_budget.id is null then raise exception using errcode='P0001',message='BUDGET_COPY_INVALID'; end if;
    end if;
    insert into public.budgets(
      id,user_id,name,currency_code,period_start,period_end,total_minor,income_target_minor,
      savings_target_minor,rollover_enabled,rollover_minor,copied_from_budget_id
    ) values(
      (p_body->>'budgetId')::uuid,p_user_id,p_body->>'name',(p_body->>'currencyCode')::char(3),
      (p_body->>'periodStart')::date,(p_body->>'periodEnd')::date,(p_body->>'totalMinor')::bigint,
      (p_body->>'incomeTargetMinor')::bigint,(p_body->>'savingsTargetMinor')::bigint,
      (p_body->>'rolloverEnabled')::boolean,(p_body->>'rolloverMinor')::bigint,
      (p_body->>'copiedFromBudgetId')::uuid
    ) returning * into budget;
    event_type='planning.budget_created';
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','budgetId','expectedVersion','patch','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into budget from public.budgets b
    where b.id=(p_body->>'budgetId')::uuid and b.user_id=p_user_id for update;
    if budget.id is null then raise exception using errcode='P0001',message='BUDGET_NOT_FOUND'; end if;
    if budget.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=budget.version::text;
    end if;
    if budget.status='deleted' then raise exception using errcode='P0001',message='BUDGET_INELIGIBLE'; end if;

    if operation='delete' then
      update public.budgets b set status='deleted',deleted_at=clock_timestamp()
      where b.id=budget.id returning * into budget;
      event_type='planning.budget_deleted';
    else
      patch=p_body->'patch';
      if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb
        or exists(select 1 from jsonb_object_keys(patch) key where key not in (
          'name','periodStart','periodEnd','totalMinor','incomeTargetMinor','savingsTargetMinor',
          'rolloverEnabled','rolloverMinor','status'
        )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      next_status=coalesce(patch->>'status',budget.status);
      if not (
        next_status=budget.status or next_status='deleted'
        or (budget.status='draft' and next_status='active')
        or (budget.status='active' and next_status in ('paused','closed'))
        or (budget.status='paused' and next_status in ('active','closed'))
      ) then raise exception using errcode='P0001',message='BUDGET_TRANSITION_INVALID'; end if;
      update public.budgets b set
        name=case when patch?'name' then patch->>'name' else b.name end,
        period_start=case when patch?'periodStart' then (patch->>'periodStart')::date else b.period_start end,
        period_end=case when patch?'periodEnd' then (patch->>'periodEnd')::date else b.period_end end,
        total_minor=case when patch?'totalMinor' then (patch->>'totalMinor')::bigint else b.total_minor end,
        income_target_minor=case when patch?'incomeTargetMinor' then (patch->>'incomeTargetMinor')::bigint else b.income_target_minor end,
        savings_target_minor=case when patch?'savingsTargetMinor' then (patch->>'savingsTargetMinor')::bigint else b.savings_target_minor end,
        rollover_enabled=case when patch?'rolloverEnabled' then (patch->>'rolloverEnabled')::boolean else b.rollover_enabled end,
        rollover_minor=case when patch?'rolloverMinor' then (patch->>'rolloverMinor')::bigint else b.rollover_minor end,
        status=next_status,deleted_at=case when next_status='deleted' then clock_timestamp() else null end
      where b.id=budget.id returning * into budget;
      if (select coalesce(sum(c.limit_minor) filter(where c.status='active'),0)
          from public.budget_categories c where c.budget_id=budget.id)>budget.total_minor then
        raise exception using errcode='P0001',message='BUDGET_ALLOCATION_EXCEEDS_TOTAL';
      end if;
      event_type=case when budget.status='deleted' then 'planning.budget_deleted'
        when budget.status='closed' then 'planning.budget_closed' else 'planning.budget_updated' end;
    end if;
  end if;

  perform private.enqueue_outbox_event(event_type,'budget',budget.id,jsonb_build_object(
    'budgetId',budget.id,'userId',p_user_id,'aggregateVersion',budget.version,'status',budget.status,
    'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
      join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),
    'requestId',request_id
  ));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'budget',budget.id::text,
    null,null,null,request_id,jsonb_build_object('version',budget.version,'status',budget.status));
  return jsonb_build_object(
    'id',budget.id,'name',budget.name,'currencyCode',budget.currency_code,
    'periodStart',budget.period_start,'periodEnd',budget.period_end,'totalMinor',budget.total_minor::text,
    'incomeTargetMinor',budget.income_target_minor::text,'savingsTargetMinor',budget.savings_target_minor::text,
    'rolloverEnabled',budget.rollover_enabled,'rolloverMinor',budget.rollover_minor::text,
    'status',budget.status,'copiedFromBudgetId',budget.copied_from_budget_id,'deletedAt',budget.deleted_at,
    'createdAt',budget.created_at,'updatedAt',budget.updated_at,'version',budget.version
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.replace_budget_categories(p_user_id text,p_budget_id uuid,p_expected_version bigint,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  budget public.budgets; allocations jsonb; request_id text; allocation jsonb; allocation_count integer;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or pg_column_size(p_body)>65536 or jsonb_typeof(p_body) not in ('array','object') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  allocations=case when jsonb_typeof(p_body)='array' then p_body else p_body->'allocations' end;
  request_id=case when jsonb_typeof(p_body)='object' then p_body->>'requestId' else 'budget-allocation' end;
  if allocations is null or jsonb_typeof(allocations)<>'array' or jsonb_array_length(allocations)>100
    or request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or (jsonb_typeof(p_body)='object' and exists(select 1 from jsonb_object_keys(p_body) key
      where key not in ('allocations','operationId','requestId'))) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select * into budget from public.budgets b
  where b.id=p_budget_id and b.user_id=p_user_id for update;
  if budget.id is null then raise exception using errcode='P0001',message='BUDGET_NOT_FOUND'; end if;
  if budget.version<>p_expected_version then
    raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=budget.version::text;
  end if;
  if budget.status in ('closed','deleted') then raise exception using errcode='P0001',message='BUDGET_INELIGIBLE'; end if;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    if jsonb_typeof(allocation)<>'object' or exists(select 1 from jsonb_object_keys(allocation) key where key not in (
      'categoryId','limitMinor','rolloverMinor','alertThresholds','status'
    )) or not private.planning_thresholds_valid(array(
      select value::smallint from jsonb_array_elements_text(allocation->'alertThresholds') value
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    perform (allocation->>'categoryId')::uuid,(allocation->>'limitMinor')::bigint,
      (allocation->>'rolloverMinor')::bigint,(allocation->>'status');
  end loop;
  if exists(select 1 from jsonb_array_elements(allocations) value
      group by value->>'categoryId' having count(*)>1) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if exists(
    select 1 from jsonb_array_elements(allocations) value
    left join public.categories c on c.id=(value->>'categoryId')::uuid
      and (c.user_id is null or c.user_id=p_user_id) and c.kind='expense' and c.active
    where c.id is null
  ) then raise exception using errcode='P0001',message='BUDGET_CATEGORY_INVALID'; end if;
  if (select coalesce(sum((value->>'limitMinor')::bigint) filter(where value->>'status'='active'),0)
      from jsonb_array_elements(allocations) value)>budget.total_minor then
    raise exception using errcode='P0001',message='BUDGET_ALLOCATION_EXCEEDS_TOTAL';
  end if;

  update public.budget_categories c set status='deleted'
  where c.budget_id=budget.id and c.status<>'deleted';
  insert into public.budget_categories(
    user_id,budget_id,category_id,limit_minor,rollover_minor,alert_thresholds,status
  ) select p_user_id,budget.id,(value->>'categoryId')::uuid,(value->>'limitMinor')::bigint,
      (value->>'rolloverMinor')::bigint,array(select x::smallint from jsonb_array_elements_text(value->'alertThresholds') x),
      value->>'status'
    from jsonb_array_elements(allocations) value
  on conflict(budget_id,category_id) do update set
    limit_minor=excluded.limit_minor,rollover_minor=excluded.rollover_minor,
    alert_thresholds=excluded.alert_thresholds,status=excluded.status;
  update public.budgets b set updated_at=b.updated_at where b.id=budget.id returning * into budget;
  allocation_count=jsonb_array_length(allocations);
  perform private.enqueue_outbox_event('planning.budget_allocations_replaced','budget',budget.id,jsonb_build_object(
    'budgetId',budget.id,'userId',p_user_id,'aggregateVersion',budget.version,'count',allocation_count,
    'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
      join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id
  ));
  perform audit.append_event(p_user_id,'user','planning.budget-allocations-replaced','budget',budget.id::text,
    null,null,null,request_id,jsonb_build_object('version',budget.version,'count',allocation_count));
  return jsonb_build_object('id',budget.id,'version',budget.version,'allocationCount',allocation_count);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.save_obligation(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation';request_id text:=p_body->>'requestId';patch jsonb;
  obligation public.obligations;next_status text;event_type text;account public.accounts;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>16384
    or operation not in ('create','update','archive') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if operation='create' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','operationId','requestId','name','direction','type','scheduleKind','currencyCode',
      'principalMinor','openingPaidMinor','installmentAmountMinor','installmentCount','frequency','expectedDay',
      'customIntervalDays','startDate','endDate','defaultAccountId','automaticMatchingEnabled','provider',
      'providerKeywords','reminderTiming','notes'
    )) or not exists(select 1 from public.currencies c where c.code=(p_body->>'currencyCode')::char(3) and c.enabled) then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    if p_body->>'defaultAccountId' is not null then
      select * into account from public.accounts a where a.id=(p_body->>'defaultAccountId')::uuid
        and a.user_id=p_user_id and a.status='active' and a.currency_code=(p_body->>'currencyCode')::char(3);
      if account.id is null then raise exception using errcode='P0001',message='OBLIGATION_ACCOUNT_INVALID'; end if;
    end if;
    if (p_body->>'scheduleKind')='fixed_term' and
      ((p_body->>'installmentCount')::bigint-1)*(p_body->>'installmentAmountMinor')::bigint
        >=(p_body->>'principalMinor')::bigint-(p_body->>'openingPaidMinor')::bigint then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    elsif (p_body->>'scheduleKind')='open_ended' and (p_body->>'installmentAmountMinor') is null then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    insert into public.obligations(
      id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,opening_paid_minor,
      installment_amount_minor,installment_count,frequency,expected_day,custom_interval_days,start_date,end_date,
      default_account_id,automatic_matching_enabled,provider,provider_keywords,reminder_timing,notes
    ) values(
      (p_body->>'obligationId')::uuid,p_user_id,p_body->>'name',p_body->>'direction',p_body->>'type',p_body->>'scheduleKind',
      (p_body->>'currencyCode')::char(3),(p_body->>'principalMinor')::bigint,(p_body->>'openingPaidMinor')::bigint,
      (p_body->>'installmentAmountMinor')::bigint,(p_body->>'installmentCount')::integer,p_body->>'frequency',
      (p_body->>'expectedDay')::smallint,(p_body->>'customIntervalDays')::smallint,(p_body->>'startDate')::date,
      (p_body->>'endDate')::date,(p_body->>'defaultAccountId')::uuid,(p_body->>'automaticMatchingEnabled')::boolean,
      p_body->>'provider',array(select value from jsonb_array_elements_text(p_body->'providerKeywords') value),
      p_body->>'reminderTiming',p_body->>'notes'
    ) returning * into obligation;
    event_type='planning.obligation_created';
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','expectedVersion','patch','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into obligation from public.obligations o
    where o.id=(p_body->>'obligationId')::uuid and o.user_id=p_user_id for update;
    if obligation.id is null then raise exception using errcode='P0001',message='OBLIGATION_NOT_FOUND'; end if;
    if obligation.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=obligation.version::text;
    end if;
    if obligation.status='archived' then raise exception using errcode='P0001',message='OBLIGATION_INELIGIBLE'; end if;
    if operation='archive' then
      update public.obligations o set status='archived',deleted_at=clock_timestamp()
      where o.id=obligation.id returning * into obligation;
      event_type='planning.obligation_archived';
    else
      patch=p_body->'patch';
      if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb
        or exists(select 1 from jsonb_object_keys(patch) key where key not in (
          'name','direction','type','scheduleKind','principalMinor','openingPaidMinor','installmentAmountMinor',
          'installmentCount','frequency','expectedDay','customIntervalDays','startDate','endDate','defaultAccountId',
          'automaticMatchingEnabled','provider','providerKeywords','reminderTiming','notes','status'
        )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      if exists(select 1 from public.obligation_schedule_items i where i.obligation_id=obligation.id)
        and patch ?| array['scheduleKind','principalMinor','openingPaidMinor','installmentAmountMinor','installmentCount',
          'frequency','expectedDay','customIntervalDays','startDate','endDate'] then
        raise exception using errcode='P0001',message='OBLIGATION_SCHEDULE_LOCKED';
      end if;
      if patch?'defaultAccountId' and patch->>'defaultAccountId' is not null then
        select * into account from public.accounts a where a.id=(patch->>'defaultAccountId')::uuid
          and a.user_id=p_user_id and a.status='active' and a.currency_code=obligation.currency_code;
        if account.id is null then raise exception using errcode='P0001',message='OBLIGATION_ACCOUNT_INVALID'; end if;
      end if;
      next_status=coalesce(patch->>'status',obligation.status);
      if not(next_status=obligation.status or next_status='archived'
        or (obligation.status='active' and next_status in ('paused','completed','closed'))
        or (obligation.status='paused' and next_status in ('active','completed','closed')))
      then raise exception using errcode='P0001',message='OBLIGATION_TRANSITION_INVALID'; end if;
      update public.obligations o set
        name=case when patch?'name' then patch->>'name' else o.name end,
        direction=case when patch?'direction' then patch->>'direction' else o.direction end,
        type=case when patch?'type' then patch->>'type' else o.type end,
        schedule_kind=case when patch?'scheduleKind' then patch->>'scheduleKind' else o.schedule_kind end,
        principal_minor=case when patch?'principalMinor' then (patch->>'principalMinor')::bigint else o.principal_minor end,
        opening_paid_minor=case when patch?'openingPaidMinor' then (patch->>'openingPaidMinor')::bigint else o.opening_paid_minor end,
        installment_amount_minor=case when patch?'installmentAmountMinor' then (patch->>'installmentAmountMinor')::bigint else o.installment_amount_minor end,
        installment_count=case when patch?'installmentCount' then (patch->>'installmentCount')::integer else o.installment_count end,
        frequency=case when patch?'frequency' then patch->>'frequency' else o.frequency end,
        expected_day=case when patch?'expectedDay' then (patch->>'expectedDay')::smallint else o.expected_day end,
        custom_interval_days=case when patch?'customIntervalDays' then (patch->>'customIntervalDays')::smallint else o.custom_interval_days end,
        start_date=case when patch?'startDate' then (patch->>'startDate')::date else o.start_date end,
        end_date=case when patch?'endDate' then (patch->>'endDate')::date else o.end_date end,
        default_account_id=case when patch?'defaultAccountId' then (patch->>'defaultAccountId')::uuid else o.default_account_id end,
        automatic_matching_enabled=case when patch?'automaticMatchingEnabled' then (patch->>'automaticMatchingEnabled')::boolean else o.automatic_matching_enabled end,
        provider=case when patch?'provider' then patch->>'provider' else o.provider end,
        provider_keywords=case when patch?'providerKeywords' then array(select value from jsonb_array_elements_text(patch->'providerKeywords') value) else o.provider_keywords end,
        reminder_timing=case when patch?'reminderTiming' then patch->>'reminderTiming' else o.reminder_timing end,
        notes=case when patch?'notes' then patch->>'notes' else o.notes end,
        status=next_status,deleted_at=case when next_status='archived' then clock_timestamp() else null end
      where o.id=obligation.id returning * into obligation;
      event_type=case when obligation.status='archived' then 'planning.obligation_archived'
        when obligation.status='completed' then 'planning.obligation_completed' else 'planning.obligation_updated' end;
    end if;
  end if;
  perform private.enqueue_outbox_event(event_type,'obligation',obligation.id,jsonb_build_object(
    'obligationId',obligation.id,'userId',p_user_id,'aggregateVersion',obligation.version,
    'status',obligation.status,'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
      join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'obligation',obligation.id::text,
    null,null,null,request_id,jsonb_build_object('version',obligation.version,'status',obligation.status));
  return jsonb_build_object('id',obligation.id,'name',obligation.name,'direction',obligation.direction,'type',obligation.type,
    'scheduleKind',obligation.schedule_kind,'currencyCode',obligation.currency_code,'principalMinor',obligation.principal_minor::text,
    'openingPaidMinor',obligation.opening_paid_minor::text,'installmentAmountMinor',obligation.installment_amount_minor::text,
    'installmentCount',obligation.installment_count,'frequency',obligation.frequency,'expectedDay',obligation.expected_day,
    'customIntervalDays',obligation.custom_interval_days,'startDate',obligation.start_date,'endDate',obligation.end_date,
    'status',obligation.status,'defaultAccountId',obligation.default_account_id,
    'automaticMatchingEnabled',obligation.automatic_matching_enabled,'provider',obligation.provider,
    'providerKeywords',obligation.provider_keywords,'reminderTiming',obligation.reminder_timing,'notes',obligation.notes,
    'deletedAt',obligation.deleted_at,'createdAt',obligation.created_at,'updatedAt',obligation.updated_at,'version',obligation.version);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.allocate_obligation_payment(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation';request_id text:=p_body->>'requestId';
  obligation public.obligations;payment public.obligation_payments;transaction_row public.transactions;
  schedule public.obligation_schedule_items;allocation jsonb;allocation_total bigint:=0;payment_result jsonb;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>65536
    or operation not in ('record','reverse') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select * into obligation from public.obligations o
  where o.id=(p_body->>'obligationId')::uuid and o.user_id=p_user_id for update;
  if obligation.id is null then raise exception using errcode='P0001',message='OBLIGATION_NOT_FOUND'; end if;

  if operation='record' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','paymentId','transactionId','expectedVersion','paymentMethod','paymentCase',
      'allocationIntent','source','allocations','operationId','requestId'
    )) or obligation.status<>'active' then raise exception using errcode='P0001',message='OBLIGATION_INELIGIBLE'; end if;
    if obligation.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=obligation.version::text;
    end if;
    select * into transaction_row from public.transactions t
    where t.id=(p_body->>'transactionId')::uuid and t.user_id=p_user_id for update;
    if transaction_row.id is null or transaction_row.status<>'confirmed'
      or transaction_row.kind<>(case when obligation.direction='payable' then 'expense' else 'income' end)
      or transaction_row.currency_code<>obligation.currency_code then
      raise exception using errcode='P0001',message='PAYMENT_TRANSACTION_INVALID';
    end if;
    if exists(select 1 from public.obligation_payments p where p.transaction_id=transaction_row.id and p.status<>'reversed') then
      raise exception using errcode='P0001',message='PAYMENT_TRANSACTION_USED';
    end if;
    if jsonb_typeof(p_body->'allocations')<>'array' or jsonb_array_length(p_body->'allocations') not between 1 and 100
      or exists(select 1 from jsonb_array_elements(p_body->'allocations') value
        group by value->>'scheduleItemId' having count(*)>1) then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    for allocation in select value from jsonb_array_elements(p_body->'allocations') order by value->>'scheduleItemId'
    loop
      if jsonb_typeof(allocation)<>'object' or exists(select 1 from jsonb_object_keys(allocation) key
        where key not in ('scheduleItemId','amountMinor')) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      select * into schedule from public.obligation_schedule_items i
      where i.id=(allocation->>'scheduleItemId')::uuid and i.user_id=p_user_id
        and i.obligation_id=obligation.id for update;
      if schedule.id is null then raise exception using errcode='P0001',message='PAYMENT_SCHEDULE_INVALID'; end if;
      if (allocation->>'amountMinor')::bigint<=0 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      if (allocation->>'amountMinor')::bigint>schedule.amount_minor-schedule.paid_minor then
        raise exception using errcode='P0001',message='PAYMENT_ALLOCATION_EXCEEDS_REMAINDER';
      end if;
      allocation_total=allocation_total+(allocation->>'amountMinor')::bigint;
    end loop;
    if allocation_total<>transaction_row.amount_minor then
      raise exception using errcode='P0001',message='PAYMENT_ALLOCATION_SUM_MISMATCH';
    end if;
    insert into public.obligation_payments(
      id,user_id,obligation_id,transaction_id,paid_at,amount_minor,payment_method,payment_case,
      allocation_intent,source,operation_id
    ) values(
      (p_body->>'paymentId')::uuid,p_user_id,obligation.id,transaction_row.id,transaction_row.occurred_at,
      transaction_row.amount_minor,p_body->>'paymentMethod',p_body->>'paymentCase',p_body->>'allocationIntent',
      p_body->>'source',(p_body->>'operationId')::uuid
    ) returning * into payment;
    for allocation in select value from jsonb_array_elements(p_body->'allocations') order by value->>'scheduleItemId'
    loop
      insert into public.obligation_payment_allocations(user_id,payment_id,schedule_item_id,amount_minor)
      values(p_user_id,payment.id,(allocation->>'scheduleItemId')::uuid,(allocation->>'amountMinor')::bigint);
      update public.obligation_schedule_items i set paid_minor=i.paid_minor+(allocation->>'amountMinor')::bigint,
        status=case when i.paid_minor+(allocation->>'amountMinor')::bigint=i.amount_minor then 'paid'
          when i.status='overdue' then 'overdue' else 'partial' end
      where i.id=(allocation->>'scheduleItemId')::uuid;
    end loop;
    update public.obligations o set updated_at=o.updated_at where o.id=obligation.id returning * into obligation;
    perform private.enqueue_outbox_event('planning.obligation_payment_recorded','obligation-payment',payment.id,
      jsonb_build_object('obligationId',obligation.id,'paymentId',payment.id,'transactionId',payment.transaction_id,
        'userId',p_user_id,'aggregateVersion',payment.version,'status',payment.status,
        'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
          join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
    perform audit.append_event(p_user_id,'user','planning.obligation-payment-recorded','obligation_payment',payment.id::text,
      null,null,null,request_id,jsonb_build_object('version',payment.version,'obligationId',obligation.id));
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','paymentId','expectedVersion','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into payment from public.obligation_payments p
    where p.id=(p_body->>'paymentId')::uuid and p.user_id=p_user_id and p.obligation_id=obligation.id for update;
    if payment.id is null then raise exception using errcode='P0001',message='PAYMENT_NOT_FOUND'; end if;
    if payment.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=payment.version::text;
    end if;
    if payment.status<>'confirmed' then raise exception using errcode='P0001',message='PAYMENT_INELIGIBLE'; end if;
    for allocation in select jsonb_build_object('scheduleItemId',a.schedule_item_id,'amountMinor',a.amount_minor) value
      from public.obligation_payment_allocations a where a.payment_id=payment.id order by a.schedule_item_id
    loop
      select * into schedule from public.obligation_schedule_items i
      where i.id=(allocation->>'scheduleItemId')::uuid for update;
      update public.obligation_schedule_items i set paid_minor=i.paid_minor-(allocation->>'amountMinor')::bigint,
        status=case when i.paid_minor-(allocation->>'amountMinor')::bigint=0
            then case when i.due_at<clock_timestamp() then 'overdue' else 'due' end
          when i.due_at<clock_timestamp() then 'overdue' else 'partial' end
      where i.id=schedule.id;
    end loop;
    update public.obligation_payments p set status='reversed',operation_id=(p_body->>'operationId')::uuid
    where p.id=payment.id returning * into payment;
    update public.obligations o set updated_at=o.updated_at where o.id=obligation.id returning * into obligation;
    perform private.enqueue_outbox_event('planning.obligation_payment_reversed','obligation-payment',payment.id,
      jsonb_build_object('obligationId',obligation.id,'paymentId',payment.id,'transactionId',payment.transaction_id,
        'userId',p_user_id,'aggregateVersion',payment.version,'status',payment.status,
        'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
          join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
    perform audit.append_event(p_user_id,'user','planning.obligation-payment-reversed','obligation_payment',payment.id::text,
      null,null,null,request_id,jsonb_build_object('version',payment.version,'obligationId',obligation.id));
  end if;
  payment_result=jsonb_build_object('id',payment.id,'obligationId',payment.obligation_id,
    'transactionId',payment.transaction_id,'paidAt',payment.paid_at,'amountMinor',payment.amount_minor::text,
    'paymentMethod',payment.payment_method,'paymentCase',payment.payment_case,'allocationIntent',payment.allocation_intent,
    'source',payment.source,'status',payment.status,'operationId',payment.operation_id,
    'createdAt',payment.created_at,'updatedAt',payment.updated_at,'version',payment.version,'obligationVersion',obligation.version);
  return payment_result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;

create function private.propose_payment_matches(p_transaction_id uuid,p_limit integer)
returns table(inserted_count integer,existing_count integer)
language plpgsql security definer set search_path='' as $$
declare transaction_row public.transactions;candidate record;match_id uuid;inserted integer:=0;considered integer:=0;
begin
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='MATCH_REQUEST_INVALID'; end if;
  select * into transaction_row from public.transactions t where t.id=p_transaction_id for update;
  if transaction_row.id is null or transaction_row.status<>'confirmed' or transaction_row.kind<>'expense' then
    return query select 0,0;return;
  end if;
  for candidate in
    select o.id obligation_id,next_item.id schedule_item_id,
      transaction_row.amount_minor=coalesce(next_item.amount_minor-next_item.paid_minor,o.installment_amount_minor,o.principal_minor) amount_match,
      exists(select 1 from unnest(o.provider_keywords) keyword
        where lower(coalesce(transaction_row.merchant,'')||' '||transaction_row.title) like '%'||lower(keyword)||'%') keyword_match
    from public.obligations o
    left join lateral(select i.id,i.amount_minor,i.paid_minor from public.obligation_schedule_items i
      where i.obligation_id=o.id and i.status in ('due','partial','overdue') and i.paid_minor<i.amount_minor
      order by i.due_at,i.id limit 1) next_item on true
    where o.user_id=transaction_row.user_id and o.status='active' and o.automatic_matching_enabled
      and o.direction='payable' and o.currency_code=transaction_row.currency_code
      and not exists(select 1 from public.obligation_payments p where p.transaction_id=transaction_row.id and p.status<>'reversed')
      and not exists(select 1 from public.payment_matches m where m.transaction_id=transaction_row.id and m.obligation_id=o.id)
      and (transaction_row.amount_minor=coalesce(next_item.amount_minor-next_item.paid_minor,o.installment_amount_minor,o.principal_minor)
        or exists(select 1 from unnest(o.provider_keywords) keyword
          where lower(coalesce(transaction_row.merchant,'')||' '||transaction_row.title) like '%'||lower(keyword)||'%'))
    order by o.id limit p_limit
  loop
    considered=considered+1;match_id=null;
    insert into public.payment_matches(user_id,transaction_id,obligation_id,schedule_item_id,confidence,evidence)
    values(transaction_row.user_id,transaction_row.id,candidate.obligation_id,candidate.schedule_item_id,
      case when candidate.amount_match and candidate.keyword_match then .95 when candidate.amount_match then .80 else .65 end,
      jsonb_build_object('amountMatch',candidate.amount_match,'keywordMatch',candidate.keyword_match))
    on conflict(transaction_id,obligation_id) do nothing returning id into match_id;
    if match_id is not null then
      inserted=inserted+1;
      perform private.enqueue_outbox_event('planning.payment_match_proposed','payment-match',match_id,
        jsonb_build_object('matchId',match_id,'obligationId',candidate.obligation_id,'transactionId',transaction_row.id,
          'userId',transaction_row.user_id,'aggregateVersion',1,'status','proposed','ledgerVersion',0,
          'requestId','payment-match-worker'));
      perform audit.append_event(transaction_row.user_id,'system','planning.payment-match-proposed','payment_match',
        match_id::text,null,null,null,'payment-match-worker',jsonb_build_object('version',1));
    end if;
  end loop;
  return query select inserted,considered-inserted;
end $$;
create function private.decide_payment_match(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  decision text:=p_body->>'decision';request_id text:=p_body->>'requestId';match public.payment_matches;
  payment_result jsonb;payment_body jsonb;event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>65536
    or decision not in ('accepted','rejected') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','decision','matchId','expectedVersion','allocation','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  select * into match from public.payment_matches m
  where m.id=(p_body->>'matchId')::uuid and m.user_id=p_user_id for update;
  if match.id is null then raise exception using errcode='P0001',message='PAYMENT_MATCH_NOT_FOUND'; end if;
  if match.version<>(p_body->>'expectedVersion')::bigint then
    raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=match.version::text;
  end if;
  if match.status<>'proposed' then raise exception using errcode='P0001',message='PAYMENT_MATCH_TERMINAL'; end if;
  if decision='accepted' then
    if jsonb_typeof(p_body->'allocation')<>'object' then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    payment_body=(p_body->'allocation')||jsonb_build_object('operation','record','obligationId',match.obligation_id,
      'transactionId',match.transaction_id,'operationId',p_body->>'operationId','requestId',request_id);
    payment_result=private.allocate_obligation_payment(p_user_id,payment_body);
    event_type='planning.payment_match_accepted';
  else
    if p_body->'allocation'<>'null'::jsonb then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    event_type='planning.payment_match_rejected';
  end if;
  update public.payment_matches m set status=decision,reviewed_by=p_user_id,reviewed_at=clock_timestamp()
  where m.id=match.id returning * into match;
  perform private.enqueue_outbox_event(event_type,'payment-match',match.id,jsonb_build_object(
    'matchId',match.id,'obligationId',match.obligation_id,'transactionId',match.transaction_id,
    'userId',p_user_id,'aggregateVersion',match.version,'status',match.status,'ledgerVersion',0,'requestId',request_id));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'payment_match',match.id::text,
    null,null,null,request_id,jsonb_build_object('version',match.version,'status',match.status));
  return jsonb_build_object('id',match.id,'transactionId',match.transaction_id,'obligationId',match.obligation_id,
    'scheduleItemId',match.schedule_item_id,'status',match.status,'reviewedAt',match.reviewed_at,
    'createdAt',match.created_at,'updatedAt',match.updated_at,'version',match.version,'payment',payment_result);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.save_savings_goal(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation';request_id text:=p_body->>'requestId';patch jsonb;
  goal public.savings_goals;account public.accounts;progress bigint;next_status text;event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>8192
    or operation not in ('create','update','delete') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if operation='create' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','goalId','operationId','requestId','name','targetMinor','openingTrackedMinor','currencyCode',
      'targetDate','linkedAccountId','iconKey','emergencyFund'
    )) or not exists(select 1 from public.currencies c where c.code=(p_body->>'currencyCode')::char(3) and c.enabled)
    then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    if p_body->>'linkedAccountId' is not null then
      select * into account from public.accounts a where a.id=(p_body->>'linkedAccountId')::uuid
        and a.user_id=p_user_id and a.status='active' and a.currency_code=(p_body->>'currencyCode')::char(3);
      if account.id is null then raise exception using errcode='P0001',message='SAVINGS_ACCOUNT_INVALID'; end if;
    end if;
    insert into public.savings_goals(id,user_id,name,currency_code,target_minor,opening_tracked_minor,
      target_date,linked_account_id,icon_key,emergency_fund)
    values((p_body->>'goalId')::uuid,p_user_id,p_body->>'name',(p_body->>'currencyCode')::char(3),
      (p_body->>'targetMinor')::bigint,(p_body->>'openingTrackedMinor')::bigint,(p_body->>'targetDate')::date,
      (p_body->>'linkedAccountId')::uuid,p_body->>'iconKey',(p_body->>'emergencyFund')::boolean)
    returning * into goal;
    event_type='planning.savings_goal_created';
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','goalId','expectedVersion','patch','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into goal from public.savings_goals g
    where g.id=(p_body->>'goalId')::uuid and g.user_id=p_user_id for update;
    if goal.id is null then raise exception using errcode='P0001',message='SAVINGS_GOAL_NOT_FOUND'; end if;
    if goal.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=goal.version::text;
    end if;
    if goal.status='deleted' then raise exception using errcode='P0001',message='SAVINGS_GOAL_INELIGIBLE'; end if;
    if operation='delete' then
      update public.savings_goals g set status='deleted',deleted_at=clock_timestamp()
      where g.id=goal.id returning * into goal;event_type='planning.savings_goal_deleted';
    else
      patch=p_body->'patch';
      if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb
        or exists(select 1 from jsonb_object_keys(patch) key where key not in (
          'name','targetMinor','targetDate','linkedAccountId','iconKey','emergencyFund','status'
        )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      if patch?'linkedAccountId' and patch->>'linkedAccountId' is not null then
        select * into account from public.accounts a where a.id=(patch->>'linkedAccountId')::uuid
          and a.user_id=p_user_id and a.status='active' and a.currency_code=goal.currency_code;
        if account.id is null then raise exception using errcode='P0001',message='SAVINGS_ACCOUNT_INVALID'; end if;
      end if;
      select (goal.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint into progress
      from public.savings_goal_movements m where m.goal_id=goal.id;
      if patch?'targetMinor' and (patch->>'targetMinor')::bigint<progress
        and coalesce(patch->>'status','') not in ('active','completed') then
        raise exception using errcode='P0001',message='SAVINGS_TARGET_DECISION_REQUIRED';
      end if;
      next_status=coalesce(patch->>'status',goal.status);
      if not(next_status=goal.status or next_status='deleted'
        or (goal.status='active' and next_status in ('paused','completed'))
        or (goal.status='paused' and next_status in ('active','completed')))
      then raise exception using errcode='P0001',message='SAVINGS_TRANSITION_INVALID'; end if;
      update public.savings_goals g set
        name=case when patch?'name' then patch->>'name' else g.name end,
        target_minor=case when patch?'targetMinor' then (patch->>'targetMinor')::bigint else g.target_minor end,
        target_date=case when patch?'targetDate' then (patch->>'targetDate')::date else g.target_date end,
        linked_account_id=case when patch?'linkedAccountId' then (patch->>'linkedAccountId')::uuid else g.linked_account_id end,
        icon_key=case when patch?'iconKey' then patch->>'iconKey' else g.icon_key end,
        emergency_fund=case when patch?'emergencyFund' then (patch->>'emergencyFund')::boolean else g.emergency_fund end,
        status=next_status,deleted_at=case when next_status='deleted' then clock_timestamp() else null end
      where g.id=goal.id returning * into goal;
      event_type=case when goal.status='deleted' then 'planning.savings_goal_deleted'
        when goal.status='completed' then 'planning.savings_goal_completed' else 'planning.savings_goal_updated' end;
    end if;
  end if;
  select (goal.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint into progress
  from public.savings_goal_movements m where m.goal_id=goal.id;
  perform private.enqueue_outbox_event(event_type,'savings-goal',goal.id,jsonb_build_object(
    'goalId',goal.id,'userId',p_user_id,'aggregateVersion',goal.version,'status',goal.status,
    'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
      join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'savings_goal',goal.id::text,
    null,null,null,request_id,jsonb_build_object('version',goal.version,'status',goal.status));
  return jsonb_build_object('id',goal.id,'name',goal.name,'currencyCode',goal.currency_code,
    'targetMinor',goal.target_minor::text,'openingTrackedMinor',goal.opening_tracked_minor::text,
    'progressMinor',progress::text,'remainingMinor',(goal.target_minor-progress)::text,'targetDate',goal.target_date,
    'status',goal.status,'linkedAccountId',goal.linked_account_id,'iconKey',goal.icon_key,
    'emergencyFund',goal.emergency_fund,'deletedAt',goal.deleted_at,'createdAt',goal.created_at,
    'updatedAt',goal.updated_at,'version',goal.version);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.record_savings_movement(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  goal public.savings_goals;movement public.savings_goal_movements;replaced public.savings_goal_movements;
  transaction_row public.transactions;kind text:=p_body->>'kind';amount bigint;progress bigint;request_id text:=p_body->>'requestId';
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>8192
    or kind not in ('contribution','withdrawal','adjustment') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','goalId','movementId','transactionId','expectedVersion','kind','amountMinor',
      'replacesMovementId','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  select * into goal from public.savings_goals g
  where g.id=(p_body->>'goalId')::uuid and g.user_id=p_user_id for update;
  if goal.id is null then raise exception using errcode='P0001',message='SAVINGS_GOAL_NOT_FOUND'; end if;
  if goal.version<>(p_body->>'expectedVersion')::bigint then
    raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=goal.version::text;
  end if;
  if goal.status not in ('active','paused') then raise exception using errcode='P0001',message='SAVINGS_GOAL_INELIGIBLE'; end if;
  amount=(p_body->>'amountMinor')::bigint;
  if amount=0 or (kind='contribution' and amount<0) or (kind='withdrawal' and amount>0)
    or ((kind='adjustment')<>(p_body->>'replacesMovementId' is not null)) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if kind='adjustment' then
    select * into replaced from public.savings_goal_movements m
    where m.id=(p_body->>'replacesMovementId')::uuid and m.goal_id=goal.id and m.user_id=p_user_id;
    if replaced.id is null then raise exception using errcode='P0001',message='SAVINGS_REPLACEMENT_INVALID'; end if;
  end if;
  select * into transaction_row from public.transactions t
  where t.id=(p_body->>'transactionId')::uuid and t.user_id=p_user_id for update;
  if transaction_row.id is null or transaction_row.status<>'confirmed' or transaction_row.currency_code<>goal.currency_code
    or transaction_row.amount_minor<>abs(amount)
    or (kind='contribution' and transaction_row.kind not in ('income','transfer'))
    or (kind='withdrawal' and transaction_row.kind not in ('expense','transfer'))
    or (kind='adjustment' and transaction_row.kind<>'adjustment') then
    raise exception using errcode='P0001',message='SAVINGS_TRANSACTION_INVALID';
  end if;
  if exists(select 1 from public.savings_goal_movements m where m.goal_id=goal.id and m.transaction_id=transaction_row.id) then
    raise exception using errcode='P0001',message='SAVINGS_TRANSACTION_USED';
  end if;
  select (goal.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint into progress
  from public.savings_goal_movements m where m.goal_id=goal.id;
  if progress+amount<0 then raise exception using errcode='P0001',message='PLANNING_PROGRESS_INSUFFICIENT'; end if;
  insert into public.savings_goal_movements(id,user_id,goal_id,transaction_id,amount_minor,occurred_at,kind,operation_id,replaces_movement_id)
  values((p_body->>'movementId')::uuid,p_user_id,goal.id,transaction_row.id,amount,transaction_row.occurred_at,
    kind,(p_body->>'operationId')::uuid,(p_body->>'replacesMovementId')::uuid) returning * into movement;
  update public.savings_goals g set updated_at=g.updated_at where g.id=goal.id returning * into goal;
  progress=progress+amount;
  perform private.enqueue_outbox_event('planning.savings_movement_recorded','savings-movement',movement.id,
    jsonb_build_object('goalId',goal.id,'movementId',movement.id,'transactionId',movement.transaction_id,
      'userId',p_user_id,'aggregateVersion',goal.version,'status',goal.status,
      'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
        join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
  perform audit.append_event(p_user_id,'user','planning.savings-movement-recorded','savings_movement',movement.id::text,
    null,null,null,request_id,jsonb_build_object('goalVersion',goal.version,'kind',kind));
  return jsonb_build_object('id',movement.id,'goalId',goal.id,'transactionId',movement.transaction_id,
    'amountMinor',movement.amount_minor::text,'occurredAt',movement.occurred_at,'kind',movement.kind,
    'operationId',movement.operation_id,'replacesMovementId',movement.replaces_movement_id,
    'createdAt',movement.created_at,'goalVersion',goal.version,'progressMinor',progress::text);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;
create function private.reverse_savings_movement(p_user_id text,p_movement_id uuid,p_expected_version bigint,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original public.savings_goal_movements;reversal public.savings_goal_movements;goal public.savings_goals;progress bigint;
begin
  perform private.assert_active_profile(p_user_id);
  select * into original from public.savings_goal_movements m where m.id=p_movement_id and m.user_id=p_user_id for update;
  if original.id is null then raise exception using errcode='P0001',message='SAVINGS_MOVEMENT_NOT_FOUND'; end if;
  select * into goal from public.savings_goals g where g.id=original.goal_id and g.user_id=p_user_id for update;
  if goal.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=goal.version::text; end if;
  if goal.status not in ('active','paused') or original.kind='reversal'
    or exists(select 1 from public.savings_goal_movements m where m.replaces_movement_id=original.id and m.kind='reversal') then
    raise exception using errcode='P0001',message='SAVINGS_MOVEMENT_INELIGIBLE';
  end if;
  select (goal.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint into progress
  from public.savings_goal_movements m where m.goal_id=goal.id;
  if progress-original.amount_minor<0 then raise exception using errcode='P0001',message='PLANNING_PROGRESS_INSUFFICIENT'; end if;
  insert into public.savings_goal_movements(id,user_id,goal_id,transaction_id,amount_minor,occurred_at,kind,operation_id,replaces_movement_id)
  values(p_operation_id,p_user_id,goal.id,original.transaction_id,-original.amount_minor,clock_timestamp(),'reversal',p_operation_id,original.id)
  returning * into reversal;
  update public.savings_goals g set updated_at=g.updated_at where g.id=goal.id returning * into goal;
  progress=progress-original.amount_minor;
  perform private.enqueue_outbox_event('planning.savings_movement_reversed','savings-movement',reversal.id,
    jsonb_build_object('goalId',goal.id,'movementId',reversal.id,'transactionId',reversal.transaction_id,
      'userId',p_user_id,'aggregateVersion',goal.version,'status',goal.status,'ledgerVersion',0,
      'requestId','savings-reversal'));
  perform audit.append_event(p_user_id,'user','planning.savings-movement-reversed','savings_movement',reversal.id::text,
    null,null,null,'savings-reversal',jsonb_build_object('goalVersion',goal.version,'replacesMovementId',original.id));
  return jsonb_build_object('id',reversal.id,'goalId',goal.id,'transactionId',reversal.transaction_id,
    'amountMinor',reversal.amount_minor::text,'occurredAt',reversal.occurred_at,'kind',reversal.kind,
    'operationId',reversal.operation_id,'replacesMovementId',reversal.replaces_movement_id,
    'createdAt',reversal.created_at,'goalVersion',goal.version,'progressMinor',progress::text);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;

create function private.generate_salary_receipts(p_user_id text,p_profile_id uuid,p_through_date date)
returns table(inserted_count integer,existing_count integer)
language plpgsql security definer set search_path='' as $$
declare
  profile public.salary_profiles; owner_timezone text; anchor date; candidate date; month_anchor date;
  sequence_no integer:=0; inserted_total integer:=0; considered integer:=0; receipt_id uuid;
begin
  select p.* into profile from public.salary_profiles p
  where p.id=p_profile_id and p.user_id=p_user_id for update;
  if profile.id is null then raise exception using errcode='P0001',message='SALARY_PROFILE_NOT_FOUND'; end if;
  select u.timezone into owner_timezone from public.profiles u where u.id=p_user_id;
  if profile.status<>'active' then return query select 0,0; return; end if;
  anchor:=greatest(current_date,profile.created_at::date);
  if p_through_date is null or p_through_date<anchor or p_through_date>anchor+interval '18 months' then
    raise exception using errcode='22023',message='PLANNING_HORIZON_INVALID';
  end if;

  loop
    if profile.frequency='monthly' then
      month_anchor:=(date_trunc('month',anchor)::date+(sequence_no||' months')::interval)::date;
      candidate:=make_date(extract(year from month_anchor)::integer,extract(month from month_anchor)::integer,
        least(profile.expected_day,extract(day from (month_anchor+interval '1 month'-interval '1 day'))::integer));
      if sequence_no=0 and candidate<anchor then sequence_no:=sequence_no+1; continue; end if;
    elsif profile.frequency in ('weekly','biweekly') then
      candidate:=anchor+((profile.expected_day-extract(dow from anchor)::integer+7)%7)
        +sequence_no*case when profile.frequency='weekly' then 7 else 14 end;
    else
      candidate:=anchor+sequence_no*profile.custom_interval_days;
    end if;
    exit when candidate>p_through_date;
    considered:=considered+1; receipt_id:=null;
    insert into public.salary_receipts(user_id,salary_profile_id,expected_at,amount_minor)
    values(p_user_id,profile.id,candidate::timestamp at time zone owner_timezone,profile.amount_minor)
    on conflict(salary_profile_id,expected_at) do nothing returning id into receipt_id;
    if receipt_id is not null then
      inserted_total:=inserted_total+1;
      perform private.enqueue_outbox_event('planning.salary_receipt_expected','salary-receipt',receipt_id,
        jsonb_build_object('profileId',profile.id,'receiptId',receipt_id,'userId',p_user_id,'version',1,
          'status','expected','cycleDate',candidate,'ledgerVersion',0,'occurredAt',clock_timestamp(),
          'requestId','salary-generator'));
    end if;
    sequence_no:=sequence_no+1;
    if sequence_no>600 then raise exception using errcode='22023',message='PLANNING_HORIZON_INVALID'; end if;
  end loop;
  return query select inserted_total,considered-inserted_total;
end $$;
create function private.generate_obligation_schedule(p_user_id text,p_obligation_id uuid,p_through_date date)
returns table(inserted_count integer,existing_count integer)
language plpgsql security definer set search_path='' as $$
declare
  obligation public.obligations;owner_timezone text;item_sequence integer:=1;candidate date;
  first_anchor date;month_anchor date;month_step integer;amount bigint;residual bigint;
  inserted_total integer:=0;considered integer:=0;item_id uuid;effective_horizon date;
begin
  select * into obligation from public.obligations o where o.id=p_obligation_id and o.user_id=p_user_id for update;
  if obligation.id is null then raise exception using errcode='P0001',message='OBLIGATION_NOT_FOUND'; end if;
  if p_through_date is null or p_through_date>(current_date+interval '18 months')::date then
    raise exception using errcode='22023',message='PLANNING_HORIZON_INVALID';
  end if;
  if obligation.status<>'active' or obligation.schedule_kind='irregular' or p_through_date<obligation.start_date then
    return query select 0,0;return;
  end if;
  select p.timezone into owner_timezone from public.profiles p where p.id=p_user_id;
  effective_horizon=least(p_through_date,coalesce(obligation.end_date,p_through_date));
  if obligation.frequency in ('monthly','quarterly','yearly') then
    month_step=case obligation.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
    first_anchor=date_trunc('month',obligation.start_date)::date;
    candidate=make_date(extract(year from first_anchor)::integer,extract(month from first_anchor)::integer,
      least(obligation.expected_day,extract(day from (first_anchor+interval '1 month'-interval '1 day'))::integer));
    if candidate<obligation.start_date then first_anchor=(first_anchor+(month_step||' months')::interval)::date; end if;
  end if;
  if obligation.schedule_kind='fixed_term' then
    residual=obligation.principal_minor-obligation.opening_paid_minor-
      obligation.installment_amount_minor*(obligation.installment_count-1);
    if residual<=0 then raise exception using errcode='22023',message='OBLIGATION_SCHEDULE_INVALID'; end if;
  end if;
  loop
    exit when obligation.schedule_kind='fixed_term' and item_sequence>obligation.installment_count;
    if obligation.frequency in ('monthly','quarterly','yearly') then
      month_anchor=(first_anchor+((item_sequence-1)*month_step||' months')::interval)::date;
      candidate=make_date(extract(year from month_anchor)::integer,extract(month from month_anchor)::integer,
        least(obligation.expected_day,extract(day from (month_anchor+interval '1 month'-interval '1 day'))::integer));
    elsif obligation.frequency in ('weekly','biweekly') then
      candidate=obligation.start_date+((obligation.expected_day-extract(dow from obligation.start_date)::integer+7)%7)
        +(item_sequence-1)*case when obligation.frequency='weekly' then 7 else 14 end;
    else
      candidate=obligation.start_date+(item_sequence-1)*obligation.custom_interval_days;
    end if;
    exit when candidate>effective_horizon;
    amount=case when obligation.schedule_kind='fixed_term' and item_sequence=obligation.installment_count
      then residual else obligation.installment_amount_minor end;
    considered=considered+1;item_id=null;
    insert into public.obligation_schedule_items(user_id,obligation_id,due_at,amount_minor,sequence_no)
    values(p_user_id,obligation.id,candidate::timestamp at time zone owner_timezone,amount,item_sequence)
    on conflict(obligation_id,sequence_no) do nothing returning id into item_id;
    if item_id is not null then
      inserted_total=inserted_total+1;
      perform private.enqueue_outbox_event('planning.obligation_schedule_generated','obligation-schedule',item_id,
        jsonb_build_object('obligationId',obligation.id,'scheduleItemId',item_id,'userId',p_user_id,
          'aggregateVersion',1,'dueAt',candidate::timestamp at time zone owner_timezone,'status','due',
          'ledgerVersion',0,'requestId','obligation-generator'));
    end if;
    item_sequence=item_sequence+1;
    if item_sequence>1200 then raise exception using errcode='22023',message='PLANNING_HORIZON_INVALID'; end if;
  end loop;
  if inserted_total>0 then perform audit.append_event(p_user_id,'system','planning.obligation-schedule-generated',
    'obligation',obligation.id::text,null,null,null,'obligation-generator',jsonb_build_object('count',inserted_total)); end if;
  return query select inserted_total,considered-inserted_total;
end $$;
create function private.mark_planning_overdue(p_as_of timestamptz,p_limit integer)
returns table(marked_count integer,backlog_count integer)
language plpgsql security definer set search_path='' as $$
declare changed record;marked integer:=0;backlog integer;
begin
  if p_as_of is null or p_limit not between 1 and 500 then
    raise exception using errcode='22023',message='PLANNING_OVERDUE_REQUEST_INVALID';
  end if;
  for changed in
    with eligible as (
      select i.id from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
      where o.status='active' and i.status in ('due','partial') and i.paid_minor<i.amount_minor and i.due_at<p_as_of
      order by i.due_at,i.id for update of i skip locked limit p_limit
    ) update public.obligation_schedule_items i set status='overdue' from eligible e where i.id=e.id
      returning i.id,i.user_id,i.obligation_id,i.version,i.due_at,i.status
  loop
    marked=marked+1;
    perform private.enqueue_outbox_event('planning.obligation_overdue','obligation-schedule',changed.id,
      jsonb_build_object('obligationId',changed.obligation_id,'scheduleItemId',changed.id,'userId',changed.user_id,
        'aggregateVersion',changed.version,'dueAt',changed.due_at,'status',changed.status,
        'ledgerVersion',0,'requestId','planning-overdue'));
    perform audit.append_event(changed.user_id,'system','planning.obligation-overdue','obligation_schedule',
      changed.id::text,null,null,null,'planning-overdue',jsonb_build_object('version',changed.version));
  end loop;
  select count(*) into backlog from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
    where o.status='active' and i.status in ('due','partial') and i.paid_minor<i.amount_minor and i.due_at<p_as_of;
  return query select marked,backlog;
end $$;

create function private.claim_planning_job(p_job_name text,p_after_resource_id uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  if p_job_name not in ('planning.salary-cycle.generate','planning.obligation-schedule.generate','planning.payment-match.propose','planning.overdue.mark','planning.reminders.emit')
    or p_limit not between 1 and 500 or p_lease_seconds not between 1 and 300 then
    raise exception using errcode='22023',message='PLANNING_CLAIM_INVALID';
  end if;
  return query
  with eligible as (
    select c.id from private.planning_job_claims c
    where c.job_name=p_job_name and c.resource_id>coalesce(p_after_resource_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and c.attempt_count<8 and c.available_at<=clock_timestamp()
      and (c.status in ('pending','failed') or (c.status='running' and c.locked_until<=clock_timestamp()))
    order by c.resource_id,c.id for update skip locked limit p_limit
  )
  update private.planning_job_claims c set status='running',attempt_count=c.attempt_count+1,
    locked_by=current_user,locked_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    lease_token=extensions.gen_random_uuid(),updated_at=clock_timestamp(),error_code=null
  from eligible e where c.id=e.id returning c.*;
end $$;

create function private.claim_planning_salary_cycles(p_after uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  insert into private.planning_job_claims(job_name,resource_id,natural_key)
  select 'planning.salary-cycle.generate',p.id,p.id::text||':'||current_date::text
  from public.salary_profiles p where p.status='active'
  on conflict(job_name,natural_key) do nothing;
  return query select * from private.claim_planning_job('planning.salary-cycle.generate',p_after,p_limit,p_lease_seconds);
end $$;

create function private.claim_planning_obligation_schedules(p_after uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  insert into private.planning_job_claims(job_name,resource_id,natural_key)
  select 'planning.obligation-schedule.generate',o.id,o.id::text||':'||current_date::text
  from public.obligations o where o.status='active' and o.schedule_kind<>'irregular'
  on conflict(job_name,natural_key) do nothing;
  return query select * from private.claim_planning_job('planning.obligation-schedule.generate',p_after,p_limit,p_lease_seconds);
end $$;

create function private.claim_planning_match_candidates(p_after uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  insert into private.planning_job_claims(job_name,resource_id,natural_key)
  select 'planning.payment-match.propose',t.id,t.id::text||':'||t.version::text
  from public.transactions t where t.status='confirmed' and t.kind='expense'
    and not exists(select 1 from public.obligation_payments p where p.transaction_id=t.id and p.status<>'reversed')
  on conflict(job_name,natural_key) do nothing;
  return query select * from private.claim_planning_job('planning.payment-match.propose',p_after,p_limit,p_lease_seconds);
end $$;

create function private.claim_planning_overdue(p_after uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  insert into private.planning_job_claims(job_name,resource_id,natural_key)
  select 'planning.overdue.mark',i.id,i.id::text||':'||i.version::text
  from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
  where o.status='active' and i.status in ('due','partial') and i.paid_minor<i.amount_minor
    and i.due_at<clock_timestamp()
  on conflict(job_name,natural_key) do nothing;
  return query select * from private.claim_planning_job('planning.overdue.mark',p_after,p_limit,p_lease_seconds);
end $$;

create function private.claim_planning_reminders(p_after uuid,p_limit integer,p_lease_seconds integer)
returns setof private.planning_job_claims language plpgsql security definer set search_path='' as $$
begin
  insert into private.planning_job_claims(job_name,resource_id,natural_key)
  select 'planning.reminders.emit',i.id,i.id::text||':'||i.due_at::text
  from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
  where o.status='active' and o.reminder_timing is not null and i.status in ('due','partial','overdue')
    and i.due_at<=clock_timestamp()+interval '7 days'
  on conflict(job_name,natural_key) do nothing;
  return query select * from private.claim_planning_job('planning.reminders.emit',p_after,p_limit,p_lease_seconds);
end $$;

create function private.execute_planning_claim(
  p_claim_id uuid,p_lease_token uuid,p_job_name text,p_resource_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id text; schedule record; intent_id uuid; result jsonb;
begin
  perform 1 from private.planning_job_claims
  where id=p_claim_id and lease_token=p_lease_token and status='running'
    and locked_until>clock_timestamp() and job_name=p_job_name and resource_id=p_resource_id
  for update;
  if not found then raise exception using errcode='P0001',message='PLANNING_CLAIM_STALE'; end if;

  if p_job_name='planning.salary-cycle.generate' then
    select user_id into owner_id from public.salary_profiles where id=p_resource_id and status='active';
    if owner_id is null then raise exception using errcode='P0001',message='PLANNING_RESOURCE_NOT_FOUND'; end if;
    select jsonb_build_object('insertedCount',inserted_count,'existingCount',existing_count) into result
      from private.generate_salary_receipts(owner_id,p_resource_id,current_date+90);
  elsif p_job_name='planning.obligation-schedule.generate' then
    select user_id into owner_id from public.obligations where id=p_resource_id and status='active';
    if owner_id is null then raise exception using errcode='P0001',message='PLANNING_RESOURCE_NOT_FOUND'; end if;
    select jsonb_build_object('insertedCount',inserted_count,'existingCount',existing_count) into result
      from private.generate_obligation_schedule(
        owner_id,p_resource_id,(current_date+interval '18 months')::date
      );
  elsif p_job_name='planning.payment-match.propose' then
    select jsonb_build_object('insertedCount',inserted_count,'existingCount',existing_count) into result
      from private.propose_payment_matches(p_resource_id,20);
  elsif p_job_name='planning.overdue.mark' then
    select i.user_id,i.obligation_id,i.version,i.due_at into schedule
      from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
      where i.id=p_resource_id and o.status='active' and i.status in ('due','partial')
        and i.paid_minor<i.amount_minor and i.due_at<clock_timestamp()
      for update of i;
    if schedule.user_id is null then
      result=jsonb_build_object('insertedCount',0,'existingCount',1);
    else
      update public.obligation_schedule_items set status='overdue' where id=p_resource_id;
      perform private.enqueue_outbox_event('planning.obligation_overdue','obligation-schedule',p_resource_id,
        jsonb_build_object('obligationId',schedule.obligation_id,'scheduleItemId',p_resource_id,
          'userId',schedule.user_id,'aggregateVersion',schedule.version+1,'dueAt',schedule.due_at,
          'status','overdue','ledgerVersion',0,'requestId','planning-overdue'));
      perform audit.append_event(schedule.user_id,'system','planning.obligation-overdue','obligation_schedule',
        p_resource_id::text,null,null,null,'planning-overdue',jsonb_build_object('version',schedule.version+1));
      result=jsonb_build_object('insertedCount',1,'existingCount',0);
    end if;
  elsif p_job_name='planning.reminders.emit' then
    select i.id,i.user_id,i.obligation_id,i.due_at,o.version into schedule
      from public.obligation_schedule_items i join public.obligations o on o.id=i.obligation_id
      where i.id=p_resource_id and o.status='active';
    if schedule.id is null then raise exception using errcode='P0001',message='PLANNING_RESOURCE_NOT_FOUND'; end if;
    insert into private.planning_reminder_intents(user_id,resource_type,resource_id,due_at,reason_code)
      values(schedule.user_id,'obligation',schedule.obligation_id,schedule.due_at,'obligation_due')
      on conflict(resource_type,resource_id,due_at,reason_code) do nothing returning id into intent_id;
    if intent_id is not null then
      perform private.enqueue_outbox_event('planning.reminder_intent_created','obligation',schedule.obligation_id,
        jsonb_build_object('obligationId',schedule.obligation_id,'userId',schedule.user_id,
          'aggregateVersion',schedule.version,'dueAt',schedule.due_at,'reasonCode','obligation_due',
          'ledgerVersion',0,'requestId','planning-reminder-worker'));
    end if;
    result=jsonb_build_object('insertedCount',case when intent_id is null then 0 else 1 end,
      'existingCount',case when intent_id is null then 1 else 0 end);
  else
    raise exception using errcode='22023',message='PLANNING_JOB_INVALID';
  end if;
  return coalesce(result,'{}'::jsonb);
end $$;

create function private.complete_planning_claim(p_claim_id uuid,p_lease_token uuid,p_outcome text,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_outcome not in ('completed','retry','exhausted') or p_result is null or jsonb_typeof(p_result)<>'object' or pg_column_size(p_result)>4096 then
    raise exception using errcode='22023',message='PLANNING_COMPLETION_INVALID';
  end if;
  update private.planning_job_claims set
    status=case p_outcome when 'completed' then 'completed' when 'exhausted' then 'exhausted' else 'failed' end,
    result=case when p_outcome='completed' then p_result else null end,
    error_code=case when p_outcome='completed' then null else coalesce(p_result->>'errorCode','PLANNING_JOB_FAILED') end,
    available_at=case when p_outcome='retry' then clock_timestamp()+make_interval(secs=>least(300,attempt_count*attempt_count*5)) else available_at end,
    locked_by=null,locked_until=null,lease_token=null,updated_at=clock_timestamp()
  where id=p_claim_id and status='running' and lease_token=p_lease_token and locked_until>clock_timestamp();
  if not found then raise exception using errcode='P0001',message='PLANNING_CLAIM_STALE'; end if;
end $$;

create function private.reconcile_planning(p_after uuid,p_repair boolean,p_limit integer)
returns table(resource_id uuid,resource_type text,difference_code text,repaired boolean)
language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 500 then raise exception using errcode='22023',message='RECONCILIATION_REQUEST_INVALID'; end if;
  return query
  with expected as (
    select i.id,i.paid_minor,
      coalesce(sum(a.amount_minor) filter(where p.status='confirmed'),0)::bigint derived
    from public.obligation_schedule_items i
    left join public.obligation_payment_allocations a on a.schedule_item_id=i.id
    left join public.obligation_payments p on p.id=a.payment_id
    where i.id>coalesce(p_after,'00000000-0000-0000-0000-000000000000'::uuid)
    group by i.id
    having i.paid_minor<>least(
      i.amount_minor,
      coalesce(sum(a.amount_minor) filter(where p.status='confirmed'),0)::bigint
    )
    order by i.id limit p_limit
  ), repaired_rows as (
    update public.obligation_schedule_items i set paid_minor=least(i.amount_minor,e.derived),
      status=case when e.derived<=0 and i.status not in ('skipped','cancelled') then 'due'
        when e.derived<i.amount_minor and i.status not in ('skipped','cancelled') then 'partial'
        when e.derived>=i.amount_minor and i.status not in ('skipped','cancelled') then 'paid' else i.status end
    from expected e where p_repair and i.id=e.id and i.paid_minor<>least(i.amount_minor,e.derived)
    returning i.id
  )
  select e.id,'obligation_schedule_item'::text,'paid_projection'::text,
    exists(select 1 from repaired_rows r where r.id=e.id)
  from expected e where e.paid_minor<>least(e.derived,(select amount_minor from public.obligation_schedule_items where id=e.id));
end $$;

do $$
declare signature regprocedure;
begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in (
      'save_salary_profile','link_salary_receipt','save_budget','replace_budget_categories',
      'save_obligation','allocate_obligation_payment','propose_payment_matches','decide_payment_match','save_savings_goal',
      'record_savings_movement','reverse_savings_movement','generate_salary_receipts',
      'generate_obligation_schedule','mark_planning_overdue','claim_planning_job',
      'claim_planning_salary_cycles','claim_planning_obligation_schedules',
      'claim_planning_match_candidates','claim_planning_reminders','complete_planning_claim','reconcile_planning'
      ,'execute_planning_claim'
    )
  loop
    execute format('alter function %s owner to masarifi_migration',signature);
    execute format('revoke all on function %s from public',signature);
  end loop;
end $$;

revoke all on private.planning_job_claims,private.planning_reminder_intents
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
revoke all on public.v_salary_cycle_summary,public.v_budget_utilization,public.v_obligation_status
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
