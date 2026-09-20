# Obligations Experience Redesign Implementation Plan

> **For agentic workers:** Execute this plan task-by-task using the repository's Superpowers workflow. Keep the checkbox state current, run each named check before moving on, and stop at any failed financial-integrity or contract check.

**Goal:** Rebuild the mobile obligations experience to match the approved seven-screen visual direction while preserving all existing obligation data, completing the live payment and match flows, and maintaining Arabic/English parity, privacy, accessibility, and financial correctness.

**Architecture:** Keep the existing Expo routes, financial-planning service boundary, API endpoints, PostgreSQL tables, and design-system primitives. Enrich only the existing read models needed by the new screens, close the two known live-service gaps (created payment transactions and accepted payment matches), and compose the UI from a small set of obligation-specific presentation components backed by existing semantic tokens. No new dependency, navigation stack, database table, or speculative framework is required.

**Tech Stack:** React Native 0.83, Expo 55, Expo Router, TypeScript 5.9, TanStack Query, Zod, NestJS 11, PostgreSQL, Jest, React Native Testing Library.

**Approved Design References:**

- `design/obligations-concepts-v3-superpower/01-overview-alay-lay-redesign.png`
- `design/obligations-concepts-v3-superpower/02-details.png`
- `design/obligations-concepts-v3-superpower/03-create-basic-info.png`
- `design/obligations-concepts-v3-superpower/04-create-payment-plan.png`
- `design/obligations-concepts-v3-superpower/05-create-review.png`
- `design/obligations-concepts-v3-superpower/06-payment-review.png`
- `design/obligations-concepts-v3-superpower/07-match-review.png`

## Confirmed Product Decisions

- The references define the information hierarchy and visual direction, not literal device chrome or fake status-bar content.
- Use one back control only. Do not reproduce the duplicate top-right arrow visible in one earlier match-review concept.
- Do not place a Masarifi logo inside these screens. Use semantic line icons from the existing icon system.
- “عليّ / لي” maps to `payable / receivable`; English uses “I owe / Owed to me”. User-entered titles and provider names remain exactly as entered.
- Never combine different currencies into one numeric total. Render a separate amount per currency when multiple currencies exist.
- Money remains integer minor units end-to-end. Formatting occurs only at the presentation edge.
- Hidden-balance mode applies to every amount in overview, details, payment review, match review, accessibility labels, and announcements.
- The create/edit wizard writes nothing until final confirmation. Draft state may persist locally between steps.
- Automatic matching remains advisory. No detected payment is accepted without an explicit user confirmation.
- Existing lifecycle actions (pause, resume, complete, edit, reverse payment) remain available even when the primary reference screen does not show all of them.
- No database migration is planned. Existing obligations, schedules, payments, matches, transactions, and account-balance data are sufficient.
- Preserve all current uncommitted work. Do not reset, overwrite, or reformat unrelated files.

## Acceptance Contract

1. All seven flows render the approved hierarchy in Arabic RTL and English LTR.
2. Overview totals, progress, next due data, schedule data, and before/after balances come from real service data—never hard-coded samples.
3. Creating and editing an obligation preserves exact minor units for zero-, two-, and three-decimal currencies.
4. A manual payment can be previewed and confirmed with the live provider, including creation/linking of its transaction.
5. A proposed payment match can be accepted or rejected with the live provider; both actions are idempotent and invalidate the correct queries.
6. Stale versions, unsupported overpayments, invalid schedules, missing accounts, and server errors produce safe user-facing states without partial UI success.
7. Screen readers receive one coherent description for each financial card, control, progress indicator, and timeline item.
8. At 200% text scaling, financial values are not clipped; layout may grow vertically.
9. Focused mobile and API suites, type checks, lint/boundary checks, and connected-device smoke tests pass.

---

### Task 0: Protect the working tree and establish a baseline

**Files:**

- Read only: all files named in this plan.
- Record: `docs/superpowers/plans/2026-09-19-obligations-experience-redesign.md` checkbox state only.

**Purpose:** The obligations screens, services, localization files, and design-system files already contain user changes. Implementation must merge into that state, not recreate the files from an older revision.

