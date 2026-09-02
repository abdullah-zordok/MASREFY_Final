grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.planning_thresholds_valid(p_values smallint[])
returns boolean language sql immutable set search_path='' as $$
  select p_values is not null
    and cardinality(p_values) between 1 and 8
    and not exists(
      select 1 from unnest(p_values) with ordinality v(value,position)
      where value not between 1 and 200
        or (position > 1 and value <= p_values[position::integer-1])
    )
$$;
alter function private.planning_thresholds_valid(smallint[]) owner to masarifi_migration;
revoke all on function private.planning_thresholds_valid(smallint[]) from public;

create function private.reject_planning_history_change()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501',message='PLANNING_HISTORY_IMMUTABLE';
end $$;
alter function private.reject_planning_history_change() owner to masarifi_migration;
revoke all on function private.reject_planning_history_change() from public;

create table public.salary_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  name text not null,
  amount_minor bigint not null,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  frequency text not null,
  expected_day smallint,
  custom_interval_days smallint,
  account_id uuid references public.accounts(id) on update restrict on delete restrict,
  automatic_detection_enabled boolean not null default false,
  status text not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint salary_profiles_owner_identity_uq unique(id,user_id),
  constraint salary_profiles_name_check check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  constraint salary_profiles_amount_check check(amount_minor>0),
  constraint salary_profiles_frequency_check check(
    (frequency='monthly' and expected_day between 1 and 31 and custom_interval_days is null)
    or (frequency in ('weekly','biweekly') and expected_day between 0 and 6 and custom_interval_days is null)
    or (frequency='custom' and expected_day is null and custom_interval_days between 1 and 366)
  ),
  constraint salary_profiles_status_check check(status in ('active','paused','archived')),
  constraint salary_profiles_deleted_check check((status='archived')=(deleted_at is not null)),
  constraint salary_profiles_version_check check(version>0)
);
alter table public.salary_profiles owner to masarifi_migration;
create index salary_profiles_owner_status_idx on public.salary_profiles(user_id,status,id);
create index salary_profiles_owner_account_idx on public.salary_profiles(user_id,account_id) where account_id is not null;
create index salary_profiles_owner_expected_idx on public.salary_profiles(user_id,expected_day) where status='active';

create table public.salary_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  salary_profile_id uuid not null,
  transaction_id uuid references public.transactions(id) on update restrict on delete restrict,
  expected_at timestamptz not null,
  received_at timestamptz,
  amount_minor bigint not null,
  status text not null default 'expected',
  operation_id uuid,
  replaces_receipt_id uuid references public.salary_receipts(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint salary_receipts_owner_identity_uq unique(id,user_id),
  constraint salary_receipts_profile_owner_fk foreign key(salary_profile_id,user_id)
    references public.salary_profiles(id,user_id) on update restrict on delete restrict,
  constraint salary_receipts_amount_check check(amount_minor>0),
  constraint salary_receipts_status_check check(status in ('expected','received','missed','ignored','corrected','undone')),
  constraint salary_receipts_received_check check(
    (status in ('received','corrected') and transaction_id is not null and received_at is not null)
    or (status not in ('received','corrected') and received_at is null)
  ),
  constraint salary_receipts_replacement_check check(replaces_receipt_id is distinct from id),
  constraint salary_receipts_version_check check(version>0)
);
alter table public.salary_receipts owner to masarifi_migration;
create unique index salary_receipts_profile_expected_uq on public.salary_receipts(salary_profile_id,expected_at);
create unique index salary_receipts_active_transaction_uq on public.salary_receipts(transaction_id) where status in ('received','corrected');
create index salary_receipts_owner_status_expected_idx on public.salary_receipts(user_id,status,expected_at,id);
create index salary_receipts_profile_expected_idx on public.salary_receipts(salary_profile_id,expected_at desc,id desc);

