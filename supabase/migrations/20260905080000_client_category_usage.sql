grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.get_category_usage(p_user_id text,p_category_id uuid)
returns table(linked_transaction_count bigint,version bigint,active boolean,merged boolean)
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.current_clerk_user_id() is distinct from p_user_id then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  perform private.ledger_begin(p_user_id);
  return query
  select
    (select count(*) from public.transactions t
      where t.user_id=p_user_id and t.category_id=c.id),
    c.version,c.active,c.merged_into_id is not null
  from public.categories c
  where c.id=p_category_id and c.user_id=p_user_id
  for update of c;
  if not found then
    raise exception using errcode='P0002',message='NOT_FOUND';
  end if;
end $$;

alter function private.get_category_usage(text,uuid) owner to masarifi_migration;
revoke all on function private.get_category_usage(text,uuid)
  from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.get_category_usage(text,uuid) to masarifi_api;

create function private.reassign_category_transactions(
  p_user_id text,
  p_source_id uuid,
  p_target_id uuid,
  p_request_id text
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  source_kind text;
  target_kind text;
  item record;
  account_id uuid;
  account_ids uuid[];
  affected_account_ids uuid[] := array[]::uuid[];
  before_snapshot jsonb;
  after_version bigint;
  ledger_version bigint;
  changed integer := 0;
begin
  if public.current_clerk_user_id() is distinct from p_user_id then
    raise exception using errcode='42501',message='FINANCIAL_ACCESS_DENIED';
  end if;
  perform private.ledger_begin(p_user_id);
  select c.kind into source_kind from public.categories c
  where c.id=p_source_id and c.user_id=p_user_id and c.merged_into_id is null
  for update;
  select c.kind into target_kind from public.categories c
  where c.id=p_target_id and c.user_id=p_user_id and c.active and c.merged_into_id is null
  for update;
  if source_kind is null or target_kind is null or p_source_id=p_target_id
    or source_kind<>target_kind then
    raise exception using errcode='P0001',message='CATEGORY_INVALID';
  end if;

  ledger_version:=private.ledger_next_version(p_user_id);
  for item in
    select t.id,t.version from public.transactions t
    where t.user_id=p_user_id and t.category_id=p_source_id
    order by t.id for update
  loop
    before_snapshot:=private.ledger_snapshot(item.id);
    account_ids:=private.ledger_account_ids(item.id);
    affected_account_ids:=affected_account_ids||account_ids;
    update public.transactions set category_id=p_target_id where id=item.id
    returning version into after_version;
    perform private.ledger_record_revision(
      item.id,p_user_id,'category merged',before_snapshot
    );
    perform audit.append_event(
      p_user_id,'user','transaction.revised','transaction',item.id::text,
      'sha256:'||encode(extensions.digest(before_snapshot::text,'sha256'),'hex'),
      'sha256:'||encode(extensions.digest(private.ledger_snapshot(item.id)::text,'sha256'),'hex'),
      null,p_request_id,
      jsonb_build_object('operation','mergeCategory','version',after_version,'ledgerVersion',ledger_version)
    );
    perform private.enqueue_outbox_event(
      'transaction.revised','transaction',item.id,
      jsonb_build_object(
        'transactionId',item.id,'oldVersion',item.version,'version',after_version,
        'accountIds',to_jsonb(account_ids),'ledgerVersion',ledger_version,
        'requestId',p_request_id
      )
    );
    changed:=changed+1;
  end loop;

  for account_id in
    select distinct x from unnest(affected_account_ids) x order by x
  loop
    perform private.ledger_touch_balance(account_id,ledger_version);
  end loop;
  return changed;
end $$;

alter function private.reassign_category_transactions(text,uuid,uuid,text)
  owner to masarifi_migration;
revoke all on function private.reassign_category_transactions(text,uuid,uuid,text)
  from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.reassign_category_transactions(text,uuid,uuid,text)
  to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