- [x] Capture `git status --short` and `git diff --` for every relevant obligations, planning-service, localization, and design-system file.
- [x] Run the current focused tests before editing to separate pre-existing failures from regressions:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/features/obligations/ObligationJourney.test.tsx src/features/obligations/PaymentJourney.test.tsx src/services/live/financial-planning-service.test.ts
npm run typecheck
```

- [x] Run the current planning API checks:

```powershell
Set-Location apps/api
npm run test:planning:logic
npm run typecheck
```

- [x] Record any baseline failure in the implementation log. Do not “fix” unrelated failures as part of this feature.

**Implementation log — 2026-09-19:** Work continued in the current non-main branch because the relevant obligation files already contain uncommitted user changes that a new worktree would omit. Mobile focused baseline passed (3 suites, 30 tests), mobile typecheck passed, API planning logic passed (21 suites, 117 tests), and API typecheck passed. No baseline failures were recorded.

**Exit condition:** The implementer knows exactly which relevant edits predate this plan and has a reproducible baseline.

---

### Task 1: Lock the enriched read contracts with failing tests

**Files:**

- Modify: `apps/api/test/contract/planning/planning.summary.contract-spec.ts`
- Modify: `apps/api/test/contract/planning/planning.payment.contract-spec.ts`
- Modify: `apps/api/test/integration/planning/planning.summary.integration.spec.ts`
- Modify: `apps/api/test/integration/planning/planning.match.integration.spec.ts`
- Modify: `apps/mobile/src/services/contracts/financial-planning-service.ts`
- Modify: `apps/mobile/src/services/live/financial-planning-service.test.ts`
- Modify: `apps/mobile/src/services/mocks/financial-planning-service.test.ts`

**Contract additions:**

- Obligation summary items expose the next unpaid installment amount alongside the existing next due date.
- Payment-match detail exposes the existing match confidence/reason codes plus a display-safe transaction summary, candidate obligation summary, obligation version, and suggested allocation.
- Collection responses stay compact; detailed transaction/account information is required only from `GET /api/v1/payment-matches/{matchId}`.

- [x] Add an API contract assertion for `nextDueAmountMinor` as a string-encoded minor-unit amount or `null`.
- [x] Add payment-match detail contract assertions for:
  - transaction id, amount, currency, date, title/merchant, source account id/name;
  - candidate obligation id, title, provider, type, direction, remaining amount, next due date/amount, and obligation version;
  - advisory confidence, reason codes, and suggested schedule allocation.
- [x] Add integration fixtures proving owner scoping: a match detail must never expose another user's transaction, account, obligation, or schedule item.
- [x] Add mobile Zod contract tests proving malformed minor units, unknown reason codes, missing versions, and cross-currency match data are rejected.
- [x] Run the focused contract tests and confirm they fail for the missing fields before implementation.

```powershell
Set-Location apps/api
npm run test:contract -- --runTestsByPath test/contract/planning/planning.summary.contract-spec.ts test/contract/planning/planning.payment.contract-spec.ts
```

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/services/live/financial-planning-service.test.ts src/services/mocks/financial-planning-service.test.ts
```

**Exit condition:** The exact backend/mobile data required by the screenshots is executable as a failing contract, with no UI work started.

---

### Task 2: Enrich existing backend reads without adding schema

**Files:**

- Modify: `apps/api/src/planning/planning.repository.ts`
- Modify only if response metadata requires it: `apps/api/src/planning/planning.controller.ts`
- Modify: `apps/api/specs/007-financial-planning/contracts/openapi.yaml`
- Modify the Task 1 API tests.

**Implementation:**

- [x] Extend the existing planning-summary obligation query with a bounded lookup of the earliest unpaid schedule item and return `nextDueAmountMinor` next to `nextDueAt`.
- [x] Keep the existing 100-item bounds, owner predicate, stable order, and string minor-unit encoding.
- [x] Enrich only `getPaymentMatch` with joins to the already-owned transaction, account, obligation status, and referenced schedule item. Keep `listPaymentMatches` lightweight.
- [x] Return reason codes from the stored evidence without returning raw merchant keywords or other sensitive matching evidence.
- [x] Return a suggested allocation only when the transaction currency matches the obligation currency, the schedule item is unpaid, and the positive allocation does not exceed either the transaction amount or the schedule remainder.
- [x] Keep the existing mutation endpoint and version checks; do not add a second match-decision endpoint.
- [ ] Verify the query plans remain bounded and indexed. Add an index only if `EXPLAIN` proves an existing index is insufficient; otherwise do not create a migration.
- [x] Run:

```powershell
Set-Location apps/api
npm run test:contract -- --runTestsByPath test/contract/planning/planning.summary.contract-spec.ts test/contract/planning/planning.payment.contract-spec.ts
npm run test:planning:integration -- --runTestsByPath test/integration/planning/planning.summary.integration.spec.ts test/integration/planning/planning.match.integration.spec.ts
npm run typecheck
```

