# Tasks: R03 — Categories

**Input**: Design documents in `specs/014-r03-categories/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/category-presentation-contract.md`, `quickstart.md`

**Organization**: Work is screen-first. Shared category identity/search prerequisites appear once, followed by Category List, Create Category, Category Detail/Lifecycle, Edit Category, Merge Decision, and Category Picker, each with its own tests and device-validation fixes.

**Tests**: Mandatory under the specification and constitution. Tests precede implementation and prove bilingual validation/search, hierarchy rules, lifecycle/merge financial effects, caller context, localization, accessibility, and route preservation.

## Format: `[ID] [P?] [Story?] Description with exact file path`

- **[P]**: May run in parallel only after prerequisites and only across different files.
- **[US1]–[US4]**: Maps tasks to the four R03 user stories.
- Baseline, Shared Foundation, and Final Gate tasks have no story label.

---

## Phase 1: Baseline and Scope Lock

**Purpose**: Capture current category routes, rules, consumers, and known behavior before visual work.

- [ ] T001 Inventory the five owned routes and every category row/picker consumer named in `specs/014-r03-categories/plan.md`, recording props, current search/sort, route outcomes, and owner boundaries in `specs/014-r03-categories/validation/baseline.md`.
- [ ] T002 Run the automated baseline from `specs/014-r03-categories/quickstart.md` and record command, date, suite/test counts, and pre-existing failures in `specs/014-r03-categories/validation/baseline.md` without modifying production code.
- [ ] T003 Create the evidence index with Shared Foundation, Category List, Create, Detail/Lifecycle, Edit, Merge Decision, Picker, Android, iOS, and final regression sections in `specs/014-r03-categories/validation/README.md`.

**Checkpoint**: Duplicate-label behavior, hierarchy/lifecycle/merge commands, routes, and consumers are documented and unchanged.

---

## Phase 2: Shared Category Foundation

**Purpose**: Establish one compact category identity/search contract without inventing usage, recency, restriction, or sync data.

- [ ] T004 [P] Add failing projection tests for localized Arabic/English label selection, system/custom, parent/child, favorite, active/archived/merged, optional icon/color, duplicate labels, and missing supplemental data in the approved new file `src/features/categories/category-presentation.test.ts`.
- [X] T005 Implement the non-persisted category identity projector in the approved new file `src/features/categories/category-presentation.ts`, treating labels as authoritative and inferring no usage count, recency, sync/freshness, or unsupported restriction.
- [ ] T006 [P] Add failing normalized bilingual search and stable favorite-order tests for Arabic diacritics, English case, mixed text, duplicate labels, and 150+ categories in `src/features/categories/CategoryListScreen.test.tsx` and `src/features/transactions/CategoryPicker.test.tsx`.
- [X] T007 Reuse the existing normalization/sort behavior through the category presentation boundary in `src/features/categories/category-presentation.ts`; do not add fuzzy ranking, a recency store, or a transaction scan.
- [ ] T008 [P] Add failing compact-row coverage for label, hierarchy, origin, favorite, lifecycle status, optional icon/color, non-color meaning, mixed direction, 200% growth, and one 44×44 action in the approved new file `src/features/categories/CategoryRow.test.tsx`.
- [ ] T009 Implement the shared R03 category row with R01 `GroupedList`, `CategoryIcon`, and semantic status contracts in the approved new file `src/features/categories/CategoryRow.tsx`, keeping icon/color supplemental to the written label.
- [ ] T010 Add complete English and Arabic category origin/hierarchy/favorite/lifecycle/form/merge/picker/state/action keys required by T004–T009 to `src/localization/messages/en.ts` and `src/localization/messages/ar.ts`, preserving identical parameters and no hard-coded screen copy.
- [ ] T011 Run Shared Category Foundation tests plus `npm run typecheck`, `npm run check:design-system`, and `npm run check:core-finance`; record results in `specs/014-r03-categories/validation/shared-foundation.md`.
- [ ] T012 Fix only Shared Category Foundation defects from T011 in `src/features/categories/category-presentation.ts`, `src/features/categories/CategoryRow.tsx`, or localization/shared owners, rerun focused checks, and update `specs/014-r03-categories/validation/shared-foundation.md`.

**Checkpoint**: All R03 screens can consume one tested bilingual identity/search grammar without new business state.

---

## Phase 3: Screen — Category List (User Story 1, Priority P1) 🎯 MVP

**Goal**: Make a dense mixed category catalogue searchable and understandable without repeated cards.

