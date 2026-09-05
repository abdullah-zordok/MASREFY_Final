# Feature Specification: R02 — Accounts

**Feature Branch**: `codex/r01-shared-ui-foundation` (existing worktree reused as requested)

**Created**: 2026-08-15

**Status**: Draft for product review

**Input**: Redesign the existing Masarifi account-management and account-selection experience without changing account data, calculations, commands, routes, or downstream flows.

**Primary source of truth**: `D:\MY Work\0Part_Time\MASREFY _Final\apps\mobile\new_Desinge\REDESIGN_ANALYSIS.md`

**Roadmap area**: R02 — Accounts

## Ownership and Boundaries

R02 owns presentation for these existing route surfaces:

- `app/accounts/_layout.tsx` — protected account route group.
- `app/accounts/index.tsx` — account management list and preserved return destination.
- `app/accounts/new.tsx` — create-account form.
- `app/accounts/[id]/index.tsx` — account detail.
- `app/accounts/[id]/edit.tsx` — edit-account loading, missing, error, and form states.
- `app/modals/account-picker.tsx` — account selection mode used by other features.

R02 also owns the account-specific presentation supplied by the existing account list, detail, form, and picker screens. It does not own Home composition, transaction rules or rows, Add form logic, report calculations, planning calculations, tracking review, the shared application shell, or shared R01 component behavior.

Entry points remain Home, More, transaction and planning flows, account pickers, protected deep links, and account-related setup actions. Destination routes remain owned by their roadmap areas. No route is added, removed, renamed, or assigned a second primary owner.

## Current Capability Baseline

Masarifi currently lets an authenticated user:

- search and open active or archived accounts;
- create and edit bank, debit-card, credit-card, wallet, cash, savings, and other accounts;
- enter a name, type, currency, opening balance, and default-account choice, while retaining supported institution, masked-identifier, credit-limit, icon, color, and notes data;
- derive the visible current balance from opening balance and qualifying transactions rather than directly overwriting the balance;
- communicate inclusion or exclusion from aggregate balance context wherever the existing account/Home projections already supply that state;
- view account identity and current balance;
- archive or restore an account while preserving historical financial context;
- start a transfer with the account supplied as context;
- select an active account from a searchable picker and return to the originating task;
- show missing, loading, error, empty, archived, default, and retry outcomes;
- preserve protected-route behavior and sanitize the optional return destination.

These capabilities, their validation rules, balance derivation, affected-data refresh, archive restrictions, default-account behavior, picker return value, and navigation results remain unchanged. R02 changes presentation and usability only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan and Open Accounts (Priority: P1)

As a user, I can understand my accounts, balances, types, identifiers, and availability in a compact list, then open the account I need without decoding a wall of cards.

**Why this priority**: Account context underpins balances, transactions, transfers, reports, and capture flows.

**Independent Test**: Open Accounts with empty, typical, dense, archived, multi-currency, hidden-value, loading, partial, and error data in both languages; verify that account identity, amount, status, and action remain clear and that opening a row reaches the existing detail route.

**Acceptance Scenarios**:

1. **Given** active and archived accounts, **When** the list opens, **Then** each repeated item uses one shared account-row anatomy showing name, type, masked identifier or currency context, balance, and explicit default/archive and supplied inclusion/exclusion status without making every item a separate elevated hero card.
2. **Given** a search query, **When** matching accounts change, **Then** the search remains visible, the result context is clear, and an empty search result is distinguished from having no accounts.
3. **Given** balances are hidden, **When** the list renders, **Then** protected amounts are masked visually and accessibly while account names, types, statuses, and available actions remain usable.
4. **Given** the route was opened with a valid return destination, **When** the user leaves Accounts, **Then** the current sanitized destination behavior is preserved.

---

### User Story 2 - Understand an Account Before Acting (Priority: P1)

As a user, I can open an account and see its financial position, identity, recent activity context, status, and available management actions in a record-first hierarchy.

**Why this priority**: Users must understand which financial object an action affects before editing, transferring, archiving, or restoring it.

**Independent Test**: Open active, archived, multi-currency, credit, hidden, missing, partial, and error account details; verify that the balance summary leads, status and identity are explicit, current commands remain available only where supported, and related transaction presentation reuses R04 when available.

**Acceptance Scenarios**:

1. **Given** an available account, **When** detail opens, **Then** the hierarchy is balance and account identity first, financial/activity context second, and edit, transfer, archive, or restore actions last.
2. **Given** an account is archived, **When** detail opens, **Then** archive status is written explicitly and the existing restore path remains available without implying that unsupported new activity is allowed.
3. **Given** account data or related activity is loading, stale, partial, offline, or unavailable, **When** detail renders, **Then** unknown values never appear as confirmed zero and the screen states what is available and what can be retried.
4. **Given** the account does not exist, **When** detail is requested, **Then** the existing missing-state recovery returns safely without exposing stale financial content.

