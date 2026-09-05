---
description: "Dependency-ordered implementation tasks for SPEC-BE-005"
---

# Tasks: Transactions, Ledger, Transfers & Financial Integrity

**Input**: `apps/api/specs/005-transactions-ledger-integrity/spec.md`, `plan.md`, and Phase 1 design artifacts
**Scope**: Phase 05 / SPEC-BE-005 plus only its temporary SPEC-BE-006 idempotency prerequisite
**Tests**: Every financial behavior is test-first; gated skips remain explicit and never count as pass

## Phase 1: Baseline And Contract Review

- [x] T001 Record the synchronized base revision, user-authorized worktree deviation, preserved primary-checkout changes, dependency install, and fresh baseline `npm run verify` counts in `apps/api/specs/005-transactions-ledger-integrity/evidence/baseline.md`
- [x] T002 Record the full Constitution and Backend Master Plan review plus the Phase 05 ownership/exclusion inventory in `apps/api/specs/005-transactions-ledger-integrity/evidence/dependencies.md`
- [x] T003 Verify SPEC-BE-001 platform/database/outbox/worker/error/CI contracts against `apps/api/src/`, `supabase/`, and `.github/workflows/backend-foundation.yml`; record available contracts and stale external evidence separately in `apps/api/specs/005-transactions-ledger-integrity/evidence/dependencies.md`
- [x] T004 Verify SPEC-BE-002 identity/RLS contracts and explicitly retain Apple Team ID, protected Phone identities, hosted schema proof, provider rehearsal, and protected release evidence gaps in `apps/api/specs/005-transactions-ledger-integrity/evidence/dependencies.md`
- [x] T005 Verify SPEC-BE-003 exact Admin/support authorization, audit, and denial boundaries without adding a ledger support scope; record the inspected allowlist and released evidence in `apps/api/specs/005-transactions-ledger-integrity/evidence/dependencies.md`
- [x] T006 Verify SPEC-BE-004 currency/category/account/opening-balance handoff contracts and current Phase 04 release evidence in `apps/api/specs/005-transactions-ledger-integrity/evidence/dependencies.md`
- [x] T007 Validate `contracts/openapi.yaml`, Mobile transaction/account fields, current Admin aggregate-only contract, and zero client-source change through `apps/api/test/contract/ledger/client-mapping.contract-spec.ts`

---

## Phase 2: Blocking Foundations

- [x] T008 Add failing pgTAP coverage for the exact forward-compatible idempotency table, hashes, states, uniqueness, lookup/claim/complete functions, and revoked direct access in `supabase/tests/019_ledger_idempotency.test.sql`; verify failure before migration
- [x] T009 [P] Add failing pgTAP coverage for transaction, posting, revision, balance tables, constraints, indexes, immutable triggers, projection guards, and owner-safe view in `supabase/tests/020_ledger_structure.test.sql`; verify failure before migration
- [x] T010 [P] Add failing pgTAP command-shape, version, append-only correction, rollback, refund, reversal, delete/restore, opening, and reconciliation assertions in `supabase/tests/021_ledger_commands.test.sql`; verify failure before migration
- [x] T011 [P] Add failing pgTAP forced-RLS, anonymous/customer/nonowner/Admin/worker denial, API-role command, minimum-grant, and function-search-path assertions in `supabase/tests/022_ledger_rls_grants.test.sql`; verify failure before migration
- [x] T012 Implement only the Phase 06-compatible lookup/claim/complete idempotency table/functions/grants in `supabase/migrations/20260830080000_phase05_idempotency_bridge.sql`; make T008 pass without sync/conflict/cleanup resources
- [x] T013 Implement Phase 05 headers, immutable postings/revisions, balance projections, constraints, indexes, and guarded view in `supabase/migrations/20260830080100_phase05_ledger_tables.sql`; make T009 structural assertions pass
- [x] T014 Implement owner advisory locking, sorted row locks, ledger versions, income/expense/transfer/opening/revision/refund/reversal/delete/restore commands, and bounded reconciliation in `supabase/migrations/20260830080200_phase05_ledger_commands.sql`; make T010 pass
- [x] T015 Implement forced RLS, deny-by-default policies, minimum grants, immutable/projection triggers, fixed search paths, and write enablement only after prerequisite functions in `supabase/migrations/20260830080300_phase05_ledger_access.sql`; make T011 pass
- [x] T016 Update `supabase/migration-checksums.sha256` using `npm --prefix apps/api run migration:checksums:update`; require checksum verification and clean repeated reset to pass
- [x] T017 Add failing stable ledger/idempotency error-envelope and request-ID tests in `apps/api/test/unit/http/safe-exception-filter.spec.ts`; preserve every existing error mapping
- [x] T018 Add failing low-cardinality ledger metric and redaction tests in `apps/api/test/unit/ledger/ledger.observability.spec.ts`; require zero user/account/transaction/request labels
- [x] T019 Add failing fixed-key DTO normalization, SHA-256 request hash, key hash, claim/replay/mismatch/in-progress, and rollback unit tests in `apps/api/test/unit/ledger/idempotency.spec.ts`
- [x] T020 Implement only shared Phase 05 error mappings in `apps/api/src/platform/http/safe-exception.filter.ts`, reusable existing telemetry primitives in `apps/api/src/platform/observability/platform-metrics.ts`, and stdlib hashing in `apps/api/src/ledger/idempotency.ts`; make T017-T019 pass without a new dependency

