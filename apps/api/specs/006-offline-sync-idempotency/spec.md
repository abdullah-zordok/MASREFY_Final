# Backend Feature Specification: Offline Sync, Idempotency & Conflict Resolution

**Phase / Spec**: Phase 06 / SPEC-BE-006 of 014
**Working Branch**: `main`
**Feature Directory**: `apps/api/specs/006-offline-sync-idempotency`
**Base Revision**: `3e685e0a19cfa6854c15728b47854ce74be7391e`
**Created**: 2026-08-31
**Status**: Complete — locally verified and ready for direct-main commit
**Input**: "Fully complete Phase 06 — SPEC-BE-006: Offline Sync, Idempotency & Conflict Resolution."

## Objective and Scope

Provide Masarifi's only durable client synchronization and mutation-replay
contract. Authenticated Mobile devices can bootstrap their local projection,
submit bounded offline mutations, resume incremental pulls, acknowledge durable
local application, receive tombstones, and inspect or resolve version conflicts
without losing existing SQLite data or duplicating financial effects.

This phase evolves the Phase 05 `private.idempotency_keys` bridge in place. It
owns the sync protocol, per-device/domain progress, mutation inbox, explicit
transaction conflicts, cleanup/retry workers, strictly required Mobile sync
adapters, observability, and operations evidence. Existing domain commands
remain the only writers of accounts, categories, transactions, postings,
balances, revisions, audit records, and domain outbox events.

SPEC-BE-006 does not add later product domains, replace all Mobile mocks, make
Admin an offline client, create a second idempotency store, or implement
SPEC-BE-007 or later resources.

## Dependencies and Repository Baseline

- **Prior Specs**: Programmatic contracts from SPEC-BE-001 through SPEC-BE-005
  are present on `main`: platform/outbox/migrations, Clerk profiles/devices,
  RBAC/audit, accounts/categories, and atomic ledger commands.
- **Baseline**: `main` and `origin/main` resolve to
  `3e685e0a19cfa6854c15728b47854ce74be7391e` with no divergence. The untracked
  `.agents/plugins/` tree is user-owned and excluded.
- **Idempotency bridge**: `20260830080000_phase05_idempotency_bridge.sql`
  supplies actor/scope/key uniqueness, request hash, stored response, lease,
  state, and lookup/claim/complete behavior. Phase 06 preserves every replay.
- **Financial safety**: SPEC-BE-005 commands already prove atomic posting,
  deterministic locks, versions, audit/outbox, and idempotent replay. Sync calls
  those commands and never writes financial tables directly.
- **Mobile baseline**: `masarifi.db` schema version 9 contains user data and
  projections, non-UUID legacy IDs, `REAL` legacy offline amounts, operations,
  drafts, and conflicts. Upgrade is additive and retains every row.
- **Historical evidence**: SPEC-BE-002 records external Apple/provider,
  protected-token load, and tag-only gaps. Required local identity/device/RLS
  contracts are present; external evidence is documented, not treated as a
  programmatic blocker or falsely reported as passing.
- **Governing documents**: Backend Constitution 2.0.0 and complete Backend Master
  Plan. The user's no-push instruction supersedes the Constitution's remote
  action for this goal; fresh remote evidence remains an explicit gap.

## Owned Resources

| Resource type         | Owned resources                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Database tables       | evolved `private.idempotency_keys`; new `public.client_mutations`, `public.client_sync_state`, `public.transaction_conflicts`        |
| Functions             | idempotency lookup/claim/complete/cleanup; cursor allocation; mutation dispatch; conflict lifecycle/resolution; worker claim helpers |
| Trigger/index objects | lifecycle guards and Phase 06 sync-change capture/lookup indexes over the existing private outbox                                    |
| APIs                  | `/api/v1/sync/bootstrap`, `/delta`, `/mutations`, `/ack`; `/api/v1/conflicts` list/detail/resolve                                    |
| Jobs                  | `idempotency.cleanup`, `sync-mutations.retry`, `sync-state.cleanup`, `conflicts.expire`                                              |
| Events                | `sync.mutation_applied`, `sync.mutation_rejected`, `sync.cursor_advanced`, `conflict.opened`, `conflict.resolved`                    |
| Mobile persistence    | additive cursor, mutation-envelope, and local/server-ID mapping storage plus adapters over existing projections/conflicts            |
| Operations            | logs, metrics, alerts, health/readiness contribution, cleanup/migration/rollback/recovery runbooks                                   |