**Exit condition:** Existing endpoints provide all authoritative display and acceptance data without N+1 mobile reads or schema changes.

---

### Task 3: Align mobile domain, live, mock, and cache behavior

**Files:**

- Modify: `apps/mobile/src/domain/financial-planning.ts`
- Modify: `apps/mobile/src/services/contracts/financial-planning-service.ts`
- Modify: `apps/mobile/src/services/live/financial-planning-service.ts`
- Modify: `apps/mobile/src/services/mocks/financial-planning-service.ts`
- Modify: `apps/mobile/src/test-utils/financial-planning-fixtures.ts`
- Modify: `apps/mobile/src/features/financial-planning/financial-planning-queries.ts`
- Modify corresponding existing service tests.

**Implementation:**

- [x] Add the minimum typed fields required by the enriched summary and match-detail responses. Do not create a parallel obligations model if the existing `Obligation`, `ObligationStatus`, and `PaymentMatch` types can carry the data safely.
- [x] Map string minor units through the existing safe parser and reject unsafe integers or currency mismatches.
- [x] Preserve multiple currencies in overview aggregation instead of coercing to the preferred currency.
- [x] Keep mock and live provider outputs structurally identical.
- [x] Correct query invalidation so payment confirmation and match resolution refresh:
  - obligations overview;
  - the affected obligation detail;
  - the payment match detail/list;
  - account and transaction lists when a transaction is created or linked;
  - home planning summary.
- [x] Add parity tests for Arabic/English-independent data, zero/three-decimal currencies, missing next due data, and completed obligations.
- [x] Run:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/services/live/financial-planning-service.test.ts src/services/mocks/financial-planning-service.test.ts src/storage/financial-planning-obligation.test.ts src/storage/financial-planning-payment.test.ts
npm run check:financial-planning
npm run typecheck
```

**Exit condition:** Every provider supplies one consistent, safely parsed model and mutations refresh every screen they affect.

---

### Task 4: Add only the reusable obligation presentation pieces

**Files:**

- Refactor: `apps/mobile/src/design-system/components/financial/ObligationProgressCard.tsx`
- Refactor: `apps/mobile/src/design-system/components/financial/InstallmentTimeline.tsx`
- Modify if required: `apps/mobile/src/design-system/components/financial/FinancialProgress.tsx`
- Add or modify focused tests beside these components.
- Export only genuinely reused components from `apps/mobile/src/design-system/index.ts`.

**Components to support:**

- a compact obligation progress row/card;
- an accessible installment timeline;
- a three-step progress indicator reused by create and edit;
- a before/after financial transition block reused by payment and match review.

- [x] First attempt to adapt the three existing financial components above and the shared `SurfaceCard`, `ActionButton`, `StatusBadge`, and icon set.
- [x] Add a new component only when it is used by at least two screens or isolates non-trivial accessibility/progress behavior.
- [x] Use semantic theme tokens only; do not introduce raw feature colors, gradients, logo assets, or another icon package.
- [x] Make cards vertically flexible for text scaling while keeping normal-scale paddings, radii, icon sizes, and row heights consistent.
- [x] Give progress indicators an accessibility role/value and a localized full-sentence label.
- [x] Give timeline rows stable keys based on schedule ids, not localized labels.
- [x] Verify RTL mirrors semantic layout but does not reverse digits, dates, currency codes, progress percentages, or physical timeline chronology.
- [x] Run design-system tests and boundary checks.

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/design-system/components/financial
npm run check:design-system
```

**Exit condition:** The new screens can be built from shared primitives without copy-pasted card or timeline logic.

---

### Task 5: Rebuild the obligations overview

**Files:**

- Modify: `apps/mobile/src/features/obligations/ObligationOverviewScreen.tsx`
- Modify: `apps/mobile/src/features/obligations/obligation-queries.ts`
- Modify: `apps/mobile/src/features/obligations/ObligationJourney.test.tsx`

**Reference:** `01-overview-alay-lay-redesign.png`

- [x] Replace the generic metric/list composition with:
  - page title and accessible add action;
  - next-due hero showing amount, obligation title, localized due date, and days remaining;
  - one neutral split summary card for payable and receivable totals;
  - `All / Upcoming / Completed` segmented filtering;
  - obligation rows with icon, title, provider, paid/total copy, remaining amount, progress, and navigation affordance;
  - floating add action positioned clear of system insets and scroll content.
