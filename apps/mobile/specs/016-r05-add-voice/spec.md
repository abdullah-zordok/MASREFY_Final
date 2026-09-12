# Feature Specification: R05 — Add Transaction and Voice Entry

**Feature Branch**: `codex/r01-shared-ui-foundation` (existing worktree reused as requested)

**Created**: 2026-08-15

**Status**: CLOSED / SUPERSEDED (2026-09-11)

**Closure decision**: Do not execute or use this specification as an active dependency. Its
Manual/Voice-in-Add premise was rejected: Add remains manual-only and Voice remains on Home.
All unchecked R05 tasks are cancelled historical backlog, not completed work.

**Input**: Redesign the existing Masarifi Add tab as one focused manual-and-voice capture workspace without changing transaction creation, voice permission, proposal validation, confirmation, privacy, route, or downstream financial behavior.

**Primary source of truth**: `D:\MY Work\0Part_Time\MASREFY _Final\apps\mobile\new_Desinge\REDESIGN_ANALYSIS.md`

**Roadmap area**: R05 — Add Transaction and Voice Entry

## Ownership and Boundaries

R05 owns presentation for:

- `app/(tabs)/add.tsx` — the existing primary Add destination and Manual/Voice mode selection.
- The manual capture screen state currently presented inside the Add tab.
- Voice permission education and recovery states presented inside Add.
- Voice ready, recording, stopping, transcription, transcript review, analysis, proposal review, multi-proposal review, recurring/obligation suggestion, save, success, and recovery states presented inside Add.

R05 owns capture presentation before and through explicit creation of a confirmed transaction. It does not own confirmed transaction history/detail after save (R04), account/category object rules or picker data (R02/R03), automatic SMS detection/review (R06), obligation management (R10), Home composition (R07), or shared R01 presentation.

Entry points remain the center Add tab, Home quick actions, account transfer action, onboarding/manual fallback, tracking fallback, and protected deep links/query context currently supported. Confirmed results continue to enter the normal ledger and downstream projections. No route, permission, business command, or product capability is added or removed.

## Current Capability Baseline

Masarifi currently supports:

- Manual and Voice modes within the same Add tab.
- Manual expense, income, transfer, refund, and obligation-payment capture currently exposed by the form, with feature-owned transaction rules for supported values and relationships.
- Amount, title/purpose, source account, transfer destination or category, current occurrence date/time behavior, and retained transaction relationships.
- Existing account/category data, default selections, validation, saved draft restoration, delayed draft persistence, deliberate discard, duplicate-submit prevention, local/offline outcomes, pending synchronization, and result navigation.
- Voice permission states: not requested, granted, denied, permanently denied, and unavailable, with appropriate retry/settings/manual fallback.
- Voice session states: permission required, ready, recording, stopping, transcribing, transcript review, analyzing, proposal review, saving, saved, failed, and canceled.
- Arabic, English, mixed, single, multiple, missing-account, unknown-merchant, low-confidence, income, transfer, obligation, unsupported-language, no-speech, background-noise, failed-analysis, interrupted, maximum-duration, offline, and save-failure outcomes represented by the existing voice contracts.
- Editable transcript before analysis or confirmation.
- One or more structured proposals with type, amount, currency, merchant/title, payment method, account, transfer destination, category, date, beneficiary, notes, recurring intent, obligation relationship, field assessments, selection, and removal where applicable.
- Confidence rules: 90% or above may be clear; 60% through 89% requires explicit confirmation; below 60% is missing; unresolved required values block saving.
- Confirm selected, confirm all, re-record, cancel, manual fallback, and atomic group save: all selected proposals save or none save and the review remains.
- Existing category-preference choices and recurring/obligation suggestions with explicit confirmation before any related effect.
- Audio deletion after transcription or cancellation and transcript deletion after save or cancellation; only confirmed transaction data and voice source may remain.
- Saved voice transactions entering the normal ledger with voice source and updating existing balances, reports, budgets, and confirmed obligation progress.

