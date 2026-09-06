# Tasks: R02 — Accounts

**Input**: Design documents in `specs/013-r02-accounts/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/account-presentation-contract.md`, `quickstart.md`

**Organization**: Work is screen-first. Shared account prerequisites appear once, then Account List, Account Detail, Create Account, Edit Account, and Account Picker are implemented, tested, device-reviewed, and corrected independently.

**Tests**: Mandatory under the specification and constitution. Focused tests precede each implementation and must prove financial-read integrity, validation, navigation, privacy, localization, accessibility, and critical journeys.

## Format: `[ID] [P?] [Story?] Description with exact file path`

- **[P]**: May run in parallel only after its prerequisites and only when it changes different files.
- **[US1]–[US4]**: Maps work to the four R02 user stories.
- Baseline, Shared Foundation, and Final Gate tasks intentionally have no story label.

---

## Phase 1: Baseline and Scope Lock

**Purpose**: Record the current account behavior and consumer blast radius before changing presentation.

- [ ] T001 Inventory the six owned routes and every account row/picker consumer named in `specs/013-r02-accounts/plan.md`, recording current props, routes, return semantics, and owning roadmap area in `specs/013-r02-accounts/validation/baseline.md`.
- [ ] T002 Run the automated baseline from `specs/013-r02-accounts/quickstart.md` and record command, date, suite/test counts, and pre-existing failures in `specs/013-r02-accounts/validation/baseline.md` without modifying production code.
- [ ] T003 Create the screen-first evidence index with Account List, Account Detail, Create Account, Edit Account, Account Picker, Android, iOS, and final regression sections in `specs/013-r02-accounts/validation/README.md`.

**Checkpoint**: Routes, commands, account consumers, and baseline failures are documented; no product behavior has changed.

---

## Phase 2: Shared Account Foundation

**Purpose**: Establish the truthful read projection and compact account identity contract that block every R02 screen.

- [ ] T004 [P] Add failing complete-ledger balance tests, including more than one transaction page, excluded transaction effects, zero/negative/large values, and multi-currency accounts, in `src/features/core-finance/core-finance-queries.test.ts` and `src/storage/core-finance-ledger.test.ts`.
- [X] T005 Expose a typed read-only complete-ledger account balance projection through `src/features/core-finance/core-finance-queries.ts` and the existing boundary in `src/services/contracts/core-finance-service.ts`, reusing the repository calculation in `src/storage/core-finance-repository.ts` and changing no balance rule.
- [ ] T006 [P] Add failing projection coverage for active/archived/default, confirmed/unknown/hidden, optional masked identity, and supplied inclusion/exclusion in the approved new file `src/features/accounts/account-presentation.test.ts`.
- [X] T007 Implement the non-persisted account display projector in the approved new file `src/features/accounts/account-presentation.ts`; accept authoritative balance and supplied state, infer no account sync/freshness, and perform no ledger calculation.
- [ ] T008 [P] Add failing compact-row coverage for identity, amount display state, non-color status, 200% wrapping, mixed direction, hidden accessibility output, and a single 44×44 target in the approved new file `src/features/accounts/AccountRow.test.tsx`.
- [X] T009 Implement the shared R02 account identity row with R01 `GroupedList`, `AmountText`, `SensitiveValue`, and semantic status contracts in the approved new file `src/features/accounts/AccountRow.tsx`, adding no local token system or account command.
- [X] T010 Add complete English and Arabic account type/status/action/state/form/picker keys required by T007–T009 to `src/localization/messages/en.ts` and `src/localization/messages/ar.ts`, preserving identical keys, parameters, English numerals, and no hard-coded screen copy.
- [X] T011 Run T004–T010 focused tests plus `npm run typecheck`, `npm run check:design-system`, and `npm run check:core-finance`; record results and any approved public-prop migration in `specs/013-r02-accounts/validation/shared-foundation.md`.
- [X] T012 Fix only Shared Account Foundation defects recorded by T011 in `src/features/accounts/account-presentation.ts`, `src/features/accounts/AccountRow.tsx`, the named core-finance read owner, or localization files, then rerun and append passing evidence to `specs/013-r02-accounts/validation/shared-foundation.md`.