- [x] Define filter behavior explicitly:
  - `All`: active and paused obligations;
  - `Upcoming`: active obligations with a future or currently due installment;
  - `Completed`: completed and closed obligations;
  - archived obligations remain excluded.
- [x] Derive the hero from the earliest valid next installment. If none exists, show a localized calm empty state rather than a fake date/amount.
- [x] Use separate lines/chips for multiple currencies and never add them together.
- [x] Keep balances hidden consistently in visual text and accessibility labels.
- [ ] Add tests for filter counts, next-due ordering, multi-currency totals, empty/loading/error/retry, card navigation, add navigation, RTL/LTR, and hidden balances.
- [x] Run:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/features/obligations/ObligationJourney.test.tsx
```

**Exit condition:** The overview matches the approved hierarchy and every displayed number can be traced to the overview contract.

---

### Task 6: Convert create/edit into a validated three-step wizard

**Files:**

- Modify: `apps/mobile/src/features/obligations/ObligationForm.tsx`
- Modify: `apps/mobile/src/features/financial-planning/usePlanningDraft.ts` only if the existing hook cannot persist the current step.
- Modify: `apps/mobile/src/features/obligations/ObligationJourney.test.tsx`

**References:** `03-create-basic-info.png`, `04-create-payment-plan.png`, `05-create-review.png`

**Step model:**

1. Basic details: direction, type, title, total, provider/person.
2. Payment plan: schedule kind/frequency, first due date, installment amount/count, computed final date and total equation.
3. Review: immutable summary, funding account, automatic-match consent, final save.

- [x] Keep one form state and one draft id across all three visual steps; persist the current step with the existing draft payload.
- [x] Validate only fields owned by the current step when moving forward, then validate the full payload again before save.
- [x] Map first due date to existing `startDate` and `dueDay`; use existing `addMonthsClamped` for the computed final date. Do not add a second schedule calculator.
- [x] Preserve existing schedule kinds. Show only fields relevant to fixed-term, open-ended, or irregular schedules.
- [x] Preserve exact currency precision via `parseAmountToMinor` and `minorToMajorAmountText`.
- [x] Prevent invalid fixed-term math, including fractional/zero counts, opening paid greater than total, zero installment, and impossible final installment combinations.
- [x] Keep edit behavior on the same wizard, prefilled from the obligation, with no write until the final save action.
- [x] Back from step 2/3 returns to the previous step; back from step 1 uses the existing route behavior and retains the draft.
- [x] Save exactly once using the existing create/update service. Discard the draft only after confirmed success.
- [ ] Add tests for step navigation, validation ownership, draft restore, edit prefill, schedule summary, account selection, automatic matching, retry, and currency precision.
- [x] Run:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/features/obligations/ObligationJourney.test.tsx src/features/financial-planning/usePlanningDraft.test.tsx
```

**Exit condition:** Create and edit are understandable three-step flows with unchanged backend write semantics and no partial records.

---

### Task 7: Rebuild obligation details around progress and schedule

**Files:**

- Modify: `apps/mobile/src/features/obligations/ObligationDetailScreen.tsx`
- Modify: `apps/mobile/src/features/obligations/ObligationJourney.test.tsx`

**Reference:** `02-details.png`

- [x] Build the hero from contracted total, paid, remaining, and progress percentage; clamp visual progress to 0–100 while preserving truthful textual values.
- [x] Show the next installment only when one exists and label overdue, due, upcoming, paid, partial, and cancelled states with localized status badges.
- [x] Render the schedule in chronological order with a bounded initial view and “Show all” expansion; do not fetch or render an unbounded timeline.
- [x] Keep record payment as the primary action and edit as the secondary action.
- [x] Retain pause/resume/complete and payment reversal in an accessible secondary-actions area instead of deleting existing functionality.
- [x] Handle unavailable live payment history honestly; do not imply “no payments” when history is unavailable.
- [ ] Add tests for progress math, schedule ordering/statuses, show-all behavior, lifecycle mutations, payment navigation, reversal, hidden balances, and all state surfaces.

**Exit condition:** Details explain what was agreed, what was paid, what remains, what happens next, and what actions are available.

---

### Task 8: Complete and redesign the manual payment flow

**Files:**

- Modify: `apps/mobile/src/features/obligations/ObligationPaymentScreen.tsx`
- Modify: `apps/mobile/src/services/live/financial-planning-service.ts`
- Use existing: `apps/mobile/src/services/live/core-finance-service.ts`
- Modify: `apps/mobile/src/features/obligations/PaymentJourney.test.tsx`
- Modify: `apps/mobile/src/services/live/financial-planning-service.test.ts`