---

### User Story 3 - Create or Edit an Account Safely (Priority: P1)

As a user, I can create or edit an account through a focused form that explains required values, preserves valid input, and clearly states the result.

**Why this priority**: Bad account setup corrupts the context of every later transaction and summary.

**Independent Test**: Create and edit every supported account type with long names, mixed-script institutions, valid and invalid balances/currencies, keyboard open, duplicate names, offline/local outcomes, save failure, and an unsaved draft.

**Acceptance Scenarios**:

1. **Given** create mode, **When** the form opens, **Then** account identity and type precede currency and opening balance, the default choice is clearly reversible, and one Save action is visually dominant.
2. **Given** edit mode, **When** the form opens, **Then** current values are populated, immutable values remain visibly read-only where current behavior requires it, and the screen does not suggest direct editing of a transaction-derived balance.
3. **Given** invalid or missing input, **When** Save is attempted, **Then** the exact affected field and correction are identified, valid values remain, and no account is created or changed.
4. **Given** saving succeeds locally or remotely according to current behavior, **When** the operation finishes, **Then** the outcome is not reported early, duplicate submission is prevented, and the existing account-list destination remains unchanged.
5. **Given** meaningful unsaved input, **When** dismissal or navigation is attempted, **Then** the approved draft-protection behavior prevents accidental loss.

---

### User Story 4 - Select an Account Without Losing Context (Priority: P1)

As a user recording, filtering, reviewing, or planning money, I can search and select an eligible account, then return to the exact originating task with my draft or filters intact.

**Why this priority**: Account selection is reused by several higher-frequency flows and must not become a management detour.

**Independent Test**: Open the account picker from manual entry, transaction editing, filters, transfer selection, tracking review, salary, and reporting contexts with a long account catalogue; search, cancel, select, and handle empty/error states while verifying origin context is preserved.

**Acceptance Scenarios**:

1. **Given** a current selection, **When** the picker opens, **Then** it is explicit and remains selected while search results change.
2. **Given** archived or otherwise ineligible accounts, **When** selection mode renders, **Then** they cannot be selected and their unavailability is not communicated by color alone.
3. **Given** no account matches search, **When** results are empty, **Then** the user can clear the query or follow the existing account-creation route without losing the originating draft where that path is currently supported.
4. **Given** the user selects or cancels, **When** the picker closes, **Then** it returns the same current value semantics and preserves the caller's draft, filter, scroll, and route context.

### Edge Cases

- There are no accounts, no active accounts, only archived accounts, or hundreds of accounts.
- Names are duplicated, extremely long, or combine Arabic, English, digits, and punctuation.
- A masked identifier, institution, currency, or credit-limit value is missing.
- Opening balance is zero, negative where supported, unusually large, invalid, or exceeds safe display width.
- The selected account becomes archived while another screen's draft is open.
- Multi-currency balances are partial, stale, unavailable, or excluded from an aggregate summary under existing rules.
- Default-account status changes while the list or picker is visible.
- A save succeeds locally while offline, remains pending, fails, or later conflicts under existing synchronization behavior.
- Archive/restore is activated repeatedly or fails after the user confirms.
- Hidden-value mode changes while list, detail, or picker is visible.

## Redesign Scope

- Replace repeated account hero cards with a compact grouped account-row pattern, reserving summary emphasis for totals or the selected account.
- Establish list hierarchy as title and search, optional total/context, primary creation action, then active and archived groups where useful.
- Recompose account detail into summary, identity/status, recent financial activity, and bounded management actions.
- Use a focused create/edit form with persistent labels, compact type selection, stable amount formatting, clear read-only values, inline validation, and keyboard-safe actions.
- Use the R01 picker/container pattern for account selection, with search, current selection, eligibility status, empty/error recovery, and safe return.
- Apply semantic surfaces, borders, spacing, typography, amount roles, Source Mark/status where supplied, and restrained motion from R01.
- Preserve dense-data performance and let rows grow for long labels and 200% text.

## Non-Goals

