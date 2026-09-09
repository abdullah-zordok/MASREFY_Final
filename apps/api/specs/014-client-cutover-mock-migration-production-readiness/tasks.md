# Tasks: Client Cutover, Mock Migration & Free-Only MVP Production Readiness

**Input**: `apps/api/specs/014-client-cutover-mock-migration-production-readiness/spec.md`, `plan.md`, `research.md`, `data-model.md`, `rollback-plan.md`, `quickstart.md`, and `contracts/client-contract-manifest-v1.md`
**Scope**: SPEC-BE-014 client cutover plus the smallest attributed fixes in prior owning Specs
**Tests**: Test-first for every behavior change; each wave is reviewed, committed, pushed, and remotely green before the next wave

Every task uses the exact current checkout. Never stage the pre-existing user-owned diff or untracked paths except an intentionally reviewed hunk. A database command runs only against a verified disposable local instance.

## Phase 1: Baseline And Contract Review

- [x] T001 Revalidate `main`, `origin/main`, Phase 13/remediation ancestry and CI, exclusive checkout, and preserved-path hashes; update `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/baseline.md`; verify with `git status --short --branch`, `git rev-parse main`, `git rev-parse origin/main`, and `git merge-base --is-ancestor`.
- [x] T002 Finish and record complete reads of every Mobile spec/production-remediation document and every Admin spec/repository/MSW/route-test boundary in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/baseline.md`; observable result: exact file counts and no partially read assigned artifact.
- [x] T003 Amend `apps/mobile/.specify/memory/constitution.md` and its dependent templates/docs so approved Phase 14 live provider integration supersedes the old mock-only constraint without weakening local data, accessibility, or security; verify with a focused constitution/template diff review.
- [x] T004 Reconcile every grouped row in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/contracts/client-contract-manifest-v1.md` against exact source symbols and owning OpenAPI operation IDs; observable result: every active call has one live or explicit-unavailable disposition and every billing call remains excluded.
- [x] T005 Add a manifest completeness check under `apps/api/test/contract/client-cutover-manifest.contract-spec.ts` that rejects duplicate/missing operation IDs, absent required policies/evidence links, active billing operations, and unowned backend resources; run `npm --prefix apps/api run test:contract -- --runTestsByPath test/contract/client-cutover-manifest.contract-spec.ts` and expect PASS.
- [x] T006 Run `speckit-analyze` against `spec.md`, `plan.md`, and `tasks.md`, record findings in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/artifact-analysis.md`, and resolve every Critical/High or Constitution/ownership inconsistency before T007.
- [x] T007 Validate the complete pre-implementation artifact package with `git diff --check -- apps/api/.specify/feature.json apps/api/specs/014-client-cutover-mock-migration-production-readiness` and placeholder/link/checklist scans; observable result: no unresolved clarification, placeholder, broken local link, or material analysis finding.
- [x] T008 Review the documentation-only diff with `clean-code-guard`, `test-guard` for T005, and `codex-security:security-diff-scan`; record zero unresolved blocker in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/artifact-analysis.md`.
- [x] T009 Stage only `apps/api/.specify/feature.json`, the Phase 14 spec directory, and the approved Mobile constitution/template paths; verify `git diff --cached --name-only` excludes every preserved user path; commit `docs(cutover): specify phase 14`, push `main`, and record the SHA/required green workflows before T010.

---

## Phase 2: Blocking Foundations

**Gate**: These shared foundations pass before any wave-specific production adapter changes.

