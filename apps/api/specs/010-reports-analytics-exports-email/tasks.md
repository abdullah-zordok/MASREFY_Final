---
description: "Dependency-ordered implementation tasks for Phase 10 reports, analytics, exports, and email delivery"
---

# Tasks: Reports, Analytics, Exports & Email Delivery

**Input**: `apps/api/specs/010-reports-analytics-exports-email/spec.md`, `plan.md`, and Phase 1 design artifacts
**Scope**: SPEC-BE-010 ownership only
**Tests**: Required before implementation completion; every non-trivial behavior follows red-green-refactor

Every task uses the required checklist format. `[P]` means the named files are
independent of incomplete tasks. Story labels appear only in story phases.

## Phase 1: Baseline And Contract Review

- [X] T001 Record the synchronized `main` SHA, clean tracked-worktree status, protected untracked paths, and successful prerequisite CI run in `specs/010-reports-analytics-exports-email/evidence/baseline.md`; verify with `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `gh run view 33792560441`.
- [X] T002 Review Phase 03 Admin overview schemas and current repository consumers, then replace permissive Admin schema placeholders in `specs/010-reports-analytics-exports-email/contracts/openapi.yaml` with exact bounded response schemas; verify with `npm exec -- js-yaml specs/010-reports-analytics-exports-email/contracts/openapi.yaml`.
- [X] T003 Review the existing Mobile reports contract and make recipient verification explicit in `specs/010-reports-analytics-exports-email/contracts/openapi.yaml` and `contracts/mobile-admin-mapping.md`; verify the OpenAPI document parses and every mapped Mobile method names one operation.
- [X] T004 [P] Record the exact Phase 01/03/05/06/07/08/09 contracts reused by Phase 10 in `specs/010-reports-analytics-exports-email/evidence/dependency-contracts.md`; verify every referenced source path and symbol exists with `rg`.
- [X] T005 [P] Validate spec, plan, research, data model, quickstart, and contract artifacts have no unresolved markers or ownership drift; record the command and result in `specs/010-reports-analytics-exports-email/evidence/artifact-validation.md`.

---

## Phase 2: Blocking Foundations

- [X] T006 Add failing configuration tests for required SMTP fields, TLS-only mode, bounded timeouts, report URL allowlisting, and safe redaction in `test/unit/reports/reports-config.spec.ts`; verify the targeted Jest command fails for the missing behavior.
- [X] T007 Implement the minimum Phase 10 environment schema/types/example variables in `src/platform/config/environment.schema.ts`, `src/platform/config/environment.types.ts`, and `.env.example`; verify T006 passes.
- [X] T008 Add failing unit tests for report period boundaries, Riyadh and non-DST zones, DST gaps/folds, monthly clamping, and next-run monotonicity in `test/unit/reports/reports-period.spec.ts`; verify the targeted Jest command fails.
- [X] T009 Implement deterministic Temporal-free timezone/period logic with existing platform primitives in `src/reports/reports.period.ts`; verify T008 passes.
- [X] T010 [P] Add failing unit tests for strict report/schedule/output/event input and snapshot schemas in `test/unit/reports/reports-schemas.spec.ts`; verify the targeted Jest command fails.
- [X] T011 [P] Implement the minimum DTO, enum, and schema validation surface in `src/reports/reports.dto.ts`, `src/reports/reports.schemas.ts`, and `src/reports/reports.events.ts`; verify T010 passes.
- [X] T012 Add pinned PDFKit and Nodemailer runtime/types dependencies to `package.json` and tracked `package-lock.json`; verify `npm ci --ignore-scripts` succeeds without modifying protected untracked pnpm files.
- [X] T013 Wire the existing Mobile Noto Arabic font as a backend container asset in `.dockerignore` and `docker/backend.Dockerfile`; verify the runtime path exists without duplicating the font in source control.
- [X] T014 Create the minimal reports module composition in `src/reports/reports.module.ts`, register API composition in `src/app.module.ts`, and register worker composition in `src/worker.module.ts`; verify `npm run build` succeeds.
- [X] T015 Commit Phase 10 artifacts and blocking foundations directly on `main` with only the intended paths staged; verify `git show --stat --oneline HEAD` and `git status --short` preserve the three protected untracked paths.

**Gate**: Configuration, time math, schemas, dependencies, and module composition pass before story work begins.

---

## Phase 3: User Story 1 - View Reconciled Financial Summaries (Priority: P1)

**Goal**: Authenticated users receive currency-safe dashboard and report summaries reconciled with ledger and planning sources.

**Independent test**: `npm test -- --runInBand test/integration/reports/reports-summary.integration.spec.ts test/contract/reports/reports-http.contract.spec.ts`

### Tests

- [X] T016 [US1] Add pgTAP failures for exact view columns, security-invoker behavior, owner scoping, zero-transaction periods, refunds/transfers, and multi-currency grouping in `supabase/tests/041_phase10_reports_schema.test.sql`; verify the database test fails before migration.
- [X] T017 [P] [US1] Add failing repository integration tests for snapshot-consistent summary reads, reused balance/planning contracts, stable ordering, and query bounds in `test/integration/reports/reports-summary.integration.spec.ts`; verify the targeted Jest command fails.
- [X] T018 [P] [US1] Add failing HTTP contract tests for dashboard/report authentication, validation, envelopes, empty periods, currency separation, pagination, ETag, and conditional GET in `test/contract/reports/reports-http.contract.spec.ts`; verify the targeted Jest command fails.
- [X] T019 [P] [US1] Add failing cache tests proving namespace/version/user/period key isolation and bounded invalidation in `test/unit/reports/reports-cache.spec.ts`; verify the targeted Jest command fails.

### Implementation

- [X] T020 [US1] Add the two owned security-invoker aggregate views, explicit grants, comments, constraints, and covering indexes in `supabase/migrations/20260904010000_phase10_report_views.sql`; verify T016 passes.
- [X] T021 [US1] Implement bounded repository queries that reuse ledger balance and planning sources in `src/reports/reports.repository.ts`; verify T017 passes and the query count stays constant as categories grow.
- [X] T022 [US1] Implement dashboard/report summary orchestration and existing cache integration in `src/reports/reports.service.ts`; verify T019 passes.
- [X] T023 [US1] Implement authenticated summary/dashboard routes, DTO validation, ETag, and keyset pagination in `src/reports/reports.controller.ts`; verify T018 passes.
- [X] T024 [US1] Add EXPLAIN fixtures and p95 query-budget checks for both views and dashboard reads in `test/performance/reports/reports-summary.performance.spec.ts`; verify thresholds and index usage with the performance test command.
- [X] T025 [US1] Record SQL-vs-API reconciliation fixtures and results in `specs/010-reports-analytics-exports-email/evidence/summary-reconciliation.md`; verify identical literal totals for each currency and period.
- [X] T026 [US1] Commit the independently passing summary story directly on `main`; verify the staged diff contains only US1-owned paths and the Phase 10 docs/task checkmarks.

**Checkpoint**: User Story 1 contract, integration, pgTAP, and performance checks pass independently.

---

## Phase 4: User Story 2 - Generate And Securely Download An Immutable Report (Priority: P1)

**Goal**: A report request captures one immutable snapshot, renders JSON/CSV/PDF, stores it privately, and returns only short-lived signed access.

**Independent test**: `npm test -- --runInBand test/integration/reports/reports-generation.integration.spec.ts test/security/reports/reports-storage.security.spec.ts`

### Tests

- [X] T027 [US2] Add pgTAP failures for `private.report_output_attempts`, snapshot capture, legal transitions, duplicate request uniqueness, retry lineage, claim behavior, grants, and denial from exposed roles in `supabase/tests/043_phase10_reports_functions.test.sql`; verify the database test fails.
- [X] T028 [P] [US2] Add failing renderer tests for literal JSON/CSV/PDF content, Arabic glyph embedding, CSV formula neutralization, filename/header injection, large streaming output, and no secret leakage in `test/unit/reports/reports-renderer.spec.ts`; verify the targeted Jest command fails.
- [X] T029 [P] [US2] Add failing private Storage tests for owner-scoped keys, content types, upload/delete, 60-900 second signed URL TTL, deleted objects, and traversal rejection in `test/security/reports/reports-storage.security.spec.ts`; verify the targeted Jest command fails.
- [X] T030 [P] [US2] Add failing generation-worker tests for idempotent claims, immutable snapshots, terminal-state preservation, transient retry bounds, poison payload failure, and no raw financial log fields in `test/integration/reports/reports-generation.integration.spec.ts`; verify the targeted Jest command fails.
- [X] T031 [P] [US2] Add failing request/status/retry HTTP tests for auth, ownership, recent-auth where required, idempotency replay/conflict, legal retry eligibility, status polling, and signed-link refresh in `test/contract/reports/reports-generation-http.contract.spec.ts`; verify the targeted Jest command fails.

### Implementation

- [X] T032 [US2] Add the private output-attempt table, snapshot capture function, claim/transition helpers, grants, RLS defense, indexes, and rollback notes in `supabase/migrations/20260904020000_phase10_report_outputs.sql`; verify T027 passes.
- [X] T033 [P] [US2] Implement bounded streaming JSON/CSV/PDF rendering and output safety in `src/reports/reports.renderer.ts`; verify T028 passes.
- [X] T034 [P] [US2] Implement private report Storage key/sign/delete behavior by reusing the existing Supabase Storage client pattern in `src/reports/reports.storage.ts`; verify T029 passes.
- [X] T035 [US2] Implement report request/status/retry orchestration, idempotency, and signed-link refresh in `src/reports/reports.service.ts`; verify T031 service-level cases pass.
- [X] T036 [US2] Implement report request/status/retry HTTP routes in `src/reports/reports.controller.ts`; verify T031 passes.
- [X] T037 [US2] Implement `report.generate` claim/render/store/transition logic and outbox consumption in `src/reports/reports.worker.ts`; verify T030 passes.
- [X] T038 [US2] Add the exact `report.requested`, `report.ready`, `report.expired`, and `export.ready` outbox schemas with safe metadata in `src/reports/reports.events.ts`; verify event contract tests in T030/T039 pass.
- [X] T039 [US2] Add expiry behavior tests then implement `report.output.expire` deletion/terminal transition in `test/integration/reports/reports-expiry.integration.spec.ts` and `src/reports/reports.worker.ts`; verify expired objects cannot receive a new signed URL.
- [X] T040 [US2] Record artifact hashes proving one captured snapshot produces all requested formats in `specs/010-reports-analytics-exports-email/evidence/immutable-output.md`; verify rerender/retry never rereads mutable ledger facts.
- [X] T041 [US2] Commit the independently passing generation/export story directly on `main`; verify the staged diff contains only US2-owned paths and task/evidence updates.

**Checkpoint**: User Story 2 produces private, immutable, reproducible artifacts and passes unit, contract, integration, security, and pgTAP checks.

---

## Phase 5: User Story 3 - Schedule Timezone-Correct Report Delivery (Priority: P1)

**Goal**: Users create, edit, pause, resume, and delete schedules whose next runs stay correct across calendar and timezone edge cases.

**Independent test**: `npm test -- --runInBand test/integration/reports/report-schedules.integration.spec.ts test/contract/reports/report-schedules-http.contract.spec.ts`

### Tests

- [X] T042 [US3] Add pgTAP failures for exact schedule columns, check/unique/FK constraints, owner-only RLS, grants, due-schedule claims with `SKIP LOCKED`, and monotonic next-run updates in `supabase/tests/042_phase10_reports_rls.test.sql`; verify the database test fails.
- [X] T043 [P] [US3] Add failing schedule service tests for monthly/yearly boundaries, disabled schedules, recipient normalization, verification expiry, compare-and-set updates, and duplicate enqueue prevention in `test/integration/reports/report-schedules.integration.spec.ts`; verify the targeted Jest command fails.
- [X] T044 [P] [US3] Add failing schedule HTTP tests for CRUD, auth, ownership, validation, optimistic version conflicts, verification, and keyset pagination in `test/contract/reports/report-schedules-http.contract.spec.ts`; verify the targeted Jest command fails.
- [X] T045 [P] [US3] Add failing worker concurrency tests for due claims, advisory locking, crash recovery, replay safety, and bounded batches in `test/integration/reports/report-schedule-worker.integration.spec.ts`; verify the targeted Jest command fails.

### Implementation

- [X] T046 [US3] Add the owned schedule table, constraints, RLS policies, explicit grants, due-claim helper, indexes, and rollback notes in `supabase/migrations/20260904030000_phase10_report_schedules.sql`; verify T042 passes.
- [X] T047 [US3] Implement schedule repository reads/writes/claims with keyset pagination and optimistic concurrency in `src/reports/reports.repository.ts`; verify repository cases in T043 pass.
- [X] T048 [US3] Implement recipient verification state, schedule validation, and deterministic next-run orchestration in `src/reports/reports.service.ts`; verify T043 passes.
- [X] T049 [US3] Implement verification and schedule CRUD routes in `src/reports/reports.controller.ts`; verify T044 passes.
- [X] T050 [US3] Implement bounded `report.schedule.enqueue` claims and idempotent report request creation in `src/reports/reports.worker.ts`; verify T045 passes.
- [X] T051 [US3] Add schedule lifecycle audit events using existing audit/outbox contracts in `src/reports/reports.events.ts`; verify safe metadata and actor attribution in T043/T045.
- [X] T052 [US3] Record DST/fold/gap/month-end fixtures and concurrency evidence in `specs/010-reports-analytics-exports-email/evidence/schedule-correctness.md`; verify each expected UTC instant by hand-derived literal.
- [X] T053 [US3] Commit the independently passing schedule story directly on `main`; verify the staged diff contains only US3-owned paths and task/evidence updates.

**Checkpoint**: User Story 3 passes schedule pgTAP, contract, integration, and concurrency tests independently.

---

## Phase 6: User Story 4 - Deliver Private Links Through SMTP (Priority: P1)

**Goal**: Generated reports are emailed through TLS SMTP with safe templates, bounded retries, and no attachment or recipient leakage.

**Independent test**: `npm test -- --runInBand test/integration/reports/report-email.integration.spec.ts test/security/reports/report-email.security.spec.ts`

### Tests

- [X] T054 [US4] Add failing SMTP adapter tests for STARTTLS/TLS enforcement, auth, timeout, connection refusal, 4xx retry, 5xx terminal failure, ambiguous post-DATA timeout, header injection, and redaction in `test/unit/reports/reports-smtp.spec.ts`; verify the targeted Jest command fails.
- [X] T055 [P] [US4] Add failing delivery-worker tests for verified recipients, short-lived link generation at send time, one delivery per attempt, no attachment, retry bounds, dead-letter transition, and replay safety in `test/integration/reports/report-email.integration.spec.ts`; verify the targeted Jest command fails.
- [X] T056 [P] [US4] Add failing security tests for IDOR, unverified/cross-user recipients, BCC/recipient enumeration, template escaping, URL allowlisting, expired links, and secret-safe logs in `test/security/reports/report-email.security.spec.ts`; verify the targeted Jest command fails.
- [X] T057 [P] [US4] Add failing event-contract tests for exact `report.delivery_succeeded` and `report.delivery_failed` schemas and signed delivery-webhook freshness/replay/idempotency in `test/contract/reports/report-events.contract.spec.ts` and `test/security/reports/report-webhook.security.spec.ts`; verify the targeted Jest command fails.

### Implementation

- [X] T058 [US4] Implement one TLS-only Nodemailer adapter with bounded connection/socket timeouts and sanitized message construction in `src/reports/reports.smtp.ts`; verify T054 passes.
- [X] T059 [US4] Implement `report.email.deliver` worker orchestration, signed-link-at-send, verified-recipient guard, retry classification, and ambiguous-delivery terminal handling in `src/reports/reports.worker.ts`; verify T055 passes.
- [X] T060 [US4] Implement the two exact delivery event schemas plus the configuration-gated signed webhook route using the existing global provider-webhook policy in `src/reports/reports.events.ts` and `src/reports/reports.webhook.controller.ts`; verify T057 passes.
- [X] T061 [US4] Apply email privacy and log-redaction defenses across `src/reports/reports.smtp.ts`, `src/reports/reports.worker.ts`, and `src/reports/reports.observability.ts`; verify T056 passes.
- [X] T062 [US4] Add a local fake-SMTP end-to-end test covering request-to-link delivery and duplicate suppression in `test/e2e/reports/report-email.e2e-spec.ts`; verify no real provider or secret is required.
- [X] T063 [US4] Record transient/permanent/ambiguous SMTP fixtures and safe log samples in `specs/010-reports-analytics-exports-email/evidence/email-delivery.md`; verify the evidence contains no address, token, financial value, or secret.
- [X] T064 [US4] Commit the independently passing email-delivery story directly on `main`; verify the staged diff contains only US4-owned paths and task/evidence updates.

**Checkpoint**: User Story 4 passes adapter, integration, E2E, event-contract, and security tests without an external SMTP provider.

---

## Phase 7: User Story 5 - Use Bounded Admin Analytics And Exports (Priority: P2)

**Goal**: Admin receives exact existing analytics contracts and can request bounded, auditable exports without raw cross-tenant financial leakage.

**Independent test**: `npm test -- --runInBand test/contract/reports/reports-admin.contract.spec.ts test/security/reports/reports-admin.security.spec.ts` and the targeted Admin web tests.

### Tests

- [X] T065 [US5] Add failing Admin HTTP contract tests for exact overview/platform/activity schemas, role and recent-auth gates, bounded dates/page sizes, no user financial values, idempotent export requests, polling, and short-lived links in `test/contract/reports/reports-admin.contract.spec.ts`; verify the targeted Jest command fails.
- [X] T066 [P] [US5] Add failing Admin security tests for tenant enumeration, IDOR, CSV injection, overbroad filters, audit metadata, and denied support/user roles in `test/security/reports/reports-admin.security.spec.ts`; verify the targeted Jest command fails.
- [X] T067 [P] [US5] Add failing Admin web repository/contract tests for the exact Phase 10 response mapping and export state flow in `apps/admin-web/src/features/overview/repository.test.ts` and `apps/admin-web/src/features/overview/report-exports.test.ts`; verify the targeted Vitest command fails.
- [X] T068 [P] [US5] Add failing Admin browser-flow coverage for analytics filters and export polling/download in `apps/admin-web/tests/e2e/overview-analytics.spec.ts`; verify the targeted Playwright command fails for missing live behavior.

### Implementation

- [X] T069 [US5] Implement aggregate-only bounded Admin repository queries and export request/status orchestration in `src/reports/reports.repository.ts` and `src/reports/reports.service.ts`; verify T065 repository/service cases pass.
- [X] T070 [US5] Implement exact guarded Admin overview/platform/activity and export routes in `src/reports/reports.admin.controller.ts`; verify T065 and T066 pass.
- [X] T071 [US5] Implement Admin live response mapping and export polling in `apps/admin-web/src/features/overview/contracts.ts`, `repository.ts`, and `report-exports.ts`; verify T067 passes without replacing unrelated mock ownership.
- [X] T072 [US5] Complete the Admin analytics/export browser flow in `apps/admin-web/tests/e2e/overview-analytics.spec.ts`; verify T068 passes against the Phase 10 API fixture.
- [ ] T073 [US5] Add bounded Admin query performance checks in `test/performance/reports/reports-admin.performance.spec.ts`; verify date/page caps and p95 targets hold without a materialized view.
- [X] T074 [US5] Record role, recent-auth, aggregation, audit, and export evidence in `specs/010-reports-analytics-exports-email/evidence/admin-analytics.md`; verify no raw user financial row appears.
- [X] T075 [US5] Commit the independently passing Admin story directly on `main`; verify the staged diff contains only US5-owned paths and task/evidence updates.

**Checkpoint**: User Story 5 passes exact contract, security, performance, Admin unit, and Admin E2E checks independently.

---

## Phase 8: Client Contract Parity

- [X] T076 Add failing Mobile live-adapter contract tests for summary, breakdown, schedule CRUD/verification, preview/request/status/retry, errors, idempotency, and pagination in `apps/mobile/src/services/contracts/reports-live-contract.test.ts`; verify the targeted test fails while current mock tests remain green.
- [X] T077 Implement the minimum Phase 10 live reports adapter in `apps/mobile/src/services/live/reports-service.ts` using the existing HTTP/auth/error primitives; verify T076 passes without switching the production provider owned by SPEC-BE-014.
- [X] T078 [P] Add persistence/relaunch tests for schedule drafts and pending report attempts in `apps/mobile/src/storage/reports-persistence.test.ts`; verify the targeted test passes with current persistence implementation or fix only Phase 10-owned gaps.
- [X] T079 [P] Add a Mobile-to-OpenAPI and Admin-to-OpenAPI parity checker in `test/contract/reports/reports-client-parity.contract.spec.ts`; verify all named operations, fields, enums, and pagination semantics match.
- [X] T080 Record deliberate provider-cutover deferral to SPEC-BE-014 and completed live-adapter parity in `specs/010-reports-analytics-exports-email/evidence/client-parity.md`; verify no client source contains a Phase 10 hard-coded base URL or secret.
- [X] T081 Commit the independently passing client parity slice directly on `main`; verify the staged diff contains only client contract/adapter/tests and task/evidence updates.

---

## Final Phase: Hardening And Acceptance

- [X] T082 Add fixed-cardinality report metrics and structured safe logging in `src/reports/reports.observability.ts`; verify metric-label bounds and redaction with `test/unit/reports/reports-observability.spec.ts`.
- [X] T083 [P] Add the reports dashboard and alert rules in `ops/observability/reports-dashboard.json` and `ops/alerts/reports-alerts.yml`; verify repository observability validators and Prometheus rule checks pass.
- [X] T084 [P] Add concise generation, SMTP, schedule, expiry, and rollback runbooks in `ops/runbooks/reports-generation.md`, `ops/runbooks/reports-email.md`, and `ops/runbooks/reports-schedules.md`; verify each alert links to an existing actionable section.
- [ ] T085 Update `supabase/migration-checksums.sha256`, run migration up/down/up and fresh-install database suites, and record output in `specs/010-reports-analytics-exports-email/evidence/database-verification.md`.
- [ ] T086 Exercise N-1 application compatibility, backup/restore reconciliation, worker crash/lease recovery, Storage deletion reconciliation, and forward-fix recovery in `test/integration/reports/reports-recovery.integration.spec.ts`; record results in `specs/010-reports-analytics-exports-email/evidence/recovery-verification.md`.
- [ ] T087 Exercise 100k-transaction report load, bounded worker memory/concurrency, expiry backlog, scheduler lag, SMTP outage, and cache/query budgets in `test/performance/reports/reports-stress.performance.spec.ts`; record retained measurements in `specs/010-reports-analytics-exports-email/evidence/performance.md`.
- [ ] T088 Run the full API format/lint/type/build/unit/contract/integration/e2e/security/performance/container suite plus dependency, secret, Unicode/RTL, open-handle, coverage, and flake checks; record exact commands/results in `specs/010-reports-analytics-exports-email/evidence/local-verification.md`.
- [ ] T089 [P] Run the full Mobile and Admin lint/type/unit/contract/E2E suites and record exact commands/results in `specs/010-reports-analytics-exports-email/evidence/client-verification.md`.
- [X] T090 Run clean-code and test-quality reviews over the Phase 10 diff, remove duplication/speculative code/weak tests, and record resolved findings in `specs/010-reports-analytics-exports-email/evidence/review.md`.
- [ ] T091 Re-run the SpecKit consistency analysis and convergence checks, update completed task checkboxes, and prove no executable SPEC-BE-010 work remains in `specs/010-reports-analytics-exports-email/evidence/spec-convergence.md`.
- [ ] T092 Commit the complete verified Phase 10 diff directly on `main`, push `main` to `origin`, and verify the remote SHA equals local while preserving `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, and `apps/api/pnpm-workspace.yaml` as untracked.
- [ ] T093 Monitor all CI workflows for the pushed SHA, fix failures forward on `main`, and record job URLs/statuses in `specs/010-reports-analytics-exports-email/evidence/ci.md`.
- [ ] T094 Collect image build/scan, SBOM, signature, provenance, and tagged-release evidence where runnable; record genuine external provider/secret/hosted/tag-only gates separately in `specs/010-reports-analytics-exports-email/evidence/external-gates.md` without marking executable work complete.
- [ ] T095 Re-run final verification on the exact remote `main` SHA, confirm every Definition of Done item and acceptance criterion, and record the signed closeout in `specs/010-reports-analytics-exports-email/evidence/phase10-closeout.md`.

