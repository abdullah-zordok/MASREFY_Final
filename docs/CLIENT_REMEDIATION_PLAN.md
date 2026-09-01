# Masarifi Client Feedback Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reconcile all 62 fixed client-feedback IDs with the current Masarifi codebase and deliver the remaining work without replacing correct code, duplicating the active backend roadmap, or redesigning the approved Mobile UI.

**Architecture:** Keep the current offline-capable Mobile repositories and the approved Admin frontend boundaries. Correct local truth first, extend the canonical Backend Master Plan before its product-domain Specs are generated, then cut each client through the live API using the existing adapter seams. Financial totals come from one ledger projection; Admin remains an operational client and never becomes a second business-logic owner.

**Tech stack:** Expo 55, React Native 0.83, TypeScript, Expo Router, SQLite, Jest; Next.js, React, MSW, Vitest, Playwright; NestJS 11, PostgreSQL/Supabase, SQL migrations, Jest, pgTAP, Docker.

**Spec:** Client review dated 2026-08-26 at C:/Users/DELL/.codex/attachments/62331b2c-ce0c-4c49-ad00-23c26fae2596/pasted-text.txt, current Mobile Specs 001–016, docs/Back end/BACKEND_MASTER_PLAN.md, and docs/product/masarifi-full-product-technical-plan-v3.md.

> **Repository-authoritative baseline (2026-09-01):** The audit narrative below preserves its
> historical 2026-08-27 snapshot and is not the current backend status. SPEC-BE-001 through
> SPEC-BE-004 and SPEC-BE-006 are complete; SPEC-BE-005 is being implemented independently.
> This Mobile worktree integrated SPEC-BE-006 at `2eeb00bdc6687602c2fb807b88eeb1f71bfc5807`
> and did not modify backend code, schemas, migrations, specifications, or the Backend Master Plan.

## Global Constraints

- Analysis date: 2026-08-27, Asia/Riyadh.
- The client IDs remain 1–62 and are never renumbered.
- The approved Mobile visual identity, navigation architecture, Home composition, typography system, colors, cards, and buttons remain frozen unless an item is marked Requires Explicit UI/Product Approval.
- Do not copy Base44 fields mechanically. Preserve the business meaning through the current ledger, timestamp, adapter, and security architecture.
- Do not insert duplicate backend tasks. Amend the owning Backend Master Plan phase before generating that phase's Spec, then implement through the normal backend sequence.
- Preserve current Mobile SQLite data with versioned, idempotent migration/upload adapters. No wipe, destructive backfill, guessed category kind, fabricated card terms, or silent field loss.
- Money is integer minor units in storage and API contracts; percentages have an explicit scale; timestamps are timezone-aware.
- Production clients fail closed when a backend/provider/native capability is absent. Demo and MSW data never masquerade as production state.
- Every non-trivial financial rule begins with a failing regression test and ends with cross-surface numeric parity.

---

## 1. Executive Summary

The client report is valuable product input but is not a reliable snapshot of the current repository. Its screenshots are dated 2026-08-23; the current Mobile branch contains a substantial correction series through 2026-08-26, and backend planning/implementation started on 2026-08-27.

Current verification found:

- Already resolved in current Mobile code: #3, #20, #21, #22, #23, #29, #34, #36, #52, #55, and #61.
- Materially improved but not fully release-complete: #2, #4, #5, #6, #14, #18, #19, #24, #26, #27, #30, #35, #42, #44, #45, #47, #48, #53, #57, #58, #59, and #60.
- Confirmed remaining Mobile/product gaps: #1, #7–13, #15, #17, #31, #33, #37–41, #46, #54, #56, and #62.
- Explicit decisions or deferrals are required for #30, #31, #33, #37, #41, #43, #49, #51, and #53.
- #50 is an external privacy incident in the screenshot archive, not a repository feature.

The backend is not yet a product backend. The active uncommitted work implements part of SPEC-BE-001 only: platform configuration, health/meta, migrations, outbox, observability, and supporting tests. No identity, account, transaction, planning, import, AI, report, notification, billing, or client-cutover domain is live. The Backend Master Plan covers many client requirements, but it currently under-models cards, rich obligations, budget targets, recurrence, currency/reference seeds, and cross-domain deletion; it also sequences AI before the canonical report aggregation it must consume.

The remediation therefore has exactly three implementation phases:

1. Foundation, correctness, and release blockers.
2. End-to-end missing product capabilities on the live backend.
3. Verified polish plus explicitly approved/deferred product scope.

## 2. Audit Scope

The audit read the client report in full and inspected:

- apps/mobile: routes, feature screens, domain models, SQLite repositories, mock/platform services, state, localization, RTL/LTR primitives, tests, Specs 001–016, remediation plans, and recent Mobile commits.
- apps/admin-web: 101-route frontend structure, permissions, repositories, MSW handlers/fixtures, users, billing, imports/parsers, AI, notifications, feedback, privacy/deletion, tests, and Specs 001–010.
- apps/api, supabase, and docker: active SPEC-BE-001 source, migrations, API contracts, tests, runbooks, task ledger, and the complete 14-Spec Backend Master Plan.
- Repository-wide product, architecture, design, audit, roadmap, remediation, and reorganization documents.
- Git branch, worktree list, working-tree changes, relevant recent commits, and task completion ledgers.

The audit did not modify product code, schemas, APIs, migrations, branches, or existing user work. Visual-only screenshot claims that cannot be proven statically are classified Cannot Verify Yet and require device evidence before a change is authorized.

## 3. Current Project State

### Mobile

- The Expo application is implemented despite stale root/mobile READMEs that still call it a future placeholder.
- Current committed Mobile state is commit 8180b6e, dated 2026-08-26, after the client screenshots. It changed transaction presentation/form, accounts, filters, Home, currency settings, design-system primitives, and tests.
- Financial calculations already share core projections for transfers/refunds across Home and reports. Savings, budget targets, wallet accounts, timestamps, notification routes, three subscription tiers, account details, and report scheduling exist.
- Production integrations remain intentionally fail-closed. Authentication, assistant inference, billing, support delivery, exchange rates, SMS ingestion, and server persistence still depend on the backend/native work.
- Fresh verification: TypeScript passed. The complete serial Jest run finished with 387/388 suites and 1512/1513 tests passing. The single failure is apps/mobile/src/features/obligations/ObligationJourney.test.tsx:35, which timed out finding a funding-account accessibility label that was present in the rendered tree. Several suites also emit asynchronous React act warnings. This is a real release-evidence defect and must be cleared before Phase 1 completion.

### Admin

- The approved Next.js Admin is a comprehensive frontend prototype driven by MSW, not a production control plane.
- Existing operational surfaces already cover deletion requests, privacy, billing plans, imports/parsers, merchant rules, AI operations, notifications, feedback, support, and system health.
- Specs 001, 002, 004, 007, 008, 009, and 010 have no unchecked task rows. Spec 003 has 11 open tasks; Spec 005 has 49; Spec 006 has 42.
- Relevant routes are reusable; replacing them would waste functioning work. They must be wired domain-by-domain to live API repositories after backend contracts exist.
- Fresh verification: TypeScript passed; Vitest passed 70 files and 785 tests.

### Backend

- Active branch: codex/backend-spec-be-001.
- apps/api is an incomplete platform foundation, not a financial product API. AppModule imports only config, database, health, and meta modules.
- The only application-owned database table is private.outbox_events. Current migrations create platform schemas/roles, outbox/queue primitives, and private buckets only.
- SPEC-BE-001 is Draft with 134 checked and 45 unchecked tasks. Live database, Docker, performance, recovery, CI/signing, and final acceptance evidence remain incomplete.
- Fresh verification: TypeScript passed; 21 unit suites/82 tests passed; 6 contract suites/18 tests passed. Live database, container, performance, recovery, and release-image gates were not run.

### Database

- Mobile owns the only current product-domain persistence through local SQLite.
- Supabase contains platform-foundation migrations only. No server product-domain migration exists yet, so correcting the master model now is low-cost and avoids future destructive backfills.
- The highest current data-loss risks are the Backend Master Plan's narrower account/card, obligation, budget, category, and recurrence models.

### Tests

- Existing coverage is strongest around Mobile core finance/refunds, reports, planning persistence, notifications, tracking rules, assistant previews, Admin UI contracts, and backend foundation logic/contracts.
- Missing high-value coverage is one cross-surface financial golden fixture; live account deletion/cancellation; Gulf language/currency ordering; card liability/payoff; Gulf sender/parser corpus; live notification actions; live Admin/API integration; and Android/iOS release evidence.

### Active Plans / Specs

- Backend: docs/Back end/BACKEND_MASTER_PLAN.md defines Specs BE-001–BE-014. SPEC-BE-001 is active and incomplete. The master header is stale because it still says planning-only/uninitialized.
- Mobile production remediation: apps/mobile/docs/superpowers/plans/2026-08-24-mobile-production-remediation.md is approved and requires absent integrations to fail closed.
- Mobile active redesign sequence: Specs 012–016 remain partly open: 012 has 15 open tasks, 013 has 45, 014 has 75, 015 has 92, and 016 has 126. Earlier Specs 001–010 are mostly complete with small evidence gaps.
- Mobile RTL/LTR: docs/superpowers/plans/2026-08-24-mobile-rtl-ltr-audit.md has 50 open checklist steps and is the correct home for device-level #16, #18–25, #28, and #32 evidence.
- Admin: Specs 005 and 006 remain materially incomplete and are the correct frontend homes for parser/import and AI operations work. Admin Spec README is stale because it says no feature folders exist.
- Root README and PROJECT_STRUCTURE.md are stale because they still claim Admin is the only implemented application and API/Mobile are placeholders.

### Git / Worktrees

- Current branch is codex/backend-spec-be-001 at b1ba259.
- There is one active worktree: the project root. No linked Mobile worktree is active.
- Existing user work must be preserved: .gitignore is modified; apps/api, backend Docker/CI files, Supabase migrations/tests, and supporting files are untracked as part of active backend work.
- apps/mobile and apps/admin-web were clean at audit time.
- A safety stash exists from 2026-08-25; this plan does not inspect, apply, or alter it.

## 4. Client Feedback Verification Matrix

Impact legend: M = Mobile, A = Admin, B = Backend, DB = database/migration, API = contract, Biz = business rule, Loc = localization, UI = presentation. An omitted layer has no direct work for that item. Tests name existing evidence first and the smallest missing regression second.

