# Feature Specification: Home, Accounts, Transactions, and Categories

**Feature Branch**: Not created (no branch hook configured)

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Create SPEC-004 - Home, Accounts, Transactions, and Categories from the complete Masarifi Mobile Frontend SpecKit Master."

## Clarifications

### Session 2026-08-08

- Q: What is the authoritative rule for an account's current balance? -> A: Derive it from the opening balance and posted transactions; corrections create adjustment transactions rather than directly overwriting the balance.
- Q: How should deletion of an eligible transaction behave? -> A: Remove it from active financial views immediately, offer a 30-second undo, then retain a deletion marker for financial audit consistency.
- Q: How should Home calculate a multi-currency total? -> A: Convert supported balances into the user's profile currency using the latest available mock rate, label the total as estimated, and exclude unconvertible balances with a visible warning.
- Q: What happens when an offline transaction conflicts with a later version? -> A: Preserve both versions and require a manual comparison choice; never silently overwrite either version.
- Q: What is the result of merging one category into another? -> A: Reclassify all existing transactions to the target category, archive the source category, and use only the target for future selection after explicit confirmation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand My Financial Position (Priority: P1)

As a user, I can open Home and quickly understand my available money, recent movement,
upcoming commitments, and anything that needs my attention.

**Why this priority**: Home is the daily entry point and must answer the user's immediate
financial questions before presenting secondary detail.

**Independent Test**: Open Home with empty, single-account, multi-account, hidden-balance,
estimated multi-currency, offline, and review-required data and verify that the current
position and next useful action remain understandable.

**Acceptance Scenarios**:

1. **Given** an active user with financial data, **When** Home opens, **Then** total available
   balance, current-period income and spending, account context, recent transactions, and
   items requiring attention appear in the approved hierarchy.
2. **Given** balances are hidden, **When** Home appears, **Then** sensitive amounts are masked
   consistently and neither visible text nor accessibility output reveals them.
3. **Given** the user has no accounts or transactions, **When** Home opens, **Then** a calm
   empty state offers account setup and manual entry without blocking product access.
4. **Given** a total combines more than one currency, **When** it is displayed, **Then** the
   total is clearly identified as an estimate and its currency context is available.
5. **Given** Home contains later-feature previews, **When** the user scans the screen, **Then**
   one dominant financial answer and one relevant next action remain clear without excessive
   scrolling or competing cards.

---

### User Story 2 - Find and Correct Transactions (Priority: P1)

As a user, I can scan, search, filter, inspect, and correct my transaction history while
understanding each record's financial meaning, account, source, and status.

**Why this priority**: The ledger is the user's record of truth and the primary correction
path when manual or automatic data is wrong.

**Independent Test**: Use a realistic 500-record ledger containing all supported transaction
types and sources, failed items, and pending-sync items; verify discovery, detail, correction,
and financial consistency.

**Acceptance Scenarios**:

1. **Given** a dense transaction history, **When** the user searches or combines period,
   account, category, type, source, status, amount, and review filters, **Then** matching
   records appear grouped by date and every active filter remains visible and removable.
2. **Given** no transaction matches active filters, **When** results load, **Then** a filtered-
   empty state offers clear-all and add-transaction actions rather than first-use guidance.
3. **Given** a refund, reversal, transfer, failed transaction, or obligation payment, **When**
   it appears, **Then** text and status communicate its meaning without relying on color alone.
4. **Given** a transaction is eligible for correction, **When** the user completes an available
   correction action, **Then** its effect is explained and all affected summaries stay consistent.

---

### User Story 3 - Record Money Manually (Priority: P1)

As a user, I can add an expense, income, transfer, refund, or obligation payment through a
short amount-first flow that preserves my work and explains the effect before saving.

**Why this priority**: Manual entry is the universal fallback when automation, voice,
permission, or connectivity is unavailable.

**Independent Test**: Complete every supported manual transaction type with valid and invalid
values, interrupted navigation, an open keyboard, and offline operation; verify draft
preservation and correct account and ledger effects.

**Acceptance Scenarios**:

1. **Given** the Add destination is open, **When** a transaction type is selected, **Then**
   amount is dominant and only financially relevant fields are requested.
2. **Given** required data is invalid, **When** save is attempted, **Then** the exact issue and
   correction are identified without clearing valid entered data.
3. **Given** a transfer uses the same source and destination, **When** save is attempted,
   **Then** saving is blocked with a specific explanation.
4. **Given** the user leaves a meaningful unsaved draft, **When** navigation occurs, **Then**
   the user can keep editing or explicitly discard it.
