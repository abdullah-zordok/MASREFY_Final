# Masarifi Mobile App — Frontend Product and Screen Specification

**Document Type:** SpecKit Master Frontend Specification  
**Platform:** iOS and Android  
**Application:** `apps/mobile`  
**Status:** Planning and approval before implementation  
**Scope:** Mobile frontend only  
**Architecture Target:** Shared React Native codebase with platform-aware experiences  

**Supported Languages:**
- Arabic — Core product language, RTL
- English — Core product language, LTR

Both Arabic and English are first-class product languages. Every screen, feature, validation message, notification, report, assistant experience, accessibility label, and frontend state must provide complete functional and visual parity in both languages.

**Design Direction:** Masarifi Gulf Premium  

**Specifications:** 10 implementation specs

**Production cutover amendment (2026-09-08):** The approved Phase 14 backend work authorizes
production Mobile integration through the accepted typed backend contracts. Historical
frontend-only and mock-only statements below describe the original UI delivery boundary; they
no longer prohibit live adapters. Production must fail closed, preserve owner-scoped local and
offline state, keep mocks limited to explicit demo/test modes, and report unfinished providers
as unavailable. The initial production release is free-only: billing, checkout, subscriptions,
promotions, and paid entitlement remain unavailable.

---

# 0. Document Purpose

This document is the frontend source of truth for the Masarifi mobile application.

It converts the approved Masarifi product direction into ten implementation-ready SpecKit specifications for a shared iOS and Android application.

The document is intentionally limited to:

- Product behavior visible to the mobile user.
- Mobile information architecture.
- User journeys.
- Screen requirements.
- Design-system adaptation.
- Navigation.
- Frontend state management.
- Mock authentication.
- Mock data and mock services.
- Platform-aware Android and iOS flows.
- Accessibility.
- Testing and acceptance criteria.

The document does **not** define the production backend, database, AI provider, SMS infrastructure, email delivery service, payment provider, or production authentication implementation.

All server-dependent features must be represented in the frontend through typed contracts, mock services, simulated states, and replaceable adapters.

---

# 0.1 Product Definition

Masarifi is not only an expense tracker.

Masarifi is an automatic-first personal finance companion that helps users:

1. Capture financial activity with minimal manual work.
2. Understand where their money goes.
3. Track salary, budgets, obligations, debts, installments, and savings.
4. Receive immediate feedback when financial activity is recorded.
5. Ask a smart financial assistant questions about their own data.
6. Receive understandable reports and practical saving suggestions.

The central product promise is:

> Masarifi helps users understand and control their money with the least possible effort.

The application must remain useful even when the user disables automation or rejects permissions.

---

# 0.2 Core Product Pillars

## Pillar A — Automatic Capture

On Android, Masarifi prioritizes automatic detection of financial SMS messages after explicit user permission.

The application identifies eligible banking, transfer, installment, subscription, and payment messages, extracts transaction data, classifies the transaction, and adds it automatically when confidence is sufficient.

## Pillar B — Fast Manual Capture

Users can always add income, expenses, transfers, obligation payments, and adjustments manually.

## Pillar C — Voice Capture

Users can speak naturally about what they paid, received, transferred, or purchased.

The frontend converts the experience into a structured transaction review flow using mock speech and mock analysis services during the frontend phase.

## Pillar D — Financial Awareness

The application explains:

- How much the user owns.
- How much the user spent.
- What the user spent money on.
- What remains until the next salary.
- What obligations are due.
- How much debt remains.
- Whether budgets are on track.
- How savings goals are progressing.

## Pillar E — Financial Guidance

The smart assistant answers questions based on the user’s Masarifi data and provides contextual financial analysis and saving suggestions.

It must not silently change financial records.

---

# 0.3 Approved Scope Decisions

The following decisions are approved and must guide every specification:

- The project is frontend-only in this phase.
- Authentication is fully represented in the UI using mock services.
- Sign-in methods include phone-based authentication and Google sign-in.
- Android automatic transaction tracking is a primary product feature.
- Android tracking uses the SMS permission flow as the main onboarding priority.
- Automatically detected clear transactions are added automatically.
- Unclear or conflicting transactions are sent to a review queue.
- Every automatic addition provides a visible undo or edit path.
- Users can add, remove, disable, and restore financial keywords.
- Voice transaction capture is a primary feature.
- Reports are a dedicated major section.
- Reports support monthly, three-month, half-year, and annual periods.
- Users can configure automatic report delivery by email.
- Obligations are one primary section containing debts, installments, loans, recurring bills, subscriptions, and upcoming payments.
- Obligation payments detected from SMS must update both the transaction ledger and the related obligation.
- Users can manually record monthly installment payments.
- Notifications exist both inside the application and on the phone.
- The smart assistant is a core feature, not a future experiment.
- Investments are Post-MVP.
- Camera access, receipt photography, and in-app receipt scanning are excluded.
- The application must not promise Android SMS behavior on iOS.
- iOS must provide honest alternative capture paths such as manual entry, voice entry, and approved platform automation flows.
- The mobile application reuses the approved Masarifi design foundations but does not copy the Admin Dashboard layout.

---

# 0.4 Scope Classification

## Core V1

- Authentication UI.
- Google sign-in UI.
- Progressive onboarding.
- Android SMS tracking onboarding.
- Home dashboard.
- Accounts.
- Transactions.
- Categories.
- Manual transaction entry.
- Voice transaction entry.
- Salary.
- Budgets.
- Obligations.
- Debts and installments.
- Savings goals.
- Reports.
- Automatic report email settings.
- Notifications.
- Smart financial assistant.
- Profile.
- Security settings.
- Subscription and paywall UI.
- Support.
- Offline and synchronization states.
- Arabic and English.
- Light and dark modes.

## Platform-Specific V1

### Android

- SMS permission onboarding.
- SMS tracking status.
- Keyword management.
- Approved sender management.
- Automatic transaction detection UI.
- Background tracking state.
- Detected transaction notifications.
- Review queue.
- Permission recovery flows.

### iOS

- Platform explanation.
- Manual and voice-first capture.
- Optional Shortcuts, App Intents, and Share Extension setup UI.
- Quick actions.
- Widgets preview and configuration.
- No direct SMS inbox promise.

## Post-MVP

- Investments.
- Advanced predictive behavior intelligence.
- Advanced multi-currency portfolio views.
- Complex gamification.
- Open Finance or direct bank connection.
- Advanced file and statement import.
- Expanded merchant intelligence.

## Explicitly Excluded

- Camera permission.
- In-app receipt photography.
- Receipt scanning from the camera.
- Photo capture onboarding.
- A customer web dashboard.
- Production backend logic.
- Production AI integration.
- Production SMS parser implementation.
- Production email delivery.
- Production payment processing.

---

# 0.5 Recommended Technology Stack

The frontend implementation should use:

- React Native.
- Expo Development Builds.
- TypeScript.
- Expo Router.
- TanStack Query.
- Zustand.
- React Hook Form.
- Zod.
- Expo SecureStore.
- Expo Notifications.
- React Native Testing Library.
- Jest.
- Sentry integration boundary.
- Custom native modules only where platform functionality requires them.

The project must use a feature-based architecture and typed service adapters.

No production API key, AI provider key, SMS provider secret, payment secret, or service-role credential may exist in the mobile application.

---

# 0.6 SpecKit Structure

The master document is divided into ten specs:

| Spec | Title |
|---|---|
| SPEC-001 | Product Foundation, Scope, and UX Principles |
| SPEC-002 | Mobile Design System and Interaction Language |
| SPEC-003 | App Shell, Navigation, Authentication, and Progressive Onboarding |
| SPEC-004 | Home, Accounts, Transactions, and Categories |
| SPEC-005 | Automatic Transaction Capture and Platform-Specific Tracking |
| SPEC-006 | Voice Transaction Capture and Smart Categorization UX |
| SPEC-007 | Salary, Budgets, Obligations, Debts, Installments, and Savings |
| SPEC-008 | Reports and Automatic Email Delivery |
| SPEC-009 | Notifications, Smart Financial Assistant, Subscriptions, and Support |
| SPEC-010 | Frontend Architecture, Mock Services, Accessibility, Testing, and Delivery |

