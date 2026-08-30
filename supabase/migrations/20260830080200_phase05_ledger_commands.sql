grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.ledger_safe_text(p_value text,p_min integer,p_max integer)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_value is not null and p_value=btrim(p_value)
    and char_length(p_value) between p_min and p_max and p_value !~ '[[:cntrl:]]'
$$;
alter function private.ledger_safe_text(text,integer,integer) owner to masarifi_migration;
revoke all on function private.ledger_safe_text(text,integer,integer) from public;

create function private.ledger_begin(p_user_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_active_profile(p_user_id);
  if exists(select 1 from public.admin_profiles a where a.user_id=p_user_id) then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  -- ponytail: per-owner serialization; move to per-account locks only if measured
  -- hot-owner contention misses the Phase 05 budget.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id,0));
  perform pg_catalog.set_config('masarifi.ledger_command','on',true);
end $$;
alter function private.ledger_begin(text) owner to masarifi_migration;
revoke all on function private.ledger_begin(text) from public;

create function private.ledger_next_version(p_user_id text) returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce(max(b.ledger_version),0)+1
  from public.accounts a left join public.account_balances b on b.account_id=a.id
  where a.user_id=p_user_id
$$;
alter function private.ledger_next_version(text) owner to masarifi_migration;
revoke all on function private.ledger_next_version(text) from public;