|  ID | Summary, classification, current evidence                                                                                                                                                                                                                                                                                | Impacts, tests, dependencies                                                                                                                                                                        | Recommended resolution, risk, phase, acceptance                                                                                                                                                                                                                                              |
| --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Account deletion: **Partial / missing live backend capability.** Mobile submits a fixture-only review request in PrivacySettingsScreen.tsx:35-50; Admin has mock deletion routes and workflow; backend plan has account_deletion_requests but no deletion-to-subscription-cancel orchestration.                          | M/A/B/DB/API/Biz. Existing mock deletion lifecycle only. Missing live recent-auth, cancellation, retention-hold, idempotency, and post-delete access tests. Depends BE-002, BE-003, BE-012, BE-014. | Extend existing privacy/billing phases; do not invent a client-only delete. High risk, Phase 1. Accept when double confirmation creates one idempotent request, active/trial subscription is cancelled, retention results reconcile, and deleted users cannot authenticate or retrieve data. |
|   2 | Default EGP: **Partially fixed / screenshot outdated.** foundation.ts:230-231 defaults SAR/Riyadh and AccountForm.tsx:53-64 follows the preference; EGP still appears first in currencies.ts:18-30.                                                                                                                      | M/B/DB/API/Loc/UI. AccountForm test covers preference default; missing deterministic regional-order contract/device test. Depends BE-002/004/014 and #14/#59.                                       | Keep optional non-Gulf currencies but sort the Gulf six first and use country/preference default. Medium risk, Phase 1. Accept SA→SAR, AE→AED, and fresh account creation never derives default from array position.                                                                         |
|   3 | Inconsistent expense totals/refund: **Already fixed in current local engine.** core-finance.ts:301-310 and :452-480 validate/link refunds; reports.ts:783-860 and core-finance-service.ts:145-173 use the same effects.                                                                                                  | M/B/DB/API/Biz. Existing core-finance-transfer-refund tests; missing one Home/list/report/assistant golden-fixture parity test and future live API parity. Depends BE-005→BE-010→BE-014 and #35.    | Keep code; add regression and preserve semantics in live ledger. High risk if regressed, Phase 1 verification. Accept exact matching net expense for partial/full refund across every surface and ledger version.                                                                            |
|   4 | Assistant card contradicts itself: **Partially fixed locally, mock-backed.** assistant-service.ts:33-42 and :86-118 consume current finance/planning/report snapshots, but the assistant remains a mock. Backend BE-009 precedes canonical report BE-010.                                                                | M/A/B/API/Biz/UI. Existing assistant snapshot/action tests; missing zero-total/nonzero-breakdown invariant and live report-assistant parity. Depends BE-005, amended BE-009/010 order, BE-014.      | Move shared monthly/category read model to BE-005 or make BE-009 depend on BE-010. High risk, Phase 1. Accept same ledger version/totals from reports and assistant and suppress invalid breakdowns.                                                                                         |
|   5 | Obligation total mismatch: **Partially fixed.** financial-planning-service.ts:495-525 sums remaining balances, while ObligationOverviewScreen.tsx:25-38 still labels/displays contracted totals on rows. Backend BE-007 is narrower than the current nine-type/rich Mobile contract.                                     | M/B/DB/API/Biz/UI. Existing planning service tests; current ObligationJourney has one failing test. Missing round-trip parity and payable/receivable numeric fixtures. Depends amended BE-007/014.  | Preserve the current rich contract and label contracted versus remaining explicitly. High risk, Phase 1. Accept overview payable total equals visible active payable remaining balances; receivables are separate; no fields are lost on sync.                                               |
|   6 | Net worth excludes/mis-signs accounts: **Partially fixed with an unguarded card opening balance.** Home includes active accounts and card spending becomes negative; report-net-worth.ts:20-43 sums balances, but AccountForm permits a positive card opening balance and backend plan has no card-liability convention. | M/B/DB/API/Biz. Existing report-net-worth tests; missing cash+bank+wallet+card+obligation golden fixture and double-count prevention. Depends BE-004/005/007/010/014.                               | Define signed card postings and one net-worth formula. High risk, Phase 1. Accept SAR 320 card debt reduces net worth exactly SAR 320, with obligation/card overlap not counted twice.                                                                                                       |
|   7 | Egyptian account-creation heading: **Confirmed localization issue.** ar.ts:669 and related account strings remain Egyptian.                                                                                                                                                                                              | M/Loc/UI. Missing approved Gulf-neutral glossary and string snapshot. Parallel to backend.                                                                                                          | Replace copy only; no layout redesign. Low engineering/high brand risk, Phase 1. Accept approved Gulf-neutral Arabic and unchanged English/layout.                                                                                                                                           |
|   8 | Egyptian account-type descriptions: **Confirmed localization issue** in ar.ts/account flow.                                                                                                                                                                                                                              | M/Loc/UI. Missing glossary regression. Depends localization workstream.                                                                                                                             | Replace strings using the same glossary. Phase 1. Accept all three/four account types use consistent Gulf-neutral terminology.                                                                                                                                                               |
|   9 | “Almost done” Egyptian wording: **Confirmed localization issue.**                                                                                                                                                                                                                                                        | M/Loc/UI. Missing exact Arabic string assertion.                                                                                                                                                    | Replace with approved neutral “Account details” wording. Phase 1.                                                                                                                                                                                                                            |
|  10 | Egyptian last-four explanation: **Confirmed localization issue.**                                                                                                                                                                                                                                                        | M/Loc/UI/Biz. Preserve privacy meaning; missing string test.                                                                                                                                        | Replace copy without implying unimplemented SMS ingestion. Phase 1. Accept explanation is Gulf-neutral and states matching is available only when tracking is enabled.                                                                                                                       |
|  11 | Non-Gulf bank examples: **Confirmed demo/localization issue.** AccountForm.tsx:304-315 retains Egyptian examples.                                                                                                                                                                                                        | M/Loc/UI. Missing locale/market example test. Depends #46/#47 for real institutions.                                                                                                                | Use Saudi default examples now; later derive examples from supported country reference. Phase 1.                                                                                                                                                                                             |
|  12 | Colloquial loanword used instead of the standard Arabic term for card: **Confirmed localization issue.**                                                                                                                                                                                                                 | M/Loc/UI. Missing glossary test.                                                                                                                                                                    | Replace terminology only. Phase 1.                                                                                                                                                                                                                                                           |
|  13 | “House money” wording: **Confirmed localization issue.**                                                                                                                                                                                                                                                                 | M/Loc/UI. Missing glossary test.                                                                                                                                                                    | Replace terminology only. Phase 1.                                                                                                                                                                                                                                                           |
|  14 | Currency ordering: **Partially fixed.** default follows preferences, but hardcoded list still starts EGP.                                                                                                                                                                                                                | M/B/DB/API/Loc/UI. Missing order test. Depends #2/#59 and BE-004 reference seed.                                                                                                                    | Deterministic Gulf-first ordering with optional currencies after. Phase 1. Accept first six are SAR/AED/KWD/QAR/BHD/OMR in approved market order.                                                                                                                                            |
|  15 | Dialect inconsistency: **Confirmed.** Account flow and other screens use different regional registers.                                                                                                                                                                                                                   | M/Loc/UI. Existing i18n completeness tests do not enforce terminology.                                                                                                                              | Add one canonical bilingual glossary and a banned Egyptian-term regression list limited to product copy. Phase 1.                                                                                                                                                                            |
|  16 | English AM/PM in Arabic: **Likely fixed; native verification missing.** transaction-presentation.ts:85-90 uses Intl and an Arabic locale with Latin digits.                                                                                                                                                              | M/Loc/UI. Missing Android/iOS Arabic meridiem assertion. Depends RTL/LTR audit plan.                                                                                                                | Do not change until device evidence. Low risk, Phase 3. Accept approved numeral policy and Arabic meridiem on device.                                                                                                                                                                        |
|  17 | English demo data in Arabic: **Confirmed.** core-finance-seeds.ts and financial-planning-seeds.ts contain English titles rendered raw.                                                                                                                                                                                   | M/Loc/UI. Existing demo seeder tests; missing locale-aware fixture assertion.                                                                                                                       | Localize explicit demo fixtures; never seed them into production DB. Phase 1.                                                                                                                                                                                                                |
|  18 | Truncated financial amounts: **Likely fixed / needs visual proof.** TransactionRow dynamically stacks; report styles shrink/wrap.                                                                                                                                                                                        | M/UI/accessibility. Existing financial primitive tests; missing smallest-device and 200% text evidence.                                                                                             | Validate before editing; use existing responsive primitives only if reproduced. Phase 3. Accept no amount/currency truncation at supported widths/text scale.                                                                                                                                |
|  19 | Leading-side ellipsis: **Likely fixed after 8180b6e; needs device proof.** TransactionRow is direction-aware.                                                                                                                                                                                                            | M/RTL/UI. Existing row tests; missing native RTL screenshot assertion.                                                                                                                              | Validate through RTL plan. Phase 3. Accept ellipsis hides the logical end, not beginning.                                                                                                                                                                                                    |
|  20 | Clipped date-period chip: **Already fixed.** date-period.ts and DateRangeSheet use localized compact labels.                                                                                                                                                                                                             | M/Loc/UI. Existing date-period/DateRangeSheet tests.                                                                                                                                                | Keep as-is; device regression only. Phase 3 verification.                                                                                                                                                                                                                                    |
|  21 | Raw ISO dates: **Already fixed.** date-period and transaction presentation use Intl.                                                                                                                                                                                                                                     | M/Loc/UI. Existing date tests.                                                                                                                                                                      | Keep as-is. Phase 3 verification.                                                                                                                                                                                                                                                            |
|  22 | Ambiguous numeric date: **Already fixed.** native date picker and localized display are implemented.                                                                                                                                                                                                                     | M/Loc/UI. Existing TransactionDateField tests.                                                                                                                                                      | Keep as-is. Phase 3 verification.                                                                                                                                                                                                                                                            |
|  23 | Broken net-worth change badge: **Already fixed.** ReportsScreen.tsx:434-476 shows one delta and percentage.                                                                                                                                                                                                              | M/Biz/UI. Existing net-worth/report journey tests.                                                                                                                                                  | Keep as-is. Phase 3 verification.                                                                                                                                                                                                                                                            |
|  24 | Empty/broken cash-flow chart: **Partially fixed / current implementation exists.** LineChart and ledger-derived series exist; exact screenshot state not reproduced.                                                                                                                                                     | M/B/API/UI. Existing LineChart/report tests; missing nonempty-series and explicit-empty-state screen assertion. Depends BE-010 for live series.                                                     | Add contract/state test, then native evidence. Phase 3. Accept ordered points or explicit empty state, never a half-rendered chart.                                                                                                                                                          |
|  25 | Mixed Arabic/Latin bidi reversal: **Partially addressed.** Reports isolates money, but the specific mixed budget/category label lacks proof.                                                                                                                                                                             | M/RTL/Loc/UI. Missing targeted bidi test and device evidence.                                                                                                                                       | Use existing Unicode isolation helper only where reproduced. Phase 3.                                                                                                                                                                                                                        |
|  26 | Disabled save without explanation: **Likely fixed / screen-specific proof missing.** Current forms expose validation; budget journeys exist.                                                                                                                                                                             | M/API/UI. Existing form/budget tests; missing exact invalid-field message assertion.                                                                                                                | Reproduce on current budget form; add the smallest validation test if present. Phase 3.                                                                                                                                                                                                      |
|  27 | Transfer styled as income: **Mostly fixed for new writes.** form clears category and presentation is neutral; legacy demo seed still assigns “transfers.”                                                                                                                                                                | M/B/DB/API/Biz/UI. Existing presentation tests; missing schema invariant and old-row migration test. Depends #58/#62 and BE-004/005.                                                                | Reject categoryId on internal transfers and clean/migrate seed/local rows. Phase 1. Accept neutral display and zero income/expense effect.                                                                                                                                                   |
|  28 | Off-brand blue chart controls: **Cannot verify current code.** Current reports use tokens; screenshot predates latest commit.                                                                                                                                                                                            | M/UI. Missing current native visual evidence.                                                                                                                                                       | No automatic change. Phase 3 visual audit; accept only token violations proven on current build.                                                                                                                                                                                             |
|  29 | Plan naming inconsistency: **Resolved in current Mobile/Admin mocks; live billing absent.** Both use free/basic/premium.                                                                                                                                                                                                 | M/A/B/DB/API/Loc/UI. Existing subscription UI/repository tests; missing shared live contract/storefront parity. Depends BE-012/014 and #60.                                                         | Seed stable three-tier keys and localize display labels. Phase 2.                                                                                                                                                                                                                            |
|  30 | Category deletion without confirmation: **Partially resolved with safer archive/merge confirmation.** Linked-count and undo are absent.                                                                                                                                                                                  | M/B/DB/API/UX. Existing CategoryDetail tests; missing usage-count and archival parity. Depends BE-004.                                                                                              | Keep archive/merge; add accurate usage count. Undo/reassignment beyond merge requires product confirmation. Phase 3.                                                                                                                                                                         |
|  31 | Home does not surface planning cards: **Confirmed composition request / Requires Explicit UI/Product Approval.** Home renders HomeSummary; PlanningHomeCard is separate.                                                                                                                                                 | M/UI/product. Existing Home/planning tests; a change would alter approved Home composition.                                                                                                         | Do not implement automatically. Phase 3 decision. If approved, add one compact existing planning component without new visual language and verify first viewport/accessibility.                                                                                                              |
|  32 | Clipped filter strip lacks affordance: **Cannot verify current build.**                                                                                                                                                                                                                                                  | M/UI. Missing current narrow-device reproduction. Depends RTL/LTR audit.                                                                                                                            | No change until reproduced. Phase 3. If confirmed, add the smallest native edge affordance without restructuring filters.                                                                                                                                                                    |
|  33 | Profile image upload absent: **Missing low-priority feature / product decision.** Current setting stores a default avatar token and has no picker/upload lifecycle.                                                                                                                                                      | M/B/DB/API/UI/security. No upload tests. Backend BE-002 also lacks avatar storage; implementing it adds private object lifecycle.                                                                   | Recommended V1: remove misleading upload copy. Add upload only with explicit scope. Phase 3.                                                                                                                                                                                                 |
|  34 | Account detail navigation: **Already fixed.** app/accounts/[id]/index.tsx, AccountDetailScreen, and AccountJourney tests exist.                                                                                                                                                                                          | M/UI/navigation. Existing journey test; native smoke remains.                                                                                                                                       | Keep as-is; verify on Android/iOS. Phase 3 verification.                                                                                                                                                                                                                                     |
|  35 | Refund entry flow absent: **Partially fixed.** Domain kind/link/aggregation exist, but add/edit UI exposes expense/income/transfer only and has no original-expense picker.                                                                                                                                              | M/B/DB/API/Biz/UI. Existing refund domain tests; missing manual entry/edit, eligibility, double-refund, and cross-surface tests. Depends BE-005/014 and #3.                                         | Add refund vertical slice using existing transaction model and originalTransactionId mapping. Phase 1. Accept only eligible original expenses can be refunded and net expense updates everywhere.                                                                                            |
|  36 | Savings goals missing: **Already fixed in Mobile and covered in backend plan.** Full savings routes/model/SQLite tests exist; BE-007 owns server goals/movements.                                                                                                                                                        | M/B/DB/API/Biz. Existing savings journey/persistence tests; future live ledger reconciliation missing. Depends BE-007/014.                                                                          | Keep as-is; extend to live adapter without redesign. Phase 2 verification.                                                                                                                                                                                                                   |
|  37 | Statement PDF/CSV import missing: **Confirmed missing Mobile capability; backend/admin planned but not live.** Admin has sanitized triage UI; BE-008 owns imports/parsers. Product docs conflict on V1 versus post-MVP scope.                                                                                            | M/A/B/DB/API/security. Existing Admin mock parser tests; no real upload/parser/corpus/E2E. Depends product decision, BE-008/010/014, Admin Spec 005.                                                | Do not restore the Base44 browser parser. If V1 approved, use private upload + async backend parsing with an explicit 300-row contract and 299/300/301 tests. Phase 2.                                                                                                                       |
|  38 | Card payoff/interest calculator missing: **Confirmed data/product gap.** Mobile account model has credit limit only; BE-004 omits credit limit, statement/due day, interest, icon, notes.                                                                                                                                | M/B/DB/API/Biz/UI. No golden payoff tests. Depends amended BE-004, BE-007, BE-011, BE-014 and #39/#54.                                                                                              | Add a coherent card vertical slice; store rate with explicit scale and calculate minimum/payoff scenarios in one domain service. Phase 2. Accept golden cases prove no ×100 error.                                                                                                           |
|  39 | Card statement day missing: **Confirmed.** Neither current Mobile nor Backend Master account contract contains it.                                                                                                                                                                                                       | M/B/DB/API/Biz/UI. Missing 1–28 validation, cycle/grace-period, and reminder tests.                                                                                                                 | Extend BE-004 and Mobile account form/model; notifications consume it in BE-011. Phase 2.                                                                                                                                                                                                    |
|  40 | Merchant rules missing: **Partial.** Mobile has voice category preferences, not a general merchant-rule entity/UI. Admin mock route and BE-008 merchant/category rules are planned.                                                                                                                                      | M/A/B/DB/API/Biz. Existing Admin/parser mocks and tracking tests; missing live normalization, user isolation, corpus, and learning tests. Depends BE-008/014 and Admin Spec 005.                    | Implement only as part of the tracking/import slice, reusing current Admin screens. Phase 2.                                                                                                                                                                                                 |
|  41 | Saudi VAT missing: **Confirmed missing / Requires Product Decision.** No VAT model exists in backend plan or current code.                                                                                                                                                                                               | M/B/DB/API/Biz/UI. No eligibility/gross/net/VAT tests. Would affect BE-005/010.                                                                                                                     | Do not apply 15% blindly. Decide whether this is V1 and define eligible VAT-inclusive transactions/categories first. Recommended defer. Phase 3 decision.                                                                                                                                    |
|  42 | Notification center/preferences missing: **Screenshot outdated; locally implemented, live delivery incomplete.** Mobile notification routes/preferences/policy exist; Admin communication routes are mock; BE-011 owns live events/preferences/delivery.                                                                 | M/A/B/DB/API/Biz/native. Existing local notification tests; missing live provider, timezone, quiet-hours, dedupe, and device evidence. Depends BE-011/014.                                          | Keep local UI; wire live pipeline and validate devices. Phase 2. Accept in-app/push preference behavior and one Gulf-time reminder without duplicate delivery.                                                                                                                               |
|  43 | Zakat: **Explicitly deferred and absent by design.**                                                                                                                                                                                                                                                                     | Product/Biz. No V1 dependency.                                                                                                                                                                      | Record post-MVP deferral; no code in this plan. Phase 3 deferred.                                                                                                                                                                                                                            |
|  44 | Phone notifications/quick actions: **Partially fixed locally.** Native adapter and response controller exist; production delivery/device proof is missing.                                                                                                                                                               | M/A/B/API/native/security. Existing response-controller tests; missing Android/iOS delivery, lock-screen privacy, authentication, retry/dedupe. Depends BE-011/014.                                 | Complete with #42; do not create a second notification system. Phase 2.                                                                                                                                                                                                                      |
|  45 | Merchant rules and ignored cards: **Partial.** Sender-rule UI/model exists; merchant rules are planned; ignored-card behavior is absent.                                                                                                                                                                                 | M/A/B/DB/API/Biz. Missing per-card opt-out tests. Depends BE-004/008/014 and #40/#47.                                                                                                               | Add automaticTrackingEnabled to account rather than a separate ignored-card subsystem, and enforce before parser proposal. Phase 2.                                                                                                                                                          |
|  46 | Generic bank keywords: **Confirmed defect if automatic capture is advertised.** default-keywords.ts contains broad terms; approved remediation intentionally disables risky READ_SMS production behavior until a reviewed path exists.                                                                                   | M/A/B/DB/API/Biz/native/security. Missing redacted Gulf corpus and false-positive tests. Depends BE-008/014.                                                                                        | Phase 1 release rule: capability remains unavailable/undisclosed. Phase 2 implements sender-specific corpus-tested parsers. Accept generic words alone never auto-confirm.                                                                                                                   |
|  47 | Sender-ID binding missing: **Partially fixed locally; live registry absent.** Mobile sender rules/routes exist; BE-008 plans institutions/senders/parser publication.                                                                                                                                                    | M/A/B/DB/API/Biz/security. Existing sender journey tests; missing approved registry/corpus/live-ingestion tests. Depends BE-008/014 and Admin Spec 005.                                             | Keep current UI, implement governed live registry and review fallback. Phase 2. Unknown senders never create confirmed transactions.                                                                                                                                                         |
|  48 | Assistant cannot execute: **Partial.** Preview/confirmation exists and mock executes create_goal only; BE-009 plans deterministic action preview/confirm.                                                                                                                                                                | M/A/B/DB/API/Biz/security. Existing preview/replay tests; missing transaction add/edit, authorization, idempotency, expiry, and live audit. Depends domain commands, BE-009/014.                    | Extend allowlisted actions only after their owning domain APIs. Phase 2. Accept explicit confirmation and exactly one mutation; no arbitrary tool execution.                                                                                                                                 |
|  49 | Weekly report/family/referral: **Partial and mixed scope.** Scheduled reports exist; household sharing/referrals do not.                                                                                                                                                                                                 | M/B/DB/API/product/security. Weekly report can extend BE-010; family/referral have no approved model.                                                                                               | Keep weekly schedule as smallest approved option; defer family/referral pending product/security design. Phase 3 decision.                                                                                                                                                                   |
|  50 | Real customer data in screenshot bundle: **Confirmed external privacy incident.** No such archive is tracked under apps/mobile.                                                                                                                                                                                          | External governance/privacy; no M/A/B code fix. Missing distribution audit.                                                                                                                         | Immediately remove/restrict/redact the external image and record recipients. Phase 1 external gate. Accept no shared artifact contains name, phone, address, or shipment details.                                                                                                            |
|  51 | Investments missing: **Confirmed implementation gap but report's “no decision” is outdated.** Mobile product spec explicitly places investments post-MVP; Backend Master omits them, while the older product plan includes them.                                                                                         | M/B/DB/API/product. No V1 tests. Conflict between documents.                                                                                                                                        | Record one canonical post-MVP decision in Backend Master and do not add V1 code unless owner reverses it. Phase 3 decision/deferred.                                                                                                                                                         |
|  52 | Budget income/savings targets missing: **Already fixed locally; Backend Master would regress it.** financial-planning.ts:89-100 includes both targets; BE-007 budgets has total only.                                                                                                                                    | M/B/DB/API/Biz. Existing budget persistence tests; missing server round-trip/golden utilization. Depends amended BE-007/014.                                                                        | Extend BE-007 before schema generation with expenseLimitMinor, incomeTargetMinor, savingsTargetMinor. Phase 2. Accept lossless round-trip and explicit target calculations.                                                                                                                  |
|  53 | Recurring transactions entity missing: **Partial / product-model decision.** Current transaction kind and obligations cover recurring concepts, but there is no general recurrence rule or idempotent generator. BE-007 omits it.                                                                                        | M/B/DB/API/Biz/jobs. Missing month-end/timezone/retry/no-duplicate/link tests. Depends decision and BE-005/007/013/014.                                                                             | Decide whether obligations intentionally replace general recurrence. Recommended add one minimal recurrence_rules model/job if salary/rent/subscription generation is required. Phase 2.                                                                                                     |
|  54 | Card payment concept missing: **Confirmed contract gap.** Generic transfer postings can move money but no card-payoff command/subtype/queryable purpose exists.                                                                                                                                                          | M/B/DB/API/Biz. Missing bank-to-card liability golden test. Depends BE-004/005/014 and #38/#39.                                                                                                     | Do not copy a redundant Base44 FK. Add validated card-payoff command using the same transfer postings. Phase 1. Accept bank decreases, card liability approaches zero, and income/expense remain unchanged.                                                                                  |
|  55 | Wallet account type missing: **Already fixed/current plan covered.** Mobile and BE-004 include wallet.                                                                                                                                                                                                                   | M/B/DB/API. Existing account-type tests; future adapter parity.                                                                                                                                     | Keep as-is. Phase 2 verification.                                                                                                                                                                                                                                                            |
|  56 | Custom category lacks income/expense kind: **Confirmed current Mobile gap; Backend Master covers it with a caveat.** BE-004 allows income/expense/transfer kind, but transfer kind contradicts its own ledger rule.                                                                                                      | M/B/DB/API/Biz. Missing ambiguous backfill review and kind compatibility tests. Depends BE-004/014 and #58.                                                                                         | Add income/expense selection to Mobile and remove transfer from category kinds. Backfill only unambiguous rows; route ambiguous rows to review. Phase 1.                                                                                                                                     |
|  57 | Feedback channel missing: **Partial substitute.** Mobile support/new accepts feedback; Admin moderation UI exists; BE-011 feedback_items is planned but lacks optional star rating.                                                                                                                                      | M/A/B/DB/API/authz. Existing mock support/Admin tests; missing live owner isolation, Admin-only status mutation, and rating bounds. Depends BE-011/014.                                             | Reuse support/feedback surfaces and implement one live entity/workflow. Add rating only if still approved. Phase 2.                                                                                                                                                                          |
|  58 | Transfers modeled as expense category: **Partially fixed at write/presentation, invariant/seed remains wrong.** BE-004 also incorrectly allows category kind transfer.                                                                                                                                                   | M/B/DB/API/Biz. Missing schema rejection, local migration, and remittance separation tests. Depends #27/#62, BE-004/005.                                                                            | Remove transfer category kind and forbid categoryId on internal transfers. Phase 1.                                                                                                                                                                                                          |
|  59 | Base44 six currencies/AED default: **Conflict/outdated authority.** Current Saudi default is SAR and product supports additional currencies; only Gulf-first order is unresolved.                                                                                                                                        | M/A/B/DB/API/Loc/product. Missing deterministic seed/order test. Depends #2/#14 and product confirmation.                                                                                           | Reject a global AED default. Use country/preference default and keep optional currencies after Gulf six. Phase 1.                                                                                                                                                                            |
|  60 | Subscription-tier count mismatch: **Resolved in current Mobile/Admin mocks, backend seed unspecified.** Both clients use free/basic/premium.                                                                                                                                                                             | M/A/B/DB/API/product. Existing mock tests; missing live plan/entitlement/storefront contract. Depends BE-012/014.                                                                                   | Amend BE-012 with exact stable keys and migration policy before Stripe price linkage. Phase 2.                                                                                                                                                                                               |
|  61 | Transaction time missing: **Already fixed using a better model.** occurredAt is a full epoch/timestamptz; separate HH:MM would duplicate truth.                                                                                                                                                                          | M/B/DB/API/Biz/Loc. Existing date/presentation tests; future timezone sync parity missing. Depends BE-005/006/014.                                                                                  | Keep one timestamp. Phase 1 verification. Accept minute/timezone survives create, sync, report, and assistant evidence.                                                                                                                                                                      |
|  62 | External remittance category missing: **Confirmed.** Current seed has internal “transfers” but no remittance expense category; backend seed is unspecified.                                                                                                                                                              | M/B/DB/API/Biz/Loc. Missing seed and aggregation tests. Depends #58 and BE-004/005.                                                                                                                 | Seed a stable remittance expense system category after transfer/category separation. Phase 1. Accept remittance counts as expense while internal transfer counts as neither.                                                                                                                 |