- No account type, field, calculation, archive rule, default rule, or balance derivation change.
- No new institution connection, bank sync, investment, payment, or production provider.
- No route addition, removal, rename, or navigation-meaning change.
- No transaction, report, salary, budget, obligation, savings, or Home calculation inside R02.
- No change to permissions, authentication, protected-route decisions, persistence, synchronization, or conflict rules.
- No feature-local raw colors, local token system, competing account card system, or visual-only dependency.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: R02 MUST preserve every owned route, entry point, return destination, and protected-route decision listed in Ownership and Boundaries.
- **FR-002**: The account list MUST distinguish active, default, archived, included/excluded where supplied, hidden, partial/stale, and unavailable account states through text or structure as well as visual treatment.
- **FR-003**: Repeated accounts MUST use a compact row or grouped-list hierarchy; elevated cards MUST be reserved for summary or exceptional attention.
- **FR-004**: Each account item MUST present the current feature-supplied name, type, currency context, masked identifier where available, derived balance or available-credit context where supported, and explicit status including aggregate inclusion/exclusion when supplied.
- **FR-005**: Account amounts MUST distinguish zero, negative, hidden, unknown, estimated, stale, and confirmed values and MUST use approved locale-aware formatting.
- **FR-006**: Search MUST retain current semantics and distinguish no accounts from no matching accounts.
- **FR-007**: Create-account access MUST remain available from account management without becoming a second global Add action.
- **FR-008**: Account detail MUST lead with account identity and financial summary, followed by activity/context and then current actions.
- **FR-009**: Account detail MUST preserve edit, transfer, archive, restore, missing, retry, and back outcomes currently supported.
- **FR-010**: Related transaction previews MUST consume R04's confirmed transaction-row contract when available and MUST NOT duplicate transaction calculations or commands.
- **FR-011**: Archive and restore presentation MUST name the affected account, explain the existing consequence, prevent duplicate submission, and report completion only after the command resolves.
- **FR-012**: Account creation and editing MUST preserve all current fields and validation while presenting only one visually dominant Save action.
- **FR-013**: Immutable or transaction-derived values MUST be clearly read-only and MUST NOT imply that direct balance overwrite is supported.
- **FR-014**: Validation MUST identify the affected field, preserve valid values, and expose the existing correction path in Arabic and English.
- **FR-015**: Save states MUST distinguish working, saved-local/pending-sync, synchronized success, failure, and retry where those outcomes exist.
- **FR-016**: Meaningful account drafts MUST be protected from accidental dismissal according to existing behavior.
- **FR-017**: Account selection MUST support search, current selection, long/dense data, no results, ineligible/archived status, and cancellation.
- **FR-018**: Selecting or dismissing the picker MUST preserve the caller's draft, filters, scroll position, and return context according to current navigation behavior.
- **FR-019**: Picker mode MUST prioritize selection; management commands MUST remain in account-management routes unless the current caller explicitly supports creation.
- **FR-020**: Hidden balances MUST remain hidden in visual content, screen-reader output, errors, notifications, evidence, and app-switcher presentation according to current privacy rules.
- **FR-021**: Mixed Arabic/English account names, institutions, masked digits, currency, and amounts MUST remain readable as intentionally ordered runs.
- **FR-022**: RTL and LTR layouts MUST use logical alignment and direction-aware disclosure/back affordances without reversing internal numeric order.
- **FR-023**: Every action and account row MUST meet the 44-by-44-point minimum target and remain operable with screen readers, keyboard where applicable, and 200% text.
- **FR-024**: Status, selection, default, archive, hidden, and error meaning MUST NOT rely on color, icon, motion, or haptics alone.
- **FR-025**: Motion MUST be brief and consequential; reduced-motion mode MUST provide the same state information without nonessential movement.
- **FR-026**: Initial/loading states MUST preserve expected geometry and MUST NOT display unknown balances as zero.
- **FR-027**: Empty, error, offline, partial, stale, pending-sync, and no-result states MUST provide only recovery actions supported by current account behavior.
- **FR-028**: R02 MUST reuse R01 semantic tokens, financial amount treatment, shared state feedback, navigation rows, forms, picker container, and sensitive-value behavior.
- **FR-029**: The redesign MUST introduce no business calculation, new account capability, new permission, or new production data source.
- **FR-030**: Downstream regressions MUST verify Home, Transactions, Add, Tracking review, Salary, Reports, and App Settings wherever they consume account presentation or selection.

### Constitution Requirements *(mandatory)*

- **Platform behavior**: Account management and selection retain equal Android/iOS capability, protected-route behavior, offline recovery, and existing manual paths; no platform claim is added.
- **Financial trust**: Derived balances, archive consequences, eligibility, local/pending outcomes, and correction paths remain explicit; presentation never recalculates or silently mutates financial data.
- **Localization and accessibility**: Arabic RTL and English LTR have complete parity, English numerals, mixed-direction isolation, screen-reader semantics, 200% text, keyboard-safe forms, reduced motion, and minimum targets.
- **UI states and tokens**: All screens use R01 semantic roles and define loading, empty, no-result, error, partial/stale, offline, pending-sync, archived, hidden, and success states as applicable.
- **Verification**: Focused behavioral regression and real-device visual evidence are required for each owned screen and picker before R02 closes.

### Shared Dependencies

