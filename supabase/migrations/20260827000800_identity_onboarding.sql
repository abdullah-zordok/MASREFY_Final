grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create table public.onboarding_progress (
  user_id text primary key references public.profiles(id) on delete restrict,
  step text not null default 'welcome',
  completed_steps text[] not null default array[]::text[],
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint onboarding_progress_step_check check (step = any(array[
    'welcome', 'tracking_intro', 'permission_education', 'permission_request',
    'keywords', 'preference', 'demo', 'platform_explanation', 'capture_options',
    'optional_automation', 'manual_voice_demo', 'complete'
  ])),
  constraint onboarding_progress_completed_steps_check check (
    coalesce(array_ndims(completed_steps), 1) = 1
    and cardinality(completed_steps) <= 12
    and array_position(completed_steps, null) is null
    and completed_steps <@ array[
      'welcome', 'tracking_intro', 'permission_education', 'permission_request',
      'keywords', 'preference', 'demo', 'platform_explanation', 'capture_options',
      'optional_automation', 'manual_voice_demo', 'complete'
    ]::text[]
  ),
  constraint onboarding_progress_completion_check check (
    (step = 'complete') = (completed_at is not null)
    and (step <> 'complete' or 'complete' = any(completed_steps))
    and (step = 'complete' or not step = any(completed_steps))
  ),
  constraint onboarding_progress_version_check check (version > 0)
);

alter table public.onboarding_progress owner to masarifi_migration;

create trigger onboarding_progress_set_updated_at_and_version
before update on public.onboarding_progress
for each row execute function private.set_updated_at_and_version();

alter table public.onboarding_progress enable row level security;
alter table public.onboarding_progress force row level security;

revoke all on public.onboarding_progress from public, anon, authenticated, masarifi_api, masarifi_worker;
grant select on public.onboarding_progress to authenticated, masarifi_api, masarifi_worker;
grant insert on public.onboarding_progress to masarifi_api, masarifi_worker;
grant update (step, completed_steps, completed_at) on public.onboarding_progress
  to masarifi_api, masarifi_worker;

create policy onboarding_progress_authenticated_select
on public.onboarding_progress for select to authenticated
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = onboarding_progress.user_id and profiles.status = 'active'
  )
);

create policy onboarding_progress_api_select
on public.onboarding_progress for select to masarifi_api
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = onboarding_progress.user_id and profiles.status = 'active'
  )
);

create policy onboarding_progress_api_insert
on public.onboarding_progress for insert to masarifi_api
with check (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = onboarding_progress.user_id and profiles.status = 'active'
  )
);

create policy onboarding_progress_api_update
on public.onboarding_progress for update to masarifi_api
using (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = onboarding_progress.user_id and profiles.status = 'active'
  )
)
with check (
  user_id = (select public.current_clerk_user_id())
  and exists (
    select 1 from public.profiles
    where profiles.id = onboarding_progress.user_id and profiles.status = 'active'
  )
);

create policy onboarding_progress_worker_select
on public.onboarding_progress for select to masarifi_worker using (true);
create policy onboarding_progress_worker_insert
on public.onboarding_progress for insert to masarifi_worker with check (true);
create policy onboarding_progress_worker_update
on public.onboarding_progress for update to masarifi_worker using (true) with check (true);
create policy onboarding_progress_migration_owner_all
on public.onboarding_progress for all to masarifi_migration using (true) with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