create function private.ledger_touch_balance(p_account_id uuid,p_ledger_version bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.account_balances(account_id,ledger_version)
  values(p_account_id,p_ledger_version)
  on conflict(account_id) do update set ledger_version=excluded.ledger_version,
    reconciled_at=null,updated_at=clock_timestamp();
end $$;
alter function private.ledger_touch_balance(uuid,bigint) owner to masarifi_migration;
revoke all on function private.ledger_touch_balance(uuid,bigint) from public;

create function private.ledger_apply_posting(
  p_transaction_id uuid,p_account_id uuid,p_amount_minor bigint,p_clearing_state text,
  p_posting_role text,p_occurred_at timestamptz,p_ledger_version bigint
) returns uuid language plpgsql security definer set search_path='' as $$
declare posting_id uuid;
begin
  if p_amount_minor is null or p_amount_minor=0
    or p_amount_minor not between -9007199254740991 and 9007199254740991 then
    raise exception using errcode='22003',message='AMOUNT_INVALID';
  end if;
  insert into public.transaction_postings(
    transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at
  ) values (
    p_transaction_id,p_account_id,p_amount_minor,p_clearing_state,p_posting_role,p_occurred_at
  ) returning id into posting_id;
  insert into public.account_balances(
    account_id,confirmed_minor,pending_minor,ledger_version,reconciled_at,updated_at
  ) values (
    p_account_id,
    case when p_clearing_state='confirmed' then p_amount_minor else 0 end,
    case when p_clearing_state='pending' then p_amount_minor else 0 end,
    p_ledger_version,null,clock_timestamp()
  ) on conflict(account_id) do update set
    confirmed_minor=public.account_balances.confirmed_minor+excluded.confirmed_minor,
    pending_minor=public.account_balances.pending_minor+excluded.pending_minor,
    ledger_version=excluded.ledger_version,reconciled_at=null,updated_at=clock_timestamp();
  return posting_id;
end $$;
alter function private.ledger_apply_posting(uuid,uuid,bigint,text,text,timestamptz,bigint) owner to masarifi_migration;
revoke all on function private.ledger_apply_posting(uuid,uuid,bigint,text,text,timestamptz,bigint) from public;

create function private.ledger_snapshot(p_transaction_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'schemaVersion',1,'transactionId',t.id,'kind',t.kind,'status',t.status,
    'amountMinor',t.amount_minor,'feeMinor',t.fee_minor,'currency',btrim(t.currency_code::text),
    'categoryId',t.category_id,'title',t.title,'merchant',t.merchant,
    'paymentMethod',t.payment_method,'note',t.note,'occurredAt',t.occurred_at,
    'version',t.version,'deletedAt',t.deleted_at,'undoExpiresAt',t.undo_expires_at,
    'originalTransactionId',t.reverses_transaction_id,
    'accountIds',coalesce((select jsonb_agg(x.account_id order by x.account_id) from (
      select p.account_id from public.transaction_postings p where p.transaction_id=t.id
      group by p.account_id having sum(p.amount_minor)<>0
    ) x),'[]'::jsonb),
    'effect',coalesce((select jsonb_agg(jsonb_build_object(
      'accountId',x.account_id,'clearingState',x.clearing_state,'amountMinor',x.amount_minor
    ) order by x.account_id,x.clearing_state) from (
      select p.account_id,p.clearing_state,sum(p.amount_minor)::bigint amount_minor
      from public.transaction_postings p where p.transaction_id=t.id
      group by p.account_id,p.clearing_state having sum(p.amount_minor)<>0
    ) x),'[]'::jsonb)
  ) from public.transactions t where t.id=p_transaction_id
$$;
alter function private.ledger_snapshot(uuid) owner to masarifi_migration;
revoke all on function private.ledger_snapshot(uuid) from public;

create function private.ledger_account_ids(p_transaction_id uuid) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare account_ids uuid[];
begin
  select array_agg(x.account_id order by x.account_id) into account_ids from (
    select p.account_id from public.transaction_postings p
    where p.transaction_id=p_transaction_id
    group by p.account_id having sum(p.amount_minor)<>0
  ) x;
  if coalesce(cardinality(account_ids),0)=0 then
    select array_agg(distinct (e->>'accountId')::uuid order by (e->>'accountId')::uuid)
      into account_ids
    from audit.transaction_revisions r
    cross join lateral jsonb_array_elements(r.before_snapshot->'effect') e
    where r.transaction_id=p_transaction_id and r.after_snapshot->>'status'='deleted'
      and r.revision_no=(select max(r2.revision_no) from audit.transaction_revisions r2
        where r2.transaction_id=p_transaction_id and r2.after_snapshot->>'status'='deleted');
  end if;
  return coalesce(account_ids,array[]::uuid[]);
end $$;
alter function private.ledger_account_ids(uuid) owner to masarifi_migration;
revoke all on function private.ledger_account_ids(uuid) from public;

create function private.ledger_record_revision(
  p_transaction_id uuid,p_actor_id text,p_reason text,p_before_snapshot jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.ledger_safe_text(p_reason,1,500) then
    raise exception using errcode='22023',message='REASON_INVALID';
  end if;
  insert into audit.transaction_revisions(
    transaction_id,revision_no,actor_id,reason,before_snapshot,after_snapshot
  ) values (
    p_transaction_id,
    coalesce((select max(r.revision_no) from audit.transaction_revisions r where r.transaction_id=p_transaction_id),0)+1,
    p_actor_id,p_reason,coalesce(p_before_snapshot,'{}'::jsonb),private.ledger_snapshot(p_transaction_id)
  );
end $$;
alter function private.ledger_record_revision(uuid,text,text,jsonb) owner to masarifi_migration;
revoke all on function private.ledger_record_revision(uuid,text,text,jsonb) from public;

create function private.ledger_result(p_transaction_id uuid,p_ledger_version bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('transactionId',t.id,'version',t.version,'ledgerVersion',p_ledger_version)
  from public.transactions t where t.id=p_transaction_id
$$;
alter function private.ledger_result(uuid,bigint) owner to masarifi_migration;
revoke all on function private.ledger_result(uuid,bigint) from public;

create function private.post_transaction(p_user_id text,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  kind_value text:=p_command->>'kind'; amount_value bigint; currency_value text:=p_command->>'currency';
  account_value uuid; category_value uuid; title_value text:=p_command->>'title';
  merchant_value text:=p_command->>'merchant'; payment_value text:=p_command->>'paymentMethod';
  note_value text:=p_command->>'note'; occurred_value timestamptz; source_value text:=coalesce(p_command->>'source','manual');
  external_value text:=p_command->>'externalRef'; account_row public.accounts; transaction_id uuid;
  ledger_version bigint; signed_amount bigint;
begin
  if p_command is null or jsonb_typeof(p_command)<>'object'
    or (p_command-array['kind','amountMinor','currency','accountId','categoryId','title','merchant','paymentMethod','note','occurredAt','source','externalRef']::text[])<>'{}'::jsonb then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  begin
    amount_value:=(p_command->>'amountMinor')::bigint;
    account_value:=(p_command->>'accountId')::uuid;
    occurred_value:=(p_command->>'occurredAt')::timestamptz;
    if p_command ? 'categoryId' and p_command->>'categoryId' is not null then category_value:=(p_command->>'categoryId')::uuid; end if;
  exception when others then raise exception using errcode='22023',message='VALIDATION_FAILED'; end;
  if kind_value not in ('income','expense') or amount_value not between 1 and 9007199254740991
    or currency_value !~ '^[A-Z]{3}$' or not private.ledger_safe_text(title_value,1,160)
    or (merchant_value is not null and not private.ledger_safe_text(merchant_value,1,160))
    or (payment_value is not null and not private.ledger_safe_text(payment_value,1,80))
    or (note_value is not null and not private.ledger_safe_text(note_value,1,500))
    or source_value !~ '^[a-z][a-z0-9_.-]{1,63}$'
    or (external_value is not null and not private.ledger_safe_text(external_value,1,200))
    or occurred_value<'1900-01-01T00:00:00Z'::timestamptz or occurred_value>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.ledger_begin(p_user_id);
  select * into account_row from public.accounts a where a.id=account_value
    and a.user_id=p_user_id and a.status='active' for update;
  if account_row.id is null then raise exception using errcode='P0001',message='ACCOUNT_INVALID'; end if;
  if btrim(account_row.currency_code::text)<>currency_value then raise exception using errcode='P0001',message='CURRENCY_MISMATCH'; end if;
  if not exists(select 1 from public.currencies c where c.code=currency_value and c.enabled) then raise exception using errcode='P0001',message='CURRENCY_INVALID'; end if;
  if category_value is not null then perform private.resolve_category(p_user_id,category_value,kind_value); end if;
  ledger_version:=private.ledger_next_version(p_user_id);
  insert into public.transactions(
    user_id,kind,amount_minor,currency_code,category_id,title,merchant,payment_method,note,
    occurred_at,source,external_ref
  ) values (
    p_user_id,kind_value,amount_value,currency_value,category_value,title_value,merchant_value,
    payment_value,note_value,occurred_value,source_value,external_value
  ) returning id into transaction_id;
  signed_amount:=case when kind_value='income' then amount_value else -amount_value end;
  perform private.ledger_apply_posting(transaction_id,account_value,signed_amount,'confirmed',
    case when kind_value='income' then 'destination' else 'source' end,occurred_value,ledger_version);
  perform private.ledger_record_revision(transaction_id,p_user_id,'transaction created','{}'::jsonb);
  return private.ledger_result(transaction_id,ledger_version);
end $$;
alter function private.post_transaction(text,jsonb) owner to masarifi_migration;
revoke all on function private.post_transaction(text,jsonb) from public;

create function private.transfer_funds(p_user_id text,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  source_id uuid; destination_id uuid; fee_account_id uuid; account_ids uuid[];
  amount_value bigint; fee_value bigint:=coalesce((p_command->>'feeMinor')::bigint,0);
  currency_value text:=p_command->>'currency'; occurred_value timestamptz; title_value text:=p_command->>'title';
  note_value text:=p_command->>'note'; transaction_id uuid; ledger_version bigint; matched integer;
begin
  if p_command is null or jsonb_typeof(p_command)<>'object'
    or (p_command-array['sourceAccountId','destinationAccountId','amountMinor','currency','feeMinor','feeAccountId','occurredAt','title','note']::text[])<>'{}'::jsonb then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  begin
    source_id:=(p_command->>'sourceAccountId')::uuid; destination_id:=(p_command->>'destinationAccountId')::uuid;
    amount_value:=(p_command->>'amountMinor')::bigint; occurred_value:=(p_command->>'occurredAt')::timestamptz;
    fee_account_id:=coalesce((p_command->>'feeAccountId')::uuid,source_id);
  exception when others then raise exception using errcode='22023',message='VALIDATION_FAILED'; end;
  if source_id=destination_id or amount_value not between 1 and 9007199254740991
    or fee_value not between 0 and amount_value or currency_value !~ '^[A-Z]{3}$'
    or not private.ledger_safe_text(title_value,1,160)
    or (note_value is not null and not private.ledger_safe_text(note_value,1,500))
    or occurred_value<'1900-01-01T00:00:00Z'::timestamptz or occurred_value>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='TRANSFER_ACCOUNTS_INVALID';
  end if;
  perform private.ledger_begin(p_user_id);
  select array_agg(distinct id order by id) into account_ids
  from unnest(array[source_id,destination_id,fee_account_id]) as u(id);
  perform a.id from public.accounts a where a.id=any(account_ids) order by a.id for update;
  select count(*) into matched from public.accounts a where a.id=any(account_ids)
    and a.user_id=p_user_id and a.status='active' and btrim(a.currency_code::text)=currency_value;
  if matched<>cardinality(account_ids) then
    if exists(select 1 from public.accounts a where a.id=any(account_ids) and a.user_id=p_user_id and btrim(a.currency_code::text)<>currency_value)
      then raise exception using errcode='P0001',message='CURRENCY_MISMATCH'; end if;
    raise exception using errcode='P0001',message='ACCOUNT_INVALID';
  end if;
  ledger_version:=private.ledger_next_version(p_user_id);
  insert into public.transactions(user_id,kind,amount_minor,fee_minor,currency_code,title,note,occurred_at)
  values(p_user_id,'transfer',amount_value,fee_value,currency_value,title_value,note_value,occurred_value)
  returning id into transaction_id;
  perform private.ledger_apply_posting(transaction_id,source_id,-amount_value,'confirmed','source',occurred_value,ledger_version);
  perform private.ledger_apply_posting(transaction_id,destination_id,amount_value,'confirmed','destination',occurred_value,ledger_version);
  if fee_value>0 then perform private.ledger_apply_posting(transaction_id,fee_account_id,-fee_value,'confirmed','fee',occurred_value,ledger_version); end if;
  perform private.ledger_record_revision(transaction_id,p_user_id,'transfer created','{}'::jsonb);
  return private.ledger_result(transaction_id,ledger_version);
end $$;
alter function private.transfer_funds(text,jsonb) owner to masarifi_migration;
revoke all on function private.transfer_funds(text,jsonb) from public;

create function private.post_opening_transaction(
  p_user_id text,p_account_id uuid,p_amount_minor bigint,p_title text,
  p_occurred_at timestamptz,p_source text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare account_row public.accounts; transaction_id uuid; ledger_version bigint;
begin
  if p_amount_minor is null or p_amount_minor not between -9007199254740991 and 9007199254740991
    or not private.ledger_safe_text(p_title,1,160) or p_source !~ '^[a-z][a-z0-9_.-]{1,63}$'
    or p_occurred_at<'1900-01-01T00:00:00Z'::timestamptz or p_occurred_at>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.ledger_begin(p_user_id);
  select * into account_row from public.accounts a where a.id=p_account_id and a.user_id=p_user_id and a.status='active' for update;
  if account_row.id is null then raise exception using errcode='P0001',message='ACCOUNT_INVALID'; end if;
  if p_amount_minor=0 then
    insert into public.account_balances(account_id) values(p_account_id) on conflict(account_id) do nothing;
    return jsonb_build_object('transactionId',null,'version',null,'ledgerVersion',private.ledger_next_version(p_user_id)-1);
  end if;
  if exists(select 1 from public.transaction_postings p where p.account_id=p_account_id and p.posting_role='opening') then
    raise exception using errcode='P0001',message='OPENING_EXISTS';
  end if;
  ledger_version:=private.ledger_next_version(p_user_id);
  insert into public.transactions(user_id,kind,amount_minor,currency_code,title,occurred_at,source)
  values(p_user_id,'opening',abs(p_amount_minor),account_row.currency_code,p_title,p_occurred_at,p_source)
  returning id into transaction_id;
  perform private.ledger_apply_posting(transaction_id,p_account_id,p_amount_minor,'confirmed','opening',p_occurred_at,ledger_version);
  perform private.ledger_record_revision(transaction_id,p_user_id,'account opening','{}'::jsonb);
  return private.ledger_result(transaction_id,ledger_version);
end $$;
alter function private.post_opening_transaction(text,uuid,bigint,text,timestamptz,text) owner to masarifi_migration;
revoke all on function private.post_opening_transaction(text,uuid,bigint,text,timestamptz,text) from public;

create function private.revise_transaction(
  p_user_id text,p_transaction_id uuid,p_expected_version bigint,p_patch jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  transaction_row public.transactions; before_snapshot jsonb; old_account_id uuid; old_effect bigint;
  new_account_id uuid; new_amount bigint; new_effect bigint; new_category_id uuid;
  new_title text; new_merchant text; new_payment text; new_note text; new_occurred timestamptz;
  ledger_version bigint;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb
    or (p_patch-array['amountMinor','accountId','categoryId','title','merchant','paymentMethod','note','occurredAt']::text[])<>'{}'::jsonb
    or not private.ledger_safe_text(p_reason,1,500) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.ledger_begin(p_user_id);
  select * into transaction_row from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id for update;
  if transaction_row.id is null then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=transaction_row.version::text; end if;
  if transaction_row.kind not in ('income','expense') or transaction_row.status<>'confirmed' then raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE'; end if;
  select p.account_id,sum(p.amount_minor)::bigint into old_account_id,old_effect
  from public.transaction_postings p where p.transaction_id=p_transaction_id and p.clearing_state='confirmed'
  group by p.account_id having sum(p.amount_minor)<>0;
  if old_account_id is null then raise exception using errcode='P0001',message='LEDGER_INVARIANT_FAILED'; end if;
  begin
    new_account_id:=case when p_patch?'accountId' then (p_patch->>'accountId')::uuid else old_account_id end;
    new_amount:=case when p_patch?'amountMinor' then (p_patch->>'amountMinor')::bigint else transaction_row.amount_minor end;
    new_occurred:=case when p_patch?'occurredAt' then (p_patch->>'occurredAt')::timestamptz else transaction_row.occurred_at end;
    new_category_id:=case when p_patch?'categoryId' and p_patch->>'categoryId' is not null then (p_patch->>'categoryId')::uuid when p_patch?'categoryId' then null else transaction_row.category_id end;
  exception when others then raise exception using errcode='22023',message='VALIDATION_FAILED'; end;
  new_title:=case when p_patch?'title' then p_patch->>'title' else transaction_row.title end;
  new_merchant:=case when p_patch?'merchant' then p_patch->>'merchant' else transaction_row.merchant end;
  new_payment:=case when p_patch?'paymentMethod' then p_patch->>'paymentMethod' else transaction_row.payment_method end;
  new_note:=case when p_patch?'note' then p_patch->>'note' else transaction_row.note end;
  if new_amount not between 1 and 9007199254740991 or not private.ledger_safe_text(new_title,1,160)
    or (new_merchant is not null and not private.ledger_safe_text(new_merchant,1,160))
    or (new_payment is not null and not private.ledger_safe_text(new_payment,1,80))
    or (new_note is not null and not private.ledger_safe_text(new_note,1,500))
    or new_occurred<'1900-01-01T00:00:00Z'::timestamptz or new_occurred>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform a.id from public.accounts a where a.id in (old_account_id,new_account_id) order by a.id for update;
  if not exists(select 1 from public.accounts a where a.id=new_account_id and a.user_id=p_user_id and a.status='active' and a.currency_code=transaction_row.currency_code) then
    raise exception using errcode='P0001',message='ACCOUNT_INVALID';
  end if;
  if new_category_id is not null then perform private.resolve_category(p_user_id,new_category_id,transaction_row.kind); end if;
  before_snapshot:=private.ledger_snapshot(p_transaction_id);
  ledger_version:=private.ledger_next_version(p_user_id);
  new_effect:=case when transaction_row.kind='income' then new_amount else -new_amount end;
  if new_account_id=old_account_id then
    if new_effect<>old_effect then perform private.ledger_apply_posting(p_transaction_id,old_account_id,new_effect-old_effect,'confirmed','adjustment',new_occurred,ledger_version);
    else perform private.ledger_touch_balance(old_account_id,ledger_version); end if;
  else
    perform private.ledger_apply_posting(p_transaction_id,old_account_id,-old_effect,'confirmed','adjustment',new_occurred,ledger_version);
    perform private.ledger_apply_posting(p_transaction_id,new_account_id,new_effect,'confirmed','adjustment',new_occurred,ledger_version);
  end if;
  update public.transactions set amount_minor=new_amount,category_id=new_category_id,title=new_title,
    merchant=new_merchant,payment_method=new_payment,note=new_note,occurred_at=new_occurred
  where id=p_transaction_id;
  perform private.ledger_record_revision(p_transaction_id,p_user_id,p_reason,before_snapshot);
  return private.ledger_result(p_transaction_id,ledger_version);
end $$;
alter function private.revise_transaction(text,uuid,bigint,jsonb,text) owner to masarifi_migration;
revoke all on function private.revise_transaction(text,uuid,bigint,jsonb,text) from public;

create function private.refund_transaction(
  p_user_id text,p_original_id uuid,p_expected_version bigint,p_amount_minor bigint,
  p_account_id uuid,p_occurred_at timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.transactions; original_account uuid; target_account uuid; refunded bigint;
  transaction_id uuid; ledger_version bigint; before_original jsonb;
begin
  if p_amount_minor not between 1 and 9007199254740991 or not private.ledger_safe_text(p_reason,1,500)
    or p_occurred_at<'1900-01-01T00:00:00Z'::timestamptz or p_occurred_at>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.ledger_begin(p_user_id);
  select * into original from public.transactions t where t.id=p_original_id and t.user_id=p_user_id for update;
  if original.id is null then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;
  if original.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=original.version::text; end if;
  if original.kind<>'expense' or original.status<>'confirmed' then raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE'; end if;
  select p.account_id into original_account from public.transaction_postings p where p.transaction_id=p_original_id
  group by p.account_id having sum(p.amount_minor)<0;
  target_account:=coalesce(p_account_id,original_account);
  perform a.id from public.accounts a where a.id in (original_account,target_account) order by a.id for update;
  if not exists(select 1 from public.accounts a where a.id=target_account and a.user_id=p_user_id and a.status='active' and a.currency_code=original.currency_code) then
    raise exception using errcode='P0001',message='ACCOUNT_INVALID';
  end if;
  select coalesce(sum(t.amount_minor),0) into refunded from public.transactions t
  where t.reverses_transaction_id=p_original_id and t.kind='refund' and t.status='confirmed';
  if refunded+p_amount_minor>original.amount_minor then raise exception using errcode='P0001',message='REFUND_EXCEEDS_AVAILABLE'; end if;
  before_original:=private.ledger_snapshot(p_original_id);
  ledger_version:=private.ledger_next_version(p_user_id);
  insert into public.transactions(user_id,kind,amount_minor,currency_code,title,occurred_at,reverses_transaction_id)
  values(p_user_id,'refund',p_amount_minor,original.currency_code,left('Refund - '||original.title,160),p_occurred_at,p_original_id)
  returning id into transaction_id;
  perform private.ledger_apply_posting(transaction_id,target_account,p_amount_minor,'confirmed','refund',p_occurred_at,ledger_version);
  perform private.ledger_record_revision(transaction_id,p_user_id,p_reason,'{}'::jsonb);
  update public.transactions set updated_at=updated_at where id=p_original_id;
  perform private.ledger_record_revision(p_original_id,p_user_id,p_reason,before_original);
  return private.ledger_result(transaction_id,ledger_version);
end $$;
alter function private.refund_transaction(text,uuid,bigint,bigint,uuid,timestamptz,text) owner to masarifi_migration;
revoke all on function private.refund_transaction(text,uuid,bigint,bigint,uuid,timestamptz,text) from public;

create function private.reverse_transaction(
  p_user_id text,p_original_id uuid,p_expected_version bigint,p_occurred_at timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.transactions; transaction_id uuid; ledger_version bigint; before_original jsonb; effect record;
begin
  if not private.ledger_safe_text(p_reason,1,500)
    or p_occurred_at<'1900-01-01T00:00:00Z'::timestamptz or p_occurred_at>clock_timestamp()+interval '5 minutes' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.ledger_begin(p_user_id);
  select * into original from public.transactions t where t.id=p_original_id and t.user_id=p_user_id for update;
  if original.id is null then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;
  if original.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=original.version::text; end if;
  if original.status='reversed' or exists(select 1 from public.transactions d
    where d.reverses_transaction_id=p_original_id and d.kind='reversal' and d.status='confirmed') then
    raise exception using errcode='P0001',message='REVERSAL_EXISTS';
  end if;
  if exists(select 1 from public.transactions d where d.reverses_transaction_id=p_original_id
    and d.kind='refund' and d.status='confirmed') then
    raise exception using errcode='P0001',message='TRANSACTION_HAS_DEPENDENTS';
  end if;
  if original.status<>'confirmed' or original.kind='reversal' then
    raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE';
  end if;
  perform a.id from public.accounts a where a.id in (
    select p.account_id from public.transaction_postings p where p.transaction_id=p_original_id
  ) order by a.id for update;
  before_original:=private.ledger_snapshot(p_original_id);
  ledger_version:=private.ledger_next_version(p_user_id);
  insert into public.transactions(user_id,kind,amount_minor,fee_minor,currency_code,title,occurred_at,reverses_transaction_id)
  values(p_user_id,'reversal',original.amount_minor,original.fee_minor,original.currency_code,
    left('Reversal - '||original.title,160),p_occurred_at,p_original_id) returning id into transaction_id;
  for effect in select p.account_id,p.clearing_state,sum(p.amount_minor)::bigint amount_minor
    from public.transaction_postings p where p.transaction_id=p_original_id
    group by p.account_id,p.clearing_state having sum(p.amount_minor)<>0 order by p.account_id,p.clearing_state loop
    perform private.ledger_apply_posting(transaction_id,effect.account_id,-effect.amount_minor,
      effect.clearing_state,'reversal',p_occurred_at,ledger_version);
  end loop;
  update public.transactions set status='reversed' where id=p_original_id;
  perform private.ledger_record_revision(p_original_id,p_user_id,p_reason,before_original);
  perform private.ledger_record_revision(transaction_id,p_user_id,p_reason,'{}'::jsonb);
  return private.ledger_result(transaction_id,ledger_version);
end $$;
alter function private.reverse_transaction(text,uuid,bigint,timestamptz,text) owner to masarifi_migration;
revoke all on function private.reverse_transaction(text,uuid,bigint,timestamptz,text) from public;

create function private.soft_delete_transaction(
  p_user_id text,p_transaction_id uuid,p_expected_version bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare transaction_row public.transactions; before_snapshot jsonb; effect record; ledger_version bigint; deleted_at_value timestamptz:=clock_timestamp();
begin
  if not private.ledger_safe_text(p_reason,1,500) then raise exception using errcode='22023',message='REASON_INVALID'; end if;
  perform private.ledger_begin(p_user_id);
  select * into transaction_row from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id for update;
  if transaction_row.id is null then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=transaction_row.version::text; end if;
  if exists(select 1 from public.transactions d where d.reverses_transaction_id=p_transaction_id and d.status='confirmed') then
    raise exception using errcode='P0001',message='TRANSACTION_HAS_DEPENDENTS';
  end if;
  if transaction_row.reverses_transaction_id is not null
    or transaction_row.kind in ('refund','reversal') then
    raise exception using errcode='P0001',message='TRANSACTION_HAS_DEPENDENTS';
  end if;
  if transaction_row.status<>'confirmed' then raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE'; end if;
  before_snapshot:=private.ledger_snapshot(p_transaction_id);
  ledger_version:=private.ledger_next_version(p_user_id);
  for effect in select p.account_id,p.clearing_state,sum(p.amount_minor)::bigint amount_minor
    from public.transaction_postings p where p.transaction_id=p_transaction_id
    group by p.account_id,p.clearing_state having sum(p.amount_minor)<>0 order by p.account_id,p.clearing_state loop
    perform private.ledger_apply_posting(p_transaction_id,effect.account_id,-effect.amount_minor,
      effect.clearing_state,'adjustment',deleted_at_value,ledger_version);
  end loop;
  update public.transactions set status='deleted',deleted_at=deleted_at_value,
    undo_expires_at=deleted_at_value+interval '30 seconds' where id=p_transaction_id;
  perform private.ledger_record_revision(p_transaction_id,p_user_id,p_reason,before_snapshot);
  return private.ledger_result(p_transaction_id,ledger_version);
end $$;
alter function private.soft_delete_transaction(text,uuid,bigint,text) owner to masarifi_migration;
revoke all on function private.soft_delete_transaction(text,uuid,bigint,text) from public;

create function private.restore_transaction(
  p_user_id text,p_transaction_id uuid,p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare transaction_row public.transactions; before_snapshot jsonb; restore_effect jsonb; item jsonb; ledger_version bigint;
begin
  perform private.ledger_begin(p_user_id);
  select * into transaction_row from public.transactions t where t.id=p_transaction_id and t.user_id=p_user_id for update;
  if transaction_row.id is null then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.version<>p_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT',detail=transaction_row.version::text; end if;
  if transaction_row.status<>'deleted' then raise exception using errcode='P0001',message='TRANSACTION_INELIGIBLE'; end if;
  if transaction_row.undo_expires_at<clock_timestamp() then raise exception using errcode='P0001',message='UNDO_EXPIRED'; end if;
  select r.before_snapshot->'effect' into restore_effect from audit.transaction_revisions r
  where r.transaction_id=p_transaction_id and r.after_snapshot->>'status'='deleted'
  order by r.revision_no desc limit 1;
  if restore_effect is null or jsonb_typeof(restore_effect)<>'array' or jsonb_array_length(restore_effect)=0 then
    raise exception using errcode='P0001',message='LEDGER_INVARIANT_FAILED';
  end if;
  perform a.id from public.accounts a where a.id in (
    select (e->>'accountId')::uuid from jsonb_array_elements(restore_effect) e
  ) order by a.id for update;
  before_snapshot:=private.ledger_snapshot(p_transaction_id);
  ledger_version:=private.ledger_next_version(p_user_id);
  for item in select value from jsonb_array_elements(restore_effect) loop
    perform private.ledger_apply_posting(p_transaction_id,(item->>'accountId')::uuid,
      (item->>'amountMinor')::bigint,item->>'clearingState','adjustment',clock_timestamp(),ledger_version);
  end loop;
  update public.transactions set status='confirmed',deleted_at=null,undo_expires_at=null where id=p_transaction_id;
  perform private.ledger_record_revision(p_transaction_id,p_user_id,'transaction restored',before_snapshot);
  return private.ledger_result(p_transaction_id,ledger_version);
end $$;
alter function private.restore_transaction(text,uuid,bigint) owner to masarifi_migration;
revoke all on function private.restore_transaction(text,uuid,bigint) from public;

create function private.reconcile_account_balance(p_after_account_id uuid,p_limit integer)
returns table(
  account_id uuid,ledger_version bigint,matches boolean,confirmed_minor bigint,pending_minor bigint,
  derived_confirmed_minor bigint,derived_pending_minor bigint,projection_age_seconds bigint
) language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode='22023',message='RECONCILIATION_REQUEST_INVALID';
  end if;
  perform pg_catalog.set_config('masarifi.ledger_command','on',true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger-reconciliation',0));
  perform a.id
  from public.accounts a join public.account_balances b on b.account_id=a.id
  where p_after_account_id is null or a.id>p_after_account_id
  order by a.id limit p_limit for update of a;
  return query
  with candidates as (
    select b.account_id,b.confirmed_minor,b.pending_minor,b.ledger_version,
      greatest(0,floor(extract(epoch from clock_timestamp()-b.updated_at)))::bigint projection_age_seconds
    from public.account_balances b
    where p_after_account_id is null or b.account_id>p_after_account_id
    order by b.account_id limit p_limit
  ), derived as (
    select c.account_id,c.confirmed_minor,c.pending_minor,c.ledger_version,c.projection_age_seconds,
      coalesce(sum(p.amount_minor) filter(where p.clearing_state='confirmed'),0)::bigint derived_confirmed,
      coalesce(sum(p.amount_minor) filter(where p.clearing_state='pending'),0)::bigint derived_pending
    from candidates c left join public.transaction_postings p on p.account_id=c.account_id
    group by c.account_id,c.confirmed_minor,c.pending_minor,c.ledger_version,c.projection_age_seconds
  ), marked as (
    update public.account_balances b set reconciled_at=clock_timestamp(),updated_at=clock_timestamp()
    from derived d where b.account_id=d.account_id
      and d.confirmed_minor=d.derived_confirmed and d.pending_minor=d.derived_pending
    returning b.account_id
  )
  select d.account_id,d.ledger_version,
    d.confirmed_minor=d.derived_confirmed and d.pending_minor=d.derived_pending,
    d.confirmed_minor,d.pending_minor,d.derived_confirmed,d.derived_pending,d.projection_age_seconds
  from derived d left join marked m on m.account_id=d.account_id order by d.account_id;
end $$;
alter function private.reconcile_account_balance(uuid,integer) owner to masarifi_migration;
revoke all on function private.reconcile_account_balance(uuid,integer) from public;

reset role;
revoke masarifi_migration from current_user granted by current_user;
