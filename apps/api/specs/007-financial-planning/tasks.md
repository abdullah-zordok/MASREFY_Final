# Tasks: Financial Planning

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Spec**: Phase 07 / SPEC-BE-007
**Branch**: local `main` only
**Method**: TDD; each test task runs red before its paired implementation and green afterward

## Phase 1: Baseline, Artifacts, And Existing Contract Review

**Goal**: Prove the Phase 06 dependency, preserve unrelated work, and freeze one
complete Phase 07 intent/contract package before implementation.

- [x] T001 Capture branch, HEAD/origin divergence, worktrees, status, Phase 06 completion, and preserved `.agents/plugins/` evidence in `apps/api/specs/007-financial-planning/evidence/baseline.md`
- [x] T002 Verify SPEC-BE-001 through SPEC-BE-006 schema/API/outbox/idempotency/sync dependencies and record exact consumed contracts in `apps/api/specs/007-financial-planning/evidence/dependencies.md`
- [x] T003 Inventory every executable Mobile planning service method, domain field, SQLite mapping, journey, and Admin read boundary in `apps/api/specs/007-financial-planning/evidence/client-contracts.md`
- [x] T004 Record missing Spec Kit scripts and the checked-in template/feature-pointer fallback in `apps/api/specs/007-financial-planning/evidence/tooling.md`
- [x] T005 Validate `spec.md`, `plan.md`, research/model/contracts/quickstart, quality checklist, YAML parsing, operation IDs, links, and no unresolved markers in `apps/api/specs/007-financial-planning/evidence/artifacts.md`
- [x] T006 Run the read-only `speckit-analyze` coverage/consistency/Constitution audit and resolve every Critical/High artifact finding before implementation; retain the final metrics in `apps/api/specs/007-financial-planning/evidence/artifact-analysis.md`
- [x] T007 Correct only the Phase 07 compressed table/contract inventory in `docs/Back end/BACKEND_MASTER_PLAN.md` to reference the authoritative current-client field model; verify no ownership or Phase 08+ scope changes

**Checkpoint**: implementation remains blocked until artifacts are complete,
consistent, and all Critical/High analysis findings are zero.

---

## Phase 2: Database And Module Foundations

**Goal**: Establish exact owned schema, forced RLS, minimum grants, shared DTO
primitives, module wiring, and failing-first tests required by all stories.

### Red Database And Contract Tests

- [x] T008 [P] Add failing Phase 07 table/column/default/constraint/index/trigger/view inventory assertions in `supabase/tests/029_planning_structure.test.sql`; run on current reset and capture expected missing-schema failure
- [x] T009 [P] Add failing owner/cross-owner/Admin/worker/anonymous forced-RLS, grant, and security-definer privilege assertions in `supabase/tests/030_planning_rls_grants.test.sql`; run and capture expected missing-policy failure
- [x] T010 [P] Add failing schedule/payment/savings/view/outbox invariants in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected missing-function failure
- [x] T011 [P] Add failing worker-support function, deterministic retry identity, reconciliation, and bounded-operation assertions in `supabase/tests/032_planning_jobs_reconciliation.test.sql`; run and capture the expected missing-function failure
- [x] T012 [P] Add failing allowlist, UUID/date/period/cursor, exact-minor-string, lifecycle, array-bound, and expected-version tests in `apps/api/test/unit/planning/planning.dto.spec.ts`; run and capture expected missing-module failure
- [x] T013 [P] Add failing OpenAPI operation/schema/error/idempotency/version/auth and Mobile mapping contract tests in `apps/api/test/contract/planning/planning.contract-spec.ts`; run and capture expected missing-runtime-contract failure
- [x] T014 [P] Add failing module/container registration tests for API and worker planning modules in `apps/api/test/container/planning.container-spec.ts`; run and capture expected missing-module failure

### Minimal Foundation Implementation

