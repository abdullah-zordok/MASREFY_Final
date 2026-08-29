grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.is_valid_support_scope(p_scope jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(p_scope) = 'array'
    and jsonb_array_length(p_scope) between 1 and 6
    and pg_column_size(p_scope) <= 4096
    and not exists (
      select 1
      from jsonb_array_elements(p_scope) as item
      where jsonb_typeof(item) <> 'object'
        or item - array['resource','actions'] <> '{}'::jsonb
        or item ->> 'resource' not in (
          'profile-contact','account-status','device-diagnostics',
          'session-diagnostics','subscription-summary','import-summary'
        )
        or jsonb_typeof(item -> 'actions') <> 'array'
        or jsonb_array_length(item -> 'actions') not between 1 and 3
        or exists (
          select 1 from jsonb_array_elements_text(item -> 'actions') as action
          where action not in ('read-masked','read-status','read-aggregate')
        )
        or (select count(*) from jsonb_array_elements_text(item -> 'actions'))
          <> (select count(distinct action) from jsonb_array_elements_text(item -> 'actions') as action)
    )
    and (select count(*) from jsonb_array_elements(p_scope))
      = (select count(distinct item ->> 'resource') from jsonb_array_elements(p_scope) as item)
$$;
alter function private.is_valid_support_scope(jsonb) owner to masarifi_migration;
revoke all on function private.is_valid_support_scope(jsonb) from public;

create table private.support_access_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  requested_by text not null references public.admin_profiles(user_id) on delete restrict,
  assignee text not null references public.admin_profiles(user_id) on delete restrict,
  support_ticket_id text not null,
  purpose text not null,
  scope jsonb not null,
  customer_approval_required boolean not null default false,
  status text not null default 'pending',
  customer_approved_at timestamptz,
  expires_at timestamptz not null,
  approved_by text references public.admin_profiles(user_id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint support_access_requests_ticket_check check (support_ticket_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint support_access_requests_purpose_check check (purpose = btrim(purpose) and char_length(purpose) between 10 and 500),
  constraint support_access_requests_scope_check check (private.is_valid_support_scope(scope)),
  constraint support_access_requests_status_check check (status in ('pending','approved','denied','expired','revoked')),
  constraint support_access_requests_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint support_access_requests_approver_check check (approved_by is null or approved_by <> requested_by),
  constraint support_access_requests_decision_check check (
    (status = 'pending' and approved_by is null and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  ),
  constraint support_access_requests_customer_check check (not customer_approval_required or status = 'pending' or customer_approved_at is not null),
  constraint support_access_requests_version_check check (version >= 1)
);
alter table private.support_access_requests owner to masarifi_migration;
create index support_access_requests_owner_cursor_idx on private.support_access_requests(user_id, status, created_at desc, id desc);
create index support_access_requests_requester_idx on private.support_access_requests(requested_by, created_at desc, id desc);
create index support_access_requests_assignee_expiry_idx on private.support_access_requests(assignee, status, expires_at);
create index support_access_requests_claim_idx on private.support_access_requests(status, expires_at, id);
create trigger support_access_requests_set_updated_at_and_version before update on private.support_access_requests
for each row execute function private.set_updated_at_and_version();

create table private.support_access_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references private.support_access_requests(id) on delete restrict,
  admin_id text not null references public.admin_profiles(user_id) on delete restrict,
  scope jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_grants_scope_check check (private.is_valid_support_scope(scope)),
  constraint support_access_grants_window_check check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  constraint support_access_grants_revoked_check check (revoked_at is null or revoked_at >= created_at)
);
alter table private.support_access_grants owner to masarifi_migration;
create unique index support_access_grants_active_request_uq on private.support_access_grants(request_id) where revoked_at is null;
create index support_access_grants_admin_window_idx on private.support_access_grants(admin_id, starts_at, ends_at, revoked_at);
create index support_access_grants_request_idx on private.support_access_grants(request_id);

create table private.security_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  severity text not null,
  status text not null default 'open',
  detected_at timestamptz not null,
  owner_id text references public.admin_profiles(user_id) on delete restrict,
  contained_at timestamptz,
  resolved_at timestamptz,
  summary_redacted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint security_incidents_title_check check (title = btrim(title) and char_length(title) between 1 and 160),
  constraint security_incidents_severity_check check (severity in ('info','low','medium','high','critical')),
  constraint security_incidents_status_check check (status in ('open','investigating','contained','resolved')),
  constraint security_incidents_summary_check check (summary_redacted is null or (summary_redacted = btrim(summary_redacted) and char_length(summary_redacted) between 1 and 1000)),
  constraint security_incidents_timeline_check check (
    (contained_at is null or contained_at >= detected_at)
    and (resolved_at is null or resolved_at >= detected_at)
    and (resolved_at is null or contained_at is null or resolved_at >= contained_at)
    and (status <> 'resolved' or resolved_at is not null)
  ),
  constraint security_incidents_version_check check (version >= 1)
);
alter table private.security_incidents owner to masarifi_migration;
create index security_incidents_status_severity_idx on private.security_incidents(status, severity, detected_at desc, id desc);
create index security_incidents_owner_status_idx on private.security_incidents(owner_id, status, detected_at desc, id desc);
create trigger security_incidents_set_updated_at_and_version before update on private.security_incidents
for each row execute function private.set_updated_at_and_version();

create table private.security_incident_timeline (
  id uuid primary key default extensions.gen_random_uuid(),
  incident_id uuid not null references private.security_incidents(id) on delete cascade,
  actor_id text,
  event_type text not null,
  details_redacted text not null,
  occurred_at timestamptz not null default now(),
  constraint security_incident_timeline_actor_check check (actor_id is null or (actor_id = btrim(actor_id) and char_length(actor_id) between 1 and 128)),
  constraint security_incident_timeline_event_check check (event_type ~ '^[a-z][a-z0-9_-]{0,63}$'),
  constraint security_incident_timeline_details_check check (details_redacted = btrim(details_redacted) and char_length(details_redacted) between 1 and 1000)
);
alter table private.security_incident_timeline owner to masarifi_migration;
create index security_incident_timeline_cursor_idx on private.security_incident_timeline(incident_id, occurred_at, id);
create trigger security_incident_timeline_immutable before update or delete on private.security_incident_timeline
for each row execute function private.reject_immutable_change();

reset role;
revoke masarifi_migration from current_user granted by current_user;
