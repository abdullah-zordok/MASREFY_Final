# Tasks: Tracking, Imports, Parsers & Deduplication

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`  
**Spec**: Phase 08 / SPEC-BE-008  
**Branch**: existing `main` checkout only  
**Method**: TDD; each changed behavior is demonstrated red before implementation and green afterward

## Phase 1: Baseline, Artifacts, And Existing Contract Review

**Goal**: Preserve the checkout, repair the inherited main failure, prove all
dependencies, and freeze one complete Phase 08 contract package.

- [x] T001 Capture branch, HEAD/origin divergence, worktrees, status, and preserved `.agents/plugins/` evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/baseline.md`
- [x] T002 Diagnose the failed main Outbox P99 using workflow artifacts, query plans, and local reproduction; record root cause and unchanged thresholds in `apps/api/specs/008-tracking-imports-deduplication/evidence/outbox-remediation.md`
- [x] T003 Add a failing transaction-setting assertion in `supabase/tests/003_outbox_functions.test.sql`, implement the recoverable lease-only async commit in `supabase/migrations/20260902083036_outbox_claim_async_commit.sql`, and rerun pgTAP plus the one-million-row performance test green
- [x] T004 Verify SPEC-BE-001 through SPEC-BE-007 schema/API/outbox/ledger/idempotency/sync/planning dependencies and distinguish external evidence gaps in `apps/api/specs/008-tracking-imports-deduplication/evidence/dependencies.md`
- [x] T005 Inventory every Mobile tracking method/field/route and Admin imports/parsers route/permission/mock boundary in `apps/api/specs/008-tracking-imports-deduplication/evidence/client-contracts.md`
- [x] T006 Record absent SpecKit setup scripts/hooks and the checked-in template/feature-pointer fallback in `apps/api/specs/008-tracking-imports-deduplication/evidence/tooling.md`
- [x] T007 Validate specification, plan, research, data model, OpenAPI/parser/events/client contracts, links, counts, YAML, operation IDs, and unresolved markers in `apps/api/specs/008-tracking-imports-deduplication/evidence/artifacts.md`
- [x] T008 Run `speckit-analyze`, resolve every Critical/High artifact finding, and retain final metrics in `apps/api/specs/008-tracking-imports-deduplication/evidence/artifact-analysis.md`
- [x] T009 Run `speckit-converge`, append any uncovered implementation work to this file without renumbering completed tasks, and retain findings in `apps/api/specs/008-tracking-imports-deduplication/evidence/convergence.md`

**Checkpoint**: implementation starts only after every Critical/High artifact issue
is resolved and no missing dependency is misclassified as external.

---

## Phase 2: Blocking Database And Module Foundations

**Goal**: Establish all 19 tables, deny-by-default access, migrations, shared DTOs,
module wiring, parser primitives, and failing-first verification used by every story.

### Red Tests

- [x] T010 [P] Add failing 19-table/column/default/check/FK/index/trigger inventory assertions in `supabase/tests/033_tracking_structure.test.sql`; run against the pre-Phase-08 schema and retain the missing-object result
- [x] T011 [P] Add failing owner/cross-owner/anonymous/Admin/API/worker/service-role forced-RLS, grant, ownership, and function-search-path assertions in `supabase/tests/034_tracking_rls_grants.test.sql`; retain the expected failure
- [x] T012 [P] Add failing owner-command, transition, version, retention, duplicate, ledger-fence, audit, outbox, and seed assertions in `supabase/tests/035_tracking_commands.test.sql`; retain the expected failure
- [x] T013 [P] Add failing claim/fence/retry/exhaustion/purge/reconciliation assertions in `supabase/tests/036_tracking_jobs.test.sql`; retain the expected failure
- [x] T014 [P] Add failing strict DTO, UUID/cursor/version/idempotency/source/size/integer/action tests in `apps/api/test/unit/tracking/tracking.dto.spec.ts`; retain the missing-module result
- [x] T015 [P] Add failing safe-pattern/DSL/UTF-8/CSV/signature/formula/normalization parser tests in `apps/api/test/unit/tracking/tracking.parser.spec.ts`; retain the missing-module result
- [x] T016 [P] Add failing module registration, worker bootstrap, and graceful-shutdown tests in `apps/api/test/container/tracking.container-spec.ts`; retain the missing-module result
- [x] T017 [P] Add failing Phase 08 OpenAPI/auth/error/idempotency/UUID/raw-redaction and operation coverage tests in `apps/api/test/contract/tracking/tracking.contract-spec.ts`; retain the missing-runtime result

