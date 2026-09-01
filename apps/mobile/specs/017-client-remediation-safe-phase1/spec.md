# Feature Specification: Remaining Safe Phase 1 Client Remediation

**Feature Branch**: `codex/client-remediation-safe-phase1`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Complete every remaining repository-owned Phase 1 client-remediation item that is safe to implement without duplicating or conflicting with active SPEC-BE-006 work."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Trust One Financial Result Everywhere (Priority: P1)

As a user, I see the same financial meaning and totals on Home, the transaction ledger,
reports, obligations, and assistant evidence, including refunds, transfers, card debt,
card payoffs, payables, and receivables.

**Why this priority**: Conflicting money totals across product surfaces would make every other
remediation untrustworthy.

**Independent Test**: Use one canonical financial scenario across all supported surfaces and
verify identical minor-unit outcomes, relationship labels, and data version context.

**Acceptance Scenarios**:

1. **Given** an expense with a linked partial refund, **When** financial summaries are viewed,
   **Then** net expense is reduced once and the refund is not presented as salary or new income.
2. **Given** an internal transfer, **When** the ledger and summaries are viewed, **Then** it has
   no category and changes neither income nor expense.
3. **Given** a bank balance of 1,000.00, card debt of 320.00, and a 200.00 card payoff,
   **When** balances and net worth are viewed, **Then** the bank is 800.00, card debt is 120.00,
   and net worth is 680.00 on every supported surface.
4. **Given** payable and receivable obligations, **When** obligation totals are viewed, **Then**
   remaining payables and receivables are labeled separately and are not silently netted or
   double-counted with card liability.

---

### User Story 2 - Record Safe Refunds and Card Payoffs (Priority: P1)

As a user, I can refund an eligible expense or pay down a card from a funding account while
the app validates the amount, preserves the financial relationship, and prevents duplicate
effects.

**Why this priority**: These commands change more than one financial record and must remain
balanced, bounded, and retry-safe.

**Independent Test**: Record partial and full refunds and valid, invalid, and retried card
payoffs; verify all affected balances and summaries and that invalid relationships make no
change.

**Acceptance Scenarios**:

1. **Given** an eligible expense with a refundable balance, **When** a partial or full refund is
   confirmed, **Then** it links to the original expense and cumulative refunds never exceed the
   original eligible amount.
2. **Given** a transfer, refund, income, or other ineligible original record, **When** a refund
   is attempted, **Then** saving is blocked with a specific correction and no financial change.
3. **Given** a valid funding account and card liability, **When** a payoff is confirmed, **Then**
   the funding balance and card liability decrease by the same amount and neither income nor
   expense changes.
4. **Given** the same payoff request is retried, **When** it reaches the local financial
   boundary again, **Then** it produces no duplicate debit or liability reduction.

---

### User Story 3 - Preserve Valid Transfer and Category Data (Priority: P1)

As a user, I can classify income and expenses with custom categories without transfers being
misrepresented as categorized spending.

**Why this priority**: Invalid transfer-category relationships corrupt budgets and reports.

**Independent Test**: Create and load current and legacy transfer/category combinations and
verify valid user data is preserved while invalid transfer-category links are repaired once.

**Acceptance Scenarios**:

1. **Given** a new or edited internal transfer, **When** it is validated and saved, **Then** its
   category is empty and it cannot use a custom category kind.
2. **Given** a custom category, **When** it is created or edited, **Then** it is explicitly for
   income or expense only.
3. **Given** legacy data containing an invalid transfer-category association, **When** local
   data is upgraded repeatedly, **Then** the invalid link is cleared once while valid
   transactions and categories remain unchanged.
4. **Given** reference categories are initialized repeatedly, **When** initialization finishes,
   **Then** one stable remittance category exists and no demo transaction is introduced.

---

### User Story 4 - See Correct Obligation Meaning (Priority: P1)

As a user, I can distinguish the original contracted amount from what remains payable and can
understand what is owed by me versus owed to me.

**Why this priority**: The current labels and totals can make a paid portion appear outstanding.

**Independent Test**: View fixed-term, open-ended, payable, receivable, partial-payment, and
completed obligations in Arabic and English and verify labels and totals against the records.

**Acceptance Scenarios**:

1. **Given** a partially paid fixed-term obligation, **When** overview and detail are viewed,
   **Then** contracted amount and remaining amount have distinct labels and values.
