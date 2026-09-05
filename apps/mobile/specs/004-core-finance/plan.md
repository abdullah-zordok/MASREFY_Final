# Implementation Plan: Home, Accounts, Transactions, and Categories

**Branch**: `004-core-finance` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-core-finance/spec.md`

## Summary

Replace the Home, Transactions, Add, and Accounts placeholders with one ledger-centered daily
finance experience. Extend the existing SQLite boundary with accounts, categories,
transactions, durable drafts, correction history, currency estimates, and sync conflicts.
Expose this data through typed services coordinated by TanStack Query, while Zustand remains
limited to transient filters and existing preferences. Reuse the current design system,
localization, privacy, navigation, form, and feedback primitives. No new dependency is required.

## Technical Context

**Language/Version**: TypeScript 5.3.3, React 18.2, React Native 0.74.5

**Primary Dependencies**: Expo SDK 51, Expo Router 3.5, Expo SQLite 14, TanStack Query 5,
Zustand 4, React Hook Form 7, Zod 3, i18next 23, React Native Safe Area Context, and the
existing Masarifi design system

**Storage**: Existing versioned SQLite database for accounts, categories, transactions,
drafts, deletion markers, currency-rate fixtures, and sync conflicts; existing preference
storage remains the owner of locale, theme, hidden balances, and profile currency

**Testing**: Jest and React Native Testing Library for money arithmetic, balance derivation,
mutations, validation, filtering, category merge, deletion undo, currency estimates, conflict
resolution, query invalidation, RTL/LTR, masking, and accessibility; Android development build
for keyboard, lifecycle, offline, TalkBack, and real-device layout checks; iOS native checks
require macOS/Xcode

**Target Platform**: Android API 23+ with target API 34; iOS versions supported by Expo SDK 51;
portrait phones down to 320 by 568 logical pixels and adaptive tablets

**Project Type**: Shared Expo and React Native mobile application

**Performance Goals**: Render the first useful local Home or ledger state within 1 second after
hydration; return the first page or a changed filter result within 300 ms for the required
500-record fixture; preserve 60 frames per second during ordinary list scrolling and entry

**Constraints**: Frontend-only typed mocks; integer minor-unit money; one durable ledger owner;
no production secrets, provider calls, or real exchange rates; offline manual entry; no silent
financial overwrite; Arabic RTL and English LTR parity; 200% text scaling; 44 by 44 minimum
targets; no camera, receipt, tracking-engine, or voice-analysis implementation in this spec

**Scale/Scope**: Five user journeys, four primary route replacements plus account, transaction,
and category secondary routes; seven account types; nineteen default category groups; at least
500 deterministic transactions across all required types, sources, and sync states

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design: passed.*

- **Financial trust - PASS**: Account balances derive from opening balance plus posted ledger
  effects. Adjustments, transfers, refunds, deletion, merge, and conflict resolution pass through
  one atomic service boundary. Eligible deletion has a 30-second undo and a retained marker;
  automatic records expose source and correction. Sensitive values use the existing global mask.
- **Platform honesty - PASS**: Core account and manual transaction behavior is identical on
  Android and iOS. Android may receive completed automatic records from SPEC-005, while this
  plan adds no SMS claim or permission route on iOS. Manual entry remains available offline and
  after every automation outcome.
- **Language and access - PASS**: Every route and state uses the Arabic and English catalogs,
  locale-aware English-numeral formatters, logical direction, combined screen-reader labels,
  200% text support, reduced motion, contrast-safe semantics, and 44 by 44 targets.
- **Design system - PASS**: Existing BalanceCard, AccountCard, TransactionRow, forms, pickers,
  state views, skeletons, sheets, dialogs, and transient feedback are reused and hardened only
  where a verified feature gap exists. Loading, empty, filtered-empty, error, offline, partial,
  archived, undo, conflict, and sync states are included.
- **Architecture and proof - PASS**: SQLite remains the sole durable ledger owner behind typed
  repositories and services. TanStack Query owns service-shaped reads; Zustand owns only
  transient view state. No client secret or provider integration is introduced. Focused
  automated and native validation is defined in [quickstart.md](quickstart.md).

## Project Structure

### Documentation (this feature)

```text
specs/004-core-finance/
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   `-- core-finance-contract.md
|-- data-model.md
|-- plan.md
|-- quickstart.md
|-- research.md
`-- spec.md
```

### Source Code (`apps/mobile`)

```text
app/
|-- (tabs)/
|   |-- home.tsx
|   |-- transactions.tsx
|   `-- add.tsx
|-- accounts/
|   |-- index.tsx
|   |-- new.tsx
|   `-- [id]/
|       |-- index.tsx
|       `-- edit.tsx
|-- transactions/
|   `-- [id].tsx
|-- categories/
|   |-- index.tsx
|   |-- new.tsx
|   `-- [id].tsx
`-- modals/
    |-- account-picker.tsx
    |-- category-picker.tsx
    `-- transaction-filters.tsx

src/
|-- domain/
|   |-- core-finance.ts
|   `-- core-finance.test.ts
|-- features/
|   |-- home/
|   |-- transactions/
|   |-- accounts/
|   `-- categories/
|-- services/
|   |-- contracts/
|   |   `-- core-finance-service.ts
|   `-- mocks/
|       |-- core-finance-service.ts
|       `-- exchange-rate-service.ts
|-- storage/
|   |-- database.ts
|   `-- core-finance-repository.ts
|-- state/
|   `-- core-finance-view-state.ts
|-- localization/
|   `-- messages/
|       |-- ar.ts
|       `-- en.ts
|-- design-system/
|   `-- components/
`-- test-utils/
    `-- core-finance-fixtures.ts
```