### Minimal Foundation Implementation

- [x] T018 Create all 19 Phase 08 public/private tables, composite ownership FKs, lifecycle checks, generated/version metadata, partial/composite/covering indexes, and triggers in `supabase/migrations/20260902120000_phase08_tracking_tables.sql`; rerun T010 to its next boundary
- [x] T019 Add deterministic fictional institutions, senders, parser rules/versions/corpus, bilingual keyword groups, merchant/category reference rules, and no customer facts in `supabase/migrations/20260902120200_phase08_tracking_access_seeds.sql`; verify seed idempotency in T012
- [x] T020 Enable/force RLS, revoke defaults including `service_role`, add owner-read policies, narrow API/worker execution grants, and permission-checked Admin projections in `supabase/migrations/20260902120200_phase08_tracking_access_seeds.sql`; rerun T011 green
- [x] T021 Add security-definer owner commands, list/detail projections, state transitions, immutable history/audit/outbox helpers, and bounded job functions in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T012/T013 to story-specific red boundaries
- [x] T022 Update migration checksums and exact migration function/table inventories in `supabase/migration-checksums.sha256` and `apps/api/test/e2e/migration-apply.e2e-spec.ts`; reset from zero and verify historical hashes unchanged
- [x] T023 Implement allowlisted DTOs, exact integer/date/cursor mapping, status/action enums, and safe Phase 08 errors in `apps/api/src/tracking/tracking.dto.ts` and `apps/api/src/platform/http/safe-exception.filter.ts`; rerun T014 green
- [x] T024 Implement bounded UTF-8/CSV validation, safe-pattern DSL validation/execution, normalization, and deterministic hash helpers in `apps/api/src/tracking/tracking.parser.ts`; rerun T015 green
- [x] T025 Implement safe event builders and bounded metrics with no identifier/cardinality/raw labels in `apps/api/src/tracking/tracking.events.ts` and `apps/api/src/tracking/tracking.observability.ts`; verify focused unit tests
- [x] T026 Create `TrackingRepository`, `TrackingService`, `TrackingController`, and `TrackingModule` using existing pool/auth/idempotency conventions in `apps/api/src/tracking/`; rerun T017 to story-specific red results
- [x] T027 Register API/worker modules, OpenAPI fragment, privacy handler, support `import-summary`, closed error codes, and worker shutdown in `apps/api/src/app.module.ts`, `apps/api/src/worker.module.ts`, `apps/api/src/worker.ts`, `apps/api/src/platform/http/openapi.ts`, and `apps/api/src/security/`; rerun T016 and platform manifest tests green

**Gate**: all owned objects exist with forced RLS and minimum grants; module shells
compile; no story behavior is claimed before its independent test passes.

---

## Phase 3: User Story 1 - Control Automatic Tracking (P1)

**Goal**: Owner-isolated preferences plus bilingual keyword and sender rules with
stable defaults, derived use metadata, concurrency control, and complete history.

**Independent test**: two owners update preferences/rules concurrently, restore
defaults, and prove isolation, exact versions, idempotent replay, and history.

### Red Tests

- [x] T028 [P] [US1] Add failing preference/default/enable/review/retention/version/history pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T029 [P] [US1] Add failing keyword/sender create-update-delete-restore/trust/normalization/ownership/concurrency pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T030 [P] [US1] Add failing preference/rule DTO, service, replay, stale-version, and safe-error tests in `apps/api/test/unit/tracking/tracking.preferences.spec.ts`; retain expected failure
- [x] T031 [P] [US1] Add failing owner HTTP preferences/status/keyword/sender route and pagination tests in `apps/api/test/contract/tracking/tracking.preferences.contract-spec.ts`; retain expected failure
- [x] T032 [P] [US1] Add failing live two-owner RLS, command, replay, restore, and history scenarios in `apps/api/test/integration/tracking/tracking.preferences.integration.spec.ts`; retain expected failure

### Implementation