- [x] T015 Create the eleven normalized tables, checks, FK order, indexes, ownership consistency guards, metadata triggers, forced RLS, and revoked defaults in `supabase/migrations/20260831120000_phase07_planning_tables.sql`; rerun T008/T009 to the next expected red boundary
- [x] T016 Add minimum owner/Admin-read/service policies, explicit grants, fixed-search-path function ownership, and `planning.read` permission wiring in `supabase/migrations/20260831120200_phase07_planning_access.sql`; rerun T009 green without broad grants
- [x] T017 Implement shared Phase 07 DTO normalization and canonical minor/date/period/cursor helpers in `apps/api/src/planning/planning.dto.ts`; rerun T012 green
- [x] T018 Implement planning event constants/safe payload allowlists in `apps/api/src/planning/planning.events.ts`; verify contract tests reject sensitive fields
- [x] T019 Create `PlanningRepository` transaction/read primitives using existing `PoolService`, request context, bigint-string mapping, and no duplicate database abstraction in `apps/api/src/planning/planning.repository.ts`; verify focused unit/type tests
- [x] T020 Create minimal `PlanningService`, `PlanningController`, `PlanningModule`, and `PlanningWorkerModule` in `apps/api/src/planning/planning.service.ts`, `apps/api/src/planning/planning.controller.ts`, and `apps/api/src/planning/planning.module.ts`; rerun T013/T014 to story-specific expected red results
- [x] T021 Register `PlanningModule` and `PlanningWorkerModule` in `apps/api/src/app.module.ts` and `apps/api/src/worker.module.ts`; rerun container registration green
- [x] T022 Add Phase 07 function/view and worker-support SQL skeletons with deny-by-default grants in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; register workers through the existing Nest worker module and rerun database reset/lint/checksum before story implementation
- [x] T023 Update migration function inventory/checksum expectations in `apps/api/test/e2e/migration-apply.e2e-spec.ts` and checksum manifest; verify the new migrations apply from zero without weakening prior checks
- [x] T024 Record foundation red/green commands, schema inventory, grant/RLS results, and module wiring in `apps/api/specs/007-financial-planning/evidence/foundations.md`

**Checkpoint**: all owned resources exist with forced RLS and denied direct
dependent writes; module shells compile; no story behavior is falsely claimed.

---

## Phase 3: User Story 1 - Track Salary Cycles (P1)

**Goal**: Optional profiles, deterministic expected receipts, ledger-backed
receipt links, correction/undo, and derived cycle summaries.

**Independent test**: day-31 February generation plus link/unlink of one owned
confirmed income transaction yields one exact cycle and restores projection.

### Red Tests

- [x] T025 [P] [US1] Add failing monthly/leap-year/weekly/biweekly/custom horizon and idempotent salary-generation pgTAP cases in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected failure
- [x] T026 [P] [US1] Add failing salary DTO/profile/link/unlink/correction/replay/stale/error service tests in `apps/api/test/unit/planning/planning.salary.spec.ts`; run and capture expected failure
- [x] T027 [P] [US1] Add failing salary HTTP auth/allowlist/minor-string/list/detail/receipt contract cases in `apps/api/test/contract/planning/planning.salary.contract-spec.ts`; run and capture expected failure
- [x] T028 [P] [US1] Add failing live owner/cross-owner/account/currency/income/status/duplicate/concurrency/reversal scenarios in `apps/api/test/integration/planning/planning.salary.integration.spec.ts`; run against reset DB and capture expected failure

### Implementation

- [x] T029 [US1] Implement deterministic `private.generate_salary_receipts` and salary-cycle view derivation in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun T025 green
- [x] T030 [US1] Implement profile CRUD, receipt link/unlink/correction, expected-version and Phase 06 idempotency repository calls in `apps/api/src/planning/planning.repository.ts`; rerun live salary tests to service boundary
- [x] T031 [US1] Implement salary service authorization/orchestration/error mapping in `apps/api/src/planning/planning.service.ts`; rerun T026 green
- [x] T032 [US1] Add salary profile/receipt routes and exact response mapping in `apps/api/src/planning/planning.controller.ts`; rerun T027/T028 green
- [x] T033 [US1] Add salary events/outbox safety and Phase 06 salary resource/tombstone handler registration in `apps/api/src/planning/planning.events.ts` and `apps/api/src/sync/sync.handlers.ts`; verify replay/sync/outbox cases
- [x] T034 [US1] Capture salary date, ledger-link, isolation, correction, reversal, replay, and sync evidence in `apps/api/specs/007-financial-planning/evidence/us1-salary.md`

**Checkpoint**: expected salary never becomes fabricated income; exactly one
eligible ledger link controls the cycle and every retry/correction is safe.

---

## Phase 4: User Story 2 - Manage Multiple Budgets (P1)

