grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create table private.report_output_attempts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid,
  user_id text not null references public.profiles(id) on delete restrict,
  report_type text not null,
  period_start date not null,
  period_end date not null,
  ledger_version bigint not null,
  snapshot jsonb not null,
  storage_ref text,
  delivery_status text not null default 'queued',
  provider_message_id text,
  attempt_count integer not null default 0,
  error_code text,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint report_attempt_type_check check (report_type in ('financial_summary','category_spending','budget_performance','obligation_progress','savings_progress','account_activity')),
  constraint report_attempt_period_check check (period_end>=period_start and period_end<period_start+interval '1 year'),
  constraint report_attempt_ledger_check check (ledger_version>=0),
  constraint report_attempt_snapshot_check check (jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=1048576),
  constraint report_attempt_storage_check check (storage_ref is null or storage_ref ~ '^reports/[a-f0-9]{64}/[0-9a-f-]{36}\.(json|csv|pdf)$'),
  constraint report_attempt_status_check check (delivery_status in ('queued','generating','ready','sending','delivered','failed','expired')),
  constraint report_attempt_provider_check check (provider_message_id is null or (length(provider_message_id) between 3 and 254 and provider_message_id !~ '[\r\n]')),
  constraint report_attempt_count_check check (attempt_count between 0 and 20),
  constraint report_attempt_error_check check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  constraint report_attempt_expiry_check check (expires_at>created_at and expires_at<=created_at+interval '7 days')
);
alter table private.report_output_attempts owner to masarifi_migration;
alter table private.report_output_attempts enable row level security;
alter table private.report_output_attempts force row level security;
create policy report_attempts_owner_function_policy on private.report_output_attempts
  for all to masarifi_migration using (true) with check (true);
create unique index report_attempts_schedule_period_uq on private.report_output_attempts(schedule_id,period_start,period_end) where schedule_id is not null;
create index report_attempts_user_created_idx on private.report_output_attempts(user_id,created_at desc,id desc);
create index report_attempts_active_idx on private.report_output_attempts(delivery_status,created_at,id) where delivery_status in ('queued','generating','ready','sending','failed');
create index report_attempts_expiry_idx on private.report_output_attempts(expires_at,id) where delivery_status<>'expired';
create index report_attempts_schedule_idx on private.report_output_attempts(schedule_id,created_at desc) where schedule_id is not null;

