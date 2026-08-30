# Phase 05 Research and Decisions

**Spec**: SPEC-BE-005
**Date**: 2026-08-30
**Base**: `dfed012743ca0c3c5f760e7b2439dbc0dae9c825`

All planning unknowns are resolved. External-only evidence gaps are retained as
evidence status, not converted into technical uncertainty.

## R1 — Dependency readiness

**Decision**: Consume the released SPEC-BE-001, 003, and 004 contracts and the
locally executable SPEC-BE-002 Clerk principal/active-profile/RLS contract.

**Rationale**: Fresh baseline verification passes and the required database/API
objects exist. SPEC-BE-002's remaining Apple Team ID, protected Phone identities,
hosted owner/non-owner proof, provider rehearsal, and some release evidence do
not change the local Clerk-sub or RLS interfaces used by Phase 05.

**Alternatives considered**:

- Block all Phase 05 work on external identity evidence: rejected because no
  local implementation dependency is missing and the user explicitly required
  external-only gaps to remain non-blocking unless genuinely preventative.
- Reimplement identity/Admin/reference checks in the ledger module: rejected as
  duplicate authority and an ownership violation.

## R2 — Module and transaction boundary

**Decision**: Add one concrete `ledger` NestJS module. Controllers/services own
HTTP validation, normalization, rate-limit calls, metrics, and safe error mapping.
One repository owns principal-scoped database transactions and calls the guarded
SQL functions. Financial invariants are enforced again inside SQL after locks.

**Rationale**: This follows the existing identity/security/reference flow and
keeps all financial effects inside one PostgreSQL transaction. It uses the
existing pool, Clerk principal, active-profile, audit, outbox, observability, and
safe exception contracts with no new dependency or generic framework.

**Alternatives considered**:

- Implement money arithmetic only in TypeScript: rejected because database
  callers, concurrency, constraints, and atomic audit/outbox would not share one
  authoritative invariant boundary.
- Add a generic command bus/unit-of-work abstraction: rejected because one
  ledger module and one concrete repository need no additional indirection.
- Expose generic RPC execution: rejected because it would create a dynamic
  financial write path and weaken allowlisting.

## R3 — Forward-compatible idempotency

**Decision**: Deliver the exact Phase 06 `private.idempotency_keys` shape first,
plus lookup, claim, and complete functions returning
`new|replay|in_progress|hash_mismatch`. Normalize each DTO to a fixed-key command
object, recursively sort plain-object keys, hash its JSON bytes with Node's
built-in SHA-256, and hash the raw key before storage. Claim, command, safe
response storage, audit, and outbox complete in one transaction.

**Rationale**: Sorted normalized objects make `JSON.stringify` deterministic
without a canonical-JSON dependency or caller property-order assumption. A
non-mutating lookup returns completed responses before business gates; the
transactional claim still resolves races. Completed replays survive process restarts
and ambiguous client responses. The table/function signature is already defined
by Phase 06, so later sync work can reuse the rows unchanged.

**Alternatives considered**:

- In-memory map: rejected because replicas/restarts lose replay state.
- Store raw keys: rejected as unnecessary sensitive data.
- Add a third-party canonical JSON library: rejected because a small recursive
  plain-object sort covers the bounded normalized DTO shapes.
- Implement cleanup/sync/conflicts now: rejected as Phase 06 scope.

## R4 — Locking and ledger version

**Decision**: Acquire a transaction-scoped per-user advisory lock first, then lock
affected accounts and target/dependent transactions in ascending UUID order. The
next user ledger version is `max(account_balances.ledger_version)+1` while the
per-user lock is held and is written to each touched balance row.

**Rationale**: This is the smallest design that provides a monotonic user-visible
ledger version without a fifth Phase 05 table, prevents same-user version races,
and gives one universal lock order for opposite transfers/refund/reversal races.
The advisory hash collision consequence is extra serialization, not incorrect
money.

**Alternatives considered**:

- Only account row locks: rejected because no monotonic user ledger version can
  be allocated safely across disjoint accounts without another counter resource.