**Goal**: Independent overlapping budgets, atomic complete category allocation,
and ledger-derived utilization without double counting.

**Independent test**: two overlapping budgets retain distinct limits and exact
spend after transfer exclusion, refund/reversal, and reclassification.

### Red Tests

- [x] T035 [P] [US2] Add failing period/overlap/zero-total/category-sum/unique-category/closed-state/view cases in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected failure
- [x] T036 [P] [US2] Add failing budget DTO/complete-set/version/copy/rollover/lifecycle service tests in `apps/api/test/unit/planning/planning.budget.spec.ts`; run and capture expected failure
- [x] T037 [P] [US2] Add failing budget list/detail/categories/summary contract tests with string money and independent results in `apps/api/test/contract/planning/planning.budget.contract-spec.ts`; run and capture expected failure
- [x] T038 [P] [US2] Add failing live allocation atomicity, ownership, concurrency, eligible spend, transfer/refund/reversal/reclassification, and missing-FX tests in `apps/api/test/integration/planning/planning.budget.integration.spec.ts`; run and capture expected failure

### Implementation

- [x] T039 [US2] Implement atomic `private.replace_budget_categories` with total/ownership/version/lifecycle validation and one outbox event in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun allocation pgTAP green
- [x] T040 [US2] Implement security-invoker `public.v_budget_utilization` using Phase 05 effects once and explicit partial/unavailable state in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun view cases green
- [x] T041 [US2] Implement budget CRUD, complete allocation replacement, and bounded utilization reads in `apps/api/src/planning/planning.repository.ts`; verify live tests to service boundary
- [x] T042 [US2] Implement budget service rules for period/lifecycle/rollover/copy provenance/version/idempotency in `apps/api/src/planning/planning.service.ts`; rerun T036 green
- [x] T043 [US2] Add budget collection/detail/categories/summary routes in `apps/api/src/planning/planning.controller.ts`; rerun T037/T038 green
- [x] T044 [US2] Add budget events and Phase 06 budget/category resource/tombstone handlers in `apps/api/src/planning/planning.events.ts` and `apps/api/src/sync/sync.handlers.ts`; verify outbox/sync/reversal recalculation
- [x] T045 [US2] Capture overlap, allocation, exact spend, FX-unavailable, concurrency, isolation, event, and sync evidence in `apps/api/specs/007-financial-planning/evidence/us2-budgets.md`

**Checkpoint**: allocations never exceed total or partially apply; overlapping
budgets never merge; each eligible ledger effect is counted exactly once.

---

## Phase 5: User Story 3 - Schedule Obligations (P1)

**Goal**: Complete payable/receivable obligation lifecycle, deterministic bounded
schedules, overdue state, and reconstructable summaries.

**Independent test**: two identical generation calls yield one stable schedule,
including month-end/residual items, and overdue marking changes only eligible
remaining items.

### Red Tests

- [x] T046 [P] [US3] Add failing fixed/open/irregular, frequency, month-end, residual, horizon, lifecycle, retry, and overdue pgTAP cases in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected failure
- [x] T047 [P] [US3] Add failing obligation DTO/type/schedule/transition/notes/keyword/bound service tests in `apps/api/test/unit/planning/planning.obligation.spec.ts`; run and capture expected failure
- [x] T048 [P] [US3] Add failing obligation list/detail/schedule/payable-receivable contract tests in `apps/api/test/contract/planning/planning.obligation.contract-spec.ts`; run and capture expected failure
- [x] T049 [P] [US3] Add failing live generation concurrency, account/category/currency ownership, lifecycle, overdue, and summary tests in `apps/api/test/integration/planning/planning.obligation.integration.spec.ts`; run and capture expected failure

### Implementation

- [x] T050 [US3] Implement idempotent `private.generate_obligation_schedule` with frequency/date/residual/horizon/sequence rules in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun schedule pgTAP green
- [x] T051 [US3] Implement bounded `private.mark_planning_overdue` and security-invoker `public.v_obligation_status` in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun overdue/summary cases green
- [x] T052 [US3] Implement obligation CRUD/lifecycle/schedule/summary repository calls in `apps/api/src/planning/planning.repository.ts`; verify live tests to service boundary
- [x] T053 [US3] Implement obligation validation/authorization/idempotency/version orchestration in `apps/api/src/planning/planning.service.ts`; rerun T047 green
- [x] T054 [US3] Add obligation collection/detail/schedule routes in `apps/api/src/planning/planning.controller.ts`; rerun T048/T049 green
- [x] T055 [US3] Add obligation/schedule events and Phase 06 obligation/schedule resource/tombstone handlers in `apps/api/src/planning/planning.events.ts` and `apps/api/src/sync/sync.handlers.ts`; verify sync/history behavior
- [x] T056 [US3] Capture schedule determinism, overdue, lifecycle, payable/receivable, isolation, event, and sync evidence in `apps/api/specs/007-financial-planning/evidence/us3-obligations.md`