Tests remain beside the domain, repository, service, feature, and route behavior they prove.

**Structure Decision**: Keep Expo Router files thin and follow the existing feature-oriented
`src` layout. Extend the installed SQLite boundary and proven design-system owners instead of
adding a database wrapper, UI kit, list package, form library, or second financial store.

## Implementation Strategy

### Slice 1: Ledger foundation and Home

- Define integer money, exchange estimate, account, category, transaction, draft, correction,
  conflict, filter, and Home-summary contracts.
- Add a forward-only SQLite migration, indexes, repository operations, and deterministic fixtures.
- Derive account balances and Home totals from opening balances plus posted transaction effects.
- Replace Home placeholder content with loading, empty, populated, partial, error, offline,
  estimate, hidden-balance, review, and pending-sync states.

### Slice 2: Transactions and manual entry

- Add indexed, paged transaction search/filter/sort and a virtualized date-grouped ledger.
- Harden the shared TransactionRow for dense data, mixed direction, amount wrapping, source,
  financial meaning, sync status, and one combined accessible announcement.
- Add transaction detail, edit, duplicate-as-draft, refund, report-wrong, and eligible delete.
- Add amount-first expense, income, transfer, refund, and obligation-payment forms with durable
  drafts, validation focus, keyboard-safe save, duplicate-submit protection, and offline pending.

### Slice 3: Accounts and categories

- Replace Accounts placeholder with list, empty, archived, detail, create/edit, adjustment, and
  transfer entry points.
- Add searchable account and category selectors using the existing picker and sheet patterns.
- Add bilingual custom categories, favorites/recent, hierarchy, archive impact, and atomic merge.
- Invalidate only affected Home, ledger, account, and selector query scopes after mutations.

### Slice 4: Corrections, estimates, conflicts, and acceptance

- Implement the 30-second delete undo with a durable deletion marker after expiry.
- Apply mock exchange rates in the profile currency, label estimates, and identify exclusions.
- Preserve local and later versions on sync conflict and require explicit resolution.
- Complete Arabic/English strings and verify privacy, accessibility, themes, text scaling,
  reduced motion, dense data, offline recovery, and all financial invariants.

## Phase 0: Research Outcome

[research.md](research.md) resolves ledger ownership, money representation, storage, state
ownership, atomic mutations, deletion, currency estimates, offline conflicts, indexed lists,
forms, category merge, privacy, and validation strategy. No planning question remains unresolved.

## Phase 1: Design Outcome

- [data-model.md](data-model.md) defines fields, relationships, validation, balance effects, and
  lifecycle transitions for all SPEC-004 entities.
- [contracts/core-finance-contract.md](contracts/core-finance-contract.md) defines route, service,
  mutation, error, privacy, localization, accessibility, and query-invalidation behavior.
- [quickstart.md](quickstart.md) provides runnable checks and native scenarios for every user story.

## Post-Design Constitution Re-check

The Phase 1 artifacts preserve one ledger owner, integer-safe calculations, atomic and reversible
financial changes, explicit conflict resolution, transparent estimates, manual offline fallback,
global masking, Arabic/English parity, semantic design-system reuse, and focused proof. No gate
failed and no exception is required.

## Complexity Tracking

No constitution violation or additional dependency requires justification.

## 2026-09-05 Additive Work

Reuse the current repository count and merge staging for mock/offline behavior;
add one thin authenticated HTTP adapter for the same preview/action contract.
No general Phase 14 provider cutover is part of this change.