**Gate**: Idempotency precedes every write, pgTAP 019-022 and checksums pass on a clean database, and no route is registered before this foundation is green.

---

## Phase 3: User Story 1 - Record Income Or Expense (P1)

**Goal**: An active owner creates one confirmed income or expense with one replay-safe atomic financial effect.

**Independent test**: Repeating one valid request/key returns the identical stored response and one header/posting/revision/audit effect plus one lifecycle and one balance-change outbox record; a changed request hash and every injected failure leave no additional effect.

### Tests

- [x] T021 [P] [US1] Add failing amount/currency/account/category/title/payment-method/text/date/unknown-field DTO and normalization tests in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T022 [P] [US1] Add failing income/expense posting-sign, projection, replay, rate-limit, currency-threshold recent-auth, event-redaction, and failure-orchestration tests in `apps/api/test/unit/ledger/ledger.service.spec.ts` plus malformed/duplicate/out-of-range manifest tests in `apps/api/test/unit/config/environment.schema.spec.ts`
- [x] T023 [P] [US1] Add failing idempotency/header/posting/revision/balance/audit/outbox atomicity and owner-validation live tests in `apps/api/test/integration/ledger/transaction-write.integration.spec.ts`
- [x] T024 [P] [US1] Add failing `POST /api/v1/transactions` authentication, validation, replay, stable-error, and response-shape tests in `apps/api/test/e2e/ledger/transaction-write.e2e-spec.ts`
- [x] T025 [P] [US1] Add failing runtime OpenAPI and method/path/request/response/error drift tests in `apps/api/test/contract/ledger/ledger-openapi.contract-spec.ts`

### Implementation

- [x] T026 [US1] Implement strict allowlisted ledger request/response DTOs and fixed normalized command objects in `apps/api/src/ledger/ledger.dto.ts`; make T021 pass
- [x] T027 [US1] Implement the bounded event allowlist and sensitive-field rejection in `apps/api/src/ledger/ledger.events.ts`; make event cases in T022 pass
- [x] T028 [US1] Implement one client-scoped transaction, request context, idempotency claim/complete, command call, audit/outbox append, and owner read mapping in `apps/api/src/ledger/ledger.repository.ts`; make T023 pass
- [x] T029 [US1] Implement income/expense validation, existing security rate-limit reuse, and fail-closed per-currency recent-auth thresholds in `apps/api/src/ledger/ledger.service.ts`, `apps/api/src/platform/config/environment.schema.ts`, and `apps/api/src/platform/config/environment.types.ts`; make T022 pass
- [x] T030 [US1] Implement `POST /api/v1/transactions` with mandatory `Idempotency-Key` in `apps/api/src/ledger/ledger.controller.ts`; make T024-T025 pass
- [x] T031 [US1] Register the concrete ledger providers/controller in `apps/api/src/ledger/ledger.module.ts` and `apps/api/src/app.module.ts`; require typecheck and build to pass
- [x] T032 [US1] Run T021-T031 suites plus pgTAP 019-022 and record the independent story result in `apps/api/specs/005-transactions-ledger-integrity/evidence/acceptance.md`