All validation, drafts, account/category rules, transaction effects, confidence thresholds, permission mapping, recording duration, transcript/proposal lifecycle, group atomicity, privacy deletion, recurring/obligation confirmation, route results, and downstream updates remain unchanged. R05 changes presentation and usability only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a Capture Method Clearly (Priority: P1)

As a user, I can open Add, understand whether Manual or Voice is active, switch safely, and retain a complete fallback without encountering competing global add actions.

**Why this priority**: Add is the stable center capture destination and must orient the user before either workflow begins.

**Independent Test**: Enter Add from the tab, Home expense/income/transfer/voice shortcuts, account transfer, onboarding, tracking fallback, and a protected deep link; switch modes with empty and meaningful input in Arabic/English and verify current origin/context, permission, and draft behavior.

**Acceptance Scenarios**:

1. **Given** Add opens, **When** Manual or Voice is selected by existing mode context, **Then** one compact mode control communicates selection through label, weight, and structure rather than color alone.
2. **Given** meaningful manual input or a live voice session, **When** the user switches modes or leaves, **Then** current draft/session protection prevents accidental loss or financial change.
3. **Given** Voice is blocked, denied, unavailable, or unwanted, **When** the state appears, **Then** Manual remains a complete one-step fallback in the same Add destination.
4. **Given** Add was opened with existing type/account/context parameters, **When** the chosen mode renders, **Then** currently supported prefill and return behavior remain unchanged.

---

### User Story 2 - Record a Transaction Manually (Priority: P1)

As a user, I can record a supported transaction through an amount-first focused form that shows only fields relevant to the current type and preserves my input through recoverable problems.

**Why this priority**: Manual entry is the universal fallback on both platforms and cannot depend on automation, microphone access, or connectivity.

**Independent Test**: Create every currently exposed manual type with valid/invalid values, transfer destinations, account/category selection, long mixed-script text, keyboard open, saved/restored/discarded draft, offline local save, pending sync, failure, and repeated submission.

**Acceptance Scenarios**:

1. **Given** Manual mode, **When** the form opens, **Then** the hierarchy is transaction type, large amount/currency, title/purpose, account, category or transfer destination, date/time, contextual relationships/details, then one dominant Save action.
2. **Given** expense/income/transfer and other currently exposed supported types, **When** type changes, **Then** only relevant fields remain visible, transfer uses distinct source/destination accounts, and stale incompatible category/destination data is not applied.
3. **Given** account or category selection, **When** a picker opens and returns, **Then** the current draft, keyboard-safe position, selected type, and other field values remain intact.
4. **Given** validation fails, **When** Save is attempted, **Then** each exact issue and correction is identified near the affected field, all valid input remains, and no transaction is created.
5. **Given** a valid offline or online save, **When** the command resolves, **Then** local/pending and synchronized outcomes remain distinct, duplicate submission is prevented, and the confirmed result enters the existing R04 ledger.

---

### User Story 3 - Grant or Recover Voice Permission (Priority: P1)

As a user, I understand why microphone access is requested, what happens if I decline, and how to retry, open settings, or use Manual without being blocked.

**Why this priority**: Permission trust precedes recording and denial must never reduce access to core financial capture.

**Independent Test**: Exercise not-requested, granted, denied, permanently denied, unavailable, canceled system prompt, restored permission, Android, and iOS states, with manual fallback and no financial mutation.

**Acceptance Scenarios**:

1. **Given** permission is not requested, **When** Voice opens, **Then** education explains benefit, microphone use, denial consequence, temporary-data treatment, and Manual fallback before the system prompt.
2. **Given** permission is denied, **When** recovery appears, **Then** the current retry or settings action is offered according to state and Manual remains immediately available.
3. **Given** permission is permanently denied or unavailable, **When** the user returns from settings or chooses Manual, **Then** the session resolves safely and no recording or financial record is created.
4. **Given** permission becomes granted, **When** Voice resumes, **Then** the user reaches Ready and recording never starts before an explicit Start action.

