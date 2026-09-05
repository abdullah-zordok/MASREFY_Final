grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

alter table public.accounts
  add column automatic_tracking_enabled boolean not null default true;

grant insert(automatic_tracking_enabled),update(automatic_tracking_enabled)
  on public.accounts to masarifi_api;

create function private.assert_automatic_tracking_account(
  p_user_id text,
  p_account_id text
) returns void
language plpgsql security definer set search_path='' as $$
declare
  account_id uuid;
  account_row public.accounts;
  global_enabled boolean;
begin
  begin
    account_id:=p_account_id::uuid;
  exception when others then
    raise exception using errcode='P0001',message='TRACKING_ACCOUNT_BLOCKED';
  end;

  select * into account_row
  from public.accounts a
  where a.id=account_id and a.user_id=p_user_id
  for share;

  select p.enabled into global_enabled
  from public.tracking_preferences p
  where p.user_id=p_user_id
  for share;

  if account_row.id is null
    or account_row.status<>'active'
    or account_row.type not in ('bank','debit_card','credit_card','wallet','savings')
    or not account_row.automatic_tracking_enabled
    or not coalesce(global_enabled,false) then
    raise exception using errcode='P0001',message='TRACKING_ACCOUNT_BLOCKED';
  end if;
end $$;
alter function private.assert_automatic_tracking_account(text,text)
  owner to masarifi_migration;
revoke all on function private.assert_automatic_tracking_account(text,text)
  from public,masarifi_api,masarifi_worker;

