# Tasks: Home, Accounts, Transactions, and Categories

**Input**: Design documents from `specs/004-core-finance/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/core-finance-contract.md`, `quickstart.md`

**Tests**: Required by the project constitution for financial arithmetic, validation, state
transitions, storage mutations, privacy, accessibility, and each critical user journey. Write the
named test before its implementation task and confirm it fails for the intended missing behavior.

**Organization**: Tasks are grouped by user story. Every task names the exact file to change and
an independent verification target suitable for a lower-cost implementation model.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel because it changes a different file and has no dependency on an incomplete task.
- **[Story]**: Maps the task to a user story in `spec.md`.
- Run the narrowest named test after each implementation task; do not wait for the phase checkpoint.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add only the project checks and test support required by SPEC-004.

- [X] T001 Create `scripts/check-core-finance-boundaries.mjs` to reject direct SQLite imports outside `src/storage/`, feature-local raw colors, hard-coded English UI strings in SPEC-004 feature/routes, sensitive financial logging, and production-provider imports; verify with `node scripts/check-core-finance-boundaries.mjs`.
- [X] T002 Add `check:core-finance` to `package.json` pointing to `scripts/check-core-finance-boundaries.mjs`; verify with `npm run check:core-finance`.
- [X] T003 [P] Update `src/test-utils/render.tsx` to create an isolated QueryClient per render and expose a helper for preloaded query data without changing existing callers; verify with `npm test -- --runInBand src/test-utils/render.test.tsx` after adding the focused regression in that file.
- [X] T004 [P] Create `src/test-utils/core-finance-fixtures.ts` with deterministic synthetic accounts, all default category groups, and factories for empty, partial, multi-currency, archived, offline, conflict, and 500-transaction datasets; verify exported fixture counts and unique IDs in `src/test-utils/core-finance-fixtures.test.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish one typed, durable ledger boundary shared by all five user stories.

**CRITICAL**: Complete this phase before any user-story implementation.

- [X] T005 [P] Write failing tests for integer minor-unit parsing, formatting inputs, safe-integer limits, transaction balance effects, and derived account balance in `src/domain/core-finance.test.ts`; verify failures target missing SPEC-004 domain functions.
- [X] T006 Implement MoneyValue, account/category/transaction/draft/filter/correction/conflict/HomeSummary types and pure balance-effect functions in `src/domain/core-finance.ts` until `src/domain/core-finance.test.ts` passes.
- [X] T007 Write failing Zod validation tests for account, category hierarchy, transaction, transfer, refund, draft, and conflict-resolution inputs in `src/domain/core-finance-validation.test.ts`; include same-account transfer, missing bilingual labels, cycles, invalid amounts, and archived selections.
- [X] T008 Add the validation schemas and localized issue-key mapping to `src/domain/core-finance.ts`; verify `npm test -- --runInBand src/domain/core-finance-validation.test.ts`.
- [X] T009 Write a failing migration test in `src/storage/database.test.ts` that upgrades schema version 1 to SPEC-004 tables/indexes with foreign keys enabled and preserves existing `offline_entries` rows.
- [X] T010 Extend `src/storage/database.ts` with one forward-only migration for accounts, categories, transactions, drafts, correction actions, exchange-rate fixtures, and sync conflicts plus required indexes; verify `src/storage/database.test.ts` and do not rewrite migration 1.
- [X] T011 Write failing repository tests for account/category CRUD, default-account uniqueness, transaction CRUD, durable drafts, foreign-key rejection, and transaction rollback in `src/storage/core-finance-repository.test.ts`.
- [X] T012 Implement the minimum repository operations required by T011 in `src/storage/core-finance-repository.ts`, keeping every direct SQLite call in this file or `src/storage/database.ts`; verify `src/storage/core-finance-repository.test.ts`.
- [X] T013 [P] Define CoreFinanceService, ExchangeRateService, typed inputs/results, query scopes, impact previews, and safe error codes in `src/services/contracts/core-finance-service.ts`; verify with `npm run typecheck`.
- [X] T014 Implement a deterministic repository-backed mock CoreFinanceService skeleton in `src/services/mocks/core-finance-service.ts` that satisfies T013 without adding user-story mutations yet; verify with `npm run typecheck`.
- [X] T015 [P] Write failing tests for stable query keys and mutation-scope invalidation in `src/features/core-finance/core-finance-queries.test.ts`; cover Home, lists, details, selectors, and conflicts.
- [X] T016 Implement query keys, query options, and mutation invalidation helpers in `src/features/core-finance/core-finance-queries.ts`; verify `src/features/core-finance/core-finance-queries.test.ts` and keep durable records out of Zustand.
- [X] T017 [P] Write safe error-mapping tests in `src/features/core-finance/core-finance-errors.test.ts` proving storage/provider details and financial values never appear in user messages or analytics payloads.
- [X] T018 Implement localized retry, keep-editing, save-local, and review-conflict mappings in `src/features/core-finance/core-finance-errors.ts`; verify `src/features/core-finance/core-finance-errors.test.ts`.

**Checkpoint**: The database, domain rules, typed service boundary, query ownership, fixtures, and safe errors are ready; all user stories may now start.

---

## Phase 3: User Story 1 - Understand My Financial Position (Priority: P1) MVP

**Goal**: Replace Home placeholder content with a trustworthy derived financial summary and one clear next action.

**Independent Test**: Load empty, populated, hidden, multi-currency, partial, offline, error, review, and pending-sync fixtures; Home must show the correct hierarchy, estimates/exclusions, privacy behavior, and recovery without requiring another story's UI.

### Tests for User Story 1

- [X] T019 [P] [US1] Write failing HomeSummary service tests in `src/services/mocks/core-finance-service.test.ts` for derived balances, period income/expense, active-account count, recent records, review count, pending-sync count, and exclusion of failed/deleted/conflict records.
- [X] T020 [P] [US1] Write failing exchange-estimate tests in `src/services/mocks/exchange-rate-service.test.ts` for profile currency, original components, timestamps, stale rates, and visible exclusion of unavailable currencies.
- [X] T021 [P] [US1] Write failing state and hierarchy tests for empty, populated, partial, offline, stale, error, review, and pending-sync Home states in `src/features/home/HomeScreen.test.tsx`.
- [X] T022 [P] [US1] Write failing privacy/accessibility tests in `src/features/home/HomeAccessibility.test.tsx` for hidden visual values, hidden screen-reader output, logical focus, non-color status meaning, and 200% text content availability.

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement deterministic profile-currency conversion and excluded-account results in `src/services/mocks/exchange-rate-service.ts`; verify `src/services/mocks/exchange-rate-service.test.ts`.
- [X] T024 [US1] Add repository queries for active account balance effects, period totals, recent transactions, review count, and sync count in `src/storage/core-finance-repository.ts`; verify the HomeSummary cases in `src/storage/core-finance-repository.test.ts`.
- [X] T025 [US1] Implement `getHomeSummary` in `src/services/mocks/core-finance-service.ts` using T023-T024 and returning no independently stored total; verify `src/services/mocks/core-finance-service.test.ts`.
- [X] T026 [P] [US1] Implement the total, estimate/exclusion, period movement, account-count, and status presentation in `src/features/home/HomeSummary.tsx` using existing sensitive-value and semantic status primitives; verify `src/features/home/HomeScreen.test.tsx`.
- [X] T027 [P] [US1] Implement the approved expense, income, transfer, voice, obligation-payment, and assistant actions without camera/receipt actions in `src/features/home/HomeQuickActions.tsx`; verify action destinations in `src/features/home/HomeQuickActions.test.tsx`.
- [X] T028 [US1] Compose loading, empty, populated, partial, offline, stale, and error states with T026-T027 in `src/features/home/HomeScreen.tsx`; verify `src/features/home/HomeScreen.test.tsx` and `src/features/home/HomeAccessibility.test.tsx`.
- [X] T029 [P] [US1] Add complete Arabic and English Home, estimate, exclusion, review, sync, empty, error, and recovery strings to `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`; verify parity in `src/localization/core-finance-messages.test.ts`.
- [X] T030 [US1] Replace placeholder composition in `app/(tabs)/home.tsx` with `HomeScreen` while preserving assistant, Accounts, Add, voice, and progressive-setup navigation; verify `src/features/home/HomeRoute.test.tsx`.

**Checkpoint**: Home independently communicates the current position within the SC-001 target and passes masking/accessibility checks.

---

## Phase 4: User Story 2 - Find and Correct Transactions (Priority: P1)

**Goal**: Provide a dense, searchable, filterable ledger with trustworthy detail, correction, and timed deletion undo.

**Independent Test**: Use the 500-record fixture to find a known record, combine/remove/clear filters, distinguish every financial meaning and state, open detail, delete and undo within 30 seconds, then verify expiry leaves a marker outside active totals.

### Tests for User Story 2

- [X] T031 [P] [US2] Write failing repository tests for normalized Arabic/English search, all contract filters, deterministic sorting, date grouping inputs, stable cursor paging, and filtered-empty results in `src/storage/core-finance-ledger.test.ts`.
- [X] T032 [P] [US2] Write failing filter-state tests for edit/apply/remove-one/clear-all behavior in `src/state/core-finance-view-state.test.ts`.
- [X] T033 [P] [US2] Extend `src/design-system/components/financial/TransactionRow.test.tsx` with failing dense-data, long-amount, mixed-direction, source/status, combined-announcement, hidden-value, and 200% text cases.
- [X] T034 [P] [US2] Write failing ledger screen tests for loading, first-use empty, filtered-empty, populated, offline, partial, error, end-of-list, active chips, and row navigation in `src/features/transactions/TransactionListScreen.test.tsx`.
- [X] T035 [P] [US2] Write failing filter-modal tests for every filter field, Apply, remove, clear, keyboard behavior, and return-to-origin context in `src/features/transactions/TransactionFilters.test.tsx`.
- [X] T036 [P] [US2] Write failing transaction-detail tests for financial fields, source, relationships, privacy-gated evidence, eligible actions, failed/refund/reversal meaning, and archived references in `src/features/transactions/TransactionDetailScreen.test.tsx`.
- [X] T037 [P] [US2] Write failing delete-service tests for preview, atomic effect removal, persisted 30-second deadline, restart behavior, exactly-once undo, expiry, and deletion marker in `src/services/mocks/core-finance-delete.test.ts`.
- [X] T038 [P] [US2] Extend `src/design-system/components/feedback/TransientFeedback.test.tsx` with failing localized Undo, remaining-time accessibility, expiry, and no-hard-coded-label tests.

### Implementation for User Story 2

- [X] T039 [US2] Implement indexed ledger query, normalized search, filters, deterministic sort, and stable paging in `src/storage/core-finance-repository.ts`; verify `src/storage/core-finance-ledger.test.ts` with 500 fixtures.
- [X] T040 [US2] Implement transient filter editing and committed filter serialization in `src/state/core-finance-view-state.ts`; verify `src/state/core-finance-view-state.test.ts` and keep transaction records out of this store.
- [X] T041 [US2] Harden `src/design-system/components/financial/TransactionRow.tsx` to pass T033 using logical layout, wrapping amounts, semantic labels, global masking, and one combined accessible row announcement.
- [X] T042 [US2] Implement virtualized date-grouped results, active filter chips, state views, paging, retry, and row navigation in `src/features/transactions/TransactionListScreen.tsx`; verify `src/features/transactions/TransactionListScreen.test.tsx`.
- [X] T043 [US2] Implement the full filter form against transient state in `src/features/transactions/TransactionFilters.tsx`; verify `src/features/transactions/TransactionFilters.test.tsx`.
- [X] T044 [US2] Add the filter modal route in `app/modals/transaction-filters.tsx` and preserve the originating ledger context; verify the route assertion in `src/features/transactions/TransactionFilters.test.tsx`.
- [X] T045 [US2] Implement transaction detail fields, status/source semantics, relationships, privacy-gated evidence, and action eligibility in `src/features/transactions/TransactionDetailScreen.tsx`; verify `src/features/transactions/TransactionDetailScreen.test.tsx`.
- [X] T046 [US2] Add the protected detail route in `app/transactions/[id].tsx`, including missing/deleted/error recovery and correct back behavior; verify route coverage in `src/features/transactions/TransactionDetailRoute.test.tsx`.
- [X] T047 [US2] Implement preview/delete/undo/expiry repository and service operations in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify `src/services/mocks/core-finance-delete.test.ts`.
- [X] T048 [US2] Localize and implement timed undo behavior in `src/design-system/components/feedback/TransientFeedback.tsx` without extending deadlines after restart; verify `src/design-system/components/feedback/TransientFeedback.test.tsx`.
- [X] T049 [P] [US2] Add complete Arabic and English ledger, filter, detail, source, status, correction, delete, undo, expiry, empty, and recovery strings to `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`; verify `src/localization/core-finance-messages.test.ts`.
- [X] T050 [US2] Replace `app/(tabs)/transactions.tsx` placeholder with `TransactionListScreen` and wire filter/detail navigation; verify `src/features/transactions/TransactionsRoute.test.tsx`.

**Checkpoint**: User Story 2 independently satisfies SC-003, SC-004, and the delete/undo clarification against the 500-record fixture.

---

## Phase 5: User Story 3 - Record Money Manually (Priority: P1)

**Goal**: Provide amount-first expense, income, transfer, refund, and obligation-payment entry with durable drafts, atomic effects, offline save, and explicit conflict resolution.

**Independent Test**: Complete every supported manual type, fail validation without data loss, resume/discard a draft, block same-account transfer, save offline, prevent duplicate submit, and resolve each conflict choice without silent overwrite.

### Tests for User Story 3

- [X] T051 [P] [US3] Write failing form-schema tests for type-specific required/optional fields, amount parsing, same-account transfer, refund relationship, archived selections, and localized field issues in `src/features/transactions/transaction-form-schema.test.ts`.
- [X] T052 [P] [US3] Write failing durable-draft repository tests for save/update/resume/discard, validation recovery, app restart, and clear-only-after-commit behavior in `src/storage/core-finance-drafts.test.ts`.
- [X] T053 [P] [US3] Write failing mutation tests for expense, income, and obligation-payment balance effects, operation idempotency, rollback, offline pending, and query scopes in `src/services/mocks/core-finance-manual-entry.test.ts`.
- [X] T054 [P] [US3] Write failing transfer/refund tests for two-account atomicity, fee semantics, currency estimate, original relationship, partial refund, and no income/expense inflation in `src/services/mocks/core-finance-transfer-refund.test.ts`.
- [X] T055 [P] [US3] Write failing sync-conflict tests for preserved snapshots, dismissal, keep-local, keep-later, keep-both, failed resolution, and return to pending sync in `src/services/mocks/core-finance-conflict.test.ts`.
- [X] T056 [P] [US3] Write failing amount-first form tests for conditional fields, validation focus, preserved values, pending-submit disable, keyboard-safe save, and success feedback in `src/features/transactions/TransactionForm.test.tsx`.
- [X] T057 [P] [US3] Write failing navigation-guard tests for empty draft, Keep Editing, explicit Discard, route interruption, and restored draft in `src/features/transactions/useTransactionDraftGuard.test.tsx`.
- [X] T058 [P] [US3] Write failing account-picker tests for search, duplicate-name disambiguation, current selection, empty results, long labels, and archived restrictions in `src/features/transactions/AccountPicker.test.tsx`.
- [X] T059 [P] [US3] Write failing category-picker tests for search, recent/favorite ordering, hierarchy, current selection, empty results, and archived restrictions in `src/features/transactions/CategoryPicker.test.tsx`.
- [X] T060 [P] [US3] Write failing conflict comparison UI tests for masked values, changed fields, three explicit choices, dismissal without resolution, and safe errors in `src/features/transactions/SyncConflictScreen.test.tsx`.

### Implementation for User Story 3

- [X] T061 [US3] Implement transaction form schemas and field-to-localization issue mapping in `src/features/transactions/transaction-form-schema.ts`; verify `src/features/transactions/transaction-form-schema.test.ts`.
- [X] T062 [US3] Implement durable draft create/update/load/discard methods in `src/storage/core-finance-repository.ts`; verify `src/storage/core-finance-drafts.test.ts`.
- [X] T063 [US3] Implement atomic manual expense, income, and obligation-payment mutations with idempotent operation IDs and offline pending status in `src/services/mocks/core-finance-service.ts`; verify `src/services/mocks/core-finance-manual-entry.test.ts`.
- [X] T064 [US3] Implement atomic transfer and linked refund mutations in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify `src/services/mocks/core-finance-transfer-refund.test.ts`.
- [X] T065 [US3] Implement conflict read/resolve operations that preserve both snapshots until explicit choice in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify `src/services/mocks/core-finance-conflict.test.ts`.
- [X] T066 [US3] Implement amount-first type switching, fields, validation focus, durable draft updates, pending disable, and save feedback in `src/features/transactions/TransactionForm.tsx`; verify `src/features/transactions/TransactionForm.test.tsx`.
- [X] T067 [US3] Implement the meaningful-draft navigation guard in `src/features/transactions/useTransactionDraftGuard.ts`; verify `src/features/transactions/useTransactionDraftGuard.test.tsx`.
- [X] T068 [US3] Implement the searchable account selector UI in `src/features/transactions/AccountPicker.tsx` and route wrapper in `app/modals/account-picker.tsx`; verify `src/features/transactions/AccountPicker.test.tsx`.
- [X] T069 [US3] Implement the searchable recent/favorite/hierarchical category selector in `src/features/transactions/CategoryPicker.tsx` and route wrapper in `app/modals/category-picker.tsx`; verify `src/features/transactions/CategoryPicker.test.tsx`.
- [X] T070 [US3] Implement masked local/later comparison and explicit keep-local/keep-later/keep-both actions in `src/features/transactions/SyncConflictScreen.tsx` and `app/modals/sync-conflict.tsx`; verify `src/features/transactions/SyncConflictScreen.test.tsx`.
- [X] T071 [P] [US3] Add complete Arabic and English manual-entry, draft, validation, transfer, refund, offline, sync, and conflict strings to `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`; verify `src/localization/core-finance-messages.test.ts`.
- [X] T072 [US3] Replace `app/(tabs)/add.tsx` placeholder with `TransactionForm`, wire picker/conflict routes, and restore an existing draft; verify `src/features/transactions/AddRoute.test.tsx`.

**Checkpoint**: User Story 3 independently satisfies SC-002 and SC-006 with no lost draft, duplicate write, partial financial effect, or silent conflict resolution.

---

## Phase 6: User Story 4 - Manage Financial Accounts (Priority: P2)

**Goal**: Provide account list, detail, create/edit, archive, default, adjustment, search, and selection behavior while keeping current balance ledger-derived.

**Independent Test**: Manage every account type with duplicate names, multiple currencies, credit limits, archived/default states, historical activity, and an adjustment; displayed balance must always equal opening balance plus posted effects.

### Tests for User Story 4

- [X] T073 [P] [US4] Write failing account service tests for create/update, one active default, duplicate names, currency lock after activity, archive impact/confirmation, restore, adjustment transaction, and affected query scopes in `src/services/mocks/core-finance-accounts.test.ts`.
- [X] T074 [P] [US4] Extend `src/design-system/components/financial/BalanceAccountCards.test.tsx` with failing AccountCard tests for type, masked identifier, currency, derived balance, available credit, default/archive text, hidden values, and 200% text.
- [X] T075 [P] [US4] Write failing account-list tests for loading, empty, active/archived, search, duplicate names, long labels, totals, add action, and retry in `src/features/accounts/AccountListScreen.test.tsx`.
- [X] T076 [P] [US4] Write failing account-form tests for every type, conditional credit fields, bilingual validation messages, default toggle, preserved values, pending disable, and currency lock in `src/features/accounts/AccountForm.test.tsx`.
- [X] T077 [P] [US4] Write failing account-detail tests for derived/current/available balances, recent activity, income/expense summary, report link, edit, archive, adjustment, transfer, hidden values, and archived state in `src/features/accounts/AccountDetailScreen.test.tsx`.

### Implementation for User Story 4

- [X] T078 [US4] Implement account create/update/default/archive/restore/adjustment operations in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify `src/services/mocks/core-finance-accounts.test.ts`.
- [X] T079 [US4] Harden `src/design-system/components/financial/AccountCard.tsx` for available credit, default/archive semantics, global masking, logical layout, and combined accessibility; verify `src/design-system/components/financial/BalanceAccountCards.test.tsx`.
- [X] T080 [US4] Implement searchable active/archived account totals, states, and add/detail navigation in `src/features/accounts/AccountListScreen.tsx`; verify `src/features/accounts/AccountListScreen.test.tsx`.
- [X] T081 [US4] Implement type-aware create/edit fields, validation, default selection, currency lock, and pending behavior in `src/features/accounts/AccountForm.tsx`; verify `src/features/accounts/AccountForm.test.tsx`.
- [X] T082 [US4] Implement account detail summary, recent records, actions, archive impact, and adjustment preview in `src/features/accounts/AccountDetailScreen.tsx`; verify `src/features/accounts/AccountDetailScreen.test.tsx`.
- [X] T083 [US4] Replace `app/accounts/index.tsx` placeholder and add `app/accounts/new.tsx` using the account list/form features with protected-route and back behavior; verify `src/features/accounts/AccountRoutes.test.tsx`.
- [X] T084 [US4] Add protected `app/accounts/[id]/index.tsx` and `app/accounts/[id]/edit.tsx` routes with missing/archived/error recovery; verify `src/features/accounts/AccountRoutes.test.tsx`.
- [X] T085 [P] [US4] Add complete Arabic and English account type, list, form, detail, credit, default, archive, adjustment, empty, and error strings to `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`; verify `src/localization/core-finance-messages.test.ts`.
- [X] T086 [US4] Add an account journey integration test covering create, select, adjust, archive, historical visibility, and Home/ledger query invalidation in `src/features/accounts/AccountJourney.test.tsx`; verify only that test file.

**Checkpoint**: User Story 4 independently manages accounts without directly overwriting current balance or losing historical context.

---

## Phase 7: User Story 5 - Organize Transactions with Categories (Priority: P2)

**Goal**: Provide searchable system/custom categories, bilingual creation/editing, hierarchy, favorites, archive, and atomic merge.

**Independent Test**: Create and edit a bilingual custom category, search/favorite/select hierarchy, reject a cycle, archive/restore, preview an in-use merge, then verify every source transaction uses the target and only the target remains selectable.

### Tests for User Story 5

- [X] T087 [P] [US5] Write failing category service tests for system/custom rules, bilingual labels, duplicate sibling handling, hierarchy cycles, favorite, archive/restore, merge impact, atomic reclassification, source marker, and query scopes in `src/services/mocks/core-finance-categories.test.ts`.
- [X] T088 [P] [US5] Write failing category-list tests for loading, empty custom section, system hierarchy, search, favorite/recent order, active/archived states, long labels, add, and retry in `src/features/categories/CategoryListScreen.test.tsx`.
- [X] T089 [P] [US5] Write failing category-form tests for Arabic/English labels, parent selection, icon/color secondary meaning, validation preservation, pending disable, and edit behavior in `src/features/categories/CategoryForm.test.tsx`.
- [X] T090 [P] [US5] Write failing category-detail tests for usage count, archive impact, restore, merge target search, explicit confirmation, failure rollback, and merged-source state in `src/features/categories/CategoryDetailScreen.test.tsx`.
- [X] T091 [P] [US5] Extend `src/features/transactions/CategoryPicker.test.tsx` with failing post-merge behavior proving the source disappears, target remains selected, and historical records display the target label.

### Implementation for User Story 5

- [X] T092 [US5] Implement category create/update/favorite/archive/restore and cycle validation in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify non-merge cases in `src/services/mocks/core-finance-categories.test.ts`.
- [X] T093 [US5] Implement impact preview and atomic category merge/reclassification with `mergedIntoId` in `src/services/mocks/core-finance-service.ts` and `src/storage/core-finance-repository.ts`; verify merge and rollback cases in `src/services/mocks/core-finance-categories.test.ts`.
- [X] T094 [US5] Implement searchable hierarchy, favorites/recent, active/archived sections, states, and add/detail navigation in `src/features/categories/CategoryListScreen.tsx`; verify `src/features/categories/CategoryListScreen.test.tsx`.
- [X] T095 [US5] Implement bilingual labels, parent selection, named icon/color personalization, validation, and pending behavior in `src/features/categories/CategoryForm.tsx`; verify `src/features/categories/CategoryForm.test.tsx`.
- [X] T096 [US5] Implement usage summary, archive/restore impact, merge target selection, explicit confirmation, and merged-source result in `src/features/categories/CategoryDetailScreen.tsx`; verify `src/features/categories/CategoryDetailScreen.test.tsx`.
- [X] T097 [US5] Add protected `app/categories/index.tsx` and `app/categories/new.tsx` routes with correct origin/back behavior; verify `src/features/categories/CategoryRoutes.test.tsx`.
- [X] T098 [US5] Add protected `app/categories/[id].tsx` route with missing/archived/merged/error recovery; verify `src/features/categories/CategoryRoutes.test.tsx`.
- [X] T099 [US5] Update `src/features/transactions/CategoryPicker.tsx` to refresh selection after archive/merge and exclude merged sources; verify `src/features/transactions/CategoryPicker.test.tsx`.
- [X] T100 [P] [US5] Add complete Arabic and English category hierarchy, favorite, archive, restore, merge impact, confirmation, empty, and error strings to `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`; verify `src/localization/core-finance-messages.test.ts`.
- [X] T101 [US5] Add a category journey integration test covering create, favorite, select, merge, historical reclassification, and selector/Home/ledger invalidation in `src/features/categories/CategoryJourney.test.tsx`; verify only that test file.

**Checkpoint**: User Story 5 independently manages categories and proves merge is atomic, explicit, and reflected everywhere.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Prove the complete SPEC-004 system without expanding feature scope.

- [X] T102 [P] Add a cross-story financial invariant test for Home/account/ledger consistency after create, transfer, refund, adjustment, delete/undo, archive, merge, offline save, and conflict resolution in `src/features/core-finance/CoreFinanceJourney.test.tsx`.
- [X] T103 [P] Complete Arabic/English key parity, no-hard-coded-string, and mixed-direction financial formatting coverage in `src/localization/core-finance-messages.test.ts` and `src/utils/format-financial-value.test.ts`.
- [X] T104 [P] Add cross-story accessibility coverage for combined announcements, 44-by-44 targets, logical focus, hidden values, non-color meaning, and 200% text in `src/features/core-finance/CoreFinanceAccessibility.test.tsx`.
- [X] T105 [P] Add a deterministic 500-record paging/filter benchmark and no-duplicate/no-omission assertions in `src/storage/core-finance-performance.test.ts`; verify the 300 ms target on the supported development test environment without using a flaky single-sample assertion.
- [X] T106 Extend `scripts/check-core-finance-boundaries.mjs` with the final implemented route/feature paths and add regression fixtures inside `scripts/check-core-finance-boundaries.test.mjs`; verify `node scripts/check-core-finance-boundaries.test.mjs` and `npm run check:core-finance`.
- [X] T107 Run all static and automated commands from `specs/004-core-finance/quickstart.md`, fix only SPEC-004 failures, and record command versions/results in `specs/004-core-finance/validation-results.md`.
- [ ] T108 Execute Android quickstart scenarios on a development build, including offline, keyboard, app restart during undo, hidden app-switcher preview, 200% text, RTL/LTR, light/dark, reduced motion, and TalkBack; record device/version and pass/fail evidence in `specs/004-core-finance/validation-results.md`.
- [ ] T109 Execute iOS quickstart scenarios on macOS/Xcode for platform parity, VoiceOver, safe areas, keyboard, lifecycle, RTL/LTR, themes, and 200% text; record evidence or leave this task unchecked with the exact environment blocker in `specs/004-core-finance/validation-results.md`.
- [ ] T110 Re-run the complete stop-condition review in `specs/004-core-finance/quickstart.md` and mark SPEC-004 ready only when `specs/004-core-finance/validation-results.md` contains no silent/partial financial change, privacy exposure, conflict overwrite, misleading estimate, or accessibility failure.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 Setup**: Starts immediately. T002 depends on T001; T003 and T004 may run in parallel.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks every user story. Follow each test task with its named implementation task.
- **US1-US5**: Depend on Phase 2. They are independently testable, but sequential execution is recommended for one lower-cost model to avoid concurrent edits to shared service, repository, and localization files.
- **Phase 8 Polish**: Depends on every user story selected for release; T107-T110 run in order.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Home (MVP)
                    -> US2 Ledger and correction
                    -> US3 Manual entry and conflicts
                    -> US4 Accounts
                    -> US5 Categories

US1 + US2 + US3 + US4 + US5 -> Cross-cutting verification
```

