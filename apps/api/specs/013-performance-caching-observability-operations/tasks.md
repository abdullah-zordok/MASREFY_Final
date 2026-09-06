# Tasks: Performance, Caching, Observability & Operations

**Input**: `apps/api/specs/013-performance-caching-observability-operations/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Scope**: SPEC-BE-013 only; Free-only MVP; SPEC-BE-012 billing and SPEC-BE-014 launch remain deferred
**Tests**: Required and written before each non-trivial behavior

Every task uses the repository's existing modules, dependencies, scripts, and client seams. The protected user-owned paths listed in `quickstart.md` must never be staged, overwritten, stashed, reset, or cleaned.

## Phase 1: Baseline And Contract Review

- [x] T001 Record synchronized `main`, exact base SHA, zero divergence, and protected user-owned paths in `apps/api/specs/013-performance-caching-observability-operations/quickstart.md`; verify with `git status --short --branch` and `git rev-list --left-right --count main...origin/main`.
- [x] T002 [P] Validate every requirement, owned resource, permission, route, job, and success criterion is represented in `apps/api/specs/013-performance-caching-observability-operations/spec.md`; verify no unresolved marker with `rg -n "NEEDS CLARIFICATION|TBD|TODO" apps/api/specs/013-performance-caching-observability-operations`.
- [x] T003 [P] Parse and validate the operations OpenAPI contract in `apps/api/specs/013-performance-caching-observability-operations/contracts/openapi.yaml`; verify OAS 3.1.0 and 20 paths with `node -e "const fs=require('fs'),YAML=require('yaml');const d=YAML.parse(fs.readFileSync('specs/013-performance-caching-observability-operations/contracts/openapi.yaml','utf8'));if(d.openapi!=='3.1.0'||Object.keys(d.paths).length!==20)process.exit(1)"` from `apps/api`, then recursively verify every local schema reference resolves.
- [x] T004 [P] Reconcile the full existing job inventory and nine Phase 13 jobs in `apps/api/specs/013-performance-caching-observability-operations/contracts/jobs-events.md` against `apps/api/src`; verify every registered identifier has exactly one owner using `rg -n "job|schedule|worker" apps/api/src` and a documented comparison.
- [x] T005 [P] Reconcile Admin and Mobile mappings in `apps/api/specs/013-performance-caching-observability-operations/contracts/mobile-admin-mapping.md` against `apps/admin-web/src/features/system-health`, `apps/admin-web/src/features/governance`, and `apps/mobile/src/services`; verify every touched client contract maps to one OpenAPI route and contains no paid/billing projection.
- [x] T006 Run the SpecKit cross-artifact analysis over `apps/api/specs/013-performance-caching-observability-operations/spec.md`, `plan.md`, and `tasks.md`, resolve all CRITICAL/HIGH contradictions in those files, and retain a zero-blocker result before production edits.

---

## Phase 2: Blocking Foundations

**Gate**: Database objects, permissions, DTO boundaries, and module wiring pass focused tests before story implementation begins.

- [ ] T007 Add failing pgTAP structure assertions for all nine private tables, enum/check constraints, keys, relationships, and indexes in `supabase/tests/054_phase13_operations_schema.sql`; verify the new assertions fail before migration and are discovered by `npm run test:db` from `apps/api`.
- [ ] T008 [P] Add failing pgTAP authorization assertions for forced RLS, revoked API grants, exact operations permissions, and service-role-only functions in `supabase/tests/055_phase13_operations_security.sql`; verify pre-migration failure with `npm run test:db` from `apps/api`.
- [ ] T009 [P] Add failing migration-upgrade and checksum coverage for the Phase 13 migration in `apps/api/test/e2e/migration-apply.e2e-spec.ts` and `apps/api/test/e2e/migration-checksum.e2e-spec.ts`; verify the focused Jest tests fail before the migration exists.
- [ ] T010 Implement the nine private operational tables, bounded constraints, indexes, timestamps, and comments in `supabase/migrations/20260906130000_phase13_operations.sql`; verify `npm run db:reset && npm run db:lint && npm run test:db` from `apps/api` passes schema assertions.
- [ ] T011 Implement `private.register_job`, due-claim, attempt completion, bounded action, and `private.evaluate_feature_flag` functions in `supabase/migrations/20260906130000_phase13_operations.sql`; verify function signatures and transactional behavior with `npm run test:db` from `apps/api`.
- [ ] T012 Implement forced RLS, revoked grants, service-role execution boundaries, exact permission seeds, safe setting/flag defaults, and nine job registrations in `supabase/migrations/20260906130000_phase13_operations.sql`; verify `supabase/tests/055_phase13_operations_security.sql` passes and anonymous/authenticated direct access is denied.
- [ ] T013 Update `supabase/migration-checksums.sha256` using `npm run migration:checksums:update` from `apps/api`; verify `npm run migration:checksums` and focused migration Jest tests pass.
- [ ] T014 [P] Add failing unit tests for bounded DTO/schema parsing, cursor limits, action enums, provider allowlists, safe context keys, and secret-key rejection in `apps/api/test/unit/operations/operations-schemas.spec.ts`; verify failure with `npm run test:unit -- --runInBand --testPathPatterns=operations` from `apps/api`.
- [ ] T015 Implement the minimum request/query/response schemas in `apps/api/src/operations/operations.schemas.ts`; verify T014 passes with the focused unit command.
- [ ] T016 [P] Add failing contract tests for exact operations permission registration and MFA/guard enforcement in `apps/api/test/contract/operations/operations-permissions.contract-spec.ts`; verify failure with `npm run test:contract -- --runInBand --testPathPatterns=operations` from `apps/api`.
- [ ] T017 Register exact operations permissions in `apps/api/src/security/permission-manifest.ts`; verify T016 and the existing security scope tests pass.
- [ ] T018 Add the cohesive operations module shell in `apps/api/src/operations/operations.module.ts` and register it in `apps/api/src/app.module.ts` and `apps/api/src/worker.module.ts`; verify `npm run typecheck` from `apps/api` succeeds without adding a dependency.

---

## Phase 3: User Story 1 - Detect and Triage Operational Problems (P1)

**Goal**: Authorized operators can inspect bounded health, metrics, job, provider, and incident summaries without exposing secrets or high-cardinality data.

**Independent test**: `npm run test:contract -- --runInBand --testPathPatterns=operations && npm run test:integration -- --runInBand --testPathPatterns=operations` from `apps/api` returns zero failures for list/detail/read routes and redaction.

### Tests

- [ ] T019 [US1] Add failing repository integration tests for cursor pagination, filters, ordering, retention boundaries, and not-found behavior in `apps/api/test/integration/operations/operations-read.integration.spec.ts`; verify focused integration failure before implementation.
- [ ] T020 [P] [US1] Add failing HTTP contract tests for dashboard, jobs, job detail, providers, incidents, maintenance, settings, and flags read routes in `apps/api/test/contract/operations/operations-read.contract-spec.ts`; verify route/status/schema failure before implementation.
- [ ] T021 [P] [US1] Add failing provider allowlist, optional-provider outage isolation, redaction, and fixed-cardinality security tests in `apps/api/test/security/operations/operations-observability.security.spec.ts`; verify tests reject arbitrary destinations, tokens, credentials, email addresses, arbitrary labels, and raw provider bodies while core finance stays available.
- [ ] T022 [P] [US1] Add failing unit tests for dashboard aggregation and bounded safe projections in `apps/api/test/unit/operations/operations-service.spec.ts`; verify focused unit failure before implementation.

### Implementation

- [ ] T023 [US1] Implement parameterized bounded read queries and cursor pagination in `apps/api/src/operations/operations.repository.ts`; verify T019 passes.
- [ ] T024 [US1] Implement dashboard and detail projections with stable redaction in `apps/api/src/operations/operations.service.ts`; verify T022 and T021 pass.
- [ ] T025 [US1] Implement guarded read endpoints matching `contracts/openapi.yaml` in `apps/api/src/operations/operations.controller.ts`; verify T020 passes and OpenAPI drift remains green.
- [ ] T026 [US1] Extend fixed-cardinality counters/histograms/gauges in `apps/api/src/platform/observability/platform-metrics.ts`; verify T021 passes and no identifier/user/provider-message becomes a metric label.
- [ ] T027 [US1] Add operations dashboard panels in `ops/observability/operations-dashboard.json`; verify JSON parses and every query uses only documented metric names.
- [ ] T028 [US1] Add actionable health/provider/job/incident alerts in `ops/alerts/operations-alerts.yml`; verify YAML parses and each alert names a runbook URL.
- [ ] T029 [US1] Add linked triage procedures in `ops/runbooks/operations-triage.md` and record a timed deterministic drill in `apps/api/specs/013-performance-caching-observability-operations/evidence/triage.md`; verify every T028 alert anchor exists, commands contain no secret output, and an operator reaches the affected component and runbook within two minutes.

**Checkpoint**: US1 focused unit, contract, integration, and security suites pass independently.

---

## Phase 4: User Story 2 - Govern Schedules and Execution History (P1)

**Goal**: A central database-backed scheduler safely claims, dispatches, retries, cancels, pauses, resumes, and records known jobs without arbitrary execution.

**Independent test**: `npm run test:unit -- --runInBand --testPathPatterns=operations-worker && npm run test:integration -- --runInBand --testPathPatterns=operations-scheduler` from `apps/api` proves one claim/attempt under concurrency and bounded actions.

### Tests

- [ ] T030 [US2] Add failing pgTAP concurrency/lifecycle tests for registration idempotency, `FOR UPDATE SKIP LOCKED` claims, lease recovery, retries, terminal states, and action safety in `supabase/tests/056_phase13_job_lifecycle.sql`; verify pre-behavior failure with `npm run test:db`.
- [ ] T031 [P] [US2] Add failing table-driven unit tests for all nine exact Phase 13 job keys, the closed domain-handler registry, duplicate rejection, unknown-job rejection, timeout/retry decisions, and shutdown behavior in `apps/api/test/unit/operations/operations-worker.spec.ts`; verify focused unit failure.
- [ ] T032 [P] [US2] Add failing integration tests for dispatcher polling, concurrent workers, durable run/attempt history, cancel/retry/pause/resume, and recovery in `apps/api/test/integration/operations/operations-scheduler.integration.spec.ts`; verify focused integration failure.
- [ ] T033 [P] [US2] Add failing contract tests for job mutation routes, idempotency, MFA, permissions, conflicts, and audit correlation in `apps/api/test/contract/operations/operations-actions.contract-spec.ts`; verify focused contract failure.

### Implementation

- [ ] T034 [US2] Complete authoritative job lifecycle SQL in `supabase/migrations/20260906130000_phase13_operations.sql`; verify T030 passes under repeated execution.
- [ ] T035 [US2] Implement the explicit job identifier-to-handler allowlist in `apps/api/src/operations/job-registry.ts`; verify T031 passes and unknown identifiers never execute.
- [ ] T036 [US2] Implement claim/dispatch/heartbeat/completion/recovery and graceful stop in `apps/api/src/operations/operations.worker.ts`; verify T031 and T032 pass.
- [ ] T037 [US2] Start the central operations worker from `apps/api/src/worker.ts`; verify worker startup/shutdown integration tests pass with no extra scheduler dependency.
- [ ] T038 [US2] Implement pause/resume/run-now/retry/cancel repository and service operations in `apps/api/src/operations/operations.repository.ts` and `apps/api/src/operations/operations.service.ts`; verify T032 and T033 pass.
- [ ] T039 [US2] Implement guarded job-action endpoints in `apps/api/src/operations/operations.controller.ts`; verify T033 passes and all successful mutations emit an audit event.
- [ ] T040 [US2] Implement the nine owned behaviors `operations.provider-health`, `operations.capacity-evaluate`, `operations.cache-invalidate`, `operations.backup-verify`, `operations.restore-drill`, `operations.dr-rehearse`, `operations.maintenance-activate`, `operations.maintenance-complete`, and job-history retention, and reuse the narrowest existing domain entry points in `apps/api/src/operations/job-registry.ts`; verify T031 passes and every inventory item in `contracts/jobs-events.md` resolves to exactly one handler without copied business logic.
- [ ] T041 [US2] Remove superseded duplicate interval ownership only from `apps/api/src/ledger/ledger.worker.ts`, `apps/api/src/ai/ai.worker.ts`, `apps/api/src/engagement/engagement.worker.ts`, `apps/api/src/tracking/tracking.worker.ts`, `apps/api/src/sync/sync.worker.ts`, `apps/api/src/planning/planning.worker.ts`, `apps/api/src/reports/reports.worker.ts`, and `apps/api/src/security/security.worker.ts` after T032 and T040 pass; verify each governed job has one scheduler and all pre-existing domain worker tests remain green.
- [ ] T042 [US2] Add schedule/history/recovery procedures in `ops/runbooks/operations-jobs.md`; verify documented actions match OpenAPI enums and database states.

**Checkpoint**: US2 proves single ownership, durable history, safe recovery, and closed execution under concurrent workers.

---

## Phase 5: User Story 3 - Manage Incidents and Maintenance Safely (P1)

**Goal**: Operators can create and transition incidents and maintenance windows through validated, audited state machines.

**Independent test**: Focused operations contract/integration tests pass for allowed transitions, reject invalid transitions, and preserve audit correlation.

### Tests

- [ ] T043 [US3] Add failing pgTAP tests for incident and maintenance transition constraints, overlaps, time bounds, and optimistic concurrency in `supabase/tests/057_phase13_incidents_maintenance.sql`; verify failure before transition functions exist.
- [ ] T044 [P] [US3] Add failing integration tests for incident create/acknowledge/resolve and maintenance create/update/cancel in `apps/api/test/integration/operations/operations-incidents.integration.spec.ts`; verify focused failure.
- [ ] T045 [P] [US3] Add failing contract/security tests for incident and maintenance mutations, permissions, MFA, validation, audit, and redaction in `apps/api/test/contract/operations/operations-incidents.contract-spec.ts`; verify focused failure.

### Implementation

- [ ] T046 [US3] Implement incident and maintenance mutation functions and constraints in `supabase/migrations/20260906130000_phase13_operations.sql`; verify T043 passes.
- [ ] T047 [US3] Implement incident and maintenance repository/service transitions in `apps/api/src/operations/operations.repository.ts` and `apps/api/src/operations/operations.service.ts`; verify T044 passes.
- [ ] T048 [US3] Implement guarded mutation routes in `apps/api/src/operations/operations.controller.ts`; verify T045 passes and mutations are audited.
- [ ] T049 [US3] Add incident and maintenance procedures in `ops/runbooks/operations-incidents.md`; verify state names and response actions match the implemented contracts.

**Checkpoint**: US3 state transitions, overlaps, permissions, redaction, and audit tests pass.

---

## Phase 6: User Story 4 - Change Settings and Feature Flags Without Weakening Security (P1)

**Goal**: Operators can manage schema-keyed safe settings and deterministic bounded feature flags without storing secrets or evaluating code.

**Independent test**: Focused operations tests prove deterministic evaluation, safe rollout bounds, audit history, secret denial, and fail-closed behavior.

### Tests

- [ ] T050 [US4] Add failing pgTAP tests for setting schemas, feature/rule constraints, priorities, rollout bounds, uniqueness, and deterministic evaluation in `supabase/tests/058_phase13_settings_flags.sql`; verify pre-implementation failure.
- [ ] T051 [P] [US4] Add failing unit/property tests for stable rollout bucketing, ordered rules, allowed context keys, invalid input, and default fallback in `apps/api/test/unit/operations/feature-evaluator.spec.ts`; verify focused failure.
- [ ] T052 [P] [US4] Add failing contract/integration tests for setting and flag mutations, ETags/version conflicts, MFA, permissions, secret-key denial, and audit events in `apps/api/test/contract/operations/operations-config.contract-spec.ts`; verify focused failure.

### Implementation

- [ ] T053 [US4] Implement settings/flags/rules mutation and evaluation SQL in `supabase/migrations/20260906130000_phase13_operations.sql`; verify T050 passes.
- [ ] T054 [US4] Implement deterministic bounded evaluation in `apps/api/src/operations/feature-evaluator.ts`; verify T051 passes without dynamic code or remote evaluation.
- [ ] T055 [US4] Implement settings/flags repository and service logic in `apps/api/src/operations/operations.repository.ts` and `apps/api/src/operations/operations.service.ts`; verify T052 passes.
- [ ] T056 [US4] Implement guarded setting and feature-flag routes in `apps/api/src/operations/operations.controller.ts`; verify T052 passes and secret-like keys/values are rejected.
- [ ] T057 [US4] Add configuration rollback and flag-disable procedures in `ops/runbooks/operations-configuration.md`; verify examples contain only supported keys and actions.

**Checkpoint**: US4 deterministic evaluation, validation, authorization, concurrency, and audit tests pass.

---

## Phase 7: User Story 7 - Consume Honest Free-only Client Configuration (P1)

**Goal**: Admin uses the live operations contracts and Mobile consumes only a safe cached Free-only platform projection.

**Independent test**: Admin Vitest and Mobile Jest contract tests pass; responses expose no billing, secrets, internal job state, or unavailable paid capability.

### Tests

- [ ] T058 [P] [US7] Add failing safe-meta contract tests for Free-only plan/quota/capability projection, ETag handling, key allowlisting, and forbidden fields in `apps/api/test/contract/operations/platform-meta.contract-spec.ts`; verify focused contract failure.
- [ ] T059 [P] [US7] Add failing cache unit tests for cold/warm reads, 30-second maximum TTL, ETag, invalidation, and stale-safe fallback in `apps/api/test/unit/operations/platform-meta-cache.spec.ts`; verify focused unit failure.
- [ ] T060 [P] [US7] Update failing Admin repository/contract tests for the live operations routes and removal of billing provider/queue/settings assumptions in `apps/admin-web/src/features/system-health/repository.test.ts` and `apps/admin-web/src/features/governance/repository.test.ts`; verify targeted Vitest failure.
- [ ] T061 [P] [US7] Add failing Mobile platform operations contract and adapter tests in `apps/mobile/src/services/contracts/platform-operations-service.test.ts` and `apps/mobile/src/services/live/platform-operations-service.test.ts`; verify targeted Jest failure without editing `assistant-notifications-service.ts`.

### Implementation

- [ ] T062 [US7] Extend the safe response type only in `apps/api/src/platform/meta/meta.dto.ts`; verify T058 type and forbidden-field assertions pass.
- [ ] T063 [US7] Implement allowlisted Free-only safe projection, process-local TTL/ETag cache, and explicit invalidation in `apps/api/src/platform/meta/meta.service.ts`; verify T058 and T059 pass with no Redis or new dependency.
- [ ] T064 [US7] Invalidate safe meta after relevant setting/flag mutations in `apps/api/src/operations/operations.service.ts`; verify T059 passes.
- [ ] T065 [US7] Map existing Admin contracts/repositories to Phase 13 routes in `apps/admin-web/src/features/system-health/contracts.ts`, `apps/admin-web/src/features/system-health/repository.ts`, `apps/admin-web/src/features/governance/contracts.ts`, and `apps/admin-web/src/features/governance/repository.ts`; verify T060 and existing feature tests pass.
- [ ] T066 [US7] Remove only production-facing billing provider/queue/settings assumptions from touched Admin views in `apps/admin-web/src/features/system-health/OperationsViews.tsx` and `apps/admin-web/src/features/governance/SettingsViews.tsx`; verify existing layout tests and targeted Vitest pass without redesign.
- [ ] T067 [US7] Add the separate safe Mobile contract in `apps/mobile/src/services/contracts/platform-operations-service.ts`; verify T061 contract tests pass and the protected assistant notification contract is byte-for-byte untouched.
- [ ] T068 [US7] Add the live Mobile adapter in `apps/mobile/src/services/live/platform-operations-service.ts`; verify T061 adapter tests, `npm run typecheck`, and `npm run check:frontend-quality` from `apps/mobile` pass.

**Checkpoint**: US7 clients compile and test against a safe Free-only projection with no billing surface.

---

## Phase 8: User Story 5 - Prove Performance and Cache Correctness (P2)

**Goal**: Approved query, route, worker, payload, cache, and cardinality budgets have reproducible evidence.

**Independent test**: The operations performance runner completes within all `spec.md` P95/P99/query/payload/cardinality thresholds for cold, warm, invalidated, load, and stress scenarios.

### Tests

- [ ] T069 [US5] Add operations seed, cleanup, and EXPLAIN fixtures in `apps/api/test/performance/operations/operations-seed.sql`, `operations-clean.sql`, and `operations-explain.sql`; verify they run twice without residue or plan regressions.
- [ ] T070 [P] [US5] Add failing k6 route/load/stress thresholds in `apps/api/test/performance/operations/operations.k6.js`; verify `node --check` passes and the runner reports unmet thresholds before tuning.
- [ ] T071 [P] [US5] Add failing performance orchestration and cache evidence assertions in `apps/api/test/performance/operations/run-operations.ts` and `apps/api/test/performance/operations/operations-cache.performance.spec.ts`; verify focused performance failure before tuning.
- [ ] T072 [P] [US5] Add fixed-cardinality and payload-budget tests in `apps/api/test/performance/operations/operations-budgets.performance.spec.ts`; verify focused failure on an intentionally over-budget fixture.

### Implementation

- [ ] T073 [US5] Add only measured missing indexes/query bounds to `supabase/migrations/20260906130000_phase13_operations.sql` and parameterized reads in `apps/api/src/operations/operations.repository.ts`; verify T069 EXPLAIN thresholds pass.
- [ ] T074 [US5] Bound list payloads, aggregations, histories, and projection fields in `apps/api/src/operations/operations.service.ts`; verify T072 passes.
- [ ] T075 [US5] Tune process-local safe-meta caching in `apps/api/src/platform/meta/meta.service.ts` only where T071 demonstrates need; verify cold/warm/invalidation thresholds pass without Redis.
- [ ] T076 [US5] Add `perf:check:operations`, `test:performance:operations`, and `test:stress:operations` scripts to `apps/api/package.json`; verify all three commands execute the Phase 13 fixtures and runner.
- [ ] T077 [US5] Capture the versioned cross-domain performance/cache inventory, invalidation ownership, redacted reproducible results, and hardware/test profile for Specs 001-011 and 013 in `apps/api/specs/013-performance-caching-observability-operations/evidence/performance.md`; verify every applicable domain and operations threshold links to a command and result and every unavailable/not-applicable measurement is explicit.

**Checkpoint**: US5 performance and cache evidence is reproducible and all approved bounds pass without a distributed cache.

---

## Phase 9: User Story 6 - Verify Backup and Disaster Recovery (P2)

**Goal**: Local backup, restore, migration rollback compatibility, replay, reconciliation, and RPO/RTO evidence are executable and honestly classified.

**Independent test**: Focused recovery tests restore Phase 13 state, preserve RLS and app behavior, prove replay/reconciliation, and classify hosted-only evidence without fabricating it.

### Tests

- [ ] T078 [US6] Add failing backup/restore and corruption-detection coverage for Phase 13 tables/functions in `apps/api/test/e2e/operations/operations-backup-restore.e2e-spec.ts`; verify focused e2e failure before recovery support.
- [ ] T079 [P] [US6] Add failing N-1 migration/application compatibility and rollback verification in `apps/api/test/e2e/operations/operations-rollback.e2e-spec.ts`; verify focused failure.
- [ ] T080 [P] [US6] Add failing worker replay, lease recovery, and domain reconciliation coverage in `apps/api/test/e2e/operations/operations-recovery.e2e-spec.ts`; verify focused failure.

### Implementation

- [ ] T081 [US6] Extend existing database backup/restore fixtures only as needed for Phase 13 in `apps/api/test/e2e/backup-restore.e2e-spec.ts`; verify T078 restores data, functions, grants, forced RLS, and safe routes.
- [ ] T082 [US6] Make migration/application behavior backward-compatible with the prior image in `supabase/migrations/20260906130000_phase13_operations.sql` and `apps/api/src/operations/operations.module.ts`; verify T079 passes without destructive rollback SQL.
- [ ] T083 [US6] Implement idempotent replay/reconciliation entry points through the existing closed registry in `apps/api/src/operations/job-registry.ts`; verify T080 passes without duplicating domain logic.
- [ ] T084 [US6] Add local recovery, RPO/RTO measurement, rollback, and hosted-evidence procedures in `ops/runbooks/operations-recovery.md`; verify every command is executable locally or explicitly labelled external/unavailable.
- [ ] T085 [US6] Capture redacted local restore/replay/reconciliation results and hosted evidence classification in `apps/api/specs/013-performance-caching-observability-operations/evidence/recovery.md`; verify no hosted success is claimed without an artifact.

**Checkpoint**: US6 local recovery proof passes and external-only evidence remains explicitly pending until supplied by the responsible environment.

---

## Final Phase: Hardening And Acceptance

- [ ] T086 [P] Add provider health checks using the fixed database/storage/identity/ai/email/push allowlist in `apps/api/src/operations/operations.service.ts`; verify focused tests reject arbitrary destinations and redact provider bodies.
- [ ] T087 [P] Add Phase 13 ownership-boundary security coverage in `apps/api/test/security/operations/operations-ownership.security.spec.ts`; verify billing/SPEC-BE-012, SPEC-BE-014, arbitrary execution, and protected client paths are outside ownership.
- [ ] T088 [P] Add alert/dashboard/runbook link and metric-name validation in `apps/api/test/contract/operations/operations-assets.contract-spec.ts`; verify every alert resolves to one runbook and every dashboard metric exists.
- [ ] T089 Update `apps/api/test/contract/openapi-drift.contract-spec.ts` to include the Phase 13 contract; verify `npm run test:openapi` passes.
- [ ] T090 Update `.github/workflows/backend-foundation.yml` with existing Phase 13 scripts only where required for CI coverage; verify workflow pin/security tests pass and no new unpinned action is introduced.
- [ ] T091 Update `docker/backend.Dockerfile`, `docker/local/compose.backend.yml`, and `docker/test/compose.backend.yml` only if focused container tests prove Phase 13 worker/runtime wiring needs it; verify `npm run test:release-image` passes as non-root and healthy.
- [ ] T092 Run `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:contract`, `npm run test:integration`, `npm run test:e2e`, `npm run test:db`, `npm run db:lint`, and `npm run migration:checksums` from `apps/api`; retain zero failures.
- [ ] T093 Run `npm run perf:check`, every applicable existing `test:performance:*` and `test:stress:*` script plus `test:performance:operations` and `test:stress:operations`, `npm run security:dependencies`, `npm run security:sast`, `npm run security:scope`, `npm run security:workflow-pins`, `gitleaks detect --no-banner --redact --source ../..`, and `npm run test:release-image` from `apps/api`; retain zero blocking failures, zero secret finding, and zero high/critical image vulnerability.
- [ ] T094 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e` from `apps/admin-web`; retain zero failures.
- [ ] T095 Run `npm run typecheck`, `npm run lint`, `npm run check:frontend-quality`, `npm run check:frontend-quality-gates`, and `npm test -- --runInBand` from `apps/mobile`; retain zero failures and verify the protected user-owned file remains unstaged/unmodified by Phase 13.
- [ ] T096 Run migration upgrade, concurrency, checksum, backup/restore, N-1, replay, reconciliation, and RPO/RTO procedures from `apps/api/specs/013-performance-caching-observability-operations/quickstart.md`; retain the exact commands/results in `apps/api/specs/013-performance-caching-observability-operations/evidence/verification.md`.
- [ ] T097 Run the Clean Code/SOLID/DRY/KISS/YAGNI review over the Phase 13 diff, resolve all validated findings in owned paths, and record the result in `apps/api/specs/013-performance-caching-observability-operations/evidence/reviews.md`.
- [ ] T098 Run the test-quality review over every Phase 13 test change, resolve brittle/vacuous/duplicated coverage, and record the result in `apps/api/specs/013-performance-caching-observability-operations/evidence/reviews.md`.
- [ ] T099 Run the security diff scan over the complete Phase 13 diff, validate exploitability and ownership, resolve all HIGH/CRITICAL and other release-blocking findings, and record the result in `apps/api/specs/013-performance-caching-observability-operations/evidence/reviews.md`.
- [ ] T100 Run an independent code review of the complete Phase 13 diff, resolve every validated blocking finding, rerun affected tests, and record the result in `apps/api/specs/013-performance-caching-observability-operations/evidence/reviews.md`.
- [ ] T101 Build the requirement-to-test-to-evidence traceability matrix in `apps/api/specs/013-performance-caching-observability-operations/evidence/traceability.md`; verify every FR, AC, SC, owned table/function/permission/job/route has at least one passing proof.
- [ ] T102 Run SpecKit analyze and converge over `apps/api/specs/013-performance-caching-observability-operations`; append and implement any genuine missing work, repeat both checks, and stop only at zero local implementation gap.
- [ ] T103 Verify T001-T102 and every checkbox in `apps/api/specs/013-performance-caching-observability-operations/checklists/requirements.md` are truthfully complete, `git diff --check` passes, protected paths match the T001 baseline, and no billing/Stripe/paid or SPEC-BE-014 implementation entered the diff.
- [ ] T104 Path-stage only reviewed Phase 13 files, inspect `git diff --cached --stat` and `git diff --cached`, create small coherent commits directly on `main`, and verify no protected user-owned path is staged.
- [ ] T105 Push committed `main` to `origin/main`; verify `git rev-list --left-right --count main...origin/main` returns `0 0` and local/remote resolve to the same final SHA.
- [ ] T106 Wait for the required GitHub Actions run for the exact final Phase 13 SHA; verify every required job completes successfully and collect run/image/SBOM/signature/provenance identifiers in `apps/api/specs/013-performance-caching-observability-operations/evidence/remote-ci.md`.
- [ ] T107 If remote CI fails, diagnose each failure with the systematic-debugging workflow, commit the smallest verified forward fix directly on `main`, push, and repeat T105-T106 until the exact final SHA is green.
- [ ] T108 Update Phase 13 status and evidence links in `docs/Back end/BACKEND_MASTER_PLAN.md`; verify SPEC-BE-012 remains deferred, SPEC-BE-014 remains unstarted, and no production claim exceeds collected evidence.
- [ ] T109 Create the final closeout commit for truthful task/master-plan/CI evidence, push it to `origin/main`, wait for its exact-SHA required workflow to succeed, and verify final divergence is `0 0`.
- [ ] T110 Verify all T001-T109 checkboxes are truthfully complete, then report the final commit sequence, exact final SHA, required successful Actions run URL/status, local verification summary, review outcome, protected user-owned paths, and explicitly deferred external/manual evidence.