2. **Given** multiple active payables, **When** the payable total is shown, **Then** it equals
   the sum of visible remaining payable balances.
3. **Given** receivables and payables coexist, **When** totals are shown, **Then** receivables
   remain separate and the existing obligation history and schedule fields remain available.
4. **Given** Arabic or English is selected, **When** obligation content is read visually or by
   assistive technology, **Then** the financial meaning is equivalent and unambiguous.

---

### User Story 5 - Receive Honest Tracking Availability (Priority: P1)

As a user, I am never shown demo automatic tracking as a production capability, and I receive
an honest unavailable or disabled state when the platform, institution, evidence, or account
preference does not support tracking.

**Why this priority**: Fabricated production success would violate privacy, consent, and
financial trust.

**Independent Test**: Exercise production, demonstration, unsupported, account-disabled, and
user-disabled configurations and verify availability, copy, and results.

**Acceptance Scenarios**:

1. **Given** a production build without the required native evidence and approved corpus,
   **When** automatic tracking is requested, **Then** the feature fails closed and creates no
   detected transaction.
2. **Given** demonstration mode, **When** a sample is run, **Then** every result remains clearly
   labeled demonstration data and is never presented as provider success.
3. **Given** an unsupported platform or institution, **When** tracking status is viewed, **Then**
   an honest unavailable state and supported manual alternatives are shown.
4. **Given** account-level or user-level tracking is disabled, **When** an event is evaluated,
   **Then** the preference is respected without silent fallback to a demo result.

---

### User Story 6 - Maintain an Auditable Remediation Ledger (Priority: P1)

As a product owner, I can see which original feedback items are implemented, verified,
blocked, deferred, or external without renumbering or overstating evidence.

**Why this priority**: Phase 1 cannot close honestly if device, backend, privacy, or product
dependencies are recorded as completed from code inspection alone.

**Independent Test**: Compare all feedback IDs 1 through 62 with current evidence and verify
that every open item has one status and a concrete dependency, decision, or verification link.

**Acceptance Scenarios**:

1. **Given** the completed Gulf localization baseline, **When** the ledger is refreshed, **Then**
   its verified results are preserved and not reimplemented.
2. **Given** an item overlaps active SPEC-BE-006, a later Backend Spec, device evidence, an
   external action, or product approval, **When** status is recorded, **Then** the exact owner
   or dependency is named and completion is not claimed.
3. **Given** client item #50, **When** the ledger is reviewed, **Then** it remains an external
   archive-owner action and no external file is deleted or modified.
4. **Given** automated evidence, **When** an item is marked verified, **Then** the exact command,
   result, and covered requirement are recorded.

### Edge Cases

- Several partial refunds arrive in different order, one is reversed, or two retries share the
  same request identity.
- The original expense is deleted, reversed, already fully refunded, in another currency, or
  pending unresolved review.
- A payoff is zero, negative, larger than the funding balance, larger than card debt, targets a
  non-card account, uses the same account twice, or repeats after an interrupted result.
- A card opening value is positive, zero, negative, or originates from legacy data whose debt
  meaning is not explicit.
- A card liability is also linked to an obligation and must not reduce net worth twice.
- Legacy transfers have valid unrelated data plus an invalid category relationship.
- Reference initialization runs on a fresh profile, existing profile, or upgraded profile.
- An obligation is open-ended, completed, paused, receivable, overpaid, or partially paid.
- Tracking mode, platform support, institution support, consent, and account preference disagree.
- A financial projection is stale or built from a different local version; the mismatch must be
  visible rather than reconciled silently.
- Long Arabic labels, mixed-direction account names, hidden values, and 200% text must not hide
  financial meaning or recovery actions.

## Requirements _(mandatory)_

### Scope Boundaries

This specification owns only the remaining safe Mobile and repository documentation work for
Phase 1 client remediation. It preserves the completed Gulf localization baseline, current
Mobile navigation and visual design, and existing rich financial models.

Backend services, backend specifications, server schemas, production synchronization,
SPEC-BE-006 implementation, later Backend Specs, Admin changes not required for truthful copy,
external archive actions, device-only evidence, and undecided product features are excluded.
When an owned Mobile file overlaps active SPEC-BE-006 work, that task remains recorded and
deferred until the completed mainline change can be integrated once.

### Functional Requirements

- **FR-001**: The remediation ledger MUST preserve feedback IDs 1 through 62 and assign every
  item exactly one evidence-backed status: implemented, verified, blocked, deferred, or external.