- **R01**: shared header, grouped rows, forms, amount and sensitive-value treatment, state feedback, picker/overlay container, semantic tokens, direction, motion, and accessibility contracts.
- **R04**: confirmed transaction rows for account recent activity when R04 is approved; until then existing transaction presentation remains unchanged.
- **Feature-owned data**: existing account queries, balance derivation, account commands, account validation, and transaction relationships remain authoritative.
- **Downstream consumers**: R04 Transactions, R05 Add, R06 Tracking, R07 Home, R08 Salary, R12 Reports, R15 More, and R16 App Settings require regression validation when the account row or picker contract changes.

### Key Entities

- **Account**: An existing financial source or destination with identity, type, currency, opening balance, optional institution/identifier/credit context, default state, status, and derived current balance.
- **Account Presentation State**: The feature-supplied combination of availability, archive/default status, balance visibility, data freshness, and synchronization state shown without changing the account.
- **Account Selection**: A current or candidate account choice with eligibility, search context, caller origin, and cancel/return outcome.
- **Account Draft**: Valid and invalid values entered during creation or editing that require preservation until saved or deliberately discarded.

## State Matrix

| Screen | Required states |
|---|---|
| Account list | initial/loading, empty, typical, dense, search no results, error/retry, partial/stale, offline, hidden balances, archived/default, included/excluded where supplied, pending sync where supplied |
| Account detail | loading, missing, error/retry, typical, archived, hidden, partial/stale activity, offline, action working/failure/success |
| Create account | ready, keyboard open, valid, field validation, saving, saved-local/pending, success, failure/retry, unsaved draft |
| Edit account | loading, missing, error/retry, ready, read-only values, validation, saving, success/failure, unsaved draft |
| Account picker | loading, typical, dense, current selection, search no results, no eligible accounts, archived/ineligible, error, cancel, selected return |

## Trust, Privacy, Localization, and Accessibility

- Account balance, available credit, identifier, institution, and notes follow existing sensitivity and hidden-value rules.
- Archive/restore, transfer entry, and save feedback state exactly what changed and do not imply synchronization before confirmation.
- Arabic and English expose identical account fields, statuses, commands, errors, and recovery.
- Amounts, currencies, masked digits, and mixed-script names use shared formatting and intentional bidi isolation.
- Reading order follows account identity → financial value/status → available action; visual side changes in RTL without reversing numeric content.
- Long labels and 200% text reflow; rows may grow and actions may stack without clipping or reducing targets.
- Screen-reader output includes name, role, state, balance visibility, selection, availability, and action without announcing hidden values.

## Navigation and Connections

- Accounts retains its existing entry from Home, More, setup, deep links, and feature-owned pickers.
- A valid `returnTo` value remains sanitized and returns to the same supported origin; invalid values remain rejected.
- Create/edit completion retains the existing Accounts destination; detail transfer retains the existing Add route and account context.
- Picker select/cancel returns to the caller without resetting draft, filter, selection, scroll, or unrelated tab state.
- Authentication and privacy gates remain owned by the shell; R02 supplies no alternate bypass or duplicate gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of test users identify a requested account's name, type, balance visibility, and active/archive status within 10 seconds in a 30-account list.
- **SC-002**: At least 90% of users find and select a requested eligible account from a 100-account picker within 20 seconds while the originating draft remains intact.
- **SC-003**: At least 90% of users create or edit a valid account on the first attempt within 90 seconds, and 100% of invalid attempts retain all valid entered values.
- **SC-004**: 100% of tested account values distinguish hidden, unknown, stale/partial, pending, zero, and confirmed states without presenting unknown money as zero.
- **SC-005**: 100% of archive, restore, save, and failure scenarios state the affected account, exact outcome, and available recovery without reporting completion early.
- **SC-006**: All owned screens complete their critical journeys in Arabic RTL and English LTR, light and dark themes, at 200% text, on the smallest supported phone, with no clipped content or target below 44 by 44 points.
- **SC-007**: Screen-reader review finds complete names, roles, states, selection, focus order, hidden-value protection, and no status communicated only by color or icon.
- **SC-008**: Regression validation finds zero changes to account data, balance derivation, route results, picker return values, archive/default rules, or downstream financial effects.

## Assumptions

- The approved compatible-redesign direction and R02 roadmap ownership remain unchanged.
- R01 shared presentation contracts are the only cross-product UI foundation used by R02.
- Existing account data, balance derivation, validation, commands, persistence, synchronization, and protected navigation remain authoritative.
- Account inclusion or exclusion from aggregate summaries follows existing feature projections; R02 only communicates the supplied result.
- Account detail may adopt R04 transaction rows after R04 approval without transferring transaction ownership to R02.
- Real-device validation and any fixes discovered there will be detailed in `/tasks`; this `/specify` phase changes no production code.

## 2026-09-06 Account Tracking Control Addendum

Supported account forms expose an `automaticTrackingEnabled` switch and details
show its enabled/disabled state. Cash and other unsupported account types omit
the control. Create defaults true; edit preserves the stored value; existing
records missing the field normalize to true without changing other account data.
