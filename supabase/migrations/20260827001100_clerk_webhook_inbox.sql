grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create table private.clerk_webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_event_id text not null,
  event_type text not null,
  signature_verified_at timestamptz not null,
  payload_hash text not null,
  payload jsonb not null,
  status text not null default 'received',
  attempt_count integer not null default 0,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  constraint clerk_webhook_events_event_id_check check (
    clerk_event_id = btrim(clerk_event_id) and char_length(clerk_event_id) between 1 and 128
  ),
  constraint clerk_webhook_events_type_check check (
    event_type in ('user.created', 'user.updated', 'user.deleted')
  ),
  constraint clerk_webhook_events_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint clerk_webhook_events_payload_check check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 262144
  ),
  constraint clerk_webhook_events_status_check check (
    status in ('received', 'processing', 'processed', 'failed')
  ),
  constraint clerk_webhook_events_attempt_check check (attempt_count between 0 and 100),
  constraint clerk_webhook_events_error_check check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),
  constraint clerk_webhook_events_lifecycle_check check (
    (status = 'processed') = (processed_at is not null)
    and (status = 'failed') = (last_error_code is not null)
  )
);

alter table private.clerk_webhook_events owner to masarifi_migration;
create unique index clerk_webhook_events_delivery_uq
  on private.clerk_webhook_events(clerk_event_id);
create index clerk_webhook_events_status_created_idx
  on private.clerk_webhook_events(status, created_at);
create index clerk_webhook_events_type_processed_idx
  on private.clerk_webhook_events(event_type, processed_at);

create function private.protect_clerk_webhook_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.clerk_event_id is distinct from old.clerk_event_id
     or new.event_type is distinct from old.event_type
     or new.signature_verified_at is distinct from old.signature_verified_at
     or new.payload_hash is distinct from old.payload_hash
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '22023', message = 'WEBHOOK_RECEIPT_IMMUTABLE';
  end if;
  if new.payload is distinct from old.payload and not (
    new.payload = '{}'::jsonb
    and old.payload <> '{}'::jsonb
    and old.created_at <= now() - interval '7 days'
    and new.status in ('processed', 'failed')
  ) then
    raise exception using errcode = '22023', message = 'WEBHOOK_PAYLOAD_IMMUTABLE';
  end if;
  return new;
end;
$$;

alter function private.protect_clerk_webhook_receipt() owner to masarifi_migration;
revoke all on function private.protect_clerk_webhook_receipt() from public;

create trigger clerk_webhook_events_protect_receipt
before update on private.clerk_webhook_events
for each row execute function private.protect_clerk_webhook_receipt();

reset role;
revoke masarifi_migration from current_user granted by current_user;
