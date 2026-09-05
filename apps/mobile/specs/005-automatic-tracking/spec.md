# Feature Specification: Automatic Transaction Capture and Platform-Specific Tracking

**Feature Branch**: Not created (no branch hook configured)

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Create SPEC-005 - Automatic Transaction Capture and Platform-Specific Tracking from the complete Masarifi Mobile Frontend SpecKit Master."

## Clarifications

### Session 2026-08-09

- Q: What confidence bands control automatic addition, review, and ignore behavior? -> A: 90% auto-add; 60-89% review; below 60% ignore.
- Q: How long may the full detected message text remain available? -> A: Local-only for up to 30 days, with earlier user deletion.
- Q: How long is immediate undo available after an automatic addition? -> A: 30 seconds; edit remains available afterward.
- Q: What does merging a duplicate detection do? -> A: Keep the existing record and add only missing details after confirmation.
- Q: How should later completion, reversal, refund, or failure messages affect a pending event? -> A: Update or link to the original event; review uncertain matches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture Clear Android Transactions Automatically (Priority: P1)

As an Android user who has enabled tracking, I can have clear eligible financial messages
turned into transactions automatically and receive immediate, reversible feedback.

**Why this priority**: Automatic capture is Masarifi's primary Android value and reduces the
manual effort that causes users to abandon expense tracking.

**Independent Test**: Enable tracking and process representative clear purchase, withdrawal,
deposit, salary, transfer, refund, fee, subscription, and installment examples; verify the
result, affected financial views, notification, source explanation, and undo or edit path.

**Acceptance Scenarios**:

1. **Given** tracking and permission are enabled on Android, **When** a clear successful
   financial message is detected, **Then** one correctly structured transaction is added and
   its source, amount, type, account context, category, and detection time are understandable.
2. **Given** a transaction is added automatically, **When** feedback appears, **Then** the user
   can view or edit it and can undo it for 30 seconds.
3. **Given** an automatic transaction affects balances, budgets, reports, or an obligation,
   **When** it is added or undone, **Then** every affected visible summary remains consistent.
4. **Given** a message represents failure, an authentication code, marketing, or an unresolved
   amount conflict, **When** it is evaluated, **Then** it is not silently added as a transaction.
5. **Given** a later message completes, reverses, refunds, or fails a known pending event,
   **When** the relationship is clear, **Then** the original event is updated or linked rather
   than duplicated; an uncertain relationship enters review.

---

### User Story 2 - Review Uncertain or Duplicate Detections (Priority: P1)

As a user, I can review uncertain, conflicting, or possibly duplicate detections before they
change my financial records.

**Why this priority**: Automation is trustworthy only when ambiguity is visible and the user
retains control over financial changes.

**Independent Test**: Process examples with multiple amounts, unknown merchants, low category
confidence, possible reversals, ambiguous accounts, duplicate candidates, and conflicting
rules; verify that none is committed without the required choice.

**Acceptance Scenarios**:

1. **Given** a detected item has unresolved or conflicting information, **When** analysis
   completes, **Then** it enters the review queue with plain-language reasons and no hidden
   financial change.
2. **Given** a review item, **When** the user confirms or edits it, **Then** the exact approved
   transaction is recorded and the queue status updates.
3. **Given** a possible duplicate, **When** comparison opens, **Then** the new and existing
   records, match reasons, and keep-existing, keep-new, keep-both, and merge choices are clear.
4. **Given** the user ignores or reports a detection, **When** the action completes, **Then** no
   transaction is added and the outcome is clearly acknowledged.

---

### User Story 3 - Control and Recover Android Tracking (Priority: P1)

As an Android user, I can understand tracking status, pause or resume it, recover from
permission or service problems, and continue using Masarifi when tracking is unavailable.

**Why this priority**: Automatic capture is optional and must never trap or exclude users when
permission, background operation, or connectivity changes.

**Independent Test**: Exercise not-requested, granted, denied, permanently denied,
system-disabled, paused, interrupted, battery-restricted, offline, and restored states and
verify the explanation and next action for each.

**Acceptance Scenarios**:

