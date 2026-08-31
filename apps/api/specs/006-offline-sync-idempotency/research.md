# Research: SPEC-BE-006 Offline Sync, Idempotency & Conflict Resolution

## R1 — Durable idempotency handoff

**Decision**: Evolve `private.idempotency_keys` additively. Add an opaque lease
token/fence and bounded cleanup support; keep actor/scope/key uniqueness, request
hash, stored status/body/resource, states, and 30-day expiry. Existing Phase 05
lookup/claim/complete calls remain compatible. New sync code completes with the
lease token; the existing same-transaction completion path is retained through a
compatibility wrapper tied to its transaction-local claim.

**Rationale**: A token prevents a stale worker from completing after lease
reclaim. Reusing the bridge preserves already-proven financial replay and avoids
a competing system.

**Alternatives considered**: New table (forbidden duplication); process-local
lock/cache (not durable); row lease without fencing (stale completion race).

## R2 — Cursor and change-log storage

**Decision**: Use the existing private outbox as the immutable sync change log.
A Phase 06-owned `BEFORE INSERT` trigger reserves and adds a `sync` metadata
object only for an explicit allowlist of Phase 04/05 owner events. Under a
transaction advisory lock keyed by user/domain, the trigger allocates
`max(cursor)+1`, captures an immutable owner-safe snapshot or tombstone, and adds
it to the same outbox row. A partial expression index supports
`userId/domain/cursor` keyset reads and uniqueness. Caller-supplied `sync`
metadata is rejected.

**Rationale**: The Master Plan authorizes only four Phase 06 tables and explicitly
requires sync-visible domain events to carry cursors in outbox payloads. This
keeps commit/change visibility atomic and supports direct online domain routes as
well as offline mutation dispatch.

**Alternatives considered**: Fifth `sync_changes` table (unauthorized); global
sequence (leaks cross-tenant activity); table scans using timestamps (not stable
or tombstone-safe); `client_mutations` alone (misses direct online writes).

## R3 — Snapshot and tombstone semantics

**Decision**: Capture the immutable, owner-safe resource projection at the time
the domain outbox event is inserted. Deletions capture only type, ID, version,
and `deletedAt`. Delta reads the stored projection, never the current row, so an
unacknowledged page repeats byte-equivalent change data.

**Rationale**: Joining current rows during delta would make a repeated cursor page
change after later writes and would lose deleted data.

**Alternatives considered**: Fetch current row at read time (non-deterministic);
store only resource IDs (cannot replay historical state); hard delete (forbidden).

## R4 — Cursor acknowledgement

**Decision**: `client_sync_state.last_cursor` is the acknowledged cursor for one
user/device/domain. Server latest is the indexed maximum outbox cursor for the
same user/domain. Delta accepts cursor equal to the stored ack or a page cursor
issued after it; ack uses a locked compare-and-set that permits only forward,
previously issued, owner/device/domain-bounded progress. Page results include
`fromCursor`, `nextCursor`, and `serverCursor`.

**Rationale**: Separating acknowledged progress from server latest prevents data
loss and uses the exact Master Plan table without a counter table.

**Alternatives considered**: Update ack on pull (loses unapplied data); per-device
server counters (different order across devices); OFFSET pagination (unbounded).

## R5 — Mutation durability and partial batches

**Decision**: Persist each validated envelope under unique `(user_id,
operation_id)` before dispatch. Batches are protected by the evolved idempotency
record, but each operation is independently replayable. Operations run in a
validated topological order; response order remains input order. Unrelated
failures do not roll back successful operations. A retry reconstructs terminal
results and processes only received/retryable rows.

**Rationale**: One database transaction across up to 100 domain commands would
hold locks too long and cannot safely span current command boundaries. Per-item
durability makes crash recovery explicit while domain idempotency guarantees no
duplicate financial write.

**Alternatives considered**: All-or-nothing batch (long locks and poor recovery);
memory-only batch state (lost on crash); blind re-execution (duplicate risk).

## R6 — Mutation worker leases and states

**Decision**: Add only the operational fields required by the explicit worker
contract to `client_mutations`: `attempt_count`, `next_attempt_at`, `locked_by`,
`locked_until`, and `lease_token`. Keep blueprint business states
`received/processing/applied/conflict/rejected`; terminal exhaustion is
`rejected` with `SYNC_RETRY_EXHAUSTED`, while transient work returns to
`received`. Claims use one atomic `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP
LOCKED)` with bounded limit and fence.

**Rationale**: The user requires lease/concurrency/dead-letter safety. These
columns are the minimum durable implementation; a generic job table belongs to
SPEC-BE-013 and is not created early.

**Alternatives considered**: Hold a transaction during domain execution (long
locks); add generic job tables (later-Spec violation); encode lease in JSON
(weak constraints/indexes).

## R7 — Domain handler registration

