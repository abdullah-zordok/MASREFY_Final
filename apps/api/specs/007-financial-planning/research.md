# Phase 07 Financial Planning Research

## Sources Reviewed

- `apps/api/.specify/memory/constitution.md` (2.0.0)
- Phase 07 and global architecture sections of
  `docs/Back end/BACKEND_MASTER_PLAN.md`
- Phase 05 ledger and Phase 06 sync migrations, API modules, workers, tests, and
  Spec Kit artifacts
- `apps/mobile/src/domain/financial-planning.ts`
- `apps/mobile/src/services/contracts/financial-planning-service.ts`
- `apps/mobile/src/storage/financial-planning-repository.ts` and SQLite schema
- `apps/mobile/specs/007-financial-planning/*`
- current Admin route/module inventory

## Decisions

### Decision 1: Planning references ledger truth

**Decision**: Planning roots and links live in owned tables, while spend,
received salary, payment validity, savings transaction effects, and ledger
versions are derived from Phase 05 transactions/postings/projections.

**Rationale**: The Constitution makes postings the source of truth and forbids
parallel mutable balances. This also prevents obligation payments or savings
movements from being counted twice in budgets.

**Alternatives considered**: mutable paid/current/spent counters (rejected as
drift-prone); copied transaction payloads (rejected as stale/private).

### Decision 2: Reuse Phase 06 durable idempotency

**Decision**: API mutations hash their normalized request and use the existing
Phase 06 receipt/reservation/replay contract. Domain commands do not add a second
idempotency table.

**Rationale**: One durable contract already handles retries, concurrent claims,
same-key/different-payload rejection, and response replay.

**Alternatives considered**: per-domain operation tables (duplicate knowledge);
in-memory deduplication (not durable).

### Decision 3: Exact money at both boundaries

**Decision**: PostgreSQL stores `bigint` minor units. TypeScript parses HTTP
minor units as canonical decimal strings and converts database `int8` values to
strings in responses; internal safe-number conversion is limited to explicitly
validated Mobile adapter boundaries.

**Rationale**: JavaScript numbers cannot represent all PostgreSQL `bigint`
values. The current Mobile model uses safe integers, so the adapter rejects
values outside its current range rather than truncating them.

**Alternatives considered**: JSON numbers (precision loss); decimal/floating
money (forbidden); a new big-number dependency (unnecessary).

### Decision 4: Deterministic schedule generation

**Decision**: Schedule identity is `(obligation_id, sequence_no)`. Generation
locks one obligation, derives dates from immutable inputs, clamps month-end,
allocates the residual final fixed-term amount, inserts missing rows with a
unique constraint, and stops at the earlier of end date, installment count, or
an 18-month requested horizon.

**Rationale**: Stable natural keys make retries and crash recovery harmless.

**Alternatives considered**: cron-time random IDs without sequence uniqueness
(duplicates); a recurrence dependency/DSL (unneeded and unsafe).

### Decision 5: Explicit allocation, including prepayment

**Decision**: A payment request supplies explicit allocation rows and an
allocation intent. Normal schedule allocation cannot exceed each remaining
amount; any excess requires `prepayment` intent and is retained on the payment,
not silently assigned to hypothetical rows.

**Rationale**: This satisfies partial/multiple/prepayment cases without guessing
the customer's financial intent.

**Alternatives considered**: oldest-first implicit allocation (surprising for
overpayment); mutable obligation paid counter (drift).

### Decision 6: Advisory matches remain non-authoritative

**Decision**: Match jobs create proposal rows only. Acceptance is versioned and
then invokes the same validated payment path; confidence never bypasses owner
confirmation or ledger validation.

**Rationale**: Match confidence is evidence, not authorization.

**Alternatives considered**: confidence threshold auto-posting (forbidden);
embedding all candidate IDs in one JSON row (poor constraints/querying).

### Decision 7: Signed savings effects, derived progress