**Checkpoint**: Confirmed income/expense is deployable with no duplicate or partial financial write path.

---

## Phase 4: User Story 2 - Transfer Same-Currency Funds With A Fee (P1)

**Goal**: Move value atomically between distinct owned same-currency accounts, with an optional fee effect.

**Independent test**: Simultaneous opposite-direction and duplicate-key transfers finish without partial state, lost update, or unresolved deadlock and all projections reconstruct.

### Tests

- [x] T033 [P] [US2] Add failing transfer DTO cases for distinct accounts, currency, fee, fee account, bounds, and unknown fields in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T034 [P] [US2] Add failing transfer posting-shape, deterministic account order, projection, replay, currency-threshold recent-auth, and validation tests in `apps/api/test/unit/ledger/ledger.service.spec.ts`
- [x] T035 [P] [US2] Add failing same-account, cross-currency, nonowner, archived/closed, fee, rollback, and opposite-direction concurrency tests in `apps/api/test/integration/ledger/transfer.integration.spec.ts`
- [x] T036 [P] [US2] Add failing `POST /api/v1/transfers` contract/E2E cases in `apps/api/test/e2e/ledger/transfer.e2e-spec.ts` and `apps/api/test/contract/ledger/ledger-openapi.contract-spec.ts`

### Implementation

- [x] T037 [US2] Implement transfer DTO mapping in `apps/api/src/ledger/ledger.dto.ts`; make T033 pass
- [x] T038 [US2] Implement the transfer repository command and exact posting/result mapping in `apps/api/src/ledger/ledger.repository.ts`; make T035 pass
- [x] T039 [US2] Implement transfer orchestration, shared recent-auth effect check, and route in `apps/api/src/ledger/ledger.service.ts` and `apps/api/src/ledger/ledger.controller.ts`; make T034 and T036 pass
- [x] T040 [US2] Run randomized and repeated opposite-transfer contention tests and record lock waits/retries/deadlocks/projection results in `apps/api/specs/005-transactions-ledger-integrity/evidence/concurrency.md`

**Checkpoint**: Transfer and fee effects are exact, replay-safe, and deadlock-safe under the declared owner contention model.

---

## Phase 5: User Story 3 - Revise Without Rewriting History (P1)

**Goal**: Correct eligible financial or metadata fields using expected version while preserving immutable history.

**Independent test**: A financial revision appends only the required deltas, a metadata revision appends no posting, and a concurrent stale version changes nothing.

### Tests

- [x] T041 [P] [US3] Add failing revise DTO, minimum changed-field, expected-version, reason, field allowlist, and text-bound tests in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T042 [P] [US3] Add failing amount/account/category/date/metadata delta, configured recent-auth effect, and eligibility tests in `apps/api/test/unit/ledger/ledger.service.spec.ts`
- [x] T043 [P] [US3] Add failing append-only revision, before/after evidence, projection, atomicity, and stale-writer concurrency tests in `apps/api/test/integration/ledger/revision.integration.spec.ts`
- [x] T044 [P] [US3] Add failing `PATCH /api/v1/transactions/:transactionId` contract/E2E cases in `apps/api/test/e2e/ledger/revision.e2e-spec.ts` and `apps/api/test/contract/ledger/ledger-openapi.contract-spec.ts`

