# Tasks: R05 — Add Transaction and Voice Entry

> **CLOSED / SUPERSEDED (2026-09-11):** Do not execute these tasks or treat them as active
> dependencies. Add remains manual-only and Voice remains on Home. Unchecked tasks are cancelled,
> not completed.

**Input**: Design documents in `specs/016-r05-add-voice/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/add-capture-presentation-contract.md`, `quickstart.md`

**Organization**: Work is screen-first. Shared R01/R02/R03/R04 adoption appears once, followed by Add Mode, Manual Form, Voice Permission, Ready/Recording, Transcript/Processing, Single Proposal, Multiple Proposals, Recurring/Obligation, and Completion/Recovery. Each group is tested and device-reviewed before the next.

**Tests**: Mandatory under the specification and constitution. Tests precede implementation and prove no unconfirmed financial change, draft/session preservation, permission mapping, confidence thresholds, atomic save, privacy cleanup, localization, accessibility, and current route/command behavior.

## Format: `[ID] [P?] [Story?] Description with exact file path`

- **[P]**: May run in parallel only after prerequisites and only across different files.
- **[US1]–[US7]**: Maps work to the seven R05 user stories.
- Baseline, Shared Foundation, and Final Gate tasks have no story label.

---

## Phase 1: Baseline and Scope Lock

**Purpose**: Capture current Add/manual/voice state ownership, entry contexts, commands, and privacy lifecycle before visual work.

- [ ] T001 Inventory the Add route params/origins, manual draft owner, every voice state/callback, R02/R03 picker boundary, R04 result path, R10 obligation handoff, and current demo-fixture exposure named in `specs/016-r05-add-voice/plan.md`; record exact files and behavior in `specs/016-r05-add-voice/validation/baseline.md`.
- [ ] T002 Run the automated baseline from `specs/016-r05-add-voice/quickstart.md` and record command, date, suite/test counts, current platform permission states, and pre-existing failures in `specs/016-r05-add-voice/validation/baseline.md` without modifying production code.
- [ ] T003 Create the evidence index with Shared Foundation, Add Mode, Manual Form, Permission, Ready/Recording, Transcript/Processing, Single Proposal, Multiple Proposals, Recurring/Obligation, Completion/Recovery, Android, iOS, and final regression sections in `specs/016-r05-add-voice/validation/README.md`.

**Checkpoint**: One Add route, all current commands/state owners, and no-mutation-before-confirmation behavior are documented.

---

## Phase 2: Shared Add and Voice Foundation

**Purpose**: Adopt approved shared contracts without creating another form, picker, state store, provider, or parser.

- [ ] T004 [P] Add failing route-contract tests for one Add route, current mode/type/account/origin params, Home/account/onboarding/tracking entries, R04 result destination, protected deep links, and no competing global Add action in `src/features/transactions/AddRoute.test.tsx` and `src/features/voice/VoiceCaptureRoute.test.tsx`.
- [ ] T005 [P] Add failing shared field-hierarchy tests proving manual and voice proposal use the same type/amount/title/account/category-or-destination/date/relationship order without sharing business state in `src/features/transactions/TransactionForm.test.tsx` and `src/features/voice/VoiceReview.test.tsx`.
- [ ] T006 Define the shared presentation-only field ordering through existing props/components in `src/features/transactions/TransactionForm.tsx` and `src/features/voice/VoiceReview.tsx`, reusing R01 controls and keeping manual/voice validation and callbacks in their current owners.
- [ ] T007 [P] Add failing R02/R03 picker-return tests proving account/category select/cancel preserves manual and voice drafts, type, scroll/focus context, and caller-owned eligibility in `src/features/transactions/AccountPicker.test.tsx`, `src/features/transactions/CategoryPicker.test.tsx`, and `src/features/voice/VoiceReview.test.tsx`.
- [ ] T008 [P] Add failing development-fixture visibility tests proving representative capture scenarios are available only under the existing development gate and never become normal production hierarchy in `src/features/transactions/AddRoute.test.tsx` and `src/features/voice/VoiceCaptureScreen.test.tsx`.
- [X] T009 Keep existing fixtures behind the current development flag in `app/(tabs)/add.tsx` and `src/test-utils/voice-capture-fixtures.ts`, adding no runtime configuration or production provider path.
- [ ] T010 Add complete English and Arabic mode/form/permission/recording/transcript/assessment/group/recurring/obligation/result/recovery keys required by R05 to `src/localization/messages/en.ts` and `src/localization/messages/ar.ts`, preserving identical parameters, English numerals, and no hard-coded feature copy.
- [ ] T011 Run T004–T010 plus `npm run typecheck`, `npm run check:design-system`, `npm run check:core-finance`, and `npm run check:voice-capture`; record results and approved shared-prop migrations in `specs/016-r05-add-voice/validation/shared-foundation.md`.
- [ ] T012 Fix only Shared Add/Voice Foundation defects from T011 in the named R05/R01/R02/R03/R04 owner, rerun focused checks, and update `specs/016-r05-add-voice/validation/shared-foundation.md`.

**Checkpoint**: Current state/command owners remain intact and every visible group can consume the approved shared contracts.

---

## Phase 3: Screen — Add Mode Selector (User Story 1, Priority P1) 🎯 MVP Entry

**Goal**: Orient the user with one compact Manual/Voice choice while preserving all origin, prefill, draft, and session behavior.

