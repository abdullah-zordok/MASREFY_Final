# Phase 07 Internal Contracts

## Common Command Envelope

Every mutation is normalized to:

```ts
interface PlanningCommand<TBody> {
  userId: string;
  requestId: string;
  idempotencyKeyHash: string;
  operation: string;
  resourceId: string | null;
  expectedVersion: number | null;
  body: TBody;
}
```

The API never accepts `userId`, metadata, version, ledger version, derived
amounts, status timestamps, audit fields, or outbox fields from the request body.
Normalized money is a signed or unsigned `bigint` at the database boundary and
a canonical decimal string at HTTP boundaries.

## Durable Idempotency

1. Normalize and allowlist the request before hashing.
2. Hash operation, route resource, expected version, and canonical body through
   the existing Phase 06 idempotency helper.
3. Reserve by `(user_id,key_hash)` with a lease/fence.
4. Existing completed + same request hash returns the stored status/body.
5. Existing key + different request hash returns `IDEMPOTENCY_KEY_REUSED`.
6. Existing live lease returns/retries according to the existing in-progress
   contract; an expired lease can be reclaimed only with a new fence.
7. Domain rows, audit, outbox, and stored response complete atomically. A stale
   fence cannot complete another worker's reservation.

No Phase 07 table is a substitute idempotency store. `operation_id` columns
preserve client mapping and add a domain uniqueness backstop only.

## Lock Order

Locks are acquired in this order and UUID sets are sorted ascending:

1. Phase 06 idempotency reservation.
2. Planning root (`salary_profile`, `budget`, `obligation`, `savings_goal`, or
   `payment_match`).
3. Referenced Phase 04/05 rows: account/category then transaction.
4. Dependent planning rows: schedule items then existing payment/movement link.
5. Audit/outbox/receipt writes.

Commands may omit unused levels but may not reverse the order. Integration tests
race commands in opposite input order to prove no deadlock/partial effect.

## Salary Contract

`save_salary_profile` validates enabled currency and owned active account,
frequency/day consistency, positive amount, lifecycle, and expected version.

`generate_salary_receipts(profile_id, through_date)`:

- accepts a horizon no more than 18 months from current UTC date;
- derives stable expected instants in the profile owner's timezone;
- clamps monthly day to the actual month end, including leap years;
- inserts by `(profile_id,expected_at)` and returns inserted/existing counts;
- never inserts a ledger transaction or marks expected income received.

`link_salary_receipt` requires an owned confirmed non-reversed income transaction
in the same currency. It rejects an active link elsewhere. Received amount/date
come from the transaction. Unlink/correction retains auditable receipt history
and causes the current cycle view to recalculate.

## Budget Contract

Budget period endpoints are inclusive and at most 366 days. Overlap is legal.
`replace_budget_categories` receives the complete allocation array and an
expected budget version:

- maximum 100 entries; unique category IDs;
- each category is global or owner-visible and active;
- each limit/rollover is nonnegative and same budget currency;
- active limit sum <= budget total, including total zero behavior;
- root is draft/active/paused, not closed/deleted;
- replacement, root version bump, audit, and one `planning.budget_allocations`
  event are atomic.

Budget utilization includes each eligible confirmed expense effect once,
excludes transfers, subtracts refunds/reversals, follows the current category,
and returns `ledgerVersion`. Missing conversion inputs set `dataState=partial`
and name `missing_rate`; they never disappear from the accounting silently.

## Obligation Schedule Contract

`generate_obligation_schedule(obligation_id, through_date)` uses
`(obligation_id,sequence_no)` as identity. For fixed-term schedules it computes
all regular installments and places any positive residual in the last item. For
monthly dates it clamps the configured day. Weekly/biweekly use the configured
weekday; quarterly/yearly preserve the start anchor with month-end clamping;
custom uses `custom_interval_days`; irregular creates only explicitly supplied
confirmed-occurrence items.

Generation stops at the earliest of installment count, obligation end date, or
the requested 18-month maximum horizon. Paused/completed/closed/archived roots
do not generate. Repeated/concurrent calls return the same rows.

`mark_overdue(as_of,batch_size)` changes only due/partial rows with remaining
amount and due time before `as_of`; it skips paid/skipped/cancelled/future rows,
uses a maximum batch of 500, and is idempotent.

## Payment Allocation Contract

`allocate_obligation_payment` validates:

- owned active obligation and current expected version;
- owned confirmed non-reversed expense transaction in the same currency;
- transaction amount/effect equals `payment.amountMinor` and is not actively
  used by another obligation payment;
- 1..100 unique allocation entries, all schedule items under the same root;
- allocation sum equals payment amount;
- normal allocation <= each item's remaining amount;
- excess is accepted only with explicit `prepayment`/principal/settlement intent
  and never silently creates a future schedule item.