**Decision**: A static, versioned in-code registry admits only Phase 04/05
resource/operation/schema combinations. Each handler validates its typed payload
and invokes the existing service command with the stable operation ID. Unknown
or later-domain envelopes reject before persistence/dispatch. No reflection,
dynamic imports, configurable SQL, or factory layer is added.

**Rationale**: Explicit routing is auditable, testable, and meets Ponytail/YAGNI.

**Alternatives considered**: Database-configured registry (speculative state);
dynamic SQL (security failure); one interface/factory per handler (boilerplate).

## R8 — Financial conflict policy

**Decision**: A stale ledger mutation creates one `transaction_conflicts` row
per transaction/client mutation and marks the mutation `conflict`. Safe snapshots
preserve both inputs and allowed changed fields. `server` or `reject` closes
without money mutation. `client`/`merged` require a new corrected command against
the current version and new operation ID. `keep_both` is rejected for financial
records and confirmed duplicates. Resolution is idempotent, version checked,
audited, and sync-visible.

**Rationale**: This directly enforces the Constitution's no-LWW rule and avoids
making snapshot JSON an alternate write path.

**Alternatives considered**: LWW (forbidden); arbitrary JSON merge (unsafe);
update the existing transaction from snapshot (bypasses ledger commands).

## R9 — RLS, grants, and security-definer functions

**Decision**: Enable and FORCE RLS on all public Phase 06 tables. Grant owners
`SELECT` only where required; revoke direct writes. Ownership policies compare
indexed `user_id` to `(select public.current_clerk_user_id())`. Private functions
use `SECURITY DEFINER SET search_path=''`, schema-qualified names, explicit
active-profile/device/owner checks, and revoked `PUBLIC` execution; only named
API/worker roles receive execute. Private idempotency also uses FORCE RLS as
defense in depth.

**Rationale**: Current Supabase guidance treats grants and RLS as separate gates,
warns that definer functions bypass RLS, and requires fixed search paths and
explicit execution restrictions.

**Alternatives considered**: `TO authenticated` without ownership (BOLA);
application-only checks; broad service-role access; public definer RPCs.

## R10 — Retention and cleanup

**Decision**: Default replay/tombstone/conflict evidence window is 30 days,
matching the Phase 05 expiry. Cleanup selects bounded expired terminal batches
with `SKIP LOCKED`; active claims, open conflicts, pending mutations, currently
supported cursor ranges, and held evidence are excluded. Resolved conflict
snapshots are minimized before row expiry. `client_sync_state` for a long-revoked
device is deleted only after all queued work and retention windows close.

**Rationale**: Shorter retention breaks retry/offline recovery; indefinite raw
snapshots violate minimization.

**Alternatives considered**: Immediate cleanup (data loss); indefinite retention
(privacy/storage); cron delete without lease/bounds (contention).

## R11 — Mobile SQLite upgrade

**Decision**: Add schema migration 10 with three local tables:
`sync_state`, `sync_mutation_queue`, and `sync_resource_ids`. Reuse existing
`finance_sync_conflicts` for conflict display and existing domain tables for
projections. Never rewrite primary keys; map stable local IDs to server UUIDs.
Page application, tombstones, mapping, queue acknowledgement, and cursor update
run in one exclusive SQLite transaction. Legacy `REAL` conversion uses decimal
text validation and exact minor-unit arithmetic; unsafe values remain in review.

**Rationale**: Mapping avoids cascading destructive rewrites of the existing
foreign-key graph. Three small local tables are the minimum cross-resource sync
metadata missing from schema v9.

**Alternatives considered**: Wipe/reseed (forbidden); rewrite local PKs (unsafe);
reuse transaction-only `finance_operations` for all resources (cannot represent
accounts/categories); in-memory cursor/queue (lost on restart).

## R12 — Supabase and PostgreSQL operational choices

**Decision**: Discover the pinned CLI with `--help`; create migrations with
`supabase migration new`; use repository checksum tooling; run `db lint`, pgTAP,
and advisors if supported. Use keyset cursor queries, equality-first composite
indexes, partial indexes for active/retryable states, FK indexes, short
transactions, advisory transaction locks for cursor allocation, `SKIP LOCKED`
for workers, and `EXPLAIN (ANALYZE, BUFFERS)` on production-like data.

**Rationale**: These are the current official Supabase/Postgres patterns and
match existing repository primitives.

**Alternatives considered**: Guess CLI commands; OFFSET; separate indexes for
multi-column hot paths; JSON-only operational fields; long worker transactions.

## R13 — Current Supabase compatibility

**Decision**: Do not rely on automatic Data API exposure, GraphQL, Realtime, or
gateway-specific behavior. Public tables receive explicit minimum grants and
RLS; write functions remain private. The local stack version is authoritative for
migration/test behavior. The design remains PostgreSQL 15/17 compatible and does
not use removed extensions or version-pinned extension syntax.

**Rationale**: The 2026 changelog changes public-table exposure and self-hosted
Postgres defaults; neither should silently alter the security contract.

**Alternatives considered**: Assume historical automatic grants/exposure or a
specific cloud database version.
