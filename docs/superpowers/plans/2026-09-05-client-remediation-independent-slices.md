# Client Remediation Independent Slices Implementation Plan

> **For Codex:** Execute this plan on the existing local `main` checkout, in order, using strict red-green-refactor cycles. Do not begin the next slice until the current slice has passed local gates, independent review, a scoped commit, push, and remote CI confirmation.

**Goal:** Close client-remediation items #30, #45, and #38/#39 as three independently releasable Backend + API + Mobile slices without pulling Phase 14 live cutover or unrelated backlog into scope.

**Architecture:** Extend the existing reference-data, ledger, sync, tracking, engagement, and mobile core-finance seams. Keep security and money invariants in PostgreSQL/shared server boundaries, expose only the minimum additive API contracts, and preserve mobile offline/mock behavior with the same fields and decisions. All migrations are new, forward-only files under `supabase/migrations/`; no historical migration is edited.

**Tech stack:** PostgreSQL/Supabase SQL and pgTAP; NestJS/TypeScript/Jest; React Native/Expo/TypeScript/Jest; existing OpenAPI, localization, sync, audit, outbox, and notification infrastructure.

## Global constraints and baseline

- [x] Confirm local `main` is aligned with `origin/main` before edits (`ed5bd4c047b02648a5a79e164c0c9a88ac51a72a`, ahead/behind `0/0`).
- [x] Record and preserve pre-existing user changes: `apps/mobile/src/services/contracts/assistant-notifications-service.ts`, `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, and `apps/api/supabase/`.
- [x] Read the API and Mobile constitutions, `docs/CLIENT_REMEDIATION_PLAN.md`, `docs/Back end/BACKEND_MASTER_PLAN.md`, complete owning Backend artifacts for SPEC-BE-004/005/006/008/011, relevant Mobile 004/005/013/014/017 artifacts, current migrations/contracts/tests, and relevant git history.
- [x] Before every commit, use path-scoped staging and inspect `git diff --cached --check`, `git diff --cached --stat`, and `git diff --cached`; never stage the baseline user-owned paths.
- [x] When any expected check fails, apply systematic debugging: reproduce, trace the shared root cause, add/retain a failing regression test, fix the root boundary, and rerun the narrow check before broad gates.
- [x] Do not add a package, parallel service layer, speculative abstraction, bulk lifecycle action, archive undo, provider-specific card rule, or Phase 14 live cutover.

## Slice 1 — Client item #30: authoritative category usage before archive/merge

### Task 1.1 — Specify the contract and make API/mobile tests fail

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/spec.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/plan.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/tasks.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/data-model.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/contracts/openapi.yaml`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/spec.md`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/plan.md`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/tasks.md`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/contracts/events.md`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/contracts/internal-contracts.md`
- Modify: `apps/mobile/specs/004-core-finance/spec.md`
- Modify: `apps/mobile/specs/004-core-finance/contracts/core-finance-contract.md`
- Modify: `apps/mobile/specs/014-r03-categories/spec.md`
- Modify: `apps/mobile/specs/014-r03-categories/contracts/category-presentation-contract.md`
- Modify: `apps/api/test/contract/reference/reference-openapi.contract.spec.ts`
- Modify: `apps/api/test/unit/reference/category.service.spec.ts`
- Modify: `apps/mobile/src/services/mocks/core-finance-categories.test.ts`
- Modify: `apps/mobile/src/features/categories/CategoryDetailScreen.test.tsx`

- [x] Document an owner-scoped `GET /api/v1/categories/{categoryId}/usage` response containing the server-derived `linkedTransactionCount` and current category `version`.
- [x] Document archive and merge count preconditions (`expectedLinkedTransactionCount`) in addition to existing optimistic version and idempotency behavior.
- [x] Define archive as category-only lifecycle change and merge as one atomic transaction that reassigns all owned source transactions to the compatible owned target before marking the source merged.
- [x] Define missing, foreign, system, archived, merged, incompatible-target, stale-version, and changed-count behavior without leaking another owner’s existence.
- [x] Add failing OpenAPI, service, mock parity, zero/one/many count, and localized confirmation tests.
- [x] Run focused RED checks and record the expected assertion/type failures:
  - `cd apps/api; npx jest --selectProjects unit contract --runInBand test/contract/reference/reference-openapi.contract.spec.ts test/unit/reference/category.service.spec.ts`
  - `cd apps/mobile; npm test -- --runInBand src/services/mocks/core-finance-categories.test.ts src/features/categories/CategoryDetailScreen.test.tsx`

  Result: both selections failed on the missing usage operation/method and count-bearing confirmation, before production implementation. The repository-supported npm/Jest path was used because the pre-existing untracked `apps/api/pnpm-workspace.yaml` and lockfile make pnpm invoke an unrelated dependency guard; neither user-owned file was changed.

### Task 1.2 — Add database-level authoritative counting and atomic merge

**Files:**

- Create: `supabase/migrations/20260905080000_client_category_usage.sql`
- Create: `supabase/tests/051_client_category_usage.sql`
- Modify: `apps/api/src/reference/reference.repository.ts`
- Modify: `apps/api/test/integration/reference/category.integration.spec.ts`
- Modify: `apps/api/test/security/reference/reference-boundaries.spec.ts`

- [x] Add owner-scoped SQL functions that take the existing per-owner ledger advisory lock, lock the source category, and count only that owner’s transaction headers.
- [x] Require server recomputation at archive/merge execution; reject a changed count rather than trusting the client-provided value.
- [x] Reassign source transaction headers during merge under `masarifi.ledger_command`, preserve postings, append transaction revisions, enqueue transaction/category outbox events, and audit the action in the same database transaction.
- [x] Enforce unmerged active-or-archived custom source, active compatible target, same owner/kind, non-self target, expected version, and BOLA-safe unavailable responses.
- [x] Cover zero, one, and many links; system/custom; active/archived/merged/missing; foreign owner; changed count; stale version; and atomic evidence in pgTAP/integration/security tests.
- [x] Run GREEN checks:
  - `supabase db reset`
  - `supabase db lint --level warning --fail-on error`
  - `supabase test db`
  - `cd apps/api; npx jest --selectProjects integration security --runInBand --testPathPatterns=reference`

  Result: clean reset passed twice; schema lint passed; full pgTAP passed 51 files / 1,633 tests; live category integration passed; the final reference selection passed 27 suites / 107 tests.

### Task 1.3 — Expose the API and wire mobile live/mock parity

**Files:**

- Modify: `apps/api/src/reference/reference.controller.ts`
- Modify: `apps/api/src/reference/reference.service.ts`
- Modify: `apps/api/test/unit/reference/reference-http.spec.ts`
- Modify: `apps/api/test/contract/reference/reference-routes.contract-spec.ts`
- Modify: `apps/mobile/src/services/contracts/core-finance-service.ts`
- Modify: `apps/mobile/src/services/mocks/core-finance-service.ts`
- Create: `apps/mobile/src/services/live/category-lifecycle-service.ts`
- Create: `apps/mobile/src/services/live/category-lifecycle-service.test.ts`
- Modify: `apps/mobile/src/features/categories/CategoryDetailScreen.tsx`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`