---

### User Story 4 - Record and Review the Transcript (Priority: P1)

As a user, I can start and stop recording, understand its state without relying on animation, inspect and edit the transcript, and choose Analyze, re-record, cancel, or Manual.

**Why this priority**: The transcript is the user's first check that Masarifi heard the intended financial statement.

**Independent Test**: Record clear Arabic, English, and mixed speech; test elapsed duration, maximum warning, stop, cancel, interruption, no speech, noise, unsupported language, offline, transcription failure, transcript editing, re-record, reduced motion, and screen reader.

**Acceptance Scenarios**:

1. **Given** Ready, **When** Start is activated, **Then** state text, elapsed time, Stop, and Cancel are available, and waveform/activity remains supplemental.
2. **Given** recording approaches or reaches the existing maximum duration, **When** the state changes, **Then** warning and stop outcome are textual and no valid captured input is silently discarded.
3. **Given** transcription succeeds, **When** Transcript Review opens, **Then** the complete transcript is visible and editable before Analyze or any financial creation.
4. **Given** recording or transcription is interrupted, noisy, empty, unsupported, offline, or failed, **When** recovery appears, **Then** it states what remains, what changed, and offers only current retry/re-record/edit/manual/cancel actions.
5. **Given** re-record or cancel, **When** it completes, **Then** no transaction is created and temporary audio/transcript deletion follows existing privacy rules.

---

### User Story 5 - Resolve One Voice Proposal (Priority: P1)

As a user, I can review one structured proposal, see exactly which fields are clear, uncertain, missing, or conflicting, correct them, and explicitly confirm the exact transaction to save.

**Why this priority**: Voice is useful only when its intelligence is explainable and no uncertain financial result is silently applied.

**Independent Test**: Review clear, missing-account, unknown-merchant, unsupported-currency, low-confidence, transfer, income, obligation-payment, category-preference, ambiguous/future-date, and save-failure proposals with every field assessment boundary.

**Acceptance Scenarios**:

1. **Given** analysis completes, **When** proposal review opens, **Then** type, amount/currency, merchant/title, payment method, funding account, destination/category, date, relationships, and selection are structured in the same hierarchy as manual Add.
2. **Given** a field is 90% or above, 60–89%, below 60%, or conflicting, **When** it renders, **Then** the current clear/confirm/missing/conflict rule is expressed by field name and reason rather than a generic percentage or color alone.
3. **Given** a required value is unresolved, **When** Save is attempted, **Then** saving is blocked, the exact field is focused or announced, and all valid transcript/proposal edits remain.
4. **Given** payment method and funding account, **When** they appear, **Then** they are visibly and accessibly distinct choices.
5. **Given** the user changes a suggested category, **When** the existing preference choice appears, **Then** one-time, always-for-merchant, and not-now meanings remain explicit and no broader rule is applied without confirmation.
6. **Given** the proposal is valid, **When** the user confirms, **Then** only the displayed confirmed values are created with voice source and the exact local/sync result is shown.

---

### User Story 6 - Review Multiple Voice Proposals Atomically (Priority: P1)

As a user, I can review, edit, select, remove, and confirm multiple transactions independently while understanding the scope of Confirm selected and Confirm all.

**Why this priority**: One recording may describe several financial events; an ambiguous group action could create unintended records.

**Independent Test**: Analyze 2–10 proposals with mixed validity, edit/remove/select individual proposals, confirm selected, confirm all, re-record, cancel, fail one selected item, retry, and verify sibling proposals and atomic save.

**Acceptance Scenarios**:

1. **Given** multiple proposals, **When** review opens, **Then** each proposal has a clear position/identity, independent selection, fields, uncertainty, and remove action without nested-card clutter.
2. **Given** one proposal is edited or removed, **When** the group updates, **Then** all sibling proposals retain their prior values and selection.
3. **Given** Confirm selected or Confirm all, **When** it is activated, **Then** the exact scope and count are stated before one atomic save outcome.
4. **Given** any selected proposal fails validation or saving, **When** the group operation resolves, **Then** none of the selected proposals are saved and the complete reviewed group remains available for correction/retry.
5. **Given** all selected proposals save, **When** success appears, **Then** each becomes a normal R04 ledger record with voice source and no duplicate submission.

---

### User Story 7 - Confirm Recurring or Obligation Meaning Safely (Priority: P2)

As a user, I can decide whether a spoken activity is one-time, recurring, linked to an existing obligation, or intended to create an obligation handoff, and understand the financial consequence before confirmation.

**Why this priority**: These relationships can affect future records and planning progress and must remain subordinate to explicit user choice.

**Independent Test**: Review one-time, weekly/monthly recurring, zero/one/multiple obligation matches, existing-obligation link, new-obligation handoff, conflicting match, cancellation, and group-save failure.

**Acceptance Scenarios**:

1. **Given** recurring intent is detected, **When** review opens, **Then** one-time and recurring choices are explained and no recurring relationship is created automatically.
2. **Given** one or more obligation candidates, **When** the user reviews them, **Then** candidate identity and current consequence are explicit and ambiguous matches require selection.
3. **Given** a new-obligation choice, **When** selected, **Then** the current R10 handoff/preview occurs before any obligation is created.
4. **Given** an existing obligation payment is confirmed, **When** save succeeds, **Then** the transaction and supplied obligation progress update as one user-visible outcome according to current rules.

### Edge Cases

- Add opens with unsupported, stale, or conflicting route context.
- There are no eligible accounts or categories, or a selection becomes archived while a draft/proposal is open.
- Manual amount is empty, zero, invalid, extremely large, or difficult to read with currency in RTL.
- Transfer source and destination are the same, missing, archived, or different currencies under current rules.
- Meaningful draft persistence fails, is restored after interruption, or the user attempts to discard while saving.
- Permission changes while Voice is open or while returning from system settings.
- Recording is interrupted by a call/backgrounding, reaches maximum duration, contains no speech/noise, or uses unsupported/mixed language.
- Transcript is empty, very long, edited after analysis, or contains multiple currencies/dates.
- A proposal has missing/conflicting required fields, optional missing fields, ambiguous future date, unknown merchant, or unsupported category/account.
- All proposals are removed, none selected, one sibling changes during review, or the group exceeds the current proposal limit.
- Save is repeated, fails before any record, fails during atomic group validation, succeeds locally offline where supported, or remains pending sync.
- Audio/transcript cleanup is interrupted; no temporary source content may leak through errors, analytics, accessibility, screenshots, or app-switcher previews.

## Redesign Scope

- Recompose Add into one compact Manual/Voice mode control and one active focused workflow; retain the center Add tab as the sole global capture action.
- Redesign manual entry as amount-first, with compact transaction-type choice, R02/R03 picker rows, contextual transfer/category/relationship fields, keyboard-safe primary action, inline validation, draft protection, and truthful local/sync feedback.
- Remove normal-product dependence on development/demo scenario controls; existing representative scenarios remain available through approved validation/development presentation rather than competing with the user task.
- Define a visible voice sequence: education/permission → ready/recording → transcript → analysis → proposal(s) → uncertainty resolution → exact confirmation → local/synced result.
- Use activity/waveform only as supplemental recording feedback; keep state text, elapsed time, controls, and reduced-motion equivalence authoritative.
- Recompose proposal review around field meaning and exact uncertainty reason, using compact type/payment choices and R02/R03 pickers instead of long radio-card walls.
- Give multiple proposals a clear group scope without nesting every field inside competing elevated cards.
- Present recurring/obligation suggestions as explicit decisions and handoffs, not automatic additions.
- Apply R01 semantic forms, Source Mark, feedback, overlays, amount formatting, privacy, motion, direction, and accessibility.

