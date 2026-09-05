# Tasks: Automatic Transaction Capture and Platform-Specific Tracking

**Input**: Design documents from `/specs/005-automatic-tracking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Include the smallest tests required by the constitution for financial decisions,
validation, permission mapping, state transitions, privacy, and critical user journeys.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated
as an independent increment after the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on an
  incomplete task in the same phase.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task names the exact implementation or validation path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the minimal feature locations and shared identifiers without introducing a new
dependency or duplicate application state.

- [X] T001 Create the protected tracking stack and Android capability fallback in `app/tracking/_layout.tsx`
- [X] T002 [P] Add deterministic event, sender, duplicate, obligation, clock, and scale builders in `src/test-utils/automatic-tracking-fixtures.ts`
- [X] T003 [P] Add the tracking query-key factory and transient filter shape in `src/state/automatic-tracking-view-state.ts`
- [X] T004 [P] Reserve complete Arabic and English tracking message namespaces in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the typed policy, durable schema, repository, service, and platform guard
used by every story.

**CRITICAL**: No user-story implementation begins until this phase passes.

- [X] T005 [P] Write schema, transition, confidence-boundary, sender-normalization, and retention validation tests in `src/domain/automatic-tracking.test.ts`
- [X] T006 Implement detected-event, status, review, duplicate, sender, obligation-match, history, feedback, input schemas, transitions, and safe reason codes in `src/domain/automatic-tracking.ts`
- [X] T007 [P] Define the replaceable tracking service, mutation result, paging, notification, obligation-effect, and safe-error contracts in `src/services/contracts/automatic-tracking-service.ts`
- [X] T008 [P] Write forward-migration and existing-ledger preservation tests in `src/storage/database.test.ts`
- [X] T009 Advance the database to schema version 3 with tracking tables and indexes in `src/storage/database.ts`
- [X] T010 [P] Write repository hydration, paging, fingerprint uniqueness, source-expiry, and rollback tests in `src/storage/automatic-tracking-repository.test.ts`
- [X] T011 Implement typed hydration, persistence, paging, atomic writes, history clearing, and source-text purge in `src/storage/automatic-tracking-repository.ts`
- [X] T012 [P] Add complete deterministic mock event and service-state datasets in `src/services/mocks/automatic-tracking-fixtures.ts`
- [X] T013 Implement the replaceable mock tracking service factory and shared query invalidation results in `src/services/mocks/automatic-tracking-service.ts`
- [X] T014 Add TanStack Query read and mutation hooks without mirroring records in Zustand in `src/features/tracking/useAutomaticTracking.ts`
- [X] T015 [P] Write Android-only route and direct-link capability tests in `src/features/tracking/tracking-route-guard.test.ts`
- [X] T016 Implement the shared platform capability guard for tracking routes in `src/features/tracking/tracking-route-guard.ts`

**Checkpoint**: Schema version 3 migrates without changing existing finance records; all tracking
entities validate; persistence, service, and capability boundaries are ready.

---

## Phase 3: User Story 1 - Capture Clear Android Transactions Automatically (Priority: P1) MVP

**Goal**: Process clear eligible Android mock messages exactly once, update the existing ledger,
show privacy-safe feedback, and allow a 30-second undo.

**Independent Test**: Enable Android tracking and process clear examples for every supported event
type; confirm exactly one expected transaction, consistent affected summaries, automatic source,
feedback, and working undo while unsafe examples never auto-add.

### Tests for User Story 1

- [X] T017 [P] [US1] Write decision tests for 90%, 89%, 60%, and 59% confidence plus safety overrides and tracking modes in `src/features/tracking/automatic-tracking-policy.test.ts`
- [X] T018 [P] [US1] Write idempotent automatic-add, atomic ledger-effect, lifecycle-link, rollback, and affected-scope tests in `src/storage/automatic-tracking-financial-effects.test.ts`
- [X] T019 [P] [US1] Write persisted 30-second deadline, expiry, restart, and atomic undo tests in `src/features/tracking/automatic-tracking-undo.test.ts`
- [X] T020 [P] [US1] Write privacy-safe automatic feedback component tests in `src/features/tracking/AutomaticFeedback.test.tsx`

### Implementation for User Story 1

- [X] T021 [US1] Implement the single eligibility and confidence decision function in `src/features/tracking/automatic-tracking-policy.ts`
- [X] T022 [US1] Add idempotent detected-event processing and atomic finance-transaction creation to `src/storage/automatic-tracking-repository.ts`
- [X] T023 [US1] Extend automatic-source transaction creation and affected query scopes in `src/services/contracts/core-finance-service.ts` and `src/services/mocks/core-finance-service.ts`
- [X] T024 [US1] Implement clear-event processing, lifecycle follow-up linking, and safe results in `src/services/mocks/automatic-tracking-service.ts`
- [X] T025 [P] [US1] Implement delivered, privacy-suppressed, disabled, and failed phone-notification mock outcomes in `src/services/mocks/automatic-tracking-notification-service.ts`
- [X] T026 [US1] Implement persisted in-app feedback with View, Edit, and exact 30-second Undo in `src/features/tracking/AutomaticFeedback.tsx`
- [X] T027 [P] [US1] Build the deterministic Android capture demonstration in `src/features/tracking/TrackingDemoScreen.tsx`
- [X] T028 [US1] Connect the production demo route to event processing and feedback in `app/tracking/demo.tsx`
- [X] T029 [US1] Expose automatic source, related event, report-wrong, edit, and eligible undo actions in `app/transactions/[id].tsx`
- [X] T030 [US1] Add the Android tracking summary and demo entry to Home using existing status and card components in `app/(tabs)/home.tsx`
- [X] T031 [US1] Add the US1 Arabic/English labels, reasons, statuses, feedback, and accessibility summaries in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`