The outbox remains owned by SPEC-BE-001; audit/RBAC by SPEC-BE-003;
accounts/categories by SPEC-BE-004; financial resources and commands by
SPEC-BE-005. Phase 06 attaches only its documented change-capture contract and
does not add another event store.

## User Scenarios and Testing

### User Story 1 - Retry a Mutation Safely (Priority: P1)

As a Mobile user on an unreliable connection, I can retry the same operation
after timeout or interruption and receive its original result without a second
financial effect.

**Why this priority**: Duplicate financial writes are release-blocking.

**Independent Test**: Submit an identical transaction operation concurrently,
after timeout, and after worker redelivery; verify one ledger effect and the same
stored response. Reuse the key with a changed payload and verify rejection.

**Acceptance Scenarios**:

1. **Given** a completed operation, **When** the same actor, scope, key, and
   normalized request replay, **Then** the original status/body/resource is
   returned and no domain command runs again.
2. **Given** a known key, **When** its normalized request differs, **Then**
   `IDEMPOTENCY_KEY_REUSED` returns with no business effect.
3. **Given** two workers race, **When** both process one operation, **Then** one
   owns the fenced lease and the other replays, waits, or safely retries.

### User Story 2 - Bootstrap Without Losing Local Data (Priority: P1)

As an existing Mobile user, I can upgrade and initialize synchronization without
wiping drafts, pending mutations, history, conflicts, or encrypted projections.

**Independent Test**: Upgrade a populated version-9 database containing legacy
IDs and `REAL` amounts; bootstrap in pages; verify all rows remain and invalid
legacy values enter explicit review rather than being changed or dropped.

**Acceptance Scenarios**:

1. **Given** a supported legacy SQLite database, **When** migration runs,
   **Then** only additive schema changes occur and all rows remain.
2. **Given** a valid legacy financial row, **When** prepared for upload, **Then**
   its amount converts exactly to minor units and its local/server ID mapping is
   durable.
3. **Given** an unsafe legacy row, **When** import reaches it, **Then** it remains
   local with a safe review reason and is not confirmed as money.

### User Story 3 - Resume Incremental Synchronization (Priority: P1)

As a Mobile user, I can resume from each device/domain checkpoint and download
only ordered changes after bootstrap.

**Independent Test**: Bootstrap 100,000 resources, interrupt a 500-change page,
restart, repeat and apply it idempotently, acknowledge, and continue without
gaps, duplicate effects, or cross-user leakage.

**Acceptance Scenarios**:

1. **Given** no checkpoint, **When** bootstrap runs, **Then** bounded reference
   and domain pages plus starting cursors return deterministically.
2. **Given** an acknowledged cursor, **When** delta runs, **Then** only later
   owner-visible changes for that device/domain return in stable order.
3. **Given** local apply failed before acknowledgement, **When** retried, **Then**
   repeat records are safe and the durable cursor did not advance.
4. **Given** a stale, malformed, foreign-device, future, or wrong-domain cursor,
   **When** submitted, **Then** it fails without leaking activity.

### User Story 4 - Propagate Deletions (Priority: P1)

As a user with multiple devices, a server-confirmed deletion reaches every
device and cannot resurrect stale local data.

**Independent Test**: Delete, sync, retry an older update, and sync a second
device; verify the tombstone wins unless an explicit restore succeeds against
the current version.

**Acceptance Scenarios**:

1. **Given** a sync-visible deletion, **When** delta runs, **Then** it returns
   only resource ID, type, version, and deletion time.
2. **Given** an older local mutation, **When** submitted after the tombstone,
   **Then** it conflicts/rejects and does not recreate the record.
3. **Given** the maximum offline window, **When** cleanup runs, **Then** required
   tombstones remain available through that window.

### User Story 5 - Review Financial Conflicts Explicitly (Priority: P1)

As a user editing one transaction on multiple devices, I can inspect both inputs
and choose an authorized deterministic outcome; money is never silently LWW.

**Independent Test**: Update one transaction from two devices at one base
version; verify one succeeds, the other creates one redacted conflict, and
repeated resolution produces one audited outcome.

**Acceptance Scenarios**:

1. **Given** a stale financial version, **When** processed, **Then** one open
   conflict preserves safe server/client evidence without applying the stale write.
2. **Given** an owner conflict, **When** listed or inspected, **Then** only safe
   fields and allowed resolutions are visible.
3. **Given** an authorized resolution, **When** replayed, **Then** the same result
   returns without another financial effect or audit duplication.
4. **Given** financial `keep_both`, **When** requested, **Then** it is rejected;
   correction requires a new validated command and operation ID.

### User Story 6 - Operate and Recover Workers (Priority: P2)

As an operator, I can observe backlog, lag, retries, cleanup, conflicts, and
terminal outcomes and safely stop or redeliver work.

**Independent Test**: Inject crashes, expired leases, repeated failures, cleanup
races, and shutdown; verify recovery, bounded retries, terminal visibility, and
no duplicate effects.

### Edge Cases

- Duplicate operation IDs, dependency cycles, unsupported domain/resource/schema
  versions, oversized payloads, or more than 100 mutations.
- Two devices submit one operation ID with identical or different payloads.
- A completed response is missing/corrupt or its resource later changes.
- A stale worker tries to complete after its lease was reclaimed.
- Ack moves backward, skips unseen work, uses a foreign device/domain, or exceeds
  current server state.
- A change commits between page selection and response; it appears only after the
  returned boundary.
- Multiple versions accumulate before reconnect; ordering stays deterministic.
- Cleanup and an oldest-supported-device pull race at retention expiry.
- Device revocation occurs between authentication and execution.
- Direct table writes, forged device ownership, cross-tenant access, arbitrary
  handler selection, or dynamic SQL are attempted.
- Mobile loses power between page apply/cursor persistence or queue/ack updates.
- Legacy money is not exactly representable as a safe minor-unit integer.

## Key Entities

- **Idempotency record**: actor/scope/key identity, request hash, fenced lease,
  immutable completed response, expiry, and cleanup eligibility.
- **Client mutation**: user/device envelope, payload identity, processing state,
  result/error, cursor association, and retry evidence.
- **Client sync state**: owner/device/domain acknowledged cursor and last
  acknowledged mutation checkpoint.
- **Transaction conflict**: transaction/mutation pair, compared versions/fields,
  redacted snapshots, state, resolution, actor, and time.
- **Sync change**: private ordered outbox event delivering one owner/domain
  resource version or tombstone without a competing source-of-truth table.
- **Mobile sync metadata**: local cursor, queued envelope, and stable local/server
  resource-ID mapping layered over existing projections.

## Functional Requirements

- **FR-001**: Evolve the existing idempotency table while preserving all Phase
  05 uniqueness, hashes, response replay, and financial behavior.
- **FR-002**: Identical completed requests return the exact stored safe response
  without re-executing effects; changed requests reuse no key.
- **FR-003**: Same-key/different-request reuse fails deterministically with zero
  domain, audit, outbox, conflict, or acknowledgement effect.
- **FR-004**: Claims, fenced leases, completion, expiry, reclaim, and cleanup are
  concurrency-safe; stale owners cannot complete newer claims.
- **FR-005**: Completed financial replay and tombstone evidence remain at least
  through the documented maximum offline/retry window.
