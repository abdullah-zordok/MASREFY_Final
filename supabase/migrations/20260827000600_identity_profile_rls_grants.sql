grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create trigger profiles_set_updated_at_and_version
before update on public.profiles
for each row execute function private.set_updated_at_and_version();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on public.profiles from public, anon, authenticated, masarifi_api, masarifi_worker;
revoke all on function public.current_clerk_user_id() from public, anon;
revoke all on function private.assert_active_profile(text) from public, anon, authenticated, masarifi_worker;

grant select (
  id,
  display_name,
  locale,
  timezone,
  status,
  last_seen_at,
  created_at,
  updated_at,
  version
) on public.profiles to authenticated;

grant select on public.profiles to masarifi_api, masarifi_worker;
grant update (display_name, locale, timezone, last_seen_at)
  on public.profiles to masarifi_api;
grant insert on public.profiles to masarifi_worker;
grant update (primary_email, phone_e164, display_name, status, last_seen_at)
  on public.profiles to masarifi_worker;

grant execute on function public.current_clerk_user_id() to authenticated, masarifi_api;
grant execute on function private.assert_active_profile(text) to masarifi_api;

create policy profiles_authenticated_select
on public.profiles
for select
to authenticated
using (
  id = (select public.current_clerk_user_id())
  and status = 'active'
);

create policy profiles_api_select
on public.profiles
for select
to masarifi_api
using (
  id = (select public.current_clerk_user_id())
  and status = 'active'
);

create policy profiles_api_update
on public.profiles
for update
to masarifi_api
using (
  id = (select public.current_clerk_user_id())
  and status = 'active'
)
with check (
  id = (select public.current_clerk_user_id())
  and status = 'active'
);

create policy profiles_worker_select
on public.profiles
for select
to masarifi_worker
using (true);

create policy profiles_worker_insert
on public.profiles
for insert
to masarifi_worker
with check (true);

create policy profiles_worker_update
on public.profiles
for update
to masarifi_worker
using (true)
with check (true);

create policy profiles_migration_owner_all
on public.profiles
for all
to masarifi_migration
using (true)
with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