- [x] Add the authenticated owner-scoped usage route and validate integer count/version/count preconditions at the transport boundary.
- [x] Preserve existing idempotency replay and optimistic version semantics for archive and merge.
- [x] Add the smallest live category lifecycle adapter following the existing injected request/token pattern; retain repository-backed mock behavior for tests/demo without changing unrelated core-finance paths.
- [x] Fetch authoritative usage immediately before presenting archive/merge confirmation, show the count in Arabic and English, and send the returned count/version with the selected destructive action.
- [x] Keep archive and merge distinct; do not add undo or bulk actions.
- [x] Run focused GREEN checks:
  - `cd apps/api; npx jest --selectProjects unit contract --runInBand --testPathPatterns=reference`
  - `cd apps/mobile; npx jest --runInBand src/features/categories src/features/core-finance src/services/mocks/core-finance-service.test.ts src/services/mocks/core-finance-categories.test.ts src/services/live/category-lifecycle-service.test.ts src/storage/core-finance-repository.test.ts src/storage/core-finance-persistence.test.ts`

  Result: focused API suites passed; the broader API reference selection passed 27 suites / 107 tests; Mobile passed 20 suites / 88 tests; Mobile TypeScript and lint passed (lint retained 79 pre-existing warnings and zero errors).

### Task 1.4 — Close evidence, verify, review, commit, push, and confirm CI

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/evidence/acceptance.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/evidence/security.md`
- Modify: `apps/api/specs/005-transactions-ledger-integrity/evidence/atomicity.md`
- Modify: `apps/mobile/specs/014-r03-categories/tasks.md`
- Modify: `docs/CLIENT_REMEDIATION_PLAN.md`
- Modify: `docs/Back end/BACKEND_MASTER_PLAN.md`
- Modify: this plan

- [x] Record commands/results and mark only item #30 complete; distinguish local evidence from remote CI.
- [x] Run API lint, typecheck, build, relevant unit/contract/integration/security tests, clean Supabase reset/lint/full pgTAP, and Mobile lint/typecheck/relevant Jest.
- [x] Request an independent read-only review against the Slice 1 contract and fix every critical/important finding with a regression test.
- [x] Rerun affected checks after review fixes and inspect the complete slice diff for scope creep and baseline-file contamination.
- [x] Commit only Slice 1 with item-specific messages; push `main`; verify the pushed SHA and all required remote CI checks before proceeding.

  Review note: the independent read-only review found no critical issues and two important issues. It identified a regression in the approved archived-source merge transition and four stale metadata-only statements in owning artifacts. The source-active restriction was removed across SQL/API/Mobile, a live archived-source regression was added, the contradictory text was replaced, and clean reset/schema lint/full pgTAP plus the narrow API/Mobile regressions passed again.

  Local gate note: API typecheck/build/touched-file lint passed. Full API lint reaches only seven pre-existing unrelated `no-meaningless-void-operator` errors in reports files; Slice 1 does not modify them. Full Mobile Jest passed 415 suites / 1,685 tests. Migration checksum verification passed. One parallel API Jest attempt exhausted Node's default 2 GB heap; the same selection passed alone with `NODE_OPTIONS=--max-old-space-size=4096`.

  Remote gate note: `7a12dd42e754fc0294d12fa8663666837f822ac8` was followed by `e47eff88063fc74f35ab9dc7e0651eea59a0063a` after the first CI run identified two missing names in the migration inventory test. The exact migration suite passed 4/4 locally after the fix. Backend Foundation run `33987079570` then passed application, database, Mobile, Admin, secrets, redaction, image/container, and vulnerability-scan jobs.

## Slice 2 — Client item #45: per-account automatic tracking control

### Task 2.1 — Specify the gate and make persistence/contract tests fail

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/spec.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/plan.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/tasks.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/data-model.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/contracts/openapi.yaml`
- Modify: `apps/api/specs/006-offline-sync-idempotency/spec.md`
- Modify: `apps/api/specs/006-offline-sync-idempotency/plan.md`
- Modify: `apps/api/specs/006-offline-sync-idempotency/tasks.md`
- Modify: `apps/api/specs/006-sync-offline-idempotency/data-model.md`
- Modify: `apps/api/specs/008-tracking-imports-deduplication/spec.md`
- Modify: `apps/api/specs/008-tracking-imports-deduplication/plan.md`
- Modify: `apps/api/specs/008-tracking-imports-deduplication/tasks.md`
- Modify: `apps/api/specs/008-tracking-imports-deduplication/data-model.md`
- Modify: `apps/mobile/specs/005-automatic-tracking/spec.md`
- Modify: `apps/mobile/specs/005-automatic-tracking/contracts/automatic-tracking-contract.md`
- Modify: `apps/mobile/specs/013-r02-accounts/spec.md`
- Modify: `apps/mobile/specs/013-r02-accounts/contracts/account-presentation-contract.md`
- Modify: `apps/api/test/contract/reference/reference-openapi.contract.spec.ts`
- Modify: `apps/api/test/unit/reference/account.service.spec.ts`
- Modify: `apps/api/test/unit/tracking/tracking.worker.spec.ts`
- Modify: `apps/mobile/src/domain/core-finance.test.ts`
- Modify: `apps/mobile/src/services/mocks/automatic-tracking-service.test.ts`
- Modify: `apps/mobile/src/features/accounts/AccountForm.test.tsx`

