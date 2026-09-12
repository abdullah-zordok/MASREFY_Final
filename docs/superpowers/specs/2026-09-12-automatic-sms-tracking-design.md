# Automatic Android SMS Tracking Design

**Date:** 2026-09-12
**Status:** Approved in chat
**Scope:** `apps/mobile` Android live-mode tracking only

## Goal

Make automatic tracking functional in the Expo Android dev client: after explicit education and consent, Masarifi reads a bounded set of recent SMS messages when the authenticated app starts or resumes, filters and minimizes them locally, submits idempotent imports to the existing live tracking API, and renders the resulting backend state. Demo and test modes retain fixtures. iOS and web remain explicitly unavailable.

## Constraints

- Reuse the existing tracking API, Clerk authentication, domain types, query keys, routes, design system, and localization conventions.
- Do not change financial balance logic or unrelated screens.
- Request only `android.permission.READ_SMS`; do not add background delivery or `RECEIVE_SMS`.
- Never upload, persist, or log an unfiltered inbox or raw SMS body.
- Keep backend-owned idempotency, duplicate decisions, reviews, and ledger writes authoritative.
- Do not claim Play Store approval or policy compliance from code changes.

## Architecture

### Service selection

Add one public automatic-tracking service selector beside the other mobile service selectors. It returns the existing mock provider only when the existing client-mode policy enables fixtures (`demo` or `test`); live mode returns `createLiveAutomaticTrackingService()` with the registered Clerk token provider. All tracking screens, hooks, feedback actions, history, rules, reviews, and duplicate decisions import this selector instead of the mock directly.

The live provider is extended with strict import-session operations on the existing `/api/v1/imports` endpoints. No second API client or backend endpoint is introduced. Import request and response mapping rejects malformed data instead of synthesizing success.

### Android bridge

Create one autolinked local Expo module under `apps/mobile/modules`. It exposes:

- a bounded `readRecentSms({ since, limit })` query returning only the Android row identity, sender, received time, and body needed for in-memory local classification;
- a network-availability check backed by Android `ConnectivityManager` so queued imports are retried only after connectivity returns.

The module does not log message data and returns no rows without `READ_SMS`. The initial scan is capped at 100 messages from the previous 72 hours. Later scans continue from the persisted cursor with a small overlap; stable fingerprints remove overlap duplicates.

Because the module is a local Expo module and the permission is declared in `app.json`, Expo autolinking and prebuild regenerate the native wiring. `MainApplication.kt` does not receive manual package registration.

### Permission and consent

Restore the Android-specific permission adapter using `PermissionsAndroid` and the existing persisted permission history. It maps:

- granted permission to `granted`;
- first use to `not_requested`;
- a normal rejection to `denied`;
- `never_ask_again` to `permanently_denied`;
- a previously granted permission that is later missing to `revoked`;
- non-Android platforms to `unavailable`.

`openSettings()` uses the platform settings link. The tracking screen never calls the system request directly. Enabling first opens a tracking permission route that reuses the existing localized education content; only its explicit accept action requests permission. A grant enables the chosen backend preference and starts a scan. Rejection returns to tracking with an Arabic recovery message. Blocked or revoked states expose Open Settings. iOS and web show localized unavailable copy without an enabled control.

### Local classification and minimization

The TypeScript ingestion pipeline receives bridge rows in memory and applies these steps in order:

1. NFKC-normalize sender and body, normalize whitespace and Arabic/Latin digits, and reject invalid timestamps or empty values.
2. Reject OTP/authentication and marketing-only patterns before positive matching.
3. Accept only a message that matches an enabled sender rule, an enabled keyword rule, or a conservative built-in financial pattern containing a transaction verb plus an amount/currency signal.
4. Parse amount into integer minor units, normalize supported currency aliases, and infer a supported transaction kind only when unambiguous.
5. Produce a SHA-256 fingerprint from normalized sender, received time, and normalized text. Use it as the backend `sourceItemKey` and local deduplication identity.
6. Omit body when extracted structured fields satisfy the backend contract. Otherwise include only NFKC-normalized text with OTPs, account/card identifiers, URLs, phone numbers, and long digit sequences redacted.

Only the minimized normalized event survives the scan. Raw bridge rows are not written to storage or logs.

### Queue, retries, and idempotency

Persist a small AsyncStorage queue containing only normalized import payloads, their stable idempotency keys, creation time, attempt state, and safe error code. The idempotency key is derived once from the stable source fingerprint and reused for every retry. The queue also stores the scan cursor, a bounded recent-fingerprint set, and the last safe rule snapshot; it never stores raw inbox content.

On authenticated live startup/resume and immediately after permission grant, the coordinator:

1. reads permission and backend preference;
2. refreshes sender and keyword rules when online, otherwise uses the last safe snapshot;
3. persists filtered events before advancing the scan cursor;
4. if Android reports connectivity, submits pending records using their original idempotency keys;
5. refreshes import, tracking, review, duplicate, history, transaction, and home scopes from real backend results.

Failed network attempts stay queued with Arabic retry copy. Contract/auth/validation failures stop automatic retries and surface a safe error. A replayed idempotency key cannot create another import, and the backend remains responsible for ledger-level duplicate prevention.

### UI and states

The tracking status screen combines the real platform permission with the real backend status and the local coordinator state. It supports automatic-clear, review-all, and paused preference actions; processing, imported, review-needed, duplicate, queued/offline, and safe error feedback; and direct navigation to the existing review and duplicate routes using backend IDs.

Keyword and sender screens continue using their existing UI but call the selected provider. Demo notices render only in explicit demo mode. Arabic copy is right-aligned with RTL direction; mixed amounts and currency codes use the existing financial formatting components rather than string concatenation.

## Testing and Verification

Use test-driven development for new behavior:

- permission-state mapping, education gate, denial, blocked/settings, and non-Android unavailable behavior;
- local positive/negative filtering, redaction, amount/currency extraction, stable fingerprinting, overlap deduplication, queue persistence, and idempotent retry;
- strict live import request/response mapping and provider selection;
- tracking UI states for unavailable, denied, granted, processing, completed, review, duplicate, queued/offline, and error;
- native configuration checks proving `READ_SMS` is present, `RECEIVE_SMS` is absent, and the local module survives Expo prebuild.

Before completion, run focused Jest tests, the mobile TypeScript check, lint, Expo public-config/prebuild verification, and an Android Gradle/dev-client build. If a connected physical device and reachable configured backend are available, reinstall the dev client, exercise permission with a controlled financial SMS fixture, confirm the import reaches the backend, and confirm the final backend result appears in the UI. Report code verification, physical-device verification, backend readiness, and release-policy gates separately; unavailable external verification remains explicitly unverified.

## Release Requirements Outside Code

Production release still requires an accepted Google Play SMS permission declaration/use-case review, an accurate privacy policy and Data Safety disclosure, localized consent copy reviewed by product/legal, retention documentation, and validation against the actual release signing/distribution path. This implementation does not imply that Google Play will approve `READ_SMS`.

## Deliberate Non-goals

- No terminated-app or background SMS receiver.
- No `RECEIVE_SMS`, default-SMS-handler role, notification interception, or iOS SMS access.
- No new tracking backend, parser service, ledger write path, analytics payload containing message text, or speculative rule engine.