create table public.budgets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  name text not null,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  period_start date not null,
  period_end date not null,
  total_minor bigint not null,
  income_target_minor bigint not null default 0,
  savings_target_minor bigint not null default 0,
  rollover_enabled boolean not null default false,
  rollover_minor bigint not null default 0,
  status text not null default 'draft',
  copied_from_budget_id uuid references public.budgets(id) on update restrict on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint budgets_owner_identity_uq unique(id,user_id),
  constraint budgets_name_check check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  constraint budgets_period_check check(period_end>=period_start and period_end-period_start<=365),
  constraint budgets_money_check check(total_minor>=0 and income_target_minor>=0 and savings_target_minor>=0 and rollover_minor>=0),
  constraint budgets_rollover_check check(rollover_enabled or rollover_minor=0),
  constraint budgets_status_check check(status in ('draft','active','paused','closed','deleted')),
  constraint budgets_deleted_check check((status='deleted')=(deleted_at is not null)),
  constraint budgets_copy_check check(copied_from_budget_id is distinct from id),
  constraint budgets_version_check check(version>0)
);
alter table public.budgets owner to masarifi_migration;
create index budgets_owner_period_status_idx on public.budgets(user_id,period_start,period_end,status,id);
create index budgets_owner_status_idx on public.budgets(user_id,status,id);
create index budgets_copied_from_idx on public.budgets(copied_from_budget_id) where copied_from_budget_id is not null;

create table public.budget_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  budget_id uuid not null,
  category_id uuid not null references public.categories(id) on update restrict on delete restrict,
  limit_minor bigint not null,
  rollover_minor bigint not null default 0,
  alert_thresholds smallint[] not null default '{80,90,100}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint budget_categories_owner_identity_uq unique(id,user_id),
  constraint budget_categories_budget_owner_fk foreign key(budget_id,user_id)
    references public.budgets(id,user_id) on update restrict on delete cascade,
  constraint budget_categories_money_check check(limit_minor>=0 and rollover_minor>=0),
  constraint budget_categories_thresholds_check check(private.planning_thresholds_valid(alert_thresholds)),
  constraint budget_categories_status_check check(status in ('active','paused','deleted')),
  constraint budget_categories_version_check check(version>0)
);
alter table public.budget_categories owner to masarifi_migration;
create unique index budget_categories_budget_category_uq on public.budget_categories(budget_id,category_id);
create index budget_categories_owner_budget_idx on public.budget_categories(user_id,budget_id,id);
create index budget_categories_category_idx on public.budget_categories(category_id,id);
create index budget_categories_owner_status_idx on public.budget_categories(user_id,status,id);

create table public.obligations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  name text not null,
  direction text not null default 'payable',
  type text not null,
  schedule_kind text not null,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  principal_minor bigint not null default 0,
  opening_paid_minor bigint not null default 0,
  installment_amount_minor bigint,
  installment_count integer,
  frequency text not null,
  expected_day smallint,
  custom_interval_days smallint,
  start_date date not null,
  end_date date,
  status text not null default 'active',
  default_account_id uuid references public.accounts(id) on update restrict on delete restrict,
  automatic_matching_enabled boolean not null default false,
  provider text,
  provider_keywords text[] not null default '{}',
  reminder_timing text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint obligations_owner_identity_uq unique(id,user_id),
  constraint obligations_name_check check(name=btrim(name) and char_length(name) between 1 and 160 and name !~ '[[:cntrl:]]'),
  constraint obligations_direction_check check(direction in ('payable','receivable')),
  constraint obligations_type_check check(type in ('bill','installment','other','car_installment','personal_loan','buy_now_pay_later','credit_card_installment','rent','utility','subscription','debt','custom')),
  constraint obligations_schedule_kind_check check(schedule_kind in ('fixed_term','open_ended','irregular')),
  constraint obligations_money_check check(principal_minor>=0 and opening_paid_minor>=0 and opening_paid_minor<=principal_minor and (installment_amount_minor is null or installment_amount_minor>0)),
  constraint obligations_fixed_term_check check(
    (schedule_kind='fixed_term' and principal_minor>0 and installment_amount_minor is not null and installment_count between 1 and 1200)
    or (schedule_kind<>'fixed_term' and installment_count is null)
  ),
  constraint obligations_frequency_check check(
    (frequency='monthly' and expected_day between 1 and 31 and custom_interval_days is null)
    or (frequency in ('weekly','biweekly') and expected_day between 0 and 6 and custom_interval_days is null)
    or (frequency in ('quarterly','yearly') and expected_day between 1 and 31 and custom_interval_days is null)
    or (frequency='custom' and expected_day is null and custom_interval_days between 1 and 366)
    or (frequency='irregular' and schedule_kind='irregular' and expected_day is null and custom_interval_days is null)
  ),
  constraint obligations_dates_check check(end_date is null or end_date>=start_date),
  constraint obligations_status_check check(status in ('active','paused','completed','closed','archived')),
  constraint obligations_provider_check check(provider is null or (provider=btrim(provider) and char_length(provider) between 1 and 120 and provider !~ '[[:cntrl:]]')),
  constraint obligations_keywords_check check(cardinality(provider_keywords)<=20),
  constraint obligations_reminder_check check(reminder_timing is null or (char_length(reminder_timing) between 1 and 80 and reminder_timing ~ '^[a-z][a-z0-9_.-]*$')),
  constraint obligations_notes_check check(notes is null or (notes=btrim(notes) and char_length(notes) between 1 and 1000 and notes !~ '[[:cntrl:]]')),
  constraint obligations_deleted_check check((status='archived')=(deleted_at is not null)),
  constraint obligations_version_check check(version>0)
);
alter table public.obligations owner to masarifi_migration;
create index obligations_owner_status_idx on public.obligations(user_id,status,id);
create index obligations_owner_end_idx on public.obligations(user_id,end_date,id);
create index obligations_owner_direction_status_idx on public.obligations(user_id,direction,status,id);
create index obligations_auto_match_idx on public.obligations(user_id,id) where automatic_matching_enabled and status='active';
create index obligations_account_idx on public.obligations(default_account_id) where default_account_id is not null;