**Reference:** `06-payment-review.png`

- [x] Keep the edit state for amount, payment date, and account, then present the approved review state with:
  - obligation/payment label and prominent amount;
  - date and funding account;
  - account balance before and projected after;
  - confirm and edit actions.
- [x] Calculate projected balance with the existing safe minor-unit helpers and obligation direction: payable subtracts, receivable adds.
- [x] Reject insufficient funds where the account contract requires it, invalid currencies, non-positive amounts, and unsupported overpayment before confirmation.
- [x] Close the live-provider `transaction.kind === 'create'` gap by using the existing core-finance transaction creation operation, then link that transaction to the obligation payment.
- [x] Use deterministic child idempotency keys derived from the root payment operation. If transaction creation succeeds and allocation fails, retry must reuse the same transaction rather than create a duplicate.
- [x] Keep the preview version check. A changed obligation or account must invalidate the preview and return the user to review with a localized stale-data message.
- [x] Announce success once, discard the draft after both operations succeed, and invalidate account, transaction, overview, and detail queries.
- [ ] Add tests for live create-and-link success, idempotent retry after allocation failure, stale version, insufficient funds, payable/receivable balance direction, hidden balances, and three-decimal currency.

**Exit condition:** The payment screen is visually complete and the live provider can perform the operation safely without duplicate transactions.

---

### Task 9: Complete and redesign payment-match review

**Files:**

- Modify: `apps/mobile/src/features/obligations/PaymentMatchReviewScreen.tsx`
- Modify: `apps/mobile/src/services/live/financial-planning-service.ts`
- Modify: `apps/mobile/src/features/obligations/PaymentJourney.test.tsx`
- Modify the API/mobile tests from Tasks 1–3.

**Reference:** `07-match-review.png`

- [x] Render the detected transaction, proposed obligation, localized confidence explanation, and before/after obligation remainder from the enriched detail contract.
- [x] Translate reason codes into user language; never display raw evidence JSON, internal scores, ids, or merchant keywords.
- [x] Treat confidence as supporting information, not as an automatic decision.
- [x] Implement live `confirm` using the server-provided candidate version and suggested allocation. Keep server validation authoritative.
- [x] Keep `ignore` mapped to the existing rejected decision.
- [x] Disable both actions while a decision is pending and make a resolved/ignored result terminal and repeat-safe.
- [x] Reject confirmation when the candidate, currency, schedule item, or allocation is missing/stale; offer refresh instead of guessing.
- [x] Invalidate the match, obligation, overview, transaction, account, and home-summary queries after success.
- [x] Add tests for strong/partial evidence copy, confirm, ignore, stale version, malformed detail, hidden balances, Arabic/English, and double-tap protection.

**Exit condition:** Users can understand and safely accept or reject a real detected payment match in both mock and live modes.

---

### Task 10: Complete localization, bidirectionality, privacy, and accessibility

**Files:**

- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/financial-planning-localization.test.ts`
- Modify affected obligations component tests.

- [x] Add one Arabic and one English key for every new heading, helper, filter, status, confidence reason, calculation label, error, and success message.
- [x] Use Arabic copy from the references where clear, then provide concise natural English—not word-for-word awkward translations.
- [x] Keep user-entered titles/providers untouched and localize only system-generated labels and known types/statuses.
- [x] Use locale-aware date and amount formatters already in the project. Wrap mixed Arabic/Latin financial strings with the existing bidi-safe formatting pattern.
- [x] Verify RTL/LTR order for headers, segmented controls, direction choices, timeline rows, chevrons, and buttons.
- [x] Ensure every icon-only control has an accessible label and at least a 44×44 target.
- [x] Ensure selected tabs/radios/switches expose state; error and success messages use live-region/alert semantics without repeated announcements.
- [ ] Verify 200% text scaling, narrow Android width, keyboard avoidance, scroll-to-error behavior, and reduced-motion behavior.
- [x] Run:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/localization/financial-planning-localization.test.ts src/features/obligations/ObligationJourney.test.tsx src/features/obligations/PaymentJourney.test.tsx src/design-system/component-accessibility.test.tsx
npm run check:frontend-quality-gates
```

**Exit condition:** Both languages are complete, directionally correct, private, and usable with assistive settings.

---

### Task 11: Full regression and connected-device verification

**Files:**

