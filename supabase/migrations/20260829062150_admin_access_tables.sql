grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table public.admin_profiles (
  user_id text primary key references public.profiles(id) on delete restrict,
  status text not null default 'invited',
  department text,
  last_admin_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_profiles_status_check check (status in ('invited','active','suspended','revoked')),
  constraint admin_profiles_department_check check (department is null or (department = btrim(department) and char_length(department) between 1 and 80)),
  constraint admin_profiles_version_check check (version >= 1)
);
alter table public.admin_profiles owner to masarifi_migration;
create index admin_profiles_status_user_idx on public.admin_profiles(status, user_id);
create trigger admin_profiles_set_updated_at_and_version before update on public.admin_profiles
for each row execute function private.set_updated_at_and_version();

create table public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  system_role boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint roles_key_check check (key ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint roles_name_check check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint roles_description_check check (description is null or (description = btrim(description) and char_length(description) between 1 and 500)),
  constraint roles_version_check check (version >= 1)
);
alter table public.roles owner to masarifi_migration;
create index roles_enabled_key_idx on public.roles(key, id) where enabled;
create trigger roles_set_updated_at_and_version before update on public.roles
for each row execute function private.set_updated_at_and_version();

create table public.permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique,
  resource text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint permissions_key_check check (key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint permissions_resource_check check (resource ~ '^[a-z][a-z0-9_-]{0,63}$'),
  constraint permissions_action_check check (action ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  constraint permissions_description_check check (description is null or (description = btrim(description) and char_length(description) between 1 and 500)),
  constraint permissions_resource_action_uq unique(resource, action),
  constraint permissions_version_check check (version >= 1)
);
alter table public.permissions owner to masarifi_migration;
create index permissions_resource_action_id_idx on public.permissions(resource, action, id);
create trigger permissions_set_updated_at_and_version before update on public.permissions
for each row execute function private.set_updated_at_and_version();

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(role_id, permission_id)
);
alter table public.role_permissions owner to masarifi_migration;
create index role_permissions_permission_role_idx on public.role_permissions(permission_id, role_id);

create table public.admin_role_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.admin_profiles(user_id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by text not null references public.admin_profiles(user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_role_assignments_window_check check (ends_at is null or ends_at > starts_at),
  constraint admin_role_assignments_revoked_check check (revoked_at is null or revoked_at >= created_at),
  constraint admin_role_assignments_reason_check check (reason = btrim(reason) and char_length(reason) between 10 and 500),
  constraint admin_role_assignments_version_check check (version >= 1)
);
alter table public.admin_role_assignments owner to masarifi_migration;
create unique index admin_role_assignments_active_uq on public.admin_role_assignments(user_id, role_id) where revoked_at is null;
create index admin_role_assignments_user_window_idx on public.admin_role_assignments(user_id, starts_at, ends_at, revoked_at);
create index admin_role_assignments_role_window_idx on public.admin_role_assignments(role_id, starts_at, ends_at, revoked_at);
create trigger admin_role_assignments_set_updated_at_and_version before update on public.admin_role_assignments
for each row execute function private.set_updated_at_and_version();

create table public.admin_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  token_hash text not null unique,
  invited_by text not null references public.admin_profiles(user_id) on delete restrict,
  expires_at timestamptz not null,
  department text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_invitations_email_check check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  constraint admin_invitations_token_hash_check check (token_hash ~ '^h1:[0-9a-f]{64}$'),
  constraint admin_invitations_expiry_check check (expires_at > created_at),
  constraint admin_invitations_terminal_check check (accepted_at is null or revoked_at is null),
  constraint admin_invitations_department_check check (department is null or (department = btrim(department) and char_length(department) between 1 and 80)),
  constraint admin_invitations_version_check check (version >= 1)
);
alter table public.admin_invitations owner to masarifi_migration;
create unique index admin_invitations_active_email_uq on public.admin_invitations(lower(email)) where accepted_at is null and revoked_at is null;
create index admin_invitations_role_expiry_idx on public.admin_invitations(role_id, expires_at);
create index admin_invitations_inviter_created_idx on public.admin_invitations(invited_by, created_at desc, id desc);
create trigger admin_invitations_set_updated_at_and_version before update on public.admin_invitations
for each row execute function private.set_updated_at_and_version();

reset role;
revoke masarifi_migration from current_user granted by current_user;
