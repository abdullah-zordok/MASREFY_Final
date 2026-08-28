grant masarifi_migration to current_user with set true, inherit false;
grant usage, create on schema public to masarifi_migration;

set local role masarifi_migration;

create table public.profiles (
  id text primary key,
  primary_email text,
  phone_e164 text,
  display_name text,
  locale text not null default 'ar',
  timezone text not null default 'Asia/Riyadh',
  status text not null default 'active',
  last_seen_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint profiles_id_check check (
    id = btrim(id) and char_length(id) between 1 and 128
  ),
  constraint profiles_primary_email_check check (
    primary_email is null or (
      primary_email = lower(btrim(primary_email))
      and char_length(primary_email) between 1 and 320
    )
  ),
  constraint profiles_phone_e164_check check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint profiles_display_name_check check (
    display_name is null or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 100
    )
  ),
  constraint profiles_locale_check check (locale in ('ar', 'en')),
  constraint profiles_timezone_check check (
    timezone = btrim(timezone) and char_length(timezone) between 1 and 64
  ),
  constraint profiles_status_check check (
    status in ('active', 'suspended', 'deletion_pending', 'deleted')
  ),
  constraint profiles_deleted_at_check check (
    (status = 'deleted') = (deleted_at is not null)
  ),
  constraint profiles_version_check check (version > 0)
);

alter table public.profiles owner to masarifi_migration;

create unique index profiles_primary_email_uq
  on public.profiles (lower(primary_email))
  where primary_email is not null;
create unique index profiles_phone_e164_uq
  on public.profiles (phone_e164)
  where phone_e164 is not null;
create index profiles_status_created_idx
  on public.profiles (status, created_at);

create function public.current_clerk_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select nullif(btrim(
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub'
  ), '')
$function$;

alter function public.current_clerk_user_id() owner to masarifi_migration;
revoke all on function public.current_clerk_user_id() from public;

create function private.assert_active_profile(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null
    or char_length(btrim(p_user_id)) not between 1 and 128
    or p_user_id <> public.current_clerk_user_id() then
    raise exception using errcode = '28000', message = 'AUTH_TOKEN_INVALID';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'PROFILE_INACTIVE';
  end if;
end
$function$;

alter function private.assert_active_profile(text) owner to masarifi_migration;
revoke all on function private.assert_active_profile(text) from public;

reset role;
revoke masarifi_migration from current_user granted by current_user;