- [x] T033 [US1] Implement preference create/read/update and bounded retention decisions in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun preference pgTAP green
- [x] T034 [US1] Implement owner keyword and sender rule commands, canonical uniqueness, reference restore, derived-use reads, history, audit, and safe events in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun rule pgTAP green
- [x] T035 [US1] Implement preference/rule repository and service orchestration with Phase 06 replay and expected-version handling in `apps/api/src/tracking/tracking.repository.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T030 green
- [x] T036 [US1] Add preferences/status/keyword/sender routes and exact response mapping in `apps/api/src/tracking/tracking.controller.ts`; rerun T031/T032 green
- [x] T037 [P] [US1] Add a live API adapter preserving `AutomaticTrackingService` and UUID DTO parity in `apps/mobile/src/services/live/automatic-tracking-service.ts` with failing-first tests in `apps/mobile/src/services/live/automatic-tracking-service.test.ts`
- [x] T038 [US1] Switch production tracking selection to the live adapter while keeping explicit demo/test fixtures in `apps/mobile/src/services/mocks/automatic-tracking-service.ts`; rerun tracking capability and journey tests
- [x] T039 [US1] Map mode/keyword/sender origin, language, group, trusted, and use fields in `apps/mobile/src/services/contracts/automatic-tracking-service.ts`; verify existing UI journeys remain unchanged
- [x] T040 [US1] Add Mobile owner-rule HTTP fixture parity and offline/error behavior tests in `apps/mobile/src/services/contracts/automatic-tracking-api-parity.test.ts`; run focused Mobile tests green
- [x] T041 [US1] Capture preference/rule isolation, replay, concurrency, defaults, Mobile parity, history, event, and retention evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/us1-tracking-controls.md`

**Checkpoint**: one owner cannot observe or mutate another owner's configuration;
defaults restore deterministically and production never selects mock data implicitly.

---

## Phase 4: User Story 2 - Submit And Track An Import (P1)

**Goal**: Safely ingest normalized JSON or one bounded UTF-8 CSV, identify senders,
parse with an immutable version, and expose isolated session/item progress.

**Independent test**: valid JSON and CSV replay to one session; hostile, oversize,
binary, archive, malformed encoding, and unsupported inputs persist no raw bytes and
produce safe errors/unsupported summaries.

### Red Tests

- [x] T042 [P] [US2] Add failing import session/item/attempt/raw-reference/unsupported lifecycle and retention pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T043 [P] [US2] Add failing claim token, lease expiry/reclaim, retry, terminal, and session aggregation pgTAP cases in `supabase/tests/036_tracking_jobs.test.sql`; retain expected failure
- [x] T044 [P] [US2] Extend parser tests for BOM/UTF-16/NUL/control/bidi/traversal/archive/PDF/image/Office/MIME-signature/row-column-cell limits in `apps/api/test/unit/tracking/tracking.parser.spec.ts`; retain expected failure
- [x] T045 [P] [US2] Add failing imports create/replay/list/session/item/raw-redaction/media/limit contracts in `apps/api/test/contract/tracking/tracking.imports.contract-spec.ts`; retain expected failure
- [x] T046 [P] [US2] Add failing live valid/hostile/no-storage-on-reject/ownership/replay/worker-crash scenarios in `apps/api/test/integration/tracking/tracking.imports.integration.spec.ts`; retain expected failure
- [x] T047 [P] [US2] Add failing end-to-end private-object/reference/orphan-reconcile/purge cases in `apps/api/test/e2e/tracking/tracking-ingestion.e2e-spec.ts`; retain expected failure

### Implementation

- [x] T048 [US2] Implement strict JSON/text-CSV request handling without relaxing global content validation in `apps/api/src/tracking/tracking.controller.ts` and `apps/api/src/tracking/tracking.parser.ts`; rerun hostile contract/unit cases green
- [x] T049 [US2] Implement create/replay/list/detail repository transactions, generated private object keys, content hashes, and no-overwrite storage orchestration in `apps/api/src/tracking/tracking.repository.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T045/T047 green
- [x] T050 [US2] Implement sender/institution identification and immutable parser-version selection in `apps/api/src/tracking/tracking.parser.ts` and `apps/api/src/tracking/tracking.service.ts`; verify corpus-backed fixture cases
- [x] T051 [US2] Implement parse job claim/execute/complete, attempts, retries, exhaustion, unsupported handling, safe audit/outbox, and explicit worker IDs in `apps/api/src/tracking/tracking.worker.ts`; rerun T043/T046 green
- [x] T052 [US2] Register parse/purge/reconciliation workers and graceful shutdown in `apps/api/src/worker.module.ts` and `apps/api/src/worker.ts`; verify container and interruption tests
- [x] T053 [US2] Implement bounded raw-payload retention, idempotent deletion, orphan reconciliation, session rollup, and manual retry in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T042/T047 green
- [x] T054 [US2] Map normalized Mobile capture events and detected results to Phase 08 JSON while preserving explicit demo mode in `apps/mobile/src/services/live/automatic-tracking-service.ts`; rerun tracking journeys
- [x] T055 [US2] Add parser/import safe events and bounded import/worker metrics in `apps/api/src/tracking/tracking.events.ts` and `apps/api/src/tracking/tracking.observability.ts`; verify no raw or high-cardinality fields
- [x] T056 [US2] Add hostile-ingestion and parser-corpus fixtures under `apps/api/test/fixtures/tracking/` with provenance and only fictional data; verify every fixture has one expected literal result
- [x] T057 [US2] Capture accepted/rejected inputs, zero-byte-on-reject, replay, isolation, parser version, worker recovery, retention, and Mobile mapping evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/us2-imports.md`