### Implementation

- [x] T045 [US3] Implement revise DTO mapping in `apps/api/src/ledger/ledger.dto.ts`; make T041 pass
- [x] T046 [US3] Implement revision command mapping and immutable before/after response in `apps/api/src/ledger/ledger.repository.ts`; make T043 pass
- [x] T047 [US3] Implement revise eligibility/orchestration, current-effect recent-auth check, and PATCH route in `apps/api/src/ledger/ledger.service.ts` and `apps/api/src/ledger/ledger.controller.ts`; make T042 and T044 pass
- [x] T048 [US3] Prove all stale expected-version cases return `VERSION_CONFLICT` with current version and zero side effects in `apps/api/specs/005-transactions-ledger-integrity/evidence/concurrency.md`

**Checkpoint**: No correction updates or deletes historical posting/revision rows and Last-Write-Wins is impossible.

---

## Phase 6: User Story 4 - Refund Or Reverse A Confirmed Record (P1)

**Goal**: Create linked immutable compensating transactions with exact cumulative limits and full-effect reversal.

**Independent test**: Partial refunds reach but never exceed the expense, a full reversal negates every active posting including fees, and concurrent duplicates yield one effect.

### Tests

- [x] T049 [P] [US4] Add failing refund/reversal DTO, date/reason/account/amount/version tests in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T050 [P] [US4] Add failing eligibility, cumulative refund, relationship, complete-effect fee reversal, configured recent-auth, and stable-conflict tests in `apps/api/test/unit/ledger/ledger.service.spec.ts`
- [x] T051 [P] [US4] Add failing linked-row, projection, exact-limit, duplicate/concurrent, rollback, and append-only live tests in `apps/api/test/integration/ledger/refund-reversal.integration.spec.ts`
- [x] T052 [P] [US4] Add failing refund/reverse endpoint contract and E2E cases in `apps/api/test/e2e/ledger/refund-reversal.e2e-spec.ts` and `apps/api/test/contract/ledger/ledger-openapi.contract-spec.ts`

### Implementation

- [x] T053 [US4] Implement refund/reversal DTO mapping in `apps/api/src/ledger/ledger.dto.ts`; make T049 pass
- [x] T054 [US4] Implement refund/reversal repository commands and linked result mapping in `apps/api/src/ledger/ledger.repository.ts`; make T051 pass
- [x] T055 [US4] Implement refund/reversal orchestration and current-effect recent-auth checks in `apps/api/src/ledger/ledger.service.ts`; make T050 pass
- [x] T056 [US4] Implement `/transactions/:id/refunds` and `/transactions/:id/reverse` routes in `apps/api/src/ledger/ledger.controller.ts`; make T052 pass
- [x] T057 [US4] Run concurrent refund/reversal races repeatedly and retain exact effect/conflict/reconciliation evidence in `apps/api/specs/005-transactions-ledger-integrity/evidence/concurrency.md`

**Checkpoint**: Refund/reversal history and balances reconstruct exactly with no double compensation.

---

## Phase 7: User Story 5 - Delete And Undo Safely (P1)

**Goal**: Soft-delete eligible transactions with immutable compensation and restore the effect within exactly 30 server-seconds.

**Independent test**: Delete/restore across caller restart reconstructs correctly before expiry; expiry, dependency, stale version, and repeated requests are stable and side-effect-free.

### Tests

- [x] T058 [P] [US5] Add failing DELETE-body/restore DTO, expected-version, reason, and unknown-field tests in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T059 [P] [US5] Add failing fixed-window, nonextension, dependent-record, configured recent-auth, state, and replay tests in `apps/api/test/unit/ledger/ledger.service.spec.ts`
- [x] T060 [P] [US5] Add failing compensating/restore posting, server-time expiry, rollback, dependency, and stale-version live tests in `apps/api/test/integration/ledger/delete-restore.integration.spec.ts`
- [x] T061 [P] [US5] Add failing DELETE and restore contract/E2E cases in `apps/api/test/e2e/ledger/delete-restore.e2e-spec.ts` and `apps/api/test/contract/ledger/ledger-openapi.contract-spec.ts`

