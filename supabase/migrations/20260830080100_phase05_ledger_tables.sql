grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create table public.transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  kind text not null,
  status text not null default 'confirmed',
  amount_minor bigint not null,
  fee_minor bigint not null default 0,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  category_id uuid references public.categories(id) on update restrict on delete restrict,
  title text not null,
  merchant text,
  payment_method text,
  note text,
  occurred_at timestamptz not null,
  source text not null default 'manual',
  external_ref text,
  reverses_transaction_id uuid references public.transactions(id) on update restrict on delete restrict,
  deleted_at timestamptz,
  undo_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint transactions_kind_check check (
    kind in ('income','expense','transfer','opening','refund','reversal','adjustment')
  ),
  constraint transactions_status_check check (
    status in ('draft','pending','confirmed','reversed','deleted')
  ),
  constraint transactions_amount_check check (amount_minor between 1 and 9007199254740991),
  constraint transactions_fee_check check (fee_minor between 0 and 9007199254740991),
  constraint transactions_category_check check (
    kind in ('income','expense') or category_id is null
  ),
  constraint transactions_title_check check (
    title=btrim(title) and char_length(title) between 1 and 160 and title !~ '[[:cntrl:]]'
  ),
  constraint transactions_merchant_check check (
    merchant is null or (merchant=btrim(merchant) and char_length(merchant) between 1 and 160 and merchant !~ '[[:cntrl:]]')
  ),
  constraint transactions_payment_method_check check (
    payment_method is null or (payment_method=btrim(payment_method) and char_length(payment_method) between 1 and 80 and payment_method !~ '[[:cntrl:]]')
  ),
  constraint transactions_note_check check (
    note is null or (note=btrim(note) and char_length(note) between 1 and 500 and note !~ '[[:cntrl:]]')
  ),
  constraint transactions_occurred_check check (
    occurred_at>='1900-01-01T00:00:00Z'::timestamptz and occurred_at<=created_at+interval '5 minutes'
  ),
  constraint transactions_source_check check (source ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  constraint transactions_external_ref_check check (
    external_ref is null or (external_ref=btrim(external_ref) and char_length(external_ref) between 1 and 200 and external_ref !~ '[[:cntrl:]]')
  ),
  constraint transactions_reversal_check check (reverses_transaction_id is distinct from id),
  constraint transactions_delete_check check (
    (status='deleted' and deleted_at is not null and undo_expires_at=deleted_at+interval '30 seconds')
    or (status<>'deleted' and deleted_at is null and undo_expires_at is null)
  ),
  constraint transactions_version_check check (version>0)
);
alter table public.transactions owner to masarifi_migration;
create index transactions_owner_cursor_idx on public.transactions(user_id,occurred_at desc,id desc);
create index transactions_owner_active_cursor_idx on public.transactions(user_id,occurred_at desc,id desc) where deleted_at is null;
create index transactions_owner_status_cursor_idx on public.transactions(user_id,status,occurred_at desc,id desc);
create index transactions_category_cursor_idx on public.transactions(category_id,occurred_at desc,id desc) where category_id is not null;
create index transactions_reversal_idx on public.transactions(reverses_transaction_id) where reverses_transaction_id is not null;
create unique index transactions_active_reversal_uq on public.transactions(reverses_transaction_id)
  where kind='reversal' and status='confirmed';
create unique index transactions_external_ref_uq on public.transactions(user_id,source,external_ref) where external_ref is not null;
create index transactions_search_idx on public.transactions using gin(
  to_tsvector('simple',coalesce(title,'')||' '||coalesce(merchant,''))
);

create table public.transaction_postings (
  id uuid primary key default extensions.gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  account_id uuid not null references public.accounts(id) on update restrict on delete restrict,
  amount_minor bigint not null,
  clearing_state text not null default 'confirmed',
  posting_role text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint transaction_postings_amount_check check (
    amount_minor between -9007199254740991 and 9007199254740991 and amount_minor<>0
  ),
  constraint transaction_postings_state_check check (clearing_state in ('pending','confirmed')),
  constraint transaction_postings_role_check check (
    posting_role in ('source','destination','fee','opening','refund','reversal','adjustment')
  )
);
alter table public.transaction_postings owner to masarifi_migration;
create index transaction_postings_transaction_idx on public.transaction_postings(transaction_id,created_at,id);
create index transaction_postings_account_cursor_idx on public.transaction_postings(account_id,occurred_at desc,id desc);
create index transaction_postings_pending_cursor_idx on public.transaction_postings(account_id,occurred_at desc,id desc) where clearing_state='pending';
create unique index transaction_postings_opening_account_uq on public.transaction_postings(account_id) where posting_role='opening';