**Checkpoint**: schedules are stable and bounded; partial/current state is fully
reconstructable; payables and receivables never mix.

---

## Phase 6: User Story 4 - Allocate And Match Payments (P1)

**Goal**: One ledger-backed payment, explicit atomic allocation, safe reversal,
and advisory match proposal/decision with no confidence authority.

**Independent test**: partial/multiple/prepayment and concurrent duplicate cases
produce one atomic payment/outbox result; reversal reconstructs schedule state.

### Red Tests

- [x] T057 [P] [US4] Add failing payment sum/same-root/remainder/prepayment/unique-transaction/reversal/outbox pgTAP cases in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected failure
- [x] T058 [P] [US4] Add failing payment/match DTO, preview-confirm mapping, explicit intent, decision/version/error service tests in `apps/api/test/unit/planning/planning.payment.spec.ts`; run and capture expected failure
- [x] T059 [P] [US4] Add failing payment/reversal and match list/detail/decision HTTP contracts in `apps/api/test/contract/planning/planning.payment.contract-spec.ts`; run and capture expected failure
- [x] T060 [P] [US4] Add failing live partial/multiple/prepayment/excess/stale/duplicate/currency/ownership/concurrency/failure-injection/reversal cases in `apps/api/test/integration/planning/planning.payment.integration.spec.ts`; run and capture expected failure
- [x] T061 [P] [US4] Add failing proposal zero/one/multiple/duplicate and concurrent terminal-decision tests in `apps/api/test/integration/planning/planning.match.integration.spec.ts`; run and capture expected failure

### Implementation

- [x] T062 [US4] Implement atomic `private.allocate_obligation_payment` lock/ledger/allocation/projection/audit/outbox contract in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun payment pgTAP green
- [x] T063 [US4] Implement guarded payment reversal/reconstruction and ledger reversal reconciliation in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun reversal/failure-injection cases green
- [x] T064 [US4] Implement deterministic advisory proposal and versioned match decision functions with bounded evidence in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun proposal/decision pgTAP green
- [x] T065 [US4] Implement payment/match repository transaction calls and bounded reads in `apps/api/src/planning/planning.repository.ts`; verify live tests to service boundary
- [x] T066 [US4] Implement payment/match service revalidation, explicit intent, Phase 06 replay, and safe error mapping in `apps/api/src/planning/planning.service.ts`; rerun T058 green
- [x] T067 [US4] Add payment/reversal and match list/detail/decision routes in `apps/api/src/planning/planning.controller.ts`; rerun T059-T061 green
- [x] T068 [US4] Add safe payment/match events and Phase 06 payment/match/allocation resource handlers in `apps/api/src/planning/planning.events.ts` and `apps/api/src/sync/sync.handlers.ts`; verify no sensitive match evidence emitted
- [x] T069 [US4] Capture payment atomicity, replay, concurrency, reversal, match authority, isolation, event, and reconciliation evidence in `apps/api/specs/007-financial-planning/evidence/us4-payments.md`

**Checkpoint**: payment/allocations/outbox are one outcome; implicit intent and
confidence authorization are impossible; reversal leaves no unexplained drift.

---

## Phase 7: User Story 5 - Track Savings Goals (P1)

**Goal**: Goal lifecycle and exact derived progress from opening migration value
plus validated ledger-backed signed movements.

**Independent test**: contribution/withdrawal/retry/reversal produce one exact
progress result and reject overdraft, ownership, currency, sign, and duplicate
violations.

### Red Tests

