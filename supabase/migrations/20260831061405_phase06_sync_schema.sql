grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

alter table private.idempotency_keys
  add column lease_token uuid;

update private.idempotency_keys
set lease_token=extensions.gen_random_uuid()
where state='claimed' and lease_token is null;

create table public.client_mutations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  device_id uuid not null references public.user_devices(id) on update restrict on delete restrict,
  factor_age_seconds integer,
  operation_id uuid not null,
  domain text not null,
  resource_type text not null,
  schema_version integer not null,
  depends_on uuid[] not null default '{}',
  resource_id text,
  operation text not null,
  base_version bigint,
  payload_hash text not null,
  payload jsonb not null,
  status text not null default 'received',
  result jsonb,
  error jsonb,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  locked_by text,
  locked_until timestamptz,
  lease_token uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_mutations_domain_check check (domain in ('accounts','categories','transactions')),
  constraint client_mutations_resource_type_check check (
    (domain='accounts' and resource_type='account')
    or (domain='categories' and resource_type='category')
    or (domain='transactions' and resource_type='transaction')
  ),
  constraint client_mutations_schema_version_check check (schema_version=1),
  constraint client_mutations_dependencies_check check (
    cardinality(depends_on)<=100 and array_position(depends_on,null) is null
    and not operation_id=any(depends_on)
  ),
  constraint client_mutations_factor_age_check check (
    factor_age_seconds is null or factor_age_seconds>=0
  ),
  constraint client_mutations_resource_check check (
    resource_id is null or (
      resource_id=btrim(resource_id) and char_length(resource_id) between 1 and 128
      and resource_id !~ '[[:cntrl:]]'
    )
  ),
  constraint client_mutations_operation_check check (
    operation in ('create','update','archive','restore','delete')
  ),
  constraint client_mutations_base_version_check check (base_version is null or base_version>=0),
  constraint client_mutations_payload_hash_check check (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint client_mutations_payload_check check (
    jsonb_typeof(payload)='object' and pg_column_size(payload)<=65536
  ),
  constraint client_mutations_status_check check (
    status in ('received','processing','applied','conflict','rejected')
  ),
  constraint client_mutations_attempt_check check (attempt_count>=0),
  constraint client_mutations_lease_check check (
    (status='processing')=(locked_by is not null and locked_until is not null and lease_token is not null)
  ),
  constraint client_mutations_locked_by_check check (
    locked_by is null or (
      locked_by=btrim(locked_by) and char_length(locked_by) between 1 and 128
      and locked_by !~ '[[:cntrl:]]'
    )
  ),
  constraint client_mutations_terminal_check check (
    (status in ('applied','conflict','rejected'))=(processed_at is not null)
  ),
  constraint client_mutations_outcome_check check (
    (status in ('received','processing') and result is null and error is null)
    or (status in ('applied','conflict') and result is not null and error is null)
    or (status='rejected' and result is null and error is not null)
  ),
  constraint client_mutations_result_check check (
    result is null or (jsonb_typeof(result)='object' and pg_column_size(result)<=65536)
  ),
  constraint client_mutations_error_check check (
    error is null or (jsonb_typeof(error)='object' and pg_column_size(error)<=8192)
  )
);

alter table public.client_mutations owner to masarifi_migration;
create unique index client_mutations_owner_operation_uq
  on public.client_mutations(user_id,operation_id);
create index client_mutations_claim_idx
  on public.client_mutations(coalesce(next_attempt_at,created_at),created_at,id)
  where status in ('received','processing');
create index client_mutations_device_cursor_idx
  on public.client_mutations(user_id,device_id,created_at,id);

create table public.client_sync_state (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  device_id uuid not null references public.user_devices(id) on update restrict on delete restrict,
  domain text not null,
  last_cursor bigint not null default 0,
  last_issued_cursor bigint not null default 0,
  last_synced_at timestamptz,
  last_ack_mutation uuid references public.client_mutations(id) on update restrict on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_sync_state_domain_check check (domain in ('accounts','categories','transactions')),
  constraint client_sync_state_cursor_check check (
    last_cursor>=0 and last_issued_cursor>=last_cursor
  )
);

alter table public.client_sync_state owner to masarifi_migration;
create unique index client_sync_state_owner_device_domain_uq
  on public.client_sync_state(user_id,device_id,domain);