- **FR-002**: Completed Gulf localization behavior and evidence MUST remain unchanged unless a
  new focused regression proves a defect.
- **FR-003**: One canonical financial scenario MUST cover Home, transaction list, reports,
  assistant snapshot, and local projection version with identical financial outcomes.
- **FR-004**: The canonical scenario MUST include an expense and partial refund, internal
  transfer, card debt and payoff, payable obligation, supported receivable obligation, net
  worth, income total, and expense total.
- **FR-005**: Internal transfers MUST have no category and MUST affect neither income nor expense.
- **FR-006**: Transfer MUST NOT be a custom category kind; custom categories MUST be limited to
  income or expense meaning.
- **FR-007**: Existing invalid transfer-category relationships MUST be repaired idempotently
  while preserving all valid user data.
- **FR-008**: Reference data MUST contain one stable remittance system category after any number
  of initializations or upgrades.
- **FR-009**: Production data upgrades MUST NOT insert demo financial transactions or present
  demonstration records as user production data.
- **FR-010**: A refund MUST link to one eligible original expense and MUST reject transfers,
  ineligible record types, invalid relationships, and amounts beyond the remaining refundable
  balance.
- **FR-011**: Partial and full refunds MUST be supported, and cumulative linked refunds MUST not
  exceed the original eligible amount.
- **FR-012**: All supported financial projections MUST apply one net-expense result for linked
  refunds and MUST NOT report a refund as salary or unrelated income.
- **FR-013**: A card payoff MUST debit the selected funding account and reduce the selected card
  liability by the same valid amount without changing income or expense.
- **FR-014**: A card payoff MUST reject zero, negative, excessive, same-account, non-card, or
  otherwise invalid requests before any financial effect.
- **FR-015**: Retrying the same card payoff at the local financial boundary MUST not duplicate
  either side of the effect.
- **FR-016**: Card debt MUST reduce net worth; a positive card opening value MUST NOT silently
  acquire debt meaning; and card liability MUST NOT be double-counted through obligations.
- **FR-017**: Financial totals and validation MUST use integer minor units with correct currency
  precision.
- **FR-018**: The required 1,000.00 bank, 320.00 card debt, and 200.00 payoff scenario MUST result
  in 800.00 bank balance, 120.00 card debt, and 680.00 net worth everywhere it is shown.
- **FR-019**: Obligation presentation MUST distinguish contracted amount from remaining amount.
- **FR-020**: Active payable totals MUST equal visible remaining payable balances, while
  receivable totals remain separately labeled.
- **FR-021**: Obligation corrections MUST preserve current schedule, payment-history, matching,
  account, reminder, and lifecycle fields.
- **FR-022**: Automatic tracking in production MUST remain unavailable until required native
  evidence and the approved corpus exist; unsupported or unapproved paths MUST fail closed.
- **FR-023**: Demonstration tracking MUST remain explicitly non-production and MUST NOT silently
  substitute for unavailable production behavior or fabricate provider success.
- **FR-024**: Platform, institution, user, and account-level availability or opt-out decisions
  MUST be respected and explained honestly.
- **FR-025**: Tracking availability copy on every affected product surface MUST state the same
  supported, unsupported, demonstration, or disabled meaning.
- **FR-026**: The reproducible obligation journey failure and material asynchronous warnings
  MUST be corrected at their source without weakening accessibility assertions or hiding the
  problem with longer waits.
- **FR-027**: Every financial or tracking change MUST have the smallest focused automated
  regression that proves its boundary and downstream result.
- **FR-028**: Arabic RTL and English LTR MUST retain equivalent corrected obligation and tracking
  meaning, locale-aware financial formatting, English numerals, and accessible labels.
- **FR-029**: The approved Mobile routes, layouts, components, colors, typography, and design
  tokens MUST remain unchanged except for correctness copy already owned by this scope.
- **FR-030**: No in-scope change MAY add backend business logic, production synchronization,
  new provider behavior, a new dependency, a new route, or an unrelated product capability.
- **FR-031**: Items requiring SPEC-BE-006, later Backend Specs, device evidence, secrets,
  unavailable services, external archive ownership, or missing product approval MUST remain
  explicitly deferred or external with the named dependency.
- **FR-032**: Verification evidence MUST identify exact focused and complete checks, results,
  changed-file scope, and any limitation that prevents a device or external claim.