create table private.report_delivery_webhook_receipts (
  event_id text primary key,
  payload_hash text not null,
  received_at timestamptz not null default clock_timestamp(),
  constraint report_delivery_webhook_event_check check (length(event_id) between 1 and 128 and event_id !~ '[[:cntrl:]]'),
  constraint report_delivery_webhook_hash_check check (payload_hash ~ '^[a-f0-9]{64}$')
);
alter table private.report_delivery_webhook_receipts owner to masarifi_migration;
revoke all on private.report_delivery_webhook_receipts from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create function private.capture_report_delivery_webhook(p_event_id text,p_payload_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare existing_hash text;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker' then
    raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN';
  end if;
  delete from private.report_delivery_webhook_receipts where ctid in (
    select ctid from private.report_delivery_webhook_receipts where received_at<clock_timestamp()-interval '10 minutes' limit 100
  );
  insert into private.report_delivery_webhook_receipts(event_id,payload_hash) values(p_event_id,p_payload_hash) on conflict do nothing;
  if found then return 'new'; end if;
  select r.payload_hash into existing_hash from private.report_delivery_webhook_receipts r where r.event_id=p_event_id;
  return case when existing_hash=p_payload_hash then 'replay' else 'conflict' end;
end $$;
alter function private.capture_report_delivery_webhook(text,text) owner to masarifi_migration;
revoke all on function private.capture_report_delivery_webhook(text,text) from public;
grant execute on function private.capture_report_delivery_webhook(text,text) to masarifi_worker;

create function private.guard_report_output_attempt() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id or new.schedule_id is distinct from old.schedule_id
    or new.user_id is distinct from old.user_id or new.report_type is distinct from old.report_type
    or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
    or new.ledger_version is distinct from old.ledger_version or new.snapshot is distinct from old.snapshot
    or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501',message='REPORT_SNAPSHOT_IMMUTABLE';
  end if;
  if not (
    (old.delivery_status='queued' and new.delivery_status in ('generating','failed','expired')) or
    (old.delivery_status='generating' and new.delivery_status in ('ready','failed','expired')) or
    (old.delivery_status='ready' and new.delivery_status in ('sending','failed','expired')) or
    (old.delivery_status='sending' and new.delivery_status in ('ready','delivered','failed')) or
    (old.delivery_status='delivered' and new.delivery_status='expired') or
    (old.delivery_status='failed' and new.delivery_status in ('generating','ready','sending','expired')) or
    (old.delivery_status=new.delivery_status)
  ) then raise exception using errcode='P0001',message='REPORT_TRANSITION_INVALID'; end if;
  if old.delivery_status='expired' and new is distinct from old then
    raise exception using errcode='P0001',message='REPORT_TERMINAL_STATE';
  end if;
  return new;
end $$;
alter function private.guard_report_output_attempt() owner to masarifi_migration;
revoke all on function private.guard_report_output_attempt() from public;
create trigger report_output_attempt_guard before update on private.report_output_attempts
for each row execute function private.guard_report_output_attempt();

create function private.capture_report_snapshot(
  p_user_id text,p_report_type text,p_period_start date,p_period_end date,
  p_ledger_version bigint,p_snapshot jsonb,p_schedule_id uuid,p_expires_at timestamptz
) returns table(id uuid,delivery_status text,ledger_version bigint,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare inserted private.report_output_attempts;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  if p_snapshot->>'reportType' is distinct from p_report_type
    or (p_snapshot->>'ledgerVersion')::bigint is distinct from p_ledger_version
    or p_snapshot#>>'{period,startDate}' is distinct from p_period_start::text
    or p_snapshot#>>'{period,endDate}' is distinct from p_period_end::text
    or p_snapshot->>'schemaVersion'<>'1' then
    raise exception using errcode='22023',message='REPORT_SNAPSHOT_INVALID';
  end if;
  insert into private.report_output_attempts(
    schedule_id,user_id,report_type,period_start,period_end,ledger_version,snapshot,expires_at
  ) values(p_schedule_id,p_user_id,p_report_type,p_period_start,p_period_end,p_ledger_version,p_snapshot,p_expires_at)
  on conflict(schedule_id,period_start,period_end) where schedule_id is not null do nothing
  returning * into inserted;
  if inserted.id is null and p_schedule_id is not null then
    select * into inserted from private.report_output_attempts a
    where a.schedule_id=p_schedule_id and a.period_start=p_period_start and a.period_end=p_period_end;
    return query select inserted.id,inserted.delivery_status,inserted.ledger_version,inserted.expires_at;
    return;
  end if;
  perform private.enqueue_outbox_event('report.requested','report_attempt',inserted.id,
    jsonb_build_object('schemaVersion',1,'attemptId',inserted.id,'reportType',inserted.report_type,
      'format',inserted.snapshot->>'format','delivery',inserted.snapshot->>'delivery','ledgerVersion',inserted.ledger_version));
  return query select inserted.id,inserted.delivery_status,inserted.ledger_version,inserted.expires_at;
end $$;
alter function private.capture_report_snapshot(text,text,date,date,bigint,jsonb,uuid,timestamptz) owner to masarifi_migration;
revoke all on function private.capture_report_snapshot(text,text,date,date,bigint,jsonb,uuid,timestamptz) from public;
grant execute on function private.capture_report_snapshot(text,text,date,date,bigint,jsonb,uuid,timestamptz) to masarifi_api,masarifi_worker;

create function private.transition_report_output(
  p_id uuid,p_status text,p_storage_ref text,p_provider_message_id text,p_error_code text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker' then
    raise exception using errcode='42501',message='REPORT_TRANSITION_FORBIDDEN';
  end if;
  update private.report_output_attempts set
    delivery_status=p_status,
    storage_ref=coalesce(p_storage_ref,storage_ref),
    provider_message_id=coalesce(p_provider_message_id,provider_message_id),
    error_code=p_error_code,
    attempt_count=attempt_count+case when p_status in ('generating','sending') then 1 else 0 end
  where id=p_id;
  if not found then raise exception using errcode='P0002',message='REPORT_NOT_FOUND'; end if;
end $$;
alter function private.transition_report_output(uuid,text,text,text,text) owner to masarifi_migration;
revoke all on function private.transition_report_output(uuid,text,text,text,text) from public;
grant execute on function private.transition_report_output(uuid,text,text,text,text) to masarifi_worker;

create function private.read_report_output(p_user_id text,p_id uuid)
returns table(id uuid,report_type text,format text,delivery text,status text,
  metadata jsonb,requested_at timestamptz,expires_at timestamptz,storage_ref text,error_code text)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  return query select a.id,a.report_type,a.snapshot->>'format',a.snapshot->>'delivery',a.delivery_status,
    jsonb_build_object('schemaVersion',a.snapshot->'schemaVersion','generatedAt',a.snapshot->'generatedAt',
      'ledgerVersion',a.ledger_version,'reportType',a.report_type,'period',a.snapshot->'period',
      'dataState',a.snapshot->'dataState','evidence',a.snapshot->'evidence'),
    a.created_at,a.expires_at,a.storage_ref,a.error_code
  from private.report_output_attempts a where a.id=p_id and a.user_id=p_user_id;
end $$;
alter function private.read_report_output(text,uuid) owner to masarifi_migration;
revoke all on function private.read_report_output(text,uuid) from public;
grant execute on function private.read_report_output(text,uuid) to masarifi_api;

create function private.list_report_outputs(
  p_user_id text,p_before timestamptz,p_before_id uuid,p_limit integer,p_schedule_id uuid,p_status text
) returns table(id uuid,report_type text,format text,delivery text,status text,
  metadata jsonb,requested_at timestamptz,expires_at timestamptz,error_code text)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id
    or p_limit not between 1 and 100 then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  return query select a.id,a.report_type,a.snapshot->>'format',a.snapshot->>'delivery',a.delivery_status,
    jsonb_build_object('schemaVersion',a.snapshot->'schemaVersion','generatedAt',a.snapshot->'generatedAt',
      'ledgerVersion',a.ledger_version,'reportType',a.report_type,'period',a.snapshot->'period',
      'dataState',a.snapshot->'dataState','evidence',a.snapshot->'evidence'),
    a.created_at,a.expires_at,a.error_code
  from private.report_output_attempts a where a.user_id=p_user_id
    and (p_before is null or (a.created_at,a.id)<(p_before,p_before_id))
    and (p_schedule_id is null or a.schedule_id=p_schedule_id)
    and (p_status is null or a.delivery_status=p_status)
  order by a.created_at desc,a.id desc limit p_limit;
end $$;
alter function private.list_report_outputs(text,timestamptz,uuid,integer,uuid,text) owner to masarifi_migration;
revoke all on function private.list_report_outputs(text,timestamptz,uuid,integer,uuid,text) from public;
grant execute on function private.list_report_outputs(text,timestamptz,uuid,integer,uuid,text) to masarifi_api;

create function private.retry_report_delivery(p_user_id text,p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare changed private.report_output_attempts;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from p_user_id then
    raise exception using errcode='42501',message='REPORT_OWNER_FORBIDDEN';
  end if;
  update private.report_output_attempts a set delivery_status='ready',error_code=null
  where a.id=p_id and a.user_id=p_user_id and a.delivery_status='failed'
    and a.storage_ref is not null and a.expires_at>clock_timestamp()
    and a.snapshot->>'delivery'='email' and coalesce(a.error_code,'')<>'DELIVERY_ACCEPTANCE_UNKNOWN'
  returning * into changed;
  if changed.id is null then raise exception using errcode='P0002',message='REPORT_NOT_FOUND'; end if;
  perform private.enqueue_outbox_event('report.ready','report_attempt',changed.id,
    jsonb_build_object('schemaVersion',1,'attemptId',changed.id,'format',changed.snapshot->>'format',
      'bytes',0,'expiresAt',changed.expires_at));
  return changed.delivery_status;
end $$;
alter function private.retry_report_delivery(text,uuid) owner to masarifi_migration;
revoke all on function private.retry_report_delivery(text,uuid) from public;
grant execute on function private.retry_report_delivery(text,uuid) to masarifi_api;

create function private.list_report_work(p_kind text,p_limit integer)
returns table(id uuid) language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_kind not in ('report.generate','report.email.deliver','report.output.expire')
    or p_limit not between 1 and 100 then
    raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN';
  end if;
  return query select a.id from private.report_output_attempts a
  where case p_kind
    when 'report.generate' then a.delivery_status in ('queued','generating')
      or (a.delivery_status='failed' and a.error_code='REPORT_STORAGE_UNAVAILABLE' and a.attempt_count<20)
    when 'report.email.deliver' then a.delivery_status in ('ready','sending') and a.snapshot->>'delivery'='email'
    else a.delivery_status<>'expired' and a.expires_at<=clock_timestamp()
  end
  order by case when p_kind='report.output.expire' then a.expires_at else a.created_at end,a.id
  limit p_limit;
end $$;
alter function private.list_report_work(text,integer) owner to masarifi_migration;
revoke all on function private.list_report_work(text,integer) from public;
grant execute on function private.list_report_work(text,integer) to masarifi_worker;

create function private.read_report_work(p_id uuid)
returns table(id uuid,user_id text,status text,snapshot jsonb,storage_ref text,expires_at timestamptz,attempt_count integer)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker' then
    raise exception using errcode='42501',message='REPORT_WORK_FORBIDDEN';
  end if;
  return query select a.id,a.user_id,a.delivery_status,a.snapshot,a.storage_ref,a.expires_at,a.attempt_count
  from private.report_output_attempts a where a.id=p_id;
end $$;
alter function private.read_report_work(uuid) owner to masarifi_migration;
revoke all on function private.read_report_work(uuid) from public;
grant execute on function private.read_report_work(uuid) to masarifi_worker;

revoke all on private.report_output_attempts from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