**Checkpoint**: hostile input cannot reach storage or a parser; accepted bytes are
private, bounded, versioned, expiring, and never returned by an API/event/log.

---

## Phase 5: User Story 3 - Review And Accept A Proposal (P1)

**Goal**: Review ambiguous proposals, preserve edits, and create at most one ledger
transaction through SPEC-BE-005 with complete history and replay evidence.

**Independent test**: edit-accept one ambiguous item twice with the same key and
after a worker crash; exactly one matching ledger transaction exists and no direct
ledger mutation path is reachable.

### Red Tests

- [x] T058 [P] [US3] Add failing review create/list/detail/accept/reject/edit/version/terminal/history pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T059 [P] [US3] Add failing review DTO/edit allowlist/safe-integer/service/replay/stale/error tests in `apps/api/test/unit/tracking/tracking.review.spec.ts`; retain expected failure
- [x] T060 [P] [US3] Add failing review owner HTTP list/detail/decision/raw-redaction contracts in `apps/api/test/contract/tracking/tracking.review.contract-spec.ts`; retain expected failure
- [x] T061 [P] [US3] Add failing live owner/cross-owner/edit-accept/reject/concurrent/replay/ledger-conflict/crash scenarios in `apps/api/test/integration/tracking/tracking.review.integration.spec.ts`; retain expected failure
- [x] T062 [P] [US3] Add a structural test forbidding Phase 08 direct ledger repository/function/table calls in `apps/api/test/security/tracking/tracking-ledger-boundary.spec.ts`; retain expected failure

### Implementation

- [x] T063 [US3] Implement versioned review create/read/decision/history/audit/outbox functions with immutable raw proposal evidence in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T058 green
- [x] T064 [US3] Implement review repository/service orchestration, edit allowlist, safe integer boundary, and exact status mapping in `apps/api/src/tracking/tracking.repository.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T059 green
- [x] T065 [US3] Integrate accept/edit-accept only through `LedgerService.createTransaction()` using stable source/externalRef/idempotency and matching-command replay in `apps/api/src/tracking/tracking.service.ts`; rerun T061/T062 green
- [x] T066 [US3] Add review list/detail/decision routes and safe response mapping in `apps/api/src/tracking/tracking.controller.ts`; rerun T060 green
- [x] T067 [US3] Map Mobile review actions and edited acceptance to API DTOs in `apps/mobile/src/services/live/automatic-tracking-service.ts`; rerun `ReviewJourney` and resolution tests
- [x] T068 [US3] Implement undo through the existing ledger undo/reversal command followed by Phase 08 history/feedback in `apps/mobile/src/services/live/automatic-tracking-service.ts`; verify no local balance mutation
- [x] T069 [US3] Add acceptance job crash-after-ledger recovery and reconciliation in `apps/api/src/tracking/tracking.worker.ts`; prove repeated completion links the existing transaction
- [x] T070 [US3] Add safe review/acceptance metrics, events, and audit reason codes in `apps/api/src/tracking/tracking.events.ts` and `apps/api/src/tracking/tracking.observability.ts`; verify payload redaction
- [x] T071 [US3] Capture edited acceptance, ledger-only boundary, replay/crash, isolation, history, event/audit, undo, and Mobile parity evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/us3-review.md`

**Checkpoint**: every acceptance is an explicit owner/admin decision or configured
auto-accept, every edit is preserved, and ledger posting is exactly-once observable.

---

## Phase 6: User Story 4 - Resolve A Duplicate Transparently (P1)

**Goal**: Deterministic duplicate candidates, bounded explanations, and four
idempotent owner resolutions without silent deletion or double posting.

**Independent test**: below/at/above threshold fixtures and concurrent decisions
produce stable scores/reasons and one terminal effect for each resolution.

