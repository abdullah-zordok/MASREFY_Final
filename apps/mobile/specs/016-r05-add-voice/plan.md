# Implementation Plan: R05 — Add Transaction and Voice Entry

> **CLOSED / SUPERSEDED (2026-09-11):** Do not execute or depend on this plan. Add remains
> manual-only and Voice remains on Home. Unchecked tasks are cancelled historical backlog.

**Branch**: `016-r05-add-voice` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: R05 specification in `specs/016-r05-add-voice/spec.md`, the approved redesign analysis, the implemented Add/manual/voice flows, R01 shared contracts, and existing core-finance/voice contracts.

## Summary

Redesign the existing center Add tab as one focused capture workspace with a compact Manual/Voice selector, amount-first manual form, and a visible voice lifecycle from permission through exact proposal confirmation. Implementation evolves the existing `TransactionForm`, voice screens, hooks, stores, and adapters in place; consumes R01 presentation plus R02/R03 pickers; creates the same R04 transaction results; and preserves every current draft, validation, permission, confidence, atomic-save, recurring/obligation, privacy-cleanup, route, and downstream financial rule. No new route, provider, permission, persistence entity, or UI dependency is required.

## Technical Context

**Language/Version**: TypeScript 5.3.3 strict mode; React 18.2; React Native 0.74.5

**Primary Dependencies**: Expo SDK 51, Expo Router 3.5, Expo AV 14, React Query 5.51, Zustand 4.5, Zod 3.23, i18next 23.12, existing R01 design-system components and React Native platform APIs

**Storage**: Existing core-finance draft/repository storage and voice category-preference/session stores only; no new persistence or migration

**Testing**: Jest 29 with `jest-expo`, React Native Testing Library 12.5, core-finance and voice boundary checks, TypeScript, ESLint, and Android/iOS development-build validation

**Target Platform**: Existing supported Android and iOS phones through Expo development builds; platform-appropriate microphone permission with equal Manual fallback

**Project Type**: React Native/Expo mobile application with file-based routing and feature-owned typed state/services

**Performance Goals**: Immediate mode/field response; recording feedback remains smooth without blocking controls; proposal review remains usable through the current 10-proposal maximum; no extra capture-route network or startup work; standard motion 100–240 ms and immediate reduced-motion state

**Constraints**: Preserve one Add route and all existing commands; no SMS ownership; no unconfirmed financial record; 60-second current recording maximum; atomic selected-group save; audio/transcript cleanup; offline/manual recovery; 320×568 minimum validation viewport; 44×44 targets; 200% text; Arabic RTL/English LTR; hidden-value and app-switcher privacy

**Scale/Scope**: One owned route with nine independently validated presentation groups: mode selector, manual form, permission, recorder, transcript/processing, single proposal, multiple proposals, recurring/obligation, and completion/recovery

## Constitution Check

*GATE: Passed before Phase 0 research; re-checked after Phase 1 design.*

- **Financial trust — PASS**: Manual validation and voice transcript/proposals remain feature-owned. No record exists before explicit confirmation; uncertainty, selected-group scope, recurring/obligation consequence, local/pending status, and failure recovery are visible.
- **Platform honesty — PASS**: Current Android/iOS microphone adapters remain unchanged, denial always exposes Manual, and R05 makes no Android SMS claim or request.
- **Language and access — PASS**: Contracts require Arabic RTL/English LTR parity, English numerals, bidi-safe financial/date content, 200% text, keyboard/safe-area access, screen-reader state/order, non-color meaning, reduced motion, and 44×44 targets.
- **Design system — PASS**: R05 consumes R01 forms, segments, picker rows, overlays, feedback, Source Mark, formatters, privacy, and semantic tokens; no raw palette, local UI kit, or new dependency is planned.
- **Architecture and proof — PASS**: Existing core-finance and voice domain/service/store owners remain authoritative; presentation adds no provider, secret, parser, duplicate store, or financial rule. Focused boundary, component, state-machine, privacy, and device checks are named.