**Checkpoint**: User Story 1 independently demonstrates Masarifi's Android automatic-first value
without a production parser and without creating duplicate or irreversible financial effects.

---

## Phase 4: User Story 2 - Review Uncertain or Duplicate Detections (Priority: P1)

**Goal**: Let users understand and explicitly resolve uncertain, duplicate, lifecycle, and
obligation candidates before any financial mutation.

**Independent Test**: Process every review reason, dismiss, correct, confirm, ignore, report,
retry, and resolve every duplicate choice; verify pending items never mutate finances and all
confirmed results apply exactly once.

### Tests for User Story 2

- [X] T032 [P] [US2] Write review lifecycle, required-field preservation, dismissal, ignore, report, retry, and atomic-confirm tests in `src/features/tracking/review-resolution.test.ts`
- [X] T033 [P] [US2] Write keep-existing, keep-new, keep-both, and safe merge-details tests in `src/features/tracking/duplicate-resolution.test.ts`
- [X] T034 [P] [US2] Write clear, zero, and multiple obligation-match effect tests in `src/features/tracking/obligation-match.test.ts`
- [X] T035 [P] [US2] Write review queue/detail and duplicate comparison accessibility tests in `src/features/tracking/ReviewJourney.test.tsx`

### Implementation for User Story 2

