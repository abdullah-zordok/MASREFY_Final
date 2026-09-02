# Tasks: Remaining Safe Phase 1 Client Remediation

**Input**: Design documents from `apps/mobile/specs/017-client-remediation-safe-phase1/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Every behavior task starts with the smallest Jest regression and a confirmed red
result. Do not weaken assertions or extend timeouts to obtain green results.

## Phase 1: Existing Project and Contract Review

**Purpose**: Confirm isolation, ownership, and current contracts without initializing projects.

- [x] T001 Verify the dedicated branch/worktree, clean base, and forbidden-path scope with `git status`, `git worktree list`, and `git diff` from the repository root
- [x] T002 [P] Confirm existing Admin tracking copy is already explicitly mock/demo and record no-change evidence in `docs/CLIENT_REMEDIATION_PLAN.md`
- [x] T003 [P] Snapshot the active SPEC-BE-006 changed-file set and mark overlapping Mobile storage tasks as integration-gated in `apps/mobile/specs/017-client-remediation-safe-phase1/tasks.md`

---

## Phase 2: Foundational Proof and Shared Types

**Purpose**: Establish baseline evidence and the minimum shared data meaning used by later stories.

**⚠️ CRITICAL**: TDD tests must fail for the intended reason before production edits.

- [x] T004 Re-run the pre-change Mobile typecheck and focused obligation journey using the commands in `apps/mobile/specs/017-client-remediation-safe-phase1/quickstart.md`
- [x] T005 Add failing transfer-category and category-financial-type schema tests in `apps/mobile/src/domain/core-finance-validation.test.ts`
- [x] T006 Add `financialType` and optional `transferPurpose` types/schemas with legacy-safe parsing in `apps/mobile/src/domain/core-finance.ts`
- [x] T007 Update deterministic test builders for the additive fields in `apps/mobile/src/test-utils/core-finance-fixtures.ts` and `apps/mobile/src/test-utils/core-finance-fixtures.test.ts`

**Checkpoint**: Current fixtures compile and the new domain rules are independently testable.

---

## Phase 3: User Story 1 — Trust One Financial Result Everywhere (Priority: P1) 🎯 MVP

**Goal**: One fixture produces identical refund, transfer, payoff, balance, net-worth, and source-version meaning across supported projections.

**Independent Test**: The canonical scenario returns expense `7500`, transfer/payoff income and
expense `0`, bank `80000`, card `-12000`, and net worth `68000` with matching source evidence.

- [x] T008 [US1] Add the canonical financial scenario and exact expected values in `apps/mobile/src/test-utils/client-remediation-financial-fixture.ts`
- [x] T009 [US1] Add failing cross-surface parity assertions for domain effects, Home, reports, assistant evidence, and source versions in `apps/mobile/src/domain/client-remediation-financial-parity.test.ts`
- [x] T010 [US1] Correct only shared projection or existing service consumers needed to satisfy parity in `apps/mobile/src/domain/core-finance.ts`, `apps/mobile/src/services/mocks/core-finance-service.ts`, `apps/mobile/src/domain/reports.ts`, and `apps/mobile/src/features/assistant/assistant-context.ts`
- [x] T011 [US1] Add signed card liability and positive-card-value net-worth regressions in `apps/mobile/src/features/reports/report-net-worth.test.ts`
- [x] T012 [US1] Preserve signed account net-worth behavior and avoid inferred obligation subtraction in `apps/mobile/src/features/reports/report-net-worth.ts`

**Checkpoint**: User Story 1 passes independently with no new production aggregation layer.

---

## Phase 4: User Story 2 — Record Safe Refunds and Card Payoffs (Priority: P1)

**Goal**: Refunds are eligible/bounded and card payoffs are balanced, validated, and retry-safe.

**Independent Test**: Partial/full refunds and one valid/retried payoff succeed exactly once;
every ineligible/excessive case makes no ledger change.

- [x] T013 [US2] Add failing refund eligibility, same-account/currency, cumulative-bound, and no-mutation tests in `apps/mobile/src/services/mocks/core-finance-transfer-refund.test.ts`
- [x] T014 [US2] Enforce ledger-aware linked-refund validation before writes in `apps/mobile/src/storage/core-finance-repository.ts`
- [x] T015 [US2] Add failing payoff contract, invalid-input, balance, zero-income/expense, and retry tests in `apps/mobile/src/services/mocks/core-finance-transfer-refund.test.ts` and `apps/mobile/src/storage/core-finance-persistence.test.ts`
- [x] T016 [US2] Add `CardPayoffInput` and `createCardPayoff` to `apps/mobile/src/services/contracts/core-finance-service.ts`
- [x] T017 [US2] Implement payoff validation by reusing one category-free transfer and the existing operation ledger in `apps/mobile/src/storage/core-finance-repository.ts` and `apps/mobile/src/services/mocks/core-finance-service.ts`
- [x] T018 [US2] Reuse the existing transaction form/link presentation for eligible originals and relationship labels in `apps/mobile/src/features/transactions/TransactionForm.tsx` and `apps/mobile/src/features/transactions/TransactionDetailScreen.tsx`
- [x] T019 [US2] Add focused accessible partial/full refund journey coverage in `apps/mobile/src/features/transactions/TransactionForm.test.tsx` and `apps/mobile/src/features/transactions/TransactionDetailScreen.test.tsx`

**Checkpoint**: User Story 2 passes with one balanced transaction per payoff operation.

---

## Phase 5: User Story 3 — Preserve Valid Transfer and Category Data (Priority: P1)

**Goal**: Transfers remain category-free, custom categories are income/expense only, and local repair/reference seeding is idempotent.

**Independent Test**: Repeated initialization/upgrade clears only invalid transfer links, keeps valid user data, and produces one remittance category with no demo transactions.

- [x] T020 [US3] Add failing system/custom category financial-type and stable remittance seed tests in `apps/mobile/src/domain/core-finance-seeds.test.ts` and `apps/mobile/src/services/mocks/core-finance-categories.test.ts`
- [x] T021 [US3] Add deterministic income/expense meanings and replace the obsolete transfer category with one remittance category in `apps/mobile/src/domain/core-finance-seeds.ts`
- [x] T022 [US3] Add failing category-type selector and accessibility coverage in `apps/mobile/src/features/categories/CategoryForm.test.tsx`
- [x] T023 [US3] Reuse current controls to require income/expense meaning for custom categories in `apps/mobile/src/features/categories/CategoryForm.tsx` and propagate it through existing category update calls
- [x] T024 [US3] Integrate SPEC-BE-006 commit `2eeb00b` once by fast-forward and reserve the next Mobile migration as schema version 11; resolve only Mobile sync/category and currency-precision overlaps
- [x] T025 [US3] Add failing repeated-upgrade tests for indexed and JSON transfer-category cleanup plus valid-data preservation in `apps/mobile/src/storage/database.test.ts` and `apps/mobile/src/storage/core-finance-persistence.test.ts`
- [x] T026 [US3] Implement the idempotent schema-version-11 SQLite repair and legacy category normalization in `apps/mobile/src/storage/database.ts` and `apps/mobile/src/storage/core-finance-repository.ts`
- [x] T027 [US3] Prove production initialization contains reference categories but no demo accounts/transactions in `apps/mobile/src/config/demo-mode.test.ts` and `apps/mobile/src/services/mocks/core-finance-service.test.ts`

**Checkpoint**: User Story 3 passes after one-time main integration and preserves SPEC-BE-006 contracts.

---

## Phase 6: User Story 4 — See Correct Obligation Meaning (Priority: P1)

**Goal**: Contracted, paid, and remaining amounts are distinct; payables and receivables remain separate in Arabic and English.

**Independent Test**: Visible remaining payable rows sum to the payable total, receivables are separate, and detail preserves history/schedule semantics.

- [x] T028 [US4] Add failing remaining-versus-contracted domain and overview tests in `apps/mobile/src/domain/financial-planning-obligation.test.ts` and `apps/mobile/src/storage/financial-planning-obligation.test.ts`
- [x] T029 [US4] Add Arabic/English accessible overview/detail assertions for contracted, paid, remaining, payable, and receivable labels in `apps/mobile/src/features/obligations/ObligationJourney.test.tsx` and `apps/mobile/src/localization/financial-planning-localization.test.ts`
- [x] T030 [US4] Present existing derived remaining values without changing the planning model in `apps/mobile/src/features/obligations/ObligationOverviewScreen.tsx` and `apps/mobile/src/features/obligations/ObligationDetailScreen.tsx`
- [x] T031 [US4] Reuse equivalent existing Arabic/English obligation message keys in `apps/mobile/src/localization/messages/ar.ts` and `apps/mobile/src/localization/messages/en.ts`
- [x] T032 [US4] Diagnose and fix the obligation journey initialization root cause without timeout/assertion changes in `apps/mobile/src/features/obligations/ObligationForm.tsx` or its actual shared dependency

**Checkpoint**: User Story 4 and the original obligation journey pass without material act warnings.

---

## Phase 7: User Story 5 — Receive Honest Tracking Availability (Priority: P1)

**Goal**: Production/unsupported/disabled tracking cannot synthesize demo success; explicit demo remains clearly identified.

**Independent Test**: Production, unsupported, and disabled cases create no tracking or financial records; demo behavior remains explicit and isolated.

- [x] T033 [US5] Add failing production/demo/unsupported/paused provider-selection and no-finance-mutation tests in `apps/mobile/src/services/mocks/automatic-tracking-service.test.ts` and `apps/mobile/src/features/tracking/automatic-tracking-policy.test.ts`
- [x] T034 [US5] Implement an explicit unavailable production provider and select mock behavior only for demo/tests in `apps/mobile/src/services/mocks/automatic-tracking-service.ts`
- [x] T035 [US5] Add failing honest-copy and disabled-control accessibility tests in `apps/mobile/src/features/tracking/TrackingStatusScreen.test.tsx` and `apps/mobile/src/features/tracking/AutomaticTrackingAccessibility.test.tsx`
- [x] T036 [US5] Align Arabic/English unavailable, demo, and disabled meaning in `apps/mobile/src/features/tracking/TrackingStatusScreen.tsx`, `apps/mobile/src/localization/messages/ar.ts`, and `apps/mobile/src/localization/messages/en.ts`
- [x] T037 [US5] Verify the platform permission adapter remains unavailable and no fabricated provider success leaks through in `apps/mobile/src/services/platform/tracking-permission-service.test.ts`

**Checkpoint**: User Story 5 fails closed outside explicit demo mode.

---

## Phase 8: User Story 6 — Maintain an Auditable Remediation Ledger (Priority: P1)

**Goal**: Feedback IDs 1–62 have honest current statuses, evidence, owners, and dependencies.

**Independent Test**: Every ID appears exactly once with a supported status; #50 remains external; backend/device/product-decision items remain named dependencies.

- [x] T038 [US6] Re-audit feedback IDs 1–62 against the final repository and active backend ownership in `docs/CLIENT_REMEDIATION_PLAN.md`
- [x] T039 [US6] Preserve Gulf baseline entries and update only implemented/verified/deferred/external Phase 1 rows in `docs/CLIENT_REMEDIATION_PLAN.md`
- [x] T040 [US6] Record exact focused/full commands, results, migration evidence, SPEC-BE-006 integration point, and device/external limitations in `docs/CLIENT_REMEDIATION_PLAN.md`
- [x] T041 [US6] Add a focused documentation consistency check for unique feedback IDs/statuses if an existing docs-test pattern exists; otherwise record the manual count in `docs/CLIENT_REMEDIATION_PLAN.md`

**Checkpoint**: The ledger makes no unsupported completion claim.

---

## Phase 9: Polish and Cross-Cutting Verification

**Purpose**: Verify the complete slice, scope, review findings, and branch handoff.

- [x] T042 Run every focused finance, SQLite, localization, RTL/LTR, accessibility, obligation, and tracking suite listed in `apps/mobile/specs/017-client-remediation-safe-phase1/quickstart.md`
- [x] T043 Run `npm run typecheck`, `npm run lint`, and `npm run check:frontend-quality` from `apps/mobile/package.json`
- [x] T044 Run the complete Mobile Jest suite serially with D-drive temp configuration from `apps/mobile/specs/017-client-remediation-safe-phase1/quickstart.md`
- [x] T045 Review the final diff for forbidden paths, design changes, demo leakage, financial precision, and SPEC-BE-006 duplication from the repository root
- [x] T046 Request independent code review for the final branch diff and resolve all valid findings in the referenced Mobile files
- [x] T047 Re-run affected focused and complete verification after review fixes and update exact evidence in `docs/CLIENT_REMEDIATION_PLAN.md`
- [x] T048 Commit the verified feature branch, confirm clean status, and leave it unpushed and unmerged

---

## Dependencies and Execution Order

- Phase 1 precedes all implementation.
- Phase 2 shared types precede US1–US4.
- US1 proves the projection contract before US2 payoff/refund integration.
- US2 and US4 can proceed independently after Phase 2.
- US3 non-storage tasks can proceed after Phase 2; T024 gates only T025–T026.
- US5 is independent after Phase 1.
- US6 waits for implementation and verification evidence.
- Phase 9 waits for all selected stories and the one-time SPEC-BE-006 integration.

## Parallel Opportunities

- T002 and T003 inspect different surfaces.
- After shared types, US2, US4, and US5 touch separate feature slices.
- Within each story, tests in distinct files may be authored together, but each must be observed
  red before its corresponding implementation.
- Documentation audit can begin read-only while full tests run, but statuses update only after
  evidence exists.

## Implementation Strategy

1. Establish baseline and shared additive types.
2. Deliver US1 as the canonical financial MVP and verify it independently.
3. Deliver refund/payoff, category repair, obligation meaning, and tracking honesty in focused
   red-green-refactor loops.
4. Integrate SPEC-BE-006 exactly once immediately before overlapping storage work.
5. Complete the audit ledger, full gates, independent review, and local commit.

## Format Validation

All 48 tasks use a checkbox, sequential task ID, optional parallel marker, required user-story
label inside story phases, an actionable description, and an exact file path or command source.