- **FR-006**: Cleanup is bounded, leased, observable, skips active/held records,
  and has deterministic retention/expiration behavior.
- **FR-007**: Bootstrap returns bounded deterministic pages, server time,
  reference versions, and domain cursors without normal later full downloads.
- **FR-008**: Delta returns at most 500 owner-visible ordered changes with a
  stable next cursor and `hasMore` boundary.
- **FR-009**: Cursors are opaque, monotonic, scoped to user/device/domain,
  resumable, non-enumerating across tenants, and ack only forward after local
  durability.
- **FR-010**: Sync change capture uses the existing private outbox and creates no
  competing durable change-log table.
- **FR-011**: Each sync event preserves owner/domain cursor, resource type/ID,
  operation, version, and safe snapshot or tombstone for deterministic replay.
- **FR-012**: Tombstones contain only ID/type/version/deleted time, survive the
  offline window, and prevent stale resurrection.
- **FR-013**: Mutation batches contain 1–100 allowlisted envelopes, preserve
  response order, isolate unrelated failures, and reject cycles/references.
- **FR-014**: Each envelope validates operation ID, device, domain, resource,
  base version, operation, schema version, payload shape/size, and ownership.
- **FR-015**: Dispatch uses an explicit versioned handler registry and existing
  domain commands; generic dynamic SQL and direct ledger writes are forbidden.
- **FR-016**: Retries, timeouts, crashes, redelivery, and concurrent devices
  produce at most one financial effect per operation.
- **FR-017**: Partial batch results are durable/resumable; replay reconstructs
  completed operations and continues only unfinished work.
- **FR-018**: Ack is retry-safe and local queued work is removed only when server
  result, local application, and cursor persistence are durable together.
- **FR-019**: Financial version mismatch creates at most one explicit conflict
  and never applies Last Write Wins.
- **FR-020**: Conflicts preserve redacted server/client snapshots, versions,
  fields, source mutation, state, actor, and audit evidence.
- **FR-021**: Conflict list/detail/resolve enforce owner/tenant isolation,
  bounded pagination, expected versions, idempotency, and stable errors.
- **FR-022**: Financial resolution is server/reject or a new validated corrected
  command; `keep_both` is never an automatic money resolution.
- **FR-023**: Resolution is deterministic, idempotent, audited, emits sync/outbox
  evidence, and rejects incompatible repeats.
- **FR-024**: Owner read-only access applies to sync state/mutations/conflicts;
  direct writes are revoked and FORCE RLS is enabled.
- **FR-025**: Idempotency/worker internals remain private with no anon,
  authenticated-client, Admin, or broad service-role direct access.
- **FR-026**: Security-definer functions use fixed search paths, bounded inputs,
  active-user/device/ownership checks, least execute grants, and no dynamic names.
- **FR-027**: Revoked devices cannot push/resolve. Any final pull still requires
  a valid owner session and explicit policy.
- **FR-028**: Endpoints authenticate Clerk, establish RLS context, validate DTO
  allowlists, propagate request/correlation IDs, return safe errors, and enforce
  body/page/rate/timeout limits.
- **FR-029**: Bootstrap, delta, mutation, ack, and conflict contracts are runtime
  documented and drift-checked.
- **FR-030**: Admin never becomes a sync client or writes sync state.
- **FR-031**: Mobile upgrade is additive, transactional, tested from every
  supported version, and never wipes data.
- **FR-032**: Mobile persists cursors, queued envelopes, retries, ack, tombstones,
  conflicts, and local/server ID mappings.
- **FR-033**: Legacy `REAL` money converts exactly to minor units or remains for
  explicit review; silent rounding/drop/default is forbidden.
- **FR-034**: Mobile page application and cursor persistence share one local
  transaction; repeated pages apply by resource/version idempotently.
- **FR-035**: All four workers use bounded fenced claims, exponential backoff
  with jitter, terminal/dead-letter outcomes, graceful shutdown, structured
  logs, metrics, and safe redelivery.