- [X] T036 [US2] Implement review and duplicate persistence, transitions, retries, and atomic resolution in `src/storage/automatic-tracking-repository.ts`
- [X] T037 [US2] Implement review, ignore, report-wrong, duplicate, and obligation-match service methods in `src/services/mocks/automatic-tracking-service.ts`
- [X] T038 [P] [US2] Implement the replaceable mock obligation-effect preview and apply boundary in `src/services/mocks/automatic-tracking-obligation-service.ts`
- [X] T039 [P] [US2] Build the virtualized pending review queue and state handling in `src/features/tracking/ReviewQueue.tsx`
- [X] T040 [US2] Build review detail with localized reasons, source masking, preserved edits, account/category selection, and explicit resolution in `src/features/tracking/ReviewDetail.tsx`
- [X] T041 [P] [US2] Build duplicate comparison and four deliberate resolution actions in `src/features/tracking/DuplicateComparison.tsx`
- [X] T042 [US2] Connect paged review navigation and filtered empty/error/offline states in `app/tracking/review/index.tsx`
- [X] T043 [US2] Connect review detail, retry, ignore, report, and confirmation behavior in `app/tracking/review/[id].tsx`
- [X] T044 [US2] Connect duplicate comparison and resolution behavior in `app/tracking/duplicates/[id].tsx`
- [X] T045 [US2] Add review count and review destination to existing Home tracking feedback in `app/(tabs)/home.tsx`
- [X] T046 [US2] Add review, duplicate, lifecycle, and obligation Arabic/English content in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`
- [X] T047 [US2] Add the end-to-end uncertain, duplicate, lifecycle, and obligation journey test in `src/features/tracking/AutomaticReviewJourney.test.tsx`

**Checkpoint**: User Story 2 independently proves that uncertainty cannot cause a hidden financial
change and every supported resolution preserves one canonical financial history.

---

## Phase 5: User Story 3 - Control and Recover Android Tracking (Priority: P1)

**Goal**: Make Android tracking status, pause/resume, permission recovery, service recovery,
history, and manual fallback understandable and usable.

**Independent Test**: Exercise not-requested, granted, denied, permanently denied, revoked,
paused, interrupted, battery-restricted, offline, unavailable, and restored fixtures; verify the
status and one correct next action while manual entry remains reachable.

### Tests for User Story 3

- [X] T048 [P] [US3] Write composed permission, mode, service-state, count, and recovery-action tests in `src/features/tracking/tracking-status.test.ts`
- [X] T049 [P] [US3] Write clear-history preservation and 30-day source-purge tests in `src/storage/automatic-tracking-retention.test.ts`
- [X] T050 [P] [US3] Write tracking status, recovery, pause/resume, history, and manual-fallback route tests in `src/features/tracking/TrackingStatusJourney.test.tsx`

### Implementation for User Story 3

- [X] T051 [US3] Compose permission, tracking preference, service condition, latest activity, and counts in `src/services/mocks/automatic-tracking-service.ts`
- [X] T052 [US3] Implement pause/resume, refresh, clear-history, and retention cleanup mutations in `src/services/mocks/automatic-tracking-service.ts`
- [X] T053 [P] [US3] Build status summary, counts, recent activity, mode, and primary actions in `src/features/tracking/TrackingStatusScreen.tsx`
- [X] T054 [P] [US3] Build permission, interrupted-service, battery-restriction, offline, and restored recovery states in `src/features/tracking/TrackingRecoveryPanel.tsx`
- [X] T055 [P] [US3] Build the virtualized tracking history with distinct ignored, rejected, review, added, linked, merged, undone, and purged entries in `src/features/tracking/TrackingHistoryList.tsx`
- [X] T056 [US3] Connect status refresh, enable, pause, resume, settings, review, rules, demo, history, and manual fallback in `app/tracking/index.tsx`
- [X] T057 [US3] Connect paged history and confirmed history clearing without deleting posted transactions in `app/tracking/history.tsx`
- [X] T058 [US3] Add the platform-capable tracking destination and current status to More in `app/(tabs)/more.tsx`
- [X] T059 [US3] Add status, service, recovery, history, retention, and clear-history Arabic/English content in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`
- [X] T060 [US3] Extend Android permission adapter regression coverage for grant, denial, permanent denial, later revoke, settings return, and non-blocking fallback in `src/services/platform/tracking-permission-service.test.ts`

**Checkpoint**: User Story 3 independently keeps Android automation understandable and optional
through every permission and service state.

---

## Phase 6: User Story 5 - Use Honest iOS Capture Alternatives (Priority: P1)