5. **Given** the device is offline, **When** a valid manual transaction is saved, **Then** it
   remains editable and visibly pending synchronization.

---

### User Story 4 - Manage Financial Accounts (Priority: P2)

As a user, I can create, inspect, edit, archive, and select accounts so balances and
transactions retain accurate financial context.

**Why this priority**: Accounts make balances and transaction attribution useful after the
core Home and manual-entry paths are available.

**Independent Test**: Manage every supported account type, including empty lists, duplicate
names, long labels, archived accounts, credit limits, and multiple currencies.

**Acceptance Scenarios**:

1. **Given** several accounts, **When** Accounts opens, **Then** each row communicates type,
   masked identifier, currency, balance or available credit, default state, and archive state.
2. **Given** an account detail, **When** it opens, **Then** balances, recent activity, income
   and expense summary, and supported management actions are clear.
3. **Given** an account is used by existing records, **When** archive is requested, **Then**
   the effect is explained and historical records retain their account context.
4. **Given** a dense account selector, **When** the user searches and selects, **Then** the
   current selection is explicit and restricted archived options cannot be chosen.

---

### User Story 5 - Organize Transactions with Categories (Priority: P2)

As a user, I can find, create, edit, favorite, archive, and merge categories so transactions
remain easy to classify and understand.

**Why this priority**: Categories improve entry speed and reporting quality after the core
ledger and account flows are available.

**Independent Test**: Use system and custom categories with subcategories, Arabic and English
labels, favorites, long names, duplicates, archived categories, and historical usage.

**Acceptance Scenarios**:

1. **Given** a long category catalogue, **When** its selector opens, **Then** search, recent or
   favorite choices, hierarchy, and current selection reduce selection effort.
2. **Given** a custom category is saved, **When** it appears, **Then** it has clear Arabic and
   English labels and remains identifiable without color or icon.
3. **Given** a category is in use, **When** archive or merge is requested, **Then** the impact
   on existing and future records is explained before confirmation.
4. **Given** the user corrects a category, **When** the change completes, **Then** only the
   confirmed scope is reclassified and any future rule remains a separate confirmed action.

### Edge Cases

- A balance or transaction is zero, negative, unusually large, or too long for one line.
- An aggregate has stale rates or an unconvertible balance; the estimate identifies excluded
  balances and never presents them as included.
- The selected account or category is archived while an entry draft is open.
- Search contains Arabic diacritics, mixed-direction text, numbers, or only whitespace.
- Filters conflict, produce no results, or remain active after returning from detail.
- A refund has no original transaction, exceeds it, or targets an existing refund.
- A transfer uses the same or archived account, insufficient mock balance, or currencies without an estimate.
- A transaction edited offline conflicts with a later version; both versions remain available
  until the user chooses which to keep or deliberately keeps both.
- Undo expires while visible; edit and transaction detail remain available.
- The app closes, backgrounds, changes language, hides balances, or changes theme during a form.
- Arabic labels expand or text reaches 200% while amounts, statuses, and actions remain visible.
- Automatic feedback arrives while Home, a filtered ledger, or affected account detail is open.

## Requirements *(mandatory)*

### Scope Boundaries

This specification owns Home, account management, transaction history and detail, manual
entry, transfers, refunds and reversals, categories, and visible correction feedback for
completed automatic transactions. It consumes the navigation, authentication, privacy,
localization, and design-system foundations from earlier specifications.

Automatic detection and permission rules, review decisions, voice analysis, salary and budget
management, obligations management, savings, reports, notification delivery, and assistant
conversations belong to later specifications. Home may show compact summaries or links to
those features without defining their full flows. Camera capture, receipt scanning,
attachments, investments, production services, and real currency conversion are excluded.

### Functional Requirements

- **FR-001**: Home MUST prioritize header and assistant entry, total balance, salary-cycle
  summary, quick actions, tracking or recovery status, recent transactions, and relevant
  planning previews unless unavailable data makes a section irrelevant.
- **FR-002**: Home MUST present one dominant financial answer and one clear next action without
  excessive decorative content.
- **FR-003**: The total balance area MUST show available balance, hidden state, currency context,
  period change, active-account count, Accounts access, and an estimate warning when needed.
  Multi-currency totals MUST use the user's profile currency and latest available mock rates;
  unconvertible balances MUST be excluded and identified visibly.
- **FR-004**: Home quick actions MUST include expense, income, transfer, voice, obligation
  payment, and assistant access; camera and receipt actions MUST NOT appear.
- **FR-005**: Users MUST be able to mask and reveal sensitive values through the authorized
  privacy control, applied consistently across this feature.