- **FR-036**: Health/readiness and alerts cover cursor lag, retries/dead letters,
  conflict spikes, cleanup failure, stale leases, and idempotency growth.
- **FR-037**: Logs/metric labels exclude raw keys/hashes, payloads, snapshots,
  money, notes, fingerprints, tokens, and tenant IDs.
- **FR-038**: Delta P95 is <=500 ms for 500 changes and <=512 KB compressed;
  mutation acceptance P95 is <=800 ms excluding background domain work.
- **FR-039**: Load evidence covers 100,000 resources, concurrent devices,
  cross-user isolation, retry storms, cursor/tombstone queries, and no N+1 scans.
- **FR-040**: Migrations are ordered, immutable, checksum-verified, additive,
  N-1 compatible, and tested from the released Phase 05 baseline.
- **FR-041**: Rollback preserves idempotency, mutations, cursors, conflicts,
  tombstones, audit, outbox, and Mobile data and prefers forward correction.
- **FR-042**: Unit, DB, migration, rollback, RLS, integration, contract, E2E,
  concurrency, redelivery, recovery, Mobile, security, performance, and full
  repository gates pass with named fresh evidence.
- **FR-043**: No SPEC-BE-007+ resource, unrelated client remediation, Admin sync,
  user-owned change, or unrequested remote action enters this Spec.

## Security and Privacy Requirements

- Deny by default at HTTP, function, grant, and FORCE RLS layers. Tests cover
  owner, non-owner, tenant mismatch, revoked device, anonymous, authenticated
  direct access, Admin, API, worker, and migration roles.
- Apply applicable OWASP ASVS 5.0.0 L2/L3, API Security Top 10:2023, OWASP Top
  10:2025, and MASVS 2.1.0 controls for BOLA/BFLA/property authorization, replay,
  mass assignment, injection, unsafe consumption, rate/storage/privacy/logging,
  and exceptional conditions.
- Conflict snapshots and mutation payloads use owner-safe allowlists; internal,
  provider, and unrelated fields are never retained or returned. Resolved
  snapshots are minimized after retention.
- Raw idempotency keys are never stored/logged. Hashes remain private.
- Service-role use is isolated to named workers/functions; no client bundle
  contains a service-role key, database credential, or provider secret.

## Performance and Caching Requirements

- Bootstrap/delta use bounded indexed equality/range/order queries. Full download
  after bootstrap is explicit recovery only with safe reason/evidence.
- Delta P95 <=500 ms for 500 changes and <=512 KB compressed. Mutation batch
  acceptance P95 <=800 ms. Critical state queries target DB P95 <=50 ms.
- No unbounded JSON scan, N+1 query, or shared cache of sync/idempotency state.
- Responses are `private, no-store`; only immutable reference bootstrap may use
  versioned ETags. Redis is not introduced.
- Evidence includes 100,000 resources, multiple devices, repeat pages, oldest
  cursor, cleanup contention, retry storms, and query plans with buffers.

## Mobile and Admin Integration

- Mobile receives a live sync adapter behind existing boundaries for currently
  implemented reference/accounts/categories/transactions only.
- SQLite migration adds sync metadata without rebuilding/deleting domain tables.
  Existing local-only domains remain untouched except required safe mappings.
- Local IDs remain stable; a durable map associates them with server UUIDs.
- Queued envelopes retain operation ID across retry/restart. Ack applies atomically
  with local resource/version/cursor state.
- Admin receives no sync adapter or direct client-sync mutation surface.

## Tests and Verification Evidence

- **Unit**: hashing, state machines, cursor validation, ordering/topology, DTOs,
  tombstones, conflict classification/resolution, backoff, redaction, Mobile maps.
- **Database/pgTAP**: exact schema/constraints/indexes, lifecycle guards,
  idempotency replay/reclaim, outbox change capture/order, grants/FORCE RLS,
  fixed search paths, direct-access negatives, cleanup and conflict audit.