**Independent Test**: Enter Add from every supported origin, switch modes with empty/meaningful work, recover from unavailable Voice, and verify route context and no financial mutation.

- [ ] T013 [P] [US1] Add failing mode-selector tests for exactly one selected mode, current route-selected default, non-color selection, Home type shortcuts, account transfer prefill, onboarding/tracking origin, protected deep link, Voice unavailable fallback, meaningful manual draft, live voice session, and cancel/leave behavior in `src/features/transactions/AddRoute.test.tsx` and `src/features/voice/VoiceCaptureRoute.test.tsx`.
- [ ] T014 [US1] Replace competing full-size mode buttons with the R01 compact mutually exclusive control in `app/(tabs)/add.tsx`, retaining labels, selected state, center-tab identity, and current route params.
- [ ] T015 [US1] Centralize only mode-switch intent in `app/(tabs)/add.tsx`; delegate meaningful manual draft decisions to `src/features/transactions/useTransactionDraftGuard.ts` and live voice session decisions to `src/features/voice/useVoiceCapture.ts` without discarding state at the route.
- [ ] T016 [US1] Preserve every current Add entry, type/account prefill, origin context, safe return, and protected navigation outcome in `app/(tabs)/add.tsx`; prove unchanged destinations in `src/features/transactions/AddRoute.test.tsx`.
- [ ] T017 [US1] Keep Manual immediately available when Voice is denied, unavailable, failed, or unwanted in `app/(tabs)/add.tsx` and `src/features/voice/VoiceCaptureScreen.tsx`, with no permission request or transaction creation triggered by selecting the mode alone.
- [ ] T018 [US1] Add Arabic RTL/English LTR mode labels/state, light/dark, 200% wrapping, logical order, keyboard/screen-reader selected state, 44×44, and reduced-motion assertions to `src/features/transactions/AddRoute.test.tsx` and localization files.
- [ ] T019 [US1] Run Add Mode route/session tests and record exact results in `specs/016-r05-add-voice/validation/add-mode.md`.
- [ ] T020 [P] [US1] Validate Add Mode on Android from every origin with empty/meaningful manual and voice state, unavailable Voice, Arabic/English, themes, 200% text, TalkBack, and reduced motion; record `specs/016-r05-add-voice/validation/add-mode-android.md`.
- [ ] T021 [P] [US1] Validate the equivalent Add Mode matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/add-mode-ios.md`; unavailable infrastructure remains blocked.
- [ ] T022 [US1] Fix only Add Mode defects from T019–T021 in `app/(tabs)/add.tsx`, route tests, or named draft/session/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/add-mode.md` before Manual Form.

**Checkpoint**: Add Mode is independently implemented, tested, device-reviewed, and corrected without taking ownership of either workflow.

---

## Phase 4: Screen — Manual Transaction Form (User Story 2, Priority P1)

**Goal**: Record every supported manual transaction through an amount-first, type-relevant, keyboard-safe form.

**Independent Test**: Create every exposed type with picker return, valid/invalid input, long mixed text, restored/discarded draft, local/pending/sync/failure outcomes, and repeated Save.

- [ ] T023 [P] [US2] Add failing form tests for type → amount/currency → title → account → category/destination → date/context order, every exposed type, distinct transfer source/destination, relevant-field visibility, and stale relationship clearing in `src/features/transactions/TransactionForm.test.tsx` and `src/features/transactions/transaction-form-schema.test.ts`.
- [ ] T024 [P] [US2] Add failing draft/result tests for account/category picker round trips, keyboard position, validation retention, saved/restored/discarded draft, duplicate Save, operation ID, local/pending/synchronized success, failure/retry, affected scopes, and R04 result in `src/features/transactions/TransactionForm.test.tsx`, `useTransactionDraftGuard.test.tsx`, and `src/services/mocks/core-finance-manual-entry.test.ts`.
- [ ] T025 [US2] Recompose manual mode in `src/features/transactions/TransactionForm.tsx` with compact type selection, prominent amount/currency, persistent labels, contextual fields, and one dominant Save action using R01 semantic components.
- [ ] T026 [US2] Replace inline account/category lists with R02/R03 controlled picker fields in `src/features/transactions/TransactionForm.tsx`, preserving draft, selected type, focus/scroll context, and current eligibility/return callbacks.
- [ ] T027 [US2] Render only type-valid category/destination/relationship fields and clear incompatible stale draft values through existing form actions/schema in `src/features/transactions/TransactionForm.tsx` and `src/features/transactions/transaction-form-schema.ts`; add no UI financial rule.
- [ ] T028 [US2] Preserve current draft persistence/restore/discard and accidental-dismissal protection through `src/features/transactions/useTransactionDraftGuard.ts`, adding no new draft store or route.
- [ ] T029 [US2] Map dependency loading/error, exact per-field validation, keyboard-open, saving/disabled, duplicate-submit, current local/pending/synchronized success, failure/retry, and supplied conflict recovery states in `src/features/transactions/TransactionForm.tsx`.
- [ ] T030 [US2] Preserve create command, operation ID, affected-scope invalidation, and R04 navigation in `app/(tabs)/add.tsx` and `src/services/contracts/core-finance-service.ts`; prove unchanged financial effects in `src/services/mocks/core-finance-manual-entry.test.ts`.
- [ ] T031 [US2] Add Arabic RTL/English LTR, bidi amount/currency/date, mixed title, light/dark, 200% reflow, focus/error announcements, keyboard/safe-area, screen-reader, 44×44, and reduced-motion coverage to `src/features/transactions/TransactionForm.test.tsx` and localization files.
- [ ] T032 [US2] Run Manual Form/schema/draft/service tests and record exact results in `specs/016-r05-add-voice/validation/manual-form.md`.
- [ ] T033 [P] [US2] Validate Manual Form on Android across all types, picker return, draft restore/discard, validation, offline/local/pending/sync/failure, duplicate Save, Arabic/English, themes, 200% text, keyboard, and TalkBack; record `specs/016-r05-add-voice/validation/manual-form-android.md`.
- [ ] T034 [P] [US2] Validate the equivalent Manual Form matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/manual-form-ios.md`; unavailable infrastructure remains blocked.
- [ ] T035 [US2] Fix only Manual Form defects from T032–T034 in `src/features/transactions/TransactionForm.tsx`, `src/features/transactions/transaction-form-schema.ts`, `src/features/transactions/useTransactionDraftGuard.ts`, `app/(tabs)/add.tsx`, or the named picker/service/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/manual-form.md` before Voice Permission.