### Constitution Requirements _(mandatory)_

- **Platform behavior**: Manual finance remains usable on Android and iOS. Production tracking
  fails closed until evidence exists, demo states stay explicit, and unsupported paths offer
  honest existing alternatives.
- **Financial trust**: Transfers, refunds, payoffs, liabilities, obligations, and reports use
  explicit balanced effects, bounded validation, correction paths, and no double-counting.
- **Localization and accessibility**: Arabic RTL and English LTR retain parity, English numerals,
  intentional mixed direction, visible labels, screen-reader meaning, 200% text, and non-color
  state communication.
- **UI states and tokens**: Existing Gulf Premium routes, components, semantic tokens, layouts,
  and relevant loading, unavailable, disabled, error, retry, and success states remain the only
  presentation system.
- **Verification**: Focused financial, migration, localization, direction, accessibility, and
  tracking checks run before complete Mobile type, lint, and test gates and independent review.

### Key Entities _(include if feature involves data)_

- **Canonical Financial Scenario**: One stable set of accounts, transactions, liabilities,
  obligations, and expected totals used to compare all supported projections and their version.
- **Linked Refund**: A refund relationship containing the eligible original expense, cumulative
  refunded amount, remaining refundable amount, and partial or full state.
- **Card Liability**: The explicit amount owed on a card, separate from positive account value
  and from any obligation representation that would otherwise duplicate it.
- **Card Payoff**: One retry-safe transfer-like financial command between a funding account and
  card liability with equal balanced effects and no income or expense classification.
- **Category Meaning**: The income or expense classification allowed for custom categories;
  transfer remains a transaction meaning without a category relationship.
- **Obligation Summary**: Contracted, paid, remaining, payable, receivable, and lifecycle values
  presented without losing the current obligation detail model.
- **Tracking Availability**: The combined environment, platform, institution, consent, user,
  and account decision that resolves to supported, demonstration, unavailable, or disabled.
- **Remediation Ledger Entry**: One original feedback ID, current state, owner, dependency,
  evidence, and allowed next action.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of canonical scenario values match across Home, ledger, reports, assistant
  evidence, and local version context, with zero unexplained difference.
- **SC-002**: 100% of tested transfers have no category and no income or expense effect; all
  tested valid legacy user data remains unchanged after repeated repair runs.
- **SC-003**: 100% of eligible partial and full refund cases produce the expected bounded net
  expense, while 100% of ineligible or excessive cases make no change.
- **SC-004**: 100% of valid and retried card payoffs remain balanced and duplicate-free, while
  every invalid payoff makes no change.
- **SC-005**: The required payoff scenario produces exactly 800.00 bank balance, 120.00 card
  debt, and 680.00 net worth on every supported surface.
- **SC-006**: 100% of obligation overview examples show remaining payable totals equal to the
  visible remaining payables and show receivables separately in Arabic and English.
- **SC-007**: Zero tested production, unsupported, or disabled tracking cases return demo data,
  provider success, or a posted financial transaction.
- **SC-008**: 100% of demo tracking cases are explicitly identifiable as demonstrations in
  user-visible and assistive text.
- **SC-009**: The focused obligation journey passes without material asynchronous warnings and
  retains its accessibility assertions.
- **SC-010**: Every feedback ID from 1 through 62 has exactly one current status and evidence or
  a named dependency; no device, external, live-integration, or product-decision item is marked
  complete from repository inspection alone.
- **SC-011**: All in-scope automated checks and the complete Mobile type, lint, and test gates
  pass with zero unrelated changed files and zero duplicated SPEC-BE-006 implementation.

## Assumptions

- The Gulf localization baseline on current main is complete and is preserved as the starting
  point for this slice.
- Current Mobile repositories, domain models, routes, formatters, localization structure,
  design-system primitives, and local data-upgrade pattern remain authoritative.
- SPEC-BE-006 owns production synchronization and may change overlapping Mobile storage files;
  overlapping work waits for its committed contract and integrates it once.
- Completed SPEC-BE-005 ledger direction is the compatibility target for the local payoff
  contract; no server-side payoff or ledger behavior is added here.
- Existing documented defaults apply to deferred product questions; no Home redesign, avatar,
  tax, household, referral, investment, general recurrence, or statement-import scope is added.
- Client item #50 requires the archive owner's manual external action.
- Device-only, live-provider, secret, OTP, and external-service evidence remains outside
  repository verification and is recorded honestly.