- [x] T070 [P] [US5] Add failing goal target/lifecycle/account and signed movement/progress/overdraft/duplicate/reversal pgTAP cases in `supabase/tests/031_planning_commands_views.test.sql`; run and capture expected failure
- [x] T071 [P] [US5] Add failing goal/movement DTO/target-below-progress/version/idempotency/error service tests in `apps/api/test/unit/planning/planning.savings.spec.ts`; run and capture expected failure
- [x] T072 [P] [US5] Add failing goal list/detail/progress and movement/reversal HTTP contract tests in `apps/api/test/contract/planning/planning.savings.contract-spec.ts`; run and capture expected failure
- [x] T073 [P] [US5] Add failing live contribution/withdrawal/adjustment/overdraft/currency/ownership/concurrency/reversal/reconciliation tests in `apps/api/test/integration/planning/planning.savings.integration.spec.ts`; run and capture expected failure

### Implementation

- [x] T074 [US5] Implement guarded `private.record_savings_movement`, signed effect validation, derived progress, audit/outbox, and reversal reconciliation in `supabase/migrations/20260831120100_phase07_planning_functions.sql`; rerun pgTAP green
- [x] T075 [US5] Implement goal CRUD/lifecycle/progress and movement/reversal repository calls in `apps/api/src/planning/planning.repository.ts`; verify live tests to service boundary
- [x] T076 [US5] Implement goal/movement service validation, target decision, Phase 06 replay, and safe error mapping in `apps/api/src/planning/planning.service.ts`; rerun T071 green
- [x] T077 [US5] Add savings-goal collection/detail/movement/reversal routes in `apps/api/src/planning/planning.controller.ts`; rerun T072/T073 green
- [x] T078 [US5] Add savings events and Phase 06 goal/movement resource/tombstone handlers in `apps/api/src/planning/planning.events.ts` and `apps/api/src/sync/sync.handlers.ts`; verify sync/reversal behavior
- [x] T079 [US5] Capture goal lifecycle, exact progress, overdraft, replay, reversal, isolation, event, and sync evidence in `apps/api/specs/007-financial-planning/evidence/us5-savings.md`

**Checkpoint**: progress is derived once, never a balance mutation/counter, and
invalid or reversed ledger state cannot remain silently counted.

---

## Phase 8: User Story 6 - Read And Operate Planning (P2)

**Goal**: One bounded aggregate plus five crash-safe jobs, reconciliation,
observability, and parity mapping without live client cutover.

**Independent test**: representative data returns one isolated/versioned bounded
summary; each job survives retry/crash/stale fence; reconciliation reaches zero
unexplained differences.

### Red Tests

- [x] T080 [P] [US6] Add failing aggregate completeness/independent-budget/partial-state/ledger-version/cache-isolation tests in `apps/api/test/unit/planning/planning.summary.spec.ts`; run and capture expected failure
- [x] T081 [P] [US6] Add failing aggregate HTTP auth/period/payload/money/error contract tests in `apps/api/test/contract/planning/planning.summary.contract-spec.ts`; run and capture expected failure
- [x] T082 [P] [US6] Add failing five-job claim/retry/fence/poison/abort/shutdown unit tests in `apps/api/test/unit/planning/planning.worker.spec.ts`; run and capture expected failure
- [x] T083 [P] [US6] Add failing live worker concurrency/crash/reclaim/idempotency/reminder-intent and reconciliation tests in `apps/api/test/integration/planning/planning.worker.integration.spec.ts`; run and capture expected failure
- [x] T084 [P] [US6] Add failing Mobile method/field/exact-money/SQLite export mapping and unchanged-provider tests in `apps/mobile/src/services/contracts/financial-planning-api-parity.test.ts`; run and capture the precise parity gap
- [x] T085 [P] [US6] Add failing Admin `planning.read` summary permission and no-mutation contract tests in `apps/api/test/security/planning/planning-admin-read.spec.ts`; run and capture expected failure

### Implementation

