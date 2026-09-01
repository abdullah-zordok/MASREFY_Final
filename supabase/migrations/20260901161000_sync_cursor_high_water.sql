grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.sync_cursor_migration_barrier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(2147483647,20260901);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
alter function private.sync_cursor_migration_barrier() owner to masarifi_migration;
revoke all on function private.sync_cursor_migration_barrier() from public;
create trigger a_sync_cursor_migration_barrier
before insert or update or delete on private.outbox_events
for each row execute function private.sync_cursor_migration_barrier();
select pg_catalog.pg_advisory_lock(2147483647,20260901);

create table private.sync_cursor_positions (
  user_id text not null references public.profiles(id) on update restrict on delete cascade,
  domain text not null,
  last_cursor bigint not null,
  primary key(user_id,domain),
  constraint sync_cursor_positions_domain_check
    check(domain in ('accounts','categories','transactions','planning')),
  constraint sync_cursor_positions_cursor_check check(last_cursor>0)
);
alter table private.sync_cursor_positions owner to masarifi_migration;
revoke all on private.sync_cursor_positions from public;

with observed as (
  select o.payload#>>'{sync,userId}' user_id,o.payload#>>'{sync,domain}' domain,
    max((o.payload#>>'{sync,cursor}')::bigint) last_cursor
  from private.outbox_events o where o.payload?'sync'
  group by o.payload#>>'{sync,userId}',o.payload#>>'{sync,domain}'
  union all
  select s.user_id,s.domain,max(s.last_issued_cursor)
  from public.client_sync_state s group by s.user_id,s.domain
), high_water as (
  select user_id,domain,max(last_cursor) last_cursor from observed
  where last_cursor>0 group by user_id,domain
)
insert into private.sync_cursor_positions(user_id,domain,last_cursor)
select user_id,domain,last_cursor from high_water;

create function private.next_sync_cursor(p_user_id text,p_domain text)
returns bigint language sql security definer set search_path='' as $$
  insert into private.sync_cursor_positions(user_id,domain,last_cursor)
  values(p_user_id,p_domain,1)
  on conflict(user_id,domain) do update
    set last_cursor=private.sync_cursor_positions.last_cursor+1
  returning last_cursor
$$;
alter function private.next_sync_cursor(text,text) owner to masarifi_migration;
revoke all on function private.next_sync_cursor(text,text) from public;

create or replace function private.attach_outbox_sync_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  owner_id text;
  sync_domain text;
  resource_type text;
  sync_operation text;
  resource_version bigint;
  resource_snapshot jsonb;
  deleted_at timestamptz;
  next_cursor bigint;
begin
  if new.payload ? 'sync' then
    raise exception using errcode='22023',message='SYNC_METADATA_RESERVED';
  end if;

  if new.aggregate_type='account' and new.event_type in (
    'account.created','account.updated','account.archived','account.closed'
  ) then
    select a.user_id,a.version,jsonb_build_object(
      'id',a.id,'name',a.name,'type',a.type,'currency_code',a.currency_code,
      'institution_name',a.institution_name,'last_four',a.last_four,
      'credit_limit_minor',a.credit_limit_minor,'is_default',a.is_default,
      'icon_key',a.icon_key,'color_key',a.color_key,'notes',a.notes,
      'status',a.status,'sort_order',a.sort_order,'include_in_totals',a.include_in_totals,
      'opened_at',a.opened_at,'closed_at',a.closed_at,'deleted_at',a.deleted_at,
      'created_at',a.created_at,'updated_at',a.updated_at,'version',a.version
    ),a.deleted_at
    into owner_id,resource_version,resource_snapshot,deleted_at
    from public.accounts a where a.id=new.aggregate_id;
    sync_domain='accounts'; resource_type='account';
    sync_operation=case when new.event_type in ('account.archived','account.closed') then 'delete' else 'upsert' end;
    if new.event_type='account.closed' then
      deleted_at=coalesce(deleted_at,(resource_snapshot->>'closed_at')::date::timestamptz);
    end if;
  elsif new.aggregate_type='category' and new.event_type in (
    'category.created','category.updated','category.deleted','category.merged'
  ) then
    select c.user_id,c.version,jsonb_build_object(
      'id',c.id,'parent_id',c.parent_id,'merged_into_id',c.merged_into_id,
      'kind',c.kind,'label_ar',c.label_ar,'label_en',c.label_en,
      'icon',c.icon,'color',c.color,'system_key',c.system_key,
      'sort_order',c.sort_order,'active',c.active,'deleted_at',c.deleted_at,
      'created_at',c.created_at,'updated_at',c.updated_at,'version',c.version
    ),c.deleted_at
    into owner_id,resource_version,resource_snapshot,deleted_at
    from public.categories c where c.id=new.aggregate_id and c.user_id is not null;
    sync_domain='categories'; resource_type='category';
    sync_operation=case when new.event_type in ('category.deleted','category.merged') then 'delete' else 'upsert' end;
  elsif new.aggregate_type='transaction' and new.event_type in (
    'transaction.created','transfer.created','transaction.refunded','transaction.reversed',
    'transaction.revised','transaction.deleted','transaction.restored'
  ) then
    select t.user_id,t.version,jsonb_build_object(
      'id',t.id,'kind',t.kind,'status',t.status,
      'amount_minor',t.amount_minor,'fee_minor',t.fee_minor,
      'currency_code',t.currency_code,'category_id',t.category_id,
      'title',t.title,'merchant',t.merchant,'payment_method',t.payment_method,
      'note',t.note,'occurred_at',t.occurred_at,'source',t.source,
      'reverses_transaction_id',t.reverses_transaction_id,
      'deleted_at',t.deleted_at,'undo_expires_at',t.undo_expires_at,
      'created_at',t.created_at,'updated_at',t.updated_at,'version',t.version,
      'postings',coalesce((
        select jsonb_agg(jsonb_build_object(
          'account_id',p.account_id,'amount_minor',p.amount_minor,
          'clearing_state',p.clearing_state,'posting_role',p.posting_role,
          'occurred_at',p.occurred_at
        ) order by p.posting_role,p.id)
        from public.transaction_postings p where p.transaction_id=t.id
      ),'[]'::jsonb)
    ),t.deleted_at
    into owner_id,resource_version,resource_snapshot,deleted_at
    from public.transactions t where t.id=new.aggregate_id;
    sync_domain='transactions'; resource_type='transaction';
    sync_operation=case when new.event_type='transaction.deleted' then 'delete' else 'upsert' end;
  else
    return new;
  end if;

  if owner_id is null or resource_snapshot is null then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id||chr(31)||sync_domain,0)
  );
  next_cursor=private.next_sync_cursor(owner_id,sync_domain);

  new.payload=new.payload||jsonb_build_object('sync',jsonb_strip_nulls(jsonb_build_object(
    'userId',owner_id,
    'domain',sync_domain,
    'cursor',next_cursor,
    'resourceId',new.aggregate_id,
    'resourceType',resource_type,
    'operation',sync_operation,
    'version',resource_version,
    'snapshot',case when sync_operation='upsert' then resource_snapshot else null end,
    'deletedAt',case when sync_operation='delete' then coalesce(deleted_at,clock_timestamp()) else null end
  )));
  return new;
