# Phase 07 Financial Planning Data Model

## Shared Conventions

`M+U` means `id uuid primary key default gen_random_uuid()`, `user_id text not
null references public.profiles(id)`, `created_at timestamptz not null default
now()`, `updated_at timestamptz not null default now()`, and `version bigint not
null default 1 check (version > 0)`. `I+U` means immutable `id`, `user_id`, and
`created_at` without a mutable version. Mutable roots reuse
`private.set_updated_at_and_version()`; callers cannot set metadata.

All minor-unit columns are `bigint` and constrained to the domain defined below.
All currency columns reference `public.currencies(code)`. Every public table
enables and forces RLS. Text is trimmed, control/bidi characters are rejected at
the API boundary, and database checks enforce bounded lengths.

## Entities

### `public.salary_profiles` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `name` | `text` | 1..120; current Mobile `sourceName` |
| `amount_minor` | `bigint` | `> 0` |
| `currency_code` | `char(3)` | enabled currency FK |
| `frequency` | `text` | `monthly`, `weekly`, `biweekly`, `custom` |
| `expected_day` | `smallint null` | monthly 1..31; weekly/biweekly 0..6; custom null |
| `custom_interval_days` | `smallint null` | custom 1..366 only |
| `account_id` | `uuid null` | owned active account, same currency |
| `automatic_detection_enabled` | `boolean default false` | preference only; no auto authority |
| `status` | `text default 'active'` | `active`, `paused`, `archived` |
| `deleted_at` | `timestamptz null` | set only when archived/deleted contract applies |

Indexes: `(user_id,status)`, `(user_id,account_id)`, and partial
`(user_id,expected_day)` for active profiles. A user may have multiple profiles;
the API marks one primary in response ordering without a duplicate truth field.

Transitions: `active <-> paused -> archived`; archived is terminal except an
explicit restore command if later approved. Expected dates are derived, not
stored on the profile.

### `public.salary_receipts` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `salary_profile_id` | `uuid` | FK profile, same owner, cascade prohibited |
| `transaction_id` | `uuid null` | FK Phase 05 transaction; received/corrected only |
| `expected_at` | `timestamptz` | deterministic cycle instant |
| `received_at` | `timestamptz null` | required for received/corrected |
| `amount_minor` | `bigint` | `> 0`; expected amount or linked actual amount |
| `status` | `text default 'expected'` | `expected`, `received`, `missed`, `ignored`, `corrected`, `undone` |
| `operation_id` | `uuid null` | stable client operation reference |
| `replaces_receipt_id` | `uuid null` | self FK; no cycles |

Unique/indexes: `(salary_profile_id,expected_at)` unique; partial
`transaction_id` unique where status in (`received`,`corrected`);
`(user_id,status,expected_at)`, `(salary_profile_id,expected_at desc)`.

Transitions: expected may become received/missed/ignored. Received may be
corrected or undone; correction inserts/links auditable replacement state rather
than destroying history.

### `public.budgets` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `name` | `text` | 1..120 |
| `currency_code` | `char(3)` | enabled currency FK |
| `period_start` | `date` | inclusive |
| `period_end` | `date` | inclusive, `>= period_start`, max 366 days |
| `total_minor` | `bigint` | `>= 0`; Mobile configured expense limit |
| `income_target_minor` | `bigint default 0` | `>= 0` |
| `savings_target_minor` | `bigint default 0` | `>= 0` |
| `rollover_enabled` | `boolean default false` | off by default |
| `rollover_minor` | `bigint default 0` | `>= 0`; zero when disabled |
| `status` | `text default 'draft'` | `draft`, `active`, `paused`, `closed`, `deleted` |
| `copied_from_budget_id` | `uuid null` | same-owner self FK |
| `deleted_at` | `timestamptz null` | required iff deleted |

Indexes: `(user_id,period_start,period_end,status)`, `(user_id,status)`, and
`copied_from_budget_id`. Overlap is intentionally allowed; no period uniqueness.

Transitions: `draft -> active`; `active <-> paused`; active/paused -> closed;
non-deleted -> deleted. Closed/deleted reject allocations.

### `public.budget_categories` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `budget_id` | `uuid` | FK budget on delete cascade, same owner |
| `category_id` | `uuid` | owned/global allowed category FK |
| `limit_minor` | `bigint` | `>= 0` |
| `rollover_minor` | `bigint default 0` | `>= 0` |
| `alert_thresholds` | `smallint[] default '{80,90,100}'` | unique sorted values from 1..200, max 8 |
| `status` | `text default 'active'` | `active`, `paused`, `deleted` |

Unique/indexes: `(budget_id,category_id)` unique; `(user_id,budget_id)`,
`(category_id)`, and `(user_id,status)`. The replace command enforces that the
sum of active `limit_minor` does not exceed the budget `total_minor`.

