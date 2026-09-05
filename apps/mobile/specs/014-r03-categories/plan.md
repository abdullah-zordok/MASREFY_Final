# Implementation Plan: R03 — Categories

**Branch**: `014-r03-categories` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: R03 specification, approved redesign analysis, implemented category routes/screens/domain/services, mobile constitution, and R01 shared contracts.

## Summary

Redesign the five category surfaces in place with one compact category identity grammar, normalized bilingual virtualized lists, focused bilingual create/edit, explicit archive/restore/merge decisions, and a controlled active-category picker. Preserve routes, category data, allowed duplicate labels, hierarchy validation, archive/merge/reclassification commands, picker callbacks, and downstream flows. Use R01 controls and current core-finance ownership; add no category sync state, usage/recency model, validation rule, route, provider, permission, storage entity, or dependency.

## Technical Context

**Language/Version**: TypeScript 5.3.3 strict mode; React 18.2; React Native 0.74.5

**Primary Dependencies**: Expo SDK 51, Expo Router 3.5, React Query 5.51, Zod 3.23, Expo SQLite 14 through current repository, i18next 23.12, current R01 design system

**Storage**: Existing core-finance category/transaction repository only; no new schema, recency store, or durable category draft

**Testing**: Jest 29/jest-expo, React Native Testing Library 12.5, core-finance/design-system checks, TypeScript, ESLint, Android/iOS development-build validation

**Target Platform**: Existing supported Android and iOS application with identical category capability

**Project Type**: React Native/Expo feature-oriented mobile application with typed repository/service boundaries

**Performance Goals**: Responsive normalized search and native virtualization with 150+ categories; no blocking transaction scan in presentation; brief 100–240 ms motion

**Constraints**: Five routes unchanged; duplicate labels allowed; no fabricated sync/recency/usage/restriction; merge remains existing atomic reclassification; 320×568, 200% text, 44×44, Arabic RTL/English LTR, light/dark, keyboard/safe areas

**Scale/Scope**: Five route surfaces, list/detail/form/picker components, archive/restore/merge decisions, and six downstream category consumer areas

## Constitution Check

*GATE: Passed before Phase 0 research; re-checked after Phase 1 design.*

- **Financial trust — PASS**: Archive/restore/merge name the object/consequence and call existing commands only after confirmation. Presentation never reclassifies transactions or reports success early.
- **Platform honesty — PASS**: Category behavior is shared across Android/iOS with no permission/platform claim or new provider.
- **Language and access — PASS**: Both stored labels and both UI languages are first class; normalized search, mixed direction, 200% text, keyboard, screen-reader semantics, non-color identity/status, reduced motion, and 44×44 targets are planned.
- **Design system — PASS**: R03 consumes R01 grouped rows, icon container, form, PickerField, modal, confirmation, state, token, direction, and motion contracts with no local system.
- **Architecture and proof — PASS**: Existing category domain/service/repository owns validation, hierarchy, lifecycle, merge, persistence, and affected scopes. No duplicate store, rule, provider, or production integration is added.

### Post-Design Re-check

- Research resolved normalized search, density, identity, parent selection, merge, picker ownership, duplicate labels, and missing sync state.
- The specification was corrected to match implemented duplicate and sync behavior.
- Data model contains existing entities and ephemeral UI decision state only.
- UI contract keeps reclassification and caller drafts outside R03 presentation.
- Quickstart validates every screen plus downstream transaction classification.
- No constitution exception remains.

## Project Structure

### Documentation (this feature)

```text
specs/014-r03-categories/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/category-presentation-contract.md
├── checklists/requirements.md
└── tasks.md                              # Created later by /speckit-tasks
```

### Existing Source Code in Scope

```text
app/categories/
├── _layout.tsx
├── index.tsx
├── new.tsx
└── [id].tsx
app/modals/category-picker.tsx

src/
├── features/categories/{CategoryListScreen,CategoryDetailScreen,CategoryForm}.tsx
├── features/transactions/CategoryPicker.tsx
├── features/core-finance/core-finance-queries.ts
├── domain/core-finance.ts
├── services/contracts/core-finance-service.ts
├── services/mocks/core-finance-service.ts
├── storage/core-finance-repository.ts
├── design-system/                         # R01 contracts consumed
├── localization/{i18n,messages/ar,messages/en}.ts
└── test-utils/core-finance-fixtures.ts
```

