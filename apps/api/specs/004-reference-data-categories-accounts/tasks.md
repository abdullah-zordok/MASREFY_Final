---
description: "Dependency-ordered implementation tasks for SPEC-BE-004"
---

# Tasks: Reference Data, Categories & Accounts

**Input**: `apps/api/specs/004-reference-data-categories-accounts/spec.md`, `plan.md`, and Phase 1 design artifacts
**Scope**: Phase 04 / SPEC-BE-004 only
**Tests**: Required before changed behavior is complete

## Phase 1: Baseline And Contract Review

- [x] T001 Confirm `main` is synchronized with `origin/main` and preserve unrelated paths using `git rev-list --left-right --count main...origin/main` plus `git status --short`; record the result in `apps/api/specs/004-reference-data-categories-accounts/evidence/local-release.md`
- [x] T002 Verify consumed SPEC-BE-001/002/003 database, auth, Admin guard, permission, audit, outbox, error, OpenAPI, observability, and migration contracts against `apps/api/src/`, `supabase/migrations/`, and `apps/api/test/`; record unresolved external-only dependency gates in `apps/api/specs/004-reference-data-categories-accounts/evidence/local-release.md`
- [x] T003 Validate all Phase 04 requirements and routes against `apps/api/specs/004-reference-data-categories-accounts/contracts/openapi.yaml` with the existing OpenAPI parser; require zero missing references or paths outside `/api/v1`
- [x] T004 Confirm the 12 Mobile currency codes, 19 system category keys, seven account types, and client field mappings against `apps/mobile/`; record the stable manifest in `apps/api/test/contract/reference/client-mapping.contract.spec.ts`
- [x] T005 Confirm the pinned Admin client permission manifest remains unchanged while backend-only permissions are owned by Phase 04; encode the assertion in `apps/api/test/contract/reference/client-mapping.contract.spec.ts`

---

## Phase 2: Blocking Foundations

- [x] T006 Add failing pgTAP coverage for five tables, columns, checks, indexes, immutable fields, and forced RLS in `supabase/tests/016_reference_structure_seed.test.sql`; verify it fails before the Phase 04 migrations
- [x] T007 [P] Add failing pgTAP coverage for anonymous/customer/Admin/worker policies, function execute grants, and minimum table grants in `supabase/tests/017_reference_rls_grants.test.sql`; verify it fails before runtime-access migration
- [x] T008 [P] Add failing pgTAP coverage for category graph/ownership, account default/lifecycle/currency locks, immutable rates, and resolver behavior in `supabase/tests/018_category_account_functions.test.sql`; verify it fails before functions exist
- [x] T009 Add Release A schema, constraints, indexes, triggers, guarded category/account commands, and resolvers in `supabase/migrations/20260829080000_reference_account_tables_functions.sql`; make `npm --prefix apps/api run db:lint` pass
- [x] T010 Add insert-only deterministic currencies, countries, system categories, and backend permission/role seeds in `supabase/migrations/20260829080100_reference_seeds_permissions.sql`; prove a repeated application changes zero existing audited rows
- [x] T011 Add forced RLS policies, revoked defaults, minimum grants, and narrow function execution in `supabase/migrations/20260829080200_reference_runtime_access.sql`; make `supabase/tests/017_reference_rls_grants.test.sql` pass
- [x] T012 Add the deliberate no-op Supabase CLI seed entrypoint in `supabase/seed.sql` so canonical production seed ownership remains in migrations; verify `npm --prefix apps/api run db:reset` has no missing seed file
- [x] T013 Add `reference.read` and `reference.write` to the backend permission manifest without changing the Admin client manifest in `apps/api/src/security/permission-manifest.ts`; make permission contract tests pass
- [x] T014 Add only Phase 04 stable error codes to the existing central allowlist/mapping in `apps/api/src/platform/errors/`; make the existing safe-error tests prove `fieldErrors` and `requestId` remain unchanged
- [x] T015 Update migration checksums in `supabase/migration-checksums.sha256` using `npm --prefix apps/api run migration:checksums:update`, then require `npm --prefix apps/api run migration:checksums` to pass