1. **Given** the user opens tracking status, **When** the screen loads, **Then** current tracking,
   permission, recent detection, review count, active rules, background state, and last update
   are understandable without technical diagnostics.
2. **Given** permission is denied or disabled, **When** recovery is shown, **Then** the user sees
   the consequence and the appropriate retry, settings, or continue-without-tracking action.
3. **Given** tracking is active, **When** the user pauses it, **Then** future automatic capture
   stops, existing transactions remain intact, and resuming is available.
4. **Given** tracking or connectivity fails, **When** the user continues elsewhere, **Then**
   accounts, transactions, and manual entry remain usable.

---

### User Story 4 - Manage Detection Rules (Priority: P2)

As an Android user, I can manage financial keywords and sender rules so automatic tracking
better reflects the messages and institutions relevant to me.

**Why this priority**: Rule controls improve relevance and transparency after the primary
capture and review paths are available.

**Independent Test**: Add, search, disable, restore, and remove Arabic and English keywords and
custom senders, including duplicates, empty groups, long labels, and recent-use counts.

**Acceptance Scenarios**:

1. **Given** default and custom keyword packs, **When** the user searches or filters them, **Then**
   Arabic and English rules, group, state, and recent use are clear.
2. **Given** a duplicate keyword or an attempt to disable every keyword in a group, **When** the
   user saves, **Then** duplication is prevented and the risky group change is explained.
3. **Given** a recognized or custom sender, **When** the user manages it, **Then** they can label,
   associate, trust, enable, disable, search, or remove it as applicable.
4. **Given** rules are edited, **When** the change is saved, **Then** the UI explains that rules
   influence matching after permission and do not limit the operating-system permission itself.

---

### User Story 5 - Use Honest iOS Capture Alternatives (Priority: P1)

As an iOS user, I can understand that direct SMS inbox tracking is unavailable and use clear
manual, voice, and approved platform alternatives without seeing Android-only claims.

**Why this priority**: Platform honesty is required for trust and gives iOS users a complete,
useful path without promising unavailable access.

**Independent Test**: Open every tracking-related entry point on iOS and verify that no SMS
permission or background SMS claim appears and that supported alternatives remain reachable.

**Acceptance Scenarios**:

1. **Given** an iOS device, **When** the user reaches capture setup or tracking settings, **Then**
   no direct SMS permission, inbox-reading claim, Android service state, keyword, or sender
   management control is shown.
2. **Given** the iOS platform explanation, **When** the user chooses an alternative, **Then**
   manual entry, voice entry, optional Shortcuts, App Intents, Share Extension, quick actions,
   or widget setup is offered only where supported.
3. **Given** an optional iOS automation is unavailable or skipped, **When** setup ends, **Then**
   the application remains fully usable through manual and voice capture.

### Edge Cases

- A message contains no amount, several amounts, an unsupported currency, mixed Arabic and
  English text, malformed dates, or an unusually long merchant name.
- Two messages describe the same transaction with slightly different times, labels, or amounts.
- A pending or held transaction is later completed, reversed, refunded, or reported failed;
  a clear match updates or links to the original while an uncertain match enters review.
- A sender is unknown, spoofed, renamed, disabled, or associated with more than one institution.
- The likely account is archived, missing, or conflicts with the message's last four digits.
- A keyword appears in an authentication code, marketing message, or non-financial sentence.
- Every keyword in a group is disabled, default packs are restored, or a custom keyword matches
  an existing rule in another language or letter case.
- An installment or recurring payment matches zero, one, or several obligations.
- Undo is requested after related views have updated or after its immediate window has expired.
- Permission changes in system settings while the app is open, background operation is
  restricted, the service is interrupted, or the device is offline.
- A tracking event arrives while the user is reviewing another item, editing a transaction,
  changing language, or hiding balances.
- Arabic content expands or text reaches 200% while reasons, amounts, and actions remain visible.

## Requirements *(mandatory)*

### Scope Boundaries

This specification owns the user-facing automatic-capture experience: Android tracking
status and recovery, simulated financial message detection, automatic-add decisions, review
and duplicate resolution, keyword and sender management, obligation-match review, tracking
feedback, and honest iOS alternatives.

