# Tasks: Offline Sync, Idempotency & Conflict Resolution

**Input**: `apps/api/specs/006-offline-sync-idempotency/spec.md`, `plan.md`,
`research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Scope**: SPEC-BE-006 resources and additive integration only
**Tests**: Red-first for every changed behavior

Every completed task must retain its named command output or observable result in
`apps/api/specs/006-offline-sync-idempotency/evidence/`.

## Phase 1: Baseline And Contract Review

- [x] T001 Record `main`, `origin/main`, ahead/behind, HEAD, and the preserved `.agents/plugins/` change in `apps/api/specs/006-offline-sync-idempotency/evidence/baseline.md`; verify with `git status --short --branch` and `git rev-list --left-right --count origin/main...main`
- [x] T002 Record Phase 01-05 programmatic prerequisites and the known external-only Phase 02 gaps in `apps/api/specs/006-offline-sync-idempotency/evidence/dependencies.md`; verify every dependency points to a migration, module, test, or explicit external gate
- [x] T003 [P] Review existing Admin Web API assumptions without adding UI work and record compatibility/no-direct-integration evidence in `apps/api/specs/006-offline-sync-idempotency/evidence/admin-review.md`; verify `rg -n "transactions|accounts|categories" apps/admin-web` is classified
- [x] T004 [P] Validate the Phase 06 OpenAPI YAML and contract references in `apps/api/specs/006-offline-sync-idempotency/contracts/openapi.yaml`; verify `node -e` with `js-yaml` reports six paths and seven operations
- [x] T005 [P] Record the repository-pinned Supabase CLI version and migration subcommand help in `apps/api/specs/006-offline-sync-idempotency/evidence/tooling.md`; verify `npx supabase --version` and `npx supabase migration new --help`
- [x] T006 Recheck Constitution ownership, additive migration, RLS, test, observability, recovery, and evidence gates in `apps/api/specs/006-offline-sync-idempotency/evidence/constitution.md`; verify every principle is PASS or names a concrete blocker

---

## Phase 2: Blocking Foundations

- [x] T007 Add red pgTAP structure/constraint/index tests for the evolved idempotency table and three new public tables in `supabase/tests/023_sync_structure.test.sql`; verify `npm run test:db` fails only for missing Phase 06 schema
- [x] T008 [P] Add red pgTAP security tests for FORCE RLS, owner isolation, grants, fixed-search-path private functions, and direct server-column denial in `supabase/tests/024_sync_rls_grants.test.sql`; verify `npm run test:db` fails on Phase 06 security expectations
- [x] T009 [P] Add red pgTAP outbox cursor atomicity, allowlist, uniqueness, spoof rejection, and immutability tests in `supabase/tests/025_sync_outbox.test.sql`; verify `npm run test:db` fails on absent sync metadata behavior
- [x] T010 [P] Add red pgTAP idempotency fencing and mutation lease/replay tests in `supabase/tests/026_sync_idempotency_workers.test.sql`; verify `npm run test:db` fails on absent fencing/claim behavior
- [x] T011 Use `npx supabase migration new phase06_sync_schema --workdir ../..` from `apps/api`, replace the generated placeholder below with its exact path, and implement the four-table additive schema, constraints, indexes, RLS/grants, fenced functions, outbox trigger, and mutation claim primitives in `supabase/migrations/20260831061405_phase06_sync_schema.sql`; verify tests 023-026 pass after `npm run db:reset && npm run db:lint && npm run test:db`
- [x] T012 Update migration checksums for the generated Phase 06 migration in `supabase/migration-checksums.sha256`; verify `npm run migration:checksums:update && npm run migration:checksums`
- [x] T013 Add sync configuration bounds for batch size, payload size, leases, retries, and retention in `apps/api/src/platform/config/environment.schema.ts` and `apps/api/src/platform/config/environment.types.ts`; verify `npm run test:unit -- --testPathPatterns=environment.schema`
- [x] T014 Add the minimal authenticated sync module shell in `apps/api/src/sync/sync.module.ts` and register it in `apps/api/src/app.module.ts` and `apps/api/src/worker.module.ts`; verify `npm run typecheck`
- [x] T015 [P] Add stable cursor/hash/domain primitives in `apps/api/src/sync/sync.types.ts` and `apps/api/src/sync/sync.codec.ts`, reusing `apps/api/src/ledger/idempotency.ts`; verify the red-first `apps/api/test/unit/sync/sync.codec.spec.ts` passes
- [x] T016 [P] Add shared sync DTO validation and stable error codes in `apps/api/src/sync/sync.dto.ts`; verify the red-first `apps/api/test/unit/sync/sync.dto.spec.ts` passes
- [x] T017 Add the owner-scoped persistence boundary in `apps/api/src/sync/sync.repository.ts`; verify `npm run typecheck` and no query accepts `user_id` from a request body
- [x] T018 Add contract drift coverage for all six sync/conflict paths, seven operations, and schemas in `apps/api/test/contract/sync/sync-openapi.contract-spec.ts`; verify `npm run test:contract -- --testPathPatterns=sync-openapi`

**Gate**: migrations 023-026, typecheck, and the sync OpenAPI contract pass before
story implementation.

---

## Phase 3: User Story 1 - Retry A Mutation Safely (P1)

**Goal**: Durable per-batch and per-operation replay with no duplicate effect.

**Independent test**: submit the same 1-100 operation batch concurrently and
after restart; each operation has one effect and stable receipts.

### Tests

- [x] T019 [P] [US1] Add red canonical hash, duplicate replay, mismatched reuse, and in-progress unit tests in `apps/api/test/unit/sync/sync-idempotency.spec.ts`; verify the targeted Jest test fails for missing service behavior
- [x] T020 [P] [US1] Add red mutation batch validation and response-shape contract tests in `apps/api/test/contract/sync/mutations.contract-spec.ts`; verify 1/100 entries pass shape while 0/101 and >512 KiB fail
- [x] T021 [P] [US1] Add red live concurrent duplicate, partial receipt, restart replay, and stale fence integration tests in `apps/api/test/integration/sync/mutations.integration.spec.ts`; verify failures identify missing durable behavior only
- [x] T022 [P] [US1] Add red authenticated mutation HTTP e2e coverage in `apps/api/test/e2e/sync/mutations.e2e-spec.ts`; verify owner spoofing, stable codes, and replay expectations fail before implementation

### Implementation

- [x] T023 [US1] Implement batch/per-operation idempotency orchestration and ordered durable receipts in `apps/api/src/sync/sync.service.ts`; verify `apps/api/test/unit/sync/sync-idempotency.spec.ts`
- [x] T024 [US1] Implement registered account/category/transaction command dispatch through existing Phase 04/05 services in `apps/api/src/sync/sync.handlers.ts`; verify unsupported domains/operations reject without side effects
- [x] T025 [US1] Implement `POST /api/v1/sync/mutations` in `apps/api/src/sync/sync.controller.ts`; verify `apps/api/test/contract/sync/mutations.contract-spec.ts`
- [x] T026 [US1] Complete durable receipt persistence and explicit fenced idempotency completion in `apps/api/src/sync/sync.repository.ts`; verify `apps/api/test/integration/sync/mutations.integration.spec.ts`
- [x] T027 [US1] Add bounded idempotency/mutation metrics and redacted logs in `apps/api/src/sync/sync.observability.ts`; verify the red-first `apps/api/test/unit/sync/sync.observability.spec.ts` finds no payload/key/high-cardinality labels
- [x] T028 [US1] Capture US1 replay, concurrency, restart, and zero-duplicate-effect results in `apps/api/specs/006-offline-sync-idempotency/evidence/us1-idempotency.md`; verify all US1 commands pass

**Checkpoint**: US1 is independently complete when duplicate/restarted requests
replay byte-equivalent terminal receipts and a hash mismatch never executes.

---

## Phase 4: User Story 2 - Bootstrap Without Losing Local Data (P1)

**Goal**: Owner-safe initial snapshots and an additive Mobile local baseline.

**Independent test**: upgrade a populated schema-v9 database, bootstrap three
domains, and retain every local pending row while storing starting cursors.

### Tests

- [x] T029 [P] [US2] Add red bootstrap pagination, ownership, cursor, and payload-budget unit tests in `apps/api/test/unit/sync/sync-bootstrap.spec.ts`; verify absent service behavior is the only failure
- [x] T030 [P] [US2] Add red bootstrap HTTP contract/e2e tests in `apps/api/test/contract/sync/bootstrap.contract-spec.ts` and `apps/api/test/e2e/sync/bootstrap.e2e-spec.ts`; verify unauthenticated/cross-owner/oversize cases
- [x] T031 [P] [US2] Add red schema-v9-to-v10/no-data-loss tests in `apps/mobile/src/storage/sync-database.test.ts`; verify the four-table sync metadata contract fails before migration
- [x] T032 [P] [US2] Add red Mobile bootstrap merge and cursor persistence tests in `apps/mobile/src/storage/sync-repository.test.ts`; verify pending local mutations survive

### Implementation

- [x] T033 [US2] Implement owner-safe account/category/transaction bootstrap repository reads and starting cursors in `apps/api/src/sync/sync.repository.ts`; verify `apps/api/test/unit/sync/sync-bootstrap.spec.ts`
- [x] T034 [US2] Implement bootstrap orchestration and 512 KiB response enforcement in `apps/api/src/sync/sync.service.ts`; verify deterministic domain ordering and no full-download fallback
- [x] T035 [US2] Implement `GET /api/v1/sync/bootstrap` in `apps/api/src/sync/sync.controller.ts`; verify bootstrap contract and e2e tests
- [x] T036 [US2] Add additive Mobile SQLite schema v10 tables/indexes in `apps/mobile/src/storage/database.ts`; verify `apps/mobile/src/storage/sync-database.test.ts` and existing database tests pass
- [x] T037 [US2] Implement Mobile sync state, queue, and ID-mapping persistence in `apps/mobile/src/storage/sync-repository.ts`; verify `apps/mobile/src/storage/sync-repository.test.ts`
- [x] T038 [US2] Implement bootstrap merge adapter reusing existing CoreFinance repository operations in `apps/mobile/src/storage/core-finance-sync-adapter.ts`; verify IDs are mapped without PK rewrites and local work remains
- [x] T039 [US2] Capture schema-upgrade, owner isolation, payload, and bootstrap recovery results in `apps/api/specs/006-offline-sync-idempotency/evidence/us2-bootstrap.md`; verify all US2 commands pass

**Checkpoint**: US2 is complete when a populated v9 client reaches v10 and a
restart-safe bootstrap without wipes or owner leakage.

---

## Phase 5: User Story 3 - Resume Incremental Synchronization (P1)

**Goal**: Ordered, bounded delta pull and monotonic acknowledgements.

**Independent test**: consume more than 500 interleaved owner events over
multiple pages, restart between pages, and resume without gaps or duplicates.

### Tests

- [x] T040 [P] [US3] Add red cursor codec, page boundary, expired/ahead cursor, and ack monotonicity unit tests in `apps/api/test/unit/sync/sync-delta.spec.ts`; verify stable error codes
- [x] T041 [P] [US3] Add red delta/ack OpenAPI and payload tests in `apps/api/test/contract/sync/delta-ack.contract-spec.ts`; verify limit 500 and opaque cursor rules
- [x] T042 [P] [US3] Add red live outbox ordering, concurrent insert, checkpoint, and owner/domain isolation tests in `apps/api/test/integration/sync/delta.integration.spec.ts`; verify no OFFSET behavior is accepted
- [x] T043 [P] [US3] Add red Mobile transactional delta-apply/restart/ack tests in `apps/mobile/src/storage/sync-delta.test.ts`; verify cursor cannot advance on failed apply

### Implementation

- [x] T044 [US3] Implement keyset delta and current/oldest cursor queries over immutable outbox sync metadata in `apps/api/src/sync/sync.repository.ts`; verify intended partial expression index plans
- [x] T045 [US3] Implement cursor validation, 500-item/512-KiB pagination, and monotonic ack service behavior in `apps/api/src/sync/sync.service.ts`; verify `apps/api/test/unit/sync/sync-delta.spec.ts`
- [x] T046 [US3] Implement `GET /api/v1/sync/delta` and `POST /api/v1/sync/ack` in `apps/api/src/sync/sync.controller.ts`; verify delta/ack contract and e2e paths
- [x] T047 [US3] Implement transactionally applied Mobile changes plus cursor advancement/ack handoff in `apps/mobile/src/storage/core-finance-sync-adapter.ts`; verify `apps/mobile/src/storage/sync-delta.test.ts`
- [x] T048 [US3] Add a minimal authenticated Mobile sync HTTP client boundary in `apps/mobile/src/services/contracts/sync-service.ts`; verify the red-first `apps/mobile/src/services/contracts/sync-service.test.ts` maps all stable response/error shapes
- [x] T049 [US3] Capture cursor ordering, restart resume, ack, isolation, and query-plan evidence in `apps/api/specs/006-offline-sync-idempotency/evidence/us3-delta.md`; verify all US3 commands pass

**Checkpoint**: US3 is complete with monotonic owner/domain cursors, no post-
bootstrap full download, and atomic local apply-before-ack.

---

## Phase 6: User Story 4 - Propagate Deletions (P1)

**Goal**: Immutable tombstones remove/archive local records without resurrection.

**Independent test**: delete then concurrently page/restart; the tombstone is
ordered, retained, idempotently applied, and never requires the deleted row.

### Tests

- [x] T050 [P] [US4] Add red outbox snapshot/tombstone and payload immutability integration tests in `apps/api/test/integration/sync/tombstones.integration.spec.ts`; verify deletes lack sensitive/unavailable row reads
- [x] T051 [P] [US4] Add red Mobile tombstone/idempotent-missing-row tests in `apps/mobile/src/storage/sync-tombstones.test.ts`; verify no pending edit is silently discarded

### Implementation

- [x] T052 [US4] Complete allowlisted Phase 04/05 event snapshot/tombstone derivation in `supabase/migrations/20260831061405_phase06_sync_schema.sql`; verify pgTAP 025 and tombstone integration tests
- [x] T053 [US4] Apply owner-safe tombstones and mapping state through `apps/mobile/src/storage/core-finance-sync-adapter.ts`; verify `apps/mobile/src/storage/sync-tombstones.test.ts`
- [x] T054 [US4] Capture delete ordering, immutability, restart, and no-resurrection evidence in `apps/api/specs/006-offline-sync-idempotency/evidence/us4-tombstones.md`; verify all US4 commands pass

**Checkpoint**: US4 is complete when every supported delete has one durable,
owner-safe tombstone and repeated application is harmless.

---

## Phase 7: User Story 5 - Review Financial Conflicts Explicitly (P1)

**Goal**: Detect stale financial edits and resolve them without silent overwrite.

**Independent test**: submit a stale transaction mutation, list its immutable
snapshots, resolve through an allowed strategy, and reject financial keep-both.

### Tests

- [x] T055 [P] [US5] Add red pgTAP conflict transition/idempotent-resolution/financial-policy tests in `supabase/tests/027_sync_conflicts.test.sql`; verify invalid transitions and keep-both expectations
- [x] T056 [P] [US5] Add red service tests for stale version detection and server/client/merged/duplicate resolution in `apps/api/test/unit/sync/sync-conflicts.spec.ts`; verify command delegation expectations
- [x] T057 [P] [US5] Add red conflict list/resolve contract and owner-boundary tests in `apps/api/test/contract/sync/conflicts.contract-spec.ts`; verify pagination and stable errors
- [x] T058 [P] [US5] Add red conflict atomicity and concurrent resolution integration tests in `apps/api/test/integration/sync/conflicts.integration.spec.ts`; verify one terminal decision and its audit/outbox effects
- [x] T059 [P] [US5] Add red Mobile conflict mapping/UI-policy tests in `apps/mobile/src/storage/sync-conflicts.test.ts` and `apps/mobile/src/features/transactions/SyncConflictScreen.test.tsx`; verify financial keep-both is unavailable

### Implementation

- [x] T060 [US5] Implement conflict creation/list/locked resolution persistence in `apps/api/src/sync/sync.repository.ts`; verify pgTAP 027 and integration atomicity
- [x] T061 [US5] Implement stale mutation detection and validated conflict strategies through existing ledger commands in `apps/api/src/sync/sync.service.ts`; verify `apps/api/test/unit/sync/sync-conflicts.spec.ts`
- [x] T062 [US5] Implement `GET /api/v1/conflicts`, `GET /api/v1/conflicts/:conflictId`, and `PATCH /api/v1/conflicts/:conflictId` in `apps/api/src/sync/sync.controller.ts`; verify conflict contract tests
- [x] T063 [US5] Map server conflicts and allowed resolutions to existing `finance_sync_conflicts` in `apps/mobile/src/storage/core-finance-sync-adapter.ts`; verify Mobile conflict tests
- [x] T064 [US5] Remove/disable financial keep-both at the existing UI boundary in `apps/mobile/src/features/transactions/SyncConflictScreen.tsx`; verify screen accessibility and policy tests
- [x] T065 [US5] Capture conflict detection, isolation, resolution atomicity, duplicate replay, and policy evidence in `apps/api/specs/006-offline-sync-idempotency/evidence/us5-conflicts.md`; verify all US5 commands pass

**Checkpoint**: US5 is complete when stale financial state never overwrites
silently and each conflict reaches at most one valid terminal decision.

---

## Phase 8: User Story 6 - Operate And Recover Workers (P2)

**Goal**: Fenced bounded workers recover leases, retry safely, clean retention,
and reconcile drift.

**Independent test**: kill a worker after claim, reclaim after lease expiry,
reject stale completion, exhaust a poison item, and reconcile/clean safely.

### Tests

- [x] T066 [P] [US6] Add red worker claim/retry/fence/shutdown unit tests in `apps/api/test/unit/sync/sync.worker.spec.ts`; verify deterministic backoff and terminal exhaustion
- [x] T067 [P] [US6] Add red concurrent claim, crash recovery, poison item, cleanup, and reconciliation integration tests in `apps/api/test/integration/sync/sync-workers.integration.spec.ts`; verify bounded SKIP LOCKED behavior
- [x] T068 [P] [US6] Add red worker runtime/container registration tests in `apps/api/test/container/sync-worker.container-spec.ts`; verify all four jobs are reachable and gracefully stopped
- [x] T069 [P] [US6] Add red Mobile queue restart/backoff/rejection tests in `apps/mobile/src/storage/sync-queue.test.ts`; verify operation IDs never change

### Implementation

- [x] T070 [US6] Implement mutation processing, lease recovery, cleanup, and reconciliation loops in `apps/api/src/sync/sync.worker.ts`; verify `apps/api/test/unit/sync/sync.worker.spec.ts`
- [x] T071 [US6] Add fenced worker claim/complete/recover/cleanup repository calls in `apps/api/src/sync/sync.repository.ts`; verify `apps/api/test/integration/sync/sync-workers.integration.spec.ts`
- [x] T072 [US6] Register all four jobs and graceful shutdown in `apps/api/src/sync/sync.module.ts` and `apps/api/src/worker.module.ts`; verify container worker test
- [x] T073 [US6] Implement durable Mobile pending/sending recovery and capped retry in `apps/mobile/src/storage/sync-repository.ts`; verify `apps/mobile/src/storage/sync-queue.test.ts`
- [x] T074 [US6] Add sync health/lag/failure metrics and bounded alert inputs in `apps/api/src/sync/sync.observability.ts` and `apps/api/src/platform/health/queue-health.indicator.ts`; verify observability tests contain no financial payload/high-cardinality labels
- [x] T075 [US6] Write exact operating, lease recovery, reconciliation, cleanup, and cursor-expiry procedures in `docs/runbooks/offline-sync-recovery.md`; verify every command is non-production by default and has success criteria
- [x] T076 [US6] Capture crash recovery, poison item, cleanup, reconciliation, shutdown, and Mobile restart evidence in `apps/api/specs/006-offline-sync-idempotency/evidence/us6-workers.md`; verify all US6 commands pass

**Checkpoint**: US6 is complete when failures recover without duplicate effects,
stale fences cannot complete, and retained history protects active checkpoints.

---

## Final Phase: Hardening And Acceptance

- [x] T077 [P] Add sync ownership, cursor tampering, payload exposure, function privilege, and abuse-boundary tests in `apps/api/test/security/sync/sync-boundaries.spec.ts`; verify `npm run test:ledger:security -- --testPathPatterns=sync` or the owning security project passes
- [x] T078 [P] Add seeded delta/mutation workload, key query plans, and runner in `apps/api/test/performance/sync.sql`, `apps/api/test/performance/sync.k6.js`, and `apps/api/test/performance/run-sync.ts`; verify the red-first runner enforces 500 ms/800 ms/512 KiB budgets
- [x] T079 Add `test:performance:sync` and Phase 06 logic commands to `apps/api/package.json`; verify `npm run perf:check` and `npm run test:performance:sync`
- [x] T080 Add Phase 06 database, API, worker, Mobile, security, performance, recovery, image, SBOM/signature/provenance jobs without weakening existing gates in `.github/workflows/backend-foundation.yml`; verify workflow pin/security tests and local YAML parsing
- [x] T081 Add Phase 06 migration/rollback compatibility and backup/restore coverage in `apps/api/test/e2e/sync/sync-recovery.e2e-spec.ts`; verify previous application compatibility and forward-only repair on a disposable stack
- [x] T082 Run the `clean-code-guard` review on all changed production code and record findings/fixes in `apps/api/specs/006-offline-sync-idempotency/evidence/clean-code-review.md`; verify no unresolved correctness/security finding remains
- [x] T083 Run the `test-guard` review on all changed tests and record findings/fixes in `apps/api/specs/006-offline-sync-idempotency/evidence/test-review.md`; verify tests assert behavior rather than implementation trivia
- [x] T084 Run the mandated independent code review and record reviewer findings and dispositions in `apps/api/specs/006-offline-sync-idempotency/evidence/code-review.md`; verify every actionable finding is fixed and rerun narrowly
- [x] T085 Run formatting, typecheck, lint, unit, contract, integration, e2e, pgTAP/db lint, security, Mobile, performance, build, container/image, checksum, dependency, and workflow gates from `apps/api/specs/006-offline-sync-idempotency/quickstart.md`; record exact results in `apps/api/specs/006-offline-sync-idempotency/evidence/local-release.md`
- [x] T086 Rehearse backup/restore, lease reclaim, reconciliation, retention, and previous-image compatibility and record results in `apps/api/specs/006-offline-sync-idempotency/evidence/recovery.md`; verify zero unexplained drift
- [x] T087 Record external CI/provider/tag/signature/provenance gates that cannot run locally as explicit pending blockers in `apps/api/specs/006-offline-sync-idempotency/evidence/remote.md`; do not claim them passed and do not push
- [x] T088 Update Phase 06 status/ownership/evidence and only prerequisite-gap notes in `docs/Back end/BACKEND_MASTER_PLAN.md`; verify no later-phase ownership is claimed
- [x] T089 Complete the acceptance matrix and Definition of Done in `apps/api/specs/006-offline-sync-idempotency/evidence/acceptance.md` and `apps/api/specs/006-offline-sync-idempotency/evidence/definition-of-done.md`; verify every claim links to retained evidence
- [x] T090 Run `git diff --check`, review `git diff --stat` and `git status --short`, exclude `.agents/plugins/`, and commit the baseline test repair plus verified Phase 06 changes as separate scoped commits directly on `main`; verify local `HEAD` advances by two commits and do not push, merge, rebase, or open a PR

## Dependencies

```text
Phase 1 -> Phase 2 -> US1
                    |-> US2 -> US3 -> US4
                    |-> US5 (uses US1 receipt path and Phase 05 ledger)
                    `-> US6 (uses US1 receipt path)
US1 + US2 + US3 + US4 + US5 + US6 -> Hardening -> local main commit
```