**Gate**: Release A clean-reset, pgTAP structure/security/function checks, permission manifest, error allowlist, and checksums pass before application story code.

---

## Phase 3: User Story 1 - Read Stable Reference Data (P1)

**Goal**: Active customers receive enabled currencies, countries, and system categories with stable ordering, canonical ETags, bounded cache behavior, and no cross-profile leak.

**Independent test**: `npm --prefix apps/api run test:contract -- --testPathPatterns=reference` and the reference subset of `npm --prefix apps/api run test:integration` pass; a matching `If-None-Match` returns bodyless 304.

### Tests

- [x] T016 [P] [US1] Add failing DTO, ordering, canonical-hash/ETag, cache-expiry, and cache-loss unit tests in `apps/api/test/unit/reference/reference.service.spec.ts`
- [x] T017 [P] [US1] Add failing OpenAPI response-shape, error-envelope, ETag, and full-path tests in `apps/api/test/contract/reference/reference-openapi.contract.spec.ts`
- [x] T018 [P] [US1] Add failing authenticated/inactive/anonymous reference-read and RLS integration tests in `apps/api/test/integration/reference/reference-read.integration.spec.ts`

### Implementation

- [x] T019 [US1] Implement strict reference/category/account/FX DTOs and public response types in `apps/api/src/reference/reference.dto.ts`; make T016 validation cases pass
- [x] T020 [US1] Implement bounded, parameterized currency/country/system-category reads and canonical ordered collection hashes in `apps/api/src/reference/reference.repository.ts`; make T018 query cases pass
- [x] T021 [US1] Implement the 64-entry, 24-hour maximum process cache with a bounded database hash/version check on every request in `apps/api/src/reference/reference.service.ts`; make T016 cache cases pass
- [x] T022 [US1] Implement `/api/v1/reference/currencies`, `/api/v1/reference/countries`, and authenticated category listing in `apps/api/src/reference/reference.controller.ts`; make T017 and T018 pass
- [x] T023 [US1] Register the smallest `ReferenceModule` in `apps/api/src/reference/reference.module.ts` and `apps/api/src/app.module.ts`; require `npm --prefix apps/api run typecheck` and `build` to pass

**Checkpoint**: Reference reads are independently deployable after Release A, with all shared data served from canonical database state.

---

## Phase 4: User Story 2 - Manage Personal Categories (P1)

**Goal**: Customers create, update, archive, restore, and merge only their categories while system categories remain immutable; when SPEC-BE-005 is present, merge delegates transaction reclassification to its ledger-owned command.

**Independent test**: Category unit/integration/E2E tests pass for owner/non-owner/system rows, compatible parents/targets, cycles, stale versions, retries, audit, outbox, and rollback.

### Tests

- [x] T024 [P] [US2] Add failing category event allowlist/payload and sensitive-field exclusion tests in `apps/api/test/unit/reference/reference.events.spec.ts`
- [x] T025 [P] [US2] Add failing category DTO, parent/merge-cycle, owner/kind, version, archive/restore retry, and system-denial tests in `apps/api/test/unit/reference/category.service.spec.ts`
- [x] T026 [P] [US2] Add failing category transaction, forced-RLS, audit/outbox atomicity, and non-owner integration tests in `apps/api/test/integration/reference/category.integration.spec.ts`
- [x] T027 [P] [US2] Add failing HTTP lifecycle/error/idempotency-header cases in `apps/api/test/e2e/reference/category.e2e-spec.ts`

### Implementation

