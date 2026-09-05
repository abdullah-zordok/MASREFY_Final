grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table public.notification_events (
  id uuid primary key default extensions.gen_random_uuid(),
  source_event_id uuid unique,
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  type text not null check(type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' and char_length(type)<=96),
  title text not null check(title=btrim(title) and char_length(title) between 1 and 120 and title !~ '[[:cntrl:]]'),
  body_safe text not null check(body_safe=btrim(body_safe) and char_length(body_safe) between 1 and 240 and body_safe !~ '[[:cntrl:]]'),
  data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object' and pg_column_size(data)<=8192),
  read_at timestamptz,
  acted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  unique(id,user_id),
  check(expires_at is null or expires_at>created_at),
  check(acted_at is null or acted_at>=created_at),
  check(read_at is null or read_at>=created_at)
);
alter table public.notification_events owner to masarifi_migration;
create index notification_events_owner_cursor_idx on public.notification_events(user_id,created_at desc,id desc);
create index notification_events_owner_unread_idx on public.notification_events(user_id,created_at desc,id desc) where read_at is null;
create index notification_events_owner_type_idx on public.notification_events(user_id,type,created_at desc,id desc);
create index notification_events_expiry_idx on public.notification_events(expires_at,id) where expires_at is not null;
create trigger notification_events_set_updated_at_and_version before update on public.notification_events
for each row execute function private.set_updated_at_and_version();

create table public.notification_preferences (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  channel text not null check(channel in ('in_app','push','email')),
  event_type text not null check(event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' and char_length(event_type)<=96),
  enabled boolean not null default true,
  quiet_hours jsonb not null default '{}'::jsonb check(jsonb_typeof(quiet_hours)='object' and pg_column_size(quiet_hours)<=2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.notification_preferences owner to masarifi_migration;
create unique index notification_preferences_owner_channel_uq on public.notification_preferences(user_id,channel,event_type);
create index notification_preferences_owner_channel_idx on public.notification_preferences(user_id,channel);
create trigger notification_preferences_set_updated_at_and_version before update on public.notification_preferences
for each row execute function private.set_updated_at_and_version();

create table public.notification_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null check(key ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  locale text not null check(locale in ('ar','en')),
  channel text not null check(channel in ('in_app','push','email')),
  template_version integer not null check(template_version>0),
  subject text check(subject is null or (char_length(subject) between 1 and 120 and subject !~ '[\r\n]')),
  body text not null check(char_length(body) between 1 and 4096 and body !~ E'\\r'),
  status text not null default 'draft' check(status in ('draft','testing','published','retired')),
  published_at timestamptz,
  created_by text references public.admin_profiles(user_id) on update restrict on delete restrict,
  system_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  unique(key,locale,channel,template_version),
  check((status in ('published','retired'))=(published_at is not null)),
  check((created_by is null)=system_seed)
);
alter table public.notification_templates owner to masarifi_migration;
create index notification_templates_lookup_idx on public.notification_templates(key,locale,channel,status,template_version desc);
create unique index notification_templates_published_uq on public.notification_templates(key,locale,channel) where status='published';
create trigger notification_templates_set_updated_at_and_version before update on public.notification_templates
for each row execute function private.set_updated_at_and_version();

insert into public.notification_templates(key,locale,channel,template_version,subject,body,status,published_at,created_by,system_seed)
select event_key,locale,channel,1,
  case when channel='email' then case locale when 'ar' then 'تحديث جديد في مصاريفي' else 'New Masarifi update' end end,
  case locale when 'ar' then 'يتوفر تحديث جديد وآمن في تطبيق مصاريفي.' else 'A new safe update is available in Masarifi.' end,
  'published',transaction_timestamp(),null,true
from unnest(array[
  'transaction.created','transfer.created','transaction.refunded','transaction.reversed',
  'transaction.revised','transaction.deleted','transaction.restored','balance.changed',
  'ledger.reconciliation_failed','planning.salary_receipt_expected',
  'planning.salary_receipt_received','planning.obligation_overdue',
  'planning.obligation_completed','planning.savings_goal_completed',
  'tracking.review.requested.v1','tracking.duplicate.detected.v1',
  'unsupported.format.recorded.v1','voice.proposal_ready.v1',
  'assistant.response_ready.v1','ai.budget_threshold.v1','report.ready',
  'report.delivery_failed','export.ready'
]) event_key
cross join unnest(array['ar','en']) locale
cross join unnest(array['in_app','push','email']) channel
on conflict(key,locale,channel,template_version) do nothing;

insert into public.notification_preferences(user_id,channel,event_type)
select p.id,t.channel,t.key
from public.profiles p
cross join (select distinct key,channel from public.notification_templates where system_seed) t
on conflict(user_id,channel,event_type) do nothing;

create function private.seed_notification_preferences()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notification_preferences(user_id,channel,event_type)
  select new.id,t.channel,t.key
  from (select distinct key,channel from public.notification_templates where system_seed) t
  on conflict(user_id,channel,event_type) do nothing;
  return new;
end $$;
alter function private.seed_notification_preferences() owner to masarifi_migration;
revoke all on function private.seed_notification_preferences() from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
create trigger profiles_seed_notification_preferences after insert on public.profiles
for each row execute function private.seed_notification_preferences();

create table public.notification_campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  audience_definition jsonb not null check(jsonb_typeof(audience_definition)='object' and pg_column_size(audience_definition)<=4096),
  template_id uuid not null references public.notification_templates(id) on update restrict on delete restrict,
  status text not null default 'draft' check(status in ('draft','approved','scheduled','running','paused','completed','cancelled')),
  scheduled_at timestamptz,
  created_by text not null references public.admin_profiles(user_id) on update restrict on delete restrict,
  approved_by text references public.admin_profiles(user_id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check(status not in ('approved','scheduled','running','paused','completed') or approved_by is not null),
  check(status<>'scheduled' or scheduled_at is not null)
);
alter table public.notification_campaigns owner to masarifi_migration;
create index notification_campaigns_due_idx on public.notification_campaigns(status,scheduled_at,id);
create index notification_campaigns_creator_cursor_idx on public.notification_campaigns(created_by,created_at desc,id desc);
create index notification_campaigns_template_idx on public.notification_campaigns(template_id);
create trigger notification_campaigns_set_updated_at_and_version before update on public.notification_campaigns
for each row execute function private.set_updated_at_and_version();

create table private.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid references public.notification_events(id) on update restrict on delete restrict,
  campaign_id uuid references public.notification_campaigns(id) on update restrict on delete restrict,
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  channel text not null check(channel in ('in_app','push','email')),
  provider text not null check(provider ~ '^[a-z][a-z0-9_-]{1,63}$'),
  rendered_title text check(rendered_title is null or (char_length(rendered_title) between 1 and 120 and rendered_title !~ '[[:cntrl:]]')),
  rendered_body text check(rendered_body is null or (char_length(rendered_body) between 1 and 4096 and rendered_body !~ E'\\r')),
  rendered_data jsonb not null default '{}'::jsonb check(jsonb_typeof(rendered_data)='object' and pg_column_size(rendered_data)<=8192),
  status text not null default 'queued' check(status in ('queued','sending','delivered','failed','suppressed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  provider_ref text check(provider_ref is null or (char_length(provider_ref)<=254 and provider_ref !~ '[[:cntrl:]]')),
  delivered_at timestamptz,
  error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  next_attempt_at timestamptz,
  claim_token uuid,
  claimed_by text check(claimed_by is null or char_length(claimed_by) between 1 and 128),
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check((event_id is null)<>(campaign_id is null)),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null)),
  check((status='delivered')=(delivered_at is not null))
);
alter table private.notification_deliveries owner to masarifi_migration;
create unique index notification_deliveries_event_uq on private.notification_deliveries(event_id,user_id,channel) where event_id is not null;
create unique index notification_deliveries_campaign_uq on private.notification_deliveries(campaign_id,user_id,channel) where campaign_id is not null;
create index notification_deliveries_due_idx on private.notification_deliveries(status,next_attempt_at,id) where status in ('queued','failed');
create index notification_deliveries_owner_cursor_idx on private.notification_deliveries(user_id,created_at desc,id desc);
create index notification_deliveries_campaign_idx on private.notification_deliveries(campaign_id) where campaign_id is not null;
create trigger notification_deliveries_set_updated_at_and_version before update on private.notification_deliveries
for each row execute function private.set_updated_at_and_version();

reset role;
revoke masarifi_migration from current_user granted by current_user;
