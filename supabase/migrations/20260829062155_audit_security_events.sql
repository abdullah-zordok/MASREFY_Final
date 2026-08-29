grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.reject_immutable_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'SECURITY_EVIDENCE_IMMUTABLE';
end;
$$;
alter function private.reject_immutable_change() owner to masarifi_migration;
revoke all on function private.reject_immutable_change() from public;

create table public.security_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text references public.profiles(id) on delete restrict,
  event_type text not null,
  severity text not null,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint security_events_type_check check (event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' and char_length(event_type) <= 80),
  constraint security_events_severity_check check (severity in ('info','low','medium','high','critical')),
  constraint security_events_ip_hash_check check (ip_hash is null or ip_hash ~ '^h1:[A-Za-z0-9._-]{1,32}:[0-9a-f]{64}$'),
  constraint security_events_user_agent_check check (user_agent is null or (user_agent = btrim(user_agent) and char_length(user_agent) <= 256 and octet_length(user_agent) <= 1024)),
  constraint security_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and jsonb_array_length(jsonb_path_query_array(metadata, '$.*')) <= 20
    and pg_column_size(metadata) <= 4096
    and not jsonb_path_exists(metadata, '$.* ? (@.type() == "object" || @.type() == "array")')
  ),
  constraint security_events_time_check check (occurred_at <= now() + interval '5 minutes')
);
alter table public.security_events owner to masarifi_migration;
create index security_events_owner_cursor_idx on public.security_events(user_id, occurred_at desc, id desc);
create index security_events_severity_cursor_idx on public.security_events(severity, occurred_at desc, id desc);
create index security_events_type_cursor_idx on public.security_events(event_type, occurred_at desc, id desc);
create trigger security_events_immutable before update or delete on public.security_events
for each row execute function private.reject_immutable_change();

create table audit.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id text,
  actor_type text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  before_hash text,
  after_hash text,
  reason text,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_events_actor_type_check check (actor_type in ('user','admin','system','provider')),
  constraint audit_events_actor_id_check check (actor_id is null or (actor_id = btrim(actor_id) and char_length(actor_id) between 1 and 128)),
  constraint audit_events_action_check check (action ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' and char_length(action) <= 128),
  constraint audit_events_resource_type_check check (resource_type ~ '^[a-z][a-z0-9_-]{0,63}$'),
  constraint audit_events_resource_id_check check (resource_id is null or (resource_id = btrim(resource_id) and char_length(resource_id) between 1 and 128)),
  constraint audit_events_hash_check check (
    (before_hash is null or before_hash ~ '^sha256:[0-9a-f]{64}$')
    and (after_hash is null or after_hash ~ '^sha256:[0-9a-f]{64}$')
  ),
  constraint audit_events_reason_check check (reason is null or (reason = btrim(reason) and char_length(reason) between 10 and 500)),
  constraint audit_events_request_check check (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint audit_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and jsonb_array_length(jsonb_path_query_array(metadata, '$.*')) <= 20
    and pg_column_size(metadata) <= 4096
    and not jsonb_path_exists(metadata, '$.* ? (@.type() == "object" || @.type() == "array")')
  )
);
alter table audit.audit_events owner to masarifi_migration;
create index audit_events_resource_cursor_idx on audit.audit_events(resource_type, resource_id, occurred_at desc, id desc);
create index audit_events_actor_cursor_idx on audit.audit_events(actor_id, occurred_at desc, id desc);
create index audit_events_action_cursor_idx on audit.audit_events(action, occurred_at desc, id desc);
create index audit_events_request_idx on audit.audit_events(request_id);
create trigger audit_events_immutable before update or delete on audit.audit_events
for each row execute function private.reject_immutable_change();

reset role;
revoke masarifi_migration from current_user granted by current_user;