- [x] T028 [US2] Implement the ten-name safe event builders and validation in `apps/api/src/reference/reference.events.ts`; make T024 pass
- [x] T029 [US2] Implement parameterized category create/update/archive/restore/merge transactions using the Phase 04 guarded SQL boundary; once SPEC-BE-005 exists, delegate merge reclassification to its guarded ledger command; make T026 pass
- [x] T030 [US2] Implement category orchestration, stable errors, version checks, and pre-SPEC-BE-006 retry ceiling in `apps/api/src/reference/reference.service.ts`; make T025 pass
- [x] T031 [US2] Add category mutation routes with mandatory `Idempotency-Key` and exact request schemas in `apps/api/src/reference/reference.controller.ts`; make T027 pass

**Checkpoint**: Category lifecycle passes independently; its later SPEC-BE-005 integration reclassifies headers only through the guarded ledger command.

---

## Phase 5: User Story 3 - Manage Personal Accounts (P1)

**Goal**: Customers manage seven-type account metadata, defaults, archive/restore/close lifecycle, and safe opening-balance handoff without storing or fabricating balances.

**Independent test**: Account unit/integration/E2E tests pass for all fields/types, default uniqueness, zero/absent opening balance, nonzero rejection, currency lock, versions, retries, ownership, audit/outbox, and terminal close.

### Tests

- [x] T032 [P] [US3] Add failing account DTO, type-specific credit limit, last-four, dates, JS-safe money, default, currency-lock, and opening-balance tests in `apps/api/test/unit/reference/account.service.spec.ts`
- [x] T033 [P] [US3] Add failing account transaction, forced-RLS, default locking, audit/outbox rollback, and cross-owner tests in `apps/api/test/integration/reference/account.integration.spec.ts`
- [x] T034 [P] [US3] Add failing list/create/update/archive/restore/close HTTP tests in `apps/api/test/e2e/reference/account.e2e-spec.ts`

### Implementation

- [x] T035 [US3] Implement bounded account list/read and guarded lifecycle transactions in `apps/api/src/reference/reference.repository.ts`; make T033 pass
- [x] T036 [US3] Implement account orchestration, fail-closed currency changes, default rules, and `LEDGER_NOT_AVAILABLE` for nonzero opening balance in `apps/api/src/reference/reference.service.ts`; make T032 pass
- [x] T037 [US3] Add account routes with pagination, versions, mandatory idempotency headers, 204 repeat archive semantics, and no balance field in `apps/api/src/reference/reference.controller.ts`; make T034 pass

**Checkpoint**: Account metadata is independently usable; no ledger, balance, transfer, or later-Spec object exists.

---

## Phase 6: User Story 4 - Resolve Approved Exchange Rates (P2)

**Goal**: Customers resolve identity or closest approved historical rates and otherwise receive safe `FX_UNAVAILABLE`; no provider worker is enabled.

**Independent test**: Resolver tests pass for identity, exact/closest/tie-break, maximum age, future/invalid values, missing rates, immutable rows, and provider absence.

### Tests

- [x] T038 [P] [US4] Add failing FX DTO/resolver/error unit tests in `apps/api/test/unit/reference/exchange-rate.service.spec.ts`
- [x] T039 [P] [US4] Add failing approved-row, deterministic tie-break, immutable-row, RLS/grant, and absent-provider integration tests in `apps/api/test/integration/reference/exchange-rate.integration.spec.ts`
- [x] T040 [P] [US4] Add failing exchange-rate HTTP contract cases in `apps/api/test/e2e/reference/exchange-rate.e2e-spec.ts`

### Implementation

- [x] T041 [US4] Implement parameterized FX resolution through `private.resolve_exchange_rate` in `apps/api/src/reference/reference.repository.ts`; make T039 pass
- [x] T042 [US4] Implement safe FX service/error mapping without a refresh loop or fake seed rate in `apps/api/src/reference/reference.service.ts`; make T038 pass
- [x] T043 [US4] Add `GET /api/v1/exchange-rates` with bounded age/time inputs in `apps/api/src/reference/reference.controller.ts`; make T040 pass

**Checkpoint**: FX lookup is deterministic and safe while provider refresh remains disabled.

---

## Phase 7: User Story 5 - Govern Shared Reference Data (P2)

