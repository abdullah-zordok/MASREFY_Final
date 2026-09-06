grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

alter table public.accounts
  add column statement_day smallint,
  add column payment_due_day smallint,
  add column monthly_interest_rate_basis_points integer,
  add column minimum_payment_minor bigint,
  add constraint accounts_statement_day_check
    check(statement_day is null or statement_day between 1 and 28),
  add constraint accounts_payment_due_day_check
    check(payment_due_day is null or payment_due_day between 1 and 28),
  add constraint accounts_monthly_interest_rate_basis_points_check
    check(monthly_interest_rate_basis_points is null
      or monthly_interest_rate_basis_points between 0 and 10000),
  add constraint accounts_minimum_payment_minor_check
    check(minimum_payment_minor is null
      or minimum_payment_minor between 1 and 9007199254740991),
  add constraint accounts_credit_card_terms_type_check
    check(type='credit_card' or (
      statement_day is null
      and payment_due_day is null
      and monthly_interest_rate_basis_points is null
      and minimum_payment_minor is null
    ));

grant insert(statement_day,payment_due_day,monthly_interest_rate_basis_points,minimum_payment_minor),
  update(statement_day,payment_due_day,monthly_interest_rate_basis_points,minimum_payment_minor)
  on public.accounts to masarifi_api;

create function private.clear_credit_card_terms_on_type_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.type='credit_card' and new.type<>'credit_card' then
    new.credit_limit_minor:=null;
    new.statement_day:=null;
    new.payment_due_day:=null;
    new.monthly_interest_rate_basis_points:=null;
    new.minimum_payment_minor:=null;
  end if;
  return new;
end $$;
alter function private.clear_credit_card_terms_on_type_change() owner to masarifi_migration;
revoke all on function private.clear_credit_card_terms_on_type_change()
  from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
create trigger accounts_clear_credit_card_terms
before update of type on public.accounts
for each row execute function private.clear_credit_card_terms_on_type_change();

create function private.attach_credit_card_terms_sync_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare terms jsonb;
begin
  if new.aggregate_type='account'
    and new.payload#>>'{sync,domain}'='accounts'
    and new.payload#>>'{sync,operation}'='upsert' then
    select jsonb_build_object(
      'statement_day',a.statement_day,
      'payment_due_day',a.payment_due_day,
      'monthly_interest_rate_basis_points',a.monthly_interest_rate_basis_points,
      'minimum_payment_minor',a.minimum_payment_minor
    ) into terms
    from public.accounts a where a.id=new.aggregate_id;
    new.payload:=jsonb_set(
      new.payload,'{sync,snapshot}',
      coalesce(new.payload#>'{sync,snapshot}','{}'::jsonb)||coalesce(terms,'{}'::jsonb),true
    );
  end if;
  return new;
end $$;
alter function private.attach_credit_card_terms_sync_snapshot() owner to masarifi_migration;
revoke all on function private.attach_credit_card_terms_sync_snapshot() from public;
create trigger outbox_events_sync_snapshot_credit_card_terms
before insert on private.outbox_events
for each row execute function private.attach_credit_card_terms_sync_snapshot();

insert into public.notification_templates(
  key,locale,channel,template_version,subject,body,status,published_at,created_by,system_seed
)
select 'account.credit_card_payment_due',locale,channel,1,
  case when channel='email' then case locale
    when 'ar' then 'موعد سداد البطاقة اليوم'
    else 'Credit card payment due today' end end,
  case locale
    when 'ar' then 'موعد سداد بطاقتك الائتمانية اليوم. راجع البطاقة في مصاريفي.'
    else 'Your credit card payment is due today. Review the card in Masarifi.' end,
  'published',transaction_timestamp(),null,true
from unnest(array['ar','en']) locale
cross join unnest(array['in_app','push','email']) channel
on conflict(key,locale,channel,template_version) do nothing;

insert into public.notification_preferences(user_id,channel,event_type)
select p.id,t.channel,t.key
from public.profiles p
cross join (
  select distinct key,channel from public.notification_templates
  where key='account.credit_card_payment_due' and system_seed
) t
on conflict(user_id,channel,event_type) do nothing;

create unique index outbox_credit_card_due_reminder_uq
on private.outbox_events(aggregate_id,(payload->>'dueDate'))
where event_type='account.credit_card_payment_due';

create function private.enqueue_credit_card_due_reminders(
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
    order by a.id limit p_limit
  ) candidate
  on conflict(aggregate_id,(payload->>'dueDate'))
    where event_type='account.credit_card_payment_due' do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;
alter function private.enqueue_credit_card_due_reminders(date,integer)
  owner to masarifi_migration;
revoke all on function private.enqueue_credit_card_due_reminders(date,integer)
  from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.enqueue_credit_card_due_reminders(date,integer)
  to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