**Independent Test**: Render empty, no-result, typical, 150+, bilingual, duplicate, parent/child, favorite, system/custom, active/archived/merged, loading, and error catalogues and open the current detail destination.

- [ ] T013 [P] [US1] Add failing list tests for compact virtualized rows, normalized bilingual search, favorite ordering, duplicate labels, lifecycle/origin/hierarchy status, no custom categories versus no result, loading/error/retry, create/detail routes, and 150+ items in `src/features/categories/CategoryListScreen.test.tsx` and `src/features/categories/CategoryRoutes.test.tsx`.
- [X] T014 [US1] Replace the per-item `SurfaceCard`/button layout with a native virtualized grouped list using `CategoryRow` in `src/features/categories/CategoryListScreen.tsx`, preserving the existing management query and create/detail navigation.
- [ ] T015 [US1] Implement title/search/create hierarchy and clear active/archived/merged grouping where current data supports it in `src/features/categories/CategoryListScreen.tsx`; keep favorites stable and duplicate labels visually distinguishable by existing context.
- [ ] T016 [US1] Implement geometry-preserving loading, no-custom-category, no-search-result, mapped error/retry, missing icon/color, dense, long-label, active, archived, and merged states in `src/features/categories/CategoryListScreen.tsx` without synthetic sync/offline certainty.
- [ ] T017 [US1] Preserve the protected route group and current category-list route meaning in `app/categories/_layout.tsx` and `app/categories/index.tsx`; prove unchanged outcomes in `src/features/categories/CategoryRoutes.test.tsx`.
- [ ] T018 [US1] Add Arabic RTL/English LTR, mixed/long labels, logical hierarchy, non-mirrored category icon, mirrored disclosure/back, light/dark, 200% text, screen-reader order, 44×44, and reduced-motion assertions to `src/features/categories/CategoryListScreen.test.tsx` and localization files.
- [ ] T019 [US1] Run Category List tests and record exact results in `specs/014-r03-categories/validation/category-list.md`.
- [ ] T020 [P] [US1] Validate Category List on Android across Arabic/English, light/dark, normal/200% text, TalkBack, 150+ rows, duplicate/long labels, lifecycle states, empty/no-result/error, and reduced motion; record `specs/014-r03-categories/validation/category-list-android.md`.
- [ ] T021 [P] [US1] Validate the equivalent Category List matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/category-list-ios.md`; unavailable infrastructure remains blocked.
- [ ] T022 [US1] Fix only Category List defects from T019–T021 in `src/features/categories/CategoryListScreen.tsx`, `src/features/categories/CategoryRow.tsx`, or the named owner, rerun tests, and update `specs/014-r03-categories/validation/category-list.md` before Create Category.

**Checkpoint**: Category List is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 4: Screen — Create Category (User Story 2, Priority P1)

**Goal**: Create a bilingual category through a focused form with safe hierarchy selection and one Save action.

**Independent Test**: Create categories with long/mixed Arabic and English labels, duplicate labels, parent/no-parent, favorite, invalid relationships, keyboard, dirty dismissal, failure, and success.

- [ ] T023 [P] [US2] Add failing create-mode tests for persistent Arabic/English labels, duplicate labels allowed, parent/no-parent selection, favorite, self/cycle validation from current rules, valid-input retention, dirty dismissal, duplicate Save, failure, and destination in `src/features/categories/CategoryForm.test.tsx` and `src/features/categories/CategoryRoutes.test.tsx`.
- [ ] T024 [US2] Recompose create mode in `src/features/categories/CategoryForm.tsx` with bilingual persistent fields, R01 `PickerField` for parent/no-parent, favorite control, one dominant Save action, and keyboard/safe-area behavior while preserving current schema and commands.
- [ ] T025 [US2] Replace the parent radio-card wall with a searchable compact parent selector in `src/features/categories/CategoryForm.tsx`, exposing current selection, eligibility, and no-parent choice without changing hierarchy rules.
- [ ] T026 [US2] Add component-local meaningful-draft comparison and keep-editing/discard confirmation to create mode in `src/features/categories/CategoryForm.tsx`, adding no durable category draft store.
- [ ] T027 [US2] Map exact field/relationship errors, saving/disabled state, duplicate-submit prevention, and only current success/failure states in `src/features/categories/CategoryForm.tsx`; retain valid bilingual input and continue allowing duplicate labels.
- [ ] T028 [US2] Preserve the current protected create route and result destination in `app/categories/new.tsx`; prove unchanged navigation and commands in `src/features/categories/CategoryJourney.test.tsx`.
- [ ] T029 [US2] Add Arabic RTL/English LTR, bilingual/mixed input, light/dark, 200% reflow, logical focus, keyboard, screen-reader field/error semantics, 44×44, and reduced-motion coverage to `src/features/categories/CategoryForm.test.tsx` and localization files.
- [ ] T030 [US2] Run Create Category tests and record exact results in `specs/014-r03-categories/validation/create-category.md`.
- [ ] T031 [P] [US2] Validate Create Category on Android across duplicate/long labels, parent/no-parent, invalid relationships, keyboard, dirty dismissal, failure/success, languages, themes, 200% text, and TalkBack; record `specs/014-r03-categories/validation/create-category-android.md`.
- [ ] T032 [P] [US2] Validate the equivalent Create Category matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/create-category-ios.md`; mark unavailable infrastructure blocked.
- [ ] T033 [US2] Fix only Create Category defects from T030–T032 in `src/features/categories/CategoryForm.tsx`, `app/categories/new.tsx`, or the named shared owner, rerun tests, and update `specs/014-r03-categories/validation/create-category.md` before Category Detail.