Suggested SpecKit folders:

```text
specs/
├── 001-mobile-foundation/
├── 002-mobile-design-system/
├── 003-app-shell-auth-onboarding/
├── 004-core-finance/
├── 005-automatic-tracking/
├── 006-voice-capture/
├── 007-financial-planning/
├── 008-reports/
├── 009-assistant-notifications/
└── 010-frontend-quality/
```

---

# SPEC-001 — Product Foundation, Scope, and UX Principles

## 1. Objective

Define the immutable product and user-experience rules that every mobile feature must follow.

This spec exists to prevent the mobile application from becoming a collection of disconnected finance screens.

## 2. Primary User Problem

Users often know their salary but do not know:

- Where money disappears during the month.
- Which categories consume the largest share.
- How much remains before the next salary.
- How many obligations are still unpaid.
- Whether debt is decreasing.
- Whether current spending supports savings goals.

Manual expense tracking creates friction and is abandoned quickly.

Masarifi must reduce this friction through automatic capture, voice entry, progressive setup, contextual notifications, and clear financial summaries.

## 3. Product Experience Principles

### 3.1 Automatic First, Manual Always Available

Automation is the preferred path, but users must never be blocked when automation fails.

Every automatic feature requires a manual fallback.

### 3.2 One Screen, One Primary Goal

Each screen must answer one main question or support one main action.

Examples:

- Home: What is my financial position now?
- Transactions: How did my money move?
- Reports: What happened during this period?
- Obligations: What do I still owe?
- Savings: How close am I to my goal?
- Assistant: What should I understand or do next?

### 3.3 Progressive Disclosure

Do not show advanced options before they are needed.

Advanced filters, technical tracking settings, parser details, and complex financial options should appear only after user intent is clear.

### 3.4 Progressive Onboarding

The user must not be forced to enter a complete financial profile before receiving value.

Android automatic tracking setup takes priority over asking for salary, budget, debt, or savings information.

### 3.5 Trust Through Reversibility

Any automatic financial change must support:

- Undo.
- Edit.
- View source.
- Report incorrect detection.

### 3.6 No Hidden Financial Changes

The assistant may suggest actions, but it may not create, modify, or delete financial records without explicit user confirmation.

### 3.7 Honest Platform Differences

Android and iOS must share the same product identity, but not pretend to have identical operating-system capabilities.

### 3.8 Calm, Non-Judgmental Language

The interface must not shame users.

Avoid language such as:

- “You failed.”
- “Your spending is bad.”
- “You wasted money.”

Prefer:

- “Spending is higher than your usual range.”
- “You are close to your selected limit.”
- “Here is one possible way to reduce this category.”

### 3.9 Financial Clarity Before Decoration

Amounts, dates, account names, statuses, and next actions must be visually clearer than illustrations or decoration.

### 3.10 Privacy by Design

The user must understand:

- What permission is requested.
- Why it is needed.
- What data is analyzed.
- How to disable the feature.
- How to remove local data.

## 4. Global Frontend States

Every async screen and important component must support:

- Initial.
- Loading.
- Success.
- Empty.
- Error.
- Offline.
- Partial data.
- Permission required.
- Permission denied.
- Permission permanently denied.
- Sync pending.
- Sync failed.
- Read-only.
- Disabled.
- Archived.

## 5. Core Frontend Success Measures

The UX should be designed to support these outcomes:

- A returning user can understand their current financial position within seconds.
- Manual expense entry requires minimal fields.
- Voice capture reaches a reviewable transaction quickly.
- Automatic SMS transactions appear without requiring confirmation when confidence is high.
- Incorrect automatic transactions can be corrected or undone immediately.
- Users can understand obligation progress without doing manual calculations.
- Reports clearly compare periods.
- The assistant explains numbers rather than repeating them.
- Permission-denied users still receive a complete usable application.

## 6. Global Acceptance Criteria

- The application works in Arabic RTL and English LTR.
- Every core feature has loading, empty, error, and offline states.
- No camera entry point exists.
- No receipt scanner entry point exists.
- Investments do not appear in Core V1 navigation.
- Android automatic tracking is visible as a primary value proposition.
- iOS does not show an Android SMS permission flow.
- All automatic financial changes expose undo or correction.
- All critical forms preserve entered data if the user navigates away accidentally.
- Sensitive values can be hidden globally.
- All amounts and dates use English numerals according to the approved product design rule.

## 7. Out of Scope

- Backend authorization.
- Financial calculation source of truth.
- Real SMS parsing.
- Real AI.
- Real email sending.
- Real payment processing.

---

# SPEC-002 — Mobile Design System and Interaction Language

## 1. Objective

Adapt the approved Masarifi Gulf Premium design system to mobile without copying the Admin Dashboard interface.

The mobile experience must feel calm, premium, trustworthy, modern, and easy to use with one hand.

## 2. Shared Brand Foundations

The mobile application must preserve:

- Dark teal as the main brand anchor.
- Clean neutral surfaces inspired by the Admin Dashboard, with warm cream reserved for small branded or premium accents.
- Restrained premium accent usage.
- Light borders.
- Simple cards.
- Minimal shadows.
- No heavy gradients.
- No glassmorphism.
- No visual noise.
- Strong amount hierarchy.
- Calm financial status colors.
- Arabic RTL and English LTR parity.

## 3. Typography

### Arabic

- Tajawal or the approved final Arabic product font.
- Clear Arabic shapes at small sizes.
- Strong differentiation between headings, labels, values, and helper text.

### English, Numbers, Dates, and Currency

- DM Sans.
- All numbers and dates use English numerals.
- Currency codes or approved currency symbols must remain readable in RTL.

### Numeric Hierarchy

Amounts must use tabular or stable-width numeric behavior when available.

Priority order:

1. Main balance or report total.
2. Supporting amount.
3. Percentage or comparison.
4. Helper label.

## 4. Token Rules

The mobile application must consume shared semantic tokens from `packages/ui-tokens` where possible.

Do not hard-code brand colors inside feature components.

Required semantic token groups:

- Background.
- Surface.
- Surface elevated.
- Text primary.
- Text secondary.
- Text muted.
- Border subtle.
- Border strong.
- Brand primary.
- Brand pressed.
- Positive.
- Negative.
- Warning.
- Information.
- Disabled.
- Overlay.
- Focus.
- Chart categories.

## 5. Spacing and Layout

Use a consistent spacing scale.

Mobile screens must:

- Respect safe areas.
- Avoid content touching device edges.
- Keep primary actions reachable.
- Avoid dense desktop-style tables.
- Use progressive disclosure for secondary metadata.
- Preserve stable spacing when Arabic text wraps.
- Support small and large phones.
- Remain usable when system font size increases.

## 6. Shape Language

- Moderate corner radius.
- Cards should feel structured, not playful.
- Inputs and buttons share a consistent radius family.
- Pills are reserved for filters, statuses, keywords, and compact actions.
- Floating elements must be limited.
- Shadows must communicate elevation, not decoration.

## 7. Mobile Components

The design system must include:

### Navigation

- App bar.
- Bottom tab bar.
- Back button.
- Context menu.
- Overflow menu.
- Step indicator.
- Segmented control.
- Sticky section header.

### Financial Components

- Balance card.
- Account card.
- Transaction list item.
- Category icon.
- Amount input.
- Currency selector.
- Income and expense badge.
- Progress ring.
- Budget progress bar.
- Obligation progress card.
- Installment timeline.
- Savings goal card.
- Report metric card.
- Comparison indicator.

### Form Components

- Text field.
- Phone field.
- OTP field.
- Search field.
- Amount field.
- Date picker trigger.
- Time picker trigger.
- Account selector.
- Category selector.
- Payment method selector.
- Switch.
- Checkbox.
- Radio card.
- Chip selector.
- Keyword chip editor.
- Inline validation.
- Helper text.

### Feedback Components

- Toast.
- Snackbar.
- Undo snackbar.
- Success state.
- Error state.
- Empty state.
- Skeleton.
- Offline banner.
- Sync badge.
- Permission card.
- Review-required banner.
- Notification badge.