### User Story Dependencies

- **US1**: Uses foundational account/transaction fixtures and services; no other story UI required.
- **US2**: Uses foundational ledger/repository; no Home or manual-entry UI required.
- **US3**: Uses foundational accounts/categories as selectable data; full US4/US5 management UI is not required.
- **US4**: Uses foundational ledger effects; US1-US3 screens are not required for account management tests.
- **US5**: Uses foundational transaction references; US1-US4 screens are not required for category management tests.

### Within Each User Story

1. Write the named failing tests.
2. Implement repository/service behavior before feature UI.
3. Implement shared component hardening before screen composition.
4. Add route wrappers after feature tests pass.
5. Add both language catalogs before the story checkpoint.
6. Run the story's independent test and all previously completed story tests.

## Parallel Opportunities

- **Setup**: T003 and T004 can run in parallel after T001-T002 ownership is clear.
- **Foundation**: T005, T007, T009, T011, T013, T015, and T017 target different test/contract files, but their implementations should land in task order.
- **US1**: T019-T022 are parallel test files; T026, T027, and T029 are separate implementation files after services are ready.
- **US2**: T031-T038 are parallel test files; T041, T043, T045, and T049 are separate implementation files after repository behavior is ready.
- **US3**: T051-T060 are parallel test files; T068-T071 are separate UI/localization files after mutation behavior is ready.
- **US4**: T073-T077 are parallel test files; T079-T081 and T085 are separate implementation files after account service behavior is ready.
- **US5**: T087-T091 are parallel test files; T094-T096 and T100 are separate implementation files after category service behavior is ready.
- **Polish**: T102-T105 are independent verification files and can run in parallel.