- **FR-006**: Home MUST distinguish loading, empty, partial, error, offline, permission-recovery,
  pending-sync, and review-required states with an actionable next step.
- **FR-007**: Accounts MUST be reachable from Home, More, transaction filters, and transaction
  account selection without becoming a primary tab.
- **FR-008**: Users MUST be able to create and edit bank, debit-card, credit-card, digital-wallet,
  cash, savings, and other accounts.
- **FR-009**: Account records MUST support name, type, currency, opening balance, institution,
  masked identifier, relevant credit limit, default state, personalization, and notes. Current
  balance MUST be derived from the opening balance and posted transactions; corrections MUST
  create adjustment transactions rather than directly overwrite it.
- **FR-010**: The account list MUST communicate total context, type, masked identifier, currency,
  balance, relevant available credit, default state, and active or archived state.
- **FR-011**: Account detail MUST provide balances, recent transactions, income and expense
  summary, report access, edit, archive, balance adjustment, and transfer actions.
- **FR-012**: Account archive MUST require confirmation, preserve historical context, and prevent
  unsupported new activity from using the account.
- **FR-013**: Account selection MUST support search, current selection, dense data, long labels,
  empty results, and archived restrictions.
- **FR-014**: The ledger MUST group transactions by date and support search, sorting, period,
  account, category, type, source, status, amount-range, and review filters.
- **FR-015**: Active filters MUST be visible, individually removable, and clearable together.
- **FR-016**: The ledger MUST distinguish first-use empty, filtered-empty, loading, error,
  offline, pending-sync, sync-failed, partial-data, and end-of-list states.
- **FR-017**: Every transaction presentation MUST communicate amount and currency, financial
  meaning, title or merchant, account, date, source, and applicable status.
- **FR-018**: All supported types and sources, including refunds, reversals, failed items, and
  pending items, MUST remain distinguishable through text and status as well as visual treatment.
- **FR-019**: Transaction detail MUST expose applicable financial fields, source, relationships,
  notes, correction actions, and detected-text preview only when privacy rules permit.
- **FR-020**: Users MUST be able to edit and delete eligible records, duplicate one as a starting
  point, create a supported refund, report wrong classification, and use undo while available.
  Deletion MUST remove the record from active financial views immediately, offer a 30-second
  undo, and retain a deletion marker after the undo window for financial audit consistency.
- **FR-021**: Delete, refund, reversal, balance adjustment, and undo MUST explain their financial
  effect and require confirmation when destructive or not immediately reversible.
- **FR-022**: Manual entry MUST provide amount-first flows for expense, income, transfer, refund,
  and obligation payment with one primary save action.
- **FR-023**: Required entry data MUST be limited to type, amount, account or payment source,
  category, and date, with other fields shown only when relevant.
- **FR-024**: Validation MUST identify the exact issue and correction, preserve valid values,
  focus the relevant field, and never expose internal errors.
- **FR-025**: Meaningful drafts MUST survive validation failure, temporary interruption, and
  accidental navigation until saved or explicitly discarded.
- **FR-026**: Valid manual transactions created offline MUST remain editable and show pending
  synchronization until resolved. A conflict MUST preserve both versions, present their
  differences, and require the user to keep the local version, keep the later version, or
  deliberately keep both; neither version may be overwritten silently.
- **FR-027**: Transfers MUST prevent identical accounts and explain effects on balances, fees,
  and estimated conversion before save.
- **FR-028**: Refunds and reversals MUST link to the original transaction when known and MUST NOT
  appear as ordinary salary or income.
- **FR-029**: Category selection MUST support search, recent and favorite choices, system and
  custom categories, hierarchy, current selection, and empty results.
- **FR-030**: Default groups MUST cover housing, food, restaurants, transportation, fuel,
  shopping, health, education, entertainment, subscriptions, utilities, communication, travel,
  charity, fees, salary, other income, transfers, and obligations.
- **FR-031**: Custom categories MUST have Arabic and English labels; icon and color MAY
  personalize them but MUST NOT be their only identity.
- **FR-032**: Category archive or merge MUST explain effects on historical and future records
  and require confirmation. A merge MUST reclassify all existing transactions to the selected
  target, archive the source category, and expose only the target for future selection.
- **FR-033**: Completed automatic transactions MUST appear in relevant ledger and account views,
  update visible summaries, expose source, and provide an available undo or correction path.
- **FR-034**: Source, review, undo, correction, sync, privacy, and financial meaning MUST be
  conveyed through text and semantics rather than color, motion, or icon alone.