## Dependencies

- Phase 1 is the documentation and consistency gate for all later work.
- Phase 2 blocks every user story because all stories consume the database, authorization, parsing, and module foundation.
- US1, US2, US3, and US4 can proceed incrementally after Phase 2; US2 must complete before recovery and full performance evidence.
- US7 depends on US4 for safe settings/flags invalidation and may otherwise be developed independently of US3.
- US5 depends on the implemented read, scheduling, configuration, and safe-meta paths it measures.
- US6 depends on the database foundation and central scheduler/replay path.
- Final hardening depends on all seven independently tested stories; commits and remote evidence depend on all local gates and reviews.

## Parallel Execution Examples

- After T006, T007-T009, T014, and T016 are safe test-first tasks because they touch separate database, unit, and contract files.
- After Phase 2, T019-T022 can run independently before US1 implementation; T043-T045 and T050-T052 are similarly isolated test groups.
- T058-T061 can run independently across API, Admin, and Mobile, provided the protected Mobile assistant file is never touched.
- T069-T072 and T078-T080 are independent evidence-first groups after their prerequisite stories are complete.
- T097-T100 are separate reviews of one immutable reviewed diff; remediation remains sequential and is followed by affected verification.

## Implementation Strategy

1. Land the contract/database/module foundation with focused green tests.
2. Complete P1 stories in order: operational reads, scheduling, incidents, configuration, then safe Free-only clients.
3. Complete P2 measured performance/cache work and recovery proof without adding Redis or speculative infrastructure.
4. Run full local gates, reviews, convergence, path-scoped direct-main commits, exact-SHA remote CI, and truthful closeout.

## Completion Rule

Do not mark a task complete or claim a result unless its named command/procedure was executed successfully and evidence was retained. A skipped conditional task is complete only when the referenced test proves no change is required and the reason is recorded. External production/hosted evidence may be documented as unavailable; it must never be fabricated or silently treated as green.