### Red Tests

- [x] T072 [P] [US4] Add failing deterministic score/reason/band/pair uniqueness/threshold/version pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T073 [P] [US4] Add failing duplicate resolution/expected-version/history/audit/outbox/ledger-fence pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T074 [P] [US4] Add failing score normalization/explanation/resolution/replay/stale tests in `apps/api/test/unit/tracking/tracking.duplicate.spec.ts`; retain expected failure
- [x] T075 [P] [US4] Add failing duplicate list/detail/four-decision/raw-redaction contracts in `apps/api/test/contract/tracking/tracking.duplicate.contract-spec.ts`; retain expected failure
- [x] T076 [P] [US4] Add failing live threshold/ownership/concurrency/crash/ledger-conflict/four-resolution scenarios in `apps/api/test/integration/tracking/tracking.duplicate.integration.spec.ts`; retain expected failure

### Implementation

- [x] T077 [US4] Implement versioned deterministic duplicate scoring, bounded reason evidence, pair uniqueness, and candidate creation in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T072 green
- [x] T078 [US4] Implement compare-and-set `keep_existing`, `keep_new`, `keep_both`, and `merge_details` state/history/audit/outbox functions in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T073 green
- [x] T079 [US4] Implement duplicate repository/service scoring and decision orchestration with ledger create/update commands only in `apps/api/src/tracking/tracking.repository.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T074/T076 green
- [x] T080 [US4] Add duplicate list/detail/decision routes and explanations in `apps/api/src/tracking/tracking.controller.ts`; rerun T075 green
- [x] T081 [US4] Map all four Mobile duplicate resolutions and UUIDs in `apps/mobile/src/services/live/automatic-tracking-service.ts`; rerun duplicate comparison journeys
- [x] T082 [US4] Add duplicate worker evaluation/retry/reconciliation using stable item identity in `apps/api/src/tracking/tracking.worker.ts`; verify crash and retry cases
- [x] T083 [US4] Add bounded duplicate score/backlog/decision metrics and safe events in `apps/api/src/tracking/tracking.observability.ts` and `apps/api/src/tracking/tracking.events.ts`; verify labels and payloads
- [x] T084 [US4] Capture thresholds, explanations, uniqueness, concurrency, four decisions, ledger fence, events, and Mobile parity in `apps/api/specs/008-tracking-imports-deduplication/evidence/us4-duplicates.md`

**Checkpoint**: identical inputs yield identical versioned scores and reasons;
retries/concurrency cannot create a second candidate or ledger effect.

---

## Phase 7: User Story 5 - Maintain Safe Parsers And Rules (P2)

**Goal**: Permissioned Admin stewardship of institutions, senders, parser versions,
corpus, merchant/category rules, and rollback with no executable parser content.

**Independent test**: a draft with passing, failing, and hostile corpus cases cannot
publish until all required cases pass; publish/rollback are versioned, audited,
permission-checked, recent-MFA protected, and affect only new claims.

### Red Tests

- [x] T085 [P] [US5] Add failing parser draft/publish/retire/rollback/immutable-version/corpus-gate pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T086 [P] [US5] Add failing institution/sender and merchant/category rule lifecycle/priority/overlap/version pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T087 [P] [US5] Add failing DSL size/depth/clause/operator/URL/code/regex/adversarial-budget/corpus tests in `apps/api/test/unit/tracking/tracking.parser.spec.ts`; retain expected failure
- [x] T088 [P] [US5] Add failing API and Admin-Web imports/parsers HTTP-adapter, production-mock-boundary, exact-permission, recent-MFA, reason, version, replay, and redaction contracts in `apps/api/test/contract/tracking/tracking.admin.contract-spec.ts` and `apps/admin-web/src/features/imports/repository.test.ts`; retain expected failure
- [x] T089 [P] [US5] Add failing live Admin permission/rollback/corpus/concurrency/audit scenarios in `apps/api/test/integration/tracking/tracking.admin.integration.spec.ts`; retain expected failure
- [x] T090 [P] [US5] Add failing exact-permission/service-role/raw-reference/unsafe-parser security checks in `apps/api/test/security/tracking/tracking-boundaries.spec.ts`; retain expected failure

### Implementation

- [x] T091 [US5] Implement institution/sender and parser rule/version/corpus Admin read/mutation functions with exact permission and recent-MFA checks in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T085/T089 green
- [x] T092 [US5] Implement merchant/category rule Admin functions, priority determinism, overlap decisions, expected version, audit, and safe outbox in `supabase/migrations/20260902120100_phase08_tracking_functions.sql`; rerun T086 green
- [x] T093 [US5] Implement parser draft validation, corpus execution, publish gate, immutable published versions, and rollback selection in `apps/api/src/tracking/tracking.parser.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T087 green
- [x] T094 [US5] Add exact-permission Admin imports/parsers/settings controllers and DTOs in `apps/api/src/tracking/tracking.admin.controller.ts` and `apps/api/src/tracking/tracking.dto.ts`; rerun T088/T090 green
- [x] T095 [US5] Implement bounded permission-checked Admin projections and mutations in `apps/api/src/tracking/tracking.repository.ts`; verify no owner RLS widening
- [x] T096 [US5] Replace Admin imports/parsers repository mock routing with authenticated HTTP while retaining explicit mock opt-in in `apps/admin-web/src/features/imports/repository.ts`; rerun repository tests
- [x] T097 [US5] Align Admin UUID DTOs, actions, reason/version/idempotency, safe text, and source/unsupported mapping in `apps/admin-web/src/features/imports/contracts.ts` and `apps/admin-web/src/features/imports/hooks.ts`; rerun contract/hook tests
- [x] T098 [US5] Make Admin mocks disabled by default and remove the fixture-only hard-coded confirmation token in `apps/admin-web/src/app/MockProvider.tsx`, `apps/admin-web/src/core/api/client.ts`, and `apps/admin-web/src/mocks/handlers/imports.ts`; rerun production-boundary tests
- [x] T099 [US5] Update fictional Admin fixtures to exact OpenAPI parity without operational/customer seed data in `apps/admin-web/src/mocks/fixtures/imports.ts` and `apps/admin-web/src/mocks/phase4-import-state.ts`; rerun import/parser component and Playwright tests
- [x] T100 [US5] Capture corpus gate, hostile DSL, permissions/MFA, publish/rollback, seeds, Admin cutover, audit/events, and immutable-version evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/us5-parsers.md`

**Checkpoint**: no parser content executes as code or performs I/O; only a fully
passing version may publish, and prior in-flight items retain their selected version.

---

## Phase 8: User Story 6 - Operate And Recover Imports (P2)

**Goal**: Bounded Admin operations, tracking feedback/history, observability,
retention, reconciliation, backup/restore, and crash-safe operational recovery.

**Independent test**: permission-scoped operators resolve/retry/cancel safely,
workers recover stale leases and drift, raw expiry purges, and rollback/forward plus
backup/restore preserve all non-expired canonical state.

### Red Tests

- [x] T101 [P] [US6] Add failing Admin overview/session/failure/low-confidence/duplicate/unsupported projection and action pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T102 [P] [US6] Add failing feedback/history/clear/retention/privacy-delete/export/support-summary pgTAP cases in `supabase/tests/035_tracking_commands.test.sql`; retain expected failure
- [x] T103 [P] [US6] Add failing worker cancel/retry/reclaim/purge/reconcile/backlog-limit/exhaustion pgTAP cases in `supabase/tests/036_tracking_jobs.test.sql`; retain expected failure
- [x] T104 [P] [US6] Add failing worker orchestration/jitter/fence/shutdown/metrics unit tests in `apps/api/test/unit/tracking/tracking.worker.spec.ts`; retain expected failure
- [x] T105 [P] [US6] Add failing Admin operational and owner history/feedback/privacy/support integration scenarios in `apps/api/test/integration/tracking/tracking.operations.integration.spec.ts`; retain expected failure
- [x] T106 [P] [US6] Add failing rollback-forward and backup-restore/raw-expiry recovery scenarios in `apps/api/test/e2e/tracking/tracking-recovery.e2e-spec.ts`; retain expected failure

### Implementation

- [x] T107 [US6] Implement bounded Admin operational projections/actions with exact permissions, reason, recent MFA, expected version, replay, audit, and events in `apps/api/src/tracking/tracking.admin.controller.ts` and `apps/api/src/tracking/tracking.service.ts`; rerun T101/T105 green
- [x] T108 [US6] Implement feedback/history list/clear/compaction and privacy export/deletion in `apps/api/src/tracking/tracking.repository.ts` and `apps/api/src/tracking/tracking-privacy.handler.ts`; rerun T102/T105 green
- [x] T109 [US6] Replace only the existing support `import-summary` unavailable projection with bounded status/count data in `apps/api/src/security/security.repository.ts`; verify purpose/permission and redaction tests
- [x] T110 [US6] Implement retry/cancel/purge/retention/reconciliation worker paths and metrics in `apps/api/src/tracking/tracking.worker.ts` and `apps/api/src/tracking/tracking.observability.ts`; rerun T103/T104 green
- [x] T111 [US6] Add deterministic one-million-row plan/latency fixtures and Phase 08 performance runner in `apps/api/test/performance/tracking.sql`, `apps/api/test/performance/tracking.k6.js`, and `apps/api/test/performance/run-tracking.ts`; verify explained indexes and unchanged declared thresholds
- [x] T112 [US6] Add queue contention/crash/retry/parser-adversarial/duplicate concurrency stress scenarios to `apps/api/test/performance/tracking.k6.js`; run stress gate and retain the summary
- [x] T113 [US6] Extend migration rollback/forward and backup/restore harnesses for all Phase 08 public/private objects and raw-retention metadata in `apps/api/test/e2e/tracking/tracking-recovery.e2e-spec.ts`; rerun T106 green
- [x] T114 [US6] Add Phase 08 dashboards, alert rules, and bounded metric registration using existing observability configuration in `ops/observability/` and `apps/api/src/platform/observability/platform-metrics.ts`; validate configuration and cardinality
- [x] T115 [US6] Add hostile upload, provider/Storage outage, parser rollback, stuck worker, duplicate correction, purge, reconciliation, restore, and emergency-disable procedures in `docs/runbooks/tracking-imports.md`; execute every local procedure possible
- [x] T116 [US6] Capture operations, permissions, privacy/support, worker recovery, performance/stress, retention, reconciliation, restore, observability, and external-only gates in `apps/api/specs/008-tracking-imports-deduplication/evidence/us6-operations.md`

**Checkpoint**: operators see only purpose-bound redacted data; every job is
reclaimable and idempotent; retention/recovery preserve required financial traces.

---

## Final Phase: Hardening, Convergence, And Acceptance

- [x] T117 Run post-implementation `speckit-analyze`, resolve every Critical/High artifact/code coverage gap, and update `apps/api/specs/008-tracking-imports-deduplication/evidence/artifact-analysis.md`
- [x] T118 Run post-implementation `speckit-converge`, append and complete every genuinely missing task, and update `apps/api/specs/008-tracking-imports-deduplication/evidence/convergence.md`
- [x] T119 Run focused pgTAP, unit, contract, integration, E2E, RLS, security, parser-corpus, migration, recovery, Mobile, and Admin tests; record exact counts/results in `apps/api/specs/008-tracking-imports-deduplication/evidence/local-feature-gates.md`
- [x] T120 Run full database reset/lint/pgTAP and API format/type/lint/test/build/checksum/audit gates; record exact results in `apps/api/specs/008-tracking-imports-deduplication/evidence/local-release.md`
- [x] T121 Run full Mobile and Admin format/type/lint/unit/component/Playwright/build gates and record exact results in `apps/api/specs/008-tracking-imports-deduplication/evidence/local-release.md`
- [x] T122 Run Outbox plus Phase 08 performance/stress suites on clean deterministic fixtures, verify declared P95/P99/error/throughput thresholds without weakening, and store summaries under `apps/api/test/performance/artifacts/`
- [x] T123 Run rollback/forward, migration concurrency, backup/restore, privacy deletion/export, raw purge, orphan reconciliation, and crash-recovery gates and update `apps/api/specs/008-tracking-imports-deduplication/evidence/recovery.md`
- [x] T124 Run relevant Supabase/PostgreSQL best-practice review for queries, locks, policies, indexes, functions, vacuum/analyze, and query plans; capture findings in `apps/api/specs/008-tracking-imports-deduplication/evidence/database-review.md`
- [x] T125 Run Clean Code/SOLID/DRY/KISS/YAGNI review of the production diff, fix confirmed issues, and retain findings in `apps/api/specs/008-tracking-imports-deduplication/evidence/clean-code-review.md`
- [x] T126 Run test-quality review, remove tautological/source-grep/mirrored tests, verify failure sensitivity, and retain findings in `apps/api/specs/008-tracking-imports-deduplication/evidence/test-review.md`
- [x] T127 Run security diff review for hostile input, RLS/grants, permissions, data exposure, parser DSL, idempotency, storage, and dependency risk; fix findings and retain evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/security-review.md`
- [x] T128 Run independent code review against spec/plan/tasks/contracts and fix every verified issue; retain findings in `apps/api/specs/008-tracking-imports-deduplication/evidence/code-review.md`
- [x] T129 Map every FR/AC/SC and all 19 tables/routes/jobs/events/client flows to passing evidence in `apps/api/specs/008-tracking-imports-deduplication/evidence/acceptance.md`
- [x] T130 Complete the requirements and Definition-of-Done checklists with no unsupported claim in `apps/api/specs/008-tracking-imports-deduplication/checklists/requirements.md` and `apps/api/specs/008-tracking-imports-deduplication/evidence/definition-of-done.md`
- [x] T131 Verify no SPEC-BE-009 or later table/route/job/event/client behavior appears in the diff and record the ownership audit in `apps/api/specs/008-tracking-imports-deduplication/evidence/final-audit.md`
- [x] T132 Commit the artifact package on `main` with a narrow message after format/YAML/link checks pass; record SHA in `apps/api/specs/008-tracking-imports-deduplication/evidence/commits.md`
- [x] T133 Commit database migrations/tests/checksums on `main` with a narrow message after reset/lint/pgTAP/recovery pass; record SHA in `apps/api/specs/008-tracking-imports-deduplication/evidence/commits.md`
- [x] T134 Commit API/workers/contracts/tests on `main` with a narrow message after focused API gates pass; record SHA in `apps/api/specs/008-tracking-imports-deduplication/evidence/commits.md`
- [x] T135 Commit Mobile/Admin cutover and tests on `main` with a narrow message after client gates pass; record SHA in `apps/api/specs/008-tracking-imports-deduplication/evidence/commits.md`
- [ ] T136 Fetch origin, verify zero-behind and clean tracked state while preserving `.agents/plugins/` and existing worktrees, then push commits directly to `origin/main`
- [ ] T137 Monitor the pushed main workflow to terminal success; diagnose and fix forward every required failure, rerun local affected/full gates, commit/push narrowly, and update `apps/api/specs/008-tracking-imports-deduplication/evidence/remote.md`
- [x] T138 Record any genuinely external provider/account/hosted/live-alert evidence gates separately without blocking locally executable work in `apps/api/specs/008-tracking-imports-deduplication/evidence/external-gates.md`
- [ ] T139 Verify all task checkboxes and acceptance criteria are evidenced, capture final SHA/push/CI/counts in `apps/api/specs/008-tracking-imports-deduplication/evidence/final-summary.md`, and mark the goal complete only after all required local/remote gates succeed