**Checkpoint**: Manual Form is independently implemented, tested, device-reviewed, and corrected as the universal fallback.

---

## Phase 5: Screen State — Voice Permission (User Story 3, Priority P1)

**Goal**: Explain microphone access before prompting and provide truthful denial/settings/manual recovery without starting recording.

**Independent Test**: Exercise not-requested, granted, denied, permanently denied, unavailable, canceled prompt, settings return, Android, and iOS with no financial mutation.

- [ ] T036 [P] [US3] Add failing permission-state tests for education-before-prompt, benefit/data/denial/temporary-content copy, request, retry, settings only where valid, Manual fallback, cancel, restored grant, unavailable state, and no automatic recording/transaction in `src/features/voice/VoiceCaptureScreen.test.tsx` and `src/features/voice/useVoiceCapture.test.tsx`.
- [ ] T037 [P] [US3] Add platform-adapter mapping tests for Android/iOS granted, denied, permanently denied, unavailable, canceled, and settings-return outcomes in `src/services/platform/voice-recorder-service.test.ts` without adding a new permission.
- [ ] T038 [US3] Recompose the permission education/recovery state in `src/features/voice/VoiceCaptureScreen.tsx` from the existing hook state with one current request/settings/retry action plus Manual and cancel paths.
- [ ] T039 [US3] Keep permission request/open-settings/recheck ownership in `src/features/voice/useVoiceCapture.ts` and `src/services/platform/voice-recorder-service.ts`; recording must reach Ready only after grant and must still require explicit Start.
- [ ] T040 [US3] Ensure permanently denied/unavailable/canceled states cleanly resolve the session and expose Manual without a financial mutation in `src/features/voice/useVoiceCapture.ts` and `src/state/voice-capture.ts`.
- [ ] T041 [US3] Add Arabic RTL/English LTR platform-honest permission copy with no SMS claim, light/dark, 200% text, logical focus, screen-reader state/hint, 44×44, settings return, and reduced-motion coverage to `src/features/voice/VoiceCaptureScreen.test.tsx` and localization files.
- [ ] T042 [US3] Run permission screen/hook/adapter tests and record exact results in `specs/016-r05-add-voice/validation/voice-permission.md`.
- [ ] T043 [P] [US3] Validate Voice Permission on a physical Android device across first prompt, grant, deny, permanent denial, settings return, unavailable simulation, Manual fallback, Arabic/English, themes, 200% text, and TalkBack; record `specs/016-r05-add-voice/validation/voice-permission-android.md`.
- [ ] T044 [P] [US3] Validate the equivalent iOS microphone/Settings/VoiceOver matrix on a supported device/environment and record `specs/016-r05-add-voice/validation/voice-permission-ios.md`; unavailable infrastructure remains blocked.
- [ ] T045 [US3] Fix only Voice Permission defects from T042–T044 in `src/features/voice/VoiceCaptureScreen.tsx`, `src/features/voice/useVoiceCapture.ts`, `src/services/platform/voice-recorder-service.ts`, or the named shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/voice-permission.md` before Ready/Recording.

**Checkpoint**: Voice Permission is independently implemented, tested, device-reviewed, and corrected with Manual always available.

---

## Phase 6: Screen States — Voice Ready and Recording (User Story 4, Priority P1)

**Goal**: Make recording state, elapsed time, maximum warning, Stop, and Cancel authoritative without depending on waveform animation.

**Independent Test**: Exercise Ready, Start, recording, near/max duration, Stop, Cancel, interruption/background, duplicate controls, reduced motion, and screen reader with no financial record.

- [ ] T046 [P] [US4] Add failing recorder UI tests for Ready, explicit Start, Recording text, elapsed time, Stop, Cancel, near/max-duration warning, duplicate-control guards, decorative waveform accessibility, reduced motion, and no financial record in `src/features/voice/VoiceRecorder.test.tsx`.
- [ ] T047 [P] [US4] Add lifecycle tests for start/stop/cancel/interruption/background, existing 60-second maximum, valid captured-input retention, and cleanup dispatch in `src/features/voice/useVoiceCapture.test.tsx` and `src/services/platform/voice-recorder-service.test.ts`.
- [ ] T048 [US4] Recompose Ready/Recording presentation in `src/features/voice/VoiceRecorder.tsx` with authoritative state text, elapsed duration, Start/Stop/Cancel, and textual maximum warning using R01 controls and semantic surfaces.
- [ ] T049 [US4] Keep waveform/activity supplemental and hidden from accessibility in `src/features/voice/VoiceRecorder.tsx`; use immediate stable state under reduced motion and add no new animation dependency.
- [ ] T050 [US4] Preserve recorder lifecycle, 60-second limit, interruption mapping, and duplicate command guards in `src/features/voice/useVoiceCapture.ts` and `src/services/platform/voice-recorder-service.ts`.
- [ ] T051 [US4] Map stopping/interruption/cancel transition text and only current recoveries in `src/features/voice/VoiceCaptureScreen.tsx`, preserving valid audio when current behavior supports transcription and discarding it only through existing cleanup.
- [ ] T052 [US4] Add Arabic RTL/English LTR state/time/warning copy, English numerals, light/dark, 200% reflow, concise screen-reader announcements, 44×44, one-hand reach, background state, and reduced-motion coverage to `src/features/voice/VoiceRecorder.test.tsx` and localization files.
- [ ] T053 [US4] Run Ready/Recording UI/hook/adapter tests and record exact results in `specs/016-r05-add-voice/validation/voice-recording.md`.
- [ ] T054 [P] [US4] Validate Ready/Recording on a physical Android device across start/stop/cancel, duration warning/limit, interruption/background, Arabic/English, themes, 200% text, TalkBack, and reduced motion; record `specs/016-r05-add-voice/validation/voice-recording-android.md`.
- [ ] T055 [P] [US4] Validate the equivalent iOS recording/interruption/background/VoiceOver matrix and record `specs/016-r05-add-voice/validation/voice-recording-ios.md`; unavailable infrastructure remains blocked.
- [ ] T056 [US4] Fix only Ready/Recording defects from T053–T055 in `src/features/voice/VoiceRecorder.tsx`, `src/features/voice/VoiceCaptureScreen.tsx`, `src/features/voice/useVoiceCapture.ts`, or the recorder/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/voice-recording.md` before Transcript/Processing.

