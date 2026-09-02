grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

alter table public.obligation_payments
add column ledger_invalidation_status text,
add constraint obligation_payments_ledger_invalidation_check check(
  ledger_invalidation_status is null
  or (status='reversed' and ledger_invalidation_status in ('reversed','deleted'))
);

create function private.recompute_obligation_schedule_item(p_schedule_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  schedule public.obligation_schedule_items;
  recomputed_paid_minor bigint;
  recomputed_status text;
begin
  select * into schedule
  from public.obligation_schedule_items i
  where i.id=p_schedule_item_id
  for update;

  if schedule.id is null then return; end if;

  select least(
    schedule.amount_minor::numeric,
    coalesce(sum(a.amount_minor) filter(where p.status='confirmed'),0)
  )::bigint into recomputed_paid_minor
  from public.obligation_payment_allocations a
  join public.obligation_payments p on p.id=a.payment_id
  where a.schedule_item_id=schedule.id;

  recomputed_status=case
    when recomputed_paid_minor=schedule.amount_minor then 'paid'
    when schedule.due_at<clock_timestamp() then 'overdue'
    when recomputed_paid_minor=0 then 'due'
    else 'partial'
  end;

  if schedule.paid_minor is distinct from recomputed_paid_minor
    or schedule.status is distinct from recomputed_status then
    update public.obligation_schedule_items i
    set paid_minor=recomputed_paid_minor,status=recomputed_status
    where i.id=schedule.id;
  end if;
end $$;
alter function private.recompute_obligation_schedule_item(uuid) owner to masarifi_migration;
revoke all on function private.recompute_obligation_schedule_item(uuid)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create function private.invalidate_linked_obligation_payments(p_transaction_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
  transaction_row public.transactions;
  payment public.obligation_payments;
  schedule_item_id uuid;
  invalidated_count integer:=0;
  request_id text;
begin
  select * into transaction_row
  from public.transactions t
  where t.id=p_transaction_id
  for update;

  if transaction_row.id is null or transaction_row.status='confirmed' then return 0; end if;
  request_id='ledger-transaction-'||transaction_row.status;

  perform o.id
  from public.obligations o
  join public.obligation_payments p on p.obligation_id=o.id
  where p.transaction_id=transaction_row.id and p.status='confirmed'
  order by o.id
  for update of o;

  for payment in
    select p.*
    from public.obligation_payments p
    where p.transaction_id=transaction_row.id and p.status='confirmed'
    order by p.id
    for update
  loop
    update public.obligation_payments p
    set status='reversed',ledger_invalidation_status=transaction_row.status
    where p.id=payment.id and p.status='confirmed'
    returning * into payment;

    if payment.id is null then continue; end if;

    for schedule_item_id in
      select distinct a.schedule_item_id
      from public.obligation_payment_allocations a
      where a.payment_id=payment.id
      order by a.schedule_item_id
    loop
      perform private.recompute_obligation_schedule_item(schedule_item_id);
    end loop;

    update public.obligations o
    set updated_at=o.updated_at
    where o.id=payment.obligation_id;

    perform private.enqueue_outbox_event(
      'planning.obligation_payment_reversed',
      'obligation-payment',
      payment.id,
      jsonb_build_object(
        'obligationId',payment.obligation_id,
        'paymentId',payment.id,
        'transactionId',payment.transaction_id,
        'userId',payment.user_id,
        'aggregateVersion',payment.version,
        'status',payment.status,
        'ledgerVersion',coalesce((
          select max(ab.ledger_version)
          from public.account_balances ab
          join public.accounts a on a.id=ab.account_id
          where a.user_id=payment.user_id
        ),0),
        'requestId',request_id
      )
    );
    perform audit.append_event(
      payment.user_id,
      'system',
      'planning.obligation-payment-reversed',
      'obligation_payment',
      payment.id::text,
      null,
      null,
      null,
      request_id,
      jsonb_build_object(
        'version',payment.version,
        'obligationId',payment.obligation_id,
        'transactionId',payment.transaction_id,
        'transactionStatus',transaction_row.status
      )
    );
    invalidated_count=invalidated_count+1;
  end loop;

  return invalidated_count;
end $$;
alter function private.invalidate_linked_obligation_payments(uuid) owner to masarifi_migration;
revoke all on function private.invalidate_linked_obligation_payments(uuid)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create function private.restore_linked_obligation_payments(p_transaction_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
  transaction_row public.transactions;
  payment public.obligation_payments;
  schedule_item_id uuid;
  restored_count integer:=0;
  request_id text:='ledger-transaction-restored';
begin
  select * into transaction_row
  from public.transactions t
  where t.id=p_transaction_id
  for update;

  if transaction_row.id is null or transaction_row.status<>'confirmed' then return 0; end if;

  perform o.id
  from public.obligations o
  join public.obligation_payments p on p.obligation_id=o.id
  where p.transaction_id=transaction_row.id
    and p.status='reversed' and p.ledger_invalidation_status='deleted'
  order by o.id
  for update of o;

  for payment in
    select p.*
    from public.obligation_payments p
    where p.transaction_id=transaction_row.id
      and p.status='reversed' and p.ledger_invalidation_status='deleted'
    order by p.id
    for update
  loop
    perform i.id
    from public.obligation_schedule_items i
    join public.obligation_payment_allocations a on a.schedule_item_id=i.id
    where a.payment_id=payment.id
    order by i.id
    for update of i;

    if (
      select coalesce(sum(greatest(
        a.amount_minor-greatest(i.amount_minor-i.paid_minor,0),0
      )),0)
      from public.obligation_payment_allocations a
      join public.obligation_schedule_items i on i.id=a.schedule_item_id
      where a.payment_id=payment.id
    )>payment.principal_reduction_minor+payment.settlement_adjustment_minor then
      raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE';
    end if;

    update public.obligation_payments p
    set status='confirmed',ledger_invalidation_status=null
    where p.id=payment.id and p.status='reversed' and p.ledger_invalidation_status='deleted'
    returning * into payment;

    if payment.id is null then continue; end if;

    for schedule_item_id in
      select distinct a.schedule_item_id
      from public.obligation_payment_allocations a
      where a.payment_id=payment.id
      order by a.schedule_item_id
    loop
      perform private.recompute_obligation_schedule_item(schedule_item_id);
    end loop;

    update public.obligations o
    set updated_at=o.updated_at
    where o.id=payment.obligation_id;

    perform private.enqueue_outbox_event(
      'planning.obligation_payment_recorded',
      'obligation-payment',
      payment.id,
      jsonb_build_object(
        'obligationId',payment.obligation_id,
        'paymentId',payment.id,
        'transactionId',payment.transaction_id,
        'userId',payment.user_id,
        'aggregateVersion',payment.version,
        'status',payment.status,
        'ledgerVersion',coalesce((
          select max(ab.ledger_version)
          from public.account_balances ab
          join public.accounts a on a.id=ab.account_id
          where a.user_id=payment.user_id
        ),0),
        'requestId',request_id
      )
    );
    perform audit.append_event(
      payment.user_id,
      'system',
      'planning.obligation-payment-recorded',
      'obligation_payment',
      payment.id::text,
      null,
      null,
      null,
      request_id,
      jsonb_build_object(
        'version',payment.version,
        'obligationId',payment.obligation_id,
        'transactionId',payment.transaction_id,
        'restoredFromTransactionDeletion',true
      )
    );
    restored_count=restored_count+1;
  end loop;

  return restored_count;
end $$;
alter function private.restore_linked_obligation_payments(uuid) owner to masarifi_migration;
revoke all on function private.restore_linked_obligation_payments(uuid)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create function private.invalidate_linked_obligation_payments_after_ledger_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.invalidate_linked_obligation_payments(new.id);
  return new;
end $$;
alter function private.invalidate_linked_obligation_payments_after_ledger_status() owner to masarifi_migration;
revoke all on function private.invalidate_linked_obligation_payments_after_ledger_status()
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create trigger transactions_invalidate_linked_obligation_payments
after update of status on public.transactions
for each row
when (old.status='confirmed' and new.status in ('reversed','deleted'))
execute function private.invalidate_linked_obligation_payments_after_ledger_status();

create function private.restore_linked_obligation_payments_after_ledger_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.restore_linked_obligation_payments(new.id);
  return new;
end $$;
alter function private.restore_linked_obligation_payments_after_ledger_status() owner to masarifi_migration;
revoke all on function private.restore_linked_obligation_payments_after_ledger_status()
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create trigger transactions_restore_linked_obligation_payments
after update of status on public.transactions
for each row
when (old.status='deleted' and new.status='confirmed')
execute function private.restore_linked_obligation_payments_after_ledger_status();

do $$
declare transaction_id uuid;
begin
  for transaction_id in
    select distinct t.id
    from public.transactions t
    join public.obligation_payments p on p.transaction_id=t.id
    where t.status<>'confirmed' and p.status='confirmed'
    order by t.id
  loop
    perform private.invalidate_linked_obligation_payments(transaction_id);
  end loop;
end $$;

reset role;
revoke masarifi_migration from current_user granted by current_user;
