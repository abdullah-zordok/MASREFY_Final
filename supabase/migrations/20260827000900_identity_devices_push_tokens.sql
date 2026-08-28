grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create table public.user_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  device_fingerprint text not null,
  clerk_session_id text,
  platform text not null,
  app_version text not null,
  device_name text,
  trusted_at timestamptz,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint user_devices_fingerprint_check check (device_fingerprint ~ '^h1:[0-9a-f]{64}$'),
  constraint user_devices_session_check check (
    clerk_session_id is null or (
      clerk_session_id = btrim(clerk_session_id)
      and char_length(clerk_session_id) between 1 and 255
    )
  ),
  constraint user_devices_platform_check check (platform in ('ios', 'android', 'web')),
  constraint user_devices_app_version_check check (
    app_version = btrim(app_version)
    and app_version ~ '^[A-Za-z0-9._+-]{1,32}$'
  ),
  constraint user_devices_name_check check (
    device_name is null or (
      device_name = btrim(device_name)
      and char_length(device_name) between 1 and 80
    )
  ),
  constraint user_devices_trust_revoke_check check (
    trusted_at is null or revoked_at is null or trusted_at <= revoked_at
  ),
  constraint user_devices_version_check check (version > 0)
);

alter table public.user_devices owner to masarifi_migration;

create unique index user_devices_owner_fingerprint_uq
  on public.user_devices(user_id, device_fingerprint);
create unique index user_devices_id_owner_uq
  on public.user_devices(id, user_id);
create index user_devices_lifecycle_idx
  on public.user_devices(user_id, revoked_at, last_seen_at desc);
create index user_devices_cursor_idx
  on public.user_devices(user_id, last_seen_at desc, id desc);
create index user_devices_session_idx
  on public.user_devices(clerk_session_id) where clerk_session_id is not null;

create trigger user_devices_set_updated_at_and_version
before update on public.user_devices
for each row execute function private.set_updated_at_and_version();

create table public.push_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  device_id uuid not null,
  token_hash text not null,
  token_ciphertext text not null,
  provider text not null,
  last_validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint push_tokens_device_owner_fk foreign key (device_id, user_id)
    references public.user_devices(id, user_id) on delete cascade,
  constraint push_tokens_hash_check check (token_hash ~ '^h1:[0-9a-f]{64}$'),
  constraint push_tokens_ciphertext_check check (
    char_length(token_ciphertext) <= 2048
    and char_length(split_part(token_ciphertext, '.', 5)) between 2 and 1536
    and token_ciphertext ~ '^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
  ),
  constraint push_tokens_provider_check check (provider in ('expo', 'apns', 'fcm')),
  constraint push_tokens_version_check check (version > 0)
);

alter table public.push_tokens owner to masarifi_migration;

create unique index push_tokens_provider_hash_uq on public.push_tokens(provider, token_hash);
create index push_tokens_owner_revoked_idx on public.push_tokens(user_id, revoked_at);
create index push_tokens_device_owner_idx on public.push_tokens(device_id, user_id);

create trigger push_tokens_set_updated_at_and_version
before update on public.push_tokens
for each row execute function private.set_updated_at_and_version();

reset role;
revoke masarifi_migration from current_user granted by current_user;