### Overlay Components

- Bottom sheet.
- Full-screen sheet.
- Confirmation dialog.
- Destructive action dialog.
- Account picker.
- Category picker.
- Filter sheet.
- Date-range sheet.
- Voice recording overlay.

## 8. Interaction Rules

- Prefer bottom sheets for short mobile decisions.
- Use full screens for multi-step or high-risk financial workflows.
- Do not put destructive and primary actions next to each other without separation.
- Always show immediate feedback after saving.
- Provide undo for reversible automatic actions.
- Disable repeated submission while a mutation is pending.
- Preserve form data after validation errors.
- Use haptic feedback sparingly for success, warning, and recording interactions.
- Support reduced motion.
- Avoid animation that delays access to financial information.

## 9. Charts and Reports

Charts must:

- Answer a specific question.
- Include readable labels.
- Remain understandable without color alone.
- Support screen-reader summaries.
- Avoid showing more categories than the screen can explain.
- Provide a path from chart segment to filtered transactions.
- Use comparison labels such as “12% higher than the previous period.”

## 10. Content Design

Buttons must use action-oriented labels:

- Add expense.
- Record payment.
- Enable tracking.
- Review transaction.
- Send report.
- Undo.
- Ask Masarifi.

Avoid vague labels such as:

- Continue, when the action can be named.
- Confirm, without explaining what will happen.
- Submit, for user-facing financial flows.

## 11. Responsive Targets

The application must be validated on:

- Small Android phones.
- Standard Android phones.
- Large Android phones.
- Standard iPhones.
- Large iPhones.
- Devices with display cutouts.
- Devices with gesture navigation.
- Portrait orientation as the primary experience.
- Tablet layouts as adaptive but not desktop replicas.

## 12. Acceptance Criteria

- No component uses a hard-coded brand color when a semantic token exists.
- Arabic and English layouts are visually balanced.
- Every interactive control has visible pressed, focused, disabled, and loading states.
- Financial amounts remain readable with large text settings.
- Touch targets are appropriate for both platforms.
- Charts are readable in light and dark modes.
- Bottom sheets do not hide critical actions behind the keyboard.
- The design remains premium without heavy shadows or gradients.

---

# SPEC-003 — App Shell, Navigation, Authentication, and Progressive Onboarding

## 1. Objective

Define the complete entry journey from first launch to the main application, with platform-aware onboarding and mocked authentication.

## 2. Recommended Bottom Navigation

The approved recommended structure is:

1. Home.
2. Transactions.
3. Add.
4. Reports.
5. More.

The Add action is the primary central action.

The Reports tab is permanent because reports are a major product capability.

Accounts are accessible from:

- Home balance card.
- Home accounts section.
- More.
- Transaction filters.
- Add transaction account selection.

The smart assistant is accessible from:

- A persistent assistant entry in the Home header.
- Contextual assistant cards.
- More.
- Report and budget insights.

## 3. Route Groups

```text
app/
├── (public)/
│   ├── splash
│   ├── language
│   ├── welcome
│   ├── sign-in
│   ├── sign-up
│   ├── phone
│   ├── otp
│   ├── google
│   └── legal
│
├── (onboarding)/
│   ├── tracking-intro
│   ├── android-sms-permission
│   ├── tracking-keywords
│   ├── tracking-preferences
│   ├── tracking-demo
│   └── onboarding-complete
│
├── (tabs)/
│   ├── home
│   ├── transactions
│   ├── add
│   ├── reports
│   └── more
│
└── modals/
    ├── account-picker
    ├── category-picker
    ├── filter
    ├── undo
    └── review-transaction
```

## 4. Authentication Methods

### 4.1 Phone Authentication UI

- Country code selection.
- Phone number input.
- Validation.
- Send OTP.
- OTP verification.
- Resend timer.
- Change phone number.
- Invalid code state.
- Expired code state.
- Too many attempts state.
- Mock success state.

### 4.2 Google Sign-In UI

- Continue with Google.
- Mock account selector.
- Loading.
- User cancellation.
- Failure.
- Existing account conflict.
- Link Google account suggestion.
- Mock success state.

### 4.3 Session UI

- Mock session restore.
- Session expired screen.
- Sign out.
- Sign out from all devices UI.
- Authentication required modal.
- Local session state reset.

## 5. First-Launch Journey

### Shared Beginning

```text
Splash
→ Language
→ Welcome
→ Sign in or create account
→ Platform detection
```

### Android Journey

```text
Platform detection
→ Automatic tracking introduction
→ SMS permission education
→ SMS permission request
→ Keyword configuration
→ Automatic-add preference
→ Mock detected transaction
→ Home
```

### iOS Journey

```text
Platform detection
→ Honest platform explanation
→ Voice and manual capture introduction
→ Optional Shortcuts or Share Extension setup
→ Mock capture demonstration
→ Home
```

## 6. Android Onboarding Priority

Android onboarding must present automatic financial SMS tracking before personal finance setup.

The user must understand the product value before being asked for salary, budgets, obligations, or goals.

### Tracking Introduction Screen

Must explain:

- Masarifi can detect eligible financial messages.
- It can identify expenses, income, transfers, subscriptions, and installment payments.
- Clear transactions can be added automatically.
- Uncertain transactions are sent for review.
- The user can disable tracking at any time.
- The user can edit keywords and tracking rules.

Primary action:

- Enable automatic tracking.

Secondary action:

- Not now.

Skipping must never block application access.

## 7. SMS Permission Education

Do not immediately show an operating-system permission prompt.

First show an in-app education screen with:

- What is requested.
- Why it is requested.
- What the user receives.
- What happens if permission is denied.
- Link to privacy explanation.
- Primary button to continue.
- Secondary button to skip.

## 8. Keyword Configuration

Users can manage default and custom keywords.

### Keyword Groups

- Expense.
- Income.
- Transfer.
- Withdrawal.
- Deposit.
- Refund.
- Subscription.
- Installment.
- Fee.
- Failed transaction.
- Reversal.

### User Actions

- Add keyword.
- Delete custom keyword.
- Disable default keyword.
- Restore defaults.
- Search keywords.
- Filter by language.
- Prevent duplicates.
- Warn before disabling all keywords in a group.

The UI must clarify that keywords are one signal, not the only signal.

## 9. Automatic-Add Preference

The recommended default is:

> Add clear transactions automatically and send uncertain transactions for review.

Optional user modes:

- Automatic for clear transactions.
- Review every detected transaction.
- Pause automatic tracking.

Automatic mode must still reject:

- Failed transactions.
- OTP messages.
- Marketing messages.
- Duplicates.
- Messages with unresolved amount conflicts.
- Messages with insufficient confidence.

## 10. Progressive Profile Completion

After entering Home, show an optional progress card:

- Add your name.
- Add your first account.
- Add salary.
- Create a budget.
- Add an obligation.
- Create a savings goal.

The card must be dismissible and must not dominate every session.

## 11. PIN and Biometrics

Frontend flows include:

- Create PIN.
- Confirm PIN.
- Change PIN.
- Forgot PIN.
- Temporary lock state.
- Enable Face ID or fingerprint.
- Disable biometrics.
- Auto-lock duration.
- Hide balances.
- Privacy screen in app switcher.

## 12. Acceptance Criteria

- Android users see tracking setup before financial profile setup.
- iOS users never see an SMS permission request.
- Phone and Google sign-in both work through mocks.
- Skipping permission setup leads to a usable Home screen.
- Progressive setup is optional.
- Auth forms preserve state on validation errors.
- RTL and LTR navigation direction is correct.
- Session-expired behavior is represented.
- PIN and biometric states are fully designed.
- No production authentication logic is embedded.

---

# SPEC-004 — Home, Accounts, Transactions, and Categories

## 1. Objective

Build the core daily finance experience.

This spec defines the Home dashboard, account management, transaction history, manual entry, transfers, refunds, categories, and correction workflows.

## 2. Home Dashboard

The Home screen must answer:

- How much money do I have?
- How much did I spend?
- How much did I receive?
- What is due soon?
- Am I within budget?
- What should I review?

## 3. Home Sections

Recommended order:

1. Header and assistant entry.
2. Total balance.
3. Current salary-cycle summary.
4. Quick actions.
5. Tracking status or permission recovery card.
6. Recent transactions.
7. Budget progress.
8. Upcoming obligations.
9. Savings goal progress.
10. Financial insight.
11. Profile-completion card when relevant.

## 4. Total Balance Card

Displays:

- Total available balance.
- Hidden balance state.
- Currency context.
- Change during selected period.
- Number of active accounts.
- Shortcut to Accounts.
- Multi-currency warning when totals are estimated.

## 5. Quick Actions

- Add expense.
- Add income.
- Transfer.
- Voice entry.
- Record obligation payment.
- Ask the assistant.

No camera or receipt action may appear.

## 6. Accounts

### Account Types

- Bank account.
- Debit card.
- Credit card.
- Digital wallet.
- Cash.
- Savings account.
- Other.

### Account List

- Total balance.
- Account cards.
- Account type.
- Masked identifier.
- Current balance.
- Available credit where relevant.
- Default account.
- Archived accounts.
- Empty state.

### Add or Edit Account

Fields:

- Account name.
- Type.
- Currency.
- Opening balance.
- Current balance.
- Institution.
- Last four digits.
- Credit limit.
- Default account.
- Icon and color.
- Notes.

### Account Detail

- Current balance.
- Available balance.
- Recent transactions.
- Income and expense summary.
- Account-specific report shortcut.
- Edit.
- Archive.
- Adjust balance.
- Transfer.

## 7. Transactions

### Transaction Types

- Expense.
- Income.
- Transfer.
- Refund.
- Adjustment.
- Obligation payment.
- Recurring payment.
- Automatically detected transaction.
- Voice-created transaction.
- Manually created transaction.

### Transaction List

- Group by date.
- Search.
- Filter.
- Sort.
- Period selection.
- Account filter.
- Category filter.
- Type filter.
- Source filter.
- Status filter.
- Amount range.
- Review-required filter.
- Automatic-source badge.
- Empty and offline states.

### Transaction Detail

- Amount.
- Currency.
- Type.
- Status.
- Merchant.
- Category.
- Account.
- Payment method.
- Date and time.
- Source.
- Original detected text preview when permitted.
- Linked obligation.
- Notes.
- Attachments area excluded in V1.
- Edit.
- Delete.
- Duplicate.
- Refund.
- Report incorrect classification.
- Undo when still available.

## 8. Manual Transaction Entry

### Required Fields

- Transaction type.
- Amount.
- Account or payment source.
- Category.
- Date.

### Optional Fields

- Merchant.
- Payment method.
- Time.
- Notes.
- Recurring setting.
- Link to obligation.
- Tags.

### UX Rules

- Use a financial amount keypad.
- Default to the last used account where appropriate.
- Suggest recent categories.
- Do not require merchant.
- Show one primary save action.
- Preserve data on validation error.
- Support draft state when offline.

## 9. Transfers

Fields:

- Source account.
- Destination account.
- Amount.
- Currency.
- Fee.
- Date.
- Notes.

Rules:

- Source and destination cannot be the same.
- The UI must explain the effect on both balances.
- Cross-currency transfers require a visible exchange-rate field or remain mock-only.

## 10. Refunds and Reversals

The user can:

- Create a refund linked to an original expense.
- View reversed transactions.
- See that a refund does not represent new salary or income.
- Correct an automatic detection that misread a reversal as an expense.

## 11. Categories

### Default Groups

- Housing.
- Food.
- Restaurants.
- Transportation.
- Fuel.
- Shopping.
- Health.
- Education.
- Entertainment.
- Digital subscriptions.
- Utilities.
- Communication and internet.
- Travel.
- Charity.
- Fees.
- Salary.
- Other income.
- Transfers.
- Obligations.

### Category Features

- System categories.
- Custom categories.
- Subcategories.
- Search.
- Favorite categories.
- Add.
- Edit.
- Archive.
- Merge.
- Icon.
- Color.
- Arabic and English label.
- Category suggestions.
- Reclassify historical transactions as a future backend action UI.

## 12. Automatic Transaction Feedback

When an SMS transaction is automatically added:

- Show a phone notification.
- Show an in-app notification.
- Add it to the transaction list.
- Update account balance.
- Update budget progress.
- Update reports.
- Update obligation progress if linked.
- Make it available to the assistant.
- Show an undo action.

## 13. Acceptance Criteria

- Home communicates the user’s current position without scrolling through excessive cards.
- Accounts are reachable from Home and More.
- Transaction entry is usable with one hand.
- No camera action exists.
- Automatic, voice, and manual sources are visibly distinguishable.
- Transactions can be searched and filtered.
- Refunds and failed transactions are not visually treated as normal expenses.
- Account and category selectors support search.
- Every automatic transaction exposes correction.
- Offline-created transactions show pending sync state.

---

# SPEC-005 — Automatic Transaction Capture and Platform-Specific Tracking

## 1. Objective

Define the complete frontend experience for automatic transaction detection, especially Android SMS tracking, while preserving honest iOS behavior.

## 2. Android Automatic SMS Tracking

Android automatic tracking is a core product feature.

The product flow is:

```text
Eligible SMS received
→ Local eligibility check
→ Structured analysis
→ Transaction extraction
→ Merchant and category mapping
→ Duplicate check
→ Automatic addition when clear
→ Review queue when uncertain
→ Notification and undo
```

The frontend phase simulates this flow with typed mock events.

## 3. Tracking Status Screen

The tracking status screen displays:

- Tracking enabled or disabled.
- SMS permission state.
- Last detected message time.
- Last successful transaction.
- Number of transactions detected this month.
- Number requiring review.
- Active keyword count.
- Active sender count.
- Background service state.
- Last sync state.

Actions:

- Enable.
- Pause.
- Resume.
- Open permission settings.
- Manage keywords.
- Manage senders.
- Review transactions.
- Run a demo.
- Clear local tracking history.

## 4. Supported Financial Event Types

The UI must represent:

- Purchase.
- Cash withdrawal.
- Deposit.
- Salary.
- Incoming transfer.
- Outgoing transfer.
- Refund.
- Reversal.
- Bank fee.
- Subscription payment.
- Installment payment.
- Failed transaction.
- Pending or held transaction.

## 5. Detected Transaction Structure

```ts
type DetectedTransaction = {
  id: string;
  source: "sms" | "voice" | "manual" | "ios-shortcut";
  type: "expense" | "income" | "transfer" | "refund" | "fee";
  status: "clear" | "review_required" | "ignored" | "failed";
  amount?: number;
  currency?: string;
  merchant?: string;
  categoryId?: string;
  subcategoryId?: string;
  accountHint?: string;
  paymentMethod?: string;
  occurredAt?: string;
  linkedObligationId?: string;
  confidence: number;
  reasons: string[];
};
```

## 6. Keyword Management

Keywords are grouped and editable.

The user can:

- Add custom keywords.
- Delete custom keywords.
- Disable default keywords.
- Re-enable keywords.
- Restore default packs.
- View Arabic and English packs.
- Search.
- See how many recent detections used a keyword.

Keywords must not imply that the application reads only those messages at the permission layer.

The privacy copy should explain that matching and filtering happen inside Masarifi after permission is granted.

## 7. Sender and Institution Management

The user can:

- View recognized financial senders.
- Enable or disable sender rules.
- Add a sender label.
- Associate a sender with a bank or provider.
- Search senders.
- Mark a sender as trusted.
- Remove a custom sender.
- View unknown sender review items.

## 8. Automatic Addition Rules in the UX

A transaction may be automatically added when the mock analyzer reports:

- Clear successful financial event.
- Single unambiguous amount.
- Known or valid currency.
- No duplicate.
- No failure wording.
- No OTP pattern.
- Sufficient transaction type confidence.
- Sufficient merchant or category confidence.
- Account match is known or optional.

## 9. Review Queue

A detected item enters review when:

- More than one amount exists.
- Transaction status is unclear.
- Merchant is unknown.
- Category confidence is low.
- The message may represent a reversal.
- Duplicate probability exists.
- More than one obligation may match.
- Account is ambiguous.
- The user’s rules conflict.

Review actions:

- Confirm.
- Edit.
- Link to account.
- Select category.
- Link to obligation.
- Keep both.
- Merge.
- Ignore.
- Report wrong detection.

## 10. Duplicate Warning

The comparison screen shows:

- New detected transaction.
- Existing possible match.
- Amount.
- Time.
- Merchant.
- Account.
- Source.
- Reasons for matching.

Actions:

- Keep existing.
- Keep new.
- Keep both.
- Merge details.

## 11. Obligation Matching

When a message appears to be a debt, installment, Tabby, Tamara, loan, or recurring payment:

The frontend must attempt to display a suggested obligation match based on:

- Provider.
- Amount.
- Due date.
- Account.
- Last four digits.
- Merchant reference.
- Installment position.

If one clear obligation matches:

- Add the transaction.
- Add an obligation payment.
- Update paid amount.
- Update remaining amount.
- Update completed installment count.
- Update next due date.
- Notify the user.

If multiple obligations match:

- Send to review.

## 12. Automatic Addition Notification

Example:

> Added SAR 250 at Netflix under Entertainment.

Actions:

- Undo.
- Edit.
- View.

Obligation example:

> Recorded SAR 2,500 for Car Installment. SAR 42,500 remains.

Actions:

- View obligation.
- Undo.
- Edit.

## 13. Permission Recovery

States:

- Not requested.
- Granted.
- Denied.
- Permanently denied.
- Disabled from system settings.
- Tracking paused.
- Service interrupted.
- Battery restriction warning.

Each state requires a specific explanation and action.

## 14. iOS Alternative Experience

iOS must not show direct SMS tracking.

Instead it provides:

- Manual transaction entry.
- Voice entry.
- Optional Shortcuts setup.
- Optional App Intents.
- Optional Share Extension.
- Quick actions.
- Widget configuration.
- Clear explanation of platform limitations.

The visual language must remain equal in quality to Android without implying equal SMS access.

## 15. Acceptance Criteria

- Android users can understand, enable, pause, and recover SMS tracking.
- Users can edit keywords and senders.
- Clear mock messages are added automatically.
- Ambiguous messages enter review.
- Duplicate handling is represented.
- Obligation payments update both relevant areas.
- Every automatic addition supports undo.
- iOS never shows an Android SMS permission.
- Tracking remains optional.
- The app remains usable after permission denial.

---

# SPEC-006 — Voice Transaction Capture and Smart Categorization UX

## 1. Objective

Allow users to record natural speech describing financial activity and convert it into one or more reviewable transactions.

## 2. Example User Statements

- “I paid 80 riyals for fuel in cash.”
- “I paid 250 riyals for Netflix using my Al Rajhi card.”
- “I transferred 500 riyals to Ahmed from my bank account.”
- “I received my salary of 7,000 riyals in Alinma.”
- “Yesterday I paid 40 riyals for coffee and 120 riyals for groceries.”
- “Record this month’s car installment, 2,500 riyals.”

## 3. Voice Flow

```text
Open voice entry
→ Request microphone permission
→ Record
→ Stop
→ Show transcript
→ Analyze
→ Show structured transaction
→ Confirm, edit, or re-record
→ Save
```

## 4. Voice Recording Screen

Components:

- Recording button.
- Recording duration.
- Waveform.
- Cancel.
- Stop.
- Re-record.
- Live or post-record transcript.
- Example phrases.
- Permission explanation.
- Background-noise warning.
- Maximum duration state.
- Interrupted recording state.

## 5. Extracted Fields

The frontend must represent:

- Transaction type.
- Amount.
- Currency.
- Merchant.
- Category.
- Subcategory.
- Payment method.
- Account.
- Date.
- Time.
- Beneficiary.
- Recurring intent.
- Obligation link.
- Notes.
- Confidence.
- Missing fields.

## 6. Payment Method vs Account

The UI must distinguish:

- Payment method: cash, card, transfer, wallet, Apple Pay, Google Pay.
- Funding account: Al Rajhi debit card, cash wallet, Alinma account.

Example:

```text
Payment method: Apple Pay
Funding account: Al Rajhi Card
```

## 7. Missing Information

If the voice statement omits a non-required value, the app should not block saving.

Example:

> “I bought coffee for 20 riyals.”

The frontend may suggest:

- Cash.
- Last used card.
- Choose account.
- Save without account.

## 8. Multiple Transactions

One recording may create multiple proposed transactions.

Example:

> “I paid 40 for fuel and 25 for coffee.”

The review screen must show separate cards with:

- Individual edit.
- Remove.
- Confirm all.
- Confirm selected.
- Re-record.

## 9. Recurring and Obligation Detection

If the statement contains:

- Monthly.
- Every week.
- Installment.
- Subscription.
- Rent.
- Loan payment.

The UI may suggest:

- Create a recurring transaction.
- Link to an existing obligation.
- Create a new obligation.
- Record as a one-time payment.

No recurring item is created without confirmation.

## 10. Smart Categorization UX

The categorization order represented by the frontend is:

```text
User rule
→ Known merchant rule
→ Keyword rule
→ Smart analysis suggestion
→ User confirmation when uncertain
```

When the user changes a category, show:

> Always use this category for this merchant?

Options:

- Yes.
- Only this time.
- Not now.

## 11. Frontend Mock Analyzer

```ts
interface VoiceAnalyzer {
  transcribe(audioReference: string): Promise<VoiceTranscript>;
  analyze(transcript: string): Promise<DetectedTransaction[]>;
}
```

Required mock scenarios:

- Clear single transaction.
- Missing account.
- Unknown merchant.
- Multiple transactions.
- Income.
- Transfer.
- Obligation payment.
- Failed analysis.
- Low-confidence result.
- Unsupported language.
- No speech detected.

## 12. Save Behavior

Voice-created transactions:

- Enter the normal transaction ledger.
- Update balances.
- Update budgets.
- Update reports.
- Update obligations if linked.
- Trigger an in-app notification.
- Trigger a phone notification according to preferences.
- Become visible to the smart assistant.

## 13. Acceptance Criteria

- Voice entry is accessible from Add and Home.
- The user can re-record.
- The transcript is visible before saving.
- One recording can produce multiple transactions.
- Missing optional data does not block saving.
- Low-confidence fields are clearly highlighted.
- Obligation payments can be linked.
- Category corrections can create a user preference.
- The frontend uses mocks and does not expose AI keys.

---

# SPEC-007 — Salary, Budgets, Obligations, Debts, Installments, and Savings

## 1. Objective

Provide financial planning and progress tracking without overwhelming the user.

## 2. Salary

### Salary Setup

- Salary amount.
- Currency.
- Salary day.
- Source name.
- Receiving account.
- Next salary date.
- Automatic detection toggle.
- Additional income source as optional future expansion.

### Salary Cycle

Displays:

- Current salary-cycle start.
- Next salary date.
- Days remaining.
- Income received.
- Expenses since salary.
- Upcoming obligations.
- Remaining amount.
- Suggested daily amount.
- Comparison with previous cycle.

### Detected Salary

When a salary message is detected:

- Add income transaction.
- Link to salary profile.
- Update cycle.
- Notify user.
- Handle different-than-usual salary amount.
- Allow correction.

## 3. Budgets

### Monthly Budget

- Expense limit.
- Income target.
- Savings target.
- Rollover setting.
- Copy previous month.
- Progress.
- Remaining amount.
- Forecast.
- Comparison.

### Category Budgets

- Category.
- Limit.
- Alert threshold.
- Current spend.
- Remaining.
- Percentage.
- Over-limit state.
- View related transactions.
- Move budget amount.
- Edit.
- Pause.
- Delete.

### Budget Notifications

- 50% reached, optional.
- 80% reached.
- 90% reached.
- Limit exceeded.
- Unusual spending.
- Period ending.

## 4. Obligations Information Architecture