create table public.obligation_schedule_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  obligation_id uuid not null,
  due_at timestamptz not null,
  amount_minor bigint not null,
  paid_minor bigint not null default 0,
  status text not null default 'due',
  sequence_no integer not null,
  kind text not null default 'installment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint obligation_schedule_items_owner_identity_uq unique(id,user_id),
  constraint obligation_schedule_items_obligation_owner_fk foreign key(obligation_id,user_id)
    references public.obligations(id,user_id) on update restrict on delete cascade,
  constraint obligation_schedule_items_money_check check(amount_minor>0 and paid_minor between 0 and amount_minor),
  constraint obligation_schedule_items_status_check check(status in ('due','partial','paid','overdue','skipped','cancelled')),
  constraint obligation_schedule_items_sequence_check check(sequence_no>0),
  constraint obligation_schedule_items_kind_check check(kind in ('installment','balloon','confirmed_occurrence','prepayment')),
  constraint obligation_schedule_items_version_check check(version>0)
);
alter table public.obligation_schedule_items owner to masarifi_migration;
create unique index obligation_schedule_items_obligation_sequence_uq on public.obligation_schedule_items(obligation_id,sequence_no);
create index obligation_schedule_items_owner_status_due_idx on public.obligation_schedule_items(user_id,status,due_at,id);
create index obligation_schedule_items_obligation_due_idx on public.obligation_schedule_items(obligation_id,due_at,id);

create table public.obligation_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  obligation_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  paid_at timestamptz not null,
  amount_minor bigint not null,
  payment_method text,
  payment_case text not null,
  allocation_intent text not null,
  source text not null default 'manual',
  transaction_ownership text not null default 'linked_existing',
  principal_reduction_minor bigint not null default 0,
  settlement_adjustment_minor bigint not null default 0,
  status text not null default 'confirmed',
  operation_id uuid,
  replaces_payment_id uuid references public.obligation_payments(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint obligation_payments_owner_identity_uq unique(id,user_id),
  constraint obligation_payments_obligation_owner_fk foreign key(obligation_id,user_id)
    references public.obligations(id,user_id) on update restrict on delete restrict,
  constraint obligation_payments_amount_check check(amount_minor>0 and principal_reduction_minor>=0),
  constraint obligation_payments_method_check check(payment_method is null or (payment_method=btrim(payment_method) and char_length(payment_method) between 1 and 80 and payment_method !~ '[[:cntrl:]]')),
  constraint obligation_payments_case_check check(payment_case in ('partial','full','over','early','settlement','correction')),
  constraint obligation_payments_intent_check check(allocation_intent in ('current','later_installments','principal','correction','settlement','prepayment')),
  constraint obligation_payments_source_check check(source in ('manual','automatic','voice','platform_assisted')),
  constraint obligation_payments_ownership_check check(transaction_ownership in ('created','linked_existing')),
  constraint obligation_payments_status_check check(status in ('pending','confirmed','reversed')),
  constraint obligation_payments_replacement_check check(replaces_payment_id is distinct from id),
  constraint obligation_payments_version_check check(version>0)
);
alter table public.obligation_payments owner to masarifi_migration;
create unique index obligation_payments_active_transaction_uq on public.obligation_payments(transaction_id) where status<>'reversed';
create unique index obligation_payments_operation_uq on public.obligation_payments(user_id,operation_id) where operation_id is not null;
create index obligation_payments_obligation_paid_idx on public.obligation_payments(obligation_id,paid_at desc,id desc);
create index obligation_payments_owner_status_idx on public.obligation_payments(user_id,status,id);