create table public.transaction_conflicts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  client_mutation_id uuid not null references public.client_mutations(id) on update restrict on delete restrict,
  server_version bigint not null,
  client_version bigint not null,
  conflict_fields text[] not null,
  server_snapshot jsonb not null,
  client_snapshot jsonb not null,
  status text not null default 'open',
  resolution text,
  resolution_payload jsonb,
  resolution_key_hash text,
  resolution_request_hash text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_conflicts_versions_check check (server_version>0 and client_version>=0),
  constraint transaction_conflicts_fields_check check (
    cardinality(conflict_fields) between 1 and 64
    and array_position(conflict_fields,null) is null
  ),
  constraint transaction_conflicts_snapshots_check check (
    jsonb_typeof(server_snapshot)='object' and jsonb_typeof(client_snapshot)='object'
    and pg_column_size(server_snapshot)<=65536 and pg_column_size(client_snapshot)<=65536
  ),
  constraint transaction_conflicts_status_check check (status in ('open','resolved','rejected')),
  constraint transaction_conflicts_resolution_check check (
    (status='open' and resolution is null and resolution_payload is null and resolved_at is null)
    or (
      status in ('resolved','rejected') and resolved_at is not null
      and resolution in ('server','client','merged','duplicate')
    )
  ),
  constraint transaction_conflicts_resolution_payload_check check (
    resolution_payload is null or (
      jsonb_typeof(resolution_payload)='object' and pg_column_size(resolution_payload)<=65536
    )
  ),
  constraint transaction_conflicts_resolution_hashes_check check (
    (resolution_key_hash is null and resolution_request_hash is null)
    or (
      resolution_key_hash~'^sha256:[0-9a-f]{64}$'
      and resolution_request_hash~'^sha256:[0-9a-f]{64}$'
    )
  )
);

alter table public.transaction_conflicts owner to masarifi_migration;
create index transaction_conflicts_owner_status_cursor_idx
  on public.transaction_conflicts(user_id,status,created_at,id);
create index transaction_conflicts_transaction_idx
  on public.transaction_conflicts(transaction_id);
create unique index transaction_conflicts_open_mutation_uq
  on public.transaction_conflicts(client_mutation_id) where status='open';

alter table public.client_sync_state enable row level security;
alter table public.client_sync_state force row level security;
alter table public.client_mutations enable row level security;
alter table public.client_mutations force row level security;
alter table public.transaction_conflicts enable row level security;
alter table public.transaction_conflicts force row level security;

revoke all on public.client_sync_state,public.client_mutations,public.transaction_conflicts
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
grant select on public.client_sync_state,public.client_mutations,public.transaction_conflicts
to masarifi_api;

create policy client_sync_state_migration_all on public.client_sync_state
for all to masarifi_migration using(true) with check(true);
create policy client_mutations_migration_all on public.client_mutations
for all to masarifi_migration using(true) with check(true);
create policy transaction_conflicts_migration_all on public.transaction_conflicts
for all to masarifi_migration using(true) with check(true);

create policy client_sync_state_api_owner_select on public.client_sync_state
for select to masarifi_api using(
  user_id=public.current_clerk_user_id()
  and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')
  and not exists(select 1 from public.admin_profiles a where a.user_id=user_id)
);
create policy client_mutations_api_owner_select on public.client_mutations
for select to masarifi_api using(
  user_id=public.current_clerk_user_id()
  and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')
  and not exists(select 1 from public.admin_profiles a where a.user_id=user_id)
);
create policy transaction_conflicts_api_owner_select on public.transaction_conflicts
for select to masarifi_api using(
  user_id=public.current_clerk_user_id()
  and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')
  and not exists(select 1 from public.admin_profiles a where a.user_id=user_id)
);

create function private.guard_client_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.user_id is distinct from new.user_id
    or old.device_id is distinct from new.device_id
    or old.operation_id is distinct from new.operation_id
    or old.domain is distinct from new.domain
    or old.resource_type is distinct from new.resource_type
    or old.schema_version is distinct from new.schema_version
    or old.depends_on is distinct from new.depends_on
    or old.resource_id is distinct from new.resource_id
    or old.operation is distinct from new.operation
    or old.base_version is distinct from new.base_version
    or old.payload_hash is distinct from new.payload_hash
    or old.payload is distinct from new.payload
    or old.created_at is distinct from new.created_at then
    raise exception using errcode='42501',message='SYNC_MUTATION_IMMUTABLE';
  end if;
  if old.status in ('applied','conflict','rejected') and new is distinct from old then
    raise exception using errcode='42501',message='SYNC_MUTATION_TERMINAL';
  end if;
  if not (
    (old.status='received' and new.status in ('received','processing','rejected'))
    or (old.status='processing' and new.status in ('received','processing','applied','conflict','rejected'))
  ) then
    raise exception using errcode='42501',message='SYNC_MUTATION_STATE_INVALID';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
alter function private.guard_client_mutation() owner to masarifi_migration;
revoke all on function private.guard_client_mutation() from public;
create trigger client_mutations_guard before update or delete on public.client_mutations
for each row execute function private.guard_client_mutation();