### `public.obligations` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `name` | `text` | 1..160; Mobile title |
| `direction` | `text default 'payable'` | `payable`, `receivable` |
| `type` | `text` | `bill`, `debt`, `installment`, `subscription`, `other`, plus current Mobile type allowlist |
| `schedule_kind` | `text` | `fixed_term`, `open_ended`, `irregular` |
| `currency_code` | `char(3)` | enabled currency FK |
| `principal_minor` | `bigint default 0` | `>= 0`; zero allowed only open-ended |
| `opening_paid_minor` | `bigint default 0` | `>= 0` and `<= principal` for fixed term |
| `installment_amount_minor` | `bigint null` | positive when scheduled |
| `installment_count` | `integer null` | 1..1200 for fixed term |
| `frequency` | `text` | `monthly`, `weekly`, `biweekly`, `quarterly`, `yearly`, `custom`, `irregular` |
| `expected_day` | `smallint null` | frequency-specific day rule |
| `custom_interval_days` | `smallint null` | custom 1..366 |
| `start_date` | `date` | required |
| `end_date` | `date null` | `>= start_date` |
| `status` | `text default 'active'` | `active`, `paused`, `completed`, `closed`, `archived` |
| `default_account_id` | `uuid null` | owned active account, same currency |
| `automatic_matching_enabled` | `boolean default false` | proposal preference only |
| `provider` | `text null` | max 120 |
| `provider_keywords` | `text[] default '{}'` | max 20 values, each 1..80 |
| `reminder_timing` | `text null` | bounded owned intent token |
| `notes` | `text null` | max 1000; never logged/evented |
| `deleted_at` | `timestamptz null` | archive/delete marker |

Indexes: `(user_id,status)`, `(user_id,end_date)`, `(user_id,direction,status)`,
`(user_id,automatic_matching_enabled)` partial true, and `default_account_id`.

### `public.obligation_schedule_items` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `obligation_id` | `uuid` | FK obligation on delete cascade, same owner |
| `due_at` | `timestamptz` | deterministic due instant |
| `amount_minor` | `bigint` | `> 0` |
| `paid_minor` | `bigint default 0` | `>= 0` and `<= amount_minor` |
| `status` | `text default 'due'` | `due`, `partial`, `paid`, `overdue`, `skipped`, `cancelled` |
| `sequence_no` | `integer` | `> 0` |
| `kind` | `text default 'installment'` | `installment`, `balloon`, `confirmed_occurrence`, `prepayment` |

Unique/indexes: `(obligation_id,sequence_no)` unique;
`(user_id,status,due_at)`, `(obligation_id,due_at)`. `paid_minor` is a
transactionally maintained allocation projection and is fully reconstructable.

### `public.obligation_payments` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `obligation_id` | `uuid` | owned obligation FK |
| `transaction_id` | `uuid` | owned confirmed expense transaction FK |
| `paid_at` | `timestamptz` | canonical transaction time or explicit compatible date |
| `amount_minor` | `bigint` | `> 0`, equals transaction/payment effect |
| `payment_method` | `text null` | max 80 |
| `payment_case` | `text` | `partial`, `full`, `over`, `early`, `settlement`, `correction` |
| `allocation_intent` | `text` | `current`, `later_installments`, `principal`, `correction`, `settlement`, `prepayment` |
| `source` | `text default 'manual'` | `manual`, `automatic`, `voice`, `platform_assisted` |
| `transaction_ownership` | `text default 'linked_existing'` | `created`, `linked_existing` |
| `principal_reduction_minor` | `bigint default 0` | `>= 0` |
| `settlement_adjustment_minor` | `bigint default 0` | signed and bounded by principal |
| `status` | `text default 'confirmed'` | `pending`, `confirmed`, `reversed` |
| `operation_id` | `uuid null` | stable client operation reference |
| `replaces_payment_id` | `uuid null` | same-obligation self FK |

Unique/indexes: partial unique `transaction_id` where status != `reversed`;
`(obligation_id,paid_at desc)`, `(user_id,status)`, `operation_id` partial unique.

### `public.obligation_payment_allocations` (`I+U`)

| Column | Type / default | Rules |
|---|---|---|
| `payment_id` | `uuid` | FK payment on delete cascade |
| `schedule_item_id` | `uuid` | FK same-obligation schedule item |
| `amount_minor` | `bigint` | `> 0` |

Unique/indexes: `(payment_id,schedule_item_id)` unique;
`(schedule_item_id)`. Allocation rows are immutable; reversal is represented on
the payment and reconstructed projection.

### `public.payment_matches` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `transaction_id` | `uuid` | owned confirmed expense transaction FK |
| `obligation_id` | `uuid` | owned obligation FK |
| `schedule_item_id` | `uuid null` | same-obligation schedule FK |
| `confidence` | `numeric(5,4)` | 0..1 |
| `evidence` | `jsonb default '{}'` | bounded allowlisted reason codes only |
| `status` | `text default 'proposed'` | `proposed`, `accepted`, `rejected` |
| `reviewed_by` | `text null` | owner principal ID only |
| `reviewed_at` | `timestamptz null` | required for terminal state |