## Non-Goals

- No transaction type, required field, validation, draft, save, account/category, confidence, group-atomicity, recurring/obligation, or financial-effect change.
- No new speech model, AI/provider call, production service, bank connection, SMS automation, receipt capture, or permission.
- No route addition, removal, rename, or central Add-tab meaning change.
- No ownership of automatic SMS review, confirmed ledger/detail, account/category management, obligation management, Home, Reports, Notifications, or Assistant.
- No retention of audio/transcript beyond current deletion points and no presentation-layer parsing or financial calculation.
- No feature-local raw colors, duplicate design system, motion library, or bottom-sheet dependency for polish alone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: R05 MUST preserve the existing Add route, center-tab meaning, entry points, protected navigation, supported context parameters, and confirmed result destination.
- **FR-002**: Manual and Voice MUST remain two modes of the same Add destination with one clearly selected compact control and complete Arabic/English labels.
- **FR-003**: Switching mode or leaving MUST preserve or deliberately resolve meaningful manual drafts and active voice sessions according to current behavior.
- **FR-004**: Manual entry MUST remain available from every blocking voice permission, recording, transcription, analysis, review, or save-failure state.
- **FR-005**: Manual form hierarchy MUST be type, amount/currency, title/purpose, account, category or transfer destination, date/time, contextual relationships/details, then Save.
- **FR-006**: Manual mode MUST expose only currently supported transaction types and MUST retain all existing type-specific financial rules.
- **FR-007**: Small type choices MUST use a compact mutually exclusive control when labels fit accessibly; at 200% text they MUST reflow to an equally clear accessible alternative rather than shrink.
- **FR-008**: Amount, sign, decimal, and currency MUST use approved locale-aware formatting and intentional bidi isolation with English numerals in both languages.
- **FR-009**: Account and category selection MUST consume R02/R03 picker contracts and preserve the entire manual draft and caller position.
- **FR-010**: Transfer mode MUST distinguish source and destination, prevent the currently invalid same-account outcome, and not present an expense category by default.
- **FR-011**: Contextual recurring or obligation relationships MUST appear only when relevant and MUST retain current explicit confirmation rules.
- **FR-012**: Manual validation MUST identify each affected field, preserve every valid value, and create no transaction on failure.
- **FR-013**: Meaningful manual drafts MUST retain current save/restore/discard and accidental-navigation protection behavior.
- **FR-014**: Manual Save MUST prevent duplicate submission and distinguish working, saved local/pending sync, synchronized success, validation failure, operation failure, and conflict where supplied.
- **FR-015**: Voice permission education MUST precede the system request and explain purpose, data use, denial consequence, settings/retry path, and Manual fallback.
- **FR-016**: Voice permission presentation MUST distinguish not requested, granted, denied, permanently denied, and unavailable states and invoke only current valid recovery.
- **FR-017**: Recording MUST start only after explicit permission and Start action, and expose state text, elapsed duration, Stop, Cancel, and maximum-duration warning.
- **FR-018**: Recording meaning MUST remain complete without waveform, color, motion, sound, or haptics; reduced motion MUST retain state text and controls.
- **FR-019**: The transcript MUST be visible and editable before analysis confirmation or financial creation.
- **FR-020**: Re-record, cancel, interruption, no speech, background noise, unsupported language, transcription/analysis failure, and offline recovery MUST preserve any valid allowed input and MUST create no financial record.
- **FR-021**: Proposal review MUST present all applicable current fields and visibly distinguish payment method from funding account.
- **FR-022**: Field assessment MUST retain the current thresholds: 90% or above may be clear, 60–89% requires explicit confirmation, and below 60% is missing.
- **FR-023**: Unresolved required or conflicting values MUST block saving, identify the exact field/reason, preserve all proposal/transcript edits, and move or announce focus appropriately.
- **FR-024**: Optional missing values MUST not block saving where current validation permits it.
- **FR-025**: Category correction MUST retain current one-time, always-for-merchant, and not-now choices without applying a broader preference silently.
- **FR-026**: One recording MUST continue to support one through the current maximum number of independent proposals.
- **FR-027**: Each proposal MUST support current independent selection, editing, uncertainty resolution, and removal without changing sibling proposals.
- **FR-028**: Confirm selected and Confirm all MUST state scope/count and retain the current all-or-none atomic save behavior.
- **FR-029**: If any selected proposal fails validation or saving, no selected proposal may be saved and the full reviewed group MUST remain available for recovery.
- **FR-030**: No voice-derived transaction MAY be created until the user has reviewed the transcript/proposal and explicitly confirmed the exact selected result.
- **FR-031**: Recurring, existing-obligation, and new-obligation suggestions MUST remain proposals with explicit consequence and confirmation; ambiguous matches MUST require selection.
- **FR-032**: A confirmed obligation payment MUST preserve the existing atomic transaction and obligation-progress outcome; R10 retains obligation management ownership.
- **FR-033**: Saved voice transactions MUST enter R04 with voice source and update only the existing feature-owned downstream projections.
- **FR-034**: Audio MUST be deleted after transcription or cancellation and transcript after save or cancellation according to current privacy rules; no raw audio/transcript may remain in confirmed records.
- **FR-035**: Temporary audio, transcript, proposal, source, and financial values MUST be protected from errors, analytics, accessibility leaks, screenshots/evidence, notifications, and app-switcher presentation.
- **FR-036**: Voice loading, processing, proposal, uncertainty, local/pending save, synchronized success, failure, offline, permission, and canceled states MUST be textually distinct.
- **FR-037**: Arabic RTL and English LTR MUST expose identical manual fields, voice controls, transcript actions, proposal explanations, consequences, and recovery.
- **FR-038**: Natural Arabic, English, and mixed speech-derived content, amounts, currencies, dates, merchants, accounts, and references MUST remain intentionally ordered and readable.
- **FR-039**: Every control MUST meet the 44-by-44-point minimum target and remain usable with screen readers, keyboard, safe areas, smallest supported phone, and 200% text.
- **FR-040**: Screen-reader order MUST follow mode → active task state → fields/content → uncertainty/recovery → primary action and MUST not announce hidden or deleted temporary content.
- **FR-041**: Motion MUST be brief and consequential; no bouncing record control, delayed amount animation, shaking field, or celebratory interruption is permitted, and reduced motion retains immediate state meaning.
- **FR-042**: R05 MUST reuse R01 focused forms, segmented choices, picker rows, overlays, state feedback, Source Mark, amount/date formatting, privacy, direction, motion, and accessibility contracts.
- **FR-043**: R05 MUST consume R02 account and R03 category selectors, create R04 confirmed results, and use R10 obligation handoff/presentation where applicable without duplicating their rules.
- **FR-044**: R05 MUST introduce no new business calculation, route, permission, provider, production data source, or unsupported capture capability.
- **FR-045**: Normal product presentation MUST prioritize real capture; representative demo/scenario selection may remain only in an approved development/validation context without deleting the testing capability.
- **FR-046**: Downstream regression MUST cover R02/R03 selection return, R04 ledger results, R07 Home entries, R08–R12 financial projections, R14 notifications where applicable, and onboarding/tracking manual fallbacks.