The primary section is:

```text
Obligations
├── Overview
├── Installments and Loans
├── Debts
├── Recurring Bills
├── Subscriptions
├── Upcoming Payments
└── Payment History
```

## 5. Obligation Overview

Displays:

- Total outstanding amount.
- Amount due this month.
- Amount paid this month.
- Overdue amount.
- Next payment.
- Number of active obligations.
- Progress by obligation.
- Calendar or timeline.
- Review-required linked payments.

## 6. Add Obligation

Fields:

- Title.
- Type.
- Provider.
- Total amount.
- Paid amount.
- Remaining amount.
- Currency.
- Monthly installment.
- Number of installments.
- Paid installment count.
- Due day.
- Start date.
- End date.
- Funding account.
- Automatic SMS matching.
- Provider keywords.
- Reminder timing.
- Notes.

Types:

- Car installment.
- Personal loan.
- Tabby.
- Tamara.
- Credit-card installment.
- Rent.
- Utility.
- Subscription.
- Debt owed.
- Money owed to the user.
- Custom obligation.

## 7. Obligation Detail

Displays:

- Total amount.
- Paid amount.
- Remaining amount.
- Progress percentage.
- Monthly installment.
- Paid installments.
- Remaining installments.
- Next due date.
- Payment schedule.
- Linked transactions.
- Provider.
- Funding account.
- Automatic matching status.
- Payment history.

Actions:

- Record payment.
- Edit.
- Pause.
- Close.
- Add reminder.
- Link detected transaction.
- View related messages.
- Make an early payment.
- Mark completed.

## 8. Manual Monthly Payment

The user can record a payment manually.

Fields:

- Amount.
- Date.
- Account.
- Payment method.
- Notes.
- Full or partial payment.
- Early payment.
- Principal reduction.
- Link to transaction.

After saving:

- Add an expense transaction.
- Add obligation payment.
- Update paid amount.
- Update remaining amount.
- Update installment count.
- Update next due date.
- Notify user.

## 9. Automatic SMS Payment Matching

Example:

```text
SAR 2,500 paid to TAMARA
```

Possible result:

```text
Transaction: Expense, SAR 2,500
Category: Obligations
Subcategory: Car Installment
Linked obligation: Car Installment
Completed installments: 7 of 24
Remaining: SAR 42,500
```

Matching signals represented in the UI:

- Provider.
- Amount.
- Date.
- Account.
- Last four digits.
- Reference.
- Closest due installment.

Ambiguous matches go to review.

## 10. Payment Cases

### Full Payment

- Mark installment paid.
- Move to next installment.

### Partial Payment

- Show remaining amount for the current installment.
- Do not increment the completed installment count until rules allow it.

### Overpayment

Ask whether the amount:

- Covers multiple installments.
- Reduces principal.
- Represents a correction.

### Early Settlement

- Show estimated remaining total from mock data.
- Confirm closure.
- Preserve payment history.

## 11. Savings Goals

### Goal List

- Active.
- Completed.
- Paused.
- Emergency fund.
- Progress.

### Add Goal

- Title.
- Target amount.
- Current amount.
- Currency.
- Target date.
- Linked account.
- Icon.
- Monthly contribution suggestion.
- Emergency-fund toggle.

### Goal Detail

- Progress.
- Remaining.
- Time remaining.
- Required monthly saving.
- Contribution history.
- Add money.
- Withdraw money.
- Pause.
- Complete.
- Archive.

### Achievement Experience

- Calm success state.
- Optional celebration.
- Next-goal suggestion.
- No excessive gamification.

## 12. Acceptance Criteria

- Salary-cycle information is understandable without calculation.
- Budgets show progress and related transactions.
- Obligations contain all debt, installment, bill, and subscription experiences.
- Users can manually add monthly installment payments.
- SMS-detected obligation payments update the obligation.
- Partial and overpayment states exist.
- Savings goals support deposits and withdrawals.
- All sections work with mock data.
- Investments are not included in this spec.

---

# SPEC-008 — Reports and Automatic Email Delivery

## 1. Objective

Create a dedicated reports section that explains financial behavior across clear time periods and supports scheduled email delivery.

## 2. Report Periods

Required periods:

- Monthly.
- Last three months.
- Half-year.
- Annual.

Optional:

- Custom period.
- Salary cycle.
- Current month to date.

## 3. Reports Tab

The Reports tab includes:

- Period selector.
- Summary card.
- Income and expense comparison.
- Net cash flow.
- Category spending.
- Account activity.
- Top merchants.
- Budget performance.
- Obligation payments.
- Savings progress.
- Salary-cycle summary.
- Previous-period comparison.
- Smart assistant explanation.
- Email report settings.

## 4. Report Summary

Displays:

- Total income.
- Total expense.
- Net cash flow.
- Savings rate.
- Obligation payments.
- Largest spending category.
- Largest individual transaction.
- Comparison with previous period.

## 5. Report Types

### 5.1 Monthly Report

- Income.
- Expenses.
- Net cash flow.
- Budget performance.
- Top categories.
- Obligations paid and due.
- Savings progress.
- Month-over-month comparison.

### 5.2 Three-Month Report

- Trend.
- Average monthly spending.
- Category movement.
- Recurring payments.
- Spending volatility.
- Savings consistency.

### 5.3 Half-Year Report

- Six-month trend.
- Highest and lowest spending months.
- Debt reduction.
- Budget consistency.
- Savings progression.
- Subscription impact.

### 5.4 Annual Report

- Total annual income and expense.
- Annual net cash flow.
- Category distribution.
- Salary and obligation overview.
- Debt progress.
- Savings achievements.
- Monthly comparison.
- Assistant-generated summary using mock content.

## 6. Drill-Down

Users can tap:

- A category to view filtered transactions.
- An account to view account activity.
- An obligation to view its payment history.
- A month to compare details.
- A merchant to view merchant history.

## 7. Chart Rules

- Limit visible categories.
- Use “Other” when needed.
- Provide text summaries.
- Do not rely on color alone.
- Support RTL chart labels.
- Provide empty states.
- Provide insufficient-data states.
- Provide loading skeletons.

## 8. Automatic Email Delivery Settings

The user can configure:

- Enable automatic reports.
- Delivery period:
  - Monthly.
  - Every three months.
  - Half-year.
  - Annual.
- Recipient email.
- Report language.
- Report currency.
- Delivery day.
- Include assistant summary.
- Include detailed transactions or summary only.
- Send a test report.
- Send now.
- Pause delivery.

## 9. Delivery Status UI

Display:

- Last report sent.
- Next scheduled report.
- Recipient email.
- Delivery enabled.
- Sending.
- Sent.
- Failed.
- Email verification required.
- Retry.
- Change email.

During the frontend phase, all delivery behavior is mocked.

## 10. Report Export and Sharing UI

The frontend can represent:

- Preview report.
- Share report.
- Download report.
- Send by email.
- Privacy warning.

Actual file generation may remain mocked until implementation scope is approved.

## 11. Assistant Integration

Contextual actions:

- Explain this report.
- Why did spending increase?
- Where can I save?
- Compare this period.
- Create a saving plan.

The assistant must cite values from the displayed report state, not invent unsupported totals.

## 12. Acceptance Criteria

- Reports are a permanent main tab.
- All four required periods exist.
- Each report answers a clear question.
- Charts provide text alternatives.
- Users can schedule email delivery.
- Users can see last and next delivery.
- Failure states are represented.
- Report drill-down leads to filtered transactions.
- No production email integration exists in the frontend.

---

# SPEC-009 — Notifications, Smart Financial Assistant, Subscriptions, and Support

## 1. Objective

Connect financial activity to timely feedback, contextual guidance, subscription experiences, and user support.

## 2. Notification Types

### Transaction Notifications

- Automatic expense added.
- Automatic income added.
- Voice transaction added.
- Manual transaction added.
- Transaction needs review.
- Duplicate detected.
- Refund detected.

### Obligation Notifications

- Installment recorded.
- Partial payment recorded.
- Payment due soon.
- Payment overdue.
- Obligation completed.
- Automatic payment needs linking.