- [x] T010 Read the installed Next.js 16.3.4 App Router `proxy.ts`, authentication, data-security, and environment guides under `apps/admin-web/node_modules/next/dist/docs/`; record applicable rules in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/foundations.md`.
- [x] T011 Add failing Mobile runtime-policy tests in `apps/mobile/src/config/client-runtime.test.ts` covering `live|demo|test`, production demo rejection, invalid/missing HTTPS API URL, missing/invalid Clerk publishable key, and forbidden public provider/service-role variables; run the file and observe the intended failures.
- [x] T012 Implement the minimum strict runtime policy in `apps/mobile/src/config/client-runtime.ts`, reuse it from `apps/mobile/src/config/demo-mode.ts`, and document non-secret variables in `apps/mobile/.env.example`/`apps/mobile/app.json`; rerun T011 to PASS.
- [x] T013 Add failing Admin production-policy tests in `apps/admin-web/src/core/config/runtime.test.ts` and `apps/admin-web/src/tests/production-mock-boundary.test.ts` for invalid API/Clerk values, enabled MSW in production, scenario/role transport, and forbidden provider secrets; run the files and observe failures.
- [x] T014 Implement strict Admin runtime/build validation in `apps/admin-web/src/core/config/runtime.ts` and `apps/admin-web/next.config.ts`; change `apps/admin-web/src/app/MockProvider.tsx` and `apps/admin-web/src/mocks/browser.ts` so MSW is test/development only and `onUnhandledRequest` errors; rerun T013 to PASS.
- [x] T015 Add failing redacted-comparison tests in `apps/mobile/src/services/cutover/shadow-comparison.test.ts` and `apps/admin-web/src/core/api/shadow-comparison.test.ts` proving canonical hashes/counts/version/difference codes, zero financial tolerance, bounded payloads, and absence of PII/content.
- [x] T016 Implement the smallest native-crypto redacted comparators in `apps/mobile/src/services/cutover/shadow-comparison.ts` and `apps/admin-web/src/core/api/shadow-comparison.ts`; rerun T015 to PASS.
- [x] T017 Add failing rollout/rollback policy tests in `apps/mobile/src/config/cutover.test.ts` and `apps/admin-web/src/core/config/cutover.test.ts` for strict wave order, stable server-derived cohort input, stage transitions, accepted/rollback versions, and literal `billingAvailable:false`.
- [x] T018 Implement versioned file-based cutover policies in `apps/mobile/src/config/cutover.ts` and `apps/admin-web/src/core/config/cutover.ts`, consuming BE013 flags only as server-owned input; rerun T017 to PASS.
- [x] T019 Add failing shared strict HTTP tests in `apps/mobile/src/services/live/http-client.test.ts` and `apps/admin-web/src/core/api/client.test.ts` for Clerk bearer injection, flat safe errors, idempotency/version headers, 204/304, malformed JSON, timeouts, abort, unknown states, and log redaction.
- [x] T020 Implement/reuse one strict authenticated request seam in `apps/mobile/src/services/live/http-client.ts` and `apps/admin-web/src/core/api/client.ts`; remove client role/scenario authority outside explicit mock tests; rerun T019 to PASS.
- [x] T021 Add `@clerk/expo` and `@clerk/nextjs` at exact lockfile-resolved versions to `apps/mobile/package.json`/lockfile and `apps/admin-web/package.json`/lockfile; run both package typechecks and dependency audits; observable result: only the two justified SDKs are added with no High/Critical advisory.
- [x] T022 Update `apps/api/specs/014-client-cutover-mock-migration-production-readiness/contracts/client-contract-manifest-v1.md` and `evidence/foundations.md` with exact symbols, tests, and rollback versions; run T005 and both client typechecks.

---

## Phase 3: User Story 1 - Trusted Identity and Access (P1 / Wave 1)

**Goal**: Production Mobile/Admin use Clerk identity and server-owned authorization with no synthetic session or mock fallback.

**Independent test**: Production-mode identity tests accept valid injected Clerk sessions, reject invalid/revoked/misconfigured sessions and client roles, and Admin exact-permission/MFA tests pass without MSW.

### Tests

- [x] T023 [US1] Add failing BE003 instance/authorization tests for least-privilege Admin self-context and active-role/profile predicates in `apps/api/test/contract/security/admin-self.contract-spec.ts`, `apps/api/test/integration/security/admin-self.integration.spec.ts`, and `apps/api/test/security/admin-self.security.spec.ts`; confirm current routes/projections fail.
- [x] T024 [US1] Add failing authoritative projection tests for non-fabricated session counts and eligible actions in `apps/api/test/integration/security/admin-users.integration.spec.ts`; confirm current hardcoded values fail.
- [x] T025 [US1] Add failing Mobile Clerk/app-shell tests in `apps/mobile/src/services/live/auth-service.test.ts` and `apps/mobile/src/state/app-shell-live.test.ts` for provider setup before selection, synthetic-session rejection, token refresh, sign-out scopes, onboarding/profile/session/device mappings, and pending-data preservation.
- [x] T026 [US1] Add failing Admin Clerk/request tests in `apps/admin-web/src/tests/identity-live-contract.test.ts` for `ClerkProvider`, `src/proxy.ts`, bearer forwarding, self-context, exact permissions, MFA/recent-auth, actor-scoped cursors/cache, authoritative IDs, fail-closed unknown route permissions, hidden production role switching, and no role query/header.

### Implementation

- [x] T027 [US1] Implement the minimal BE003 self-context and authoritative projection correction in `apps/api/src/security/security.controller.ts`, `security.service.ts`, `security.repository.ts`, and the BE003 OpenAPI/client mapping; rerun T023-T024 plus `npm --prefix apps/api run test:contract` and the focused security integration/security projects.
- [x] T028 [US1] Integrate `ClerkProvider`/secure token cache at the Mobile root and implement `apps/mobile/src/services/live/auth-service.ts`; wire `apps/mobile/src/state/app-shell.ts` and existing identity/settings selectors to the live provider only after Clerk is loaded; rerun T025.
- [x] T029 [US1] Preserve owner-specific SQLite/pending/draft state across sign-out/re-auth/account switch in `apps/mobile/src/state/app-shell.ts`, `storage/database.ts`, and existing reset boundaries; implement the smallest additive/idempotent Mobile-owned owner namespace and SQLCipher configuration, migrate the current global store without deletion, and run focused migration/encryption/session-preservation tests.
- [x] T030 [US1] Integrate `ClerkProvider` and `clerkMiddleware` through `apps/admin-web/src/app/layout.tsx`/providers and `apps/admin-web/src/proxy.ts`; wire the shared API client token provider and authoritative self-context; rerun T026.
- [x] T031 [US1] Replace Wave 1 Admin role/scenario-derived repository inputs and fixture-ID schemas with server-owned permission/results in `apps/admin-web/src/features/foundation/repository.ts`, `users/repository.ts`, `access/repository.ts`, `security/repository.ts`, shell permission state, and actor-scoped query invalidation; preserve exact errors/idempotency across retries and run their full Vitest files.
- [x] T032 [US1] Rehearse Wave 1 shadow/internal/bounded-write/full and rollback locally using injected non-production Clerk fixtures; verify redacted hashes, owner isolation, revocation, recent-auth/MFA and preserved local counts; label deployed cohort/observation evidence open unless genuinely executed and record both in `apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/wave-01-identity.md`.
- [x] T033 [US1] Run Wave 1 API identity/security tests, Mobile typecheck/lint/focused/full Jest, Admin typecheck/lint/build/full Vitest/identity Playwright, production mock/secret scans, and focused performance gates; record exact commands, results, skips, durations, and external Clerk/device gates in the wave evidence.
- [x] T034 [US1] Update the manifest, mock-removal report, release checklist, and external-gate ledger for Wave 1; run T005 and `git diff --check`.
- [x] T035 [US1] Run independent code review, Clean Code review, test review, and security diff scan for the Wave 1 diff; resolve every blocker and rerun affected checks.
- [x] T036 [US1] Hunk/path-stage only Wave 1 and attributed BE003 files, prove preserved paths unchanged, commit `feat(cutover): complete identity wave`, push `main`, wait for all required workflows on the exact SHA, forward-fix failures, and record final remote evidence before T037.

**Checkpoint**: Wave 1 is accepted only when its pushed SHA is green; genuine Clerk/OTP/physical-device proof may remain explicitly open.

---

## Phase 4: User Story 2 - Complete Reference and Account Records (P1 / Wave 2)

**Goal**: Reference/category/account/card contracts round-trip every field through live providers.

**Independent test**: The accepted account/category fixture survives create/read/update/archive/restore/merge/payoff mapping with exact versions, usage counts, owner isolation, tracking flag, and all card terms.

### Tests and implementation

- [x] T037 [US2] Add failing strict account/reference parity tests to `apps/mobile/src/services/live/account-service.test.ts`, `category-lifecycle-service.test.ts`, and a new selector test; cover all seven account types, closed status, tracking toggle, opening/closing timestamps, totals inclusion, card terms, usage recount, version conflicts, and unknown values.
- [x] T038 [US2] Add failing API/OpenAPI instance tests under `apps/api/test/contract/reference/` for actual reference/account/category/card/usage responses and errors; correct only proven BE004 contract/source drift in existing BE004 files.
- [x] T039 [US2] Extend the live account/reference/category adapter in `apps/mobile/src/services/live/account-service.ts` and `category-lifecycle-service.ts` to field-complete strict mapping through the shared client; keep category counts server-authoritative and rerun T037.
- [x] T040 [US2] Replace the production core-finance selector in `apps/mobile/src/services/mocks/core-finance-service.ts` with an explicit live composition while retaining the mock export only for demo/test; do not label SQLite computation `live`; run provider compatibility and core-finance boundary tests.
- [x] T041 [US2] Correct `apps/mobile/src/storage/core-finance-sync-adapter.ts` mapping so unknown types/statuses fail, closed remains closed, all card fields survive, opening sign comes from postings/role rather than a positive default, and unresolved conflicts cannot be overwritten; run focused sync/storage tests.
- [x] T042 [US2] Prove Wave 2 read shadow, internal/bounded writes, exact account/card/category comparison, SQLite/pending preservation and rollback; record `evidence/wave-02-reference-accounts.md`.
- [x] T043 [US2] Run BE004 contract/integration/security/performance, Mobile core-finance/typecheck/lint/quality/full Jest, production mock/bundle/secret scans; record commands/results/skips.
- [x] T044 [US2] Update Wave 2 manifest/mock-removal/checklists, run reviews/security scan, resolve blockers, and rerun affected gates.
- [x] T045 [US2] Stage only Wave 2/BE004 paths, verify preserved hashes, commit `feat(cutover): complete reference accounts wave`, push `main`, wait for required CI on the SHA, and record green remote evidence before T046.

---

## Phase 5: User Story 3 - Lossless Ledger and Offline Sync (P1 / Wave 3)

**Goal**: Transactions and synchronization use live ledger truth without losing or duplicating local work.

**Independent test**: A seeded schema-11 Mobile store with drafts, pending/dependent/conflicting operations and tombstones survives upgrade, interruption, retry, reconnect, rollback and forward resync with exact postings/report values.

### Tests and implementation

- [x] T046 [US3] Add failing BE005 real-instance contract tests for refund/reversal linked responses in `apps/api/test/contract/ledger/ledger-openapi-instance.contract-spec.ts`; repair `apps/api/specs/005-transactions-ledger-integrity/contracts/openapi.yaml` closed-schema composition and rerun.
- [x] T047 [US3] Add failing BE006 request/response/error instance tests in `apps/api/test/contract/sync/sync-openapi-instance.contract-spec.ts` for UUIDv4 device IDs, `after/limit`, `hasMore/nextPage`, signed-v2 cursor binding, flat safe errors, and `SYNC_CURSOR_NOT_ISSUED`.
- [x] T048 [US3] Align BE006 OpenAPI/internal/mobile/events contracts and the shared error allowlist with actual runtime in existing BE006/platform files; rerun T047, `test:openapi`, and focused sync tests.
- [x] T049 [US3] Add failing Mobile ledger/sync adapter tests in `apps/mobile/src/services/live/core-finance-service.test.ts` and existing storage suites for safe-integer money/version validation, posting roles/signs, account membership, refunds/transfers/payoff/delete/undo, full pagination, exact tombstone JSON/status hydration, closed-account lifecycle, and strict errors.
- [x] T050 [US3] Add failing restart/data-preservation tests in `apps/mobile/src/storage/sync-sqlite-migration.integration.test.ts`, `sync-repository.test.ts`, and `core-finance-repository.test.ts` for owner partition, pending/dependency/unresolved-conflict survival, repository reload after direct sync SQL, no cache-wide overwrite, and durable multi-operation replay.
- [x] T051 [US3] Implement the live ledger service/composition through existing BE005/006 endpoints in `apps/mobile/src/services/live/core-finance-service.ts`, reusing `SyncHttpClient`, `CoreFinanceSyncAdapter`, and local draft repository; rerun T049.
- [x] T052 [US3] Correct shared repository hydration/persistence and sync application in `apps/mobile/src/storage/core-finance-repository.ts`, `core-finance-sync-adapter.ts`, `sync-repository.ts`, and `database.ts` so tombstones and authoritative snapshots are visible after apply, safe integers/statuses/signs are exact, and newer pending/conflict state cannot be overwritten by direct SQL or later bulk persistence; rerun T049-T050.
- [x] T053 [US3] Make batch operation receipts durable in existing SQLite metadata rather than memory-only, preserving original operation IDs across restart; add one focused replay test and rerun full sync/core-finance storage suites.
- [x] T054 [US3] Execute online/offline/bootstrap/delta/interrupted upload/conflict/tombstone/reconnect and N-1 rollback rehearsals on a copy of seeded local fixtures; prove counts/hashes/ledger reconciliation and record `evidence/wave-03-ledger-sync.md`.
- [x] T055 [US3] Run BE005/006 unit/contract/integration/E2E/security/concurrency/performance/recovery, Mobile typecheck/lint/quality/full Jest/integration, and production scans; record all results/skips.
- [x] T056 [US3] Update Wave 3 manifest/mock-removal/checklists, run independent/Clean Code/test/security reviews, fix blockers, rerun affected gates.
- [x] T057 [US3] Stage only Wave 3/BE005/BE006 paths, verify preserved hashes, commit `feat(cutover): complete ledger sync wave`, push `main`, wait for required CI, and record the accepted SHA before T058.

---

## Phase 6: User Story 4 - Reconciled Financial Planning (P1 / Wave 4)

**Goal**: Salary, budgets, obligations, payments, savings and projections use strict live BE007 contracts while local drafts survive.

**Independent test**: Full rich planning records and ledger effects round-trip exactly; draft-only stores survive restart; resumable budget/category writes and payment/movement retries create no duplicate effect.

### Tests and implementation

- [x] T058 [US4] Add failing BE007 summary completeness/lifecycle tests under `apps/api/test/integration/planning/` for payable-only reserves, future pending receipt selection, child pagination/completeness, and explicit partial state.
- [x] T059 [US4] Correct BE007 planning repository/contract semantics in existing owner files and update BE007 evidence; run `test:planning:logic`, `test:planning:integration`, `test:planning:security`, and `test:planning:recovery`.
- [x] T060 [US4] Add failing Mobile live planning contract tests in `apps/mobile/src/services/live/financial-planning-service.test.ts` covering all 43 methods, rich optional fields, exact integers/versions, partial salary allocation, currency semantics, authoritative ledger transaction links, preview-version recheck, resumable budget root/category writes, and explicit unsupported previews.
- [x] T061 [US4] Add failing `apps/mobile/src/storage/financial-planning-repository.test.ts` cases for draft-only hydration, persisted payment matches/conflicts, and detection of historical planning payments/settlements whose fabricated transaction IDs have no ledger posting; prove current initialization deletes/loses or misstates them.
- [x] T062 [US4] Implement `apps/mobile/src/services/live/financial-planning-service.ts` with existing mapping helpers/shared HTTP/sync/draft seams; preserve field-complete pages and original operation IDs; rerun T060.
- [x] T063 [US4] Fix planning repository hydration/persistence so drafts-only and payment matches survive without reseeding or deleting owner data; identify and reconcile or explicitly quarantine every ledger-orphan planning effect before live acceptance, never fabricate a replacement posting, and rerun T061 plus all planning storage/reconciliation tests.
- [x] T064 [US4] Replace production imports of the persistent planning mock with explicit live selection while retaining local preview/draft helpers; run planning provider/boundary/query tests.
- [x] T065 [US4] Execute Wave 4 exact shadow, internal/bounded writes, offline/restart/retry and rollback rehearsals; record `evidence/wave-04-planning.md`.
- [x] T066 [US4] Run BE007 and Mobile planning full/focused/security/performance gates plus production mock/secret/bundle scans; update manifest/reports/checklists with exact results.
- [x] T067 [US4] Run independent/Clean Code/test/security reviews, fix blockers, stage only Wave 4/BE007 paths, commit `feat(cutover): complete planning wave`, push `main`, and wait for green required CI before T068.

---

## Phase 7: User Story 5 - Consent-Based Tracking and Imports (P1 / Wave 5)

**Goal**: Tracking/imports are live only with consent, account opt-in, supported sources, strict review, retention, and ledger-owned writes.

**Independent test**: `report_wrong` never creates a transaction; disabled/unsupported capture produces no success; full cursor traversal finds late items/rule versions; duplicate/retry behavior is deterministic.

### Tests and implementation

- [x] T068 [US5] Add a failing regression in `apps/mobile/src/services/live/automatic-tracking-service.test.ts` proving `report_wrong` maps to rejection/feedback and performs no ledger creation; add exhaustive compile/runtime coverage for every review action.
- [x] T069 [US5] Add failing strict/full-pagination tests in the same file for history/detail/undo/report, keyword/sender rules, preferences/retention fields, unknown states, test-only `processMockEvent`, and configured Clerk token availability.
- [x] T070 [US5] Add failing BE008 response-instance tests under `apps/api/test/contract/tracking/` for full preference/rule/review/import/parser resources; repair only proven BE008 schema/runtime drift and rerun `test:openapi`/tracking contract suites.
- [x] T071 [US5] Fix the root action mapping and full-cursor lookups in `apps/mobile/src/services/live/automatic-tracking-service.ts`; remove fabricated/default status/event/permission fields and make `processMockEvent` unavailable outside explicit demo/test; rerun T068-T069.
- [x] T072 [US5] Wire the tracking token provider before selector construction and enforce global plus BE004 per-account gates through existing contracts; run selector/status/privacy tests.
- [x] T073 [US5] Add failing Admin import/parser strict-mapping tests in `apps/admin-web/src/features/imports/repository.test.ts` for cursor traversal, exact totals/completeness, filters, reason/version/idempotency, sanitized previews, and no synthetic defaults.
- [x] T074 [US5] Correct `apps/admin-web/src/features/imports/repository.ts` to use the shared authenticated client and exact BE008 shapes; remove client role/scenario authority in live mode; rerun T073.
- [x] T075 [US5] Execute Wave 5 shadow/cohorts/rollback with corpus-safe fixtures, consent/account opt-out, retention, duplicate, offline/retry and no-direct-ledger assertions; record `evidence/wave-05-tracking-imports.md` and external native/corpus gates.
- [x] T076 [US5] Run BE008 unit/contract/integration/E2E/security/performance/stress/recovery, Mobile tracking and Admin import full gates, and production scans; update manifest/mock report/checklists.
- [x] T077 [US5] Run all reviews/scans, fix blockers, stage only Wave 5/BE008 paths, commit `feat(cutover): complete tracking imports wave`, push `main`, and wait for green required CI before T078.

---

## Phase 8: User Story 6 - Advisory Voice and AI (P1 / Wave 6)

**Goal**: Voice/assistant/Admin AI use live server contracts, preserve evidence/quota/privacy, and never convert unsupported proposals into financial writes.

**Independent test**: Cold/restarted and edited proposal paths are honest; transfer/obligation metadata cannot be dropped into an expense; quota exhaustion returns real limit/use/reset metadata; provider outage leaves core finance unaffected.

### Tests and implementation

- [ ] T078 [US6] Add failing BE009 safe-error tests for quota/consent/conflict/provider codes and metadata in `apps/api/test/unit/http/safe-exception-filter.spec.ts` and AI contract tests; add real AJV instances for quota, preference, Admin mutation, and AssistantMessage schemas.
- [ ] T079 [US6] Repair BE009 repository/error transport and OpenAPI closed-schema composition in existing owner files; preserve allowlisted safe quota metadata; rerun full AI unit/contract/integration/security/recovery and OpenAPI checks.
- [ ] T080 [US6] Add failing Mobile voice tests in `apps/mobile/src/services/live/voice-api-service.test.ts` for actual duration, restored proposals, edited transcript, multiple proposals, transfer/obligation metadata, strict upload/process/poll states, and original operation/version IDs.
- [ ] T081 [US6] Define the smallest honest owner-contract disposition for edited/multi/transfer/obligation voice flows in BE009 artifacts; implement only existing-owner capability or expose explicit unavailable state—never downgrade them to expense—in `apps/mobile/src/services/live/voice-api-service.ts`; rerun T080.
- [ ] T082 [US6] Add failing assistant tests in `apps/mobile/src/services/live/assistant-api-service.test.ts` for authoritative availability/quota, cold response/preview retrieval, editable preview behavior, complete action/source-version mapping, and explicit unknown/error states.
- [ ] T083 [US6] Implement strict assistant mappings through BE009 endpoints in `apps/mobile/src/services/live/assistant-api-service.ts`; remove cache-only/fabricated availability/version behavior and preserve advisory confirmation; rerun T082.
- [ ] T084 [US6] Wire Clerk token providers before voice/assistant service selection in `apps/mobile/src/services/voice-analyzer-service.ts`, `assistant-service.ts`, and Mobile bootstrap; ensure the pre-existing assistant capability hunk is integrated without staging the user-owned subscription-live hunk; run capability/selector tests.
- [ ] T085 [US6] Add failing Admin AI mapping tests in `apps/admin-web/src/features/ai/repository.test.ts` for strict schemas, cursor totals, money/token metrics, sanitized reports, exact mutation payloads and error/MFA behavior.
- [ ] T086 [US6] Correct `apps/admin-web/src/features/ai/repository.ts` to use exact BE009 responses without fabricated severity/content/safety defaults; rerun T085.
- [ ] T087 [US6] Execute Wave 6 shadow/cohorts/rollback using deterministic provider stubs, confirm shared five-request rolling-24-hour quota across workloads and outage isolation, and record `evidence/wave-06-voice-ai.md` plus genuine OpenRouter/device external gates.
- [ ] T088 [US6] Run full BE009/Mobile voice-assistant/Admin AI/security/performance/stress/recovery/production scans; update manifest/mock report/checklists and exact evidence.
- [ ] T089 [US6] Run all reviews/scans, fix blockers, hunk/path-stage only Wave 6/BE009 files, verify the subscription hunk remains user-owned, commit `feat(cutover): complete voice ai wave`, push `main`, and wait for green required CI before T090.

---

## Phase 9: User Story 7 - Exact Reports and Authorized Delivery (P1 / Wave 7)

**Goal**: Reports/analytics exactly match ledger truth for the requested scope and never fabricate delivery or saved settings.

**Independent test**: Partial-month, timezone, account-scope, rich summary, export, schedule and cold-history cases either round-trip exactly or expose explicit unsupported state; monetary shadows differ by zero.

### Tests and implementation

- [ ] T090 [US7] Add failing BE010 partial-month integration/reconciliation tests under `apps/api/test/integration/reports/` proving summary/category/detail use the exact requested interval.
- [ ] T091 [US7] Correct BE010 date-range aggregation at the owner source and update its OpenAPI/evidence; rerun reports unit/contract/integration/security/recovery/performance/stress suites.
- [ ] T092 [US7] Resolve BE010 owner contract for Mobile `anchorDate`, timezone, account scope, rich summaries/breakdowns and schedule fields: extend the existing owner contract minimally where required by accepted Mobile specs, otherwise encode an explicit unavailable client state; update BE010 artifacts before adapter work.
- [ ] T093 [US7] Add failing Mobile report tests in `apps/mobile/src/services/live/reports-service.test.ts` for exact query scope, partial state/reasons, all rich fields, schedule round-trip, local persistent drafts, cold/other-device attempts, and server-owned delivery.
- [ ] T094 [US7] Implement strict BE010 mappings in `apps/mobile/src/services/live/reports-service.ts`, remove local relabeling/defaults/cache requirement, and make unsupported dimensions explicit; rerun T093.
- [ ] T095 [US7] Replace production imports of `apps/mobile/src/services/mocks/reports-service.ts` and delivery simulation with the live service while retaining local draft/preview only; run report selector/query/boundary tests.
- [ ] T096 [US7] Add failing Admin overview/analytics/export strict tests in `apps/admin-web/src/features/overview/repository.test.ts` and `report-exports.test.ts` for exact financial values, currency/source version, page/filter semantics, explicit incomplete data, export request/status fields, validated short-lived links, and bounded polling.
- [ ] T097 [US7] Correct `apps/admin-web/src/features/overview/repository.ts` and `report-exports.ts` to map accepted BE010/013 aggregates/exports through the shared client without synthetic totals or delivery state; rerun T096.
- [ ] T098 [US7] Execute Wave 7 exact financial shadow/cohorts/rollback, export authorization/redaction/link expiry, schedule timezone and provider-outage checks; record `evidence/wave-07-reports.md` and open SMTP/Storage gates honestly.
- [ ] T099 [US7] Run full BE010/Mobile reports/Admin analytics/security/performance/stress/recovery/production scans; update manifest/mock report/checklists.
- [ ] T100 [US7] Run all reviews/scans, fix blockers, stage only Wave 7/BE010 paths, commit `feat(cutover): complete reports wave`, push `main`, and wait for green required CI before T101.

---

## Phase 10: User Story 8 - Private Engagement and Support (P1 / Wave 8)

**Goal**: Notification/support/content clients are live and preserve full preferences, ownership, redaction, attachments, drafts and published state.

**Independent test**: Preferences GET resolves correctly, every setting round-trips, pagination covers all matches, unknown states fail, drafts retain attachments/context on failure, and customers never receive internal/unscanned/unpublished content.

### Tests and implementation

- [ ] T101 [US8] Add an actual GET route regression in `apps/api/test/contract/engagement/notifications-http.contract-spec.ts` proving `/api/v1/notifications/preferences` is not captured as `:notificationId`.
- [ ] T102 [US8] Reorder the existing BE011 routes in `apps/api/src/engagement/engagement.routes.ts`; rerun T101 and engagement contract/integration tests.
- [ ] T103 [US8] Add BE011 real-instance schema tests for cursor pages, notifications/preferences, categories, ticket detail and errors; repair BE011 OpenAPI/runtime shape drift and rerun `test:openapi`/engagement contracts.
- [ ] T104 [US8] Add failing Mobile notification/support tests in `apps/mobile/src/services/live/engagement-service.test.ts` and contract query tests for strict enums/actions, per-action expiry, full preference matrix, mark-all pagination, ticket statuses, attachment IDs/context, draft preservation, and no first-category fallback.
- [ ] T105 [US8] Correct `apps/mobile/src/services/live/engagement-service.ts` mappings and error handling; traverse cursors, preserve all fields/attachments/drafts, and expose absent delete/source-create/rating capabilities explicitly; rerun T104.
- [ ] T106 [US8] Replace notification/support query imports of mock modules with `apps/mobile/src/services/engagement-service.ts`; configure Clerk token before selection and connect native notification permission/push-device registration; run notification/preferences/support/native boundary tests.
- [ ] T107 [US8] Add failing Admin communications tests in `apps/admin-web/src/features/communications/repository.test.ts` for shared auth, 401/403/409/429 preservation, strict response decoding, complete cursor traversal/history/body/notes/attachments, exact versions/reasons, categories/templates/campaigns, and audience preview ID/expiry/counts.
- [ ] T108 [US8] Refactor `apps/admin-web/src/features/communications/repository.ts` onto the shared API client and exact BE011 schemas; remove custom error rewriting and fabricated metrics; rerun T107.
- [ ] T109 [US8] Harden MSW engagement handlers in `apps/admin-web/src/mocks/handlers/communications.ts` to validate/persist supported test mutations and reject unknown actions/unhandled requests; keep this test/development-only and run handler/route tests.
- [ ] T110 [US8] Execute Wave 8 shadow/cohorts/rollback with quiet-hours/dedupe/redaction/owner/internal-note/quarantine/published-only/provider-outage checks; record `evidence/wave-08-engagement.md` plus push/SMTP/Storage/scanner/device gates.
- [ ] T111 [US8] Run full BE011/Mobile engagement/Admin communications/security/performance/stress/recovery/Playwright/production scans; update manifest/mock report/checklists.
- [ ] T112 [US8] Run all reviews/scans, fix blockers, stage only Wave 8/BE011 paths, commit `feat(cutover): complete engagement wave`, push `main`, and wait for green required CI before T113.

---

## Phase 11: User Story 9 - Honest Operations and Release State (P1 / Wave 9)

**Goal**: Operations/governance surfaces use exact live data and permissions, stable cohorts, safe actions, and free-only capability metadata.

**Independent test**: Live Admin values are source-faithful and permission-gated, 1% rollout does not become 100%, flags cannot weaken security, no arbitrary execution is possible, and Mobile reports all billing capabilities false.

### Tests and implementation

- [ ] T113 [US9] Add BE013 OpenAPI instance tests for operations incident status/severity and update requests under `apps/api/test/contract/operations/`; repair references/closed schema composition in the BE013 OpenAPI.
- [ ] T114 [US9] Add failing BE013 evaluator tests in `apps/api/test/unit/operations/feature-evaluator.spec.ts` for stable server-derived percentage cohorts and invariant-blocked flags; implement the minimum deterministic bucketing in existing BE013 evaluator/meta context without a new service/table.
- [ ] T115 [US9] Add failing Mobile meta tests in `apps/mobile/src/services/live/platform-operations-service.test.ts` for selector use, strict schema, minimum versions, ETag/cache freshness, unavailable errors, and every free-only literal; remove fabricated fallback state and wire the production consumer.
- [ ] T116 [US9] Add failing Admin operations tests in `apps/admin-web/src/features/system-health/repository.test.ts` and the incident cases in `security/repository.test.ts` for measured-vs-budget latency, evidence age/scope, exact totals/cursors/filters, no synthetic current timestamps/freshness/first-row inference, safe cardinality, unknown states, incident detail/actions, and job action permissions/MFA.
- [ ] T117 [US9] Correct `apps/admin-web/src/features/system-health/repository.ts` and the operations-incident mapping in `security/repository.ts` to preserve exact BE013 values and explicit unavailable/partial state without synthetic timestamps, totals, success or first-row inference; rerun T116.
- [ ] T118 [US9] Add failing Admin governance tests in `apps/admin-web/src/features/governance/repository.test.ts` for exact role/permission, invitation permission combination, actor-scoped invalidation, settings keys/redaction and multi-field updates, flag rules/percentages/targeting/schedule, maintenance canonical fields/times and version/reason/idempotency.
- [ ] T119 [US9] Correct `apps/admin-web/src/features/governance/repository.ts` so 1% remains 1%, rules round-trip, maintenance edits persist, and all mappings use exact BE003/013 contracts; rerun T118.
- [ ] T120 [US9] Remove or hard-disable obsolete/coarse mock-only operational actions in `apps/admin-web/src/mocks/handlers/system-health.ts`, `governance.ts`, `attention.ts`, and related state modules; ensure test permissions match domain scopes and unhandled actions fail.
- [ ] T121 [US9] Execute Wave 9 shadow/cohorts/rollback with exact Admin permissions/MFA, bounded job actions, redacted settings, safe flags/cardinality, Mobile meta and inactive billing providers; record `evidence/wave-09-operations.md` plus hosted ops/DR gates.
- [ ] T122 [US9] Run BE013 operations recovery, performance, stress and cache commands explicitly in addition to normal CI; run Mobile operations/Admin system-health/governance/full Playwright/production scans and record exact results.
- [ ] T123 [US9] Update final operation rows in manifest/mock report/checklists; run all reviews/scans, fix blockers, stage only Wave 9/BE013 paths, commit `feat(cutover): complete operations wave`, push `main`, and wait for green required CI before T124.

---

## Final Phase: Hardening And Acceptance

- [ ] T124 Run `speckit-converge` against current code/spec/plan/tasks, append every unbuilt local gap to this file, and run `speckit-implement` again if tasks are added; repeat until convergence reports no locally actionable gap.
- [ ] T125 Run `speckit-analyze` again, update `evidence/artifact-analysis.md`, and resolve every new material contract/ownership/Constitution/coverage finding; rerun convergence if resolution adds work.
- [ ] T126 Verify the target is the disposable repository-local Supabase instance, then run clean reset, database lint, full pgTAP and migration checksums; record exact commands/results and skips in `evidence/final-local-verification.md`.
- [ ] T127 Run full API `verify`, every domain-specific unit/contract/integration/E2E/security/concurrency/performance/stress/recovery suite, OpenAPI snapshot/instance drift, container build/tests, dependency/image/secret/workflow-pin scans; record exact results in `evidence/final-local-verification.md`.
- [ ] T128 Run Mobile typecheck, lint, every quality boundary, full Jest/integration/applicable E2E, SQLite migration/preservation/encryption/sync, production build/static/mock/provider-secret scans; record exact results.
- [ ] T129 Run Admin typecheck, lint, production build with valid live config and every invalid/mock config, full Vitest, all applicable Playwright routes/viewports, accessibility/pagination/filter/loading/empty/error/retry matrices, and bundle/mock/secret/URL scans; record exact results.
- [ ] T130 Reconcile ledger, report, planning, sync, provider/storage/queue state using existing owner procedures; require exact financial equality and record query-plan/P95/P99/payload/cache/no-N+1 evidence.
- [ ] T131 Rehearse N-1 client/image rollback, failed migration/forward correction, worker/event/webhook replay, disposable backup restore, storage recovery and locally provable RPO/RTO; distinguish same-database/text-only tests from full DR proof.
- [ ] T132 Complete OWASP ASVS/API/MASVS traceability, audit/redaction review, production mock-removal report, dependency/container review, and zero-exploitable-Critical/High assertion with evidence.
- [ ] T133 Use `clean-code-guard` on all Phase 14 production diffs, `test-guard` on all changed tests, `codex-security:security-diff-scan` on every Phase 14/owner correction diff, and independent code review on the final aggregate; resolve all blockers and rerun affected gates.
- [ ] T134 Complete `checklists/release.md`, `evidence/mock-removal-report.md`, `evidence/external-gates.md`, and `evidence/closeout.md`; every open external item must name exact missing access/action, completed local proof, and follow-up procedure.
- [ ] T135 Recompute preserved user-path hashes/diffs, prove all unrelated work remains and only approved assistant capability hunks were integrated, and record the result in `evidence/closeout.md`.
- [ ] T136 Stage only final Phase 14 evidence/fixes, inspect `git diff --cached` plus secret scan, commit `docs(cutover): close phase 14`, push `main`, and wait for every required final workflow on the exact SHA; forward-fix failures without force/history rewrite.
- [ ] T137 Verify `git rev-parse main` equals `git rev-parse origin/main`, required final CI is successful, no locally actionable task remains, every task is checked or precisely marked external, and SPEC-BE-012 is absent; only then update final Master Plan/status evidence and declare local Phase 14 completion.

## Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T001, T007-T009, T035-T036, T135-T137 |
| FR-002 | T004-T005, T022, T034, T044, T056, T066, T076, T088, T099, T111, T123, T134 |
| FR-003 | T011-T012, T019-T021, T025, T028-T029, T128 |
| FR-004 | T010, T013-T014, T019-T021, T026, T030-T031, T129 |
| FR-005 | T019-T020 and the strict contract/mapping tests and implementations in T023-T123 |
| FR-006 | T015-T018, T037-T067, T078-T100, T130 |
| FR-007 | T017-T018 and every wave rehearsal/evidence/delivery task T032-T036, T042-T045, T054-T057, T065-T067, T075-T077, T087-T089, T098-T100, T110-T112, T121-T123 |
| FR-008 | T025, T029, T041, T049-T054, T060-T065, T093-T095, T128, T131 |
| FR-009 | T023-T036 |
| FR-010 | T037-T045 |
| FR-011 | T046-T057 |
| FR-012 | T058-T067 |
| FR-013 | T068-T077 |
| FR-014 | T078-T089 |
| FR-015 | T090-T100 |
| FR-016 | T101-T112 |
| FR-017 | T113-T123 |
| FR-018 | T033, T043, T055, T066, T076, T088, T099, T111, T122, T126-T133 |
| FR-019 | T032-T036, T042-T045, T054-T057, T065-T067, T075-T077, T087-T089, T098-T100, T110-T112, T121-T123, T134, T137 |
| FR-020 | T004-T005, T017-T018, T038, T046-T048, T058-T059, T070, T078-T081, T090-T092, T101-T103, T113-T114, T132, T137 |
| SC-001 | T004-T005, T022, all per-wave manifest updates, T124-T125, T134, T137 |
| SC-002 | T011-T014, T025-T036, T128-T129 |
| SC-003 | T015-T016, T037-T123 financial/report checks, T130 |
| SC-004 | T029, T041, T049-T054, T061-T065, T128, T131 |
| SC-005 | All nine user-story test/implementation/checkpoint phases T023-T123, T128-T129 |
| SC-006 | T126-T137 |
| SC-007 | T017-T018, T084, T113-T123, T132, T134, T137 |

## Dependencies

```text
Phase 1 artifacts/analysis
  -> Phase 2 shared runtime/auth/shadow/rollback foundations
  -> Wave 1 Identity
  -> Wave 2 Reference/accounts
  -> Wave 3 Ledger/sync
  -> Wave 4 Planning
  -> Wave 5 Tracking/imports
  -> Wave 6 Voice/AI
  -> Wave 7 Reports
  -> Wave 8 Engagement
  -> Wave 9 Operations
  -> convergence/analyze/full release closeout
```

No later wave starts before the prior wave's pushed SHA has required green CI. Owner-side contract repairs are dependencies of their wave and remain attributed to the owning Spec.

## Parallel Execution Examples

Parallelism is limited to read-only review or independent tests that use different processes/files and no shared mutable database. Examples after the relevant implementation is stable:

- Mobile typecheck/lint and Admin typecheck/lint may run concurrently while API unit/contract tests run.
- Read-only Clean Code, test, and security reviews may run independently against the same immutable diff.
- Never run reset/recovery/performance commands concurrently against one database, never edit the shared checkout from multiple agents, and never overlap wave commits/pushes.

## Implementation Strategy

The approved MVP is the full nine-wave free-only cutover. Deliver it incrementally: each wave is independently testable, rollback-capable, reviewed, and remotely green. Reuse current contracts and storage seams; write the smallest root-cause fix and one focused regression for nontrivial logic. Do not activate billing or create generic cutover infrastructure.

## Completion Rule

Do not mark a task complete or claim a verification result unless the named command/procedure was executed successfully and its evidence was retained. Skipped live suites and external gates remain explicit. Phase 14 is complete only after all local tasks, all nine ordered remote gates, convergence/analysis, final verification, pushed `main` parity, and honest external-gate accounting.