- [x] T086 [US6] Implement bounded planning aggregate repository query using owned views and ledger version in `apps/api/src/planning/planning.repository.ts`; verify live aggregate isolation
- [x] T087 [US6] Implement aggregate service assembly and only measured process-local version-keyed cache if uncached evidence requires it in `apps/api/src/planning/planning.service.ts`; rerun T080 green
- [x] T088 [US6] Add `GET /api/v1/planning/summary` and permission-gated read-only `GET /api/v1/admin/planning/summary` in `apps/api/src/planning/planning.controller.ts`; rerun T081/T085 green
- [x] T089 [US6] Implement salary/schedule/match/overdue/reminder worker handlers with existing leases/fences/retry/abort patterns in `apps/api/src/planning/planning.worker.ts`; rerun T082/T083 green
- [x] T090 [US6] Register five jobs and planning health inputs in `apps/api/src/planning/planning.module.ts`, `apps/api/src/worker.module.ts`, and `apps/api/src/platform/health/queue-health.indicator.ts`; rerun container/worker tests
- [x] T091 [US6] Implement bounded dry-run/repair planning reconciliation in `supabase/migrations/20260831120100_phase07_planning_functions.sql` and repository/worker invocation in `apps/api/src/planning/planning.repository.ts`; rerun T011/T083 green
- [x] T092 [US6] Add bounded planning metrics/log helpers and alert inputs in `apps/api/src/planning/planning.observability.ts`; verify no sensitive/high-cardinality fields
- [x] T093 [US6] Add the test-owned Mobile wire/domain fixtures required by T084 in `apps/mobile/src/test-utils/financial-planning-api-fixtures.ts`; complete parity assertions in `apps/mobile/src/services/contracts/financial-planning-api-parity.test.ts` and keep production provider selection unchanged
- [x] T094 [US6] Write non-production operation, backlog/lease, replay, reconciliation, migration recovery, rollback, and escalation procedures in `docs/runbooks/financial-planning-operations.md`
- [x] T095 [US6] Capture aggregate, worker recovery, reconciliation, observability, Admin-read, and client-parity evidence in `apps/api/specs/007-financial-planning/evidence/us6-operations.md`

**Checkpoint**: aggregate and jobs are bounded/isolated/replay-safe, differences
reconcile to zero, and no production client/provider boundary changed.

---

## Final Phase: Hardening, Migration, Review, And Acceptance

- [x] T096 [P] Add BOLA/property/mass-assignment/cursor/period/allocation/function-grant/event/log privacy and abuse-boundary tests in `apps/api/test/security/planning/planning-boundaries.spec.ts`; verify zero bypass/leak
- [x] T097 [P] Add representative 100k-ledger/12-budget/100x24-obligation/50-goal seed, SQL plans, k6 workload, and threshold runner in `apps/api/test/performance/planning.sql`, `apps/api/test/performance/planning.k6.js`, and `apps/api/test/performance/run-planning.ts`
- [x] T098 Add `test:planning:integration`, `test:planning:recovery`, `test:performance:planning`, planning perf syntax, and Phase 07 gate scripts to `apps/api/package.json`; verify each command targets real tests and fails on threshold errors
- [x] T099 Add Phase 07 migration/import/quarantine/N-1/failed-forward-fix/backup/restore/ledger-preservation E2E coverage in `apps/api/test/e2e/planning/planning-recovery.e2e-spec.ts`; verify on disposable reset/restore
- [x] T100 Add representative Mobile SQLite-to-server mapping preservation and invalid ownership/currency/unsafe-precision quarantine tests in `apps/mobile/src/storage/financial-planning-backend-migration.test.ts`; do not switch providers
- [x] T101 Add Phase 07 API/worker/database/security/performance/recovery/image and remote gate accounting to `.github/workflows/backend-foundation.yml`; verify pinned actions and no weakened prior gate
- [x] T102 Run `clean-code-guard` against every changed production file and record concrete findings/fixes in `apps/api/specs/007-financial-planning/evidence/clean-code-review.md`
- [x] T103 Run `test-guard` against every changed test file and record concrete findings/fixes in `apps/api/specs/007-financial-planning/evidence/test-review.md`
- [x] T104 Run independent full Phase 07 code/security review, fix every verified in-scope finding with red-first regression coverage, and record dispositions in `apps/api/specs/007-financial-planning/evidence/code-review.md`
- [x] T105 Run `speckit-converge`; append and implement every real remaining gap until a follow-up run reports converged, recording metrics in `apps/api/specs/007-financial-planning/evidence/convergence.md`
- [x] T106 Run database reset/lint/pgTAP, focused unit/contract/integration/E2E/security/concurrency/recovery/performance/Mobile gates and record exact fresh results in `apps/api/specs/007-financial-planning/evidence/local-feature-gates.md`
- [x] T107 Run API format/type/lint/full verify/dependency/workflow plus Mobile serial/full type/lint and record counts/skips/warnings in `apps/api/specs/007-financial-planning/evidence/local-release.md`
- [x] T108 Build/test the non-root release image and rehearse migration/N-1/rollback/backup/restore/worker reclaim/reconciliation; record digest and results in `apps/api/specs/007-financial-planning/evidence/recovery.md`
- [x] T109 Record prohibited remote workflow/registry/tag/SBOM publication/signature/provenance gates as explicit pending—not passed—in `apps/api/specs/007-financial-planning/evidence/remote.md`
- [x] T110 Complete the FR/AC/SC acceptance matrix and Definition of Done with links to fresh evidence in `apps/api/specs/007-financial-planning/evidence/acceptance.md` and `apps/api/specs/007-financial-planning/evidence/definition-of-done.md`
- [x] T111 Update Phase 07 status/evidence and only prerequisite-gap notes in `docs/Back end/BACKEND_MASTER_PLAN.md`; verify no Phase 08+ ownership or completion is claimed
- [x] T112 Mark every proven task and Spec DoD item complete, run path/checkbox/placeholder/scope audits, and verify every claim points to retained evidence in `apps/api/specs/007-financial-planning/`
- [x] T113 Run `git diff --check`, review full diff/stat/status, exclude `.agents/plugins/` and Phase 08+ paths, and commit verified Phase 07 changes directly to local `main` with clear scoped commit(s); do not push, merge, rebase, create a PR, branch, or worktree