create function private.guard_transaction_conflict() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.user_id is distinct from new.user_id
    or old.transaction_id is distinct from new.transaction_id
    or old.client_mutation_id is distinct from new.client_mutation_id
    or old.server_version is distinct from new.server_version
    or old.client_version is distinct from new.client_version
    or old.conflict_fields is distinct from new.conflict_fields
    or old.created_at is distinct from new.created_at then
    raise exception using errcode='42501',message='SYNC_CONFLICT_IMMUTABLE';
  end if;
  if old.status<>'open' and new is distinct from old then
    if new.server_snapshot<>'{}'::jsonb or new.client_snapshot<>'{}'::jsonb
      or new.status is distinct from old.status
      or new.resolution is distinct from old.resolution
      or new.resolution_payload is distinct from old.resolution_payload
      or new.resolution_key_hash is distinct from old.resolution_key_hash
      or new.resolution_request_hash is distinct from old.resolution_request_hash
      or new.resolved_at is distinct from old.resolved_at then
      raise exception using errcode='42501',message='SYNC_CONFLICT_TERMINAL';
    end if;
  elsif old.server_snapshot is distinct from new.server_snapshot
    or old.client_snapshot is distinct from new.client_snapshot then
    raise exception using errcode='42501',message='SYNC_CONFLICT_IMMUTABLE';
  end if;
  if old.status='open' and new.status not in ('open','resolved','rejected') then
    raise exception using errcode='42501',message='SYNC_CONFLICT_STATE_INVALID';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
alter function private.guard_transaction_conflict() owner to masarifi_migration;
revoke all on function private.guard_transaction_conflict() from public;
create trigger transaction_conflicts_guard before update or delete on public.transaction_conflicts
for each row execute function private.guard_transaction_conflict();

create function private.guard_outbox_payload() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.payload is distinct from old.payload
    or new.event_type is distinct from old.event_type
    or new.aggregate_type is distinct from old.aggregate_type
    or new.aggregate_id is distinct from old.aggregate_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501',message='OUTBOX_PAYLOAD_IMMUTABLE';
  end if;
  return new;
end $$;
alter function private.guard_outbox_payload() owner to masarifi_migration;
revoke all on function private.guard_outbox_payload() from public;
create trigger outbox_events_payload_immutable before update on private.outbox_events
for each row execute function private.guard_outbox_payload();

create function private.attach_outbox_sync_metadata() returns trigger
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
  select coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0)+1
  into next_cursor
  from private.outbox_events o
  where o.payload?'sync' and o.payload#>>'{sync,userId}'=owner_id
    and o.payload#>>'{sync,domain}'=sync_domain;

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
alter function private.attach_outbox_sync_metadata() owner to masarifi_migration;
revoke all on function private.attach_outbox_sync_metadata() from public;
create trigger outbox_events_sync_metadata before insert on private.outbox_events
for each row execute function private.attach_outbox_sync_metadata();