Unique/indexes: `(transaction_id,obligation_id)` unique;
`(user_id,status)`, `(obligation_id,status)`, `(transaction_id,status)`.

### `public.savings_goals` (`M+U`)

| Column | Type / default | Rules |
|---|---|---|
| `name` | `text` | 1..160; Mobile title |
| `currency_code` | `char(3)` | enabled currency FK |
| `target_minor` | `bigint` | `> 0` |
| `opening_tracked_minor` | `bigint default 0` | `>= 0`; migration-only base |
| `target_date` | `date null` | optional future/business date |
| `status` | `text default 'active'` | `active`, `paused`, `completed`, `deleted` |
| `linked_account_id` | `uuid null` | owned account, same currency |
| `icon_key` | `text null` | max 80, presentation-safe token |
| `emergency_fund` | `boolean default false` | classification only |
| `deleted_at` | `timestamptz null` | required iff deleted |

Indexes: `(user_id,status,target_date)`, `(user_id,linked_account_id)`, and
partial `(user_id,emergency_fund)` true.

Transitions: `active <-> paused`; active/paused -> completed; any non-deleted ->
deleted. Target reductions below progress require explicit complete/active
decision in the update command.

### `public.savings_goal_movements` (`I+U`)

| Column | Type / default | Rules |
|---|---|---|
| `goal_id` | `uuid` | owned goal FK |
| `transaction_id` | `uuid` | owned confirmed compatible transaction FK |
| `amount_minor` | `bigint` | nonzero; contribution positive, withdrawal negative |
| `occurred_at` | `timestamptz` | canonical effect time |
| `kind` | `text` | `contribution`, `withdrawal`, `adjustment`, `reversal` |
| `operation_id` | `uuid null` | stable client operation reference |
| `replaces_movement_id` | `uuid null` | same-goal self FK |

Unique/indexes: `(goal_id,transaction_id,kind)` unique;
`(goal_id,occurred_at desc)`, `(user_id,occurred_at desc)`, partial unique
`operation_id`. Rows remain immutable. A reversal is a compensating movement
with the opposite signed effect and `replaces_movement_id`; response status is
derived from the linked transaction and compensating history rather than stored.

## Derived Views

### `public.v_salary_cycle_summary`

One row per active profile/current cycle: profile and receipt IDs, cycle start,
next expected date, actual income/expense/reserved obligation minor units,
remaining/suggested daily values or unavailable reason, salary/data state, and
maximum relevant ledger version. `security_invoker = true`.

### `public.v_budget_utilization`

One row per non-deleted budget/category summary: eligible spent, remaining,
utilization basis points, ledger version, and partial/unavailable reason. Uses
confirmed Phase 05 transaction/posting effects once, excludes transfers, and
applies refunds/reversals. `security_invoker = true`.

### `public.v_obligation_status`

One row per non-archived obligation: scheduled, allocated, paid, remaining,
overdue, next due, completed installment count, state, and ledger version.
Payable and receivable direction remains explicit. `security_invoker = true`.

## Command Invariants

- Root commands lock the root row after Phase 06 idempotency reservation and
  validate `expectedVersion` before dependent rows.
- Payment allocation locks obligation, transaction, then schedule rows sorted by
  UUID to avoid deadlocks; movement locks goal then transaction.
- Payment amount equals allocation sum. Normal allocations cannot exceed each
  schedule remainder. Prepayment is explicit and does not fabricate schedule.
- Salary receipt, payment, and goal movement transaction links are unique within
  their active domain effect and validated against Phase 05 status/kind/currency.
- Outbox/audit and domain writes share one database transaction.
- Reconciliation may rebuild `paid_minor` and derived lifecycle only; immutable
  allocations/movements and Phase 05 rows are never rewritten.

## RLS And Grants

- Owner `SELECT` policies require `user_id = private.current_user_id()` and an
  active profile. Root mutations are API function-only; ordinary authenticated
  direct table mutations are revoked.
- Admin reads require both authenticated Admin identity and `planning.read` via
  the existing permission function. Admin has no insert/update/delete policy.
- Worker functions require service role plus named worker operation and validate
  each selected row's owner. Anonymous receives no grants.
- Dependent ownership is checked both through stored `user_id` and the root FK;
  constraint triggers reject mismatches.
- Security-definer functions have fixed `search_path`, explicit owner, revoked
  public execute, and minimum explicit service/API grants.

## Migration And Client Mapping

Mobile SQLite v10 stores full planning objects as JSON payloads plus indexed
identity/status/link columns. Import maps stable IDs, timestamps, versions,
minor-unit safe integers, lifecycle, and transaction/category/account links to
the normalized model. Invalid ownership, unavailable currency, unsafe precision,
duplicate active links, or inconsistent schedules enter a quarantine record
owned by the existing Phase 06 migration tooling; they are not silently coerced.

Client fields that are derived server-side (`nextExpectedDate`, budget progress,
paid/remaining counts, savings progress, comparisons) are response fields, not
duplicated mutable columns. Local drafts and UI conflicts remain Phase 06/client
state until Phase 14 cutover.