## Dependencies

```text
Phase 1 -> Phase 2 -> US1
                    |-> US2
                    |-> US3 -> US4
                    `-> US5
US1 + US2 + US3 + US4 + US5 -> US6 -> Hardening -> Converge -> local main commit
```

- Foundations block every story.
- US1, US2, US3, and US5 are independent after foundations when their files do
  not overlap; shared SQL/repository/service/controller files are edited serially.
- US4 depends on US3 schedule rows and Phase 05 ledger contracts.
- US6 consumes all story views/events and is implemented after P1 slices.
- Hardening, convergence, full evidence, and commit require all stories green.

## Parallel Execution Examples

- T008-T014 are safe as separate red-test files, except edits to shared pgTAP
  files are serialized.
- Within each story, unit, HTTP contract, and live integration red tests are safe
  in parallel because they edit distinct files.
- T096 and T097 are independent after US6; T099/T100 may proceed beside them.
- Review tasks T102-T104 inspect the same stable diff and may collect findings
  independently, but fixes and verification remain serial.
- Migration SQL, `planning.repository.ts`, `planning.service.ts`,
  `planning.controller.ts`, `sync.handlers.ts`, package scripts, and workflow YAML
  are always edited serially.

## Implementation Strategy

1. Freeze artifacts and pass the cross-artifact audit.
2. Establish exact database/security/module foundations with red pgTAP/contracts.
3. Deliver one P1 vertical slice at a time: salary, budgets, obligations,
   payments/matches, savings.
4. Add the aggregate/jobs/reconciliation/parity slice only after source domains
   are correct.
5. Use existing platform/ledger/sync patterns and no new dependency or
   speculative adapter/cache.
6. Harden, converge, review, run all local gates, then commit scoped work on
   local `main` without remote/destructive actions.

## Completion Rule

A task is checked only after its named command/procedure ran successfully and
evidence is retained. Tests must be observed red for the intended missing
behavior before production code and green afterward. External-only checks remain
pending because push is prohibited. Phase 07 is not complete while any locally
executable task, acceptance criterion, DoD item, Critical/High finding, test,
reconciliation difference, or scope violation remains.

## Phase 9: Convergence

- [x] T114 Put `planning.overdue.mark` behind the shared bounded claim/lease/execution fence and add per-job stale/reclaim regression coverage per FR-046, SC-010, and plan: Worker And Recovery Flow (partial)
- [x] T115 Extend representative Mobile planning import mapping/tests beyond salary to preserve root/dependent stable IDs, versions, lifecycle, exact money, and account/category/transaction links with quarantine per FR-054 and SC-011 (partial)
- [x] T116 Align the reminder selection contract with the explicit obligation reminder preference actually owned by Phase 07 per FR-047 and plan: contracts/events-jobs (contradicts)
- [x] T117 Remove the unsupported Admin purpose-check claim from secondary mapping/evidence while retaining the normative `planning.read` read-only boundary per FR-050 (contradicts)