**Decision**: Contributions are positive, withdrawals negative, and adjustments
explicitly signed. Progress equals opening tracked minor units plus valid
movement effects. New movements require a confirmed owned compatible ledger
transaction; opening tracked amount is the only migration-only non-ledger base.

**Rationale**: A signed immutable movement ledger is simple to reconcile and
does not mutate account balances.

**Alternatives considered**: mutable current amount; unlinked post-cutover
movements that could diverge from financial activity.

### Decision 8: SQL views for shared derivation

**Decision**: Security-invoker views own the salary-cycle, budget-utilization,
and obligation-status derivations. API repositories query them with owner and
bounded period filters.

**Rationale**: Reports, API summaries, and reconciliation consume one
definition, while RLS remains effective.

**Alternatives considered**: duplicate TypeScript calculations; materialized
views before a measured need.

### Decision 9: Process-local cache is optional and version keyed

**Decision**: Implement the aggregate correctly without Redis. If load evidence
shows value, reuse a small process-local cache keyed by user, period, and ledger
version with TTL at most 60 seconds and event invalidation.

**Rationale**: The requested P95 can be proven with indexed SQL first. A version
key prevents cross-version stale results.

**Alternatives considered**: Redis (not authorized); cache keyed only by user
(cross-period/staleness risk).

### Decision 10: Existing worker/outbox infrastructure only

**Decision**: Register five planning jobs in the current worker module and reuse
bounded `FOR UPDATE SKIP LOCKED`, lease/fence, retry, outbox, shutdown, metrics,
and health patterns.

**Rationale**: No new queue framework is needed; existing patterns are already
tested and operated.

**Alternatives considered**: new job library or external queue (YAGNI).

### Decision 11: Contract parity now, live cutover later

**Decision**: Phase 07 provides an OpenAPI contract and a typed mapping to every
current Mobile financial-planning method/field. It may add a dormant adapter or
test fixture, but does not switch the active provider. Admin remains read-only.

**Rationale**: The Master Plan requires mock replacement readiness, while the
Constitution assigns production client cutover to Phase 14.

**Alternatives considered**: immediate live provider switch (ownership conflict);
ignoring current client fields (parity failure).

### Decision 12: Compressed Master Plan columns are expanded in-Spec

**Decision**: The eleven owned table names and relationships remain unchanged,
but the active data model includes the minimum lifecycle, direction, schedule,
allocation-intent, matching, and migration fields already required by executable
Mobile contracts. The Phase 07 Master Plan section will be corrected to link to
this authoritative column model.

**Rationale**: The Constitution says executable client contracts are factual
authority when descriptive documentation is stale. This is a field-completeness
correction, not an ownership change.

**Alternatives considered**: opaque JSON payloads (weak constraints); dropping
current workflows (fails acceptance); new tables (unnecessary).

### Decision 13: Forward-only rollback preserves planning history

**Decision**: Rollback disables routes/jobs/writes and reverts any dormant
adapter, while rows remain intact and ledger tables are untouched. Schema faults
use a new corrective migration after backup/restore and reconciliation.

**Rationale**: Destructive rollback would break auditability and linked history.

**Alternatives considered**: down migration dropping planning tables (rejected).

### Decision 14: No clarification question is material

**Decision**: Proceed without an interactive clarification round.

**Rationale**: The user approved the complete Phase 07 objective; the Master
Plan fixes ownership/APIs/jobs/thresholds; the Constitution fixes trust and
delivery rules; executable Mobile contracts fix field/behavior parity. Remaining
choices are implementation details resolved above.

**Alternatives considered**: asking the user to restate decisions already fixed
by authoritative artifacts (unnecessary delay).

## Rejected Scope

- No direct ledger/posting/balance mutation from planning.
- No auto-accepting matches, Last Write Wins, or keep-both financial conflicts.
- No report generation, notification delivery, import parsing, AI/voice
  execution, provider integration, Redis, recurrence DSL, or Admin mutation.
- No production Mobile/Admin provider switch before Phase 14.
- No branch, worktree, push, merge, rebase, or PR.
