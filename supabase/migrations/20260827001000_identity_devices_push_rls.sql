grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

alter table public.user_devices enable row level security;
alter table public.user_devices force row level security;
alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;

revoke all on public.user_devices from public, anon, authenticated, masarifi_api, masarifi_worker;
revoke all on public.push_tokens from public, anon, authenticated, masarifi_api, masarifi_worker;

grant select (id, platform, app_version, device_name, trusted_at, last_seen_at, revoked_at, created_at, updated_at, version)
  on public.user_devices to authenticated;
grant select, insert on public.user_devices to masarifi_api;
grant update (clerk_session_id, platform, app_version, device_name, trusted_at, last_seen_at, revoked_at)
  on public.user_devices to masarifi_api;
grant select on public.user_devices to masarifi_worker;
grant update (clerk_session_id, last_seen_at, revoked_at) on public.user_devices to masarifi_worker;

grant insert on public.push_tokens to masarifi_api;
grant select (id, user_id, device_id, token_hash, provider, revoked_at, version) on public.push_tokens to masarifi_api;
grant update (device_id, token_hash, token_ciphertext, provider, revoked_at)
  on public.push_tokens to masarifi_api;
grant select on public.push_tokens to masarifi_worker;
grant update (last_validated_at, revoked_at) on public.push_tokens to masarifi_worker;

create policy user_devices_authenticated_select
on public.user_devices for select to authenticated
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = user_devices.user_id and profiles.status = 'active'
  )
);

create policy user_devices_api_select
on public.user_devices for select to masarifi_api
using (user_id = (select public.current_clerk_user_id()));
create policy user_devices_api_insert
on public.user_devices for insert to masarifi_api
with check (user_id = (select public.current_clerk_user_id()));
create policy user_devices_api_update
on public.user_devices for update to masarifi_api
using (user_id = (select public.current_clerk_user_id()))
with check (user_id = (select public.current_clerk_user_id()));
create policy user_devices_worker_select
on public.user_devices for select to masarifi_worker using (true);
create policy user_devices_worker_update
on public.user_devices for update to masarifi_worker using (true) with check (true);
create policy user_devices_migration_owner_all
on public.user_devices for all to masarifi_migration using (true) with check (true);

create policy push_tokens_api_select
on public.push_tokens for select to masarifi_api
using (user_id = (select public.current_clerk_user_id()));
create policy push_tokens_api_insert
on public.push_tokens for insert to masarifi_api
with check (user_id = (select public.current_clerk_user_id()));
create policy push_tokens_api_update
on public.push_tokens for update to masarifi_api
using (user_id = (select public.current_clerk_user_id()))
with check (user_id = (select public.current_clerk_user_id()));
create policy push_tokens_worker_select
on public.push_tokens for select to masarifi_worker using (true);
create policy push_tokens_worker_update
on public.push_tokens for update to masarifi_worker using (true) with check (true);
create policy push_tokens_migration_owner_all
on public.push_tokens for all to masarifi_migration using (true) with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