create table public.obligation_payment_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  payment_id uuid not null,
  schedule_item_id uuid not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  constraint obligation_payment_allocations_payment_owner_fk foreign key(payment_id,user_id)
    references public.obligation_payments(id,user_id) on update restrict on delete cascade,
  constraint obligation_payment_allocations_schedule_owner_fk foreign key(schedule_item_id,user_id)
    references public.obligation_schedule_items(id,user_id) on update restrict on delete restrict,
  constraint obligation_payment_allocations_amount_check check(amount_minor>0)
);
alter table public.obligation_payment_allocations owner to masarifi_migration;
create unique index obligation_payment_allocations_payment_item_uq on public.obligation_payment_allocations(payment_id,schedule_item_id);
create index obligation_payment_allocations_schedule_idx on public.obligation_payment_allocations(schedule_item_id,id);

create table public.payment_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  obligation_id uuid not null,
  schedule_item_id uuid,
  confidence numeric(5,4) not null,
  evidence jsonb not null default '{}',
  status text not null default 'proposed',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint payment_matches_owner_identity_uq unique(id,user_id),
  constraint payment_matches_obligation_owner_fk foreign key(obligation_id,user_id)
    references public.obligations(id,user_id) on update restrict on delete restrict,
  constraint payment_matches_schedule_owner_fk foreign key(schedule_item_id,user_id)
    references public.obligation_schedule_items(id,user_id) on update restrict on delete restrict,
  constraint payment_matches_confidence_check check(confidence between 0 and 1),
  constraint payment_matches_evidence_check check(jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=4096),
  constraint payment_matches_status_check check(status in ('proposed','accepted','rejected')),
  constraint payment_matches_review_check check((status='proposed' and reviewed_by is null and reviewed_at is null) or (status<>'proposed' and reviewed_by=user_id and reviewed_at is not null)),
  constraint payment_matches_version_check check(version>0)
);
alter table public.payment_matches owner to masarifi_migration;
create unique index payment_matches_transaction_obligation_uq on public.payment_matches(transaction_id,obligation_id);
create index payment_matches_owner_status_idx on public.payment_matches(user_id,status,id);
create index payment_matches_obligation_status_idx on public.payment_matches(obligation_id,status,id);
create index payment_matches_transaction_status_idx on public.payment_matches(transaction_id,status,id);

create table public.savings_goals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  name text not null,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  target_minor bigint not null,
  opening_tracked_minor bigint not null default 0,
  target_date date,
  status text not null default 'active',
  linked_account_id uuid references public.accounts(id) on update restrict on delete restrict,
  icon_key text,
  emergency_fund boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint savings_goals_owner_identity_uq unique(id,user_id),
  constraint savings_goals_name_check check(name=btrim(name) and char_length(name) between 1 and 160 and name !~ '[[:cntrl:]]'),
  constraint savings_goals_money_check check(target_minor>0 and opening_tracked_minor>=0),
  constraint savings_goals_status_check check(status in ('active','paused','completed','deleted')),
  constraint savings_goals_icon_check check(icon_key is null or (icon_key=btrim(icon_key) and char_length(icon_key) between 1 and 80 and icon_key ~ '^[A-Za-z0-9._:-]+$')),
  constraint savings_goals_deleted_check check((status='deleted')=(deleted_at is not null)),
  constraint savings_goals_version_check check(version>0)
);
alter table public.savings_goals owner to masarifi_migration;
create index savings_goals_owner_status_target_idx on public.savings_goals(user_id,status,target_date,id);
create index savings_goals_owner_account_idx on public.savings_goals(user_id,linked_account_id,id);
create index savings_goals_emergency_idx on public.savings_goals(user_id,id) where emergency_fund;