### Post-Design Re-check

- `research.md` resolves route, state ownership, field hierarchy, uncertainty, group save, development fixtures, and privacy choices without exceptions.
- `data-model.md` documents existing entities and presentation derivations only; it adds no persistence schema.
- `contracts/add-capture-presentation-contract.md` keeps manual/voice callbacks and consequences feature-owned.
- `quickstart.md` validates each screen state independently and includes platform, language, theme, accessibility, privacy, and downstream financial checks.
- No constitution violation requires complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/016-r05-add-voice/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── add-capture-presentation-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                              # Created later by /speckit-tasks
```

### Existing Source Code in Scope

```text
app/
└── (tabs)/add.tsx

src/
├── features/
│   ├── transactions/
│   │   ├── TransactionForm.tsx
│   │   ├── transaction-form-schema.ts
│   │   └── useTransactionDraftGuard.ts
│   └── voice/
│       ├── VoiceCaptureScreen.tsx
│       ├── VoiceRecorder.tsx
│       ├── VoiceReview.tsx
│       ├── VoiceReviewGroup.tsx
│       ├── VoiceRecurringReview.tsx
│       └── useVoiceCapture.ts
├── domain/{core-finance,voice-capture}.ts
├── state/voice-capture.ts
├── services/
│   ├── contracts/{core-finance-service,voice-capture-service}.ts
│   ├── platform/voice-recorder-service.ts
│   └── mocks/{core-finance-service,voice-analyzer-service,voice-category-service,voice-obligation-service}.ts
├── storage/{core-finance-repository,voice-category-preference-repository}.ts
├── design-system/                         # R01 public contracts; consume only
├── localization/messages/{ar,en}.ts
└── test-utils/{core-finance-fixtures,voice-capture-fixtures}.ts
```

**Structure Decision**: Keep the current route and feature-oriented split. Extend the existing screen component that owns each visible state; keep state transitions in current domain/hooks/stores and mutations in current service/repository contracts. Add only bounded screen-specific presentation helpers when one existing file would otherwise mix distinct manual, permission, recording, transcript, proposal, or result responsibilities.

## Implementation Design

### 1. Shared Contract Adoption

- Inventory current manual/voice consumers before changing props.
- Adopt R01 semantic surfaces, amount/date formatting, FormField, segmented selection, PickerField, state feedback, overlays, privacy, and motion.
- Adopt R02/R03 picker return contracts without moving eligibility or selection data into R05.
- Reuse R04 Source Mark and confirmed-result navigation; do not redesign the ledger here.

### 2. Add Mode and Route Context

- Replace two competing full buttons with the R01 small mutually exclusive control while retaining labels, selected state, current route params, and Add-tab identity.
- Centralize mode-switch intent at the route boundary but delegate draft/session handling to existing owners.
- Keep current Home/account/onboarding/tracking entry contexts and safe return behavior.
- Gate representative demo scenarios with the existing development flag; retain fixtures/tests without exposing them as normal capture hierarchy.

### 3. Manual Capture Screen

- Recompose `TransactionForm` amount-first and replace inline account/category lists with R02/R03 picker rows.
- Use compact supported-type selection and show destination/category/relationship fields only when current type requires them.
- Keep the current schema, draft persistence/restore/discard, operation IDs, affected-scope invalidation, validation mapping, and result route.
- Add truthful UI variants for dependency loading/error, validation, keyboard, local/pending save, synchronized success, failure, and existing conflict recovery only where supplied.

### 4. Voice Permission and Recorder

- Recompose permission education from current permission state and localized copy; invoke only existing request/settings/manual/cancel commands.
- Recompose Ready/Recording with state text, elapsed time, Start/Stop/Cancel, maximum warning, and decorative activity hidden from accessibility.
- Keep the existing platform recorder adapter, current duration limit, interruption mapping, and lifecycle cleanup.

### 5. Transcript and Processing

- Present one focused transcript editor with Analyze, re-record, Manual, and cancel paths.
- Use bounded loading content for stopping/transcribing/analyzing and preserve current transcript/session data through failure.
- Map no-speech, noise, unsupported language, offline, interruption, analysis, and unknown errors to existing localized recoveries without raw provider detail.

### 6. Single Proposal Review

- Recompose `VoiceReview` to the shared manual field hierarchy.
- Replace long inline lists with compact type/payment choices and R02/R03 pickers.
- Present each assessment beside its field with reason and required action; retain confidence rules and callbacks.
- Keep category preference, transfer, date, and optional-field semantics unchanged.

### 7. Multiple Proposals

- Give each proposal a concise identity/selection header and sequential field content without nested visual-card noise.
- Show selected/total scope in group actions and keep current selection, edit, remove, Confirm selected/all, re-record, and atomic save commands.
- Preserve the full group on validation/save failure and block duplicate actions while saving.

### 8. Recurring, Obligation, Result, and Recovery

- Present one-time/recurring/existing/new-obligation decisions with supplied consequences; keep R10 handoff and command ownership.
- Use persistent affected-surface/result state plus transient feedback for confirmed save; distinguish local/pending from synchronized only when supplied.
- On cancel/re-record/save, verify current audio/transcript cleanup and protect app-switcher/accessibility/evidence output.

### 9. Localization, Accessibility, and Motion

- Add only localized Arabic/English keys; no hard-coded product copy.
- Validate mode/type controls, financial runs, mixed content, live recording status, proposal focus, and group actions in both directions.
- Ensure 200% text reflow, 44×44 targets, keyboard reachability, safe areas, concise live announcements, and visible alternatives to motion/haptics.
- Use short state transitions only; no animated amount counting, input shaking, bounce, or celebratory interruption.

## Planned Verification

### Automated

- Route/mode and manual form/draft guard tests.
- Manual validation, transfer/category/account relationship, result, and affected-scope regression.
- Permission mapping, recorder lifecycle/duration/interruption, transcript edit/recovery, assessment thresholds, required-field blocking, category preference, multi-proposal sibling stability, atomic save, recurring/obligation confirmation, and cleanup tests.
- Arabic/English localization parity, 200% layout/accessibility semantics, hidden-value/privacy, reduced-motion, and development-fixture visibility tests.
- `npm run typecheck`, `npm run lint`, `npm run check:design-system`, `npm run check:core-finance`, and `npm run check:voice-capture`.

### Visual and Device

- Validate each of the nine screen/state groups independently before advancing.
- Cover Arabic RTL/English LTR, light/dark, normal/200% text, smallest/larger phone, keyboard, screen reader, reduced motion, hidden values, offline, and applicable permission state.
- Use a supported physical Android device for native permission/recording/settings/background checks and an iOS device/approved environment for equivalent microphone/VoiceOver behavior.
- Record safe evidence and route defects to the owning R01/R02/R03/R04/R05/R10 contract rather than adding local workarounds.

## `/tasks` Handoff

Future `tasks.md` MUST follow this order:

1. Shared R01/R02/R03/R04 prerequisites.
2. Screen: Add Mode and Manual Form, then tests/device validation/fixes.
3. Screen State: Voice Permission, then validation/fixes.
4. Screen State: Voice Ready and Recording, then validation/fixes.
5. Screen State: Transcript and Processing, then validation/fixes.
6. Screen State: Single Proposal Review, then validation/fixes.
7. Screen State: Multiple Proposal Review, then validation/fixes.
8. Screen State: Recurring and Obligation Decision, then validation/fixes.
9. Screen State: Completion and Recovery, then validation/fixes.
10. Cross-state privacy, financial-effect, origin/return, and R05 consistency regression.

Every group must name exact files and include hierarchy, shared/screen components, styling, interactions, states, RTL/LTR, accessibility, motion, tests, real-device validation, and bounded fixes discovered during validation.

## Complexity Tracking

No constitution violations or exceptional complexity are planned.
