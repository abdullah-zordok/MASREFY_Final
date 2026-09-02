grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create or replace function private.allocate_obligation_payment(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation';request_id text:=p_body->>'requestId';
  allocation_intent text:=p_body->>'allocationIntent';
  obligation public.obligations;payment public.obligation_payments;transaction_row public.transactions;
  schedule public.obligation_schedule_items;allocation jsonb;allocation_total bigint:=0;payment_result jsonb;
  allocation_amount bigint;allocation_excess bigint;excess_total bigint:=0;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>65536
    or operation not in ('record','reverse') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if operation='record' then
    select * into transaction_row from public.transactions t
    where t.id=(p_body->>'transactionId')::uuid and t.user_id=p_user_id for update;
  end if;
  select * into obligation from public.obligations o
  where o.id=(p_body->>'obligationId')::uuid and o.user_id=p_user_id for update;
  if obligation.id is null then raise exception using errcode='P0001',message='OBLIGATION_NOT_FOUND'; end if;

  if operation='record' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','paymentId','transactionId','expectedVersion','paymentMethod','paymentCase',
      'allocationIntent','source','allocations','operationId','requestId'
    )) or obligation.status<>'active' then raise exception using errcode='P0001',message='OBLIGATION_INELIGIBLE'; end if;
    if obligation.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=obligation.version::text;
    end if;
    if transaction_row.id is null or transaction_row.status<>'confirmed'
      or transaction_row.kind<>(case when obligation.direction='payable' then 'expense' else 'income' end)
      or transaction_row.currency_code<>obligation.currency_code then
      raise exception using errcode='P0001',message='PAYMENT_TRANSACTION_INVALID';
    end if;
    if exists(select 1 from public.obligation_payments p where p.transaction_id=transaction_row.id and p.status<>'reversed') then
      raise exception using errcode='P0001',message='PAYMENT_TRANSACTION_USED';
    end if;
    if jsonb_typeof(p_body->'allocations')<>'array' or jsonb_array_length(p_body->'allocations') not between 1 and 100
      or exists(select 1 from jsonb_array_elements(p_body->'allocations') value
        group by value->>'scheduleItemId' having count(*)>1) then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    for allocation in select value from jsonb_array_elements(p_body->'allocations') order by value->>'scheduleItemId'
    loop
      if jsonb_typeof(allocation)<>'object' or exists(select 1 from jsonb_object_keys(allocation) key
        where key not in ('scheduleItemId','amountMinor')) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      select * into schedule from public.obligation_schedule_items i
      where i.id=(allocation->>'scheduleItemId')::uuid and i.user_id=p_user_id
        and i.obligation_id=obligation.id for update;
      if schedule.id is null then raise exception using errcode='P0001',message='PAYMENT_SCHEDULE_INVALID'; end if;
      allocation_amount:=(allocation->>'amountMinor')::bigint;
      if allocation_amount<=0 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      allocation_excess:=greatest(allocation_amount-(schedule.amount_minor-schedule.paid_minor),0);
      if allocation_excess>0 and allocation_intent not in ('prepayment','principal','settlement') then
        raise exception using errcode='P0001',message='PAYMENT_ALLOCATION_EXCEEDS_REMAINDER';
      end if;
      allocation_total:=allocation_total+allocation_amount;
      excess_total:=excess_total+allocation_excess;
    end loop;
    if allocation_total<>transaction_row.amount_minor then
      raise exception using errcode='P0001',message='PAYMENT_ALLOCATION_SUM_MISMATCH';
    end if;
    insert into public.obligation_payments(
      id,user_id,obligation_id,transaction_id,paid_at,amount_minor,payment_method,payment_case,
      allocation_intent,source,principal_reduction_minor,settlement_adjustment_minor,operation_id
    ) values(
      (p_body->>'paymentId')::uuid,p_user_id,obligation.id,transaction_row.id,transaction_row.occurred_at,
      transaction_row.amount_minor,p_body->>'paymentMethod',p_body->>'paymentCase',allocation_intent,
      p_body->>'source',case when allocation_intent in ('prepayment','principal') then excess_total else 0 end,
      case when allocation_intent='settlement' then excess_total else 0 end,(p_body->>'operationId')::uuid
    ) returning * into payment;
    for allocation in select value from jsonb_array_elements(p_body->'allocations') order by value->>'scheduleItemId'
    loop
      insert into public.obligation_payment_allocations(user_id,payment_id,schedule_item_id,amount_minor)
      values(p_user_id,payment.id,(allocation->>'scheduleItemId')::uuid,(allocation->>'amountMinor')::bigint);
      perform private.recompute_obligation_schedule_item((allocation->>'scheduleItemId')::uuid);
    end loop;
    update public.obligations o set updated_at=o.updated_at where o.id=obligation.id returning * into obligation;
    perform private.enqueue_outbox_event('planning.obligation_payment_recorded','obligation-payment',payment.id,
      jsonb_build_object('obligationId',obligation.id,'paymentId',payment.id,'transactionId',payment.transaction_id,
        'userId',p_user_id,'aggregateVersion',payment.version,'status',payment.status,
        'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
          join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
    perform audit.append_event(p_user_id,'user','planning.obligation-payment-recorded','obligation_payment',payment.id::text,
      null,null,null,request_id,jsonb_build_object('version',payment.version,'obligationId',obligation.id));
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','obligationId','paymentId','expectedVersion','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into payment from public.obligation_payments p
    where p.id=(p_body->>'paymentId')::uuid and p.user_id=p_user_id and p.obligation_id=obligation.id for update;
    if payment.id is null then raise exception using errcode='P0001',message='PAYMENT_NOT_FOUND'; end if;
    if payment.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=payment.version::text;
    end if;
    if payment.status<>'confirmed' then raise exception using errcode='P0001',message='PAYMENT_INELIGIBLE'; end if;
    update public.obligation_payments p set status='reversed',operation_id=(p_body->>'operationId')::uuid
    where p.id=payment.id returning * into payment;
    for allocation in select jsonb_build_object('scheduleItemId',a.schedule_item_id,'amountMinor',a.amount_minor) value
      from public.obligation_payment_allocations a where a.payment_id=payment.id order by a.schedule_item_id
    loop
      select * into schedule from public.obligation_schedule_items i
      where i.id=(allocation->>'scheduleItemId')::uuid for update;
      perform private.recompute_obligation_schedule_item(schedule.id);
    end loop;
    update public.obligations o set updated_at=o.updated_at where o.id=obligation.id returning * into obligation;
    perform private.enqueue_outbox_event('planning.obligation_payment_reversed','obligation-payment',payment.id,
      jsonb_build_object('obligationId',obligation.id,'paymentId',payment.id,'transactionId',payment.transaction_id,
        'userId',p_user_id,'aggregateVersion',payment.version,'status',payment.status,
        'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
          join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),'requestId',request_id));
    perform audit.append_event(p_user_id,'user','planning.obligation-payment-reversed','obligation_payment',payment.id::text,
      null,null,null,request_id,jsonb_build_object('version',payment.version,'obligationId',obligation.id));
  end if;
  payment_result=jsonb_build_object('id',payment.id,'obligationId',payment.obligation_id,
    'transactionId',payment.transaction_id,'paidAt',payment.paid_at,'amountMinor',payment.amount_minor::text,
    'paymentMethod',payment.payment_method,'paymentCase',payment.payment_case,'allocationIntent',payment.allocation_intent,
    'source',payment.source,'status',payment.status,'operationId',payment.operation_id,
    'createdAt',payment.created_at,'updatedAt',payment.updated_at,'version',payment.version,'obligationVersion',obligation.version);
  return payment_result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;

alter function private.allocate_obligation_payment(text,jsonb) owner to masarifi_migration;
revoke all on function private.allocate_obligation_payment(text,jsonb)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
grant execute on function private.allocate_obligation_payment(text,jsonb) to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