**Checkpoint**: Create Category is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 5: Screen — Category Detail and Lifecycle (User Story 3, Priority P1)

**Goal**: Show category identity, hierarchy, origin, lifecycle, and only currently supported actions before any consequential command.

**Independent Test**: Open active, archived, merged, system/custom, parent/child, missing, loading/error categories and exercise supported archive/restore paths including failures and repeated activation.

- [ ] T034 [P] [US3] Add failing detail tests for identity-first hierarchy, origin/hierarchy/favorite/lifecycle, supplied merged target, current eligible actions, missing/loading/error/retry, named archive/restore confirmation, pending guard, failure, and unchanged affected scopes in `src/features/categories/CategoryDetailScreen.test.tsx` and `src/features/categories/CategoryJourney.test.tsx`.
- [ ] T035 [US3] Recompose `src/features/categories/CategoryDetailScreen.tsx` into label/identity, origin/hierarchy/status, supplied context, then edit/archive/restore/merge actions using the shared category projection and R01 surfaces.
- [ ] T036 [US3] Show only current system/custom restrictions and command availability supplied by existing rules in `src/features/categories/CategoryDetailScreen.tsx`; do not invent usage counts, last-used recency, sync/freshness, or transaction-derived restrictions.
- [ ] T037 [US3] Add named archive/restore confirmation, existing consequence, command-working guard, mapped failure/retry, and truthful success/navigation in `src/features/categories/CategoryDetailScreen.tsx`, with no optimistic lifecycle change.
- [ ] T038 [US3] Implement loading, missing, query error/retry, active, archived, merged-target, missing supplemental identity, and action-working/failure states in `src/features/categories/CategoryDetailScreen.tsx` without stale record content.
- [ ] T039 [US3] Preserve the current `[id]` route parameters, back behavior, and command dispatch in `app/categories/[id].tsx`; prove unchanged outcomes in `src/features/categories/CategoryRoutes.test.tsx`.
- [ ] T040 [US3] Add Arabic RTL/English LTR, mixed labels, hierarchy direction, non-color lifecycle, light/dark, 200%, screen-reader order, 44×44, keyboard/safe-area, and reduced-motion coverage to `src/features/categories/CategoryDetailScreen.test.tsx` and localization files.
- [ ] T041 [US3] Run Category Detail/Lifecycle tests and record exact results in `specs/014-r03-categories/validation/category-detail.md`.
- [ ] T042 [P] [US3] Validate Category Detail plus archive/restore on Android across languages, themes, 200% text, TalkBack, all lifecycle/missing/error/action states, and reduced motion; record `specs/014-r03-categories/validation/category-detail-android.md`.
- [ ] T043 [P] [US3] Validate the equivalent Category Detail matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/category-detail-ios.md`; mark unavailable infrastructure blocked.
- [ ] T044 [US3] Fix only Category Detail/Lifecycle defects from T041–T043 in `src/features/categories/CategoryDetailScreen.tsx`, `app/categories/[id].tsx`, or the named owner, rerun tests, and update `specs/014-r03-categories/validation/category-detail.md` before Edit Category.

**Checkpoint**: Category Detail and archive/restore are independently implemented, tested, device-reviewed, and corrected.

---

## Phase 6: Screen — Edit Category (User Story 2, Priority P1)

**Goal**: Edit bilingual category meaning safely while preserving omitted icon/color data and current hierarchy rules.

**Independent Test**: Load/edit custom categories with duplicate labels, parent changes, self/cycle errors, favorite changes, seeded icon/color, dirty dismissal, missing/error, failure, and success.

- [ ] T045 [P] [US2] Add failing edit-mode tests for populated bilingual values, allowed duplicates, current parent/no-parent, self/cycle validation, favorite, omitted icon/color preservation, loading/missing/error, dirty dismissal, duplicate Save, and result navigation in `src/features/categories/CategoryForm.test.tsx` and `src/features/categories/CategoryRoutes.test.tsx`.
- [ ] T046 [P] [US2] Add service/repository regression coverage proving category edit preserves existing icon/color values not exposed by the focused form in `src/services/mocks/core-finance-categories.test.ts` and `src/storage/core-finance-repository.test.ts`.
- [ ] T047 [US2] Implement edit initialization, searchable parent selection, favorite state, and omitted icon/color preservation in `src/features/categories/CategoryForm.tsx` and `app/categories/[id].tsx`, retaining existing update validation and command ownership.
- [ ] T048 [US2] Implement edit loading, missing, query error/retry, exact field/relationship error, saving, failure, success, and dirty-discard states in `src/features/categories/CategoryForm.tsx` without synthetic sync state.
- [ ] T049 [US2] Apply the same Arabic/English, mixed-input, theme, 200%, focus, keyboard, screen-reader, target, and reduced-motion contract to edit mode in `src/features/categories/CategoryForm.test.tsx` and localization files.
- [ ] T050 [US2] Run Edit Category and optional-value preservation tests and record exact results in `specs/014-r03-categories/validation/edit-category.md`.
- [ ] T051 [P] [US2] Validate Edit Category on Android across populated/invalid/missing/error states, duplicate labels, parent changes, dirty dismissal, failure/success, languages, themes, 200% text, and TalkBack; record `specs/014-r03-categories/validation/edit-category-android.md`.
- [ ] T052 [P] [US2] Validate the equivalent Edit Category matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/edit-category-ios.md`; mark unavailable infrastructure blocked.
- [ ] T053 [US2] Fix only Edit Category defects from T050–T052 in `src/features/categories/CategoryForm.tsx`, `app/categories/[id].tsx`, or the current service/repository owner, rerun tests, and update `specs/014-r03-categories/validation/edit-category.md` before Merge Decision.