**Goal**: Active Admins list and mutate only typed shared-reference resources with exact permissions, recent auth, reason, versions, audit/outbox, and safe rate insertion.

**Independent test**: Admin contract/integration/E2E tests pass for exact read/write permissions, recent-auth boundary, typed routes, stale versions, reasons, audit/outbox rollback, and no client-manifest drift.

### Tests

- [x] T044 [P] [US5] Add failing typed Admin OpenAPI, permission, recent-auth, reason, version, and mass-assignment contract tests in `apps/api/test/contract/reference/admin-reference.contract.spec.ts`
- [x] T045 [P] [US5] Add failing Admin currency/country/system-category/rate transaction and audit/outbox integration tests in `apps/api/test/integration/reference/admin-reference.integration.spec.ts`
- [x] T046 [P] [US5] Add failing Admin HTTP authorization and safe-error tests in `apps/api/test/e2e/reference/admin-reference.e2e-spec.ts`

### Implementation

- [x] T047 [US5] Implement typed Admin list/update/insert repository transactions with server-controlled `manual-admin` rate provider and committed outbox events in `apps/api/src/reference/reference.repository.ts`; invalidate local cache after successful return in `apps/api/src/reference/reference.service.ts` and make T045 pass
- [x] T048 [US5] Implement exact `reference.read`/`reference.write`, recent-auth, reason, version, and safe error orchestration in `apps/api/src/reference/reference.service.ts`; make T044 pass
- [x] T049 [US5] Add strict resource-specific Admin routes for currencies, countries, system categories, and exchange rates in `apps/api/src/reference/reference.controller.ts`; make T046 pass

**Checkpoint**: Shared reference governance is independently complete without provider-health or Admin client implementation.

---

## Final Phase: Hardening And Acceptance

- [x] T050 Add Release B `NOT VALID`, zero-invalid-row check, and validated preference currency FK in `supabase/migrations/20260829080300_preference_currency_fk.sql`; prove the Release A application works as N-1 before validation
- [x] T051 Update `supabase/migration-checksums.sha256` after Release B and run clean reset, migration ordering, repeated seed, `db:lint`, and all pgTAP suites; retain results in `apps/api/specs/004-reference-data-categories-accounts/evidence/local-release.md`
- [x] T052 [P] Add BOLA/BFLA, mass-assignment, RLS, function/grant, log/error leakage, and OWASP evidence in `apps/api/test/security/reference/` and `apps/api/specs/004-reference-data-categories-accounts/evidence/security.md`; require scoped security tests to pass
- [x] T053 [P] Add production-like SQL/query-plan and HTTP/cache performance runners in `apps/api/test/performance/reference.sql` and `apps/api/test/performance/run-reference.ts`; wire `test:performance:reference` in `apps/api/package.json` and retain threshold evidence in `apps/api/specs/004-reference-data-categories-accounts/evidence/performance.md`
- [x] T054 [P] Add bounded Phase 04 metrics and alert rule tests using existing observability infrastructure in `apps/api/src/reference/reference.service.ts` and `apps/api/test/unit/reference/reference.observability.spec.ts`; prove no sensitive/high-cardinality labels
- [x] T055 Write seed drift, audit/outbox failure, cache loss, FX absence, forward-fix, previous-image, reconciliation, and no-data-loss procedures in `apps/api/docs/runbooks/reference-account-recovery.md`; execute locally available drills and record outcomes in `apps/api/specs/004-reference-data-categories-accounts/evidence/recovery.md`
- [x] T056 Run `format:check`, `typecheck`, `lint`, focused unit/contract/integration/E2E/security, `build`, `migration:checksums`, `test:container`, and full `verify`; record exact pass/skip/fail counts in `apps/api/specs/004-reference-data-categories-accounts/evidence/acceptance.md`
- [x] T057 Review changed production code with Clean Code/SOLID/DRY/KISS/YAGNI and changed tests with the test guard; apply only evidence-backed simplifications and record the review in `apps/api/specs/004-reference-data-categories-accounts/evidence/definition-of-done.md`
- [x] T058 Prove every acceptance criterion, dependency gate, owned resource, migration, route, permission, event, test, and Definition of Done item is pass or explicitly blocked in `apps/api/specs/004-reference-data-categories-accounts/evidence/definition-of-done.md`; do not count database-backed skips
- [x] T059 Confirm `git diff --check`, scope inventory, no later-Spec/client/unrelated modifications, and synchronized `main`; commit only Phase 04 plus required dependency corrections directly on `main`
- [x] T060 Push `main`, collect CI/image/dependency/secret/SBOM/signature/provenance evidence in `apps/api/specs/004-reference-data-categories-accounts/evidence/remote.md`, and fix any failures forward without rewriting history

