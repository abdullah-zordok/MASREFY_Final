grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

-- A bootstrap preference of SAR is not proof that the customer selected SAR.
alter table public.user_preferences add column currency_selected boolean not null default false;
grant update(currency_selected) on public.user_preferences to masarifi_api;

-- Admin membership excludes financial writes even when its row is hidden by API RLS.
-- This predicate accepts no owner argument and exposes no admin profile data.
create function private.current_owner_financial_accounts_allowed()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  owner_id text := public.current_clerk_user_id();
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
  if nullif(btrim(owner_id),'') is null
    or claims->>'role' is distinct from 'authenticated'
    or nullif(btrim(claims->>'sid'),'') is null then
    raise exception using errcode='28000',message='AUTH_TOKEN_INVALID';
  end if;
  perform private.assert_active_profile(owner_id);
  return not exists(select 1 from public.admin_profiles where user_id=owner_id);
end $$;
alter function private.current_owner_financial_accounts_allowed() owner to masarifi_migration;
revoke all on function private.current_owner_financial_accounts_allowed() from public,anon,authenticated,masarifi_worker;
grant execute on function private.current_owner_financial_accounts_allowed() to masarifi_api;

create function private.ensure_default_cash_account(p_user_id text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  selected_currency char(3);
  selected_locale text;
  active_ids uuid[];
  account_id uuid;
  account_version bigint;
begin
  if p_user_id is distinct from public.current_clerk_user_id()
    or claims->>'role' is distinct from 'authenticated'
    or nullif(btrim(claims->>'sid'),'') is null then
    raise exception using errcode='28000',message='AUTH_TOKEN_INVALID';
  end if;
  perform private.assert_active_profile(p_user_id);
  if not private.current_owner_financial_accounts_allowed() then
    return 'financial_access_denied';
  end if;
  -- Shared with normal account creation and default changes. No financial postings.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-default:'||p_user_id,0));
  if exists(select 1 from public.accounts a join public.currencies c on c.code=a.currency_code and c.enabled
      where a.user_id=p_user_id and a.is_default and a.status='active' and a.deleted_at is null) then
    return 'ready';
  end if;
  select array_agg(a.id order by a.id) into active_ids from public.accounts a
    join public.currencies c on c.code=a.currency_code and c.enabled
    where a.user_id=p_user_id and a.status='active' and a.deleted_at is null;
  if cardinality(active_ids)=1 then
    -- Preserve any existing default, even when its currency is currently disabled.
    if exists(select 1 from public.accounts where user_id=p_user_id and is_default) then
      return 'account_selection_required';
    end if;
    -- Recheck after any row-lock wait: archive/close may have committed since the candidate read.
    update public.accounts a set is_default=true
      where a.id=active_ids[1] and a.user_id=p_user_id
        and a.status='active' and a.deleted_at is null
        and exists(select 1 from public.currencies c where c.code=a.currency_code and c.enabled)
      returning a.id,a.version into account_id,account_version;
    if not found then return 'account_selection_required'; end if;
    perform private.enqueue_outbox_event('account.updated','account',account_id,jsonb_build_object(
      'accountId',account_id,'userId',p_user_id,'version',account_version,'occurredAt',clock_timestamp()));
    return 'ready';
  end if;
  if exists(select 1 from public.accounts where user_id=p_user_id) then
    return 'account_selection_required';
  end if;
  select p.default_currency,profile.locale into selected_currency,selected_locale
    from public.user_preferences p join public.profiles profile on profile.id=p.user_id
    join public.currencies c on c.code=p.default_currency and c.enabled
    where p.user_id=p_user_id and p.currency_selected;
  if selected_currency is null then return 'currency_selection_required'; end if;
  insert into public.accounts(user_id,name,type,currency_code,status,is_default)
    values(p_user_id,case when selected_locale='ar' then 'النقدية' else 'Cash' end,'cash',selected_currency,'active',true)
    returning id,version into account_id,account_version;
  perform private.enqueue_outbox_event('account.created','account',account_id,jsonb_build_object(
    'accountId',account_id,'userId',p_user_id,'version',account_version,'occurredAt',clock_timestamp()));
  -- The existing balance view coalesces an account without postings to zero.
  -- The ledger creates its balance row on the first real financial command.
  return 'ready';
end $$;
alter function private.ensure_default_cash_account(text) owner to masarifi_migration;
revoke all on function private.ensure_default_cash_account(text) from public,anon,authenticated,masarifi_worker;
grant execute on function private.ensure_default_cash_account(text) to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