**Checkpoint**: Edit Category is independently implemented, tested, device-reviewed, and corrected without optional-data loss.

---

## Phase 7: Screen State — Merge Decision (User Story 3, Priority P1)

**Goal**: Make source, target, and existing reclassification/archive consequence explicit before the atomic merge command.

**Independent Test**: Select among eligible active targets, distinguish source/target, confirm/cancel, handle no target/concurrent change/failure, and prove exact reclassification and affected scopes remain unchanged.

- [ ] T054 [P] [US3] Add failing merge tests for explicit active-target selection, source/target comparison, no eligible target, current selection, consequence confirmation, cancel, duplicate submission, failure/retry, concurrent change, atomic reclassification, and affected scopes in `src/features/categories/CategoryDetailScreen.test.tsx`, `src/services/mocks/core-finance-categories.test.ts`, and `src/storage/core-finance-ledger.test.ts`.
- [ ] T055 [US3] Replace the first-target merge shortcut with explicit searchable target selection in `src/features/categories/CategoryDetailScreen.tsx`, excluding ineligible/self targets according to current rules and adding no new merge semantics.
- [ ] T056 [US3] Implement a clear source-versus-target comparison and current reclassification/archive consequence using R01 picker/confirmation patterns in `src/features/categories/CategoryDetailScreen.tsx`; presentation must not inspect or rewrite transactions.
- [ ] T057 [US3] Invoke the existing atomic merge command only after deliberate confirmation, disable duplicate submission, and map working/success/failure/concurrent-change states in `src/features/categories/CategoryDetailScreen.tsx`.
- [ ] T058 [US3] Add Arabic RTL/English LTR source/target semantics, mixed labels, non-color selection, light/dark, 200% reflow, focus order, screen-reader consequence, 44×44, keyboard, and reduced-motion coverage to `src/features/categories/CategoryDetailScreen.test.tsx` and localization files.
- [ ] T059 [US3] Run Merge Decision and reclassification tests and record exact results in `specs/014-r03-categories/validation/merge-decision.md`.
- [ ] T060 [P] [US3] Validate Merge Decision on Android with long/duplicate labels, no target, selection, confirmation/cancel, working/failure/success, languages, themes, 200% text, keyboard, and TalkBack; record `specs/014-r03-categories/validation/merge-decision-android.md`.
- [ ] T061 [P] [US3] Validate the equivalent Merge Decision matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/merge-decision-ios.md`; mark unavailable infrastructure blocked.
- [ ] T062 [US3] Fix only Merge Decision defects from T059–T061 in `src/features/categories/CategoryDetailScreen.tsx` or the current merge/shared owner, rerun tests, and update `specs/014-r03-categories/validation/merge-decision.md` before Category Picker.

**Checkpoint**: Merge Decision is independently implemented, tested, device-reviewed, and corrected with unchanged atomic financial effects.

---

## Phase 8: Screen — Category Picker (User Story 4, Priority P1)

**Goal**: Select or create an eligible category without taking ownership of the caller's draft, filters, or return context.

**Independent Test**: Open with current selection and 150+ categories, search Arabic/English, select/cancel, handle ineligible/no-result/error/create handoff, and preserve caller state.

- [ ] T063 [P] [US4] Add failing controlled-picker tests for current selection, favorites-first active catalogue, normalized bilingual search, archived/merged exclusion or explicit unavailability, 150+, no result/error, select/cancel, optional create handoff, and caller ownership in `src/features/transactions/CategoryPicker.test.tsx`.
- [X] T064 [US4] Refactor `src/features/transactions/CategoryPicker.tsx` to use the R03 projection and `CategoryRow` in a native virtualized searchable selection list while preserving active eligibility, favorite ordering, and controlled callbacks.
- [X] T065 [US4] Wrap the route presentation with R01 `RouteModalContainer` in `app/modals/category-picker.tsx`, preserving current dismissal and adding no global selection or caller-draft store.
- [ ] T066 [US4] Implement current selection, dense, no active category, no search match, mapped error/retry, ineligible reason, and optional current create handoff states in `src/features/transactions/CategoryPicker.tsx`; management actions stay outside picker mode.
- [ ] T067 [US4] Add Arabic RTL/English LTR, mixed labels, non-mirrored category identity, direction-aware disclosure, light/dark, 200% rows, keyboard/safe-area, focus entry/return, screen-reader selected/unavailable state, 44×44, and reduced-motion coverage to `src/features/transactions/CategoryPicker.test.tsx` and localization files.
- [ ] T068 [US4] Add caller regressions proving selection/cancel/create return preserves Add, edit, voice proposal, tracking review, budget, report, and Assistant owner state in `src/features/categories/CategoryJourney.test.tsx` and the existing consumer tests recorded by T001.
- [ ] T069 [US4] Run Category Picker and caller-context tests and record exact results in `specs/014-r03-categories/validation/category-picker.md`.
- [ ] T070 [P] [US4] Validate Category Picker on Android across 150+ rows, selection/search/empty/error/create/cancel, Arabic/English, themes, 200% text, keyboard, TalkBack, and reduced motion; record `specs/014-r03-categories/validation/category-picker-android.md`.
- [ ] T071 [P] [US4] Validate the equivalent Category Picker matrix on iOS/VoiceOver and record `specs/014-r03-categories/validation/category-picker-ios.md`; mark unavailable infrastructure blocked.
- [ ] T072 [US4] Fix only Category Picker defects from T069–T071 in `src/features/transactions/CategoryPicker.tsx`, `app/modals/category-picker.tsx`, `src/features/categories/CategoryRow.tsx`, or the named shared owner, rerun tests, and update `specs/014-r03-categories/validation/category-picker.md`.

**Checkpoint**: Category Picker is independently implemented, tested, device-reviewed, and corrected without caller-state ownership.

---

## Phase 9: Final Cross-Consumer Consistency and R03 Gate

**Purpose**: Prove all R03 screens and downstream classification consumers remain coherent and behaviorally unchanged.

- [ ] T073 Run `npm run typecheck`, `npm run lint`, `npm run check:design-system`, and `npm run check:core-finance`, recording exact output and zero new failures in `specs/014-r03-categories/validation/final-r03.md`.
- [ ] T074 Run the complete focused Jest command from `specs/014-r03-categories/quickstart.md` and append suite/test totals and failures to `specs/014-r03-categories/validation/final-r03.md`.
- [ ] T075 Run targeted Transactions, Add/Voice, Tracking, Budgets, Reports, and Assistant category-consumer regressions identified by T001, including transaction reclassification after merge; record unchanged effects in `specs/014-r03-categories/validation/consumer-regression.md`.
- [ ] T076 Verify Arabic/English key parity, logical RTL/LTR, light/dark, 320×568/large phone, 200% text, screen readers, keyboard, reduced motion, dense/duplicate/mixed labels, and every required state across all six screen groups in `specs/014-r03-categories/validation/final-matrix.md`.
- [ ] T077 [P] Re-run the complete R03 journey on Android, including create → list → detail → edit → archive/restore → merge → picker and downstream transaction classification; record `specs/014-r03-categories/validation/final-android.md`.
- [ ] T078 [P] Re-run the equivalent R03 journey on iOS/VoiceOver and record `specs/014-r03-categories/validation/final-ios.md`; unavailable iOS infrastructure remains explicitly blocked.
- [ ] T079 Fix only defects recorded by T073–T078 in the named R03/shared/core-finance owner, rerun affected checks, and update `specs/014-r03-categories/validation/final-r03.md`; do not add routes, duplicate validation, sync state, usage/recency data, permissions, providers, or local tokens.
- [ ] T080 Complete the R03 handoff in `specs/014-r03-categories/validation/README.md` by linking evidence, listing approved identity/picker contracts, and confirming unchanged routes, duplicate-label allowance, hierarchy, lifecycle, merge effects, and caller behavior.

**Final Checkpoint**: R03 is complete only when T073–T080 pass or unavailable platform infrastructure is explicitly blocked rather than checked.

---

## Dependencies and Execution Order

```text
Baseline
  → Shared Category Foundation
    → Category List → validate/fix
      → Create Category → validate/fix
        → Category Detail/Lifecycle → validate/fix
          → Edit Category → validate/fix
            → Merge Decision → validate/fix
              → Category Picker → validate/fix
                → Final R03 Gate