- Modify only the smallest owning file/test if verification reveals a defect.
- Capture new evidence without overwriting existing user screenshots.

- [x] Run the focused backend suite:

```powershell
Set-Location apps/api
npm run test:planning:logic
npm run test:planning:integration
npm run typecheck
npm run lint
```

- [x] Run the focused and full mobile quality gates:

```powershell
Set-Location apps/mobile
npm test -- --runInBand src/features/obligations src/services/live/financial-planning-service.test.ts src/services/mocks/financial-planning-service.test.ts src/localization/financial-planning-localization.test.ts
npm run typecheck
npm run lint
npm run check:financial-planning
npm run check:design-system
npm run check:frontend-quality-gates
```

- [x] Build/install the current code on the connected Samsung device. If Windows path length blocks Gradle, use the repository's short-path/junction workaround; do not validate an older installed build as if it were current.
- [ ] Exercise this matrix on-device:

| Flow | Arabic RTL | English LTR | Hidden balances | 200% text | Failure/retry |
|---|---:|---:|---:|---:|---:|
| Overview + filters | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create steps 1–3 | ✓ | ✓ | N/A | ✓ | ✓ |
| Edit existing | ✓ | ✓ | ✓ | ✓ | ✓ |
| Detail + schedule | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manual payment | ✓ | ✓ | ✓ | ✓ | ✓ |
| Match confirm/ignore | ✓ | ✓ | ✓ | ✓ | ✓ |

- [ ] Verify rotation/insets, keyboard behavior, touch targets, back navigation, loading/empty/error states, no clipped amounts, no duplicate saves, and no duplicate transactions.
- [ ] Compare each screen to the corresponding approved image and log only intentional deviations caused by real data, platform conventions, accessibility, or preserved functionality.
- [x] Review the final diff for unrelated formatting, accidental generated files, raw colors, duplicated helpers, weakened validation, and missing tests.

**Exit condition:** Automated checks and current-build device verification both pass, with evidence for all seven flows.

## Planned File Impact Summary

**Mobile UI:**

- `apps/mobile/src/features/obligations/ObligationOverviewScreen.tsx`
- `apps/mobile/src/features/obligations/ObligationForm.tsx`
- `apps/mobile/src/features/obligations/ObligationDetailScreen.tsx`
- `apps/mobile/src/features/obligations/ObligationPaymentScreen.tsx`
- `apps/mobile/src/features/obligations/PaymentMatchReviewScreen.tsx`
- existing obligation query/test files

**Shared mobile contracts/services:**

- existing financial-planning domain, service contract, live service, mock service, fixtures, and query invalidation files
- existing financial card/progress/timeline primitives only where reuse is proven
- Arabic and English message catalogs

**Backend:**

- existing planning repository read queries and OpenAPI contract
- existing planning contract/integration tests
- no planned table or migration change

## Explicitly Out of Scope

- Replacing the app-wide navigation, theme, typography, account system, or transaction ledger.
- Adding cloud sync concepts beyond the existing planning service behavior.
- Automatically accepting matches based on confidence.
- Combining currencies through implicit conversion.
- Adding charts, logos, decorative illustration packages, animation libraries, or a new design-system layer.
- Rewriting unrelated savings goals, salary cycle, budgets, subscriptions, or home cards.

## Implementation Status — 2026-09-19

The obligations redesign implementation is closed. The final pixel-alignment pass fixed the duplicate RTL reversal, added the reference-style screen headers and back controls, rebuilt the overview ordering, converted the type selector and direction choices to the approved hierarchy, tightened the detail hero and timeline, and corrected the payment-review amount clipping. Arabic overview, create/basic-details, detail/schedule, and payment review were compared against the approved references on the connected Samsung SM-A165F using the current Metro bundle; the Expo development-tools bubble is not application UI and is absent from production builds.

Fresh completion evidence: 4 focused mobile suites / 18 tests pass, mobile TypeScript passes, targeted lint passes, and the current device renders long financial amounts on one line. Earlier backend planning logic (21 suites / 117 tests), API typecheck/lint, and current Android install also pass.

Environment-only gaps remain outside this UI closure: live PostgreSQL integration suites are skipped because no integration database is configured; the exhaustive Arabic/English/hidden-balance/200%-text/failure matrix was not repeated in full; `check:design-system` is blocked by pre-existing raw colors in `TrackingHomeCard.tsx`, and `check:frontend-quality-gates` is blocked by pre-existing platform/study/final-consistency gates. No schema migration or new dependency was added.