**Checkpoint**: Every R02 screen can consume one tested, localized, privacy-safe account projection without calculating a balance in UI.

---

## Phase 3: Screen — Account List (User Story 1, Priority P1) 🎯 MVP

**Goal**: Replace repeated account hero cards with a compact, virtualized, searchable management list while preserving all routes and meanings.

**Independent Test**: Open empty, no-result, typical, 30/100+, archived/default, multi-currency, hidden, loading, and error lists; balances match complete-ledger fixtures and each row opens the current detail route.

- [ ] T013 [P] [US1] Add failing list tests for compact grouped rows, complete-ledger balances, active/archived/default and supplied inclusion states, duplicate/long names, name search, no-accounts versus no-result, loading/error/retry, hidden values, create action, detail route, and sanitized return behavior in `src/features/accounts/AccountListScreen.test.tsx` and `src/features/accounts/AccountRoutes.test.tsx`.
- [X] T014 [US1] Replace the `ScrollView`/hero-card repetition with a native virtualized grouped account list using `AccountRow` in `src/features/accounts/AccountListScreen.tsx`, preserving current query, name-search semantics, create route, detail route, and return callback.
- [X] T015 [US1] Implement stable list header/search/create hierarchy and separate active/archived sections with R01 semantic surfaces in `src/features/accounts/AccountListScreen.tsx`, showing inclusion/exclusion only when supplied and never inventing pending/stale labels.
- [X] T016 [US1] Implement geometry-preserving loading, no-account, no-search-result, mapped error/retry, hidden, unknown, and dense-list states in `src/features/accounts/AccountListScreen.tsx`; unknown balance must never render as zero.
- [ ] T017 [US1] Preserve the thin protected route wrapper, `returnTo` sanitization, and back result in `app/accounts/index.tsx` and `app/accounts/_layout.tsx`; prove unchanged navigation in `src/features/accounts/AccountRoutes.test.tsx`.
- [ ] T018 [US1] Add Arabic RTL/English LTR, mixed-script account identity, bidi amount/currency/masked-digit, light/dark, 200% text, screen-reader order, 44×44, and reduced-motion assertions to `src/features/accounts/AccountListScreen.test.tsx`, adding missing copy only in `src/localization/messages/en.ts` and `src/localization/messages/ar.ts`.
- [X] T019 [US1] Run Account List tests and boundary checks and record exact results in `specs/013-r02-accounts/validation/account-list.md`.
- [ ] T020 [P] [US1] Validate Account List on a supported Android device across Arabic/English, light/dark, normal/200% text, TalkBack, visible/hidden values, empty/no-result/error, and 100+ rows; record safe evidence in `specs/013-r02-accounts/validation/account-list-android.md`.
- [ ] T021 [P] [US1] Validate the equivalent Account List matrix on a supported iOS device or approved iOS environment with VoiceOver and record `specs/013-r02-accounts/validation/account-list-ios.md`; mark unavailable infrastructure blocked, not complete.
- [ ] T022 [US1] Fix only Account List defects recorded by T019–T021 in `src/features/accounts/AccountListScreen.tsx`, `src/features/accounts/AccountRow.tsx`, or the named shared owner, then rerun focused tests and update `specs/013-r02-accounts/validation/account-list.md` before Account Detail.

**Checkpoint**: Account List is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 4: Screen — Account Detail (User Story 2, Priority P1)

**Goal**: Present one account as a financial record with truthful summary, identity/status, recent activity handoff, and bounded actions.

**Independent Test**: Open active, archived, default, credit, multi-currency, hidden, missing, loading/error, and action-failure details; current edit/transfer/archive/restore outcomes remain unchanged.