create table audit.transaction_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  revision_no integer not null,
  actor_id text not null,
  reason text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint transaction_revisions_number_check check (revision_no>0),
  constraint transaction_revisions_actor_check check (
    actor_id=btrim(actor_id) and char_length(actor_id) between 1 and 128
  ),
  constraint transaction_revisions_reason_check check (
    reason=btrim(reason) and char_length(reason) between 1 and 500 and reason !~ '[[:cntrl:]]'
  ),
  constraint transaction_revisions_before_check check (
    jsonb_typeof(before_snapshot)='object' and pg_column_size(before_snapshot)<=65536
  ),
  constraint transaction_revisions_after_check check (
    jsonb_typeof(after_snapshot)='object' and pg_column_size(after_snapshot)<=65536
  )
);
alter table audit.transaction_revisions owner to masarifi_migration;
create unique index transaction_revisions_number_uq on audit.transaction_revisions(transaction_id,revision_no);
create index transaction_revisions_cursor_idx on audit.transaction_revisions(transaction_id,created_at desc,id desc);

create table public.account_balances (
  account_id uuid primary key references public.accounts(id) on update restrict on delete restrict,
  confirmed_minor bigint not null default 0,
  pending_minor bigint not null default 0,
  ledger_version bigint not null default 0,
  reconciled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint account_balances_confirmed_check check (confirmed_minor between -9007199254740991 and 9007199254740991),
  constraint account_balances_pending_check check (pending_minor between -9007199254740991 and 9007199254740991),
  constraint account_balances_available_check check (
    confirmed_minor+pending_minor between -9007199254740991 and 9007199254740991
  ),
  constraint account_balances_version_check check (ledger_version>=0)
);
alter table public.account_balances owner to masarifi_migration;
create index account_balances_reconciled_idx on public.account_balances(reconciled_at,account_id);

create function private.reject_ledger_evidence_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception using errcode='42501',message='LEDGER_EVIDENCE_IMMUTABLE';
end $$;
alter function private.reject_ledger_evidence_change() owner to masarifi_migration;
revoke all on function private.reject_ledger_evidence_change() from public;
create trigger transaction_postings_immutable before update or delete on public.transaction_postings
for each row execute function private.reject_ledger_evidence_change();
create trigger transaction_revisions_immutable before update or delete on audit.transaction_revisions
for each row execute function private.reject_ledger_evidence_change();

create function private.guard_transaction_update() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('masarifi.ledger_command',true)<>'on' then
    raise exception using errcode='42501',message='LEDGER_COMMAND_REQUIRED';
  end if;
  if new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
    or new.currency_code is distinct from old.currency_code
    or new.reverses_transaction_id is distinct from old.reverses_transaction_id
    or new.source is distinct from old.source or new.external_ref is distinct from old.external_ref
    or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501',message='TRANSACTION_IDENTITY_IMMUTABLE';
  end if;
  if not (
    (old.status='confirmed' and new.status in ('confirmed','reversed','deleted'))
    or (old.status='deleted' and new.status='confirmed')
    or (old.status in ('draft','pending') and new.status in ('draft','pending','confirmed','deleted'))
  ) then raise exception using errcode='P0001',message='TRANSACTION_STATE_INVALID'; end if;
  new.version=old.version+1;
  new.updated_at=clock_timestamp();
  return new;
end $$;
alter function private.guard_transaction_update() owner to masarifi_migration;
revoke all on function private.guard_transaction_update() from public;
create trigger transactions_guard before update on public.transactions
for each row execute function private.guard_transaction_update();

create function private.guard_account_balance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('masarifi.ledger_command',true)<>'on' then
    raise exception using errcode='42501',message='LEDGER_COMMAND_REQUIRED';
  end if;
  if tg_op='DELETE' or (tg_op='UPDATE' and new.account_id is distinct from old.account_id) then
    raise exception using errcode='42501',message='BALANCE_IDENTITY_IMMUTABLE';
  end if;
  return new;
end $$;
alter function private.guard_account_balance() owner to masarifi_migration;
revoke all on function private.guard_account_balance() from public;
create trigger account_balances_guard before insert or update or delete on public.account_balances
for each row execute function private.guard_account_balance();

create view public.v_account_balance_summary with (security_invoker=true) as
select a.id as account_id,a.currency_code,a.status as account_status,
  coalesce(b.confirmed_minor,0::bigint) as confirmed_minor,
  coalesce(b.pending_minor,0::bigint) as pending_minor,
  coalesce(b.confirmed_minor,0::bigint)+coalesce(b.pending_minor,0::bigint) as available_minor,
  coalesce(b.ledger_version,0::bigint) as ledger_version,b.reconciled_at,b.updated_at
from public.accounts a left join public.account_balances b on b.account_id=a.id;
alter view public.v_account_balance_summary owner to masarifi_migration;

select pg_catalog.set_config('masarifi.ledger_command','on',true);
insert into public.account_balances(account_id)
select a.id from public.accounts a on conflict(account_id) do nothing;

reset role;
revoke masarifi_migration from current_user granted by current_user;