- **Migration/recovery**: clean apply, Phase 05 upgrade, N-1, failure/forward fix,
  rollback, replay, retained rows, and checksum drift rejection.
- **Integration/E2E**: bootstrap/delta/ack, repeated pages, interrupted/partial
  upload, replay/mismatch, concurrent/revoked devices, tombstones, stale writes,
  conflicts, isolation, RLS context, stable errors, OpenAPI drift.
- **Financial concurrency**: timeout/race/redelivery/version/conflict replay and
  injected failures prove exactly one or zero financial effect as appropriate.
- **Workers**: lease race/expiry, retry, terminal outcome, retention, redelivery,
  crash recovery, shutdown, structured logs, metrics, alerts.
- **Mobile**: supported upgrades, populated v9 preservation, exact conversion,
  review, cursor/queue/map persistence, atomic apply, ack retry, tombstone,
  conflicts, power-loss recovery, and absence of a wipe path.
- **Performance/security/full gates**: 100k resources, 500-change pages, multiple
  devices, retry/conflict load, named P50/P95/P99/payload/query-plan evidence,
  OWASP traceability, scans, build, and independent review.

## Migration and Rollback Strategy

1. Evolve idempotency cleanup/lease fencing additively without changing its
   unique key or replay semantics.
2. Create `client_mutations` and `client_sync_state`, guards, indexes, RLS,
   grants, and bounded functions.
3. Create `transaction_conflicts` after its mutation/transaction foreign keys;
   add lifecycle, RLS, audit, and resolution functions.
4. Add Phase 06 outbox change capture/indexes and prove cursor ordering without
   altering historical event meaning.
5. Enable handlers only after migration and negative access tests pass.
6. Add Mobile schema version 10 and adapters transactionally; never drop, clear,
   or wholesale-rewrite existing rows.

Migrations are immutable and registered in the checksum manifest. Rollback
disables routes/workers and returns Mobile to local-only/mock reads while
preserving all queues and records. Schema defects use forward correction.

## Observability and Operations

- Logs include request/correlation ID, route/job template, safe device class,
  domain, outcome, counts, duration, retry/lease metadata, and safe error code.
- Metrics cover endpoint latency/bytes/counts, cursor lag, mutation state/age,
  replay/mismatch/in-progress, conflict class/state/resolution, worker claims/
  retries/terminal failures, tombstone age, cleanup, and table growth.
- Alerts cover lag/backlog/dead letters/conflict spikes/idempotency growth or
  mismatch/cleanup failure/stale leases/security denials/budget regression.
- Runbooks cover backlog/replay, stuck claims, cursor recovery, tombstone
  retention, conflicts, dead letters, migration forward fix, Mobile recovery,
  rollback/local-only mode, and privacy-safe diagnosis.

## Assumptions

- Maximum offline window and completed-idempotency retention are 30 days,
  matching the bridge expiry. Planning may lengthen but not shorten this if a
  current Mobile contract proves a longer promise.
- Batch processing is durable per operation and may partially succeed; response
  order remains input order after validated dependency ordering.
- The existing private outbox remains available through the offline window for
  change replay; cleanup never removes changes needed by supported checkpoints.
- Only reference/account/category/transaction handlers register in Phase 06;
  later Specs register their own handlers.
- Repeated changes are allowed; Mobile applies resource/version idempotently and
  acknowledges only after durable local application.

## Out of Scope

- SPEC-BE-007+ server resources/handlers and SPEC-BE-014 full client cutover.
- A new sync-change table, second idempotency store, Redis, BullMQ, Prisma,
  microservice, Edge Function, or Realtime-as-sync.
- Automatic financial LWW, cross-currency transfers, arbitrary conflict merges,
  dynamic SQL, or direct client writes to financial source tables.
- Push, merge, rebase, Pull Request, branch, worktree, or remote/tag evidence.