```

- Shared Category Foundation blocks every screen because it owns identity and normalized search presentation.
- Each screen's defect-fix task blocks the next screen under the screen-first contract.
- Android/iOS validation for one completed screen may run in parallel and both feed its fix task.
- Core finance remains the sole owner of hierarchy validation, archive/restore, atomic merge, transaction reclassification, persistence, and affected scopes.

### User Story Traceability

- **US1**: T013–T022 — Category List.
- **US2**: T023–T033 and T045–T053 — Create and Edit Category.
- **US3**: T034–T044 and T054–T062 — Category Detail/Lifecycle and Merge Decision.
- **US4**: T063–T072 — Category Picker.

## Parallel Opportunities

- Projection/search and compact-row tests may be authored in parallel where marked `[P]`.
- Android and iOS validation may run in parallel after each screen's automated gate.
- Screens remain sequential to preserve independent visual review and bounded fixes.

### Parallel Examples by User Story

- **US1**: Run Android T020 and iOS T021 after T019 passes.
- **US2**: Run Create validations T031/T032 together and Edit validations T051/T052 together after their respective automated gates.
- **US3**: Run Detail validations T042/T043 together and Merge validations T060/T061 together after their respective automated gates.
- **US4**: Run Android T070 and iOS T071 after T069 passes.

## Implementation Strategy

### Reviewable MVP

Complete T001–T022: baseline, Shared Category Foundation, and Category List. It proves the compact catalogue but does not close R03.

### Sequential Delivery

1. Lock existing behavior and complete the shared identity/search boundary.
2. Implement, test, device-review, and fix each screen in the listed order.
3. Run atomic merge and downstream classification regressions before final handoff.

### Stop Conditions

- Stop before device validation if focused tests or boundary checks fail.
- Stop before the next screen while the current screen has an unresolved required defect.
- Return shared defects to R01 and transaction/category-consumer defects to their owning roadmap area.
- Require a separate approved specification for any route, category rule, data field, permission, provider, or persistence change.

## Notes

- Every task names an existing or plan-approved new file path.
- Duplicate category labels remain allowed; no task adds uniqueness validation.
- `[P]` indicates safe file-level parallelism, not permission to bypass dependencies.
- Preserve unrelated user changes in the shared worktree.

## 2026-09-05 Item #30

- [x] Hide archive/merge controls for system categories.
- [x] Show owner-derived linked count before custom archive/merge.
- [x] Pass the preview into the mutation and surface stale/failure safely.
- [x] Cover picker compatibility, localization, live/mock HTTP parity, and count changes.
