grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table public.support_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check(key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  name text not null check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  sort_order integer not null default 0 check(sort_order>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.support_categories owner to masarifi_migration;
create index support_categories_active_order_idx on public.support_categories(active,sort_order,key);
create trigger support_categories_set_updated_at_and_version before update on public.support_categories
for each row execute function private.set_updated_at_and_version();

create table public.support_tickets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  category_id uuid not null references public.support_categories(id) on update restrict on delete restrict,
  subject text not null check(subject=btrim(subject) and char_length(subject) between 1 and 180 and subject !~ '[[:cntrl:]]'),
  status text not null default 'open' check(status in ('open','waiting_customer','waiting_support','resolved','closed')),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  assigned_admin_id text references public.admin_profiles(user_id) on update restrict on delete restrict,
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  unique(id,user_id),
  check((status='closed')=(closed_at is not null))
);
alter table public.support_tickets owner to masarifi_migration;
create index support_tickets_owner_cursor_idx on public.support_tickets(user_id,status,last_message_at desc,id desc);
create index support_tickets_assignee_cursor_idx on public.support_tickets(assigned_admin_id,status,last_message_at desc,id desc) where assigned_admin_id is not null;
create index support_tickets_category_status_idx on public.support_tickets(category_id,status);
create index support_tickets_priority_status_idx on public.support_tickets(priority,status,last_message_at,id);
create trigger support_tickets_set_updated_at_and_version before update on public.support_tickets
for each row execute function private.set_updated_at_and_version();

create table public.support_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on update restrict on delete cascade,
  sender_id text not null check(sender_id=btrim(sender_id) and char_length(sender_id) between 1 and 128),
  sender_type text not null check(sender_type in ('customer','admin','system')),
  body text not null check(body=btrim(body) and char_length(body) between 1 and 8192 and body !~ E'\\r'),
  created_at timestamptz not null default now()
);
alter table public.support_messages owner to masarifi_migration;
create index support_messages_ticket_cursor_idx on public.support_messages(ticket_id,created_at,id);
create index support_messages_sender_idx on public.support_messages(sender_id,created_at desc);

create table private.support_internal_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on update restrict on delete cascade,
  admin_id text not null references public.admin_profiles(user_id) on update restrict on delete restrict,
  body text not null check(body=btrim(body) and char_length(body) between 1 and 8192 and body !~ E'\\r'),
  created_at timestamptz not null default now()
);
alter table private.support_internal_notes owner to masarifi_migration;
create index support_internal_notes_ticket_cursor_idx on private.support_internal_notes(ticket_id,created_at,id);
create index support_internal_notes_admin_idx on private.support_internal_notes(admin_id,created_at desc);

create table private.support_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on update restrict on delete cascade,
  message_id uuid references public.support_messages(id) on update restrict on delete cascade,
  storage_ref text not null unique check(storage_ref ~ '^support/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  filename_safe text not null check(filename_safe=btrim(filename_safe) and char_length(filename_safe) between 1 and 255 and filename_safe !~ '[[:cntrl:]]' and filename_safe !~ '[\\/]'),
  content_type text not null check(content_type in ('application/pdf','image/png','image/jpeg','text/plain')),
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text not null default 'uploading' check(scan_status in ('uploading','pending','clean','rejected','failed')),
  scanned_at timestamptz,
  claim_token uuid,
  claimed_by text check(claimed_by is null or char_length(claimed_by) between 1 and 128),
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null)),
  check(scan_status not in ('clean','rejected') or scanned_at is not null)
);
alter table private.support_attachments owner to masarifi_migration;
create index support_attachments_message_idx on private.support_attachments(message_id,scan_status,id) where message_id is not null;
create index support_attachments_ticket_idx on private.support_attachments(ticket_id,created_at,id);
create index support_attachments_scan_idx on private.support_attachments(scan_status,next_attempt_at,created_at,id) where scan_status in ('pending','failed');
create trigger support_attachments_set_updated_at_and_version before update on private.support_attachments
for each row execute function private.set_updated_at_and_version();

insert into public.support_categories(key,name,sort_order,active) values
  ('account','Account and access',10,true),
  ('transactions','Transactions',20,true),
  ('planning','Planning and budgets',30,true),
  ('technical','Technical issue',40,true),
  ('other','Other',50,true)
on conflict(key) do nothing;

reset role;
revoke masarifi_migration from current_user granted by current_user;
