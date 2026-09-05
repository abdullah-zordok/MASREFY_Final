grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table public.feedback_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  type text not null check(type in ('bug','idea','experience','other')),
  subject text check(subject is null or (subject=btrim(subject) and char_length(subject) between 1 and 180 and subject !~ '[[:cntrl:]]')),
  body text not null check(body=btrim(body) and char_length(body) between 1 and 8192 and body !~ E'\\r'),
  status text not null default 'new' check(status in ('new','reviewing','planned','resolved','closed')),
  assigned_admin_id text references public.admin_profiles(user_id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.feedback_items owner to masarifi_migration;
create index feedback_items_owner_cursor_idx on public.feedback_items(user_id,created_at desc,id desc);
create index feedback_items_status_cursor_idx on public.feedback_items(status,updated_at desc,id desc);
create index feedback_items_assignee_idx on public.feedback_items(assigned_admin_id,status,updated_at desc,id desc) where assigned_admin_id is not null;
create trigger feedback_items_set_updated_at_and_version before update on public.feedback_items
for each row execute function private.set_updated_at_and_version();

create table public.abuse_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id text not null references public.profiles(id) on update restrict on delete restrict,
  resource_type text not null check(resource_type in ('content','support_message','assistant_response','other')),
  resource_id text not null check(resource_id=btrim(resource_id) and char_length(resource_id) between 1 and 128 and resource_id !~ '[[:cntrl:]]'),
  reason text not null check(reason=btrim(reason) and char_length(reason) between 1 and 2048 and reason !~ E'\\r'),
  status text not null default 'open' check(status in ('open','reviewing','actioned','dismissed')),
  reviewed_by text references public.admin_profiles(user_id) on update restrict on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check((status='open') or (reviewed_by is not null and reviewed_at is not null))
);
alter table public.abuse_reports owner to masarifi_migration;
create unique index abuse_reports_active_uq on public.abuse_reports(reporter_id,resource_type,resource_id) where status in ('open','reviewing');
create index abuse_reports_status_cursor_idx on public.abuse_reports(status,created_at desc,id desc);
create index abuse_reports_reporter_cursor_idx on public.abuse_reports(reporter_id,created_at desc,id desc);
create trigger abuse_reports_set_updated_at_and_version before update on public.abuse_reports
for each row execute function private.set_updated_at_and_version();

create table public.content_items (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check(key ~ '^[a-z][a-z0-9_-]{1,95}$'),
  type text not null check(type in ('article','faq','policy','announcement')),
  status text not null default 'draft' check(status in ('draft','review','published','retired')),
  published_at timestamptz,
  created_by text references public.admin_profiles(user_id) on update restrict on delete restrict,
  system_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check((status in ('published','retired'))=(published_at is not null)),
  check((created_by is null)=system_seed)
);
alter table public.content_items owner to masarifi_migration;
create index content_items_type_status_idx on public.content_items(type,status,updated_at desc,id desc);
create index content_items_public_idx on public.content_items(type,updated_at desc,id desc) where status='published';
create trigger content_items_set_updated_at_and_version before update on public.content_items
for each row execute function private.set_updated_at_and_version();

create table public.content_translations (
  id uuid primary key default extensions.gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on update restrict on delete cascade,
  locale text not null check(locale in ('ar','en')),
  title text not null check(title=btrim(title) and char_length(title) between 1 and 180 and title !~ '[[:cntrl:]]'),
  body text not null check(body=btrim(body) and char_length(body) between 1 and 65536 and body !~ E'\\r'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  unique(content_id,locale)
);
alter table public.content_translations owner to masarifi_migration;
create index content_translations_locale_content_idx on public.content_translations(locale,content_id);
create trigger content_translations_set_updated_at_and_version before update on public.content_translations
for each row execute function private.set_updated_at_and_version();

with seeded(key,type,title_en,body_en,title_ar,body_ar) as (values
  ('system_getting_started','article','Getting started','Use categories and accounts to organize your financial activity.','البدء','استخدم التصنيفات والحسابات لتنظيم نشاطك المالي.'),
  ('system_notification_help','faq','How notifications work','You control push and email delivery in notification preferences.','كيف تعمل الإشعارات','يمكنك التحكم في الإشعارات والبريد من تفضيلات الإشعارات.'),
  ('system_privacy_help','policy','Privacy and support','Support attachments remain quarantined until security scanning succeeds.','الخصوصية والدعم','تبقى مرفقات الدعم في العزل حتى ينجح الفحص الأمني.')
), inserted as (
  insert into public.content_items(key,type,status,published_at,created_by,system_seed)
  select key,type,'published',transaction_timestamp(),null,true from seeded
  on conflict(key) do update set key=excluded.key returning id,key
)
insert into public.content_translations(content_id,locale,title,body)
select i.id,'en',s.title_en,s.body_en from inserted i join seeded s using(key)
union all
select i.id,'ar',s.title_ar,s.body_ar from inserted i join seeded s using(key)
on conflict(content_id,locale) do nothing;

reset role;
revoke masarifi_migration from current_user granted by current_user;