## Acceptance Criteria

- **AC-001**: Replay across timeout/retry/concurrency/redelivery returns the
  original result with exactly one financial effect.
- **AC-002**: Same-key/different-payload always returns the reuse error with zero
  new effects.
- **AC-003**: Bootstrap/delta are deterministic and resumable without loss,
  duplicate effect, normal full redownload, or cursor leakage.
- **AC-004**: Device/domain cursors move only forward after durable local apply
  and reject invalid/foreign/future values.
- **AC-005**: Tombstones propagate within retention and stale work cannot
  resurrect deleted data.
- **AC-006**: Financial conflicts are explicit, isolated, deterministic,
  idempotently resolved, and audited; LWW/financial keep-both are impossible.
- **AC-007**: RLS/grant/function tests prove no cross-user/tenant, revoked-device,
  direct-table, Admin, anonymous, or broad service-role bypass.
- **AC-008**: All four workers are leased, retry-safe, graceful, observable, and
  terminal failures are visible/recoverable without duplicate effects.
- **AC-009**: Populated Mobile v9 upgrades without row loss; pending work survives
  and invalid legacy money remains for review.
- **AC-010**: Delta and mutation P95/payload budgets pass on documented load.
- **AC-011**: Migrations upgrade Phase 05, checksums/rollback/forward recovery pass,
  and reconciliation finds no duplicate/missing financial effect.
- **AC-012**: Runtime/OpenAPI/Mobile/event/job/error/telemetry/runbook contracts
  match artifacts.
- **AC-013**: All focused/full quality/security/database gates pass and independent
  review findings are resolved.
- **AC-014**: No later-Spec, unrelated client, Admin sync, user-owned, or remote
  action enters the committed diff.

## Success Criteria

- **SC-001**: 100% of retry/concurrency/redelivery scenarios produce no duplicate
  financial effect and deterministic replay.
- **SC-002**: 100% of supported Mobile upgrades retain all existing rows, drafts,
  pending operations, conflicts, and local IDs.
- **SC-003**: 100,000-resource sync can interrupt at each page and resume with no
  missing or duplicated applied resource versions.
- **SC-004**: 100% of deletion scenarios reach supported devices before expiry
  and no stale mutation resurrects data.
- **SC-005**: 100% of tested financial races apply one valid command or create one
  explicit conflict; none silently overwrite.
- **SC-006**: All isolation/revocation/direct-access tests deny unauthorized use.
- **SC-007**: 500-change delta and 100-operation batch budgets pass without
  unbounded/N+1 queries.
- **SC-008**: Operators can identify and recover every tested stuck/retried/
  terminal mutation, lag condition, cleanup failure, and conflict spike.

## Definition of Done

- [x] Complete consistent `spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/`, `quickstart.md`, and dependency-ordered `tasks.md` with no
      unresolved clarification or Constitution failure.
- [x] Idempotency and all Phase 06 schema/functions/triggers/indexes/RLS/grants
      pass migration, checksum, rollback, permission, concurrency, retention,
      and cleanup tests.
- [x] All sync/conflict APIs, stable errors, pagination/cursors, auth/RLS context,
      abuse limits, and OpenAPI contracts are implemented and verified.
- [x] All four workers pass lease/retry/redelivery/dead-letter/shutdown/log/
      metric/health/readiness tests.
- [x] Mobile schema/adapters pass upgrades, no-wipe, cursor/queue/ack/map,
      tombstone, conflict, and recovery tests.
- [x] All test types, performance/load gates, scans, OWASP evidence, telemetry,
      alerts, runbooks, independent review, and full repository gates pass.
- [x] Every FR/AC/SC/task/Master Plan DoD item maps to fresh passing evidence;
      historical external gaps are documented, never waived.
- [x] Work is committed directly to `main` in scoped commits. No push, merge,
      rebase, or PR occurs, and no task worktree remains.

Verification listed here is required evidence, not a claim it has already run.