It inserts one payment and immutable allocations, recomputes `paid_minor` and
item/root state from active allocations, writes audit and one safe event, and
completes the Phase 06 receipt in one transaction. Partial amounts remain
partial. Reversal is triggered by explicit command or linked ledger state,
preserves history, excludes reversed allocations from projection, and emits one
reversal event idempotently.

## Payment Match Contract

The proposal function uses owned confirmed expense transactions, enabled
obligations, bounded provider/due/amount signals, and a versioned deterministic
scoring rule. It writes one row per transaction/obligation candidate and stores
only allowlisted reason codes in `evidence`.

Accept/reject requires owner, proposed status, and expected version. Reject is a
terminal planning-only decision. Accept first revalidates the transaction and
obligation, then calls the same payment allocation command with an explicit
allocation; it does not grant confidence-based authority. Concurrent/repeated
terminal decisions resolve once or replay.

## Savings Movement Contract

`record_savings_movement` validates an active/paused goal, owned confirmed
non-reversed compatible transaction, unique goal/transaction/kind, expected goal
version, and signed effect:

- contribution: positive amount backed by a transfer/income-compatible explicit
  savings effect;
- withdrawal: negative amount, absolute value <= derived confirmed progress;
- adjustment/correction: explicit signed amount with a replacement reason/link;
- reversal: created only by guarded correction/reconciliation.

Progress is `opening_tracked_minor + sum(valid movement amount_minor)`.
Current, remaining, percentage, required monthly, lifecycle suggestion, and
ledger version are derived. The command never changes an account balance.
Reversal appends an opposite signed compensating movement; immutable movement
rows are never updated in place and API status is derived from ledger/history.

## Root Lifecycle And Soft Delete

All lifecycle changes are allowlisted and version checked. Delete archives or
marks `deleted_at`; it does not delete dependent financial history. The Phase 06
sync handler emits a tombstone for deleted roots. Dependent immutable rows remain
queryable through authorized history endpoints and reconciliation.

## Read And Pagination Contract

Lists use opaque signed/validated keyset cursors over `(sort_time,id)`, default
50 and maximum 100. The cursor is scoped to route/filter/user and cannot select
another owner. Period is `YYYY-MM` for aggregate or explicit validated dates for
bounded endpoints. No arbitrary SQL sort/filter field is accepted.

Responses include `version`, `createdAt`, `updatedAt`, and relevant
`ledgerVersion`. Derived unavailable values use:

```json
{"status":"unavailable","reason":"missing_rate"}
```

They are never represented as zero.

## Summary Cache Contract

Correct uncached behavior is mandatory. A cache may wrap only
`GET /planning/summary` with key `(userId,period,ledgerVersion)`, maximum TTL 60
seconds, maximum entry/total bounds, and event/version invalidation. Permission
is checked before cache lookup. Cache failure falls back to PostgreSQL. No entry
or telemetry can cross users or contain raw planning details.

## Reconciliation Contract

The reconciler compares:

- salary received links to valid ledger income;
- budget view inputs/ledger version to active ledger effects;
- schedule `paid_minor`/status to active immutable allocations;
- payment/movement links to valid ledger state;
- goal progress/lifecycle suggestion to movement sums.

It reports stable safe difference codes. Repair mode updates only reconstructable
planning projections/status, never ledger rows or immutable history. Runs are
bounded, idempotent, auditable, and expose remaining difference count.

## Stable Error Codes

| Code | HTTP | Meaning |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | malformed/unknown/unbounded input |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | missing/invalid key |
| `IDEMPOTENCY_KEY_REUSED` | 409 | key hash does not match request |
| `PLANNING_NOT_FOUND` | 404 | absent or not owner-visible |
| `PLANNING_VERSION_CONFLICT` | 409 | stale expected version |
| `PLANNING_LIFECYCLE_INVALID` | 409 | command forbidden in current state |
| `PLANNING_CURRENCY_MISMATCH` | 409 | incompatible account/transaction/currency |
| `PLANNING_LEDGER_STATE_INVALID` | 409 | transaction is not eligible/confirmed |
| `PLANNING_TRANSACTION_DUPLICATE` | 409 | active domain effect already links transaction |
| `PLANNING_ALLOCATION_INVALID` | 409 | sum/item/remainder/prepayment invariant failed |
| `PLANNING_PROGRESS_INSUFFICIENT` | 409 | withdrawal exceeds derived progress |
| `PLANNING_REVIEW_REQUIRED` | 409 | ambiguous match requires explicit review |
| `PLANNING_RATE_LIMITED` | 429 | bounded abuse control rejected request |
| `INTERNAL_ERROR` | 500 | safe generic unexpected failure |

Authorization failures retain existing 401/403 envelope semantics and do not
reveal whether another user's object exists.
