# Mobile Notifications and Automatic Tracking Design

**Date:** 2026-09-15
**Status:** Approved

## Objective

Complete Masarifi Mobile's notification and automatic transaction-tracking flows while preserving the existing UI, backend preference matrix, transaction ingestion pipeline, and duplicate-review safeguards.

The product boundary is strict:

- Push notifications are messages from Masarifi to the user and use the normal OS notification permission.
- Automatic tracking reads supported financial messages on Android and uses independent source permissions.

## Existing Architecture to Keep

- `expo-notifications` owns push permission, local presentation, response routing, Expo token creation, and notification categories.
- The engagement API owns push device registration, notification preferences, generation, filtering, and provider delivery.
- `/notifications/preferences` remains the notification-preferences destination.
- `/tracking` remains the automatic-tracking destination.
- The tracking API owns parser definitions, confidence/review decisions, idempotency, duplicate candidates, and ledger-safe transaction creation.
- Android SMS inbox access remains an optional tracking source pending Google Play approval.
- iOS continues to support push notifications and existing manual/platform-assisted ingestion only. It will not expose Android-only controls.

## Push Notification Flow

Create one shared OS-backed permission query used by Home and Notification Settings. It reads `expo-notifications` directly and refreshes whenever the app becomes active.

The Home card is explanatory UI. Its CTA behaves as follows:

- `not_requested` or askable `denied`: request the native notification permission, then register the push device if granted.
- `permanently_denied`: open application notification settings.
- `granted`: do not render the card.
- `unavailable`: do not pretend activation succeeded.

The Home CTA will not navigate to Notification Preferences.

The Phone Notifications row reflects only the OS permission. Interacting with a disabled state starts the explained request or settings-recovery flow. It cannot visually enable itself while the OS remains disabled.

## Notification Preferences

The existing backend preference matrix remains authoritative for notification categories and quiet hours. The mobile event-to-category mapping will cover every seeded backend event type so loading or saving preferences cannot fail on valid server data.

Saving a category updates every matching push event preference. The existing engagement worker continues enforcing exact event/channel preferences before delivery.

Controls without a live end-to-end effect will not be exposed:

- Daily and weekly summary controls are removed until a summary scheduler consumes them.
- The lock-screen amount toggle is removed because live remote notifications always use the backend's safe body and the toggle cannot currently alter provider payloads.

The safe-body invariant remains: remote push payloads do not expose raw financial message content.

## Android Automatic Tracking Sources

Automatic tracking presents two independent sources:

1. **Bank notifications** — Android Notification Access.
2. **Financial SMS** — the existing `READ_SMS` adapter, when enabled and distribution policy permits it.

Enabling one source is sufficient. Push permission is never consulted by tracking.

### Bank Notification Access

Extend the existing local Expo module with:

- a manifest-declared `NotificationListenerService` protected by `BIND_NOTIFICATION_LISTENER_SERVICE`;
- an actual Notification Access status check;
- an intent to Android's Notification Access settings;
- a bounded app-private queue of posted notification keys, package names, titles, text, and timestamps;
- read and acknowledgement methods for JavaScript.

The queue is capped and old entries expire. Android backup remains disabled. Raw notification content is acknowledged and deleted after it is safely converted into the existing normalized offline import queue. No notification content is sent anywhere unless it passes financial-message detection.

### SMS

Keep the existing inbox-only `READ_SMS` flow. Do not add `RECEIVE_SMS` or background SMS receivers. SMS permission and status are displayed separately from Notification Access.

Google Play publication remains blocked until the SMS-based money-management Permissions Declaration is approved. If approval is not obtained, the release manifest must omit `READ_SMS`; Bank Notification Access remains usable.

## Financial Message Processing

Generalize the existing client financial-message parser so SMS and bank notifications share one implementation. Detection requires:

- a valid positive amount;
- a supported currency;
- at least one transaction-pattern signal; and
- source evidence from an enabled sender rule, trusted package, or structured financial wording.

OTP and marketing patterns remain hard rejection signals. A lone keyword never creates a transaction.

Where present, parsing records:

- amount and currency;
- transaction kind;
- merchant;
- account/card last-four hint;
- occurrence time;
- source channel and application/package;
- explicit payment rail such as Apple Pay, mada, or POS.

Apple Pay, mada, Visa, and Mastercard are metadata extracted from bank messages, never direct integrations.

## Ingestion and Duplicate Safety

Notification events use the existing `provider` source type with `android_notification` as the source channel. SMS continues using `sms` and `android_sms`.

Both sources enter the existing import endpoint and tracking worker. They retain:

- deterministic source fingerprints;
- request idempotency;
- parser-rule application;
- confidence thresholds;
- review routing;
- duplicate-candidate computation before ledger writes;
- ledger-service transaction creation.

No new direct financial write path is introduced. A matching SMS and bank notification reaches the existing duplicate-review path rather than creating two automatic ledger entries.

## Home, Settings, and Onboarding

- Home keeps separate Push Notifications and Automatic Tracking cards in the approved card rail.
- The Push card disappears when OS permission is granted.
- The Tracking card disappears or uses the existing enabled state when at least one real Android source is active.
- Settings keeps separate Notifications and Automatic Tracking entries.
- Mandatory onboarding does not request Notification Access or SMS access. Sensitive tracking activation starts from its contextual Home or Tracking action after an explicit explanation.
- Existing Arabic RTL, English LTR, accessibility labels, spacing, typography, colors, and navigation patterns are preserved.

## State and Recovery

- Push state comes from `expo-notifications`.
- Notification preferences come from the backend preference matrix.
- Notification Access comes from Android's enabled listener services.
- SMS permission comes from Android runtime permission state.
- Tracking mode comes from the tracking backend.

Home and relevant settings screens refresh system state on foreground activation. Denied flows never repeatedly open native prompts without user action.

## Verification

Focused automated coverage will include:

- push permission states, direct Home activation, settings recovery, foreground refresh, and token registration;
- complete event-category mapping and backend preference writes;
- removal of ineffective preference controls;
- independent Notification Access and SMS statuses;
- notification listener queue validation, bounds, expiry, and acknowledgement;
- purchase, mada, Apple Pay, POS, transfer, withdrawal, salary, refund, OTP, and advertisement parsing;
- cross-source duplicate routing and preservation of ledger safety;
- Android-only UI and iOS unsupported behavior.

Verification commands include mobile typecheck, lint, focused and full Jest suites, API typecheck/lint/tracking and engagement tests, migration tests where available, Android native compilation, Expo configuration inspection, and connected-device permission/settings flows.

## Known External Gate

`READ_SMS` is a restricted Google Play permission. The implementation may remain in source because SMS-based money management is an eligible declared use, but production distribution requires an approved Permissions Declaration. Code verification cannot grant that approval.