It consumes the permission education and onboarding entry points from SPEC-003 and creates or
updates records displayed by SPEC-004. Voice recording and analysis belong to SPEC-006.
Production SMS parsing, production background infrastructure, production notifications,
backend synchronization, direct bank connections, camera capture, receipts, and investments
are excluded from this frontend specification.

### Functional Requirements

- **FR-001**: Android MUST present automatic financial-message tracking as an optional primary
  capture path after explicit education and consent.
- **FR-002**: Tracking refusal, denial, pause, interruption, or failure MUST NOT block Home,
  accounts, transaction history, or manual entry.
- **FR-003**: The tracking status experience MUST communicate enabled or disabled state, SMS
  permission, latest detection, latest successful transaction, monthly detection count,
  review count, active keyword count, active sender count, background state, and last update.
- **FR-004**: Users MUST be able to enable, pause, resume, open relevant settings, manage
  keywords, manage senders, open review, run a demonstration, and clear local tracking history.
- **FR-005**: Clearing local tracking history MUST explain what is removed, preserve posted
  financial transactions, and require explicit confirmation.
- **FR-006**: The experience MUST distinguish purchase, withdrawal, deposit, salary, incoming
  transfer, outgoing transfer, refund, reversal, fee, subscription, installment, failed, and
  pending or held events.
- **FR-007**: Each detection MUST retain source, event meaning, status, available financial
  fields, confidence, and plain-language reasons sufficient for feedback or review.
- **FR-008**: A detected item MAY be added automatically only when overall confidence is at
  least 90% and it is a clear successful financial event with one unambiguous amount, a valid
  currency, no duplicate, no failure or authentication-code signal, sufficient type confidence,
  and sufficient classification confidence; account matching MAY remain optional when the
  product rule permits it. Items from 60% through 89% confidence MUST enter review, while items
  below 60% MUST be ignored without changing financial records and remain identifiable in local
  tracking history.
- **FR-009**: Failed transactions, authentication codes, marketing messages, duplicates, and
  unresolved amount conflicts MUST NOT be silently added.
- **FR-010**: Uncertain detections MUST enter review when amount, status, merchant, category,
  reversal meaning, duplicate probability, obligation, account, or user rules remain ambiguous.
- **FR-011**: Review items MUST display extracted values, low-confidence or missing fields,
  plain-language review reasons, source context allowed by privacy settings, and affected
  financial relationships.
- **FR-012**: Review MUST support confirm, edit, account selection, category selection,
  obligation linking, keep both, merge, ignore, and report-wrong-detection actions when relevant.
- **FR-013**: No review-required item MAY change a financial record before the user approves the
  exact result.
- **FR-014**: Duplicate comparison MUST show the new and existing candidates, amount, time,
  merchant, account, source, and match reasons and offer keep-existing, keep-new, keep-both,
  and merge-details choices. Merge MUST keep the existing transaction as the financial record,
  add only missing merchant, category, account hint, reference, or source details after explicit
  confirmation, mark the new candidate as a resolved duplicate, and MUST NOT overwrite amount,
  currency, date, or account without a separate edit confirmation.
- **FR-015**: Every automatic addition MUST expose its automatic source and provide view and
  edit actions plus a 30-second undo action. After undo expires, edit, correction, and detail
  access MUST remain available.
- **FR-016**: Adding, editing, merging, or undoing an automatic transaction MUST keep all
  affected account, ledger, budget, report, and obligation summaries consistent.
- **FR-017**: Automatic-add feedback MUST state the amount, merchant or purpose, and category
  when known without exposing masked information.
- **FR-018**: A likely obligation payment MUST present the suggested match using provider,
  amount, due date, account, masked digits, reference, and installment position when available.
- **FR-019**: One clear obligation match MAY update the transaction and obligation payment,
  paid and remaining amounts, completed installment count, and next due date together.
- **FR-020**: Multiple or conflicting obligation matches MUST enter review and MUST NOT silently
  update either the transaction ledger or an obligation.
- **FR-021**: Keyword management MUST support grouped default and custom Arabic and English
  rules, add, search, language filtering, disable, re-enable, custom deletion, default restore,
  duplicate prevention, and recent-use counts.