**Goal**: Ensure iOS never renders Android SMS claims and always offers usable manual, voice, and
supported platform-assisted alternatives.

**Independent Test**: Open every normal and direct tracking entry point under iOS capability
fixtures; verify automatic redirects, zero SMS/keyword/sender/service claims, and working manual
or voice destinations even when optional automation is skipped or unavailable.

### Tests for User Story 5

- [X] T061 [P] [US5] Write iOS capability, direct-link redirect, unsupported-option, skip, and failure tests in `src/features/tracking/IosPlatformTrackingJourney.test.tsx`
- [X] T062 [P] [US5] Add a localization regression that rejects iOS route content containing Android SMS permission, inbox, keyword, sender, or service claims in `src/localization/automatic-tracking-messages.test.ts`

### Implementation for User Story 5

- [X] T063 [US5] Apply the tracking route guard to normal navigation and direct links in `app/tracking/_layout.tsx`
- [X] T064 [P] [US5] Complete actionable manual and voice destinations in `app/(onboarding)/ios-capture-options.tsx`
- [X] T065 [P] [US5] Show only adapter-supported optional Shortcuts, App Intents, Share Extension, quick-action, and widget choices in `app/(onboarding)/ios-automation.tsx`
- [X] T066 [US5] Preserve usable Home/manual state after optional iOS setup skip, failure, or unavailability in `src/features/onboarding/onboarding-progress.ts`
- [X] T067 [US5] Add iOS alternative, limitation, unsupported, skip, and recovery Arabic/English content in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`
- [X] T068 [US5] Verify manual and voice fallback links return safely to their origin in `src/features/onboarding/PlatformOnboardingRoutes.test.tsx`

**Checkpoint**: User Story 5 independently delivers a complete iOS capture path without any
direct or indirect Android SMS promise.

---

## Phase 7: User Story 4 - Manage Detection Rules (Priority: P2)

**Goal**: Let Android users search and manage Arabic/English keyword packs and recognized/custom
sender rules without weakening safety or changing operating-system permission scope.

**Independent Test**: Add, search, disable, confirm-final-rule disable, restore, label, associate,
trust, disable, and remove supported rule fixtures; verify normalization, use counts, restrictions,
privacy explanation, and safety overrides.

### Tests for User Story 4

- [X] T069 [P] [US4] Extend keyword normalization, duplicate, final-active warning, restore-default, language-filter, and use-count tests in `src/features/onboarding/keyword-rules.test.ts`
- [X] T070 [P] [US4] Write sender normalization, uniqueness, recognized/custom restriction, trust, and safety-override tests in `src/features/tracking/sender-rules.test.ts`
- [X] T071 [P] [US4] Write keyword and sender route search, empty, error, offline, and accessibility tests in `src/features/tracking/TrackingRulesJourney.test.tsx`

### Implementation for User Story 4

- [X] T072 [US4] Extend keyword rule summaries, recent-use derivation, final-active confirmation, and restore behavior in `src/features/onboarding/keyword-rules.ts`
- [X] T073 [US4] Extend the existing keyword editor with search, language filter, use counts, and confirmation behavior in `src/features/onboarding/KeywordEditor.tsx`
- [X] T074 [US4] Connect persisted keyword management and permission-scope privacy explanation in `app/tracking/keywords.tsx`
- [X] T075 [US4] Implement sender normalization, validation, and trusted-signal safeguards in `src/features/tracking/sender-rules.ts`
- [X] T076 [US4] Implement sender list, save, enable/disable, trust, and custom-remove service methods in `src/services/mocks/automatic-tracking-service.ts`
- [X] T077 [P] [US4] Build searchable recognized/custom sender rows and state handling in `src/features/tracking/SenderRuleList.tsx`
- [X] T078 [US4] Connect sender labels, institution association, trust, enable/disable, search, and custom removal in `app/tracking/senders.tsx`
- [X] T079 [US4] Include keyword and sender active counts and destinations in `src/features/tracking/TrackingStatusScreen.tsx`
- [X] T080 [US4] Add keyword, sender, trust, warning, restore, and permission-scope Arabic/English content in `src/localization/messages/ar.ts` and `src/localization/messages/en.ts`

**Checkpoint**: User Story 4 independently provides safe, bilingual tracking-rule control without
suggesting that rules narrow the Android permission itself.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Complete security, accessibility, dense-data, regression, and native proof across all
delivered stories.

- [X] T081 [P] Add cross-story hidden-balance, source-text, app-preview, accessibility-output, analytics, and safe-error privacy tests in `src/features/tracking/AutomaticTrackingPrivacy.test.tsx`
- [X] T082 [P] Add Arabic RTL, English LTR, mixed-direction, 200% text, grayscale, reduced-motion, and 44-by-44 accessibility tests in `src/features/tracking/AutomaticTrackingAccessibility.test.tsx`
- [X] T083 [P] Add 1,000-event history and 200-item review paging, stable ordering, render-count, and list-performance checks in `src/features/tracking/AutomaticTrackingPerformance.test.tsx`
- [X] T084 Add a full automatic-tracking critical journey covering clear add, review, duplicate, undo, recovery, rules, privacy, and iOS separation in `src/features/tracking/AutomaticTrackingJourney.test.tsx`
- [X] T085 Run typecheck, lint, all Jest suites, Expo dependency check, and existing boundary checks and record results in `specs/005-automatic-tracking/quickstart.md`
- [X] T086 Scan production files for hard-coded user strings, raw brand values, sensitive logs, provider calls, parser claims, camera/receipt scope, and unsupported iOS SMS content and record results in `specs/005-automatic-tracking/quickstart.md`
- [ ] T087 Execute the Android native matrix for permission, settings recovery, pause/resume, restart, background, battery warning, offline fallback, undo deadline, RTL/LTR, themes, 200% text, TalkBack, and device sizes and record evidence in `specs/005-automatic-tracking/android-evidence/`
- [X] T088 Execute the iOS native matrix for route separation, manual/voice fallback, optional capabilities, RTL/LTR, themes, 200% text, VoiceOver, and device sizes and record evidence or the macOS/Xcode blocker in `specs/005-automatic-tracking/ios-evidence/`
- [X] T089 Run every scenario in `specs/005-automatic-tracking/quickstart.md` and update each scenario with PASS, FAIL, or a named native blocker
- [X] T090 Trace FR-001 through FR-037 and SC-001 through SC-011 to implementation and verification evidence in `specs/005-automatic-tracking/validation-results.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **US1, US2, US3, and US5 (Phases 3-6)**: May start independently after Foundational. Deliver in
  P1 order `US1 -> US2 -> US3 -> US5` when one developer is working.