- [x] Define non-null `automaticTrackingEnabled` on accounts with a backward-compatible default of `true`.
- [x] Define effective tracking as global tracking enabled AND an active, owned, supported account with account tracking enabled.
- [x] Define missing, foreign, archived, disabled, unsupported, and unresolved accounts as the same fail-closed outcome before proposal/review/ledger effects.
- [x] Define account CRUD, audit/event, sync bootstrap/delta/tombstone, and offline storage behavior.
- [x] Add failing API/mobile tests and run focused RED checks.

### Task 2.2 — Enforce one shared server-side tracking gate

**Files:**

- Create: `supabase/migrations/20260905081000_account_automatic_tracking.sql`
- Create: `supabase/tests/052_account_automatic_tracking.sql`
- Modify: `apps/api/src/reference/reference.dto.ts`
- Modify: `apps/api/src/reference/reference.repository.ts`
- Modify: `apps/api/src/reference/reference.events.ts`
- Modify: `apps/api/src/sync/sync.repository.ts`
- Modify: `apps/api/src/tracking/tracking.repository.ts`
- Modify: `apps/api/src/tracking/tracking.service.ts`
- Modify: `apps/api/src/tracking/tracking.worker.ts`
- Modify: `apps/api/test/integration/reference/account.integration.spec.ts`
- Modify: `apps/api/test/integration/sync/delta.integration.spec.ts`
- Modify: `apps/api/test/integration/sync/tombstones.integration.spec.ts`
- Modify: `apps/api/test/integration/tracking/tracking.integration.spec.ts`
- Modify: `apps/api/test/security/tracking-ledger-boundary.spec.ts`
- Modify: `apps/api/test/security/reference/reference-boundaries.spec.ts`

