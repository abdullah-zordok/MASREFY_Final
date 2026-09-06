grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create or replace function private.enqueue_credit_card_due_reminders(
  p_due_date date,
  p_limit integer
) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  if p_due_date is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='CREDIT_CARD_REMINDER_INPUT_INVALID';
  end if;
  insert into private.outbox_events(event_type,aggregate_type,aggregate_id,payload)
  select 'account.credit_card_payment_due','account',candidate.id,
    jsonb_build_object(
      'userId',candidate.user_id,
      'dueDate',p_due_date,
      'expiresAt',(p_due_date+1)::timestamp at time zone 'UTC'
    )
  from (
    select a.id,a.user_id from public.accounts a
    join public.profiles p on p.id=a.user_id and p.status='active'
    where a.type='credit_card' and a.status='active' and a.deleted_at is null
      and a.payment_due_day=extract(day from p_due_date)::integer
      and not exists (
        select 1 from private.outbox_events o
        where o.event_type='account.credit_card_payment_due'
          and o.aggregate_id=a.id and o.payload->>'dueDate'=p_due_date::text
      )
    order by a.id limit p_limit
  ) candidate
  on conflict(aggregate_id,(payload->>'dueDate'))
    where event_type='account.credit_card_payment_due' do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create function private.enqueue_credit_card_due_reminders(
  p_now timestamptz,
  p_limit integer
) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  if p_now is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='CREDIT_CARD_REMINDER_INPUT_INVALID';
  end if;
  insert into private.outbox_events(event_type,aggregate_type,aggregate_id,payload)
  select 'account.credit_card_payment_due','account',candidate.id,
    jsonb_build_object(
      'userId',candidate.user_id,
      'dueDate',candidate.due_date,
      'expiresAt',(candidate.due_date+1)::timestamp at time zone candidate.timezone
    )
  from (
    select a.id,a.user_id,p.timezone,(p_now at time zone p.timezone)::date due_date
    from public.accounts a
    join public.profiles p on p.id=a.user_id and p.status='active'
    join pg_catalog.pg_timezone_names tz on tz.name=p.timezone
    where a.type='credit_card' and a.status='active' and a.deleted_at is null
      and a.payment_due_day=extract(day from p_now at time zone p.timezone)::integer
      and not exists (
        select 1 from private.outbox_events o
        where o.event_type='account.credit_card_payment_due'
          and o.aggregate_id=a.id
          and o.payload->>'dueDate'=((p_now at time zone p.timezone)::date)::text
      )
    order by a.id limit p_limit
  ) candidate
  on conflict(aggregate_id,(payload->>'dueDate'))
    where event_type='account.credit_card_payment_due' do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;
revoke all on function private.enqueue_credit_card_due_reminders(timestamptz,integer)
  from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.enqueue_credit_card_due_reminders(timestamptz,integer)
  to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