### Implementation

- [x] T062 [US5] Implement delete/restore DTO mapping in `apps/api/src/ledger/ledger.dto.ts`; make T058 pass
- [x] T063 [US5] Implement soft-delete/restore repository command mapping in `apps/api/src/ledger/ledger.repository.ts`; make T060 pass
- [x] T064 [US5] Implement delete/restore orchestration, current-effect recent-auth checks, and routes in `apps/api/src/ledger/ledger.service.ts` and `apps/api/src/ledger/ledger.controller.ts`; make T059 and T061 pass
- [x] T065 [US5] Record clock-boundary, retry, restart, and reconstruction evidence in `apps/api/specs/005-transactions-ledger-integrity/evidence/acceptance.md`

**Checkpoint**: Delete is never physical, undo is not client-clock-dependent, and expiry cannot be extended by retry.

---

## Phase 8: User Story 6 - Create An Account Opening Entry (P1)

**Goal**: Create the Phase 04 account and its nonzero opening ledger effect in one database transaction; zero creates no ledger row.

**Independent test**: Fail posting/audit/outbox/idempotency completion and observe neither account nor ledger row; retry a completed key and receive the stored account response.

### Tests

- [x] T066 [P] [US6] Replace the Phase 04 nonzero `LEDGER_NOT_AVAILABLE` unit expectation with failing atomic opening/replay/zero and configured recent-auth behavior in `apps/api/test/unit/reference/account.service.spec.ts`
- [x] T067 [P] [US6] Add failing same-client account/opening/posting/projection/audit/outbox/idempotency and injected-rollback tests in `apps/api/test/integration/ledger/account-opening.integration.spec.ts`
- [x] T068 [P] [US6] Add failing nonzero/negative/unsafe/currency/replay HTTP cases in `apps/api/test/e2e/reference/account.e2e-spec.ts`

### Implementation

- [x] T069 [US6] Expose the existing account insert on a provided `PoolClient` without duplicating SQL in `apps/api/src/reference/reference.repository.ts`; make account rollback setup in T067 pass
- [x] T070 [US6] Add the opening-command call and mapped result in `apps/api/src/ledger/ledger.repository.ts`; make posting/projection cases in T067 pass
- [x] T071 [US6] Replace only the planned nonzero opening handoff with one account-plus-ledger transaction and shared recent-auth effect check in `apps/api/src/reference/reference.service.ts`; preserve all Phase 04 account ownership and validation
- [x] T072 [US6] Wire the narrow ledger dependency into `apps/api/src/reference/reference.module.ts`; make T066 and T068 pass with zero-opening row count zero
- [x] T073 [US6] Record every injected boundary rollback and completed-key replay result in `apps/api/specs/005-transactions-ledger-integrity/evidence/atomicity.md`

**Checkpoint**: No account can retain an unposted opening amount and no separate opening-balance source exists.

---

## Phase 9: User Story 7 - Read Owner-Safe Ledger And Balances (P2)

**Goal**: Serve bounded deterministic owner transaction pages, detail, balance projections, and account summaries while all Admin raw-ledger paths stay denied.

**Independent test**: Owner/nonowner/anonymous/direct-client/worker/every-Admin-role matrix returns rows only to the owner and preserves the existing Admin aggregate-only response.

### Tests