end $$;

create or replace function private.attach_planning_sync_metadata() returns trigger
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
  next_cursor=private.next_sync_cursor(owner_id,'planning');
  new.payload=new.payload||jsonb_build_object('sync',jsonb_strip_nulls(jsonb_build_object('userId',owner_id,
    'domain','planning','cursor',next_cursor,'resourceId',new.aggregate_id,'resourceType',resource_type,
    'operation',sync_operation,'version',resource_version,'snapshot',case when sync_operation='upsert' then resource_snapshot else null end,
    'deletedAt',case when sync_operation='delete' then coalesce(deleted_at,clock_timestamp()) else null end)));
  return new;
end $$;

create or replace function private.get_sync_bounds(p_user_id text,p_domain text)
returns table(oldest bigint,current_cursor bigint)
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if p_domain not in ('accounts','categories','transactions','planning') then
    raise exception using errcode='22023',message='SYNC_DOMAIN_INVALID';
  end if;
  return query select coalesce(min((o.payload#>>'{sync,cursor}')::bigint),0),
    coalesce((select p.last_cursor from private.sync_cursor_positions p
      where p.user_id=p_user_id and p.domain=p_domain),0)
  from private.outbox_events o where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain;
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
  select coalesce(p.last_cursor,0) into server_cursor
    from (select 1) seed left join private.sync_cursor_positions p
      on p.user_id=p_user_id and p.domain=p_domain;
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

create or replace function private.check_sync_reconciliation()
returns integer language sql security definer set search_path='' stable as $$
  with observed_cursor as (
    select user_id,domain,max(cursor) cursor from (
      select o.payload#>>'{sync,userId}' user_id,o.payload#>>'{sync,domain}' domain,
        max((o.payload#>>'{sync,cursor}')::bigint) cursor
      from private.outbox_events o where o.payload?'sync'
      group by o.payload#>>'{sync,userId}',o.payload#>>'{sync,domain}'
      union all
      select s.user_id,s.domain,max(greatest(s.last_cursor,s.last_issued_cursor))
      from public.client_sync_state s group by s.user_id,s.domain
    ) observed group by user_id,domain
  ), cursor_drift as (
    select o.user_id||':'||o.domain issue from observed_cursor o
    left join private.sync_cursor_positions p on p.user_id=o.user_id and p.domain=o.domain
    where p.last_cursor is null or p.last_cursor<o.cursor
  ), cursor_gaps as (
    select (o.payload#>>'{sync,userId}')||':'||(o.payload#>>'{sync,domain}') issue
    from private.outbox_events o where o.payload?'sync'
    group by o.payload#>>'{sync,userId}',o.payload#>>'{sync,domain}'
    having count(*)<>(max((o.payload#>>'{sync,cursor}')::bigint)
      -min((o.payload#>>'{sync,cursor}')::bigint)+1)
  ), conflict_drift as (
    select m.id::text issue from public.client_mutations m
    where (m.status='conflict')<>exists(
      select 1 from public.transaction_conflicts c where c.client_mutation_id=m.id
    )
  )
  select count(*)::integer from (
    select issue from cursor_drift union all
    select issue from cursor_gaps union all
    select issue from conflict_drift
  ) drift;
$$;

select pg_catalog.pg_advisory_unlock(2147483647,20260901);
drop trigger a_sync_cursor_migration_barrier on private.outbox_events;
drop function private.sync_cursor_migration_barrier();

reset role;
revoke masarifi_migration from current_user granted by current_user;