- [ ] T023 [P] [US2] Add failing detail tests for summary-first hierarchy, authoritative balance, identity/status, supplied inclusion, R04 activity slot, active/archived actions, transfer deep link, missing/error/retry, hidden/unknown values, confirmation, pending guard, and archive/restore failure in `src/features/accounts/AccountDetailScreen.test.tsx` and `src/features/accounts/AccountJourney.test.tsx`.
- [X] T024 [US2] Recompose `src/features/accounts/AccountDetailScreen.tsx` into balance/identity summary, account facts/status, R04-owned recent-activity integration slot, then current actions using R01 surfaces and the R02 projector.
- [X] T025 [US2] Preserve current edit and `/(tabs)/add?type=transfer&accountId=…` navigation plus archived eligibility in `app/accounts/[id]/index.tsx` and `src/features/accounts/AccountDetailScreen.tsx`, adding no new route or transaction rule.
- [X] T026 [US2] Add named archive/restore confirmation, consequence copy, working guard, mapped error/retry, and post-resolution navigation around the existing commands in `src/features/accounts/AccountDetailScreen.tsx`; do not optimistically change status.
- [X] T027 [US2] Implement explicit loading, missing, query error, hidden/unknown balance, unavailable activity, archived, action-working/failure/success states in `src/features/accounts/AccountDetailScreen.tsx`, showing only states supplied by current owners.
- [ ] T028 [US2] Add Arabic RTL/English LTR, mixed identity, financial bidi, light/dark, 200% reflow, TalkBack/VoiceOver order, action target, keyboard/safe-area, and reduced-motion assertions to `src/features/accounts/AccountDetailScreen.test.tsx` and localization files.
- [X] T029 [US2] Run Account Detail tests and record exact command/results in `specs/013-r02-accounts/validation/account-detail.md`.
- [ ] T030 [P] [US2] Validate Account Detail and archive/restore on Android across the specified language/theme/text/privacy/action-state matrix and record `specs/013-r02-accounts/validation/account-detail-android.md`.
- [ ] T031 [P] [US2] Validate the equivalent Account Detail matrix on iOS/VoiceOver and record `specs/013-r02-accounts/validation/account-detail-ios.md`; record unavailable infrastructure as blocked.
- [ ] T032 [US2] Fix only Account Detail defects from T029–T031 in `src/features/accounts/AccountDetailScreen.tsx`, `app/accounts/[id]/index.tsx`, or the named owner, rerun tests, and update `specs/013-r02-accounts/validation/account-detail.md` before Create Account.

**Checkpoint**: Account Detail is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 5: Screen — Create Account (User Story 3, Priority P1)

**Goal**: Provide a focused, keyboard-safe account creation form with one truthful Save path.

**Independent Test**: Create all seven existing types with valid/invalid values, duplicate names, amount extremes, default choice, dirty dismissal, offline/current save outcomes, failure, and repeated Save.

- [ ] T033 [P] [US3] Add failing create-mode tests for field hierarchy, seven types, currency/opening balance/default behavior, validation retention, duplicate names, keyboard, dirty dismissal, duplicate Save, mapped failure/success, and `/accounts` completion in `src/features/accounts/AccountForm.test.tsx` and `src/features/accounts/AccountRoutes.test.tsx`.
- [ ] T034 [US3] Recompose create mode in `src/features/accounts/AccountForm.tsx` with persistent labels, compact type selection, currency/opening balance/default fields, one dominant Save action, and R01 keyboard/safe-area presentation while retaining current schema and callbacks.
- [X] T035 [US3] Add component-local meaningful-draft comparison and keep-editing/discard confirmation to create mode in `src/features/accounts/AccountForm.tsx`, adding no durable draft store.
- [X] T036 [US3] Map exact field errors, saving/disabled state, duplicate-submit prevention, and only currently supplied local/pending/success/failure outcomes in `src/features/accounts/AccountForm.tsx`; retain all valid input after error.
- [ ] T037 [US3] Preserve protected route behavior and current create command/result destination in `app/accounts/new.tsx`; prove no route or service-rule drift in `src/features/accounts/AccountJourney.test.tsx`.
- [ ] T038 [US3] Add Arabic RTL/English LTR form labels/errors, English-numeral amount input, mixed content, light/dark, 200% reflow, logical focus, 44×44, keyboard, screen-reader, and reduced-motion coverage to `src/features/accounts/AccountForm.test.tsx` and localization files.
- [X] T039 [US3] Run Create Account tests and record exact results in `specs/013-r02-accounts/validation/create-account.md`.
- [ ] T040 [P] [US3] Validate Create Account on Android with all seven types, keyboard, Arabic/English, themes, 200% text, TalkBack, validation, dirty dismissal, save failure/success, and duplicate Save; record `specs/013-r02-accounts/validation/create-account-android.md`.
- [ ] T041 [P] [US3] Validate the equivalent Create Account matrix on iOS/VoiceOver and record `specs/013-r02-accounts/validation/create-account-ios.md`; mark unavailable infrastructure blocked.
- [ ] T042 [US3] Fix only Create Account defects from T039–T041 in `src/features/accounts/AccountForm.tsx`, `app/accounts/new.tsx`, or the named shared owner, rerun tests, and update `specs/013-r02-accounts/validation/create-account.md` before Edit Account.