- **FR-035**: All screens MUST provide Arabic RTL and English LTR parity, use English numerals
  with locale-aware formatting, and preserve mixed-direction values.
- **FR-036**: Primary controls MUST meet a 44-by-44 minimum target, content MUST remain usable
  at 200% text size, and screen-reader focus MUST follow logical task order.
- **FR-037**: Async actions MUST communicate progress, success, failure, retry, and safe
  cancellation where cancellation cannot cause financial data loss.

### Constitution Requirements *(mandatory)*

- **Platform behavior**: Manual account and transaction flows provide equal value on Android
  and iOS. Android automatic results may enter from SPEC-005; iOS receives no direct SMS claim.
  Permission denial, offline operation, and automation failure leave manual entry usable.
- **Financial trust**: Automatic records expose source and correction. Destructive and balance-
  changing actions explain their effect and require deliberate confirmation. Sensitive values
  remain maskable and excluded from unsafe previews, errors, announcements, and analytics.
- **Localization and accessibility**: Every state has Arabic RTL and English LTR parity.
  Financial values use English numerals and locale-aware formatting. Touch targets, contrast,
  200% scaling, screen-reader order, non-color meaning, and reduced motion are required.
- **UI states and tokens**: All surfaces use the existing Gulf Premium semantic system.
  Loading, empty, filtered-empty, error, offline, partial, disabled, archived, review, undo,
  and sync states are required; no parallel visual language is introduced.
- **Verification**: Focused checks cover financial transitions, transfers and refunds, masking,
  validation, drafts, dense data, both languages and themes, device sizes, accessibility,
  offline behavior, and automatic-result correction.

### Key Entities *(include if feature involves data)*

- **Account**: A financial source or destination with type, currency, masked identifier,
  opening balance, transaction-derived current balance, optional available credit, default
  status, and active or archived state.
- **Transaction**: A dated financial event with type, amount, currency, title or merchant,
  account, category, payment method, source, status, notes, and optional relationships.
- **Category**: A system or user-defined classification with Arabic and English labels,
  hierarchy, optional personalization, favorite status, active or archived state, and an
  optional merge target that preserves historical reclassification context.
- **Transaction Draft**: Entered data retained before save, including validation, offline,
  interruption, and discard state.
- **Transaction Filter Set**: Current search, period, sort, account, category, type, source,
  status, amount, and review constraints.
- **Correction Action**: An edit, delete, refund, reversal, reclassification, report, or undo
  with eligibility, explained effect, completion state, and any applicable undo expiry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of test users identify available balance, current-period movement,
  and pending attention from Home within 10 seconds without assistance.
- **SC-002**: At least 90% complete a simple expense or income entry within 60 seconds on their
  first attempt.
- **SC-003**: At least 90% locate a specified record in a 500-transaction ledger within 30
  seconds using search or filters.
- **SC-004**: At least 90% correctly distinguish key transaction types, sources, and statuses
  without relying on color alone.
- **SC-005**: 100% of tested automatic records expose source and working correction; no tested
  correction leaves visible balances or summaries inconsistent.
- **SC-006**: 100% of validation, navigation, and offline scenarios retain valid entered data
  until save or explicit discard.
- **SC-007**: All critical flows complete in Arabic RTL and English LTR at 200% text size without
  hiding amounts, statuses, validation, or primary actions.
- **SC-008**: All financial and operational states remain understandable in grayscale and by
  screen reader without relying on color, icons, motion, or haptics alone.
- **SC-009**: At least 85% of test users rate account context, transaction source, status, and
  correction controls as clear or very clear.

## Assumptions

- SPEC-001 through SPEC-003 provide product principles, design system, app shell,
  authentication, privacy controls, navigation, localization, and onboarding foundations.
- Home previews later-owned salary, budget, obligation, savings, report, and assistant data
  without defining those features' management flows.
- SPEC-005 and SPEC-006 produce automatic and voice results through non-production behavior;
  this specification owns how completed records appear and are corrected.
- Mock data includes empty, dense, multi-account, multi-currency, archived, offline,
  pending-sync, failed, refund, and automatic-source examples.
- Currency conversion shown during this frontend phase is explicitly estimated, mock-only,
  and anchored to the user's profile currency.
- Camera capture, receipts, attachments, investments, production banking connections,
  production synchronization, and production analytics remain outside scope.

## 2026-09-05 Category Lifecycle Addendum

The core-finance service exposes an authoritative category usage preview with a
linked transaction count and opaque version. Archive/merge confirmation must use
that preview, and mock persistence rejects changed counts. System categories are
read-only. Merge retains the existing atomic local reclassification behavior.