- [x] Add the column, DB constraint/default, CRUD mapping, audited changed-field allowlist, and explicit sync snapshot/delta projection.
- [x] Add one private database assertion reused by tracking finalization and tracking-import ledger writes so a preference race cannot bypass the gate.
- [x] Gate before review/proposal creation and again at the financial write boundary; preserve idempotent retry behavior and avoid partial side effects.
- [x] Keep global tracking preference authoritative and conjunctive; do not build a second tracking subsystem.
- [x] Cover RLS/BOLA, ownership/status/type, parser finalization, direct ledger source spoof attempts, retries, sync field retention, and tombstone privacy.
- [x] Run clean database and focused API GREEN checks.

### Task 2.3 — Persist and edit the account control on Mobile

**Files:**

- Modify: `apps/mobile/src/domain/core-finance.ts`
- Modify: `apps/mobile/src/storage/core-finance-repository.ts`
- Modify: `apps/mobile/src/storage/core-finance-sync-adapter.ts`
- Modify: `apps/mobile/src/services/contracts/core-finance-service.ts`
- Modify: `apps/mobile/src/services/mocks/core-finance-service.ts`
- Modify: `apps/mobile/src/services/mocks/automatic-tracking-service.ts`
- Modify: `apps/mobile/src/features/accounts/AccountForm.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountDetailScreen.tsx`
- Modify: `apps/mobile/src/localization/i18n.ts`
- Modify: `apps/mobile/src/storage/core-finance-repository.test.ts`
- Modify: `apps/mobile/src/storage/sync-delta.test.ts`
- Modify: `apps/mobile/src/features/accounts/AccountForm.test.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountDetailScreen.test.tsx`
- Modify: `apps/mobile/src/localization/automatic-tracking-messages.test.ts`