**Checkpoint**: Create Account is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 6: Screen — Edit Account (User Story 3, Priority P1)

**Goal**: Edit supported account values without implying direct balance edits or erasing hidden optional data.

**Independent Test**: Load/edit every type, preserve institution/last-four/credit-limit/icon/color/notes, keep currency read-only, protect dirty input, and handle missing/error/save outcomes.

- [ ] T043 [P] [US3] Add failing edit-mode tests for loading/missing/error/retry, populated fields, read-only currency, non-editable derived balance, validation retention, dirty dismissal, duplicate Save, and current result navigation in `src/features/accounts/AccountForm.test.tsx`, `src/features/accounts/AccountDetailScreen.test.tsx`, and `src/features/accounts/AccountRoutes.test.tsx`.
- [ ] T044 [P] [US3] Add a repository/service regression proving edits preserve existing `institution`, `lastFour`, `creditLimitMinor`, `iconKey`, `colorKey`, and `notes` when the focused form omits them in `src/services/mocks/core-finance-accounts.test.ts` and `src/storage/core-finance-repository.test.ts`.
- [X] T045 [US3] Implement edit-mode initialization/read-only presentation and optional-field preservation in `src/features/accounts/AccountForm.tsx` and `app/accounts/[id]/edit.tsx`, retaining existing validation, update command, and `/accounts` result.
- [X] T046 [US3] Implement edit loading, missing, query error/retry, field error, saving, failure, and success presentation in `app/accounts/[id]/edit.tsx` and `src/features/accounts/AccountForm.tsx` without rendering stale or unknown values as confirmed.
- [ ] T047 [US3] Apply the same localized RTL/LTR, bidi, theme, 200%, focus, keyboard, screen-reader, target, and reduced-motion contract to edit mode in `src/features/accounts/AccountForm.test.tsx` and localization files.
- [X] T048 [US3] Run Edit Account plus optional-field preservation tests and record exact results in `specs/013-r02-accounts/validation/edit-account.md`.
- [ ] T049 [P] [US3] Validate Edit Account on Android with loading/missing/error, read-only currency, seeded optional data, validation, dirty dismissal, save failure/success, Arabic/English, themes, 200% text, and TalkBack; record `specs/013-r02-accounts/validation/edit-account-android.md`.
- [ ] T050 [P] [US3] Validate the equivalent Edit Account matrix on iOS/VoiceOver and record `specs/013-r02-accounts/validation/edit-account-ios.md`; mark unavailable infrastructure blocked.
- [ ] T051 [US3] Fix only Edit Account defects from T048–T050 in `src/features/accounts/AccountForm.tsx`, `app/accounts/[id]/edit.tsx`, or the current repository/service owner, rerun tests, and update `specs/013-r02-accounts/validation/edit-account.md` before Account Picker.

**Checkpoint**: Edit Account is independently implemented, tested, device-reviewed, and corrected with no optional-data loss.

---

## Phase 7: Screen — Account Picker (User Story 4, Priority P1)

**Goal**: Select an eligible account from a dense searchable modal without taking ownership of the caller's draft or filters.

**Independent Test**: Open with current selection and 100+ accounts; search by current name/currency/last-four semantics, select/cancel, handle no eligible/no result/error, and preserve every caller context.