## Parallel Execution Examples

### User Story 1

Run T019, T020, T021, and T022 in parallel; then execute T023-T030 in order except T026, T027,
and T029 may be assigned separately after T025.

### User Story 2

Run T031-T038 in parallel; complete T039-T040; then T041, T043, T045, and T049 may proceed in
parallel before route and delete integration tasks finish.

### User Story 3

Run T051-T060 in parallel; execute T061-T067 in order; then T068-T071 may proceed in parallel
before T072 integrates the Add route.

### User Story 4

Run T073-T077 in parallel; execute T078; then T079-T081 and T085 may proceed in parallel before
T082-T084 and T086 complete the journey.

### User Story 5

Run T087-T091 in parallel; execute T092-T093; then T094-T096 and T100 may proceed in parallel
before T097-T099 and T101 complete the journey.

## Implementation Strategy

### MVP First

1. Complete T001-T018.
2. Complete T019-T030 for US1.
3. Stop and validate the Home checkpoint on real empty/populated/hidden/multi-currency fixtures.
4. Do not begin another story until US1 and all foundation tests pass.

### Incremental Delivery

1. Foundation + US1: trustworthy Home MVP.
2. Add US2: discoverable and correctable ledger.
3. Add US3: universal manual/offline capture.
4. Add US4: full account management.
5. Add US5: full category management.
6. Complete T102-T110 before claiming SPEC-004 complete.

### Lower-Cost Model Execution Rules

- Execute tasks strictly by ID unless the task is explicitly marked `[P]` and assigned to a separate worker.
- Read the named test, contract section, and data-model entity before editing the implementation file.
- Do not combine adjacent tasks, rename planned files, add dependencies, or broaden SPEC-004 scope.
- After each task, run its exact narrow verification and keep the checkbox unchecked if it fails.
- Preserve unrelated dirty-worktree changes and never rewrite earlier migrations.
- Stop at each checkpoint and report the first failing command with its relevant output.

### 2026-09-05 Category Usage

- [x] Add mock/live preview parity and changed-count rejection.
- [x] Keep system categories out of lifecycle mutations.
- [x] Reclassify local transaction history atomically during merge.