## Dependencies

```text
Phase 1 -> Phase 2 -> US1
                    |-> US2
                    |-> US3
                    `-> US4
US1 + US2 + US3 + US4 -> US5 -> Release B -> Hardening -> Commit -> Push/remote evidence
```

- T009 precedes T010; T010 precedes T011; T009-T011 precede all story repository work.
- T013-T014 precede routes that consume permissions/errors.
- Within each story, tests precede the behavior they verify.
- US2, US3, and US4 may proceed after US1 foundations, but shared edits to the repository/service/controller must be serialized.
- Release B T050 follows verified Release A application compatibility and precedes final migration evidence.

## Parallel Execution Examples

- After T006, run T007 and T008 in parallel because they edit separate pgTAP files.
- For US1, T016-T018 are parallel test-first tasks; implementation T019-T023 is ordered by dependency.
- For each lifecycle story, unit, integration, and E2E test files may be written in parallel before serialized implementation.
- T052-T055 are parallel after all story checkpoints because their primary evidence/test/runbook files do not overlap; coordinate the small shared service/package edits.

## Implementation Strategy

1. Ship the Release A database boundary and US1 reference reads first as the minimum deployable increment.
2. Add categories, accounts, and FX independently behind the same forced-RLS module.
3. Add Admin governance only after customer behavior and event/cache contracts are stable.
4. Apply the compatibility-sensitive preference FK as Release B, then run full hardening and release evidence.

## Completion Rule

Do not mark a task complete or claim a verification result unless its named
command/procedure was executed successfully and evidence was retained. Missing
secrets, OTPs, hosted-provider attestations, or remote approvals remain explicit
blockers rather than inferred passes.

## 2026-09-05 Category Usage Remediation

- [x] Add the owner-scoped usage route and strict count/version validation.
- [x] Recheck count under the ledger owner lock for archive and merge.
- [x] Reject system/foreign/missing/invalid lifecycle targets without leakage.
- [x] Add OpenAPI, safe-error, integration, security, pgTAP, and Mobile adapter/UI coverage.
- [x] Record the final pushed SHA and remote CI result in release evidence.

## 2026-09-06 Account Tracking Remediation

- [x] Add the backward-compatible non-null account flag and least-privilege write grants.
- [x] Map create/update/read through DTO, OpenAPI, repository, audit, and outbox events.
- [x] Add account validation, integration, security, and migration coverage.
- [x] Record the Slice 2 review, pushed SHA, and remote CI result in release evidence.

## 2026-09-06 Credit-Card Terms and Payoff Remediation

- [x] Add nullable statement day, payment due day, monthly rate basis points, and minimum payment minor units with 1–28/range/type constraints.
- [x] Map create/update/read, audit events, OpenAPI, and owner-scoped access without exposing foreign accounts.
- [x] Add the integer-only payoff endpoint and golden cases for zero, scale, interest coverage, final rounding, and the 1,200-month ceiling.
- [x] Prove clean migration, existing-row compatibility, and card-to-non-card clearing.
- [ ] Record the Slice 3 pushed SHA and successful remote CI before declaring client items #38/#39 released.