## Dependencies

```text
Phase 1 artifacts and dependency proof
  -> Phase 2 schema/security/module foundations
  -> US1 owner configuration
  -> US2 ingestion and parsing
  -> US3 review and ledger acceptance
  -> US4 duplicate decisions
  -> US5 Admin parser stewardship
  -> US6 operations and recovery
  -> final convergence, review, verification, delivery
```

US1 and the reference-read parts of US5 can proceed after Phase 2. US3 requires a
parsed/review item from US2. US4 requires a parsed proposal and existing ledger
transaction, so it follows US2 and the ledger-acceptance boundary established in
US3. US6 consumes every prior lifecycle and is last.

## Parallel Execution Examples

- After T009: T010–T017 use separate database/unit/contract/container files.
- After T027: US1 database, API, and Mobile red tests T028–T032 can run together.
- During US2: hostile parser tests T044, HTTP contracts T045, live database T046,
  and Storage lifecycle E2E T047 are independent red checks.
- During US3/US4: unit, contract, integration, and structural security tests are
  parallel until implementation touches their shared service/repository files.
- During US5: database lifecycle, parser DSL, Admin contract/integration, and
  security red tests T085–T090 use distinct files.
- Final reviews T124–T128 are read-only initially and may run in parallel only
  after T123; confirmed fixes are serialized and all affected gates rerun.

## Implementation Strategy

The smallest independently useful increment is US1 after the secure database/module
foundation. Continue in dependency order so every later story reuses the same
commands, parser, replay, and ledger boundary. Do not add a new queue, sync domain,
storage SDK, parser package, or binary-format adapter unless an existing required
test proves the installed platform cannot satisfy the contract.

## Completion Rule

Do not check a task or claim a result unless its command/procedure ran successfully
and retained evidence. External provider/account proof may remain explicitly gated;
no local database, worker, client, security, migration, recovery, performance, or CI
gate may be skipped. SPEC-BE-009 and later work is prohibited.