- **US4 (Phase 7)**: May start after Foundational, but follows P1 stories in the recommended
  single-developer sequence.
- **Polish (Phase 8)**: Depends on every story selected for release. T087 and T088 may run in
  parallel on available platform hosts; T090 follows completed evidence.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational and is the MVP.
- **US2 (P1)**: Depends only on Foundational because the shared atomic mutation boundary can
  commit a confirmed review without the US1 demo UI.
- **US3 (P1)**: Depends only on Foundational and reuses existing SPEC-003 permission behavior.
- **US5 (P1)**: Depends only on the Foundational platform guard and existing manual/voice routes.
- **US4 (P2)**: Depends only on Foundational; status count integration with US3 is additive and
  can be validated with fixtures when US3 UI is not yet present.

### Within Each User Story

- Write the listed tests first and confirm they fail for the missing behavior.
- Complete domain/repository/service behavior before route integration.
- Keep financial writes atomic and query invalidation targeted.
- Complete the story checkpoint before treating the story as delivered.

### Parallel Opportunities

- T002-T004 can run in parallel after T001 begins because they touch independent shared files.
- T005, T007, T008, T010, T012, and T015 can run in parallel as initial foundational tests and
  contracts; implementations follow their corresponding tests and prerequisites.
- After Phase 2, US1, US2, US3, US5, and US4 can be assigned to separate developers.
- Within each story, tasks marked `[P]` touch separate tests, mocks, components, or routes and can
  proceed together at the indicated point.