- [x] Add the account field with default `true`, form switch, detail state, Arabic/English copy, and old-snapshot compatibility.
- [x] Make the mock financial-effect path resolve the account and fail closed before event/review/transaction persistence, matching the live server policy.
- [x] Prove create/edit/persist/reload/sync/bootstrap/delta behavior and disabled/missing/archived account rejection.
- [x] Run Mobile lint/typecheck and focused GREEN Jest suites.

### Task 2.4 — Close evidence, verify, review, commit, push, and confirm CI

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/evidence/phase4-closeout.md`
- Modify: `apps/api/specs/006-sync-offline-idempotency/evidence/phase6-closeout.md`
- Modify: `apps/api/specs/008-tracking-import/evidence/phase8-closeout.md`
- Modify: `apps/mobile/specs/005-automatic-tracking/tasks.md`
- Modify: `apps/mobile/specs/013-r02-accounts/tasks.md`
- Modify: `docs/CLIENT_REMEDIATION_PLAN.md`
- Modify: `docs/Back end/BACKEND_MASTER_PLAN.md`
- Modify: this plan

- [x] Record results and mark only item #45 complete, including explicit proof of the shared server gate and mobile persistence.
- [x] Run the full relevant API/database/Mobile gates and secret/boundary checks.
- [x] Request an independent read-only Slice 2 review; fix all critical/important findings and rerun affected gates.
- [x] Commit only Slice 2, push `main`, verify pushed SHA, and wait for required CI success before Slice 3.

  Release note: implementation commit `cd3bafc28a42b758f6670d2d5b6087cd63abaefc`
  was pushed to `origin/main`; Backend Foundation run
  [`33994830522`](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33994830522)
  passed Admin, Application, Mobile, Database, secrets/redaction, image/container,
  and vulnerability-scan jobs.

## Slice 3 — Client items #38/#39: credit-card terms, due reminders, payoff calculator

### Task 3.1 — Specify integer-safe terms/calculation and make golden tests fail

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/spec.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/plan.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/tasks.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/data-model.md`
- Modify: `apps/api/specs/004-reference-data-categories-accounts/contracts/openapi.yaml`
- Modify: `apps/api/specs/006-sync-offline-idempotency/spec.md`
- Modify: `apps/api/specs/006-sync-offline-idempotency/plan.md`
- Modify: `apps/api/specs/006-sync-offline-idempotency/tasks.md`
- Modify: `apps/api/specs/011-notifications-support-content/spec.md`
- Modify: `apps/api/specs/011-notifications-support-content/plan.md`
- Modify: `apps/api/specs/011-notifications-support-content/tasks.md`
- Modify: `apps/api/specs/011-notifications-support-content/data-model.md`
- Modify: `apps/mobile/specs/004-core-finance/spec.md`
- Modify: `apps/mobile/specs/004-core-finance/contracts/core-finance-contract.md`
- Modify: `apps/mobile/specs/013-r02-accounts/spec.md`
- Modify: `apps/mobile/specs/013-r02-accounts/contracts/account-presentation-contract.md`
- Modify: `apps/api/test/contract/reference/reference-openapi.contract.spec.ts`
- Modify: `apps/api/test/unit/reference/account.service.spec.ts`
- Create: `apps/api/test/unit/reference/credit-card-payoff.spec.ts`
- Modify: `apps/mobile/src/domain/core-finance.test.ts`
- Modify: `apps/mobile/src/features/accounts/AccountForm.test.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountDetailScreen.test.tsx`