- **FR-022**: Disabling every keyword in a group MUST require a warning and deliberate
  confirmation.
- **FR-023**: Keyword privacy guidance MUST state that matching occurs inside Masarifi after
  permission and that keyword choices do not narrow operating-system permission.
- **FR-024**: Sender management MUST support recognized and custom senders, search, labels,
  institution association, trusted state, enable or disable, custom removal, and unknown-sender
  review.
- **FR-025**: Sender trust MUST remain a user-controlled matching signal and MUST NOT bypass
  duplicate, failure, ambiguity, or review safeguards.
- **FR-026**: Permission and tracking recovery MUST distinguish not requested, granted, denied,
  permanently denied, disabled in system settings, paused, interrupted, battery restricted,
  offline, and restored states.
- **FR-027**: Each recovery state MUST explain the effect and offer the appropriate retry,
  settings, resume, manual-review, or continue-without-tracking action.
- **FR-028**: iOS MUST NOT display or imply direct SMS inbox access, SMS permission, Android
  background tracking, or Android-only keyword and sender controls.
- **FR-029**: iOS MUST provide manual and voice capture and MAY present optional Shortcuts, App
  Intents, Share Extension, quick actions, and widget setup only when supported and accurately
  described.
- **FR-030**: Optional iOS setup failure or refusal MUST leave manual and voice capture usable.
- **FR-031**: Tracking status, detections, review, rules, permission recovery, and platform
  explanation MUST support loading, empty, error, offline, partial, disabled, and pending-update
  states with actionable recovery.
- **FR-032**: Sensitive source content and financial values MUST follow the global masking rule
  in screens, notifications, accessibility output, app previews, errors, and analytics. Full
  detected message text MUST remain local-only, be removable earlier through clear-history
  controls, and be deleted no later than 30 days after detection; extracted transaction fields,
  source type, and non-sensitive review reasons MAY remain with the financial record.
- **FR-033**: All user-facing content and states MUST provide complete Arabic RTL and English
  LTR parity, English numerals with locale-aware formatting, and intentional mixed-direction
  handling for senders, institutions, references, currency, and amounts.
- **FR-034**: Controls MUST meet a 44-by-44 minimum target, remain usable at 200% text size,
  expose logical screen-reader order and labels, and communicate status without color, motion,
  icon, or haptic feedback alone.
- **FR-035**: Automatic and review outcomes MUST use calm, specific language and MUST NOT expose
  raw service errors or internal analysis details.
- **FR-036**: The frontend phase MUST demonstrate clear, uncertain, duplicate, obligation,
  permission, service, and iOS-alternative scenarios without claiming production SMS parsing
  or production automation.
- **FR-037**: A later completion, reversal, refund, or failure event MUST update or link to the
  original pending event when the relationship is clear and MUST enter review when that
  relationship is uncertain; it MUST NOT create an unrelated ordinary expense silently.

### Constitution Requirements *(mandatory)*

- **Platform behavior**: Android receives the explicit education, permission, status, rules,
  automatic-add, review, and recovery experience. iOS receives no SMS claim and retains manual,
  voice, and accurately supported platform alternatives. Every automated path has a manual
  fallback and cannot block the core application.
- **Financial trust**: Clear automatic additions expose source, notification, undo, edit, and
  source review. Ambiguous, duplicate, and conflicting obligation cases require review before
  financial changes. Sensitive message and financial content follows masking and privacy rules.
- **Localization and accessibility**: Every state has Arabic RTL and English LTR parity with
  English numerals and intentional mixed-direction content. Touch targets, contrast, 200% text,
  screen-reader order, non-color meaning, and reduced motion are mandatory.
- **UI states and tokens**: Existing Gulf Premium semantic tokens and components remain
  authoritative. Loading, empty, error, offline, partial, permission, paused, interrupted,
  battery-restricted, review, duplicate, undo, disabled, and pending-update states are covered.
- **Verification**: Focused checks cover automatic eligibility, ambiguity and duplicate
  decisions, obligation effects, undo consistency, permission mapping, rule management, iOS
  separation, privacy masking, both languages and themes, device sizes, and accessibility.

### Key Entities *(include if feature involves data)*

