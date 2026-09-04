grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  report_type text not null,
  frequency text not null,
  timezone text not null,
  next_run_at timestamptz not null,
  delivery_channel text not null,
  recipient text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  constraint report_schedule_type_check check (report_type in ('financial_summary','category_spending','budget_performance','obligation_progress','savings_progress','account_activity')),
  constraint report_schedule_frequency_check check (frequency in ('monthly','three_months','half_year','annual')),
  constraint report_schedule_timezone_check check (length(timezone) between 1 and 64 and timezone !~ '[[:cntrl:]]'),
  constraint report_schedule_channel_check check (delivery_channel in ('download','email')),
  constraint report_schedule_recipient_check check (
    (delivery_channel='download' and recipient is null) or
    (delivery_channel='email' and recipient=lower(btrim(recipient)) and length(recipient) between 3 and 320 and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  constraint report_schedule_last_run_check check (last_run_at is null or last_run_at<=next_run_at),
  constraint report_schedule_version_check check (version>=1)
);
alter table public.report_schedules owner to masarifi_migration;
alter table public.report_schedules enable row level security;
alter table public.report_schedules force row level security;
create unique index report_schedules_owner_frequency_uq on public.report_schedules(user_id,report_type,frequency,delivery_channel);
create index report_schedules_user_created_idx on public.report_schedules(user_id,created_at desc,id desc);
create index report_schedules_due_idx on public.report_schedules(next_run_at,id) where enabled;

create policy report_schedules_owner_select on public.report_schedules for select to masarifi_api
using (user_id=(select public.current_clerk_user_id()));
create policy report_schedules_function_all on public.report_schedules for all to masarifi_migration
using (true) with check (true);
revoke all on public.report_schedules from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
grant select on public.report_schedules to masarifi_api;

create function private.guard_report_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception using errcode='22023',message='REPORT_TIMEZONE_INVALID';
  end if;
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
      raise exception using errcode='42501',message='REPORT_SCHEDULE_IDENTITY_IMMUTABLE';
    end if;
    new.version=old.version+1;
    new.updated_at=clock_timestamp();
  end if;
  return new;
end $$;
alter function private.guard_report_schedule() owner to masarifi_migration;
revoke all on function private.guard_report_schedule() from public;
create trigger report_schedule_guard before insert or update on public.report_schedules
for each row execute function private.guard_report_schedule();

create function private.create_report_schedule(
  p_user_id text,p_report_type text,p_frequency text,p_timezone text,p_next_run_at timestamptz,
  p_delivery_channel text,p_recipient text,p_enabled boolean
) returns setof public.report_schedules language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  return query insert into public.report_schedules(user_id,report_type,frequency,timezone,next_run_at,delivery_channel,recipient,enabled)
    values(p_user_id,p_report_type,p_frequency,p_timezone,p_next_run_at,p_delivery_channel,p_recipient,p_enabled)
    returning *;
end $$;
alter function private.create_report_schedule(text,text,text,text,timestamptz,text,text,boolean) owner to masarifi_migration;
revoke all on function private.create_report_schedule(text,text,text,text,timestamptz,text,text,boolean) from public;
grant execute on function private.create_report_schedule(text,text,text,text,timestamptz,text,text,boolean) to masarifi_api;

create function private.update_report_schedule(
  p_user_id text,p_id uuid,p_expected_version bigint,p_report_type text,p_frequency text,p_timezone text,
  p_next_run_at timestamptz,p_delivery_channel text,p_recipient text,p_enabled boolean
) returns setof public.report_schedules language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  return query update public.report_schedules s set report_type=p_report_type,frequency=p_frequency,
    timezone=p_timezone,next_run_at=p_next_run_at,delivery_channel=p_delivery_channel,
    recipient=p_recipient,enabled=p_enabled
  where s.id=p_id and s.user_id=p_user_id and s.version=p_expected_version returning s.*;
  if not found then
    if exists(select 1 from public.report_schedules s where s.id=p_id and s.user_id=p_user_id) then
      raise exception using errcode='40001',message='REPORT_SCHEDULE_CONFLICT';
    end if;
    raise exception using errcode='P0002',message='REPORT_NOT_FOUND';
  end if;
end $$;
alter function private.update_report_schedule(text,uuid,bigint,text,text,text,timestamptz,text,text,boolean) owner to masarifi_migration;
revoke all on function private.update_report_schedule(text,uuid,bigint,text,text,text,timestamptz,text,text,boolean) from public;
grant execute on function private.update_report_schedule(text,uuid,bigint,text,text,text,timestamptz,text,text,boolean) to masarifi_api;

create function private.delete_report_schedule(p_user_id text,p_id uuid,p_expected_version bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare deleted_id uuid;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  delete from public.report_schedules s
  where s.id=p_id and s.user_id=p_user_id and s.version=p_expected_version returning s.id into deleted_id;
  if deleted_id is null then
    if exists(select 1 from public.report_schedules s where s.id=p_id and s.user_id=p_user_id) then
      raise exception using errcode='40001',message='REPORT_SCHEDULE_CONFLICT';
    end if;
    raise exception using errcode='P0002',message='REPORT_NOT_FOUND';
  end if;
  return deleted_id;
end $$;
alter function private.delete_report_schedule(text,uuid,bigint) owner to masarifi_migration;
revoke all on function private.delete_report_schedule(text,uuid,bigint) from public;
grant execute on function private.delete_report_schedule(text,uuid,bigint) to masarifi_api;

create function private.list_due_report_schedules(p_now timestamptz,p_limit integer)
returns setof public.report_schedules language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_limit not between 1 and 100 then raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN'; end if;
  return query select s.* from public.report_schedules s where s.enabled and s.next_run_at<=p_now
    order by s.next_run_at,s.id for update of s skip locked limit p_limit;
end $$;
alter function private.list_due_report_schedules(timestamptz,integer) owner to masarifi_migration;
revoke all on function private.list_due_report_schedules(timestamptz,integer) from public;
grant execute on function private.list_due_report_schedules(timestamptz,integer) to masarifi_worker;

create function private.read_due_report_schedule(p_id uuid,p_now timestamptz)
returns setof public.report_schedules language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker' then
    raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN';
  end if;
  return query select s.* from public.report_schedules s where s.id=p_id and s.enabled and s.next_run_at<=p_now;
end $$;
alter function private.read_due_report_schedule(uuid,timestamptz) owner to masarifi_migration;
revoke all on function private.read_due_report_schedule(uuid,timestamptz) from public;
grant execute on function private.read_due_report_schedule(uuid,timestamptz) to masarifi_worker;

create function private.advance_report_schedule(p_id uuid,p_expected_version bigint,p_scheduled_for timestamptz,p_next_run_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_next_run_at<=p_scheduled_for then raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN'; end if;
  update public.report_schedules s set last_run_at=p_scheduled_for,next_run_at=p_next_run_at
  where s.id=p_id and s.version=p_expected_version and s.enabled;
  if not found then raise exception using errcode='40001',message='REPORT_SCHEDULE_CONFLICT'; end if;
end $$;
alter function private.advance_report_schedule(uuid,bigint,timestamptz,timestamptz) owner to masarifi_migration;
revoke all on function private.advance_report_schedule(uuid,bigint,timestamptz,timestamptz) from public;
grant execute on function private.advance_report_schedule(uuid,bigint,timestamptz,timestamptz) to masarifi_worker;

alter table private.report_output_attempts add constraint report_attempt_schedule_fk
foreign key(schedule_id) references public.report_schedules(id) on delete restrict;

drop function private.read_report_work(uuid);
create function private.read_report_work(p_id uuid)
returns table(id uuid,user_id text,status text,snapshot jsonb,storage_ref text,expires_at timestamptz,attempt_count integer,recipient text)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker' then
    raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN';
  end if;
  return query select a.id,a.user_id,a.delivery_status,a.snapshot,a.storage_ref,a.expires_at,a.attempt_count,s.recipient
  from private.report_output_attempts a left join public.report_schedules s on s.id=a.schedule_id where a.id=p_id;
end $$;
alter function private.read_report_work(uuid) owner to masarifi_migration;
revoke all on function private.read_report_work(uuid) from public;
grant execute on function private.read_report_work(uuid) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