### Constitution Requirements *(mandatory)*

- **Platform behavior**: Android and iOS retain the same manual and voice value with platform-appropriate microphone recovery; Android SMS automation remains outside R05 and Manual remains universal fallback.
- **Financial trust**: Manual validation, transcript, structured proposals, uncertainty, recurring/obligation effects, group scope, exact confirmation, and local/sync outcomes are explicit; no unconfirmed record is created.
- **Localization and accessibility**: Arabic RTL and English LTR have complete parity, English numerals, mixed-direction isolation, screen-reader state/order, 200% text, keyboard/safe-area access, reduced motion, and minimum targets.
- **UI states and tokens**: R01 semantic forms, amount/source/status, feedback, overlays, privacy, and motion govern every manual and voice state; unknown values never appear confirmed.
- **Verification**: Independent functional and real-device evidence are required for the mode selector, manual form, permission, recording, transcript, single proposal, multiple proposals, recurring/obligation decisions, and result/recovery states.

### Shared Dependencies

- **R01**: focused forms, segmented controls, picker rows, overlays, StateView/feedback, Source Mark, amounts/dates, sensitive values, semantic tokens, direction, motion, keyboard/safe-area, and accessibility.
- **R02**: account identity/selection; **R03**: category identity/selection; **R04**: confirmed transaction result and edit-form alignment; **R10**: obligation selection/handoff and consequence presentation.
- **Feature-owned data**: current transaction draft/save, permission adapter, voice session state machine, transcript/analyzer results, proposal validation, atomic group save, category preference, recurring/obligation handoff, privacy cleanup, and downstream invalidation remain authoritative.
- **Downstream consumers**: R04, R07, R08–R12, R14, R19/R20 entry/recovery, and R21 validation require regression checks for confirmed manual/voice results and fallback behavior.