- T081-T083 can run in parallel; Android and iOS native matrices T087-T088 can run in parallel on
  separate hosts.

---

## Parallel Example: User Story 1

```text
T017: Decision policy tests in src/features/tracking/automatic-tracking-policy.test.ts
T018: Atomic financial-effect tests in src/storage/automatic-tracking-financial-effects.test.ts
T019: Undo deadline tests in src/features/tracking/automatic-tracking-undo.test.ts
T020: Feedback component tests in src/features/tracking/AutomaticFeedback.test.tsx
```

## Parallel Example: User Story 2

```text
T032: Review lifecycle tests in src/features/tracking/review-resolution.test.ts
T033: Duplicate resolution tests in src/features/tracking/duplicate-resolution.test.ts
T034: Obligation match tests in src/features/tracking/obligation-match.test.ts
T035: Review route accessibility tests in src/features/tracking/ReviewJourney.test.tsx
```

## Parallel Example: User Story 3

```text
T048: Tracking status tests in src/features/tracking/tracking-status.test.ts
T049: Retention tests in src/storage/automatic-tracking-retention.test.ts
T050: Status and recovery journey tests in src/features/tracking/TrackingStatusJourney.test.tsx
```

## Parallel Example: User Story 5

```text
T061: iOS capability and redirect tests in src/features/tracking/IosPlatformTrackingJourney.test.tsx
T062: iOS localization boundary test in src/localization/automatic-tracking-messages.test.ts
```

## Parallel Example: User Story 4

```text
T069: Keyword rule tests in src/features/onboarding/keyword-rules.test.ts
T070: Sender rule tests in src/features/tracking/sender-rules.test.ts
T071: Rules route tests in src/features/tracking/TrackingRulesJourney.test.tsx
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundational.
2. Complete US1 automatic processing, ledger effects, feedback, and undo.
3. Stop and run the US1 independent test with Android mock fixtures.
4. Demo the automatic-first value before adding review, status, iOS, or advanced rule screens.

### Incremental Delivery

1. Setup + Foundational: typed and durable tracking base.
2. US1: clear automatic capture MVP.
3. US2: uncertainty, duplicate, lifecycle, and obligation trust controls.
4. US3: complete Android status and recovery.
5. US5: complete iOS platform honesty and alternatives.
6. US4: advanced keyword and sender controls.
7. Polish: privacy, accessibility, scale, full regression, and native evidence.

### Parallel Team Strategy

After Foundational, separate owners may implement US1, US2, US3, US5, and US4 concurrently.
Coordinate only changes to `automatic-tracking-service.ts`, `automatic-tracking-repository.ts`,
Home/More integration, and localization catalogs; keep story-specific components and tests isolated.

## Notes

- No task adds a production SMS parser, background reader, bank connection, notification provider,
  AI provider, camera, receipt flow, or iOS SMS permission.
- No task adds a dependency; use the installed stack and existing owners.
- `[P]` means separate files and no incomplete same-phase prerequisite.
- User-story labels provide requirement traceability; setup, foundational, and polish tasks have no
  story label by design.
- Commit after each task or coherent task group and stop at any checkpoint for independent review.

## 2026-09-06 Per-Account Tracking Remediation

- [x] Add account resolution and fail-closed mock financial-effect coverage.
- [x] Keep replay/idempotency checks ahead of the account eligibility decision.
- [x] Add localized blocked-account messaging and contract parity tests.
- [ ] Record independent review and Slice 2 remote CI evidence.
