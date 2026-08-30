grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

alter table private.idempotency_keys enable row level security;
alter table private.idempotency_keys force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.transaction_postings enable row level security;
alter table public.transaction_postings force row level security;
alter table audit.transaction_revisions enable row level security;
alter table audit.transaction_revisions force row level security;
alter table public.account_balances enable row level security;
alter table public.account_balances force row level security;

revoke all on private.idempotency_keys,public.transactions,public.transaction_postings,
  audit.transaction_revisions,public.account_balances
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
revoke all on public.v_account_balance_summary
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

grant select on public.transactions,public.transaction_postings,public.account_balances to masarifi_api;
grant select on public.v_account_balance_summary to masarifi_api;
grant select(id,transaction_id,revision_no,actor_id,reason,created_at)
  on audit.transaction_revisions to masarifi_api;

create policy idempotency_keys_migration_all on private.idempotency_keys
for all to masarifi_migration using(true) with check(true);
create policy transactions_migration_all on public.transactions
for all to masarifi_migration using(true) with check(true);
create policy transaction_postings_migration_all on public.transaction_postings
for all to masarifi_migration using(true) with check(true);
create policy transaction_revisions_migration_all on audit.transaction_revisions
for all to masarifi_migration using(true) with check(true);
create policy account_balances_migration_all on public.account_balances
for all to masarifi_migration using(true) with check(true);

create function private.ledger_actor_is_admin(p_user_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_profiles a where a.user_id=p_user_id)
$$;
alter function private.ledger_actor_is_admin(text) owner to masarifi_migration;
revoke all on function private.ledger_actor_is_admin(text) from public;
grant execute on function private.ledger_actor_is_admin(text),private.ledger_account_ids(uuid)
to masarifi_api;

create policy transactions_api_owner_select on public.transactions for select to masarifi_api
using(
  transactions.user_id=public.current_clerk_user_id()
  and exists(select 1 from public.profiles p where p.id=transactions.user_id and p.status='active')
  and not private.ledger_actor_is_admin(public.current_clerk_user_id())
);
create policy transaction_postings_api_owner_select on public.transaction_postings for select to masarifi_api
using(exists(
  select 1 from public.transactions t where t.id=transaction_postings.transaction_id
    and t.user_id=public.current_clerk_user_id()
));
create policy transaction_revisions_api_owner_select on audit.transaction_revisions for select to masarifi_api
using(exists(
  select 1 from public.transactions t where t.id=transaction_revisions.transaction_id
    and t.user_id=public.current_clerk_user_id()
));
create policy account_balances_api_owner_select on public.account_balances for select to masarifi_api
using(exists(
  select 1 from public.accounts a where a.id=account_balances.account_id
    and a.user_id=public.current_clerk_user_id()
    and exists(select 1 from public.profiles p where p.id=a.user_id and p.status='active')
    and not private.ledger_actor_is_admin(public.current_clerk_user_id())
));

revoke all on function
  private.claim_idempotency_key(text,text,text,text,interval),
  private.lookup_idempotency_key(text,text,text,text),
  private.complete_idempotency_key(text,text,text,text,integer,jsonb,text),
  private.post_transaction(text,jsonb),private.transfer_funds(text,jsonb),
  private.post_opening_transaction(text,uuid,bigint,text,timestamptz,text),
  private.revise_transaction(text,uuid,bigint,jsonb,text),
  private.refund_transaction(text,uuid,bigint,bigint,uuid,timestamptz,text),
  private.reverse_transaction(text,uuid,bigint,timestamptz,text),
  private.soft_delete_transaction(text,uuid,bigint,text),
  private.restore_transaction(text,uuid,bigint),
  private.reconcile_account_balance(uuid,integer)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

grant execute on function
  private.claim_idempotency_key(text,text,text,text,interval),
  private.lookup_idempotency_key(text,text,text,text),
  private.complete_idempotency_key(text,text,text,text,integer,jsonb,text),
  private.post_transaction(text,jsonb),private.transfer_funds(text,jsonb),
  private.post_opening_transaction(text,uuid,bigint,text,timestamptz,text),
  private.revise_transaction(text,uuid,bigint,jsonb,text),
  private.refund_transaction(text,uuid,bigint,bigint,uuid,timestamptz,text),
  private.reverse_transaction(text,uuid,bigint,timestamptz,text),
  private.soft_delete_transaction(text,uuid,bigint,text),
  private.restore_transaction(text,uuid,bigint)
to masarifi_api;
grant execute on function private.reconcile_account_balance(uuid,integer) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