- [ ] T052 [P] [US4] Add failing controlled-picker tests for current selection, active eligibility, archived unavailable state where supplied, name/currency/last-four search, 100+, no eligible/no result/error, clear query, select/cancel, optional create route, and caller draft ownership in `src/features/transactions/AccountPicker.test.tsx`.
- [ ] T053 [US4] Refactor `src/features/transactions/AccountPicker.tsx` to consume the R02 account row projection in a native virtualized selection list with current-selection and explicit unavailable semantics, preserving controlled callbacks and search behavior.
- [X] T054 [US4] Wrap route presentation with R01 `RouteModalContainer` in `app/modals/account-picker.tsx`, preserving current dismissal and adding no global selection/result store.
- [ ] T055 [US4] Implement picker loading, no eligible accounts, no search match, query error/retry, dense, current selection, and optional create handoff in `src/features/transactions/AccountPicker.tsx`; keep management commands outside selection mode.
- [ ] T056 [US4] Add Arabic RTL/English LTR, mixed labels/digits, light/dark, 200% row growth, keyboard/safe-area, focus entry/return, screen-reader selected/unavailable state, 44×44, and reduced-motion coverage to `src/features/transactions/AccountPicker.test.tsx` and localization files.
- [ ] T057 [US4] Add caller regressions proving selection/cancel preserves manual Add, transaction edit, filters, transfer, tracking, salary, and report owner state in `src/features/accounts/AccountJourney.test.tsx` and the existing consumer tests named in `specs/013-r02-accounts/validation/baseline.md`.
- [ ] T058 [US4] Run Account Picker and caller-context tests and record exact results in `specs/013-r02-accounts/validation/account-picker.md`.
- [ ] T059 [P] [US4] Validate Account Picker on Android across 100+ rows, selection/search/empty/error/cancel/create, Arabic/English, themes, 200% text, keyboard, TalkBack, and reduced motion; record `specs/013-r02-accounts/validation/account-picker-android.md`.
- [ ] T060 [P] [US4] Validate the equivalent Account Picker matrix on iOS/VoiceOver and record `specs/013-r02-accounts/validation/account-picker-ios.md`; mark unavailable infrastructure blocked.
- [ ] T061 [US4] Fix only Account Picker defects from T058–T060 in `src/features/transactions/AccountPicker.tsx`, `app/modals/account-picker.tsx`, `src/features/accounts/AccountRow.tsx`, or the named shared owner, rerun tests, and update `specs/013-r02-accounts/validation/account-picker.md`.

**Checkpoint**: Account Picker is independently implemented, tested, device-reviewed, and corrected without caller-state ownership.

---

## Phase 8: Final Cross-Consumer Consistency and R02 Gate

**Purpose**: Prove the five screens work together without route, business-rule, privacy, accessibility, or downstream regressions.

- [X] T062 Run `npm run typecheck`, `npm run lint`, `npm run check:design-system`, and `npm run check:core-finance`, recording exact output and zero new failures in `specs/013-r02-accounts/validation/final-r02.md`.
- [X] T063 Run the complete focused Jest command from `specs/013-r02-accounts/quickstart.md` and append suite/test totals and failures to `specs/013-r02-accounts/validation/final-r02.md`.
- [ ] T064 Run targeted Home, Transactions, Add/Voice, Tracking, Salary, Reports, More, and App Settings account-consumer tests identified by T001; record coverage and unchanged semantics in `specs/013-r02-accounts/validation/consumer-regression.md`.
- [ ] T065 Verify Arabic/English key parity, logical RTL/LTR, light/dark, 320×568/large phone, 200% text, screen readers, keyboard, reduced motion, visible/hidden/background masking, and every required state across all five screens in `specs/013-r02-accounts/validation/final-matrix.md`.
- [ ] T066 [P] Re-run the complete R02 journey on a supported Android device, including create → list → detail → transfer → edit → archive/restore → picker and background remask; record `specs/013-r02-accounts/validation/final-android.md`.
- [ ] T067 [P] Re-run the equivalent R02 journey on iOS/VoiceOver and record `specs/013-r02-accounts/validation/final-ios.md`; unavailable iOS infrastructure remains explicitly blocked.
- [ ] T068 Fix only defects recorded by T062–T067 in the named R02/shared/core-finance owner, rerun affected checks, and update `specs/013-r02-accounts/validation/final-r02.md`; do not add a route, calculation, permission, provider, or local token workaround.
- [ ] T069 Complete the R02 handoff in `specs/013-r02-accounts/validation/README.md` by linking final evidence, listing approved account presentation/picker contracts, and confirming unchanged routes, commands, validation, balances, and downstream capabilities.