**Checkpoint**: Ready/Recording is independently implemented, tested, device-reviewed, and corrected.

---

## Phase 7: Screen States — Transcript and Processing (User Story 4, Priority P1)

**Goal**: Let the user verify/edit the transcript before analysis and recover without losing valid session content.

**Independent Test**: Exercise stopping/transcribing/analyzing, Arabic/English/mixed transcript edit, no speech/noise/unsupported language/offline/interruption/provider failure, Analyze, re-record, Manual, and cancel cleanup.

- [ ] T057 [P] [US4] Add failing transcript tests for complete editable text, Analyze, re-record, Manual, cancel, stopping/transcribing/analyzing geometry, concise progress, preserved session content on failure, no-speech/noise/unsupported/offline/interruption mapping, and no raw provider errors in `src/features/voice/VoiceCaptureScreen.test.tsx` and `src/features/voice/VoiceCaptureRecovery.test.tsx`.
- [ ] T058 [P] [US4] Add hook/state tests for transcript edit persistence, analyze transition, retry/re-record/manual/cancel outcomes, and audio/transcript cleanup timing in `src/features/voice/useVoiceCapture.test.tsx`, `src/features/voice/useVoiceCaptureReview.test.tsx`, and `src/state/voice-capture.test.ts`.
- [ ] T059 [US4] Recompose transcript review in `src/features/voice/VoiceCaptureScreen.tsx` as one focused editable transcript surface with Analyze as primary and re-record/Manual/cancel as explicit secondary paths.
- [ ] T060 [US4] Implement geometry-preserving stopping/transcribing/analyzing states in `src/features/voice/VoiceCaptureScreen.tsx`, retaining current transcript/session data and using concise live announcements without indefinite spinner-only feedback.
- [ ] T061 [US4] Map no speech, noise, unsupported language, offline, interruption, transcription, analysis, and unknown failures to existing safe retry/re-record/edit/manual/cancel actions in `src/features/voice/useVoiceCapture.ts` and `src/features/voice/VoiceCaptureScreen.tsx`, never exposing raw provider details.
- [ ] T062 [US4] Invoke current temporary audio/transcript cleanup for re-record/cancel/Manual transitions through `src/features/voice/useVoiceCapture.ts` and `src/state/voice-capture.ts`; prove zero transaction creation in recovery tests.
- [ ] T063 [US4] Add Arabic RTL/English LTR mixed transcript editing, light/dark, 200% reflow, keyboard/safe-area, screen-reader focus/live status, 44×44, hidden temporary content, and reduced-motion coverage to `src/features/voice/VoiceCaptureAccessibility.test.tsx` and localization files.
- [ ] T064 [US4] Run Transcript/Processing/recovery/state tests and record exact results in `specs/016-r05-add-voice/validation/transcript-processing.md`.
- [ ] T065 [P] [US4] Validate Transcript/Processing on Android across clear/mixed/noisy/empty/offline/failure input, edit/analyze/re-record/manual/cancel, keyboard, Arabic/English, themes, 200% text, TalkBack, and reduced motion; record `specs/016-r05-add-voice/validation/transcript-processing-android.md`.
- [ ] T066 [P] [US4] Validate the equivalent iOS/VoiceOver transcript/processing matrix and record `specs/016-r05-add-voice/validation/transcript-processing-ios.md`; unavailable infrastructure remains blocked.
- [ ] T067 [US4] Fix only Transcript/Processing defects from T064–T066 in `src/features/voice/VoiceCaptureScreen.tsx`, `src/features/voice/useVoiceCapture.ts`, `src/state/voice-capture.ts`, or the named analyzer/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/transcript-processing.md` before Single Proposal.

**Checkpoint**: Transcript/Processing is independently implemented, tested, device-reviewed, corrected, and creates no transaction.

---

## Phase 8: Screen — Single Voice Proposal Review (User Story 5, Priority P1)

**Goal**: Show one structured proposal in manual-form order, explain each uncertain field, and save only explicit confirmed values.

**Independent Test**: Review clear, 60–89 confirm, below-60 missing, conflict, transfer/income/obligation, missing account/category, unsupported currency, date ambiguity, category preference, and save failure proposals.

- [ ] T068 [P] [US5] Add failing proposal UI tests for manual-order fields, distinct payment method/funding account, compact type/payment choices, R02/R03 pickers, every required assessment state/reason, unresolved save blocking/focus, transfer/date/relationship fields, category preference choices, and displayed-value confirmation in `src/features/voice/VoiceReview.test.tsx`.
- [ ] T069 [P] [US5] Add confidence-boundary tests for ≥90 clear, 60–89 confirm, <60 missing, explicit conflict, required-field eligibility, and first actionable field in `src/features/voice/useVoiceCaptureReview.test.tsx` and `src/services/mocks/voice-analyzer-service.test.ts`.
- [ ] T070 [US5] Recompose `src/features/voice/VoiceReview.tsx` to the shared manual field hierarchy with concise type/amount/title/payment/account/category-or-destination/date/relationship sections and one explicit Confirm action.
- [ ] T071 [US5] Replace inline account/category lists with R02/R03 controlled picker fields in `src/features/voice/VoiceReview.tsx`, preserving proposal edits, transcript, assessment, focus, and caller-owned eligibility on select/cancel.
- [ ] T072 [US5] Present clear/confirm/missing/conflict assessment beside the affected field with localized reason and action in `src/features/voice/VoiceReview.tsx`; never use percentage/color alone and preserve the current thresholds in hook/service ownership.
- [ ] T073 [US5] Keep payment method distinct from funding account and preserve current type, transfer, date, currency, optional-field, and relationship callbacks in `src/features/voice/VoiceReview.tsx` without parsing financial meaning in presentation.
- [ ] T074 [US5] Present one-time/always-for-merchant/not-now category preference choices only when currently supplied in `src/features/voice/VoiceReview.tsx`, invoking existing `src/services/mocks/voice-category-service.ts` callbacks only after explicit choice.
- [ ] T075 [US5] Block confirmation while required fields are unresolved, focus/announce the first actionable field, prevent duplicate Save, retain all edits on failure, and show only current local/pending/synchronized result in `src/features/voice/VoiceReview.tsx` and `src/features/voice/useVoiceCapture.ts`.
- [ ] T076 [US5] Prove confirmed displayed values create one existing R04 transaction with voice source and unchanged affected scopes in `src/services/mocks/core-finance-voice-batch.test.ts` and `src/features/voice/useVoiceCaptureReview.test.tsx`.
- [ ] T077 [US5] Add Arabic RTL/English LTR, bidi financial/date/reference, mixed merchant/account/category, light/dark, 200% reflow, logical focus/error announcement, keyboard/safe-area, screen-reader assessment/selection, 44×44, and reduced-motion coverage to `src/features/voice/VoiceReview.test.tsx` and localization files.
- [ ] T078 [US5] Run Single Proposal UI/hook/analyzer/category/save tests and record exact results in `specs/016-r05-add-voice/validation/single-proposal.md`.
- [ ] T079 [P] [US5] Validate Single Proposal on Android across all assessment boundaries, missing/conflict fields, pickers, category preference, save block/failure/success, Arabic/English, themes, 200% text, keyboard, and TalkBack; record `specs/016-r05-add-voice/validation/single-proposal-android.md`.
- [ ] T080 [P] [US5] Validate the equivalent Single Proposal matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/single-proposal-ios.md`; unavailable infrastructure remains blocked.
- [ ] T081 [US5] Fix only Single Proposal defects from T078–T080 in `src/features/voice/VoiceReview.tsx`, `src/features/voice/useVoiceCapture.ts`, or the named analyzer/category/save/picker/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/single-proposal.md` before Multiple Proposals.

**Checkpoint**: Single Proposal is independently implemented, tested, device-reviewed, and corrected with explicit confirmation only.

---

## Phase 9: Screen — Multiple Voice Proposal Review (User Story 6, Priority P1)

**Goal**: Review 2–10 proposals independently and save the exact selected scope atomically.

**Independent Test**: Edit/remove/select proposals, preserve siblings, confirm selected/all, handle none selected, mixed validity, atomic failure/retry, success, cancel, and re-record.

- [ ] T082 [P] [US6] Add failing group UI tests for 2/10 proposals, concise identity/position, independent selection/edit/remove, sibling stability, selected/total/invalid/unresolved counts, none-selected state, Confirm selected/all scope, duplicate guard, failure retention, cancel, and re-record in `src/features/voice/VoiceReviewGroup.test.tsx`.
- [ ] T083 [P] [US6] Add state tests proving one proposal edit/remove never mutates siblings or selection and derived group counts remain correct in `src/state/voice-proposal-group.test.ts` and `src/features/voice/useVoiceCaptureReview.test.tsx`.
- [ ] T084 [P] [US6] Add service/repository tests proving selected-group save is atomic, one invalid/save failure persists none, success persists each once with voice source, and retry creates no duplicates in `src/features/voice/voice-group-save.test.ts` and `src/services/mocks/core-finance-voice-batch.test.ts`.
- [ ] T085 [US6] Recompose `src/features/voice/VoiceReviewGroup.tsx` with one concise group summary and sequential proposal sections using the single-proposal field grammar without nested-card clutter.
- [ ] T086 [US6] Implement independent selection/edit/remove presentation and explicit position/identity in `src/features/voice/VoiceReviewGroup.tsx`, preserving sibling values and current proposal-group store actions.
- [ ] T087 [US6] Present selected/total/invalid/unresolved scope and distinguish Confirm selected from Confirm all in `src/features/voice/VoiceReviewGroup.tsx`; require exact current scope before invoking the existing atomic save.
- [ ] T088 [US6] Block duplicate group actions while saving, retain the complete reviewed group on validation/save failure, expose correction/retry, and show one truthful success outcome in `src/features/voice/VoiceReviewGroup.tsx` and `src/features/voice/useVoiceCapture.ts`.
- [ ] T089 [US6] Add Arabic RTL/English LTR proposal numbering/counts/scope, English numerals, mixed content, light/dark, 200% sequential reflow, focus after edit/remove/error, screen-reader selection/scope, 44×44, keyboard/safe-area, and reduced-motion coverage to `src/features/voice/VoiceReviewGroup.test.tsx` and localization files.
- [ ] T090 [US6] Run Multiple Proposal UI/state/atomic-save tests and record exact results in `specs/016-r05-add-voice/validation/multiple-proposals.md`.
- [ ] T091 [P] [US6] Validate Multiple Proposals on Android with 2/10 items, edit/remove/select, none/mixed invalid, Confirm selected/all, group failure/retry/success, Arabic/English, themes, 200% text, keyboard, and TalkBack; record `specs/016-r05-add-voice/validation/multiple-proposals-android.md`.
- [ ] T092 [P] [US6] Validate the equivalent Multiple Proposals matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/multiple-proposals-ios.md`; unavailable infrastructure remains blocked.
- [ ] T093 [US6] Fix only Multiple Proposal defects from T090–T092 in `src/features/voice/VoiceReviewGroup.tsx`, `src/state/voice-capture.ts`, `src/features/voice/useVoiceCapture.ts`, or the current atomic-save/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/multiple-proposals.md` before Recurring/Obligation.

**Checkpoint**: Multiple Proposal Review is independently implemented, tested, device-reviewed, and corrected with all-or-none persistence.

---

## Phase 10: Screen State — Recurring and Obligation Decision (User Story 7, Priority P2)

**Goal**: Require explicit one-time/recurring and existing/new-obligation choices before changing future or planning relationships.

**Independent Test**: Review one-time, weekly/monthly recurring, zero/one/multiple obligation candidates, existing link, new-obligation handoff, ambiguity, cancel, failure, and progress update only after confirmation.

- [ ] T094 [P] [US7] Add failing decision UI tests for one-time/recurring choices, supplied schedule meaning, zero/one/multiple obligation candidates, explicit ambiguous selection, existing-link consequence, new-obligation R10 handoff/preview, cancel, failure, and no automatic relationship in `src/features/voice/VoiceRecurringReview.test.tsx`.
- [ ] T095 [P] [US7] Add service/state tests proving no recurring or obligation relationship exists before confirmation, current existing-obligation payment updates transaction/progress together, and new-obligation selection only invokes the R10 handoff in `src/features/voice/voice-obligation-save.test.ts` and `src/services/mocks/voice-obligation-service.test.ts`.
- [ ] T096 [US7] Recompose `src/features/voice/VoiceRecurringReview.tsx` with explicit one-time versus recurring choices and supplied schedule consequence, keeping recurrence intent and callbacks in current domain/hook ownership.
- [ ] T097 [US7] Present zero/one/multiple current obligation candidates with identity and consequence in `src/features/voice/VoiceRecurringReview.tsx`, requiring deliberate selection for ambiguity and inferring no match in presentation.
- [ ] T098 [US7] Preserve existing-obligation link/save and new-obligation R10 handoff/preview through `src/features/voice/useVoiceCapture.ts` and `src/services/mocks/voice-obligation-service.ts`; do not create an obligation inside R05.
- [ ] T099 [US7] Implement loading, no match, ambiguous, selected, confirming, saving, failure/retry, cancel, and truthful result states in `src/features/voice/VoiceRecurringReview.tsx`, blocking duplicate submission and retaining proposal context.
- [ ] T100 [US7] Add Arabic RTL/English LTR schedule/candidate/consequence copy, English numerals, mixed identity, non-color selection, light/dark, 200% reflow, focus order, screen-reader decision meaning, 44×44, keyboard/safe-area, and reduced-motion coverage to `src/features/voice/VoiceRecurringReview.test.tsx` and localization files.
- [ ] T101 [US7] Run Recurring/Obligation UI/service/state tests and record exact results in `specs/016-r05-add-voice/validation/recurring-obligation.md`.
- [ ] T102 [P] [US7] Validate Recurring/Obligation on Android across one-time/recurring, zero/one/multiple candidates, existing/new handoff, cancel/failure/success, Arabic/English, themes, 200% text, keyboard, and TalkBack; record `specs/016-r05-add-voice/validation/recurring-obligation-android.md`.
- [ ] T103 [P] [US7] Validate the equivalent Recurring/Obligation matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/recurring-obligation-ios.md`; unavailable infrastructure remains blocked.
- [ ] T104 [US7] Fix only Recurring/Obligation defects from T101–T103 in `src/features/voice/VoiceRecurringReview.tsx`, `src/features/voice/useVoiceCapture.ts`, or the current obligation/R10/shared owner, rerun tests, and update `specs/016-r05-add-voice/validation/recurring-obligation.md` before Completion/Recovery.