### Budget Notifications

- Threshold reached.
- Budget exceeded.
- Unusual category increase.

### Salary Notifications

- Salary detected.
- Salary date approaching.
- Salary amount differs from usual.

### Savings Notifications

- Contribution recorded.
- Goal milestone.
- Goal completed.

### Report Notifications

- Report ready.
- Email report sent.
- Email delivery failed.

### Assistant Notifications

- New insight.
- Saving opportunity.
- Spending anomaly.
- Suggested plan.

### Security and System Notifications

- New session.
- Permission disabled.
- Sync failed.
- Application update.
- Maintenance.

## 3. In-App Notification Center

Features:

- All.
- Unread.
- Transactions.
- Obligations.
- Budgets.
- Reports.
- Assistant.
- Security.
- Mark read.
- Mark all read.
- Delete.
- Open linked destination.
- Group by date.
- Empty state.
- Offline state.

## 4. Phone Notifications

Phone notifications must support:

- Clear title.
- Short body.
- Hidden-sensitive-data mode.
- Deep link.
- Quick actions where supported.

Examples:

> Added SAR 250 at Netflix under Entertainment.

> Recorded SAR 2,500 for Car Installment. SAR 42,500 remains.

Quick actions:

- View.
- Edit.
- Undo.

## 5. Notification Preferences

- Push enabled.
- Transaction alerts.
- Income alerts.
- Obligation alerts.
- Budget alerts.
- Salary alerts.
- Savings alerts.
- Report alerts.
- Assistant insights.
- Security alerts.
- Quiet hours.
- Daily summary.
- Weekly summary.
- Hide amounts on lock screen.

## 6. Smart Financial Assistant

The assistant is data-aware after user consent.

It can use mock access to:

- Accounts.
- Transactions.
- Salary.
- Budgets.
- Obligations.
- Debts.
- Installments.
- Savings goals.
- Reports.
- Categories.
- Recurring payments.

## 7. Assistant Questions

Examples:

- How much did I spend on restaurants this month?
- What increased over the last three months?
- How much remains on my car installment?
- Can I save SAR 1,000 per month?
- Which subscriptions could I review?
- What is my average daily spending?
- Compare this month with the previous month.
- Build a saving plan for a travel goal.

## 8. Assistant Response Types

### Direct Answer

> You spent SAR 1,250 on restaurants this month.

### Comparison

> Restaurant spending is 18% higher than last month.

### Explanation

> The increase came mainly from four weekend orders.

### Saving Suggestion

> Reducing restaurant orders by one per week may save about SAR 420 per month.

### Plan

> To save SAR 12,000 in eight months, the target is SAR 1,500 per month.

### Obligation Analysis

> Three obligations are due this month, totaling SAR 4,800.

## 9. Assistant Actions

The assistant may propose:

- Create budget.
- Adjust budget.
- Create savings goal.
- Add reminder.
- Open transactions.
- Show subscriptions.
- Link a transaction.
- Review an obligation.
- Create a plan.

Required flow:

```text
Assistant suggestion
→ Preview change
→ User confirmation
→ Mock execution
→ Success or failure
```

No silent changes.

## 10. Assistant Screens

- Assistant Home.
- New conversation.
- Suggested questions.
- Conversation.
- Insight detail.
- Saving plan.
- Conversation history.
- Delete conversation.
- Rename conversation.
- Feedback.
- Usage limit.
- Error.
- Privacy explanation.

## 11. Assistant Safety and Trust UX

- Display that guidance is educational.
- Do not present investment advice.
- Do not invent balances.
- Explain when data is insufficient.
- Distinguish fact, estimate, and suggestion.
- Allow users to disable personalization.
- Allow deletion of conversation history.
- Require confirmation for any data change.

## 12. Subscriptions and Paywalls

Frontend subscription UI includes:

- Current plan.
- Free, Basic, and Premium comparison.
- Feature limits.
- Monthly and annual options.
- Trial UI.
- Paywall.
- Checkout mock.
- Payment success.
- Payment failure.
- Restore purchases.
- Change plan.
- Cancel.
- Renewal date.
- Expired state.
- AI or tracking usage limits.

The payment mechanism is not fixed in the frontend specification.

## 13. Profile and Settings

### Profile

- Name.
- Avatar placeholder.
- Phone.
- Google account.
- Email.
- Country.
- Currency.
- Timezone.
- Profile completion.

### Application Settings

- Language.
- Theme.
- First day of week.
- Default account.
- Hide balances.
- Transaction defaults.
- Dashboard customization.
- Tracking settings.
- Voice settings.
- Report email settings.
- Notification preferences.

### Security

- PIN.
- Biometrics.
- Auto-lock.
- Session list mock.
- Sign out.
- Sign out all devices.
- Security events.
- Delete local data.

### Privacy

- Tracking consent.
- Assistant personalization.
- Analytics.
- Data export request UI.
- Account deletion request UI.
- Legal documents.
- Privacy explanation.

## 14. Support

- Help center.
- FAQ.
- Search.
- Create ticket.
- Ticket category.
- Subject.
- Description.
- Optional file attachment excluded unless separately approved.
- Ticket list.
- Ticket detail.
- Reply.
- Rate support.
- Send feedback.
- Report incorrect transaction.
- Report assistant response.
- App version.
- What’s new.

## 15. Acceptance Criteria

- Financial changes trigger in-app and phone-notification mocks.
- Users can control notification categories.
- Sensitive amounts can be hidden.
- The assistant can answer from mock financial context.
- Assistant actions require confirmation.
- Subscription UI is complete without a fixed payment provider.
- Profile, privacy, security, and support screens exist.
- Users can disable assistant personalization.
- Notification deep links open relevant screens.

---

# SPEC-010 — Frontend Architecture, Mock Services, Accessibility, Testing, and Delivery

## 1. Objective

Define the technical and quality rules required to implement the ten specs reliably without coupling the frontend to unfinished backend behavior.

## 2. Recommended Project Structure

```text
apps/mobile/
├── app/
│   ├── (public)/
│   ├── (onboarding)/
│   ├── (tabs)/
│   ├── assistant/
│   ├── obligations/
│   ├── accounts/
│   ├── reports/
│   └── modals/
│
├── src/
│   ├── components/
│   ├── design-system/
│   ├── features/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── dashboard/
│   │   ├── accounts/
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── tracking/
│   │   ├── voice/
│   │   ├── salary/
│   │   ├── budgets/
│   │   ├── obligations/
│   │   ├── savings/
│   │   ├── reports/
│   │   ├── notifications/
│   │   ├── assistant/
│   │   ├── subscriptions/
│   │   ├── profile/
│   │   └── support/
│   │
│   ├── services/
│   │   ├── adapters/
│   │   ├── mocks/
│   │   └── contracts/
│   │
│   ├── state/
│   ├── hooks/
│   ├── localization/
│   ├── validation/
│   ├── analytics/
│   ├── test-utils/
│   └── utils/
│
└── assets/
```

## 3. Architecture Principles

- Feature-based organization.
- Typed contracts.
- Replaceable service adapters.
- No direct AI provider calls.
- No direct database access.
- No service-role secrets.
- No business rules hidden in UI components.
- UI components remain presentational where possible.
- Financial domain values use explicit types.
- Async state uses TanStack Query.
- Local UI and session state use Zustand.
- Forms use React Hook Form and Zod.
- Sensitive local session values use SecureStore.
- Platform logic is isolated behind adapters.
- Mock and production adapters share interfaces.

## 4. Service Interfaces

### Authentication

```ts
interface AuthService {
  signInWithPhone(phone: string): Promise<MockOtpSession>;
  verifyOtp(sessionId: string, code: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<void>;
}
```

### Transactions

```ts
interface TransactionService {
  list(filters: TransactionFilters): Promise<Transaction[]>;
  get(id: string): Promise<Transaction>;
  create(input: CreateTransactionInput): Promise<Transaction>;
  update(id: string, input: UpdateTransactionInput): Promise<Transaction>;
  remove(id: string): Promise<void>;
}
```

### Tracking