- US1 is the MVP and proves durable write safety.
- US2 can start after foundations; US3 depends on its Mobile metadata schema.
- US4 depends on US3 delta application.
- US5 depends on US1's durable receipt/idempotency path.
- US6 depends on US1's mutation state machine but can otherwise progress beside
  US2-US5.

## Parallel Execution Examples

- After T006, T007-T010 are safe in parallel because they edit separate pgTAP
  files.
- For US1, T019-T022 are safe in parallel before shared implementation begins.
- For US2-US6, backend contract/unit, live integration, and Mobile red tests are
  safe parallel groups when their files do not overlap.
- T077 and T078 are safe in parallel after all stories; workflow/release evidence
  waits for their fixes.
- Shared files (`sync.repository.ts`, `sync.service.ts`, `database.ts`, the Phase
  06 migration, and workflow YAML) are always edited serially.

## Implementation Strategy

1. Finish the database and minimal sync module foundation.
2. Ship US1 as the smallest safe vertical slice: durable operation receipts and
   exactly-once-effect replay.
3. Add bootstrap, delta/ack, tombstones, conflicts, and workers in dependency
   order, keeping each story independently testable.
4. Reuse the existing finance command paths, outbox, observability, worker, and
   Mobile repository patterns; add no queue framework, sync-log table, or new
   dependency.
5. Run full hardening/evidence only after narrow story gates pass.

## Completion Rule

Do not mark a task complete or claim a verification result unless the named
command/procedure was executed successfully and retained. External-only checks
remain explicit pending gates. The user prohibited push/merge/rebase/PR actions;
the terminal authorized repository actions are the verified baseline-test and
Phase 06 local commits on `main`, excluding unrelated `.agents/plugins/`
changes.

## 2026-09-06 Account Tracking Sync Remediation

- [x] Project `automatic_tracking_enabled` in account bootstrap snapshots.
- [x] Attach the field to account upsert deltas while preserving null tombstones.
- [x] Prove false survives bootstrap/delta and old Mobile snapshots default true.
- [x] Record the Slice 2 pushed SHA and remote CI result in acceptance evidence.

## 2026-09-06 Credit-Card Terms Sync Remediation

- [x] Project every nullable card term in account bootstrap snapshots.
- [x] Attach every card term to account upsert deltas and keep tombstones private.
- [x] Prove legacy snapshots map omitted terms to null and live owner bootstrap excludes foreign accounts.
- [x] Prove Mobile persists/reloads the terms and applies both snake-case and camel-case deltas.
- [x] Record the Slice 3 pushed SHA and successful remote CI in acceptance evidence.