create or replace function private.defer_import_item(
  p_item_id uuid,
  p_fence_token uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.import_items; s public.import_sessions;
begin
  select x.* into i
  from public.import_items x
  join public.import_sessions y on y.id=x.session_id
  where x.id=p_item_id
    and x.status='parsed'
    and y.claim_token=p_fence_token
    and y.lease_until>clock_timestamp()
  for update of x;
  if i.id is null then
    raise exception using errcode='40001',message='IMPORT_LEASE_STALE';
  end if;
  select * into s from public.import_sessions where id=i.session_id;
  if p_reason='account_tracking_blocked' then
    update public.import_items set status='rejected' where id=i.id returning * into i;
    insert into public.tracking_history(
      user_id,source_type,source_ref,outcome,parser_version_id,applied_rule_ids,reason_codes
    ) values(
      i.user_id,s.source_type,i.id::text,'rejected',i.parser_version_id,
      i.applied_rule_ids,array[p_reason]
    );
    return to_jsonb(i)-'user_id'-'source_hash'-'normalized_hash'-'normalized_payload';
  end if;
  return private.create_review_item(i.id,p_reason,i.normalized_payload);
end $$;

create or replace function private.prepare_import_session(
  p_session_id uuid,
  p_fence_token uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; i public.import_items; version_id uuid; definition jsonb; parser_items jsonb:='[]';
begin
  select * into s from public.import_sessions
  where id=p_session_id and claim_token=p_fence_token and lease_until>clock_timestamp()
  for update;
  if s.id is null then
    raise exception using errcode='40001',message='IMPORT_LEASE_STALE';
  end if;
  for i in
    select * from public.import_items
    where session_id=s.id and status='parsed'
    order by id for update
  loop
    begin
      perform private.assert_automatic_tracking_account(
        s.user_id,i.normalized_payload->>'accountId'
      );
    exception when sqlstate 'P0001' then
      perform private.defer_import_item(i.id,p_fence_token,'account_tracking_blocked');
      continue;
    end;
    select r.active_version_id,v.definition into version_id,definition
    from public.parser_rules r
    join public.parser_rule_versions v on v.id=r.active_version_id
    join public.institution_senders d on d.institution_id=r.institution_id
    where r.status='active' and r.source_type=s.source_type and d.active
      and lower(d.sender_pattern)=lower(i.normalized_payload->>'sender')
    order by d.priority,r.id limit 1;
    update public.import_items set parser_version_id=version_id where id=i.id;
    parser_items:=parser_items||jsonb_build_array(jsonb_build_object(
      'id',i.id,'userId',i.user_id,'parserVersionId',version_id,'definition',definition,
      'input',jsonb_build_object(
        'sender',coalesce(i.normalized_payload->>'sender',''),
        'body',coalesce(i.normalized_payload->>'body',''),
        'language',coalesce(i.normalized_payload->>'language',''),
        'source',s.source_type
      )
    ));
  end loop;
  return jsonb_build_object('sessionId',s.id,'parserItems',parser_items);
end $$;

create or replace function private.finalize_import_session(
  p_session_id uuid,
  p_fence_token uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; i public.import_items; prefs public.tracking_preferences; proposal jsonb; auto_items jsonb:='[]'; duplicates integer;
begin
  select * into s from public.import_sessions
  where id=p_session_id and claim_token=p_fence_token and lease_until>clock_timestamp()
  for update;
  if s.id is null then
    raise exception using errcode='40001',message='IMPORT_LEASE_STALE';
  end if;
  select * into prefs from public.tracking_preferences where user_id=s.user_id;
  for i in
    select * from public.import_items
    where session_id=s.id and status='parsed'
    order by id for update
  loop
    begin
      perform private.assert_automatic_tracking_account(
        s.user_id,i.normalized_payload->>'accountId'
      );
    exception when sqlstate 'P0001' then
      perform private.defer_import_item(i.id,p_fence_token,'account_tracking_blocked');
      continue;
    end;
    update public.import_items x set
      merchant=coalesce(x.merchant,(
        select m.normalized_merchant from public.merchant_rules m
        where m.active and (m.user_id is null or m.user_id=s.user_id)
          and strpos(lower(coalesce(x.merchant,x.normalized_payload->>'body','')),lower(m.pattern))>0
        order by m.user_id nulls last,m.priority,m.id limit 1
      )),
      normalized_payload=coalesce((
        select jsonb_build_object('categoryId',c.category_id)
        from public.category_rules c
        where c.active and (c.user_id is null or c.user_id=s.user_id)
          and strpos(lower(coalesce(x.merchant,x.normalized_payload->>'body','')),lower(c.pattern))>0
        order by c.user_id nulls last,c.priority,c.id limit 1
      ),'{}'::jsonb)||x.normalized_payload,
      confidence_basis_points=case
        when x.amount_minor is not null and x.currency_code is not null
          and x.occurred_at is not null and x.normalized_payload ? 'accountId'
        then 9000 else 6000 end
    where x.id=i.id returning * into i;
    perform private.compute_duplicate_candidates(i.id);
    select count(*) into duplicates from public.duplicate_candidates d
    where d.left_item_id=i.id and d.status='proposed';
    proposal:=i.normalized_payload||jsonb_strip_nulls(jsonb_build_object(
      'amountMinor',i.amount_minor,'currency',btrim(i.currency_code::text),
      'merchant',i.merchant,'occurredAt',i.occurred_at
    ));
    if coalesce(prefs.review_required,true)
      or i.confidence_basis_points<8000
      or duplicates>0
      or coalesce(i.normalized_payload->>'kind','') not in ('income','expense') then
      perform private.create_review_item(
        i.id,
        case when duplicates>0 then 'duplicate_candidate'
          when i.confidence_basis_points<8000 then 'low_confidence'
          else 'review_required' end,
        proposal
      );
    else
      auto_items:=auto_items||jsonb_build_array(jsonb_build_object(
        'id',i.id,'userId',i.user_id,'values',proposal
      ));
    end if;
  end loop;
  return jsonb_build_object('sessionId',s.id,'autoItems',auto_items);
end $$;

create function private.guard_tracking_import_posting() returns trigger
language plpgsql security definer set search_path='' as $$
declare transaction_row public.transactions;
begin
  select * into transaction_row
  from public.transactions t
  where t.id=new.transaction_id;
  if transaction_row.source='tracking-import'
    and not exists(
      select 1 from public.transaction_postings p
      where p.transaction_id=new.transaction_id
    ) then
    perform private.assert_automatic_tracking_account(
      transaction_row.user_id,new.account_id::text
    );
  end if;
  return new;
end $$;
alter function private.guard_tracking_import_posting() owner to masarifi_migration;
revoke all on function private.guard_tracking_import_posting() from public;
create trigger transaction_postings_tracking_account_gate
before insert on public.transaction_postings
for each row execute function private.guard_tracking_import_posting();

create function private.attach_account_tracking_sync_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare tracking_enabled boolean;
begin
  if new.aggregate_type='account'
    and new.payload#>>'{sync,domain}'='accounts'
    and new.payload#>>'{sync,operation}'='upsert' then
    select a.automatic_tracking_enabled into tracking_enabled
    from public.accounts a where a.id=new.aggregate_id;
    new.payload:=jsonb_set(
      new.payload,
      '{sync,snapshot,automatic_tracking_enabled}',
      to_jsonb(tracking_enabled),
      true
    );
  end if;
  return new;
end $$;
alter function private.attach_account_tracking_sync_snapshot() owner to masarifi_migration;
revoke all on function private.attach_account_tracking_sync_snapshot() from public;
create trigger outbox_events_sync_snapshot_account_tracking
before insert on private.outbox_events
for each row execute function private.attach_account_tracking_sync_snapshot();

reset role;
revoke masarifi_migration from current_user granted by current_user;