- **Tracking Status**: Current platform capability, consent and permission state, active or
  paused state, background condition, latest activity, detection and review counts, and last
  update state.
- **Detected Financial Event**: A candidate event with source, type, status, amount, currency,
  merchant, category, account hint, payment method, time, possible obligation, confidence, and
  review reasons, possible prior or follow-up event relationship, and full source text retained
  locally for no more than 30 days.
- **Review Item**: An unresolved detection with proposed values, missing or conflicting fields,
  candidate relationships, permitted source preview, available decisions, and resolution state.
- **Duplicate Candidate**: A relationship between a new detection and an existing record with
  comparison values, match reasons, and the user's resolution. A merge keeps the existing
  record, adds only confirmed missing details, and resolves the new candidate without creating
  another financial transaction.
- **Keyword Rule**: A default or custom Arabic or English matching signal with group, enabled
  state, recent-use count, and restore or deletion eligibility.
- **Sender Rule**: A recognized or custom financial sender with label, institution, trusted and
  enabled states, and related unknown-sender reviews.
- **Obligation Match**: A proposed relationship between a detection and one or more obligations,
  including match signals, confidence, review state, and confirmed financial effects.
- **Automatic Action Feedback**: The user-visible record of an automatic addition or obligation
  update with message, destination, edit and view actions, and undo availability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of Android test users can identify whether tracking is active and the
  required next action within 10 seconds of opening tracking status.
- **SC-002**: 100% of clear eligible acceptance examples create exactly one expected transaction,
  while zero failed, authentication-code, marketing, duplicate, or unresolved examples are
  silently added.
- **SC-003**: 100% of ambiguous and conflicting acceptance examples enter review before any
  financial record changes.
- **SC-004**: At least 90% of users resolve an uncertain or duplicate item correctly within 45
  seconds on their first attempt.
- **SC-005**: 100% of automatic additions provide working view, edit, and immediate undo paths;
  every tested undo restores affected visible financial summaries consistently.
- **SC-006**: 100% of clear obligation matches update the transaction and obligation views
  consistently, while every multiple-match case requires user review.
- **SC-007**: At least 90% of users recover from each supported permission or tracking problem
  without assistance or continue to a usable manual path within 30 seconds.
- **SC-008**: Zero tested iOS screens display direct SMS permission, inbox access, or Android
  background-tracking claims; all tested iOS users can reach manual or voice capture.
- **SC-009**: All critical flows complete in Arabic RTL and English LTR at 200% text size without
  hiding amounts, reasons, status, privacy information, or primary actions.
- **SC-010**: At least 85% of test users rate automatic-capture explanations, review reasons,
  and correction controls as clear and trustworthy.
- **SC-011**: 100% of tested masking scenarios prevent sensitive message text and financial
  values from appearing in protected screens, notifications, app previews, errors, analytics,
  or accessibility output.

## Assumptions

- SPEC-001 through SPEC-004 provide product principles, design components, navigation,
  authentication, permission education, privacy controls, accounts, transaction storage, and
  correction behavior consumed by this feature.
- This frontend phase uses representative simulated detections and service states; production
  SMS parsing, background processing, notifications, and synchronization remain future work.
- Automatic addition is the default Android mode for clear transactions; users may choose to
  review every detection or pause tracking through established preferences.
- Raw message content is shown only when needed for review and permitted by privacy settings;
  financial records preserve source and reasons without requiring permanent full-message display.
- Voice analysis is defined by SPEC-006 and is referenced here only as an iOS and universal
  fallback entry point.
- Optional iOS Shortcuts, App Intents, Share Extension, quick actions, and widgets are presented
  only when the target platform capability and approved product scope support them.
- Camera capture, receipt scanning, production bank connections, production AI, investments,
  and advanced merchant intelligence remain outside scope.

## 2026-09-06 Per-Account Tracking Addendum

- Effective capture requires the global tracking preference and an active,
  supported account whose `automaticTrackingEnabled` value is true.
- Missing, archived, unsupported, or disabled accounts fail closed with the
  localized `account_blocked` outcome before mock event/review/transaction writes.
- Existing local records and older sync snapshots that omit the property default
  to true. This does not claim production cutover or external device delivery.