### Audited risk register by client ID

Risk combines the original client severity with current code status. “Regression” means the screenshot defect is already fixed but must remain covered.

| Risk                                    | Client IDs                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Critical release/privacy/financial      | #1, #2, #4, #5, #6, #35, #42, #46, #50, #54, #58, #59                                                                    |
| Critical regression protection          | #3                                                                                                                       |
| High                                    | #7, #8, #9, #10, #11, #12, #13, #18, #24, #26, #27, #30, #37, #38, #39, #40, #41, #44, #45, #47, #51, #53, #56, #60, #62 |
| High regression/live-cutover protection | #22, #36                                                                                                                 |
| Medium                                  | #14, #15, #17, #19, #25, #28, #29, #31, #34, #48, #52, #55, #57, #61                                                     |
| Medium regression protection            | #20, #21, #23                                                                                                            |
| Low or explicitly deferred              | #16, #32, #33, #43, #49                                                                                                  |

## 5. Already Resolved Since Client Review

The following items require preservation and regression proof, not reimplementation:

- #3 refund-aware net expense uses shared local projection.
- #20–#22 localized date periods, dates, and native date selection.
- #23 net-worth delta presentation.
- #29 current three-tier naming in Mobile/Admin mocks.
- #34 account-detail route.
- #36 savings-goal Mobile vertical slice.
- #52 Mobile income and savings targets.
- #55 wallet account type.
- #61 full transaction timestamp.