**Final Checkpoint**: R02 is complete only when T062–T069 pass or unavailable platform infrastructure is recorded as blocked rather than checked.

---

## Dependencies and Execution Order

```text
Baseline
  → Shared Account Foundation
    → Account List → validate/fix
      → Account Detail → validate/fix
        → Create Account → validate/fix
          → Edit Account → validate/fix
            → Account Picker → validate/fix
              → Final R02 Gate
```

- Shared Account Foundation blocks every screen because it establishes the authoritative balance and account-row contracts.
- Each screen's defect-fix task blocks the next screen under the approved screen-first contract.
- Android and iOS validation for the same completed screen may run in parallel; both feed that screen's fix task.
- R04 owns transaction-row anatomy; R02 uses only its approved activity integration when available.

### User Story Traceability

- **US1**: T013–T022 — Account List.
- **US2**: T023–T032 — Account Detail.
- **US3**: T033–T051 — Create and Edit Account.
- **US4**: T052–T061 — Account Picker.

## Parallel Opportunities

- Shared read-projection and account-row test authoring may proceed in parallel where marked `[P]`.
- Android and iOS validation may run in parallel after the focused automated gate passes.
- Different screens remain sequential so each can be visually reviewed and corrected before the next begins.

### Parallel Examples by User Story

- **US1**: Run Android T020 and iOS T021 after T019 passes.
- **US2**: Run Android T030 and iOS T031 after T029 passes.
- **US3**: Run Create validations T040/T041 together, then Edit validations T049/T050 together after their respective automated gates.
- **US4**: Run Android T059 and iOS T060 after T058 passes.

## Implementation Strategy

### Reviewable MVP

Complete T001–T022: baseline, Shared Account Foundation, and Account List. This proves truthful balances and the compact list but does not close R02.

### Sequential Delivery

1. Lock baseline and complete the shared authoritative projection.
2. Implement, test, device-review, and fix one screen at a time in the listed order.
3. Run downstream consumer and full financial/privacy regression only after all five screens pass.

### Stop Conditions

- Stop before device validation when focused tests or boundary checks fail.
- Stop before the next screen while the current screen has an unresolved required defect.
- Return shared defects to R01 and transaction-row defects to R04; do not add local workarounds.
- Require a separate approved specification for any route, business rule, account capability, permission, provider, or schema change.

## Notes

- Every task names an existing or plan-approved new file path.
- Tests precede implementation for changed financial, form, picker, and navigation behavior.
- `[P]` indicates safe file-level parallelism, not permission to bypass dependencies.
- Preserve unrelated user changes in the shared worktree.

## 2026-09-06 Account Tracking Control

- [x] Add supported-type form switch, dirty-state handling, and accessible copy.
- [x] Render the saved state on account detail for supported account types only.
- [x] Prove create/edit/storage/bootstrap/delta/default compatibility in Jest.
- [x] Record independent review and Slice 2 remote CI evidence.

## 2026-09-06 Credit-Card Terms and Payoff

- [x] Add statement day, due day, monthly-basis-point rate, and minimum-payment inputs to credit-card create/edit only.
- [x] Show stored card terms and the explicit-input payoff calculator on card detail without changing routes or visual primitives.
- [x] Clear incompatible terms when type changes and preserve them through local persistence, sync, and explicit conflict retry.
- [x] Add account-target due-reminder routing through the existing notification controller.
- [x] Pass full Mobile automated verification; Android/iOS device acceptance and production account cutover remain external/Phase 14 gates.
- [x] Record the Slice 3 pushed SHA and successful remote CI before release completion.