- [x] Define nullable `statementDay`, `paymentDueDay`, `monthlyInterestRateBasisPoints`, and `minimumPaymentMinor` fields, with days restricted to 1–28 and non-card incompatibility rejected or cleared.
- [x] State unambiguously that interest is a monthly rate in integer basis points; money is integer minor units; every monthly interest charge rounds half-up to the nearest minor unit.
- [x] Define calculator inputs/outputs and golden cases for zero balance, zero interest, insufficient payment, exact final payment, multi-month rounding, and a case that would expose any 100x scale error.
- [x] Define a finite 1,200-month safety ceiling and a non-payoff result when payment does not exceed accrued interest.
- [x] Define due reminders as reuse of Phase 11 notification events/delivery policy, with device execution remaining behind the existing external-delivery gate.
- [x] Add failing contract/domain/UI golden tests and run focused RED checks.

### Task 3.2 — Add account terms, calculator, sync, and reminder integration

**Files:**

- Create: `supabase/migrations/20260905082000_credit_card_terms.sql`
- Create: `supabase/migrations/20260906080000_credit_card_reminder_batches.sql`
- Create: `supabase/tests/053_credit_card_terms.sql`
- Modify: `apps/api/src/reference/reference.dto.ts`
- Modify: `apps/api/src/reference/reference.controller.ts`
- Modify: `apps/api/src/reference/reference.service.ts`
- Modify: `apps/api/src/reference/reference.repository.ts`
- Modify: `apps/api/src/reference/reference.events.ts`
- Create: `apps/api/src/reference/credit-card-payoff.ts`
- Modify: `apps/api/src/sync/sync.repository.ts`
- Modify: `apps/api/test/integration/reference/account.integration.spec.ts`
- Modify: `apps/api/test/integration/sync/delta.integration.spec.ts`
- Modify: `apps/api/test/security/reference/reference-boundaries.spec.ts`
- Modify: `supabase/tests/050_phase11_content_commands.sql`

- [x] Add constrained account columns with existing rows left null and clear all card-only fields when an account changes to a non-credit-card type.
- [x] Map fields through CRUD, audit/events, OpenAPI, sync snapshots/deltas, and tombstones without leakage or silent loss.
- [x] Implement the payoff calculator as a small pure BigInt function and authenticated stateless API operation; use no float/decimal arithmetic or provider assumptions.
- [x] Add a due-reminder producer that calls existing Phase 11 notification-event policy/infrastructure and is idempotent for account/due date; do not add another scheduler or delivery system.
- [x] Cover DB constraints, old rows, incompatible types, BOLA, idempotent reminders, notification preference suppression, and all golden payoff cases.
- [x] Run clean DB, pgTAP, API lint/typecheck/build, and focused GREEN checks.

### Task 3.3 — Add offline-capable Mobile fields and calculator UI

**Files:**

- Modify: `apps/mobile/src/domain/core-finance.ts`
- Create: `apps/mobile/src/domain/credit-card-payoff.ts`
- Create: `apps/mobile/src/domain/credit-card-payoff.test.ts`
- Modify: `apps/mobile/src/storage/core-finance-repository.ts`
- Modify: `apps/mobile/src/storage/core-finance-sync-adapter.ts`
- Create: `apps/mobile/src/services/live/account-service.ts`
- Create: `apps/mobile/src/services/live/account-service.test.ts`
- Modify: `apps/mobile/src/features/accounts/AccountForm.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountDetailScreen.tsx`
- Modify: `apps/mobile/src/localization/i18n.ts`
- Modify: `apps/mobile/src/storage/core-finance-repository.test.ts`
- Modify: `apps/mobile/src/storage/sync-delta.test.ts`
- Modify: `apps/mobile/src/localization/core-finance-messages.test.ts`

- [x] Add card-only form inputs and validation with native numeric entry, accessible labels, localized errors, and no incompatible data retained for non-card accounts.
- [x] Persist and sync all fields offline with old-record defaults; show terms on card detail only.
- [x] Implement the same pure integer payoff algorithm locally for offline use and render a small calculator on credit-card detail with explicit balance/rate/payment inputs and payoff/non-payoff output.
- [x] Reuse the existing notification settings/infrastructure; do not claim external device delivery without its configured credentials/build gate.
- [x] Prove Arabic/English, accessibility, persistence, sync, and exact API/mobile golden-vector parity; native small-screen/device acceptance remains an external gate.
- [x] Run Mobile lint/typecheck and focused/full Jest as proportional to changes.