Items likely fixed but awaiting current-device proof: #16, #18, #19, #24, #26, and #28. Treating them as bugs without reproduction would violate the UI freeze.

## 6. Confirmed Remaining Issues

Release-critical remaining work:

- Live account deletion and cancellation (#1).
- Card-liability/net-worth and obligation label/model correctness (#5, #6).
- Manual refund/card-payoff paths and transfer invariants (#35, #54, #56, #58, #62).
- Gulf currency order and launch copy/demo localization (#2, #7–15, #17, #59).
- Honest fail-closed tracking until a real Gulf corpus exists (#46).
- One failing Mobile suite and current asynchronous test warnings.

Capability gaps after the foundation:

- Import/parser/merchant/card-ignore integration (#37, #40, #45, #47).
- Card cycles/interest/payoff calculator (#38, #39).
- Live notifications, feedback, assistant actions, billing, recurrence (#42, #44, #48, #53, #57, #60).

## 7. Client Feedback vs Current Project Conflicts

| Conflict                                                                                         | Current project/spec evidence                                                                                             | Recommendation                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Client report treats Base44 data model as binding.                                               | Backend Master states current running client contracts win conflicts and uses an immutable ledger/posting architecture.   | Preserve business meaning, not Base44 column names.                                     |
| #2 asks regional default while #59 elevates global AED default.                                  | Current Saudi product defaults SAR and supports country/preference defaults.                                              | Country/preference default; no global AED rule.                                         |
| Report says wallet, savings, budget targets, time, three tiers, and refund semantics are absent. | Current source contains all of them, though refund UI is incomplete.                                                      | Mark fixed/partial; do not rewrite.                                                     |
| Report says investment decision is silent.                                                       | Mobile master explicitly places investments post-MVP; older product plan includes them; backend master omits them.        | Record one canonical deferral or reverse it explicitly.                                 |
| Report requests browser-side Base44 statement extraction before launch.                          | Approved backend architecture centralizes private upload, parsing, dedupe, corpus governance, and Admin triage in BE-008. | Use backend pipeline if V1 scope is approved.                                           |
| Report asks “six types” of obligations.                                                          | Current Mobile supports nine richer types and three schedules; BE-007 narrows them to five.                               | Preserve current Mobile contract; never regress to either narrower list blindly.        |
| Report says notifications are absent.                                                            | Current Mobile notification center/preferences exist; delivery remains mock/platform-limited.                             | Classify partial, not missing.                                                          |
| Backend categories allow transfer kind while its business rule says transfers need no category.  | BACKEND_MASTER_PLAN.md Phase 004 conflicts internally.                                                                    | Remove transfer category kind before BE-004 Spec generation.                            |
| AI BE-009 is scheduled before report aggregation BE-010.                                         | Assistant is required to consume the same truth as reports.                                                               | Move canonical read model earlier or reverse dependency.                                |
| Root README/PROJECT_STRUCTURE and Backend Master status are stale.                               | Mobile/API are now implemented beyond placeholders; BE-001 is active.                                                     | Update documentation in the relevant implementation branch, not as client feature work. |

## 8. Scope / Product Decisions Required

1. #31: approve or reject changing frozen Home composition to surface planning.
2. #37: statement import in V1 with a 300-row cap, or post-MVP.
3. #41: define Saudi VAT eligibility semantics or defer.
4. #51: ratify post-MVP investments or restore them to V1.
5. #53: obligations-only recurrence or a general recurring transaction engine.
6. #33: remove avatar-upload implication or fund private upload lifecycle.
7. #30: archive/merge with usage count is sufficient, or undo/reassignment is mandatory.
8. #49: weekly report only; family sharing/referral deferred unless separately specified.
9. #59: optional non-Gulf currencies remain supported after Gulf-first ordering.
10. #57: star rating is required on feedback, or type/text is sufficient.

## 9. Root Cause Map

| Root cause                                                              | Client IDs                                   | Owning layers                                         | Corrective strategy                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RC-A: Financial semantics split across display/model and no live ledger | #3, #4, #5, #6, #27, #35, #54, #58, #61, #62 | Mobile, BE-004/005/007/009/010                        | One ledger projection, explicit card payoff/liability, shared read model, golden fixture. |
| RC-B: Reference data and locale defaults are hardcoded/underspecified   | #2, #7–17, #29, #59, #60, #62                | Mobile localization, BE-002/004/012                   | Stable keys, regional defaults, Gulf glossary/order, locale-owned labels.                 |
| RC-C: Client capability exists only as mock/local UI                    | #1, #4, #42, #44, #47, #48, #57, #60         | Mobile/Admin adapters, BE-002/003/008/009/011/012/014 | Implement live backend owner, then replace adapters without redesign.                     |
| RC-D: Backend Master under-models current Mobile data                   | #5, #6, #38, #39, #45, #52, #53, #54, #56    | BE-004/005/007/008                                    | Amend master before domain Specs/migrations; lossless mapping tests.                      |
| RC-E: Missing governed ingestion corpus                                 | #37, #40, #45, #46, #47                      | Mobile native, Admin parsers, BE-008                  | Fail closed now; corpus-test sender-specific parser versions later.                       |
| RC-F: Screenshot-era visual evidence                                    | #18–#26, #28, #32, #34                       | Mobile/UI audit                                       | Reproduce current build in RTL/LTR/device matrix before edits.                            |
| RC-G: Unresolved product scope                                          | #30, #31, #33, #37, #41, #43, #49, #51, #53  | Product                                               | Explicit written decisions; no speculative code.                                          |

## 10. Existing Backend Plan Analysis

Keep the 14-Spec sequence and extend it before the affected Spec packages are created:

- BE-001: platform foundation. Active, incomplete; prerequisite for every live remediation.
- BE-002: identity/profile/preferences. Add deterministic region/default-currency behavior; consumed by #1/#2/#14/#59.
- BE-003: privacy/RBAC/deletion. Couple deletion orchestration to identity and later billing cancellation.
- BE-004: currencies, categories, accounts. Add exact seeds, bilingual stable keys, card metadata, tracking opt-out; remove transfer category kind.
- BE-005: ledger/refund/transfer. Add explicit card-payoff command/liability convention and canonical financial summary read model.
- BE-006: offline sync. Preserve local SQLite and versioned upload; no wipe.
- BE-007: planning. Replace narrowed obligations with lossless current contract; add budget targets and, if approved, recurrence rules.
- BE-008: import/tracking/parser. Add approved Gulf corpus and per-card opt-out enforcement; retain Admin mock surfaces for later wiring.
- BE-009: assistant. Consume canonical financial read model; allowlist confirmed actions.
- BE-010: reports. Use the same ledger version/projection; schedule weekly report only if approved.
- BE-011: notifications/support/feedback. Covers #42/#44/#57; consume card/planning events.
- BE-012: billing. Seed free/basic/premium exactly and expose cancellation hook to deletion.
- BE-013: operations/jobs. Runs recurrence, report, notification, and reconciliation jobs owned by their domains.
- BE-014: staged Mobile/Admin mock-to-live cutover. Required for production completion, but not a place to invent missing domain behavior.

## 11. Backend Plan Integration Matrix

| Client ID(s)               | Requirement                                 | Existing backend phase   | Relationship                     | Required action                                                       |
| -------------------------- | ------------------------------------------- | ------------------------ | -------------------------------- | --------------------------------------------------------------------- |
| #1                         | Deletion + subscription cancellation        | BE-002/003/012/014       | Partial/cross-domain gap         | Add orchestration contract; do not duplicate tables.                  |
| #2/#14/#59                 | Regional currency default/order             | BE-002/004/014           | Partial                          | Define exact seeds/order/default rules before BE-004 Spec.            |
| #3/#27/#35/#54/#58/#61/#62 | Ledger/refund/transfer/card payoff          | BE-004/005/006/014       | Covered with gaps/conflict       | Remove transfer category kind; add payoff/liability and golden tests. |
| #4/#48                     | Assistant truth/actions                     | BE-009/010/014           | Sequencing conflict              | Shared read model in BE-005 or make BE-009 depend BE-010.             |
| #5/#52/#53                 | Obligations/budgets/recurrence              | BE-007/013/014           | Under-modelled/missing           | Preserve current contract, add targets and approved recurrence.       |
| #6                         | Net worth                                   | BE-004/005/007/010/014   | Missing explicit invariant       | Define one formula and card/obligation double-count policy.           |
| #7–#17                     | Locale/reference labels                     | BE-002/004 plus Mobile   | Partial                          | Stable system keys; client localization; no DB copy for screen text.  |
| #18–#26/#28/#32/#34        | Presentation                                | None/BE-010 data only    | Parallel frontend                | No backend task except ordered/empty data contract.                   |
| #29/#60                    | Three subscription tiers                    | BE-012/014               | Partial                          | Seed exact keys and compatibility test before Stripe linkage.         |
| #30/#56                    | Category kind/archive                       | BE-004/014               | Partial                          | Usage count, income/expense kind, safe ambiguous backfill.            |
| #33                        | Avatar                                      | BE-002/storage           | Missing/deferred candidate       | Remove misleading copy unless approved.                               |
| #36                        | Savings                                     | BE-007/014               | Covered                          | Do not duplicate.                                                     |
| #37/#40/#45–#47            | Import/parser/merchant/senders/card opt-out | BE-004/008/014           | Covered with gaps                | Product scope, Gulf corpus, opt-out, Admin wiring.                    |
| #38/#39                    | Card cycle/interest/calculator              | BE-004/007/011/014       | Missing                          | Amend phases before schema generation.                                |
| #41                        | VAT                                         | None                     | Missing/product decision         | Defer or specify eligible deterministic calculation.                  |
| #42/#44                    | Notifications                               | BE-011/014               | Covered                          | Do not duplicate; add native/provider evidence.                       |
| #43                        | Zakat                                       | None                     | Explicit defer                   | No V1 work.                                                           |
| #49                        | Weekly report/family/referral               | BE-010 only for schedule | Partial/out of scope             | Weekly only if approved; separate future design for rest.             |
| #51                        | Investments                                 | None in backend master   | Conflict with older product plan | Record post-MVP disposition.                                          |
| #55                        | Wallet                                      | BE-004                   | Already covered                  | Adapter parity only.                                                  |
| #57                        | Feedback                                    | BE-011/014               | Covered with rating decision     | Reuse Admin/Mobile surfaces.                                          |

## 12. Dependency Graph

1. Current backend SPEC-BE-001 completion → blocks every live API/domain integration.
2. Product decisions for #37/#41/#51/#53 → must precede edits to BE-004/005/007/008/010.
3. Amend Backend Master Plan → precedes generating BE-002 onward Specs and all product-domain migrations.
4. BE-002 identity/preferences → BE-003 deletion and BE-004 regional references.
5. BE-004 accounts/categories → BE-005 ledger → BE-006 sync.
6. BE-005 canonical ledger/read model → BE-007 planning, BE-008 ingestion, BE-009 assistant, BE-010 reports.
7. BE-007/008/009/010 domain events → BE-011 notifications.
8. BE-003 deletion + BE-012 billing cancellation → complete #1 orchestration.
9. BE-002–013 live domains → BE-014 staged Mobile/Admin adapter cutover.
10. Phase 1 local correctness and fail-closed release policy → blocks all Phase 2 capability claims.
11. Phase 2 live capabilities → blocks Phase 3 release polish and rollout evidence.

## 13. Phase 1 — Foundation, Correctness & Blocking Work

### Workstream 1.1 — Ratify the Current Baseline and Amend the Backend Master

**Goal:** Prevent client remediation from being implemented against stale screenshots or an under-modelled backend plan.

**Client IDs:** All IDs for traceability; direct design corrections for #1–#6, #27, #35, #38–#39, #41, #45–#46, #52–#54, #56, #58–#60, and #62.

**Current implementation:** Mobile and Admin are ahead of the report; backend product domains do not exist; Backend Master has specific parity and sequencing gaps.

**Required changes:** Record the matrix in the owning plan, correct BE-004/005/007/008/009/010/012 contracts, record explicit product decisions, and update stale status statements on the backend branch. Do not create a second backend roadmap.

**Database:** Documentation only in this task; no product migration until corrected ownership and fields are approved.

**Backend:** Complete existing SPEC-BE-001 first. Amend master phase ownership and dependencies before generating BE-002 onward.

**API:** Lock stable keys, timestamp/money/percentage conventions, error envelopes, version/idempotency fields, and adapter compatibility.

**Mobile:** Freeze a route/domain/test inventory at current commit; preserve all post-review fixes.

**Admin:** Freeze reusable mock route/repository inventory; identify exact live repository replacement per backend phase.

**Tests:** Convert the nine client business rules into named acceptance cases. Repair the existing ObligationJourney failure and remove material asynchronous act warnings before declaring the Mobile baseline green.

**Dependencies:** Product decisions in Section 8; current SPEC-BE-001 completion.

**Risks:** Implementing downstream Specs before amending the master creates irreversible field loss and conflicting migrations.

**Acceptance criteria:** Backend master and generated Specs agree with current client contracts; each client ID has one owner/status; all three TypeScript checks pass; Mobile has 388/388 passing suites; no product-domain schema is introduced prematurely.

**Definition of Done:** Approved backend-plan amendment, updated task references, clean baseline verification record, and no change to approved UI or current data.

### Workstream 1.2 — Canonical Financial Truth, Refunds, Transfers, Cards, and Obligations

**Goal:** Make every financial surface derive from one explicit, testable ledger truth.

**Client IDs:** #3, #4, #5, #6, #27, #35, #54, #56, #58, #61, #62.

**Current implementation:** The Mobile-local slice is implemented on `codex/client-remediation-safe-phase1`: one canonical fixture covers refund, transfer, payoff, signed card liability, payable/receivable obligations, Home/report/assistant parity, and source versions; linked refund and retry-safe payoff writes are repository-validated; transfer/category repair is schema version 11; obligation rows and totals use remaining values by currency; and the remittance reference is deterministic. Live API/domain parity remains owned by BE-004/005/007/009/010/014.

**Required changes:** Preserve the verified Mobile-local invariants during later BE-004/005/007 implementation and BE-014 cutover; complete live canonical summaries and lossless planning contracts without adding a second Mobile financial model.

**Database:** In BE-004 remove transfer category kind, seed remittance, add account/card fields and tracking opt-out. In BE-005 retain immutable postings and add explicit payoff purpose/command without a redundant balance field. In BE-007 preserve the full Mobile obligation contract. Mobile SQLite migration cleans demo/legacy transfer categories and introduces any missing discriminators idempotently.

**Backend:** BE-005 owns transaction validity and canonical summary; BE-007 owns payable/receivable remaining; BE-010 consumes these projections; BE-009 consumes the same read model.

**API:** Refund create requires original transaction and bounded amount. Card payoff requires source bank/cash account and destination card account. Category create requires income or expense kind. Summary responses include ledgerVersion.

**Mobile:** Reuse TransactionForm, account/category pickers, report projections, and obligation screens. Add only missing entry/label states; do not redesign.

**Admin:** Read-only financial views consume canonical report projections after cutover; no Admin money mutation.

**Tests:** Golden fixture:

- Expense SAR 100.00 + linked refund SAR 25.00 = net expense SAR 75.00; income unchanged.
- Internal transfer SAR 500.00 = income change SAR 0.00 and expense change SAR 0.00.
- Bank SAR 1,000.00 + card liability SAR -320.00; payoff SAR 200.00 yields bank SAR 800.00, card SAR -120.00, net worth remains SAR 680.00.
- Assets bank SAR 10,000.00 + wallet SAR 846.50 − card SAR 320.00 − separate payable obligation SAR 50,000.00 = net worth SAR -39,473.50, with no duplicate card liability.
- Contracted obligation SAR 60,000.00 less paid SAR 10,000.00 = remaining SAR 50,000.00.

**Dependencies:** Workstream 1.1; BE-004→005→006 and BE-007; BE-014 for live cutover.

**Risks:** Liability sign inversion, duplicate card/obligation subtraction, refund over-application, ambiguous local category backfill, and report/AI drift.

**Acceptance criteria:** All golden values match Home, transactions, reports, assistant evidence, and API; transfers have no category; remittance is an expense; round-trip preserves minute/timezone and all obligation fields.

**Definition of Done:** Local and live contract tests pass, shadow summaries match, migration is reversible by adapter rollback, and client IDs are verified on Arabic/English builds.

### Workstream 1.3 — Account Lifecycle, Privacy, and Subscription Cancellation

**Goal:** Provide a store-compliant, auditable account-deletion flow.

**Client IDs:** #1.

**Current implementation:** Mobile request-only mock, Admin mock workflow, planned deletion and billing tables without orchestration.

**Required changes:** Double confirmation plus recent authentication; idempotent deletion request; cooling-off/cancel behavior if approved; subscription cancellation; domain deletion/anonymization handlers; legal-hold handling; final session revocation and audit evidence.

**Database:** Use BE-003 account_deletion_requests, retention_policies, retention_holds, and audit events; BE-012 subscription operation records. Do not hard-delete immutable financial/audit records when retention law requires anonymization.

**Backend:** BE-003 orchestrates deletion state; BE-012 performs verified cancellation; Clerk identity/session handling is BE-002; worker reconciliation is idempotent and retryable.

**API:** POST deletion request, verify/confirm, GET status, cancel within allowed window. No Admin approval is required for a normal user request; Admin only observes/handles exceptions with exact permission and MFA.

**Mobile:** Replace fixture-only request with real status-driven flow while preserving the approved settings layout. Clearly distinguish local data reset from account deletion.

**Admin:** Wire existing deletion list/detail/checklist to live redacted state; never expose deleted data payloads.

**Tests:** Active subscription, free account, duplicate request, retry, legal hold, provider outage, partial handler failure, completed deletion, post-delete auth denial, and owner/nonowner/Admin RLS.

**Dependencies:** BE-001→002→003; BE-012 cancellation hook; BE-014 cutover.

**Risks:** Data loss, incomplete deletion, premature identity removal, subscription charges after deletion, retention-law violation.

**Acceptance criteria:** One confirmed request produces one reconciled workflow, billing stops, legal holds are honored, retained data is anonymized as specified, sessions are revoked, and status/audit evidence is available.

**Definition of Done:** Store-facing flow works in production mode; deletion recovery runbook and provider failure tests pass; no mock fallback.

### Workstream 1.4 — Gulf Currency, Language, and Demo-Data Release Baseline

**Goal:** Make Arabic/Gulf positioning coherent without narrowing legitimate multi-currency support.

**Client IDs:** #2, #7–#15, #17, #59.

**Current implementation:** Mobile slice complete on `codex/client-remediation-gulf-localization`: Gulf-first ordering, Gulf-neutral account-flow copy, and locale-aware demo fixtures are covered without changing the preference-derived default contract.

**Required changes:** Approve one Gulf-neutral glossary; replace confirmed account-flow strings/examples; make demo fixtures locale-aware; order Gulf currencies first; derive default from country/preference.

**Database:** BE-004 deterministic currency/country/reference seeds. System references expose stable keys; custom labels remain user-entered. Do not store screen translations in transaction rows.

**Backend:** BE-002 stores locale/timezone/country/preference; BE-004 serves enabled currencies with explicit priority and version.

**API:** Currency response includes stable code/minorUnit/order; account writes reject disabled codes but never infer default from list order.

**Mobile:** Update localization/fixtures only, reusing current account forms and pickers.

**Admin:** Billing-report currencies remain a separate aggregate concern; Admin must not combine mixed currencies without conversion.

**Tests:** Saudi and UAE defaults; Gulf-first order; KWD precision; Arabic glossary banned-term scan; Arabic/English demo fixture snapshots; mixed Arabic/Latin accessibility labels.

**Dependencies:** Workstream 1.1 and approved currency policy.

**Risks:** Commercial tone inconsistency, accidental restriction of supported currencies, translated system-label drift.

**Acceptance criteria:** Saudi fresh install defaults SAR; Gulf six are first; optional currencies remain after them; no identified Egyptian copy/demo titles remain; English and layout are unchanged.

**Definition of Done:** Contract, unit, localization, and current-device smoke tests pass in Arabic and English.

**Mobile verification evidence (2026-08-30):** Targeted localization, account-flow accessibility, currency order/precision/default, locale-transition, demo-fixture, service-state, seeder, migration, and native privacy checks passed (16 suites, 110 tests); full Mobile Jest passed (390 suites, 1,536 tests); `npm run typecheck` passed; every `npm run check:frontend-quality` boundary passed across 881 files; `npm run lint` completed with 0 errors and 77 pre-existing warnings outside this slice. A fresh Expo Android prebuild plus the native privacy-config regression confirms `READ_SMS` is represented only as a removal directive and backups remain disabled. Independent code review found no remaining concrete findings. No device-dependent UI change was made in this workstream.

### Workstream 1.5 — Fail-Closed Tracking and External Privacy Gate

**Goal:** Do not ship a false automatic-tracking claim or circulate exposed client data.

**Client IDs:** #46, #50.

**Current implementation:** Mobile now selects the deterministic mock only in explicit demo/test mode. Production and unsupported capability paths reject capture and financial mutations, expose unavailable metadata, disable capture controls, and cannot synthesize financial records; privacy-preserving history deletion and source-text expiry remain available and durable. Every result-bearing demo tracking surface carries the same bilingual visible and assistive demo notice. Existing Admin copy already labels its data and behavior as mock/demo. Account-level opt-out remains a BE-004/008 Phase 2 contract dependency, and the PII screenshot remains outside the repository.

**Required changes:** Preserve the fail-closed Mobile gate until the BE-008 corpus/provider and native evidence pass; implement account-level opt-out only through the later approved contract; remove/redact/restrict the external screenshot through its archive owner and document distribution.

**Database:** No parser seed is published in Phase 1. No customer PII enters test fixtures or migration seeds.

**Backend:** Capability/meta flag remains false; BE-008 later owns publishable parser versions.

**API:** Tracking capability returns unavailable with a stable reason, not a synthetic success.

**Mobile:** Hide/disable unsupported capture claims while preserving onboarding explanation and manual entry.

**Admin:** Parser controls remain mock/test-only; no “published” production state.

**Tests:** Production build policy, denied permission, unavailable capability, no hidden fallback, fixture PII scan.

**Dependencies:** External archive owner for #50; BE-008 for later enablement.

**Risks:** False positives, platform permission rejection, privacy incident propagation.

**Acceptance criteria:** Production cannot auto-capture using generic words; user sees an honest unavailable state; external shared archive is redacted and access reviewed.

**Definition of Done:** Release gate and privacy evidence are recorded; no automatic parser is enabled prematurely.

**Remaining Safe Phase 1 Mobile verification evidence (2026-09-01):**

- Focused command: `npx jest --runInBand --no-cache` with the 24 finance-parity, validation, seed, transaction-effect, SQLite migration/persistence/cleanup, sync, refund/payoff, obligation, assistant, tracking, support, report, native-privacy, and transaction-form paths listed in Spec 017 quickstart coverage; result: 24 suites and 199 tests passed.
- Complete command: `$env:TEMP='D:\CodexTemp\client-remediation-safe-phase1'; $env:TMP=$env:TEMP; $env:NODE_OPTIONS='--max-old-space-size=1024'; node .\node_modules\jest\bin\jest.js --runInBand --no-cache`; result: 403 suites and 1,650 tests passed. Passing baseline suites still emit known React `act` and Expo Go console warnings; no test failed.
- Static commands: `npm run typecheck`, `npm run lint`, and `npm run check:frontend-quality`; results: typecheck passed, lint completed with 0 errors and 77 existing warnings, and all frontend-quality boundaries passed (899 files in the major boundary scans).
- Native/migration evidence: a fresh `npx expo prebuild --platform android --no-install` generated the ignored Android project; `platform-privacy-config.test.ts` then proved SMS permission removal and disabled Android backup. SQLite schema v11 and SPEC-BE-006 preservation are covered by the focused migration, persistence, cleanup, and sync suites.
- Scope/evidence limits: the coverage table contains exactly 62 unique IDs (1–62, no missing or duplicate rows). No `apps/api`, `apps/admin-web`, Supabase, backend-specification, backend-plan, or external-archive file changed. #50 remains an external archive-owner action; iOS/live-backend/device evidence is not claimed. Account-level tracking opt-out remains a later BE-004/BE-008 dependency, and Admin remains unchanged with its existing explicit mock/demo state.

## 14. Phase 2 — Second End-to-End Capability Layer

### Workstream 2.1 — Cards, Planning Targets, Savings, and Recurrence

**Goal:** Complete the financial-planning vertical slices that depend on the corrected ledger/accounts.

**Client IDs:** #36, #38, #39, #52, #53, #55.

**Current implementation:** Savings, wallet, and targets exist locally; card-cycle fields/calculator and general recurrence do not; BE-007 would currently drop targets/rich obligation fields.

**Required changes:** Extend BE-004 card fields; BE-007 budget targets and lossless planning contract; implement payoff calculator; if approved, add minimal recurrence rules/generator; wire existing savings/wallet clients live.

**Database:** Nullable card metadata for existing rows; rate scale constraint; recurrence rule with owner, transaction kind, amount, currency, account/category, cadence, timezone, next occurrence, active state; generated transaction links to rule. No fabricated historical values.

**Backend:** Calculation and recurrence commands call BE-005 ledger idempotently; BE-013 schedules bounded jobs; BE-011 consumes due/reminder events.

**API:** Card create/update; payoff scenarios; budget round-trip; recurrence CRUD/pause/resume; savings CRUD/movements.

**Mobile:** Extend existing account/planning screens only. Reuse Savings and Budget flows.

**Admin:** Support visibility is read-only and only if required; no Admin financial mutation.

**Tests:** Rate stored as 2.5 means 2.5%, not 0.025 or 250%; statement/due day boundaries 1/28; month-end recurrence; DST/timezone; retry/idempotency; budget expense limit SAR 5,000, income target SAR 10,000, savings target SAR 2,000 and spend SAR 4,100 yields SAR 900 remaining and 82% utilization.

**Dependencies:** Phase 1 Workstream 1.2; BE-004/005/006/007/011/013/014.

**Risks:** Interest scale error, duplicate generated entries, silent current-data loss.

**Acceptance criteria:** All current local planning fields round-trip live; calculator golden cases pass; recurrence generates once; existing savings/wallet behavior is unchanged.

**Definition of Done:** Live adapters replace mocks for this slice with offline sync preserved and shadow parity verified.

### Workstream 2.2 — Statement Import, Gulf Parsers, Merchant Rules, and Card Opt-Out

**Goal:** Deliver governed, accurate ingestion rather than keyword matching.

**Client IDs:** #37, #40, #45, #46, #47.

**Current implementation:** Mobile sender rules and Admin parser surfaces exist; backend BE-008 is planned; real file ingestion, corpus, merchant learning, and card opt-out are absent.

**Required changes:** If #37 approved, private file upload and explicit ≤300 accepted-row limit; institution/sender registry; redacted Gulf Arabic/English corpus; versioned parser test/publish; merchant/category rules; account tracking opt-out; review queue and dedupe.

**Database:** Use existing BE-008 catalog; add per-account automaticTrackingEnabled in BE-004. Raw payloads are private/short-retained. Parser versions and test results are immutable/audited.

**Backend:** Normalize, parse, deduplicate, propose, and confirm through existing ledger commands. Unknown senders/formats go to review, never automatic confirmed write.

**API:** Import session/upload/finalize/status; tracking preferences; sender/keyword/card opt-out; review decision; Admin parser test/publish. Enforce 299/300/301 if cap approved.

**Mobile:** File intake, review queue, rule feedback, and sender/card settings reuse current components.

**Admin:** Wire current import/parser/merchant-rule routes to live redacted APIs and exact permissions.

**Tests:** Realistic redacted “purchase amount,” POS/Mada, debit, outbound transfer, payment, refund, and English POS fixtures across approved institutions; sender priority; unknown sender; regex safety; duplicate SMS/file item; disabled card; 299/300/301 import rows; no raw PII in Admin.

**Dependencies:** Phase 1 fail-closed gate; BE-004/005/006/008/013/014; Admin Spec 005 completion.

**Risks:** False positives, regex denial, duplicate ledger writes, sensitive payload leakage, platform capture limits.

**Acceptance criteria:** Only approved sender+published parser can auto-propose; generic words never auto-confirm; disabled card creates no proposal; import limits/dedupe are deterministic; Admin sees redacted evidence.

**Definition of Done:** Corpus gate passes, native capability is validated per platform, and production flag can be enabled safely.

### Workstream 2.3 — Live Notifications, Support, and Feedback

**Goal:** Turn current local/mock communication surfaces into one production pipeline.

**Client IDs:** #42, #44, #57.

**Current implementation:** Mobile center/preferences/native adapter and Admin templates/logs/moderation exist; no live backend/provider persistence.

**Required changes:** BE-011 notification events/preferences/delivery, safe quick actions, support/feedback persistence, Admin moderation and delivery observability.

**Database:** Existing BE-011 tables plus optional feedback rating if approved. Device push token remains in BE-002 and is revocable.

**Backend:** Idempotent event generation, Gulf timezone/quiet hours, daily dedupe key, retry/dead-letter, authenticated quick action, feedback owner isolation/Admin-only state mutation.

**API:** Notification list/read/action/preferences; feedback create/list/detail; Admin template/campaign/delivery/moderation endpoints.

**Mobile:** Replace service adapters while preserving screens. Lock-screen copy excludes sensitive money/merchant details unless user policy permits.

**Admin:** Reuse current routes; switch mock repositories to live API by feature flag, then remove production MSW.

**Tests:** Asia/Riyadh scheduling, quiet hours, same-day duplicate prevention, push retry, revoked device, locked app action, wrong-user action, feedback rating bounds, owner/nonowner/Admin permissions.

**Dependencies:** BE-002/003 and domain events from BE-005/007/008/010; BE-011/014; Admin Spec 007.

**Risks:** Duplicate notifications, privacy exposure, unauthorized quick action, provider outage.

**Acceptance criteria:** Opted-in device receives one correct notification; quick action authenticates and changes exactly one resource; feedback is owner-visible and Admin-moderated; Admin logs are redacted.

**Definition of Done:** Android and iOS production-device evidence, live API integration tests, and delivery runbook pass.

### Workstream 2.4 — Assistant Actions and Shared Report Truth

**Goal:** Make assistant answers and actions auditable consumers of the same financial engine.

**Client IDs:** #4, #24, #48, and the weekly-report portion of #49.

**Current implementation:** Local assistant snapshots and create-goal preview exist; reports/charts/schedules exist locally; backend AI/report services do not.

**Required changes:** Resolve BE-009/010 dependency; immutable evidence snapshot with ledgerVersion; allowlisted action previews; report series/empty-state contract; weekly schedule only if approved.

**Database:** Use planned assistant snapshots/previews and report output snapshots. Store references/redacted content, not raw sensitive prompts.

**Backend:** Canonical read model from ledger/planning; server validates every AI proposal; confirmation invokes the owning domain command idempotently.

**API:** Report summary/series/schedules; assistant message response with evidence refs; preview confirm/reject with expiry and expected version.

**Mobile:** Reuse approved assistant/report UI; expose confirmation and honest unavailable/error states.

**Admin:** Reuse AI operations and report observability; no arbitrary prompt/provider selection from clients.

**Tests:** Report/assistant exact totals and ledgerVersion; zero-total invariant; stale preview; replay; unauthorized action; provider failure; deterministic report snapshot; explicit empty chart series.

**Dependencies:** BE-005/007 before BE-009/010, then BE-014; Admin Spec 006 completion.

**Risks:** Financial hallucination, duplicate action, stale evidence, provider data retention.

**Acceptance criteria:** Assistant and report numbers match exactly; only confirmed unexpired allowlisted previews mutate once; chart contract distinguishes empty and populated data.

**Definition of Done:** Evaluation, privacy, contract, integration, and cutover tests pass with no production mock fallback.

### Workstream 2.5 — Canonical Three-Tier Billing

**Goal:** Preserve the already-consistent free/basic/premium product contract through live billing.

**Client IDs:** #29, #60.

**Current implementation:** Mobile and Admin fixtures agree on three stable plans; BE-012 catalog is generic and unseeded.

**Required changes:** Approve stable keys, localized display names, entitlements, upgrade/downgrade/cancel policy, store/Stripe mapping, and migration rules before price linkage.

**Database:** Seed versioned free/basic/premium plan records before prices/subscriptions; never mutate historical price meaning.

**Backend:** Stripe is status authority; entitlement is derived server-side; deletion cancellation hook is idempotent.

**API:** Plan catalog, checkout/portal operations, subscription status, entitlement response, Admin redacted billing operations.

**Mobile:** Replace subscription mock repository without changing approved layouts.

**Admin:** Replace billing fixtures/handlers and retain exact permissions/MFA.

**Tests:** Arabic/English names, three-key parity, signed webhook, duplicate/out-of-order event, upgrade/downgrade, cancellation, failed payment, deletion cancellation.

**Dependencies:** BE-002/003, BE-012, Workstream 1.3, BE-014.

**Risks:** Commercial migration, entitlement forgery, tier drift, duplicate charging.

**Acceptance criteria:** Every client/store/backend uses the same three keys and entitlements; provider reconciliation passes; no client/Admin can grant entitlement.

**Definition of Done:** Sandbox billing E2E, reconciliation, deletion hook, and staged client cutover pass.

## 15. Phase 3 — Final Client Remediation Layer

### Workstream 3.1 — RTL/LTR, Accessibility, and Current-Build Visual Proof

**Goal:** Close visual findings only when reproduced on the current approved UI.

**Client IDs:** #16, #18–#26, #28, #32, #34.

**Current implementation:** Many screenshot-era defects are fixed or unverified; the existing RTL/LTR audit plan has the correct route/device matrix.

**Required changes:** Execute the existing audit plan in Arabic RTL and English LTR, 200% text, smallest supported width, keyboard/safe-area states, and current data states. Make only evidence-backed corrections.

**Database/Backend/API:** No schema change. BE-010 supplies ordered series/empty-state semantics for #24.

**Mobile:** Reuse direction helpers, financial primitives, Intl/date picker, and theme tokens. No screen hierarchy or visual identity change.

**Admin:** None.

**Tests:** Focused regression before each correction, then full Mobile suite; Android native walkthrough; iOS evidence on a supported host/device; before/after screenshots for geometry-only defects.

**Dependencies:** Phases 1–2 stable data/contracts and the existing RTL/LTR plan.

**Risks:** Reintroducing screenshot-era fixes, breaking frozen UI, platform-specific overflow.

**Acceptance criteria:** No amount/currency truncation at 200%; bidi/ellipsis/date/meridiem are correct; charts have valid states; filters and account routes work; all current tests pass.

**Definition of Done:** Completed route/state evidence matrix with no unapproved redesign.

### Workstream 3.2 — Approved UX Decisions Within the Frozen UI

**Goal:** Resolve ambiguous low-risk requests without silently changing product composition.

**Client IDs:** #30, #31, #33.

**Current implementation:** Category archive/merge is safe; Home composition is frozen; avatar upload is absent.

**Required changes:** Add category usage count; implement Home planning card only after explicit approval; remove avatar-upload implication unless upload is explicitly approved.

**Database/Backend/API:** Category usage count from BE-004; avatar storage only under approved BE-002/private bucket scope; Home card needs no new backend beyond existing planning summary.

**Mobile:** Minimal changes to existing components and copy.

**Admin:** None.

**Tests:** Category historical-reference preservation; Home first-viewport/200%/screen-reader test if approved; avatar copy or secure upload lifecycle test.

**Dependencies:** Product decisions and live summaries.

**Risks:** Violating UI freeze, unnecessary storage/security scope, orphaned category history.

**Acceptance criteria:** Every approved decision has written evidence; unapproved options remain out of implementation; archive never orphans ledger rows.

**Definition of Done:** Product sign-off plus focused regression/device evidence.

### Workstream 3.3 — Explicitly Deferred Product Scope

**Goal:** Prevent silent disappearance while avoiding speculative V1 features.

**Client IDs:** #41, #43, non-weekly portions of #49, #51.

**Current implementation:** VAT, zakat, family sharing, referral, and investments are absent from the current backend. Zakat and investments are already described as post-V1/post-MVP in at least one product source.

**Required changes:** Record one authoritative decision, owner, prerequisites, and future trigger for each. If any item is promoted to V1, create a separate approved design/spec before implementation.

**Database/Backend/API/Mobile/Admin:** None in this plan while deferred.

**Tests:** None until promoted; documentation coverage check ensures the IDs remain traceable.

**Dependencies:** Product owner decision.

**Risks:** Scope creep, unsafe tax advice, complex household authorization, commercial distraction.

**Acceptance criteria:** Each item has an explicit approved disposition and no hidden placeholder UI/API.

**Definition of Done:** Canonical roadmap records the deferral or a separately approved future spec.

## 16. Cross-Phase Dependencies

- Phase 1 Workstream 1.1 → depends on → current SPEC-BE-001 completion evidence.
- Phase 1 Workstream 1.2 → depends on → amended BE-004/005/007 ownership.
- Phase 1 Workstream 1.3 → depends on → BE-002/003 and blocks live billing deletion hook in Phase 2 Workstream 2.5.
- Phase 1 Workstream 1.4 → depends on → BE-002/004 reference policy and blocks final localization validation.
- Phase 1 Workstream 1.5 → blocks → any production tracking claim in Phase 2 Workstream 2.2.
- Phase 2 Workstream 2.1 → depends on → Phase 1 canonical ledger and card liability convention.
- Phase 2 Workstream 2.2 → depends on → BE-008 plus Phase 1 fail-closed policy.
- Phase 2 Workstream 2.3 → depends on → events from ledger/planning/tracking/reports.
- Phase 2 Workstream 2.4 → depends on → BE-005/007 canonical read models.
- Phase 2 Workstream 2.5 → depends on → BE-012 and Phase 1 deletion contract.
- Every live Phase 2 slice → depends on → BE-014 domain-specific client cutover.
- Phase 3 visual proof → depends on → stable Phase 1/2 data states so screenshots are not invalidated by later logic changes.

## 17. Database & Migration Plan

### 17.1 Sequence

1. Correct Backend Master ownership/contracts before generating product-domain Specs.
2. Complete BE-001; generate and review each owning Spec.
3. Use expand → backfill → validate → constrain → cut over → contract. Never combine destructive contraction with initial data migration.
4. Add server tables/nullable fields and read compatibility first.
5. Add versioned Mobile SQLite migration and adapter mapping second.
6. Backfill deterministic values only; ambiguous values become review items.
7. Shadow-read local versus server summaries and record mismatches.
8. Enable live writes for a test cohort; retain adapter rollback.
9. Remove obsolete fields/mocks only in a later change after observation.

### 17.2 Specific data changes

- Accounts: preserve cash/bank/card/wallet/other; add creditLimitMinor, statementDay, dueDay, interestRateMonthly with explicit scale, icon/notes if still in current contract, and automaticTrackingEnabled. Existing unknown card metadata remains null.
- Categories: stable system key, income/expense kind only, localized client label for system categories, custom user label, safe archive. Infer legacy kind only when linked transaction history is unambiguous.
- Transactions: keep occurredAt/timestamptz, refund/reversal link, immutable postings, explicit payoff purpose/command, and optional recurrence rule link. Transfers have no category.
- Budgets: preserve expenseLimitMinor, incomeTargetMinor, savingsTargetMinor and existing multiple-budget semantics.
- Obligations: preserve current Mobile direction, types, schedule kinds, contracted/opening-paid/installment/count/due/matching/reminder/notes fields or a lossless normalized equivalent.
- Recurrence: add only if approved; idempotent generated transaction and next-occurrence state are required.
- Tracking: use planned BE-008 tables; add per-account opt-out and versioned corpus publication.
- Notifications/feedback/billing: use planned BE-011/012 tables; add optional feedback rating only after decision and exact plan keys before prices.
- Investments/VAT/zakat/family/referral: no migration while deferred.

### 17.3 Backfill and safety

- Preserve original local IDs through stable mapping tables/cursors.
- Money converts to minor units using currency minorUnit; no floating-point backfill.
- Positive legacy card opening balances require an explicit migration rule/review; never silently negate unknown semantics.
- Legacy transfer rows with a category lose only the invalid association; their ledger postings and history remain.
- The old “transfers” category is archived after remittance is seeded, not reused.
- Existing custom categories with mixed income/expense history enter review.
- Card statement/due/interest values are null/unknown until the user supplies them.
- Every backfill records source version, counts, rejects, and reconciliation totals.
- Rollback disables new writes/jobs and returns the client adapter to the prior source; it does not drop migrated rows.

## 18. API Contract Changes

All routes remain under versioned /api/v1 contracts when changes are additive. A breaking response shape requires a compatibility adapter or a new version; BE-014 cannot hide incompatible semantics.

| Domain                | Required contract change                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Meta/capabilities     | Expose honest availability/version flags for tracking, assistant, notifications, billing, imports, and minimum client versions. |
| Preferences/reference | Country, locale, timezone, base currency; deterministic enabled currency order and stable reference keys.                       |
| Accounts              | Card metadata, include-in-totals, automatic-tracking opt-out, versioned updates, projected balance.                             |
| Categories            | income/expense kind, system key, archive, usage count; no transfer kind.                                                        |
| Transactions          | refund create/link, card-payoff command, immutable posting-backed summaries, occurredAt, ledgerVersion.                         |
| Planning              | Lossless obligation contract; budget income/savings targets; optional recurrence CRUD; canonical summaries.                     |
| Reports               | Summary/series/empty-state, ledgerVersion, schedules and output status.                                                         |
| Tracking/imports      | Sender/card preferences, session/upload/finalize/status, review decisions, parser Admin contracts, explicit limits.             |
| Assistant             | Evidence-bearing response; expiring action preview; confirm/reject with expectedVersion and idempotency.                        |
| Notifications         | List/read/action/preferences; authenticated quick action and dedupe-safe response.                                              |
| Feedback              | Owner create/list/detail; Admin status/assignment; optional bounded rating.                                                     |
| Billing               | Exact free/basic/premium catalog, checkout/portal operations, verified subscription/entitlements.                               |
| Privacy               | Deletion request/confirm/status/cancel with recent auth and safe retention result.                                              |

Contract tests must prove OpenAPI/DTO/client schema parity, owner/nonowner/Admin permissions, idempotency, optimistic version behavior, error codes, and payload bounds.

## 19. Mobile Impact

- Keep current Expo Router structure, design tokens, Home, account/transaction/report/planning/notification/support screens, repository interfaces, and encrypted SQLite/offline behavior.
- Extend existing forms and service adapters; do not build parallel flows for refund, payoff, feedback, or notifications.
- Preserve SAR preference default, wallet, savings, targets, timestamp, account details, report schedule, and three-tier work already present.
- Replace mocks domain-by-domain only when the live contract passes parity tests; production mode never falls back silently.
- Add current-device evidence for RTL/LTR, 200% text, long money, bidi, date, charts, filters, notifications, and navigation.
- Resolve the current ObligationJourney failure before using the Mobile suite as a release gate.

## 20. Admin Impact

- Keep the approved Admin UI and existing routes.
- Complete existing Spec 005 parser/import and Spec 006 AI frontend task ledgers where they block live adapters.
- Reuse deletion, billing, parser, merchant-rule, notification, feedback, privacy, AI, and operational screens.
- Replace MSW repositories by domain after corresponding API contracts exist. Production build must reject enabled MSW.
- Admin is read-only for user financial mutations; exact permissions, MFA, masking, audit, and support-access grants remain server-owned.
- No Admin work is required for Mobile-only localization, RTL, card form, Home composition, or transaction presentation findings.

## 21. Backend Impact

- Finish SPEC-BE-001 rather than declaring the backend ready from unit/contract tests alone.
- Amend the Backend Master before BE-004/005/007 Specs are generated; this is the last low-cost point before product migrations.
- Keep NestJS modular monolith, SQL migrations, Supabase/Postgres, RLS, immutable ledger, outbox, idempotency, observability, and staged BE-014 cutover.
- Move no business calculations into Mobile/Admin merely to close screenshots.
- Add cross-domain orchestration only where required: deletion→billing, ledger→planning/report/assistant, domain events→notifications, account opt-out→tracking.
- Correct AI/report sequencing and current-client parity gaps.

## 22. Localization Strategy

1. Approve a small Arabic Gulf-neutral glossary for account, card, salary, cash, remaining, contracted, remittance, transfer, refund, subscription tiers, date/time, and tracking terms.
2. Use stable system keys and client localization for system references; preserve custom user text verbatim.
3. Keep English as an equal LTR locale.
4. Derive currency default from country/preference, not translation or list order.
5. Isolate mixed RTL/LTR runs with existing primitives; do not scatter raw Unicode controls.
6. Localize demo fixtures by locale and keep them out of production migrations.
7. Test complete keys, banned confirmed Egyptian phrases, plural/number/date/time behavior, KWD precision, 200% text, and screen-reader labels.

## 23. Testing & Regression Strategy

### Phase 1

- Mobile unit/domain: transfer category-null, refund eligibility/amount, card sign/payoff, category kind, remittance, obligation remaining.
- Cross-surface Mobile fixture: identical Home/list/report/assistant values and ledgerVersion.
- Backend contract/database: RLS, postings, idempotency, account/category constraints, timestamps, reference seeds.
- Privacy: deletion lifecycle, billing-cancel hook, retention holds, session revocation.
- Localization: Gulf glossary, currency default/order, demo fixtures.
- Baseline gate: apps/mobile typecheck + all 388 Jest suites; apps/admin-web typecheck + Vitest; apps/api typecheck + unit + contract plus all SPEC-BE-001 live gates when their dependencies exist.

### Phase 2

- Backend integration/database: planning round-trip, recurrence jobs, parser/dedupe corpus, report snapshots, AI confirmation, notification delivery, feedback authz, Stripe webhooks/reconciliation.
- API contract: OpenAPI/client schemas for every live adapter.
- Mobile/Admin integration: online/offline/bootstrap/delta/retry/conflict and mock-to-live parity.
- Native Android/iOS: tracking availability, notification delivery/quick action, privacy, process restart.
- E2E: delete account, import 300 rows, refund, payoff, recurring generation, notification action, assistant transaction action, billing change/cancel.

### Phase 3

- Route/state RTL/LTR matrix, small device, tablet where supported, keyboard, safe areas, 200% text, screen reader, color contrast, focus/touch targets.
- Visual regression only for approved frozen screens.
- Full Mobile/Admin/Backend regression and release smoke.

### Numeric acceptance fixtures

| Rule                   | Input                                                                       | Expected                                                   |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Refund                 | Expense 100.00; refund 25.00                                                | Net expense 75.00; income 0.00                             |
| Transfer               | Internal transfer 500.00                                                    | Income 0.00; expense 0.00                                  |
| Card payoff            | Bank 1,000.00; card -320.00; pay 200.00                                     | Bank 800.00; card -120.00; net worth 680.00                |
| Net worth              | Bank 10,000.00; wallet 846.50; card debt 320.00; separate payable 50,000.00 | -39,473.50                                                 |
| Obligation             | Contracted 60,000.00; paid 10,000.00                                        | Remaining 50,000.00                                        |
| Budget                 | Expense limit 5,000; spend 4,100                                            | Remaining 900; utilization 82%                             |
| Percentage scale       | Monthly interest 2.5% on 10,000 for one simple month fixture                | Interest 250.00, subject to approved calculator convention |
| Import cap if approved | 299 / 300 / 301 rows                                                        | accept / accept / reject or split with explicit error      |

## 24. Release / Rollout Strategy

1. Do not label a build release-ready while the Mobile suite has a failure or backend SPEC-BE-001 live gates are incomplete.
2. Ship Phase 1 local corrections behind existing demo/live capability policy; unsupported integrations remain off.
3. Complete backend domains in master-plan order and use BE-014 staged domain cutover.
4. For each domain: contract test → shadow read → internal cohort → limited write cohort → full traffic → observation window.
5. Reconcile ledger/report/planning/billing/deletion counts before increasing traffic.
6. Maintain adapter rollback and disable jobs/writes before rollback; never drop migrated product data.
7. Release Mobile only after Android native evidence and iOS evidence on a supported host/device; Expo Go is insufficient for production push behavior.
8. Release Admin live repositories only after exact server authorization and masking tests; production MSW must fail the build.
9. Redact #50 before any further client/developer distribution.

## 25. Keep / Extend / Refactor / Replace Decisions

### Keep As-Is

- Mobile shared finance projection/refund effects, timestamp model, wallet, savings, budget targets, date picker/Intl formatting, account-detail route, report schedule, notification screens, and three-tier client model.
- Mobile approved UI, design tokens, routing, repository/adaptor boundaries, and SQLite offline model.
- Admin approved routes/components/permissions/tests.
- Backend SPEC-BE-001 platform, immutable ledger direction, SQL migrations, RLS, outbox, idempotency, and 14-Spec ownership model.

### Extend

- Account/card/category contracts, currency/reference seeds, manual refund/payoff flows.
- BE-007 planning parity and optional recurrence.
- BE-008 corpus/card opt-out, BE-011 live communications, BE-012 exact tier seeds.
- Existing Mobile/Admin services with live adapters.

### Refactor

- Backend Master category kind: remove transfer.
- BE-007 obligation/budget model: match current rich Mobile contract.
- Aggregation ownership: one ledger-versioned financial read model for reports and assistant.
- Deletion orchestration: connect existing privacy and billing phases.

### Replace

- Replace production mock/MSW providers with live adapters only after parity evidence.
- No screen, design-system, ledger architecture, or working domain model is replaced.

## 26. Explicitly Deferred Items

- #43 zakat: post-V1.
- #51 investments: recommended post-MVP, pending one canonical written decision.
- #41 VAT: deferred until eligible-transaction semantics are approved.
- #49 household sharing and referral: separate future security/product design; weekly report may proceed alone.
- #33 avatar upload: remove misleading copy for V1 unless private upload lifecycle is approved.
- #31 Home composition: no change without explicit UI/product approval.
- #37 file import: defer if product owner retains the current post-MVP decision.
- #30 undo beyond archive/merge and usage count: defer unless explicitly required.

## 27. Open Product Decisions

| Decision                            | Recommended default                                                         | Decision deadline             |
| ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| Investments (#51)                   | Ratify post-MVP                                                             | Before BE-007 Spec generation |
| General recurrence (#53)            | Add minimal rules only if automatic salary/rent/subscription creation is V1 | Before BE-007 Spec generation |
| Statement import (#37)              | V1 only if client accepts backend async pipeline and explicit 300-row limit | Before BE-008 Spec generation |
| Saudi VAT (#41)                     | Defer                                                                       | Before BE-005/010 scope lock  |
| Home planning card (#31)            | No change under UI freeze                                                   | Before Phase 3                |
| Avatar upload (#33)                 | Remove misleading text                                                      | Before Phase 3                |
| Category delete UX (#30)            | Archive/merge + usage count; no separate undo                               | Before BE-004 API lock        |
| Optional non-Gulf currencies (#59)  | Keep after Gulf-first order                                                 | Before BE-004 seed lock       |
| Feedback rating (#57)               | Optional bounded 1–5 only if product still values it                        | Before BE-011 schema          |
| Weekly report/family/referral (#49) | Weekly schedule only; defer family/referral                                 | Before BE-010 scope lock      |

## 28. Final Ordered Execution Checklist

### Preconditions and plan integration

- [ ] Preserve the current branch, dirty .gitignore, untracked backend/Supabase/Docker work, and safety stash.
- [ ] Complete the remaining SPEC-BE-001 tasks and live acceptance evidence; do not mark the backend foundation complete from unit/contract tests alone.
- [ ] Obtain the ten product decisions in Sections 8 and 27.
- [ ] Amend docs/Back end/BACKEND_MASTER_PLAN.md for category kind, card fields/liability/payoff, rich obligations, budget targets, recurrence disposition, currency/reference seeds, Gulf corpus/card opt-out, AI/report dependency, deletion/billing hook, and exact tier keys.
- [ ] Update stale repository/backend/mobile/admin status documentation in a documentation-only change on the appropriate branch.
- [ ] Re-run the plan consistency check before generating any BE-002+ Spec.

### Phase 1 execution

- [x] Add the cross-surface golden financial fixture under apps/mobile/src/test-utils and assert Home/list/report/assistant parity.
- [x] Repair apps/mobile/src/features/obligations/ObligationJourney.test.tsx and clear material asynchronous test warnings without weakening assertions.
- [x] Enforce transfer category-null and income/expense custom category kind in apps/mobile/src/domain/core-finance.ts and repository validation, test first.
- [x] Archive/clean invalid transfer seed associations and add remittance system seed in apps/mobile/src/domain/core-finance-seeds.ts, with an idempotent SQLite migration.
- [x] Extend apps/mobile/src/features/transactions/TransactionForm.tsx and add route flow for linked refunds.
- [x] Add explicit card-payoff command contract and local regression before live BE-005 implementation.
- [x] Enforce card liability opening semantics and one net-worth/obligation formula.
- [x] Correct obligation remaining/contracted labels in apps/mobile/src/features/obligations/ObligationOverviewScreen.tsx.
- [x] Replace confirmed Egyptian copy in apps/mobile/src/localization/messages/ar.ts and account examples in AccountForm.tsx using the approved glossary.
- [x] Localize demo seeds and prove production migrations contain no demo finance rows.
- [x] Reorder apps/mobile/src/domain/currencies.ts Gulf-first while keeping preference-derived default.
- [x] Keep production automatic tracking unavailable until Phase 2 corpus evidence passes.
- [ ] Remove/redact/restrict the #50 screenshot outside the repository and record the distribution review.
- [ ] Implement BE-002/003/004/005/006/007 changes through their approved Specs and tests; do not edit product tables from the client layer.
- [ ] Implement deletion orchestration across BE-002/003/012 and wire existing Mobile/Admin views only after live contracts pass.
- [ ] Run Phase 1 acceptance: Mobile all 388 suites, Admin unit suite, backend unit/contract/database/RLS/migration tests, financial golden fixtures, Arabic/English smoke.

### Phase 2 execution

- [ ] Extend BE-004 card metadata and account tracking opt-out; add nullable-safe migration.
- [ ] Extend BE-007 planning parity and approved recurrence; preserve current SQLite data through BE-006 sync.
- [ ] Wire savings, wallet, budgets, and card/planning Mobile adapters live without layout changes.
- [ ] Implement approved BE-008 import/tracking/parser corpus and 300-row contract if #37 is V1.
- [ ] Finish Admin Spec 005 live parser/import repositories and permissions.
- [ ] Implement BE-011 notification/support/feedback pipeline and native Android/iOS delivery/action evidence.
- [ ] Correct BE-009/010 dependency; implement evidence-bearing assistant responses, allowlisted confirmations, reports, and approved weekly schedule.
- [ ] Finish Admin Spec 006 live AI operations repository and privacy tests.
- [ ] Seed BE-012 free/basic/premium, map provider prices, implement entitlement and deletion cancellation reconciliation.
- [ ] Execute BE-014 domain cutovers with shadow reads, limited cohorts, observation windows, and adapter rollback.
- [ ] Run Phase 2 database, API contract, integration, E2E, native, billing, provider-failure, and reconciliation suites.

### Phase 3 execution and release

- [ ] Execute the existing RTL/LTR audit plan against the current build and data.
- [ ] Reproduce #16/#18–#26/#28/#32/#34 before any presentation edit; attach current evidence.
- [ ] Apply only focused direction, wrapping, overflow, safe-area, keyboard, scaling, touch-target, and token corrections.
- [ ] Implement #30/#31/#33 only according to written product/UI decisions.
- [ ] Record canonical deferrals for #41/#43/#49/#51; remove any misleading placeholder UI.
- [ ] Run full Mobile/Admin/Backend regression, Android evidence, iOS evidence on a supported host, accessibility checks, and release smoke.
- [ ] Reconcile the coverage table below and close an ID only with code/spec/test evidence.

### Coverage Table

| Client ID | Verified  | Classification                                     | Phase | Workstream                 | Dependency                    | Status                            |
| --------: | --------- | -------------------------------------------------- | ----: | -------------------------- | ----------------------------- | --------------------------------- |
|         1 | Yes       | Missing live backend capability                    |     1 | Account lifecycle          | BE-002/003/012/014            | Open                              |
|         2 | Yes       | Partially fixed / localization config              |     1 | Gulf currency/localization | BE-002/004                    | Resolved locally (Mobile)         |
|         3 | Yes       | Already fixed / regression required                |     1 | Financial truth            | BE-005/010                    | Resolved locally                  |
|         4 | Yes       | Local parity resolved / mock-backed live gap       |     1 | Financial truth            | BE-005/009/010/014            | Resolved locally; partial live    |
|         5 | Yes       | Local rich-model parity resolved                   |     1 | Financial truth            | Amended BE-007                | Resolved locally; partial live    |
|         6 | Yes       | Local signed-liability rule resolved               |     1 | Financial truth            | BE-004/005/007/010            | Resolved locally; partial live    |
|         7 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|         8 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|         9 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|        10 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary/#46                  | Resolved locally (Mobile)         |
|        11 | Yes       | Localization/demo issue                            |     1 | Gulf currency/localization | Reference policy              | Resolved locally (Mobile)         |
|        12 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|        13 | Yes       | Localization issue                                 |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|        14 | Yes       | Partially fixed ordering                           |     1 | Gulf currency/localization | #2/#59, BE-004                | Resolved locally (Mobile)         |
|        15 | Yes       | Localization consistency issue                     |     1 | Gulf currency/localization | Glossary                      | Resolved locally (Mobile)         |
|        16 | Code only | Likely fixed / native proof required               |     3 | RTL/LTR visual proof       | RTL audit/device              | Verify                            |
|        17 | Yes       | Demo localization issue                            |     1 | Gulf currency/localization | Demo seeder                   | Resolved locally (Mobile)         |
|        18 | Code only | Likely fixed / visual proof required               |     3 | RTL/LTR visual proof       | Device/200%                   | Verify                            |
|        19 | Code only | Likely fixed / RTL proof required                  |     3 | RTL/LTR visual proof       | Device RTL                    | Verify                            |
|        20 | Yes       | Already fixed                                      |     3 | RTL/LTR visual proof       | Regression only               | Resolved                          |
|        21 | Yes       | Already fixed                                      |     3 | RTL/LTR visual proof       | Regression only               | Resolved                          |
|        22 | Yes       | Already fixed                                      |     3 | RTL/LTR visual proof       | Regression only               | Resolved                          |
|        23 | Yes       | Already fixed                                      |     3 | RTL/LTR visual proof       | Regression only               | Resolved                          |
|        24 | Code only | Implemented / state proof required                 |     3 | RTL/LTR visual proof       | BE-010/device                 | Partial                           |
|        25 | Code only | Partially addressed bidi                           |     3 | RTL/LTR visual proof       | RTL audit                     | Partial                           |
|        26 | Code only | Likely fixed / exact proof required                |     3 | RTL/LTR visual proof       | Form test                     | Verify                            |
|        27 | Yes       | Transfer invariant and repair implemented locally  |     1 | Financial truth            | #58, BE-004/005               | Resolved locally; partial live    |
|        28 | No device | Cannot verify current visual defect                |     3 | RTL/LTR visual proof       | Current screenshot            | Verify                            |
|        29 | Yes       | Resolved clients / backend incomplete              |     2 | Canonical billing          | BE-012/014                    | Partial live                      |
|        30 | Yes       | Safer partial solution / decision                  |     3 | Approved UX decisions      | BE-004/product                | Partial                           |
|        31 | Yes       | Requires explicit UI/product approval              |     3 | Approved UX decisions      | Product approval              | Blocked by decision               |
|        32 | No device | Cannot verify current visual defect                |     3 | RTL/LTR visual proof       | Current reproduction          | Verify                            |
|        33 | Yes       | Missing feature / YAGNI decision                   |     3 | Approved UX decisions      | Product approval/BE-002       | Decision                          |
|        34 | Yes       | Already fixed                                      |     3 | RTL/LTR visual proof       | Native smoke                  | Resolved                          |
|        35 | Yes       | Linked partial/full refund implemented locally     |     1 | Financial truth            | #3, BE-005                    | Resolved locally; partial live    |
|        36 | Yes       | Already fixed locally / backend planned            |     2 | Cards/planning             | BE-007/014                    | Resolved locally                  |
|        37 | Yes       | Missing capability / scope conflict                |     2 | Imports/parsers            | Product decision, BE-008      | Decision/Open                     |
|        38 | Yes       | Missing feature/data model                         |     2 | Cards/planning             | BE-004/007/011                | Open                              |
|        39 | Yes       | Missing feature/data model                         |     2 | Cards/planning             | BE-004/011                    | Open                              |
|        40 | Yes       | Partial / backend-admin planned                    |     2 | Imports/parsers            | BE-008/Admin 005              | Partial                           |
|        41 | Yes       | Missing / product decision                         |     3 | Deferred scope             | Product decision              | Deferred recommended              |
|        42 | Yes       | Implemented locally / live pipeline missing        |     2 | Notifications/feedback     | BE-011/014                    | Partial                           |
|        43 | Yes       | Explicitly deferred                                |     3 | Deferred scope             | Post-V1                       | Deferred                          |
|        44 | Yes       | Partial native/live capability                     |     2 | Notifications/feedback     | BE-011/014/device             | Partial                           |
|        45 | Yes       | Partial / card opt-out missing                     |     2 | Imports/parsers            | BE-004/008                    | Partial                           |
|        46 | Yes       | Production fails closed; live capability deferred  |     1 | Tracking release gate      | BE-008 corpus/native evidence | Resolved local gate; live blocked |
|        47 | Yes       | Partial local / live registry missing              |     2 | Imports/parsers            | BE-008/014                    | Partial                           |
|        48 | Yes       | Partial preview/actions                            |     2 | Assistant/report truth     | BE-009/014                    | Partial                           |
|        49 | Yes       | Partial / mixed deferred scope                     |     3 | Deferred scope             | Product decision/BE-010       | Decision                          |
|        50 | Yes       | External privacy incident                          |     1 | Privacy release gate       | Archive owner                 | Open external                     |
|        51 | Yes       | Missing / documented scope conflict                |     3 | Deferred scope             | Product decision              | Deferred recommended              |
|        52 | Yes       | Fixed locally / backend plan gap                   |     2 | Cards/planning             | Amended BE-007                | Partial live                      |
|        53 | Yes       | Partial / model decision                           |     2 | Cards/planning             | Product decision, BE-007/013  | Decision/Open                     |
|        54 | Yes       | Retry-safe local card-payoff command implemented   |     1 | Financial truth            | BE-004/005                    | Resolved locally; partial live    |
|        55 | Yes       | Already fixed/covered                              |     2 | Cards/planning             | BE-004/014                    | Resolved locally                  |
|        56 | Yes       | Mobile category income/expense meaning implemented |     1 | Financial truth            | BE-004/014                    | Resolved locally; partial live    |
|        57 | Yes       | Partial substitute / live workflow missing         |     2 | Notifications/feedback     | BE-011/014                    | Partial                           |
|        58 | Yes       | Local schema/seed invariant and repair implemented |     1 | Financial truth            | #27/#62, BE-004/005           | Resolved locally; partial live    |
|        59 | Yes       | Conflicting/outdated default authority             |     1 | Gulf currency/localization | Product policy, BE-002/004    | Resolved locally (Mobile)         |
|        60 | Yes       | Resolved clients / backend seed gap                |     2 | Canonical billing          | BE-012/014                    | Partial live                      |
|        61 | Yes       | Already fixed with timestamp                       |     1 | Financial truth            | BE-005/006                    | Resolved                          |
|        62 | Yes       | Deterministic remittance expense seed implemented  |     1 | Financial truth            | #58, BE-004/005               | Resolved locally; partial live    |