create function private.assert_active_sync_device(p_user_id text,p_device_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare session_id text:=nullif(btrim(
  coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sid'
),'');
begin
  perform private.assert_active_profile(p_user_id);
  if p_device_id is null or session_id is null
    or not exists(
      select 1 from public.user_devices d
      where d.id=p_device_id and d.user_id=p_user_id and d.revoked_at is null
        and d.clerk_session_id=session_id
    ) then
    raise exception using errcode='P0001',message='DEVICE_NOT_FOUND';
  end if;
end $$;
alter function private.assert_active_sync_device(text,uuid) owner to masarifi_migration;
revoke all on function private.assert_active_sync_device(text,uuid) from public;

create unique index outbox_events_sync_cursor_uq on private.outbox_events(
  (payload#>>'{sync,userId}'),(payload#>>'{sync,domain}'),((payload#>>'{sync,cursor}')::bigint)
) where payload ? 'sync';
create index outbox_events_sync_delta_idx on private.outbox_events(
  (payload#>>'{sync,userId}'),(payload#>>'{sync,domain}'),((payload#>>'{sync,cursor}')::bigint),id
) where payload ? 'sync';

create function private.get_sync_bounds(p_user_id text,p_domain text)
returns table(oldest bigint,current_cursor bigint)
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if p_domain not in ('accounts','categories','transactions') then
    raise exception using errcode='22023',message='SYNC_DOMAIN_INVALID';
  end if;
  return query select
    coalesce(min((o.payload#>>'{sync,cursor}')::bigint),0),
    coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0)
  from private.outbox_events o
  where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain;
end $$;
alter function private.get_sync_bounds(text,text) owner to masarifi_migration;
revoke all on function private.get_sync_bounds(text,text) from public;

create function private.get_sync_delta(
  p_user_id text,p_domain text,p_after bigint,p_limit integer
) returns table(
  "position" bigint,resource_id text,resource_type text,operation text,
  resource_version bigint,snapshot jsonb,deleted_at timestamptz
) language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if p_domain not in ('accounts','categories','transactions') or p_after<0
    or p_limit not between 1 and 501 then
    raise exception using errcode='22023',message='SYNC_DELTA_INVALID';
  end if;
  return query select
    (o.payload#>>'{sync,cursor}')::bigint,
    o.payload#>>'{sync,resourceId}',o.payload#>>'{sync,resourceType}',
    o.payload#>>'{sync,operation}',(o.payload#>>'{sync,version}')::bigint,
    o.payload#>'{sync,snapshot}',(o.payload#>>'{sync,deletedAt}')::timestamptz
  from private.outbox_events o
  where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain
    and (o.payload#>>'{sync,cursor}')::bigint>p_after
  order by (o.payload#>>'{sync,cursor}')::bigint,o.id limit p_limit;
end $$;
alter function private.get_sync_delta(text,text,bigint,integer) owner to masarifi_migration;
revoke all on function private.get_sync_delta(text,text,bigint,integer) from public;

create function private.claim_sync_idempotency_key(
  p_actor_id text,p_scope text,p_key_hash text,p_request_hash text,p_ttl interval
) returns table(
  outcome text,response_status integer,response_body jsonb,resource_ref text,
  retry_after_seconds integer,lease_token uuid
) language plpgsql security definer set search_path='' as $$
declare claimed record; new_token uuid;
begin
  select * into claimed from private.claim_idempotency_key(
    p_actor_id,p_scope,p_key_hash,p_request_hash,p_ttl
  );
  if claimed.outcome='new' then
    new_token=extensions.gen_random_uuid();
    update private.idempotency_keys k set lease_token=new_token
    where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash
      and k.request_hash=p_request_hash and k.state='claimed';
  end if;
  return query select claimed.outcome,claimed.response_status,claimed.response_body,
    claimed.resource_ref,claimed.retry_after_seconds,new_token;
end $$;
alter function private.claim_sync_idempotency_key(text,text,text,text,interval) owner to masarifi_migration;
revoke all on function private.claim_sync_idempotency_key(text,text,text,text,interval) from public;

create function private.complete_sync_idempotency_key(
  p_actor_id text,p_scope text,p_key_hash text,p_request_hash text,p_lease_token uuid,
  p_response_status integer,p_response_body jsonb,p_resource_ref text
) returns void language plpgsql security definer set search_path='' as $$
declare existing private.idempotency_keys;
begin
  perform private.assert_active_profile(p_actor_id);
  if p_lease_token is null then
    raise exception using errcode='22023',message='IDEMPOTENCY_LEASE_INVALID';
  end if;
  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash for update;
  if existing.id is null then
    raise exception using errcode='P0001',message='IDEMPOTENCY_CLAIM_MISSING';
  elsif existing.request_hash<>p_request_hash then
    raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSED';
  elsif existing.lease_token is distinct from p_lease_token then
    raise exception using errcode='P0001',message='IDEMPOTENCY_LEASE_LOST';
  end if;
  perform private.complete_idempotency_key(
    p_actor_id,p_scope,p_key_hash,p_request_hash,p_response_status,p_response_body,p_resource_ref
  );
end $$;
alter function private.complete_sync_idempotency_key(text,text,text,text,uuid,integer,jsonb,text) owner to masarifi_migration;
revoke all on function private.complete_sync_idempotency_key(text,text,text,text,uuid,integer,jsonb,text) from public;

create function private.receive_client_mutation(
  p_user_id text,p_device_id uuid,p_factor_age_seconds integer,p_operation_id uuid,p_domain text,
  p_resource_type text,p_schema_version integer,p_depends_on uuid[],p_operation text,
  p_resource_id text,p_base_version bigint,p_payload_hash text,p_payload jsonb
) returns table(
  outcome text,mutation_id uuid,status text,result jsonb,error jsonb
) language plpgsql security definer set search_path='' as $$
declare existing public.client_mutations; inserted_id uuid;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_operation_id is null or p_domain not in ('accounts','categories','transactions')
    or not ((p_domain='accounts' and p_resource_type='account')
      or (p_domain='categories' and p_resource_type='category')
      or (p_domain='transactions' and p_resource_type='transaction'))
    or p_schema_version<>1 or p_depends_on is null or cardinality(p_depends_on)>100
    or array_position(p_depends_on,null) is not null or p_operation_id=any(p_depends_on)
    or exists(select 1 from unnest(p_depends_on) d group by d having count(*)>1)
    or exists(
      select 1 from unnest(p_depends_on) d
      where not exists(
        select 1 from public.client_mutations dependency
        where dependency.user_id=p_user_id and dependency.operation_id=d
      )
    )
    or p_operation not in ('create','update','archive','restore','delete')
    or (p_resource_id is not null and (
      p_resource_id<>btrim(p_resource_id) or char_length(p_resource_id) not between 1 and 128
      or p_resource_id~'[[:cntrl:]]'
    ))
    or (p_base_version is not null and p_base_version<0)
    or (p_factor_age_seconds is not null and p_factor_age_seconds<0)
    or p_payload_hash is null or p_payload_hash!~'^sha256:[0-9a-f]{64}$'
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>65536 then
    raise exception using errcode='22023',message='SYNC_MUTATION_INVALID';
  end if;
  insert into public.client_mutations(
    user_id,device_id,factor_age_seconds,operation_id,domain,resource_type,schema_version,
    depends_on,operation,resource_id,base_version,payload_hash,payload
  ) values (
    p_user_id,p_device_id,p_factor_age_seconds,p_operation_id,p_domain,p_resource_type,
    p_schema_version,p_depends_on,p_operation,p_resource_id,p_base_version,p_payload_hash,p_payload
  ) on conflict(user_id,operation_id) do nothing returning id into inserted_id;
  if inserted_id is not null then
    return query select 'received'::text,inserted_id,'received'::text,null::jsonb,null::jsonb;
    return;
  end if;
  select * into existing from public.client_mutations m
  where m.user_id=p_user_id and m.operation_id=p_operation_id;
  if existing.payload_hash<>p_payload_hash then
    return query select 'hash_mismatch'::text,existing.id,existing.status,existing.result,existing.error;
  else
    return query select 'replay'::text,existing.id,existing.status,existing.result,existing.error;
  end if;
end $$;
alter function private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb) owner to masarifi_migration;
revoke all on function private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb) from public;

create function private.claim_client_mutations(
  p_worker_id text,p_limit_count integer,p_lease_seconds integer
) returns setof public.client_mutations
language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or p_worker_id<>btrim(p_worker_id)
    or char_length(p_worker_id) not between 1 and 128 or p_worker_id~'[[:cntrl:]]'
    or p_limit_count is null or p_limit_count not between 1 and 100
    or p_lease_seconds is null or p_lease_seconds not between 1 and 300 then
    raise exception using errcode='22023',message='SYNC_MUTATION_CLAIM_INVALID';
  end if;
  with blocked as (
    select m.id from public.client_mutations m
    where m.status='received' and exists(
      select 1 from unnest(m.depends_on) dependency_id
      join public.client_mutations dependency
        on dependency.user_id=m.user_id and dependency.operation_id=dependency_id
      where dependency.status in ('conflict','rejected')
    )
    order by m.created_at,m.id for update skip locked limit p_limit_count
  )
  update public.client_mutations m set status='rejected',processed_at=clock_timestamp(),
    error=jsonb_build_object('code','SYNC_DEPENDENCY_REJECTED')
  from blocked where m.id=blocked.id;

  return query
  with eligible as (
    select m.id from public.client_mutations m
    where (
      m.status='received' and (m.next_attempt_at is null or m.next_attempt_at<=clock_timestamp())
      and not exists(
        select 1 from unnest(m.depends_on) dependency_id
        join public.client_mutations dependency
          on dependency.user_id=m.user_id and dependency.operation_id=dependency_id
        where dependency.status<>'applied'
      )
    ) or (m.status='processing' and m.locked_until<=clock_timestamp())
    order by coalesce(m.next_attempt_at,m.created_at),m.created_at,m.id
    for update skip locked limit p_limit_count
  )
  update public.client_mutations m set
    status='processing',attempt_count=m.attempt_count+1,
    locked_by=btrim(p_worker_id),locked_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    lease_token=extensions.gen_random_uuid(),next_attempt_at=null
  from eligible where m.id=eligible.id returning m.*;
end $$;
alter function private.claim_client_mutations(text,integer,integer) owner to masarifi_migration;
revoke all on function private.claim_client_mutations(text,integer,integer) from public;

create function private.complete_client_mutation(
  p_mutation_id uuid,p_lease_token uuid,p_status text,p_result jsonb,p_error jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare existing public.client_mutations;
begin
  if p_mutation_id is null or p_lease_token is null
    or p_status not in ('applied','conflict','rejected') then
    raise exception using errcode='22023',message='SYNC_MUTATION_COMPLETION_INVALID';
  end if;
  select * into existing from public.client_mutations m where m.id=p_mutation_id for update;
  if existing.id is null or existing.status<>'processing'
    or existing.lease_token is distinct from p_lease_token then
    raise exception using errcode='P0001',message='SYNC_MUTATION_LEASE_LOST';
  end if;
  update public.client_mutations set
    status=p_status,result=p_result,error=p_error,processed_at=clock_timestamp(),
    locked_by=null,locked_until=null,lease_token=null,next_attempt_at=null
  where id=p_mutation_id;
end $$;
alter function private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb) owner to masarifi_migration;
revoke all on function private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb) from public;

create function private.retry_client_mutation(
  p_mutation_id uuid,p_lease_token uuid,p_next_attempt_at timestamptz,p_error_code text
) returns void language plpgsql security definer set search_path='' as $$
declare existing public.client_mutations;
begin
  if p_mutation_id is null or p_lease_token is null or p_next_attempt_at is null
    or p_error_code is null or p_error_code!~'^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception using errcode='22023',message='SYNC_MUTATION_RETRY_INVALID';
  end if;
  select * into existing from public.client_mutations m where m.id=p_mutation_id for update;
  if existing.id is null or existing.status<>'processing'
    or existing.lease_token is distinct from p_lease_token then
    raise exception using errcode='P0001',message='SYNC_MUTATION_LEASE_LOST';
  end if;
  update public.client_mutations set status='received',next_attempt_at=p_next_attempt_at,
    locked_by=null,locked_until=null,lease_token=null
  where id=p_mutation_id;
end $$;
alter function private.retry_client_mutation(uuid,uuid,timestamptz,text) owner to masarifi_migration;
revoke all on function private.retry_client_mutation(uuid,uuid,timestamptz,text) from public;

create function private.ack_client_sync_cursor(
  p_user_id text,p_device_id uuid,p_domain text,p_cursor bigint,p_last_mutation uuid
) returns table(last_cursor bigint,last_synced_at timestamptz,last_ack_mutation uuid)
language plpgsql security definer set search_path='' as $$
declare server_cursor bigint; checkpoint public.client_sync_state;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_domain not in ('accounts','categories','transactions') or p_cursor is null or p_cursor<0 then
    raise exception using errcode='22023',message='SYNC_CURSOR_INVALID';
  end if;
  select coalesce(max((o.payload#>>'{sync,cursor}')::bigint),0) into server_cursor
  from private.outbox_events o
  where o.payload?'sync'
    and o.payload#>>'{sync,userId}'=p_user_id and o.payload#>>'{sync,domain}'=p_domain;
  if p_cursor>server_cursor then
    raise exception using errcode='P0001',message='SYNC_CURSOR_AHEAD';
  end if;
  if p_cursor>coalesce((
    select s.last_issued_cursor from public.client_sync_state s
    where s.user_id=p_user_id and s.device_id=p_device_id and s.domain=p_domain
  ),0) then
    raise exception using errcode='P0001',message='SYNC_CURSOR_NOT_ISSUED';
  end if;
  if p_last_mutation is not null and not exists(
    select 1 from public.client_mutations m
    where m.id=p_last_mutation and m.user_id=p_user_id and m.device_id=p_device_id
      and m.domain=p_domain and m.status in ('applied','conflict','rejected')
  ) then
    raise exception using errcode='P0001',message='SYNC_MUTATION_NOT_FOUND';
  end if;
  insert into public.client_sync_state(
    user_id,device_id,domain,last_cursor,last_issued_cursor,last_synced_at,last_ack_mutation
  ) values(
    p_user_id,p_device_id,p_domain,p_cursor,p_cursor,clock_timestamp(),p_last_mutation
  )
  on conflict(user_id,device_id,domain) do update set
    last_cursor=greatest(public.client_sync_state.last_cursor,excluded.last_cursor),
    last_synced_at=excluded.last_synced_at,
    last_ack_mutation=coalesce(excluded.last_ack_mutation,public.client_sync_state.last_ack_mutation),
    updated_at=clock_timestamp()
  returning * into checkpoint;
  return query select checkpoint.last_cursor,checkpoint.last_synced_at,checkpoint.last_ack_mutation;
end $$;
alter function private.ack_client_sync_cursor(text,uuid,text,bigint,uuid) owner to masarifi_migration;
revoke all on function private.ack_client_sync_cursor(text,uuid,text,bigint,uuid) from public;

create function private.record_sync_cursor_issued(
  p_user_id text,p_device_id uuid,p_domain text,p_cursor bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare issued bigint;
begin
  perform private.assert_active_sync_device(p_user_id,p_device_id);
  if p_domain not in ('accounts','categories','transactions') or p_cursor is null or p_cursor<0 then
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
alter function private.record_sync_cursor_issued(text,uuid,text,bigint) owner to masarifi_migration;
revoke all on function private.record_sync_cursor_issued(text,uuid,text,bigint) from public;

create function private.create_transaction_conflict(
  p_user_id text,p_client_mutation_id uuid,p_transaction_id uuid,
  p_server_version bigint,p_client_version bigint,p_conflict_fields text[],
  p_server_snapshot jsonb,p_client_snapshot jsonb
) returns public.transaction_conflicts
language plpgsql security definer set search_path='' as $$
declare conflict public.transaction_conflicts;
begin
  if not exists(
    select 1 from public.profiles p where p.id=p_user_id and p.status='active'
  ) or exists(select 1 from public.admin_profiles a where a.user_id=p_user_id) then
    raise exception using errcode='P0001',message='SYNC_CONFLICT_TARGET_INVALID';
  end if;
  if not exists(
    select 1 from public.client_mutations m
    where m.id=p_client_mutation_id and m.user_id=p_user_id and m.domain='transactions'
  ) or not exists(
    select 1 from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id
  ) then
    raise exception using errcode='P0001',message='SYNC_CONFLICT_TARGET_INVALID';
  end if;
  insert into public.transaction_conflicts(
    user_id,client_mutation_id,transaction_id,server_version,client_version,
    conflict_fields,server_snapshot,client_snapshot
  ) values(
    p_user_id,p_client_mutation_id,p_transaction_id,p_server_version,p_client_version,
    p_conflict_fields,p_server_snapshot,p_client_snapshot
  ) on conflict(client_mutation_id) where status='open' do update
    set client_mutation_id=excluded.client_mutation_id
  returning * into conflict;
  return conflict;
end $$;
alter function private.create_transaction_conflict(text,uuid,uuid,bigint,bigint,text[],jsonb,jsonb)
  owner to masarifi_migration;
revoke all on function private.create_transaction_conflict(text,uuid,uuid,bigint,bigint,text[],jsonb,jsonb)
  from public;

create function private.resolve_transaction_conflict(
  p_user_id text,p_conflict_id uuid,p_resolution text,p_payload jsonb,p_request_id text,
  p_key_hash text,p_request_hash text
) returns public.transaction_conflicts
language plpgsql security definer set search_path='' as $$
declare conflict public.transaction_conflicts;
begin
  perform private.assert_active_profile(p_user_id);
  if p_resolution not in ('server','client','merged','duplicate')
    or ((p_resolution in ('client','merged'))<>(p_payload is not null))
    or p_key_hash!~'^sha256:[0-9a-f]{64}$' or p_request_hash!~'^sha256:[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='SYNC_CONFLICT_RESOLUTION_INVALID';
  end if;
  select * into conflict from public.transaction_conflicts c
  where c.id=p_conflict_id and c.user_id=p_user_id for update;
  if conflict.id is null then
    raise exception using errcode='P0001',message='SYNC_CONFLICT_NOT_FOUND';
  elsif conflict.status<>'open' then
    if conflict.resolution_key_hash=p_key_hash and conflict.resolution_request_hash=p_request_hash then
      return conflict;
    end if;
    raise exception using errcode='P0001',message='SYNC_CONFLICT_ALREADY_RESOLVED';
  end if;
  if p_resolution in ('client','merged') then
    perform private.revise_transaction(
      p_user_id,conflict.transaction_id,conflict.server_version,p_payload,
      'Offline conflict resolution'
    );
  end if;
  update public.transaction_conflicts set status='resolved',resolution=p_resolution,
    resolution_payload=p_payload,resolution_key_hash=p_key_hash,
    resolution_request_hash=p_request_hash,resolved_at=clock_timestamp()
  where id=conflict.id returning * into conflict;
  perform audit.append_event(
    p_user_id,'user','sync.conflict.resolved','transaction_conflict',conflict.id::text,
    null,null,'conflict resolution: '||p_resolution,p_request_id,
    jsonb_build_object('resolution',p_resolution)
  );
  perform private.enqueue_outbox_event(
    'sync.conflict.resolved','transaction_conflict',conflict.id,
    jsonb_build_object('conflictId',conflict.id,'transactionId',conflict.transaction_id,
      'userId',p_user_id,'resolution',p_resolution,'occurredAt',clock_timestamp())
  );
  return conflict;
end $$;
alter function private.resolve_transaction_conflict(text,uuid,text,jsonb,text,text,text)
  owner to masarifi_migration;
revoke all on function private.resolve_transaction_conflict(text,uuid,text,jsonb,text,text,text) from public;

create function private.check_sync_reconciliation()
returns integer language sql security definer set search_path='' stable as $$
  with cursor_drift as (
    select s.id::text issue from public.client_sync_state s
    where s.last_cursor>coalesce((
      select max((o.payload#>>'{sync,cursor}')::bigint)
      from private.outbox_events o
      where o.payload?'sync' and o.payload#>>'{sync,userId}'=s.user_id
        and o.payload#>>'{sync,domain}'=s.domain
    ),0)
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
alter function private.check_sync_reconciliation() owner to masarifi_migration;
revoke all on function private.check_sync_reconciliation() from public;

create function private.run_sync_maintenance(p_job text,p_retention_days integer)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer:=0; drift integer:=0;
begin
  if p_job not in ('idempotency.cleanup','sync-state.cleanup','conflicts.expire')
    or p_retention_days is null or p_retention_days<30 or p_retention_days>3650 then
    raise exception using errcode='22023',message='SYNC_MAINTENANCE_INVALID';
  end if;
  if p_job='idempotency.cleanup' then
    with candidates as (
      select k.actor_id,k.scope,k.key_hash from private.idempotency_keys k
      where k.expires_at<=clock_timestamp()
        and (k.state<>'claimed' or k.locked_until<=clock_timestamp())
      order by k.expires_at,k.actor_id,k.scope,k.key_hash
      for update skip locked limit 1000
    )
    delete from private.idempotency_keys k using candidates c
    where (k.actor_id,k.scope,k.key_hash)=(c.actor_id,c.scope,c.key_hash);
    get diagnostics affected=row_count;
  elsif p_job='conflicts.expire' then
    with candidates as (
      select c.id from public.transaction_conflicts c
      where c.status='open'
        and c.created_at<clock_timestamp()-make_interval(days=>p_retention_days)
      order by c.created_at,c.id for update skip locked limit 1000
    )
    update public.transaction_conflicts c set status='rejected',resolution='server',
      resolution_payload=null,resolved_at=clock_timestamp()
    from candidates x where c.id=x.id;
    get diagnostics affected=row_count;
    with candidates as (
      select c.id from public.transaction_conflicts c
      where c.status in ('resolved','rejected')
        and c.resolved_at<clock_timestamp()-make_interval(days=>p_retention_days)
        and (c.server_snapshot<>'{}'::jsonb or c.client_snapshot<>'{}'::jsonb)
      order by c.resolved_at,c.id for update skip locked limit 1000
    ), minimized as (
      update public.transaction_conflicts c set server_snapshot='{}',client_snapshot='{}'
      from candidates x where c.id=x.id returning 1
    ) select affected+count(*)::integer into affected from minimized;
  else
    select private.check_sync_reconciliation() into drift;
    if drift>0 then
      raise exception using errcode='P0001',message='SYNC_RECONCILIATION_DRIFT';
    end if;
    with candidates as (
      select s.id from public.client_sync_state s
      join public.user_devices d on d.id=s.device_id and d.user_id=s.user_id
      where d.revoked_at is not null
        and s.updated_at<clock_timestamp()-make_interval(days=>p_retention_days)
      order by s.updated_at,s.id for update of s skip locked limit 1000
    ) delete from public.client_sync_state s using candidates c where s.id=c.id;
    get diagnostics affected=row_count;
    with candidates as (
      select m.id from public.client_mutations m
      where m.status in ('applied','conflict','rejected')
        and m.processed_at<clock_timestamp()-make_interval(days=>p_retention_days)
        and not exists(select 1 from public.transaction_conflicts c where c.client_mutation_id=m.id)
      order by m.processed_at,m.id for update skip locked limit 1000
    ), removed as (
      delete from public.client_mutations m using candidates c where m.id=c.id returning 1
    ) select affected+count(*)::integer into affected from removed;
    with deleted as (
      delete from private.outbox_events o using (
        select candidate.id from private.outbox_events candidate
        where candidate.payload?'sync' and candidate.published_at is not null
          and candidate.locked_until is null
          and candidate.created_at<clock_timestamp()-make_interval(days=>p_retention_days)
          and not exists(
            select 1 from public.client_sync_state s
            where s.user_id=candidate.payload#>>'{sync,userId}'
              and s.domain=candidate.payload#>>'{sync,domain}'
              and s.last_cursor<(candidate.payload#>>'{sync,cursor}')::bigint
          )
        order by candidate.created_at,candidate.id
        for update skip locked limit 1000
      ) candidates where o.id=candidates.id
        and not exists(
          select 1 from public.client_sync_state s
          where s.user_id=o.payload#>>'{sync,userId}'
            and s.domain=o.payload#>>'{sync,domain}'
            and s.last_cursor<(o.payload#>>'{sync,cursor}')::bigint
        ) returning 1
    ) select affected+count(*)::integer into affected from deleted;
  end if;
  return affected;
end $$;
alter function private.run_sync_maintenance(text,integer) owner to masarifi_migration;
revoke all on function private.run_sync_maintenance(text,integer) from public;

revoke all on function
  private.assert_active_sync_device(text,uuid),
  private.get_sync_bounds(text,text),
  private.get_sync_delta(text,text,bigint,integer),
  private.claim_sync_idempotency_key(text,text,text,text,interval),
  private.complete_sync_idempotency_key(text,text,text,text,uuid,integer,jsonb,text),
  private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb),
  private.claim_client_mutations(text,integer,integer),
  private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb),
  private.retry_client_mutation(uuid,uuid,timestamptz,text),
  private.ack_client_sync_cursor(text,uuid,text,bigint,uuid),
  private.record_sync_cursor_issued(text,uuid,text,bigint),
  private.create_transaction_conflict(text,uuid,uuid,bigint,bigint,text[],jsonb,jsonb),
  private.resolve_transaction_conflict(text,uuid,text,jsonb,text,text,text),
  private.check_sync_reconciliation(),
  private.run_sync_maintenance(text,integer)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

grant execute on function
  private.assert_active_sync_device(text,uuid),
  private.get_sync_bounds(text,text),
  private.get_sync_delta(text,text,bigint,integer),
  private.claim_sync_idempotency_key(text,text,text,text,interval),
  private.complete_sync_idempotency_key(text,text,text,text,uuid,integer,jsonb,text),
  private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb),
  private.ack_client_sync_cursor(text,uuid,text,bigint,uuid),
  private.record_sync_cursor_issued(text,uuid,text,bigint),
  private.resolve_transaction_conflict(text,uuid,text,jsonb,text,text,text)
to masarifi_api;
grant execute on function
  private.claim_client_mutations(text,integer,integer),
  private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb),
  private.retry_client_mutation(uuid,uuid,timestamptz,text),
  private.create_transaction_conflict(text,uuid,uuid,bigint,bigint,text[],jsonb,jsonb),
  private.check_sync_reconciliation(),
  private.run_sync_maintenance(text,integer)
to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
