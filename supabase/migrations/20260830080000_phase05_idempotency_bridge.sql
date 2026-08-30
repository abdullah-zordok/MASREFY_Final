grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create table private.idempotency_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id text not null,
  scope text not null,
  key_hash text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  resource_ref text,
  state text not null default 'claimed',
  locked_until timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint idempotency_keys_actor_check check (
    actor_id=btrim(actor_id) and char_length(actor_id) between 1 and 128
  ),
  constraint idempotency_keys_scope_check check (
    scope ~ '^[a-z][a-z0-9_.-]{2,127}$'
  ),
  constraint idempotency_keys_key_hash_check check (
    key_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint idempotency_keys_request_hash_check check (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint idempotency_keys_status_check check (
    response_status is null or response_status between 100 and 599
  ),
  constraint idempotency_keys_response_check check (
    response_body is null or (
      jsonb_typeof(response_body)='object' and pg_column_size(response_body)<=65536
    )
  ),
  constraint idempotency_keys_resource_check check (
    resource_ref is null or (
      resource_ref=btrim(resource_ref) and char_length(resource_ref) between 1 and 200
      and resource_ref !~ '[[:cntrl:]]'
    )
  ),
  constraint idempotency_keys_state_check check (state in ('claimed','completed','failed')),
  constraint idempotency_keys_completion_check check (
    (state='completed')=(response_status is not null and response_body is not null)
  ),
  constraint idempotency_keys_time_check check (
    locked_until>=created_at and expires_at>created_at
  )
);
alter table private.idempotency_keys owner to masarifi_migration;
create unique index idempotency_keys_actor_scope_key_uq
  on private.idempotency_keys(actor_id,scope,key_hash);
create index idempotency_keys_expires_idx on private.idempotency_keys(expires_at);
create index idempotency_keys_active_lease_idx
  on private.idempotency_keys(state,locked_until) where state='claimed';

create function private.guard_idempotency_key() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.actor_id is distinct from new.actor_id
    or old.scope is distinct from new.scope
    or old.key_hash is distinct from new.key_hash
    or old.request_hash is distinct from new.request_hash
    or old.created_at is distinct from new.created_at
    or old.expires_at is distinct from new.expires_at
    or old.state='completed' then
    raise exception using errcode='42501',message='IDEMPOTENCY_KEY_IMMUTABLE';
  end if;
  if not (
    (old.state='claimed' and new.state in ('claimed','completed','failed'))
    or (old.state='failed' and new.state='claimed')
  ) then
    raise exception using errcode='42501',message='IDEMPOTENCY_STATE_INVALID';
  end if;
  return new;
end $$;
alter function private.guard_idempotency_key() owner to masarifi_migration;
revoke all on function private.guard_idempotency_key() from public;
create trigger idempotency_keys_guard before update or delete on private.idempotency_keys
for each row execute function private.guard_idempotency_key();

create function private.claim_idempotency_key(
  p_actor_id text,
  p_scope text,
  p_key_hash text,
  p_request_hash text,
  p_ttl interval
) returns table(
  outcome text,
  response_status integer,
  response_body jsonb,
  resource_ref text,
  retry_after_seconds integer
) language plpgsql security definer set search_path='' as $$
declare
  existing private.idempotency_keys;
  inserted_id uuid;
  now_at timestamptz := clock_timestamp();
begin
  perform private.assert_active_profile(p_actor_id);
  if exists(select 1 from public.admin_profiles a where a.user_id=p_actor_id) then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  if p_scope is null or p_scope !~ '^[a-z][a-z0-9_.-]{2,127}$'
    or p_key_hash is null or p_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_ttl is null or p_ttl<interval '1 minute' or p_ttl>interval '24 hours' then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID';
  end if;

  insert into private.idempotency_keys(
    actor_id,scope,key_hash,request_hash,locked_until,expires_at
  ) values (
    p_actor_id,p_scope,p_key_hash,p_request_hash,now_at+p_ttl,now_at+interval '30 days'
  ) on conflict(actor_id,scope,key_hash) do nothing returning id into inserted_id;
  if inserted_id is not null then
    return query select 'new'::text,null::integer,null::jsonb,null::text,null::integer;
    return;
  end if;

  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash
  for update;
  if existing.request_hash<>p_request_hash then
    return query select 'hash_mismatch'::text,null::integer,null::jsonb,null::text,null::integer;
    return;
  elsif existing.state='completed' then
    return query select 'replay'::text,existing.response_status,existing.response_body,
      existing.resource_ref,null::integer;
    return;
  elsif existing.state='claimed' and existing.locked_until>now_at then
    return query select 'in_progress'::text,null::integer,null::jsonb,null::text,
      greatest(1,ceil(extract(epoch from existing.locked_until-now_at)))::integer;
    return;
  end if;

  update private.idempotency_keys set state='claimed',locked_until=now_at+p_ttl,
    response_status=null,response_body=null,resource_ref=null
  where id=existing.id;
  return query select 'new'::text,null::integer,null::jsonb,null::text,null::integer;
end $$;
alter function private.claim_idempotency_key(text,text,text,text,interval) owner to masarifi_migration;
revoke all on function private.claim_idempotency_key(text,text,text,text,interval) from public;

create function private.lookup_idempotency_key(
  p_actor_id text,
  p_scope text,
  p_key_hash text,
  p_request_hash text
) returns table(
  outcome text,
  response_status integer,
  response_body jsonb,
  resource_ref text,
  retry_after_seconds integer
) language plpgsql security definer set search_path='' as $$
declare
  existing private.idempotency_keys;
  now_at timestamptz := clock_timestamp();
begin
  perform private.assert_active_profile(p_actor_id);
  if exists(select 1 from public.admin_profiles a where a.user_id=p_actor_id) then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  if p_scope is null or p_scope !~ '^[a-z][a-z0-9_.-]{2,127}$'
    or p_key_hash is null or p_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID';
  end if;
  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash;
  if existing.id is null or existing.state='failed'
    or (existing.state='claimed' and existing.locked_until<=now_at) then
    return query select 'new'::text,null::integer,null::jsonb,null::text,null::integer;
  elsif existing.request_hash<>p_request_hash then
    return query select 'hash_mismatch'::text,null::integer,null::jsonb,null::text,null::integer;
  elsif existing.state='completed' then
    return query select 'replay'::text,existing.response_status,existing.response_body,
      existing.resource_ref,null::integer;
  else
    return query select 'in_progress'::text,null::integer,null::jsonb,null::text,
      greatest(1,ceil(extract(epoch from existing.locked_until-now_at)))::integer;
  end if;
end $$;
alter function private.lookup_idempotency_key(text,text,text,text) owner to masarifi_migration;
revoke all on function private.lookup_idempotency_key(text,text,text,text) from public;

create function private.complete_idempotency_key(
  p_actor_id text,
  p_scope text,
  p_key_hash text,
  p_request_hash text,
  p_response_status integer,
  p_response_body jsonb,
  p_resource_ref text
) returns void language plpgsql security definer set search_path='' as $$
declare existing private.idempotency_keys;
begin
  perform private.assert_active_profile(p_actor_id);
  if exists(select 1 from public.admin_profiles a where a.user_id=p_actor_id) then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  if p_response_status not between 100 and 599
    or p_response_body is null or jsonb_typeof(p_response_body)<>'object'
    or pg_column_size(p_response_body)>65536 then
    raise exception using errcode='22023',message='IDEMPOTENCY_RESPONSE_INVALID';
  end if;
  select * into existing from private.idempotency_keys k
  where k.actor_id=p_actor_id and k.scope=p_scope and k.key_hash=p_key_hash
  for update;
  if existing.id is null then
    raise exception using errcode='P0001',message='IDEMPOTENCY_CLAIM_MISSING';
  elsif existing.request_hash<>p_request_hash then
    raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSED';
  elsif existing.state='completed' then
    if existing.response_status=p_response_status and existing.response_body=p_response_body
      and existing.resource_ref is not distinct from p_resource_ref then return; end if;
    raise exception using errcode='P0001',message='IDEMPOTENCY_RESPONSE_MISMATCH';
  elsif existing.state<>'claimed' then
    raise exception using errcode='P0001',message='IDEMPOTENCY_CLAIM_INVALID';
  end if;
  update private.idempotency_keys set state='completed',response_status=p_response_status,
    response_body=p_response_body,resource_ref=p_resource_ref
  where id=existing.id;
end $$;
alter function private.complete_idempotency_key(text,text,text,text,integer,jsonb,text) owner to masarifi_migration;
revoke all on function private.complete_idempotency_key(text,text,text,text,integer,jsonb,text) from public;

reset role;
revoke masarifi_migration from current_user granted by current_user;