### Key Entities

- **Manual Transaction Draft**: Current type, amount, title/purpose, account, destination/category, date, and supported relationships retained until saved or deliberately discarded.
- **Voice Capture Session**: Temporary permission, recording, transcript, analysis, proposal, error, and cleanup state for one user-initiated attempt.
- **Voice Transcript**: Editable temporary Arabic/English/mixed text derived from recording and deleted at the current lifecycle boundary.
- **Voice Transaction Proposal**: One not-yet-saved structured transaction with field assessments, corrections, relationships, selection, and exact confirmation state.
- **Proposal Group**: One recording's independently reviewable proposals with group scope and all-or-none save outcome.
- **Recurring or Obligation Suggestion**: A proposed relationship with no effect until the current explicit preview/confirmation and owner handoff.

## State Matrix

| Screen/state group | Required states |
|---|---|
| Add mode selector | manual selected, voice selected, long labels/200% text, meaningful manual draft, active voice session, route context, safe switch/cancel |
| Manual form | loading dependencies, ready, keyboard open, each supported type, no eligible account/category, validation, restored/unsaved draft, saving, local/pending, success, failure/retry, conflict where supplied |
| Voice permission | not requested, granted, denied, permanently denied, unavailable, requesting, settings return, manual fallback |
| Voice recorder | ready, recording, elapsed, near/max duration, stopping, cancel, interrupted, reduced motion, background/foreground recovery |
| Transcript/analysis | transcribing, transcript ready/editing, empty/long/mixed transcript, analyzing, offline, no speech, noise, unsupported language, analysis failure, re-record/manual/cancel |
| Single proposal | clear, confirm, missing, conflict, invalid required, optional missing, transfer, income, obligation, category preference, date confirmation, saving, save failure, success |
| Multiple proposals | 2–10 proposals, selected/unselected, edited, removed, none selected, mixed validity, confirm selected/all, atomic saving, group failure/retry, success |
| Recurring/obligation | one-time, recurring, zero/one/multiple matches, existing obligation, new-obligation handoff, conflict, confirmation, failure/success |
| Completion/recovery | saved locally/pending, synchronized, failed, duplicate-submit blocked, canceled, cleanup complete/failed-safe, R04 result navigation |

## Trust, Privacy, Localization, and Accessibility