**Structure Decision**: Keep route wrappers thin and extend existing category screens/picker. Add at most one small category identity projector/row and screen-specific decision composition; do not add a generic category framework, new store, route, or business model.

## Implementation Design

### 1. Shared and Search Prerequisites

- Inventory R03 consumers and R01 public components.
- Reuse existing normalized search helper for Arabic/English labels and stable favorite sorting.
- Define one feature-local typed category identity projection with no usage/recency/sync inference.
- Request any missing shared visual variant from R01 rather than local raw styling.

### 2. Category List

- Replace per-item `SurfaceCard`/button layout with a virtualized grouped category row or accessible compact grid.
- Preserve current management query including archived/merged data, create/detail routes, and favorites.
- Distinguish no custom categories, no search results, loading, mapped error/offline, active/archive/merged, allowed duplicate labels, long mixed text, and missing icon/color.

### 3. Create and Edit

- Recompose bilingual persistent fields, searchable parent/no-parent PickerField, favorite switch, one Save action, keyboard/safe-area support, and local dirty guard.
- Keep current Zod/repository validation and allow duplicate labels.
- Preserve existing icon/color values when the focused form does not edit them.
- Block duplicate Save and map current failure/success without synthetic sync state.

### 4. Category Detail, Archive, Restore, and Merge

- Recompose identity → kind/hierarchy/status → actions.
- Replace immediate archive/restore with named R01 confirmation and working/failure/success state.
- Replace first-target merge shortcut with explicit active-target selection, source/target comparison, existing consequence copy, confirmation, and current command/invalidation.
- Do not calculate usage counts or inspect/rewrite transactions in presentation.

### 5. Category Picker

- Convert to a virtualized active-only searchable picker using the same category identity and R01 modal/container.
- Preserve current selection, favorites-first order, normalized bilingual search, select/cancel callbacks, and optional caller-supported create handoff.
- Keep caller draft/filter application in R04/R05/other owners; add no global selection store.

### 6. Localization, Accessibility, and Integration

- Add localized Arabic/English labels for kind, hierarchy, favorite, status, availability, consequences, confirmations, errors, and actions.
- Validate mixed-direction labels/digits, non-mirrored category icons, mirrored disclosure/back, logical focus, 200% reflow, keyboard, 44×44 targets, reduced motion, and non-color meaning.
- Regress R04/R05/R06/R09/R12/R13 category consumers and transaction reclassification.

## Planned Verification

### Automated

- List normalized search, favorite ordering, no-custom/no-result, 150+, lifecycle, and route tests.
- Form bilingual fields, allowed duplicates, hierarchy/self/cycle validation, parent selection, dirty dismissal, duplicate Save, optional-value preservation, failure.
- Detail missing/lifecycle and archive/restore/merge selection, confirmation, failure, affected-scope, reclassification tests.
- Picker active eligibility/current selection/search/no-result/select/cancel/create-handoff contract tests.
- Localization/accessibility/theme/direction tests and downstream consumer regressions.
- `npm run typecheck`, `npm run lint`, `npm run check:design-system`, `npm run check:core-finance`.

### Visual and Device

- Independently validate Category List, Create, Detail, Edit, Merge Decision, and Picker.
- Cover Arabic/English, light/dark, normal/200%, smallest/larger phone, keyboard, TalkBack/VoiceOver, reduced motion, dense/long/duplicate/mixed data, loading/error/mapped offline states.
- Validate supported Android and iOS device/environment and retain safe evidence only.

## `/tasks` Handoff

Future `tasks.md` MUST be ordered:

1. Shared/category-identity/search prerequisites.
2. Screen: Category List, then tests/device validation/fixes.
3. Screen: Create Category, then tests/device validation/fixes.
4. Screen: Category Detail and lifecycle decisions, then tests/device validation/fixes.
5. Screen: Edit Category, then tests/device validation/fixes.
6. Screen State: Merge Decision, then tests/device validation/fixes.
7. Screen: Category Picker, then tests/device validation/fixes.
8. Cross-consumer/reclassification and final R03 consistency.

Each group names exact files and covers hierarchy, components, styling, interaction/navigation, states, RTL/LTR, accessibility, motion, tests, real-device evidence, and bounded validation fixes.

## Complexity Tracking

No constitution violations or exceptional complexity are planned.

## 2026-09-05 Additive Flow

Detail → usage preview → localized confirmation → archive/merge with the same
count/version → invalidate existing category/transaction/home query scopes.
Preview failure remains on detail with the existing safe error state.
