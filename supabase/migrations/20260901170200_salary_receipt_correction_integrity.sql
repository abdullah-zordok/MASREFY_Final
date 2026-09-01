grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create or replace function private.link_salary_receipt(p_user_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  operation text:=p_body->>'operation'; profile public.salary_profiles; receipt public.salary_receipts;
  predecessor public.salary_receipts; predecessor_id uuid;
  transaction_row public.transactions; request_id text:=p_body->>'requestId'; event_type text;
begin
  perform private.assert_active_profile(p_user_id);
  if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>4096
    or operation not in ('link','unlink') or request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select * into profile from public.salary_profiles p
  where p.id=(p_body->>'profileId')::uuid and p.user_id=p_user_id for update;
  if profile.id is null or profile.status='archived' then raise exception using errcode='P0001',message='SALARY_PROFILE_NOT_FOUND'; end if;

  if operation='link' then
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','transactionId','expectedAt','replacesReceiptId','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into receipt from public.salary_receipts r
    where r.salary_profile_id=profile.id and r.user_id=p_user_id
      and r.expected_at=(p_body->>'expectedAt')::timestamptz for update;
    if receipt.id is null or receipt.status not in ('expected','missed','ignored') then
      raise exception using errcode='P0001',message='SALARY_RECEIPT_NOT_FOUND';
    end if;
    select * into transaction_row from public.transactions t
    where t.id=(p_body->>'transactionId')::uuid and t.user_id=p_user_id for update;
    if transaction_row.id is null or transaction_row.kind<>'income' or transaction_row.status<>'confirmed'
      or transaction_row.currency_code<>profile.currency_code then
      raise exception using errcode='P0001',message='SALARY_TRANSACTION_INVALID';
    end if;
    predecessor_id:=(p_body->>'replacesReceiptId')::uuid;
    if predecessor_id is not null then
      select * into predecessor from public.salary_receipts r
      where r.id=predecessor_id and r.user_id=p_user_id and r.salary_profile_id=profile.id
      for update;
      if predecessor.id is null then
        raise exception using errcode='P0001',message='SALARY_RECEIPT_NOT_FOUND';
      end if;
      if predecessor.status not in ('received','corrected')
        or exists(
          select 1 from public.salary_receipts successor
          where successor.replaces_receipt_id=predecessor.id
        )
        or exists(
          with recursive predecessor_chain(id,replaces_receipt_id,path) as (
            select r.id,r.replaces_receipt_id,array[r.id]::uuid[]
            from public.salary_receipts r where r.id=predecessor.id
            union all
            select r.id,r.replaces_receipt_id,chain.path||r.id
            from predecessor_chain chain
            join public.salary_receipts r on r.id=chain.replaces_receipt_id
            where not r.id=any(chain.path)
          )
          select 1 from predecessor_chain chain where chain.id=receipt.id
        ) then
        raise exception using errcode='P0001',message='SALARY_RECEIPT_INELIGIBLE';
      end if;
    end if;
    update public.salary_receipts r set transaction_id=transaction_row.id,
      received_at=transaction_row.occurred_at,amount_minor=transaction_row.amount_minor,
      status=case when predecessor_id is null then 'received' else 'corrected' end,
      operation_id=(p_body->>'operationId')::uuid,
      replaces_receipt_id=predecessor_id
    where r.id=receipt.id returning * into receipt;
    event_type=case when receipt.status='corrected' then 'planning.salary_receipt_corrected' else 'planning.salary_receipt_received' end;
  else
    if exists(select 1 from jsonb_object_keys(p_body) key where key not in (
      'operation','profileId','receiptId','expectedVersion','operationId','requestId'
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into receipt from public.salary_receipts r
    where r.id=(p_body->>'receiptId')::uuid and r.salary_profile_id=profile.id and r.user_id=p_user_id for update;
    if receipt.id is null then raise exception using errcode='P0001',message='SALARY_RECEIPT_NOT_FOUND'; end if;
    if receipt.version<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=receipt.version::text;
    end if;
    if receipt.status not in ('received','corrected') then raise exception using errcode='P0001',message='SALARY_RECEIPT_INELIGIBLE'; end if;
    update public.salary_receipts r set status='undone',received_at=null,operation_id=(p_body->>'operationId')::uuid
    where r.id=receipt.id returning * into receipt;
    event_type='planning.salary_receipt_undone';
  end if;

  perform private.enqueue_outbox_event(event_type,'salary-receipt',receipt.id,jsonb_build_object(
    'profileId',profile.id,'receiptId',receipt.id,'userId',p_user_id,'version',receipt.version,
    'status',receipt.status,'cycleDate',receipt.expected_at::date,'ledgerVersion',
    coalesce((select max(b.ledger_version) from public.account_balances b join public.accounts a on a.id=b.account_id where a.user_id=p_user_id),0),
    'occurredAt',clock_timestamp(),'requestId',request_id
  ));
  perform audit.append_event(p_user_id,'user',replace(event_type,'_','-'),'salary_receipt',receipt.id::text,
    null,null,null,request_id,jsonb_build_object('version',receipt.version,'status',receipt.status));
  return jsonb_build_object(
    'id',receipt.id,'salaryProfileId',receipt.salary_profile_id,'transactionId',receipt.transaction_id,
    'expectedAt',receipt.expected_at,'receivedAt',receipt.received_at,'amountMinor',receipt.amount_minor::text,
    'status',receipt.status,'operationId',receipt.operation_id,'replacesReceiptId',receipt.replaces_receipt_id,
    'createdAt',receipt.created_at,'updatedAt',receipt.updated_at,'version',receipt.version
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
  raise exception using errcode='22023',message='VALIDATION_FAILED';
end $$;

reset role;
revoke masarifi_migration from current_user granted by current_user;