- Manual/voice financial values, transcript, temporary audio, merchant, account/category, date, beneficiary, notes, and obligation context follow existing sensitivity and hidden-value rules.
- Nothing is created during recording, transcription, analysis, or proposal review; exact confirmation is the first point at which current save commands may run.
- Temporary audio/transcript cleanup follows current lifecycle rules and no raw provider or source content appears in user errors or retained evidence.
- Arabic and English expose identical permission education, manual fields, recording controls, transcript edit, uncertainty reasons, proposal actions, and consequences.
- Numeric/currency/date/reference content uses approved shared formatting and bidi isolation; natural speech text remains editable without forced reordering.
- Screen-reader live state is concise and does not repeatedly announce elapsed/waveform noise; primary state and available action remain clear.
- At 200% text, type/mode controls adapt, fields and proposal sections stack, rows grow, keyboard actions remain reachable, and no required control clips.
- Haptics/waveform/motion remain supplemental and respect platform/reduced-motion settings.

## Navigation and Connections

- Add remains the center primary tab and accepts existing entry context from Home, Accounts, onboarding, tracking, and protected links.
- Manual/Voice switches stay inside Add; they do not create parallel routes or reset unrelated tab state.
- R02/R03 picker select/cancel/create-return preserves the current manual/proposal draft and exact origin.
- Confirmed manual/voice results enter R04 and update existing feature-owned financial scopes; failed/canceled attempts create nothing.
- Obligation decisions use R10-owned handoff and return to the same proposal context; R05 does not duplicate obligation management.
- Authentication, unlock, microphone system prompts, and platform settings remain owned by their current shell/adapter behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of users choose Manual or Voice and begin the intended capture task within 10 seconds of opening Add.
- **SC-002**: At least 90% complete a simple manual expense or income within 60 seconds on the first attempt, while 100% of invalid attempts retain valid input.
- **SC-003**: At least 90% record, review, and save a clear single voice transaction within 90 seconds without assistance.
- **SC-004**: 100% of voice tests show an editable transcript and structured proposal before creating any financial record.
- **SC-005**: 100% of field-assessment tests apply the current thresholds correctly; unresolved required/conflicting fields block save and preserve review.
- **SC-006**: At least 90% of users distinguish payment method from funding account and resolve a missing or uncertain field within 30 seconds.
- **SC-007**: 100% of multi-proposal tests preserve sibling edits, support selection/removal, state group scope, and save all selected records or none.
- **SC-008**: Zero recurring items, new obligations, or obligation links are created without explicit current preview and confirmation.
- **SC-009**: At least 90% of users recover from each permission, recording, transcript, analysis, or save problem—or reach Manual—within 30 seconds.
- **SC-010**: Privacy validation finds zero retained audio after transcription/cancel, zero retained transcript after save/cancel, and zero temporary voice-content leaks through hidden visual output, accessibility, errors, analytics/evidence, notifications, or app-switcher presentation.
- **SC-011**: All critical manual and voice journeys complete in Arabic RTL and English LTR, light/dark, 200% text, smallest supported phone, keyboard, screen reader, and reduced motion with no hidden transcript/uncertainty/action or target below 44 by 44 points.
- **SC-012**: Regression validation finds zero changes to transaction validation/effects, draft lifecycle, confidence rules, permission mapping, recording limit, group atomicity, privacy cleanup, routes, or downstream financial results.

## Assumptions

- The approved compatible-redesign direction and R05 roadmap ownership remain unchanged.
- R01 is approved before implementation; R02/R03 selectors and R04 confirmed transaction presentation are available before their contracts are adopted.
- Existing manual draft/save, voice permission/recording/transcript/proposal state, mock/provider boundaries, confidence validation, group atomicity, cleanup, and downstream financial commands remain authoritative.
- Existing representative demo scenarios remain validation capability; the normal redesigned product screen prioritizes actual capture and does not expose scenario selection as the primary task.
- Voice remains available on both platforms with platform-appropriate microphone permission behavior; SMS automation remains owned by R06/R20.
- Real-device validation and validation-fix tasks will be detailed during `/tasks`; this `/specify` phase changes no production code.