- Global sequence: rejected because exposed gaps leak unrelated global activity.
- New `user_ledger_versions` table: rejected as an undocumented extra table.
- Distributed lock/Redis: rejected; PostgreSQL already owns the transaction.

**Known ceiling**: Same-user writes serialize. Keep the per-user lock unless
production-like evidence shows the Phase 05 P95/P99 budget cannot be met; only
then design a per-account version/counter change with equivalent correctness.

## R5 — Immutable corrections

**Decision**: Never update/delete postings. A financial revision computes the
difference between the current active effect and requested effect, then appends
only compensating/delta postings. Delete appends the inverse active effect;
restore appends the restoring effect. Refund and reversal are linked headers with
new postings.

**Rationale**: The sum of all postings for a transaction remains its current
effective contribution while every historical change remains reconstructable.
No extra posting revision/batch column is needed because the revision snapshots
and ordered posting creation times preserve command history.

**Alternatives considered**:

- Update old postings: rejected by the immutable source-of-truth rule.
- Mark old postings inactive: rejected because the Master Plan contains no
  lifecycle column and inactive flags weaken append-only truth.
- Create a replacement transaction for every edit: rejected because it changes
  the stable transaction identity expected by current clients.

## R6 — Transaction shapes

**Decision**:

- Income: one positive destination posting.
- Expense: one negative source posting.
- Transfer: negative source, positive destination, and optional negative fee
  posting (default fee account is source).
- Opening: one signed posting created only with account creation; zero opening
  creates no header.
- Refund: one positive posting linked to a confirmed active expense; active
  refund sum cannot exceed original amount.
- Reversal: postings negate the original's complete active effect, including fee;
  one active full reversal per original.
- Adjustment transaction kind is retained for schema/future internal compatibility
  but no standalone public adjustment endpoint is added. Revision postings use
  the `adjustment` role.

**Rationale**: These are the Master Plan effects and current requested scope. The
standalone adjustment UI/contract is incomplete and was not requested; adding an
endpoint would be speculative.

## R7 — Account opening handoff

**Decision**: Refactor the concrete reference repository just enough to expose a
principal-scoped transaction and account-create-in-transaction method. The
reference service composes its owned account insert/audit/outbox with the ledger
repository's opening command on the same `PoolClient`. Phase 04 still owns account
validation and insertion; Phase 05 owns only the opening header/posting/balance.

**Rationale**: This preserves ownership and guarantees no account exists without
its requested opening entry. It avoids a cross-owned SQL function inserting an
account and avoids circular NestJS modules.

**Alternatives considered**:

- Ledger SQL inserts `public.accounts`: rejected as Phase 04 ownership violation.
- Create account, then opening in a second transaction: rejected as partial-state
  risk.
- Interface/factory for a single opening implementation: rejected as boilerplate.

## R8 — Mobile fields and Master Plan drift

**Decision**: Add bounded `title` and nullable `payment_method` columns/contracts
to the Phase 05 Master Plan and schema. They are metadata, never authorization or
payment credentials. Keep `merchant` and `note` separate.

**Rationale**: The current executable Mobile entity requires both fields and the
Master Plan explicitly forbids silently discarded input fields. Folding title or
payment method into notes would lose semantics. The authoritative plan was
corrected before schema implementation.

**Alternatives considered**:

- Return computed/null fields without storage: rejected because round-trip
  compatibility and edits would be lossy.
- Store them in JSON: rejected because JSON is not a substitute for relational
  fields and would weaken allowlists/indexing.

## R9 — Reads, cursor and search

**Decision**: Use `(occurred_at DESC,id DESC)` opaque keyset cursors, bounded
filters, owner/account joins through indexed postings, and a native PostgreSQL
full-text expression GIN index over title and merchant for bounded token-prefix
search. Details fetch one header plus postings and revision metadata in bounded
queries. No N+1 or offset pagination is used for ledger pages.

**Rationale**: Keyset pagination is stable for append-heavy data. Native full-text
search avoids a new extension/dependency and supports Arabic/English simple token
matching. The compatibility manifest records that SPEC-BE-014 must test the live
adapter's query normalization against the current local substring behavior.

**Alternatives considered**:

- Offset pagination: rejected for duplicate/omission risk under concurrent writes.
- `ILIKE '%query%'` without index: rejected as an unbounded scan.
- `pg_trgm`: rejected because Phase 01 owns extension policy and token search
  satisfies the documented backend route without adding an extension.

## R10 — Authorization boundary

**Decision**: Customer owner reads and all writes use the verified Clerk sub,
active-profile assertion, forced RLS, minimum grants, and function checks. Every
Admin/support role is denied raw ledger rows and all financial commands. No Phase
03 support-scope or permission definition is modified.

**Rationale**: Current Admin code exposes aggregate counts and explicitly rejects
raw financial rows. Adding detail endpoints would be speculative and would mutate
the Phase 03 hard-coded support authorization contract.

**Alternatives considered**:

- Reuse `account-status/read-aggregate` for transaction detail: rejected as scope
  escalation.
- Duplicate support-grant logic in Phase 05: rejected as separate Admin authority.
- Add a new permission/scope now: rejected because no current Admin client
  requires it and SPEC-BE-003 owns that policy.

## R11 — Rate limits and recent authentication

**Decision**: Reuse `SecurityRepository.consumeRateLimit` for a dedicated
per-user `ledger-mutation` category before opening the money transaction. Parse
an optional bounded `MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS` manifest of unique
`CURRENCY:positiveMinor` entries at startup. When a command's absolute active
effect reaches its currency threshold, reuse the Clerk principal factor age and
`MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS`; missing/stale evidence fails closed.
Reads remain bounded by page/query limits and platform timeout controls.

**Rationale**: The existing security-event/advisory-lock limiter is durable,
auditable, and adds no table/dependency. Currency-specific minor-unit thresholds
avoid comparing unlike currencies. Counting failed attempts outside the
financial transaction is desired abuse evidence.

**Alternatives considered**:

- In-process limiter: rejected across replicas/restarts.
- Redis: rejected without measured need.
- No financial-specific rate limit: rejected by the Master Plan security baseline.

## R12 — Reconciliation

**Decision**: The worker calls one bounded SQL function per claimed account batch,
ordered by account UUID and protected by `SKIP LOCKED`/short leases where
applicable. It compares independent posting sums with the projection, sets
`reconciled_at` only on a match, emits one safe discrepancy event/metric on a
difference, and never changes money.

**Rationale**: Bounded batches prevent long locks and memory growth. Explicit
non-repair preserves incident evidence and prevents a broken worker from silently
changing customer balances.

**Alternatives considered**:

- Full-table scan: rejected as unbounded.
- Automatically overwrite the projection: rejected because unexplained drift is
  a release/security incident.
- New durable job tables: rejected; SPEC-BE-013 owns job inventory and the
  existing worker lifecycle is sufficient for the Phase 05 owned job.

## R13 — Migrations and release order

**Decision**: Four additive migrations: idempotency prerequisite; ledger tables/
indexes; functions/triggers/view; RLS/grants/write gate. Four pgTAP files follow
the existing numbering. Reads/reconciliation deploy before financial writes;
account opening is enabled last. Rollback is previous image plus forward SQL.

**Rationale**: This makes write enablement structurally dependent on every trust
boundary and preserves N-1 compatibility. No destructive rollback can erase
financial history.

**Alternatives considered**:

- One monolithic migration: rejected because prerequisite/write-gate review and
  failure recovery become opaque.
- Reversible DROP migration: rejected for immutable ledger history.

## R14 — Evidence and external gaps

**Decision**: Treat local default-suite skips as explicit environment gates and
run database/container/performance suites separately when prerequisites exist.
Push only after local gates pass, then collect exact commit/tag CI, image, SBOM,
scan, signature, provenance and attestation evidence. Preserve upstream Phase 02
external gaps without reclassifying them.

**Rationale**: The Constitution requires fresh named evidence and forbids inferred
passes. Phase 04 demonstrates the existing release workflow can generate all
required immutable artifacts.

**Alternatives considered**:

- Count skipped tests as pass: rejected.
- Block local implementation on unrelated protected identities: rejected unless
  a Phase 05 acceptance case genuinely needs them.