create table public.savings_goal_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  goal_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on update restrict on delete restrict,
  amount_minor bigint not null,
  occurred_at timestamptz not null,
  kind text not null,
  operation_id uuid,
  replaces_movement_id uuid references public.savings_goal_movements(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  constraint savings_goal_movements_goal_owner_fk foreign key(goal_id,user_id)
    references public.savings_goals(id,user_id) on update restrict on delete restrict,
  constraint savings_goal_movements_amount_check check(amount_minor<>0),
  constraint savings_goal_movements_kind_check check(kind in ('contribution','withdrawal','adjustment','reversal')),
  constraint savings_goal_movements_sign_check check((kind='contribution' and amount_minor>0) or (kind='withdrawal' and amount_minor<0) or kind in ('adjustment','reversal')),
  constraint savings_goal_movements_replacement_check check(replaces_movement_id is distinct from id)
);
alter table public.savings_goal_movements owner to masarifi_migration;
create unique index savings_goal_movements_goal_transaction_kind_uq on public.savings_goal_movements(goal_id,transaction_id,kind);
create unique index savings_goal_movements_operation_uq on public.savings_goal_movements(user_id,operation_id) where operation_id is not null;
create index savings_goal_movements_goal_occurred_idx on public.savings_goal_movements(goal_id,occurred_at desc,id desc);
create index savings_goal_movements_owner_occurred_idx on public.savings_goal_movements(user_id,occurred_at desc,id desc);

create trigger planning_salary_profiles_set_updated_at_and_version before update on public.salary_profiles for each row execute function private.set_updated_at_and_version();
create trigger planning_salary_receipts_set_updated_at_and_version before update on public.salary_receipts for each row execute function private.set_updated_at_and_version();
create trigger planning_budgets_set_updated_at_and_version before update on public.budgets for each row execute function private.set_updated_at_and_version();
create trigger planning_budget_categories_set_updated_at_and_version before update on public.budget_categories for each row execute function private.set_updated_at_and_version();
create trigger planning_obligations_set_updated_at_and_version before update on public.obligations for each row execute function private.set_updated_at_and_version();
create trigger planning_obligation_schedule_items_set_updated_at_and_version before update on public.obligation_schedule_items for each row execute function private.set_updated_at_and_version();
create trigger planning_obligation_payments_set_updated_at_and_version before update on public.obligation_payments for each row execute function private.set_updated_at_and_version();
create trigger planning_payment_matches_set_updated_at_and_version before update on public.payment_matches for each row execute function private.set_updated_at_and_version();
create trigger planning_savings_goals_set_updated_at_and_version before update on public.savings_goals for each row execute function private.set_updated_at_and_version();
create trigger planning_obligation_payment_allocations_immutable before update or delete on public.obligation_payment_allocations for each row execute function private.reject_planning_history_change();
create trigger planning_savings_goal_movements_immutable before update or delete on public.savings_goal_movements for each row execute function private.reject_planning_history_change();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
    'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
    'payment_matches','savings_goals','savings_goal_movements'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
  end loop;
end $$;

revoke all on public.salary_profiles,public.salary_receipts,public.budgets,public.budget_categories,
  public.obligations,public.obligation_schedule_items,public.obligation_payments,
  public.obligation_payment_allocations,public.payment_matches,public.savings_goals,
  public.savings_goal_movements
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

alter table public.client_mutations drop constraint client_mutations_domain_check;
alter table public.client_mutations add constraint client_mutations_domain_check
  check(domain in ('accounts','categories','transactions','planning'));
alter table public.client_mutations drop constraint client_mutations_resource_type_check;
alter table public.client_mutations add constraint client_mutations_resource_type_check check(
  (domain='accounts' and resource_type='account') or (domain='categories' and resource_type='category')
  or (domain='transactions' and resource_type='transaction')
  or (domain='planning' and resource_type in ('salary-profile','salary-receipt','budget','budget-category',
    'obligation','obligation-schedule','obligation-payment','payment-match','savings-goal','savings-movement'))
);
alter table public.client_sync_state drop constraint client_sync_state_domain_check;
alter table public.client_sync_state add constraint client_sync_state_domain_check
  check(domain in ('accounts','categories','transactions','planning'));

reset role;
revoke masarifi_migration from current_user granted by current_user;