- [x] T074 [P] [US7] Add failing cursor/filter/search/date/limit/detail/summary response and malformed-cursor DTO tests in `apps/api/test/unit/ledger/ledger.dto.spec.ts`
- [x] T075 [P] [US7] Add failing deterministic keyset pagination, token-prefix search, balance/version, and no-N+1 repository tests in `apps/api/test/integration/ledger/ledger-read.integration.spec.ts`
- [x] T076 [P] [US7] Add failing customer owner/nonowner/anonymous/direct-client/worker/every-Admin-role security matrix in `apps/api/test/security/ledger/ownership-boundary.spec.ts`
- [x] T077 [P] [US7] Add failing list/detail/account-summary HTTP and stable not-found cases in `apps/api/test/e2e/ledger/ledger-read.e2e-spec.ts`
- [x] T078 [P] [US7] Add failing Mobile mapping, Admin aggregate-only, and no-client-source-diff assertions in `apps/api/test/contract/ledger/client-mapping.contract-spec.ts`

### Implementation

- [x] T079 [US7] Implement bounded read DTOs and cursor encoding/decoding in `apps/api/src/ledger/ledger.dto.ts`; make T074 pass
- [x] T080 [US7] Implement parameterized owner list/detail/summary queries and projection mapping in `apps/api/src/ledger/ledger.repository.ts`; make T075 pass
- [x] T081 [US7] Implement read orchestration and owner-safe not-found behavior in `apps/api/src/ledger/ledger.service.ts`; make T076 pass
- [x] T082 [US7] Implement transaction list/detail and account-summary GET routes in `apps/api/src/ledger/ledger.controller.ts`; make T077 and T078 pass
- [x] T083 [US7] Retain the complete authorization/client compatibility matrix in `apps/api/specs/005-transactions-ledger-integrity/evidence/security.md`

**Checkpoint**: Reads are bounded and owner-safe; no new Admin ledger permission, support scope, raw row, or client feature exists.

---

## Phase 10: User Story 8 - Detect Projection Drift (P2)

**Goal**: Reconcile a deterministic bounded account batch, alert on every unexplained difference, and never repair automatically.

**Independent test**: A seeded confirmed and pending projection mismatch is detected within one max-500 batch, survives worker retry/restart, emits safe evidence once per incident policy, and remains unchanged.

### Tests

- [x] T084 [P] [US8] Add failing default/max batch, cursor, retry/restart, mismatch, no-repair, metric/event-redaction, and shutdown tests in `apps/api/test/unit/ledger/ledger.worker.spec.ts`
- [x] T085 [P] [US8] Add failing exact posting/projection comparison, deterministic batching, confirmed/pending variance, and no-update live tests in `apps/api/test/integration/ledger/reconciliation.integration.spec.ts`
- [x] T086 [P] [US8] Add failing worker registration, one-shot bounded completion, failure retry, and container shutdown tests in `apps/api/test/container/ledger-worker.container-spec.ts`

### Implementation

- [x] T087 [US8] Implement the bounded repository reconciliation call and cursor result in `apps/api/src/ledger/ledger.repository.ts`; make T085 pass
- [x] T088 [US8] Implement `ledger.reconcile` handling, metrics, safe mismatch event, retry, and no-repair behavior in `apps/api/src/ledger/ledger.worker.ts`; make T084 pass
- [x] T089 [US8] Register the ledger worker provider without an HTTP listener in `apps/api/src/ledger/ledger.module.ts` and `apps/api/src/worker.module.ts`; make T086 pass
- [x] T090 [US8] Add ledger alert thresholds/runbook links plus fixed low-cardinality dashboard queries/panels and owners to `apps/api/docs/runbooks/platform-alerts.md` and `apps/api/docs/runbooks/platform-observability.md`; verify every metric/alert/dashboard query in `apps/api/test/unit/ledger/ledger.observability.spec.ts`
- [x] T091 [US8] Write detection, write-disable, investigation, forward correction, restart, and explicit reconciliation closure steps in `apps/api/docs/runbooks/ledger-reconciliation-recovery.md`
- [x] T092 [US8] Exercise the disposable mismatch/retry/no-repair procedure and record it in `apps/api/specs/005-transactions-ledger-integrity/evidence/reconciliation.md`

**Checkpoint**: Every seeded drift is observable and actionable, and the worker has no repair mutation path.

