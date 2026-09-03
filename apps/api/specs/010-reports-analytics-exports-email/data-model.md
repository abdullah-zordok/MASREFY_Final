# Data Model: SPEC-BE-010 Reports, Analytics, Exports & Email Delivery

## `public.report_schedules`

Mutable owner resource using the shared version trigger.

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | not null / `gen_random_uuid()` | primary key |
| `user_id` | `text` | not null | FK `profiles(id)` on delete restrict; immutable owner |
| `report_type` | `text` | not null | supported allowlist |
| `frequency` | `text` | not null | `monthly`, `three_months`, `half_year`, `annual` |
| `timezone` | `text` | not null | exact installed IANA name |
| `next_run_at` | `timestamptz` | not null | future/due UTC instant derived from local calendar |
| `delivery_channel` | `text` | not null | `download` or `email` |
| `recipient` | `text` | null | normalized verified email; required only for email |
| `enabled` | `boolean` | not null / `true` | false pauses/deletes future claims |
| `last_run_at` | `timestamptz` | null | never later than successfully claimed due period |
| `created_at` | `timestamptz` | not null / `now()` | server controlled |
| `updated_at` | `timestamptz` | not null / `now()` | server controlled |
| `version` | `bigint` | not null / `1` | positive; incremented by shared trigger |

Constraints/indexes:

- unique `(user_id, report_type, frequency, delivery_channel)`;
- recipient nullability/channel consistency and bounded text checks;
- `report_schedules_user_created_idx (user_id, created_at desc, id desc)`;
- `report_schedules_due_idx (next_run_at, id) where enabled`;
- owner index also supports RLS predicate.

RLS/grants:

- enable and force RLS;
- authenticated select policy uses cached `current_clerk_user_id()` equality;
- no anonymous access; direct broad insert/update/delete is revoked;
- guarded API functions validate owner, `expectedVersion`, recent auth,
  verification and schedule transition;
- worker gets only required claim/transition function execute, not table mutation.

## `private.report_output_attempts`

Private point-in-time report snapshot plus guarded operational delivery state.

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | not null / `gen_random_uuid()` | primary key |
| `schedule_id` | `uuid` | null | FK schedule, delete restrict during retention |
| `user_id` | `text` | not null | FK profile, immutable |
| `report_type` | `text` | not null | supported allowlist, immutable |
| `period_start` | `date` | not null | immutable local date |
| `period_end` | `date` | not null | >= start and <= configured one-year bound |
| `ledger_version` | `bigint` | not null | >=0, immutable |
| `snapshot` | `jsonb` | not null | bounded object, immutable after insert |
| `storage_ref` | `text` | null | validated server key; worker-only operational field |
| `delivery_status` | `text` | not null / `queued` | state allowlist |
| `provider_message_id` | `text` | null | stable safe Message-ID only; no raw response |
| `attempt_count` | `integer` | not null / `0` | >=0 and bounded |
| `error_code` | `text` | null | bounded allowlist/safe code |
| `expires_at` | `timestamptz` | not null | after created; bounded retention |
| `created_at` | `timestamptz` | not null / `now()` | immutable |

Constraints/indexes:

- partial unique `(schedule_id, period_start, period_end)` where schedule is not null;
- `report_attempts_user_created_idx (user_id, created_at desc, id desc)`;
- partial active worker index `(delivery_status, created_at, id)` for queued/
  generating/ready/sending/failed states;
- `report_attempts_expiry_idx (expires_at, id)` where status is not expired;
- `report_attempts_schedule_idx (schedule_id, created_at desc)`;
- check `jsonb_typeof(snapshot)='object'`, bounded `pg_column_size(snapshot)`,
  valid status/period/attempt/error/storage shapes.

No ordinary client grants exist. Guarded private functions and repository SQL
return explicit safe columns only. Snapshot identity/content fields reject update;
operational fields transition only through legal worker functions with lease/fence
and terminal guards.

## Snapshot schema version 1

Required top-level keys:

```text
schemaVersion: 1
generatedAt: ISO UTC timestamp
ledgerVersion: non-negative integer
reportType: supported identifier
period: {startDate, endDate, timezone, kind}
format: json | csv | pdf
delivery: download | email
currencyCode: ISO-like enabled code
dataState: complete | empty | partial | estimated
evidence: bounded array of {kind,id?,version,asOf}
summary: bounded owner-safe financial/planning values
breakdowns: bounded arrays with stable IDs and integer minor units
detailedRows: bounded optional array
```

Forbidden keys include credentials, tokens, raw provider payloads, signed URLs,
SMTP responses, unrestricted transaction notes/descriptions, full account data,
or another owner identifier. The database validates structure/size; TypeScript
parses it again before rendering.

## Views

### `public.v_monthly_financial_summary`

One row per owner, month and currency from effective confirmed Phase 05 posting
truth. Fields: `user_id`, `month_start`, `currency_code`, `income_minor`,
`expense_minor`, `net_cash_flow_minor`, `transaction_count`, `ledger_version`.
It excludes physically ineffective reversed/deleted effects according to Phase 05
semantics, uses integer sums, and is `security_invoker`.

### `public.v_category_spending_summary`

One row per owner, month, currency and category identity for effective confirmed
expenses. Fields: `user_id`, `month_start`, `currency_code`, `category_id`,
safe category label keys, `expense_minor`, `transaction_count`, `ledger_version`.
Archived categories remain attributable; foreign/private metadata is absent. The
view is `security_invoker`.

Both views rely on existing ledger indexes unless `EXPLAIN` proves one precise
additional owned index is required. No materialization is planned.

## State machines

### Schedule

```text
create enabled -> due -> atomically enqueue unique period + advance next_run_at
enabled -> paused(enabled=false) -> enabled(recalculate from current local time)
enabled|paused -> deleted/disabled(enabled=false; no future claim)
stale expectedVersion -> reject without change
```

### Output attempt

```text
queued -> generating -> ready -> sending -> delivered
  |          |          |        |
  +----------+----------+--------+-> failed (safe retryable/terminal code)
queued|generating|ready|failed -> expired after object deletion/absence
sending ambiguous -> failed(DELIVERY_ACCEPTANCE_UNKNOWN), no automatic resend
delivered|expired -> terminal
```

Retry reuses the same snapshot and Message-ID. Explicit regeneration creates a
new manual attempt through `POST /reports`, never through retry-delivery.

## Relationships and deletion

- profile deletion/retention orchestration disables schedules, deletes expired
  objects, and retains/minimizes attempts only according to Phase 03 policy;
  no cascade may destroy evidence unexpectedly.
- schedule deletion is logical disable while retained attempts exist; later
  physical deletion is bounded after retention and FK-safe.
- object existence and attempt metadata reconcile; a missing object cannot remain
  ready/delivered with an issued link.

## Migration order

1. security-invoker analytics views and grants;
2. schedules/attempts tables, constraints and indexes;
3. capture/claim/transition/schedule functions and immutable guards;
4. RLS/minimum grants, permissions and event allowlists;
5. pgTAP, checksums, clean reset/lint, forward validation and rollback rehearsal.