**Checkpoint**: Recurring/Obligation Decision is independently implemented, tested, device-reviewed, and corrected with no unconfirmed relationship.

---

## Phase 11: Screen State — Completion and Recovery (User Stories 2, 4, 5, 6, and 7)

**Goal**: State exactly what changed, what did not, sync status where supplied, and the valid next action while cleaning temporary voice content.

**Independent Test**: Complete/cancel/fail manual, recording, transcription, single/group save, and obligation paths; verify R04 result, local/pending distinction, retry, cleanup, background privacy, and zero false success.

- [ ] T105 [P] [US2] Add failing manual result/recovery tests for what changed, current local/pending/synchronized status, R04 destination, retry/correction, and no early success in `src/features/transactions/TransactionForm.test.tsx` and `src/features/transactions/AddRoute.test.tsx`.
- [ ] T106 [P] [US5] Add failing voice result/recovery tests for single/group confirmed scope, failure preserving proposals, cancel/no-mutation, valid next action, and no raw provider error in `src/features/voice/VoiceCaptureRecovery.test.tsx` and `src/features/voice/VoiceCaptureScreen.test.tsx`.
- [ ] T107 [P] [US4] Add lifecycle privacy tests for audio deletion after transcription, transcript deletion after save/cancel, hidden values in accessibility/errors/background/app switcher/evidence, and safe fixture-only logs in `src/features/voice/voice-privacy.test.ts`.
- [ ] T108 [US2] Present manual persistent result/recovery plus transient confirmation only after command resolution in `src/features/transactions/TransactionForm.tsx` and `app/(tabs)/add.tsx`, preserving existing R04 navigation and affected scopes.
- [ ] T109 [US5] Present voice persistent result/recovery in `src/features/voice/VoiceCaptureScreen.tsx`, stating confirmed record count/scope, what changed, supplied local/pending/sync state, and next ledger/retry/manual action without celebration that interrupts recovery.
- [ ] T110 [US6] Preserve the reviewed proposal group on validation/atomic-save failure and clear it only after current success/cancel rules in `src/features/voice/useVoiceCapture.ts` and `src/state/voice-capture.ts`.
- [ ] T111 [US7] State existing-obligation progress effect or R10 handoff result only when supplied and resolved in `src/features/voice/VoiceCaptureScreen.tsx`, avoiding any inferred planning update.
- [ ] T112 [US4] Enforce current audio/transcript cleanup and background/app-switcher masking through `src/features/voice/useVoiceCapture.ts`, `src/state/voice-capture.ts`, and `src/state/SensitiveVisibilityProvider.tsx`, adding no analytics or retained raw content.
- [ ] T113 [US5] Add Arabic RTL/English LTR result/recovery, English-numeral count/status, light/dark, 200%, screen-reader announcement, 44×44 next action, hidden-value privacy, and reduced-motion coverage to `src/features/voice/VoiceCaptureAccessibility.test.tsx` and localization files.
- [ ] T114 [US5] Run Completion/Recovery/manual result/voice privacy tests and record exact results in `specs/016-r05-add-voice/validation/completion-recovery.md`.
- [ ] T115 [P] [US5] Validate Completion/Recovery on Android across manual/single/group/obligation success, local/pending where supplied, all failure/cancel/retry paths, background/app-switcher privacy, Arabic/English, themes, 200% text, and TalkBack; record `specs/016-r05-add-voice/validation/completion-recovery-android.md`.
- [ ] T116 [P] [US5] Validate the equivalent Completion/Recovery matrix on iOS/VoiceOver and record `specs/016-r05-add-voice/validation/completion-recovery-ios.md`; unavailable infrastructure remains blocked.
- [ ] T117 [US5] Fix only Completion/Recovery defects from T114–T116 in the named manual/voice/state/privacy/R04/R10 owner, rerun tests, and update `specs/016-r05-add-voice/validation/completion-recovery.md`.