```ts
interface TrackingService {
  getStatus(): Promise<TrackingStatus>;
  requestPermission(): Promise<PermissionResult>;
  analyzeMockSms(message: string): Promise<DetectedTransaction[]>;
  updateKeywords(input: KeywordRuleInput[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}
```

### Voice

```ts
interface VoiceService {
  transcribe(audioReference: string): Promise<VoiceTranscript>;
  analyze(transcript: string): Promise<DetectedTransaction[]>;
}
```

### Assistant

```ts
interface AssistantService {
  ask(input: AssistantQuestion): Promise<AssistantResponse>;
  previewAction(actionId: string): Promise<AssistantActionPreview>;
  executeMockAction(actionId: string): Promise<AssistantActionResult>;
}
```

### Reports

```ts
interface ReportService {
  getReport(period: ReportPeriod): Promise<FinancialReport>;
  scheduleEmail(input: ReportScheduleInput): Promise<ReportSchedule>;
  sendNow(input: SendReportInput): Promise<MockDeliveryResult>;
}
```

## 5. Mock Data Requirements

Mock data must include:

- New user.
- User without accounts.
- User with multiple accounts.
- User with salary.
- User without salary.
- User within budget.
- User near budget limit.
- User over budget.
- User with debts.
- User with Tabby or Tamara installments.
- User with overdue obligation.
- User with savings goals.
- User with completed goal.
- SMS transaction.
- Duplicate transaction.
- Failed transaction.
- Refund.
- Salary message.
- Installment message.
- Voice transaction.
- Multiple voice transactions.
- Low-confidence classification.
- Assistant insight.
- Report email success and failure.
- Notification permission denied.
- SMS permission denied.
- Offline user.
- Sync conflict.

## 6. State Management Rules

### TanStack Query

Use for:

- Transaction lists.
- Accounts.
- Reports.
- Obligations.
- Notifications.
- Assistant conversations.
- Subscription state.
- Mock async mutations.

### Zustand

Use for:

- Session shell state.
- Selected language.
- Theme.
- Hidden balance preference.
- Onboarding progress.
- Permission walkthrough state.
- Draft transaction.
- Voice recording state.
- Unsynced local items.
- Temporary undo queue.

Do not duplicate the same server-shaped data in both systems.

## 7. Offline and Sync UX

Required states:

- Offline banner.
- Pending sync badge.
- Local transaction created.
- Retry.
- Sync failed.
- Conflict.
- Last sync time.
- Sync center.
- Restored connection.
- Background sync paused.

Rules:

- Manual entries may be saved locally.
- Automatic mock tracking events can appear as pending sync.
- The user must not lose entered data.
- Conflict resolution must be understandable.
- The frontend must not pretend an item is synced when it is not.

## 8. Localization

- Arabic and English are first-class product languages.
- Neither language may receive partial screens, missing content, reduced functionality, or lower visual quality.
- Arabic uses RTL layouts.
- English uses LTR layouts.
- No hard-coded user-facing strings.
- Layout direction follows locale.
- Icons with directional meaning mirror when appropriate.
- Numbers and dates remain English numerals.
- Currency formatting must be locale-aware but consistent with product rules.
- Arabic financial terms must be reviewed for clarity.
- Truncation must not hide amounts or statuses.

## 9. Accessibility

Required:

- Screen-reader labels.
- Clear focus order.
- Dynamic font support.
- Sufficient contrast.
- Non-color status indicators.
- Accessible chart summaries.
- Large touch targets.
- Reduced motion.
- Haptic alternatives are not required for understanding.
- Inputs have labels, not placeholders only.
- Error messages identify the field and correction.
- Voice entry has text alternatives.
- Permission flows are understandable without illustrations.

## 10. Testing Strategy

### Unit Tests

- Formatters.
- Validators.
- Category mapping.
- State reducers.
- Undo queue.
- Report period selection.
- Obligation progress calculations for mock display.
- Permission-state mapping.

### Component Tests

- Transaction item.
- Amount input.
- Account selector.
- Category selector.
- Keyword editor.
- Notification card.
- Obligation progress.
- Report summary.
- Assistant action preview.
- Voice review card.

### Screen Tests

- Sign in.
- Android tracking onboarding.
- Home.
- Transaction list.
- Add transaction.
- Voice capture.
- Obligation detail.
- Reports.
- Notifications.
- Assistant conversation.
- Settings.

### Integration Flows

- Phone sign-in mock.
- Google sign-in mock.
- Android SMS permission granted.
- Android SMS permission denied.
- Auto-add clear transaction.
- Review ambiguous transaction.
- Undo automatic transaction.
- Link installment payment.
- Manual installment payment.
- Voice transaction.
- Monthly report.
- Schedule report email.
- Assistant saving suggestion.
- Confirm assistant action.
- Offline transaction and retry.

## 11. Visual QA

Validate:

- Arabic RTL.
- English LTR.
- Light mode.
- Dark mode.
- Small phone.
- Large phone.
- Keyboard open.
- Long Arabic text.
- Large accessibility text.
- Hidden balances.
- Empty data.
- Dense data.
- Offline.
- Permission denied.
- Loading skeletons.
- Bottom sheets.
- Safe areas.

## 12. Performance Rules

- Avoid rendering all transactions at once.
- Use list virtualization.
- Memoize expensive derived presentation data.
- Avoid unnecessary global re-renders.
- Defer non-critical dashboard sections.
- Keep startup shell lightweight.
- Do not block navigation on optional mock requests.
- Optimize chart rendering.
- Avoid oversized images and animations.

## 13. Analytics Event Plan

Frontend event names should be defined without sending production analytics yet.

Examples:

- `auth_phone_started`
- `auth_google_started`
- `tracking_intro_viewed`
- `tracking_permission_granted`
- `tracking_permission_skipped`
- `tracking_keyword_added`
- `transaction_auto_added`
- `transaction_auto_undone`
- `transaction_review_completed`
- `voice_recording_started`
- `voice_transaction_saved`
- `obligation_payment_recorded`
- `report_period_changed`
- `report_email_scheduled`
- `assistant_question_sent`
- `assistant_action_confirmed`

No sensitive financial amount should be included in analytics payloads.

## 14. Error Handling

Every feature must map technical errors to user actions.

Examples:

- Try again.
- Save locally.
- Open settings.
- Review manually.
- Contact support.
- Continue without feature.

Do not show raw stack traces or provider errors.

## 15. Definition of Done

A spec is complete only when:

- Screens are implemented.
- RTL and LTR are verified.
- Light and dark modes are verified.
- Loading, empty, error, offline, and permission states exist.
- Mock services are typed.
- Forms are validated.
- Accessibility labels exist.
- Tests pass.
- No production secret exists.
- No camera feature was introduced.
- No unsupported iOS SMS claim exists.
- Automatic actions expose undo or correction.
- Design tokens are used.
- Visual QA is complete.

## 16. Recommended Execution Order

1. SPEC-001.
2. SPEC-002.
3. SPEC-003.
4. SPEC-004.
5. SPEC-005.
6. SPEC-006.
7. SPEC-007.
8. SPEC-008.
9. SPEC-009.
10. SPEC-010 final hardening.

## 17. Final Frontend Acceptance

The complete frontend must demonstrate this end-to-end product story:

```text
User signs in
→ Android user enables SMS tracking or iOS user selects an alternative path
→ Financial activity is added automatically, by voice, or manually
→ Accounts and transactions update
→ Budgets and reports update
→ Obligation payments update debt or installment progress
→ The user receives a phone and in-app notification
→ The smart assistant can explain the updated financial position
→ The user can correct, undo, or review any uncertain result
```

---

# Final Product Statement

Masarifi Mobile is an automatic-first personal finance application for Arabic-speaking users.

Its frontend must make financial management feel effortless, trustworthy, and understandable.

The experience succeeds when users do not need to remember every transaction manually, can see exactly where their money goes, can follow debts and installments until completion, can receive useful reports automatically, and can ask a smart assistant practical questions about their own financial behavior.

The mobile application must preserve the Masarifi Gulf Premium identity while delivering a native, calm, accessible, and high-quality experience on both Android and iOS.