---

## Final Phase: Hardening And Acceptance

- [x] T093 Add randomized posting/projection reconstruction and safe-integer overflow tests in `apps/api/test/integration/ledger/financial-invariants.integration.spec.ts`; require 100 percent equality and atomic overflow rejection
- [x] T094 Add duplicate replay, ambiguous response, active/expired claim, process restart, serialization, same-account, opposite-transfer, refund/reversal, and stale-version stress coverage in `apps/api/test/integration/ledger/concurrency.integration.spec.ts`; require zero duplicate/lost/partial effects
- [x] T095 Add BOLA/BFLA, mass assignment, SQL injection, direct-table/RPC, RLS/grant/search-path, log/error/event/metric leakage, and OWASP traceability tests in `apps/api/test/security/ledger/`; require zero exploitable Critical/High finding
- [x] T096 Add seeded 100k-header/200k-posting EXPLAIN and k6 list/search/mutation/contention/reconciliation gates in `apps/api/test/performance/ledger.sql`, `apps/api/test/performance/ledger.k6.js`, and `apps/api/test/performance/run-ledger.ts`; wire `test:performance:ledger` and syntax checks in `apps/api/package.json`
- [x] T097 Run the production-like ledger performance gate and retain P50/P95/P99, throughput, errors, payloads, lock waits, plans, and threshold result in `apps/api/specs/005-transactions-ledger-integrity/evidence/performance.md`
- [x] T098 Add clean Phase 04 upgrade, migration-order/checksum/failure-forward-fix, N-1 application rollback, backup/restore, queue replay, and full reconciliation coverage in `apps/api/test/e2e/ledger/ledger-recovery.e2e-spec.ts`
- [x] T099 Exercise locally available migration/rollback/restore/write-disable/worker-replay procedures and record exact results and gated external steps in `apps/api/specs/005-transactions-ledger-integrity/evidence/recovery.md`
- [x] T100 Add API/worker/migration nonroot, read-only filesystem, health, shutdown, configuration, and ledger smoke assertions in `apps/api/test/container/ledger-release.container-spec.ts`; require the immutable image tests to pass
- [x] T101 Update `.github/workflows/backend-foundation.yml` so clean reset, pgTAP, ledger integration/security/performance/recovery/container, image scan, SBOM, signature, provenance, and attestation gates run for the final Phase 05 revision without weakening pinned actions
- [x] T102 Run artifact consistency analysis across `spec.md`, `plan.md`, `tasks.md`, data model, contracts, Constitution, Master Plan, and implementation; resolve every Critical/High inconsistency in `apps/api/specs/005-transactions-ledger-integrity/evidence/analysis.md`
- [x] T103 Run `format:check`, `typecheck`, `lint`, `perf:check`, focused and full unit/contract/integration/E2E/security/pgTAP/concurrency/performance/migration/recovery/container/build/checksum/dependency gates; record exact pass/skip/fail counts in `apps/api/specs/005-transactions-ledger-integrity/evidence/local-release.md`
- [x] T104 Review changed production code with Clean Code/SOLID/DRY/KISS/YAGNI and Ponytail reuse/stdlib/minimality guardrails, then review every changed test with the test guard; record and fix actionable findings in `apps/api/specs/005-transactions-ledger-integrity/evidence/code-review.md`
- [x] T105 Request independent code review after implementation and resolve every accepted correctness/security/financial-integrity finding; retain findings and dispositions in `apps/api/specs/005-transactions-ledger-integrity/evidence/code-review.md`
- [x] T106 Verify AC-001 through AC-015, SC-001 through SC-007, FR-001 through FR-023, every owned resource, and every Definition of Done line using executed evidence in `apps/api/specs/005-transactions-ledger-integrity/evidence/definition-of-done.md`; never count a skip or protected gap as pass
- [x] T107 Confirm `git diff --check`, migration immutability/checksums, scope inventory, no Phase 06 resource beyond idempotency, no later-Spec/client/unrelated modification, and preservation of the primary dirty checkout; record the final tree inventory in `apps/api/specs/005-transactions-ledger-integrity/evidence/definition-of-done.md`
- [x] T108 Commit the exact Phase 05 diff on `codex/spec-be-005` with Spec-identifying messages, rerun pre-push checks on the committed revision, and push without rewriting history
- [x] T109 Integrate the verified branch to synchronized `main` without touching unrelated primary-checkout work or rewriting history, push `main`, and record immutable commit/CI links in `apps/api/specs/005-transactions-ledger-integrity/evidence/remote.md`
- [x] T110 Create and push the required immutable Phase 05 backend release tag only after main CI passes; collect actual image digest, scan, SBOM, signature, provenance, and attestation results in `apps/api/specs/005-transactions-ledger-integrity/evidence/remote.md`
- [x] T111 Finish the development branch only after all required local and remote verification passes, leaving any unavailable protected identity/provider evidence explicitly external in `apps/api/specs/005-transactions-ledger-integrity/evidence/definition-of-done.md`

