grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table private.privacy_export_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  status text not null default 'requested',
  scope jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  storage_ref text,
  expires_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint privacy_export_requests_status_check check (status in ('requested','verified','processing','ready','expired','failed')),
  constraint privacy_export_requests_scope_check check (jsonb_typeof(scope) = 'array' and jsonb_array_length(scope) <= 100 and pg_column_size(scope) <= 8192),
  constraint privacy_export_requests_storage_check check (storage_ref is null or (storage_ref ~ '^exports/[0-9a-f-]{36}/[A-Za-z0-9._/-]{1,256}\.zip$' and storage_ref !~ '(^|/)\.\.(/|$)')),
  constraint privacy_export_requests_error_check check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  constraint privacy_export_requests_lifecycle_check check (
    (status <> 'ready' or (storage_ref is not null and completed_at is not null and expires_at > completed_at))
    and (status <> 'expired' or expires_at is not null)
    and (status <> 'failed' or error_code is not null)
  ),
  constraint privacy_export_requests_version_check check (version >= 1)
);
alter table private.privacy_export_requests owner to masarifi_migration;
create unique index privacy_export_requests_active_owner_uq on private.privacy_export_requests(user_id) where status in ('requested','verified','processing','ready');
create index privacy_export_requests_claim_idx on private.privacy_export_requests(status, requested_at, id);
create index privacy_export_requests_ready_expiry_idx on private.privacy_export_requests(expires_at, id) where status = 'ready';
create trigger privacy_export_requests_set_updated_at_and_version before update on private.privacy_export_requests
for each row execute function private.set_updated_at_and_version();

create table private.account_deletion_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  cooling_off_ends_at timestamptz not null,
  completed_at timestamptz,
  retention_result jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint account_deletion_requests_status_check check (status in ('requested','verified','cancelled','processing','completed','failed')),
  constraint account_deletion_requests_cooling_check check (cooling_off_ends_at >= requested_at),
  constraint account_deletion_requests_result_check check (jsonb_typeof(retention_result) = 'object' and pg_column_size(retention_result) <= 32768),
  constraint account_deletion_requests_error_check check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  constraint account_deletion_requests_lifecycle_check check (
    (status <> 'completed' or completed_at is not null)
    and (status <> 'failed' or error_code is not null)
  ),
  constraint account_deletion_requests_version_check check (version >= 1)
);
alter table private.account_deletion_requests owner to masarifi_migration;
create unique index account_deletion_requests_active_owner_uq on private.account_deletion_requests(user_id) where status in ('requested','verified','processing');
create index account_deletion_requests_claim_idx on private.account_deletion_requests(status, cooling_off_ends_at, id);
create index account_deletion_requests_completed_idx on private.account_deletion_requests(completed_at, id);
create trigger account_deletion_requests_set_updated_at_and_version before update on private.account_deletion_requests
for each row execute function private.set_updated_at_and_version();

create table private.retention_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  resource_type text not null unique,
  retention_days integer not null,
  deletion_mode text not null,
  legal_basis text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint retention_policies_resource_check check (resource_type ~ '^[a-z][a-z0-9-]{0,63}$'),
  constraint retention_policies_days_check check (retention_days between 0 and 36500),
  constraint retention_policies_mode_check check (deletion_mode in ('delete','anonymize','archive')),
  constraint retention_policies_basis_check check (legal_basis = btrim(legal_basis) and char_length(legal_basis) between 10 and 500),
  constraint retention_policies_version_check check (version >= 1)
);
alter table private.retention_policies owner to masarifi_migration;
create index retention_policies_enabled_idx on private.retention_policies(resource_type, retention_days) where enabled;
create trigger retention_policies_set_updated_at_and_version before update on private.retention_policies
for each row execute function private.set_updated_at_and_version();

create table private.retention_holds (
  id uuid primary key default extensions.gen_random_uuid(),
  resource_type text not null references private.retention_policies(resource_type) on delete restrict,
  resource_id text not null,
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by text not null references public.admin_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint retention_holds_resource_id_check check (resource_id = btrim(resource_id) and char_length(resource_id) between 1 and 128),
  constraint retention_holds_reason_check check (reason = btrim(reason) and char_length(reason) between 10 and 500),
  constraint retention_holds_window_check check (ends_at is null or ends_at > starts_at),
  constraint retention_holds_version_check check (version >= 1)
);
alter table private.retention_holds owner to masarifi_migration;
create index retention_holds_resource_window_idx on private.retention_holds(resource_type, resource_id, starts_at, ends_at);
create index retention_holds_end_idx on private.retention_holds(ends_at, id);
create trigger retention_holds_set_updated_at_and_version before update on private.retention_holds
for each row execute function private.set_updated_at_and_version();

reset role;
revoke masarifi_migration from current_user granted by current_user;
