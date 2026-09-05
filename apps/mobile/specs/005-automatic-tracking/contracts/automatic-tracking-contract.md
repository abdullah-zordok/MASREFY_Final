# Contract: Automatic Transaction Capture and Platform-Specific Tracking

This contract defines user-visible route behavior and typed boundaries between SPEC-005 screens,
mock services, platform permission handling, tracking storage, and the existing finance ledger.
It does not define a production SMS parser, background reader, bank connection, notification
provider, AI service, or iOS SMS access.

## 1. Route Contract

| Route | Platform | Responsibility |
|---|---|---|
| `/tracking` | Android | Status, counts, latest activity, mode, recovery, and primary actions |
| `/tracking/history` | Android | Paged tracking-only history and clear-history action |
| `/tracking/keywords` | Android | Existing Arabic/English keyword packs, search, use counts, and controls |
| `/tracking/senders` | Android | Recognized/custom sender search, labels, association, trust, and state |
| `/tracking/demo` | Android | Deterministic event scenarios and resulting feedback |
| `/tracking/review` | Android | Paged pending review queue |
| `/tracking/review/[id]` | Android | Reasons, source preview, extracted values, edits, links, and resolution |
| `/tracking/duplicates/[id]` | Android | Side-by-side candidates and explicit duplicate resolution |
| `/(onboarding)/ios-capture-options` | iOS | Manual and voice-first alternatives without SMS claims |
| `/(onboarding)/ios-automation` | iOS | Optional supported platform-assisted setup |

An Android-only route opened on iOS or an unsupported platform redirects to the platform capture
options or manual Add route without rendering SMS content. Home and More expose tracking status
only when platform capabilities permit it.

## 2. Service Boundary

The implementation provides a replaceable contract equivalent to:

```ts
interface AutomaticTrackingService {
  getStatus(): Promise<TrackingStatusSnapshot>;
  setMode(mode: TrackingMode): Promise<TrackingStatusSnapshot>;
  refreshStatus(): Promise<TrackingStatusSnapshot>;
  clearHistory(): Promise<TrackingMutationResult>;
  purgeExpiredSourceText(now?: number): Promise<number>;

  processMockEvent(input: MockFinancialEventInput): Promise<TrackingDecisionResult>;
  listHistory(query: TrackingHistoryQuery): Promise<TrackingHistoryPage>;
  getDetectedEvent(id: string): Promise<DetectedFinancialEvent>;

  listReviewItems(query: ReviewQuery): Promise<ReviewPage>;
  getReviewItem(id: string): Promise<ReviewDetail>;
  resolveReview(id: string, input: ReviewResolutionInput): Promise<TrackingMutationResult>;

  getDuplicate(id: string): Promise<DuplicateComparison>;
  resolveDuplicate(id: string, resolution: DuplicateResolution): Promise<TrackingMutationResult>;

  listKeywordRules(query?: RuleQuery): Promise<KeywordRuleSummary[]>;
  saveKeywordRules(rules: KeywordRuleInput[]): Promise<TrackingMutationResult>;
  restoreDefaultKeywords(): Promise<TrackingMutationResult>;

  listSenderRules(query?: SenderQuery): Promise<SenderRule[]>;
  saveSenderRule(input: SenderRuleInput): Promise<TrackingMutationResult>;
  removeCustomSender(id: string): Promise<TrackingMutationResult>;

  undoAutomaticAddition(feedbackId: string): Promise<TrackingMutationResult>;
  reportWrongDetection(eventId: string): Promise<TrackingMutationResult>;
}
```

Routes and feature components never access SQLite, AsyncStorage, or platform permission APIs
directly. The existing `TrackingPermissionService` remains the only permission boundary.

## 3. Decision Contract

Evaluation order is deterministic:

1. Reject failed, authentication-code, marketing, unresolved amount-conflict, and invalid event
   inputs before confidence is considered.
2. Detect an existing source fingerprint and return the prior result without another mutation.
3. Route duplicate, conflicting rule, ambiguous account, ambiguous lifecycle, or multiple
   obligation matches to review.
4. In paused mode, retain an ignored history result and make no financial change.
5. In review-all mode, route every otherwise eligible event to review.
6. In automatic-clear mode, auto-add eligible events at 90% or higher, review 60% through 89%,
   and ignore below 60%.

Every result includes stable reason codes suitable for localized explanation. Numeric confidence
is supporting information and never replaces the reason text.

## 4. Financial Mutation Contract

- Detection state and resulting finance transaction commit atomically in the existing SQLite
  database or neither persists.
- Automatic creation reuses existing account, category, money, transaction, and query-scope
  contracts; it does not maintain a second balance or transaction list.
- Repeated processing by source fingerprint is idempotent.
- A review-required event makes no account, transaction, budget, report, or obligation change.
- A clear obligation match applies its transaction and mock obligation projection together;
  multiple matches require review.
- A later completion, reversal, refund, or failure links to or updates the original pending event
  when clear; uncertain relationships require review.
- Mutations return affected query scopes. Only affected tracking, Home, ledger, account, category,
  and obligation projections are invalidated.
- Raw database, parser, platform, or provider errors never reach the user.

## 5. Review Contract

- Review detail exposes extracted values, missing fields, reason text, privacy-permitted source
  preview, candidate account/category/obligation links, and duplicate comparison when applicable.