## Dependencies

```text
Phase 1 review
  -> Phase 2 idempotency/schema/security foundation
      -> US1 income/expense
          -> US2 transfer
          -> US3 revision
              -> US4 refund/reversal
              -> US5 delete/restore
          -> US6 account opening
          -> US7 owner reads
              -> US8 reconciliation
                  -> final hardening/release
```

- US1 is the mutation foundation for every later financial command.
- US2 depends on shared US1 command orchestration but is otherwise independently testable.
- US3 depends on an existing confirmed transaction; US4 and US5 depend on US3's immutable correction/version model.
- US6 depends on US1 posting and idempotency but preserves Phase 04 account ownership.
- US7 can proceed after US1 storage/response shape is stable; US8 depends on projections and bounded reads.
- Final release evidence depends on all stories and cannot run in parallel with unresolved migrations or contract changes.

## Parallel Execution Examples

- After T008-T016, T017 safe-error tests, T018 metric tests, and T019 idempotency unit tests touch separate files and may run together.
- In each story, `[P]` unit, contract, integration, E2E, and security test files may be authored together only after their shared contract is fixed; production files remain sequential behind red tests.
- After all stories, T093 invariant tests, T095 security tests, T096 performance harness, T098 recovery tests, and T100 container tests are nonoverlapping, but their evidence runs wait for the same final implementation.
- No parallel agent may edit the four migrations, `ledger.repository.ts`, `ledger.service.ts`, `ledger.controller.ts`, or shared evidence files concurrently.

## Implementation Strategy

1. Keep all financial routes disabled until the idempotency bridge, ledger schema,
   command functions, RLS/grants, pgTAP, and checksums pass.
2. Deliver US1 as the smallest vertical ledger slice, then add one command family
   at a time through red-first tests and the same concrete repository/service.
3. Reuse existing platform database, security rate-limit, audit/outbox, worker,
   metrics, error, migration, container, and release mechanisms; add no dependency
   or speculative interface.
4. Treat the complete Phase 05 scope—not US1 alone—as the requested MVP/release.
5. Fix failures at their shared root cause, rerun the narrow reproducer, then the
   owning suite, and only then the full release matrix.

## Completion Rule

Do not mark a task complete or claim a verification result unless its named
command/procedure was executed successfully and retained. Database-backed,
container, protected-identity, provider, CI, signature, provenance, and tag gates
remain explicit when unavailable and never become inferred passes. Phase 05 is
complete only after T001-T111 are resolved and the exact final immutable release
revision satisfies the Definition of Done.

## 2026-09-05 Category Merge Integration

- [x] Preserve postings and money while changing linked category IDs.
- [x] Append transaction revision, audit, and outbox evidence atomically.
- [x] Cover zero and many rows, incompatible/foreign/system denial, and rollback.
- [ ] Record the final pushed SHA and remote CI result.