**Checkpoint**: Completion/Recovery is independently implemented, tested, device-reviewed, corrected, and privacy-clean.

---

## Phase 12: Final Cross-State Consistency and R05 Gate

**Purpose**: Prove the complete Add journey remains one route, explicit, financially safe, accessible, private, and compatible with downstream projections.

- [ ] T118 Run `npm run typecheck`, `npm run lint`, `npm run check:design-system`, `npm run check:core-finance`, and `npm run check:voice-capture`, recording exact output and zero new failures in `specs/016-r05-add-voice/validation/final-r05.md`.
- [ ] T119 Run the complete focused Jest command from `specs/016-r05-add-voice/quickstart.md` and append suite/test totals and failures to `specs/016-r05-add-voice/validation/final-r05.md`.
- [ ] T120 Run downstream R02/R03 picker, R04 ledger/result, R07 balance, R10 obligation progress, reports/planning, and origin/return regressions identified by T001; record unchanged financial effects in `specs/016-r05-add-voice/validation/consumer-regression.md`.
- [ ] T121 Verify no manual or voice path creates a transaction before explicit Save/Confirm, selected-group save remains atomic, recurring/obligation effects remain explicit, and canceled/failed paths create nothing; record service/repository proof in `specs/016-r05-add-voice/validation/financial-effects.md`.
- [ ] T122 Verify Arabic/English key parity, bidi values, light/dark, 320×568/large phone, 200% text, screen readers, keyboard, reduced motion, hidden/background privacy, offline, and every applicable permission/state across all nine groups in `specs/016-r05-add-voice/validation/final-matrix.md`.
- [ ] T123 [P] Re-run the full R05 journey on a physical Android device: every origin → mode → manual save → permission → record → transcript → single/group review → recurring/obligation → result/recovery/background; record `specs/016-r05-add-voice/validation/final-android.md`.
- [ ] T124 [P] Re-run the equivalent iOS microphone/VoiceOver journey and record `specs/016-r05-add-voice/validation/final-ios.md`; unavailable iOS infrastructure remains explicitly blocked.
- [ ] T125 Verify retained screenshots, logs, UI hierarchy, accessibility tree, notifications, and app-switcher evidence contain only approved fixtures and no audio/transcript/hidden financial value in `specs/016-r05-add-voice/validation/privacy.md`.
- [ ] T126 Fix only defects recorded by T118–T125 in the named R05/R01/R02/R03/R04/R10 owner, rerun affected checks, and update `specs/016-r05-add-voice/validation/final-r05.md`; do not add routes, providers, permissions, parsers, confidence rules, stores, schema, or local token workarounds.
- [ ] T127 Complete the R05 handoff in `specs/016-r05-add-voice/validation/README.md` by linking final evidence, listing approved capture contracts, and confirming unchanged route, drafts, validation, permission mapping, confidence thresholds, atomic save, cleanup, recurring/obligation behavior, and downstream effects.