- Confirm validates the exact final financial values before the atomic mutation.
- Edit changes only fields the user confirms and preserves valid values after an error.
- Ignore and report-wrong create no financial record.
- Dismissal leaves the item pending.
- A failed resolution returns to a retryable state without partial financial effects.
- Offline review may remain readable; a mutation that cannot commit stays pending or fails with an
  actionable retry and does not claim success.

## 6. Duplicate Contract

- Comparison shows amount, currency, time, merchant, account, source, and match reasons for both
  candidates.
- `keep_existing` resolves the candidate without another transaction.
- `keep_new` records the candidate and marks the previous relationship as deliberately rejected.
- `keep_both` records the candidate as a separate transaction after explicit confirmation.
- `merge_details` keeps the existing transaction identity, adds only confirmed missing merchant,
  category, account hint, reference, or source metadata, and resolves the candidate.
- Merge cannot overwrite amount, currency, occurred time, or account without a separate edit
  confirmation.

## 7. Undo and Feedback Contract

1. A successful automatic addition creates in-app feedback and a mock phone-notification result.
2. Feedback states the amount, merchant or purpose, and category when known and privacy permits.
3. View and Edit remain available; Undo is available for exactly 30 seconds.
4. Undo reverses the automatic transaction and related projection effects atomically.
5. App backgrounding or restart does not extend the persisted deadline.
6. After expiry, correction and detail remain available and Undo returns a safe expired result.

## 8. Keyword and Sender Contract

- Existing keyword groups and Arabic/English packs remain authoritative.
- Normalized `(language, value)` duplicates are rejected across matching case and whitespace.
- Disabling the final enabled keyword in a group requires a deliberate warning confirmation.
- Restoring defaults does not delete unrelated custom keywords.
- Use counts derive from tracking events rather than independent counters.
- Sender normalization prevents duplicate custom identities.
- Recognized senders may be disabled or relabeled but not deleted; custom senders may be removed.
- Trusted sender state contributes to confidence but cannot bypass any safety gate.

## 9. Permission and Service-State Contract

- Permission is requested only on Android after the existing education step.
- Not requested, granted, denied, permanently denied, revoked, and unavailable map through the
  existing permission service to request, retry, settings, or continue actions.
- Service state separately represents healthy, interrupted, battery restricted, offline, and
  unavailable conditions.
- Pausing stops future automatic processing without deleting transactions or history.
- Permission denial, service failure, battery restriction, and offline state always preserve
  manual transaction entry.

## 10. Platform Contract

- Android may expose tracking status, permission recovery, keywords, senders, automatic mock
  detections, review, duplicate resolution, and background-service mock state.
- iOS and conservative paths never expose or imply SMS inbox access, SMS permission, Android
  background tracking, keyword rules, or sender rules.
- iOS always exposes manual and voice capture. Shortcuts, App Intents, Share Extension, quick
  actions, and widget setup appear only when the platform adapter reports support.
- Direct links cannot bypass platform capability restrictions.

## 11. Storage and Privacy Contract

- Full source text remains inside the app-private database and is never copied into history,
  logs, analytics, errors, notifications, or accessibility labels while masked.
- Source text receives an expiry no later than 30 days after detection and cleanup runs during
  tracking hydration and explicit maintenance.
- Clear history requires confirmation, removes tracking history and full source text, and
  preserves posted finance transactions.
- Existing global hide-balances and protected-preview behavior apply to status, review,
  duplicate, feedback, and transaction detail.
- Fingerprints, extracted fields, source type, and non-sensitive reason codes may remain after
  source-text purge to preserve idempotency and correction history.

## 12. Query Ownership and Errors

TanStack Query owns `tracking.status`, `tracking.history(query)`, `tracking.review(query)`,
`tracking.review.detail(id)`, `tracking.duplicate(id)`, `tracking.keywords(query)`, and
`tracking.senders(query)`. Zustand may hold only unsaved filters or selection. Financial and
tracking records are never mirrored there.

Safe error codes cover not found, invalid input, permission required, permanently denied, paused,
service interrupted, battery restricted, offline, duplicate, review required, expired undo,
conflict, and unknown failure. Each maps to one actionable localized recovery.

## 13. Localization and Accessibility Contract

- Every visible and accessible string exists in Arabic and English catalogs.
- Financial numbers use English numerals with locale-aware formatting; sender, institution,
  reference, amount, and currency use intentional mixed-direction handling.
- Rows announce event meaning, amount, time, source, status, and required action as one coherent
  accessible summary.
- Confidence, status, and review meaning never rely on color, icon, motion, or haptic feedback.
- Controls expose name, role, state, error, and action and measure at least 44 by 44.
- Critical routes remain usable at 200% text, with reduced motion, open keyboard, grayscale,
  screen readers, and 320 by 568 logical pixels.

## 14. Per-Account Eligibility Contract

Before persisting a detection effect, resolve its `accountId` and require the
global preference plus `accountAllowsAutomaticTracking(account)`. Supported
types are bank, debit card, credit card, wallet, and savings. Every missing,
inactive, unsupported, or opted-out account maps to `account_blocked`; callers
must not infer whether a foreign account exists. The Mobile switch is UX only,
never the server security boundary.
