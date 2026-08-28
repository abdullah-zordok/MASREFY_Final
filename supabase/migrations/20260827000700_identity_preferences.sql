grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create table public.user_preferences (
  user_id text primary key references public.profiles(id) on delete restrict,
  default_currency char(3) not null default 'SAR',
  language text not null default 'ar',
  theme text not null default 'system',
  calendar text not null default 'gregorian',
  week_start smallint not null default 6,
  privacy_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint user_preferences_currency_check check (default_currency::text ~ '^[A-Z]{3}$'),
  constraint user_preferences_language_check check (language in ('ar', 'en')),
  constraint user_preferences_theme_check check (theme in ('light', 'dark', 'system')),
  constraint user_preferences_calendar_check check (calendar in ('gregorian', 'hijri')),
  constraint user_preferences_week_start_check check (week_start between 0 and 6),
  constraint user_preferences_privacy_check check (
    jsonb_typeof(privacy_settings) = 'object'
    and privacy_settings - array[
      'hideBalances',
      'reducedMotion',
      'trackingPersonalization',
      'assistantPersonalization',
      'analyticsEnabled'
    ] = '{}'::jsonb
    and (not privacy_settings ? 'hideBalances' or jsonb_typeof(privacy_settings -> 'hideBalances') = 'boolean')
    and (not privacy_settings ? 'reducedMotion' or jsonb_typeof(privacy_settings -> 'reducedMotion') = 'boolean')
    and (not privacy_settings ? 'trackingPersonalization' or jsonb_typeof(privacy_settings -> 'trackingPersonalization') = 'boolean')
    and (not privacy_settings ? 'assistantPersonalization' or jsonb_typeof(privacy_settings -> 'assistantPersonalization') = 'boolean')
    and (not privacy_settings ? 'analyticsEnabled' or jsonb_typeof(privacy_settings -> 'analyticsEnabled') = 'boolean')
    and pg_column_size(privacy_settings) <= 2048
  ),
  constraint user_preferences_version_check check (version > 0)
);

alter table public.user_preferences owner to masarifi_migration;

create trigger user_preferences_set_updated_at_and_version
before update on public.user_preferences
for each row execute function private.set_updated_at_and_version();

alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;

revoke all on public.user_preferences from public, anon, authenticated, masarifi_api, masarifi_worker;

grant select on public.user_preferences to authenticated, masarifi_api, masarifi_worker;
grant update (default_currency, language, theme, calendar, week_start, privacy_settings)
  on public.user_preferences to masarifi_api;
grant insert on public.user_preferences to masarifi_api, masarifi_worker;
grant update (default_currency, language, theme, calendar, week_start, privacy_settings)
  on public.user_preferences to masarifi_worker;

create policy user_preferences_authenticated_select
on public.user_preferences
for select
to authenticated
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where id = user_id and status = 'active'
  )
);

create policy user_preferences_api_select
on public.user_preferences
for select
to masarifi_api
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where id = user_id and status = 'active'
  )
);

create policy user_preferences_api_insert
on public.user_preferences
for insert
to masarifi_api
with check (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where id = user_id and status = 'active'
  )
);

create policy user_preferences_api_update
on public.user_preferences
for update
to masarifi_api
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where id = user_id and status = 'active'
  )
)
with check (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where id = user_id and status = 'active'
  )
);

create policy user_preferences_worker_select
on public.user_preferences for select to masarifi_worker using (true);
create policy user_preferences_worker_insert
on public.user_preferences for insert to masarifi_worker with check (true);
create policy user_preferences_worker_update
on public.user_preferences for update to masarifi_worker using (true) with check (true);
create policy user_preferences_migration_owner_all
on public.user_preferences for all to masarifi_migration using (true) with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