**Final Checkpoint**: R05 is complete only when T118–T127 pass or unavailable platform infrastructure is explicitly blocked rather than checked.

---

## Dependencies and Execution Order

```text
Baseline
  → Shared Add/Voice Foundation
    → Add Mode → validate/fix
      → Manual Form → validate/fix
        → Voice Permission → validate/fix
          → Ready/Recording → validate/fix
            → Transcript/Processing → validate/fix
              → Single Proposal → validate/fix
                → Multiple Proposals → validate/fix
                  → Recurring/Obligation → validate/fix
                    → Completion/Recovery → validate/fix
                      → Final R05 Gate
```

- Shared Add/Voice Foundation blocks every screen because it fixes contract adoption and route ownership.
- Each screen's final fix task blocks the next screen under the approved screen-first contract.
- Android/iOS validation for one completed screen may run in parallel and both feed its fix task.
- R02/R03 own picker identity/eligibility, R04 owns confirmed ledger presentation, and R10 owns obligation management/handoff.

### User Story Traceability

- **US1**: T013–T022 — Add Mode Selector.
- **US2**: T023–T035 and T105/T108 — Manual Form and result.
- **US3**: T036–T045 — Voice Permission.
- **US4**: T046–T067 and T107/T112 — Ready, Recording, Transcript, Processing, and cleanup.
- **US5**: T068–T081 and T106/T109/T113–T117 — Single Proposal and result/recovery.
- **US6**: T082–T093 and T110 — Multiple Proposals and retained group.
- **US7**: T094–T104 and T111 — Recurring/Obligation and supplied result.