### Task 3.4 — Close evidence, verify, review, commit, push, and confirm CI

**Files:**

- Modify: `apps/api/specs/004-reference-data-categories-accounts/evidence/acceptance.md`
- Modify: `apps/api/specs/006-offline-sync-idempotency/evidence/acceptance.md`
- Modify: `apps/api/specs/011-notifications-support-content/evidence/phase11-closeout.md`
- Modify: `apps/mobile/specs/004-core-finance/tasks.md`
- Modify: `apps/mobile/specs/013-r02-accounts/tasks.md`
- Modify: `docs/CLIENT_REMEDIATION_PLAN.md`
- Modify: `docs/Back end/BACKEND_MASTER_PLAN.md`
- Modify: this plan

- [x] Record local results for #38/#39 only; keep release completion pending remote CI and distinguish reminder creation/policy from external device delivery.
- [x] Run complete API gates, clean Supabase reset, DB lint, full pgTAP, Mobile lint/typecheck/full Jest, affected Admin checks, and boundary/security tests; remote Gitleaks remains part of the push CI gate.
- [x] Request an independent read-only Slice 3 review; fix every critical/important finding and rerun affected/full gates.
- [ ] Inspect final slice and cumulative diffs, commit only Slice 3, push `main`, verify pushed SHA, and confirm required CI success.

## Final release gate

### Slice 3 local verification checkpoint — 2026-09-06

Slice 3 is implemented and locally verified but is not release-complete until its
scoped push passes Backend Foundation CI. A clean Supabase reset applied every
migration; database lint passed; full pgTAP passed 53 files / 1,687 tests. The API
passed 112 unit suites / 838 tests, 63 contract suites / 193 tests, 86 live
integration suites / 217 tests, 38 E2E suites / 67 tests, and 40 security suites /
139 tests, plus lint, typecheck, build, performance syntax checks, and migration
checksums. The configured dependency audit threshold passed with one non-blocking
moderate transitive `qs` advisory.

Mobile passed typecheck, all frontend boundary checks, and 417 Jest suites / 1,717
tests. Lint has zero errors and 79 pre-existing warnings outside the Slice 3 files.
Affected Admin Web passed typecheck, lint, 72 Vitest files / 796 tests, and its
82-route production build. Independent review found and drove fixes for financial
privacy display, customer-timezone reminder dates/expiry, account notification
routing, batching starvation, and the injectable live account conflict/retry seam.

The local database producer creates idempotent Phase 11 events and policy inputs;
it does not prove APNs/FCM/SMTP receipt. The live account adapter is an injectable
contract seam only. Binding account CRUD/offline upload to production providers is
still Phase 14 work and was intentionally not added.

- [ ] Confirm `main` and `origin/main` match at the final pushed SHA and no slice commit contains any baseline user-owned file.
- [ ] Confirm the working tree differs from clean only by the recorded pre-existing paths (plus any explicitly documented external evidence artifact that cannot be committed).
- [ ] Re-run or cite fresh successful results for API lint/typecheck/build/test, clean Supabase reset/lint/full pgTAP, Mobile lint/typecheck/full Jest, applicable admin checks, secret scan, and boundary/security suites.
- [ ] Verify the latest required remote CI checks on the final SHA.
- [ ] Ensure `docs/CLIENT_REMEDIATION_PLAN.md`, `docs/Back end/BACKEND_MASTER_PLAN.md`, owning spec evidence, and every checkbox above reflect actual—not intended—completion.
- [ ] Report exact commit SHAs, pushed branch, local and remote evidence, unresolved Phase 14/live delivery gates, and preserved user changes.