## Dependencies

```text
Phase 1 baseline/contracts
  -> Phase 2 foundations
      -> US1 summaries
          -> US2 immutable generation
              -> US3 schedules
                  -> US4 SMTP delivery
      -> US5 Admin analytics (after US1; export mechanics reuse US2)
  -> Client contract parity (after all HTTP contracts stabilize)
  -> Hardening, convergence, push, CI, and closeout
```

- T002-T003 must complete before any HTTP contract test is finalized.
- T006-T014 block every story; T020-T023 block generation snapshot capture.
- T032-T039 block schedule delivery and Admin exports.
- T046-T051 block scheduled email delivery.
- T076-T081 start only after backend OpenAPI behavior is stable.
- T092 cannot run until all local gates and reviews pass; T095 cannot run until the exact pushed SHA has final verification evidence.

## Parallel Execution Examples

- After T007, T008-T009 and T010-T011 use separate files and may run in parallel.
- In US1, T017-T019 may run in parallel after T016 fixtures are understood.
- In US2, renderer T028/T033 and Storage T029/T034 may run in parallel before worker orchestration.
- In US3, HTTP T044 and worker T045 tests may run in parallel after the table contract T042 is fixed.
- In US4, SMTP T054 and event contract T057 may run in parallel.
- In US5, backend T065-T066 and Admin client T067-T068 may run in parallel against the same frozen OpenAPI contract.
- T083, T084, and T089 use non-overlapping paths and may run in parallel after functional stories pass.

## Implementation Strategy

1. Freeze exact contracts and build only the shared configuration/time/schema foundations.
2. Deliver summaries first, then immutable artifacts, schedules, email, and bounded Admin exports as independently verified slices.
3. Reuse existing auth, recent-auth, idempotency, queue/outbox, database, cache, audit, and Storage primitives; add no wrapper whose only purpose is future flexibility.
4. Keep aggregate views ordinary unless measured EXPLAIN/p95 evidence fails targets; only then add `analytics.refresh` and document the measured need.
5. Keep Mobile/Admin production-provider switching in SPEC-BE-014 while shipping executable live adapters and parity tests now.
6. Commit narrow passing slices directly to `main`; never hide a failing CI run with history rewriting.

## Completion Rule

Do not mark a task complete or claim a verification result unless the named
command/procedure was executed successfully and its evidence was retained.

After all local pre-push gates pass, commit and push directly to `main`, collect
CI/image/SBOM/signature/provenance evidence, fix failures forward on `main`, and
complete the Definition of Done only after all runnable local and remote gates
pass. Only genuine external provider, secret, hosted-environment, or tag-only
proofs may remain explicitly pending.