## Parallel Opportunities

- Route, shared-field, picker, fixture-gate, and localization tests may be authored in parallel where marked `[P]`.
- Android and iOS validation may run in parallel after each screen's focused automated gate.
- Screen implementation remains sequential because each later voice state depends on the previous visible lifecycle contract.

### Parallel Examples by User Story

- **US1**: Run Android T020 and iOS T021 after T019 passes.
- **US2**: Run Manual validations T033/T034 together after T032; manual result tests T105 may run beside voice result tests T106 after all screen groups pass.
- **US3**: Run physical Android T043 and iOS T044 after T042 passes.
- **US4**: Run Recording validations T054/T055 together, then Transcript validations T065/T066 together after their respective gates.
- **US5**: Run Single Proposal validations T079/T080 together and Completion validations T115/T116 together after their respective gates.
- **US6**: Run Android T091 and iOS T092 after T090 passes.
- **US7**: Run Android T102 and iOS T103 after T101 passes.

## Implementation Strategy

### Reviewable MVP

Complete T001–T035: baseline, Shared Foundation, Add Mode, and Manual Form. This delivers the universal capture fallback but does not close R05.

### Sequential Delivery

1. Lock current state ownership and adopt shared contracts.
2. Implement, test, device-review, and fix each visible group in lifecycle order.
3. Run no-unconfirmed-mutation, privacy cleanup, and downstream financial regression after every group passes.

### Stop Conditions

- Stop before device validation if focused tests or boundary checks fail.
- Stop before the next screen while the current screen has an unresolved required defect.
- Return picker/ledger/obligation/shared defects to R02/R03/R04/R10/R01; do not add local workarounds.
- Require a separate approved specification for any route, provider, permission, parser, confidence threshold, atomic-save rule, persistence entity, or product capability change.

## Notes

- Every task names an existing file path; no new production abstraction is required by this plan.
- Tests precede changes to money creation, permission/session transitions, assessment mapping, atomic save, and cleanup.
- `[P]` indicates safe file-level parallelism, not permission to bypass dependencies.
- Preserve unrelated user changes in the shared worktree.
