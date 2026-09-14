# Masarifi User Reminder System Design

## Goal

Implement three reminder scenarios through Masarifi's existing Mobile notification abstraction and backend engagement pipeline:

1. Two device-local reminders for a user who starts onboarding but does not authenticate.
2. Push reminders at approximately three and seven days of registered-user app inactivity.
3. One push reminder after seven days without successful financial activity for a recently active user whose automatic tracking is enabled.

The implementation must not introduce another notification provider, bypass existing notification preferences, expose financial data on the lock screen, or alter automatic-transaction notification behavior.

## Existing Architecture Reused

- Clerk remains the authoritative authentication and session source.
- `AppShellProvider` remains the single Mobile foreground/session lifecycle boundary.
- `phoneNotificationService` remains the Expo-backed local-notification, permission, and response abstraction.
- `profiles.last_seen_at` remains the user-level authoritative app-activity timestamp. The existing database update is already throttled to once per 15 minutes.
- `user_devices` and `push_tokens` remain the device-registration and provider-token stores.
- The governed Operations scheduler remains the only backend scheduler.
- `EngagementWorker`, `notification_templates`, `notification_preferences`, `notification_events`, and `private.notification_deliveries` remain the rendering, preference, history, queue, retry, and provider pipeline.
- `transactions.created_at` is the successful financial-recording signal. `occurred_at` is not used as the reset timestamp because imports may legitimately be backdated.

## Considered Approaches

### Selected: existing notification events as persisted reminder state

The daily engagement job produces deterministic source UUIDs from the user ID, reminder type, threshold, and authoritative cycle baseline. The existing unique constraint on `notification_events.source_event_id` makes duplicate scheduler executions, retries, and worker restarts idempotent. Delivery still uses `private.notification_deliveries` and existing providers.

This is the smallest complete design because no reminder-specific state table is required.

### Rejected: dedicated reminder-cycle table

A dedicated table would make state explicit but would duplicate state already represented by the authoritative activity baseline and notification history. It adds migrations, lifecycle cleanup, and transactional synchronization without improving the required behavior.

### Rejected: notification campaigns

Campaigns are designed for administrator-selected audiences and campaign-wide schedules. Per-user inactivity baselines, cycle resets, and delivery-time revalidation do not fit that model.

## Scenario A: Pre-Signup Local Reminders

### Trigger and permission

The first public onboarding visit records one local `startedAt` timestamp. The app presents notification education and may request notification permission once. The permission request is never repeated automatically after denial or permanent denial.

If permission is granted, the app schedules exactly two Expo local notifications relative to the original `startedAt`:

- Reminder 1 at `startedAt + 24 hours`.
- Reminder 2 at `startedAt + 72 hours`.

Reopening onboarding reads the persisted state and does not create duplicate schedules. If either target time has already passed before permission is granted, that expired reminder is not scheduled.

### Local state

Secure local storage contains only:

- `startedAt`.
- Whether the one-time permission decision was attempted.
- The Expo schedule identifiers currently pending.
- A terminal `authenticated` marker preventing reminders from being recreated after sign-out or account switching.

No unauthenticated backend profile or pseudo-user is created.

### Authentication cancellation

When Clerk first reports an authenticated session, `AppShellProvider` cancels every stored pre-signup schedule before marking the local reminder state authenticated. Repeated cancellation is safe. Authentication restoration after a process restart runs the same cancellation boundary.

### Copy and tap destination

Arabic:

- 24h: `كمّل إعداد مصاريفي 👋` / `سجّل حسابك وخلي مصاريفك تتسجل وتترتب تلقائيًا.`
- 72h: `مصاريفي جاهز لك` / `كمّل تسجيلك وابدأ تتابع صرفك بشكل أسهل.`

English:

- 24h: `Finish setting up Masarifi 👋` / `Create your account and let Masarifi organize your spending automatically.`
- 72h: `Masarifi is ready for you` / `Finish signing up and start keeping track of your spending with less effort.`

The Expo payload carries a typed local destination rather than a fake backend notification ID. The existing notification response controller routes that destination to the existing public welcome/authentication entry.

## Scenario B: Registered-User Inactivity

### Authoritative foreground activity

On initial authenticated restoration and every transition to foreground, `AppShellProvider` invokes a lightweight live identity activity touch. The call reads the existing `GET /api/v1/me` boundary without fetching unrelated preferences. The repository keeps the existing 15-minute conditional update, so repeated foreground events do not create excessive database writes. Failed touches are safe to retry and never block app startup or financial synchronization.

Activity is user-level, so activity from any authenticated device refreshes the same `profiles.last_seen_at`. `user_devices.last_seen_at` is not used to decide account inactivity.

### Daily eligibility job

A new governed engagement job runs once every 86,400 seconds and processes a bounded batch ordered by `profiles.last_seen_at` and user ID. A profile is eligible only when:

- its status is `active`;
- an unrevoked push token exists;
- the corresponding push preference is enabled;
- its authoritative `last_seen_at` is at least three days old.

The due stage is selected once per execution:

- At least three but fewer than seven days inactive: `reminder.app_inactive.3d`.
- At least seven days inactive: `reminder.app_inactive.7d`.

At seven days, only the seven-day stage is produced if the earlier job window was missed; the worker never emits both reminders together. No stage exists after seven days.

The inactivity-cycle baseline is the exact `last_seen_at` observed by the evaluator. The deterministic source UUID includes that baseline and the due stage. Opening the app changes `last_seen_at`, completing the old cycle and allowing a future cycle to create new deterministic IDs.

### Copy and tap destination

Arabic:

- 3d: `وين وصلت مصاريفك؟ 👀` / `صار لك فترة ما راجعت صرفك، افتح مصاريفي وخذ نظرة سريعة.`
- 7d: `شيّك على صرفك` / `افتح مصاريفي وراجع آخر تحديثاتك المالية.`

English:

- 3d: `How is your spending going? 👀` / `It has been a little while since you checked in. Open Masarifi for a quick look.`
- 7d: `Check in on your spending` / `Open Masarifi and review your latest financial updates.`

The notification resolves through the existing notification-detail endpoint to a typed Home target and opens the existing `/(tabs)/home` route.

## Scenario C: Registered-User Financial-Activity Reminder

### Eligibility

The daily engagement job evaluates financial inactivity independently from app inactivity. A user is eligible only when:

- the profile is active;
- `profiles.last_seen_at` is within the previous three days;
- `tracking_preferences.enabled` is true;
- an unrevoked push token exists;
- the corresponding push preference is enabled;
- no non-deleted transaction has been created in the previous seven days.

The financial-cycle baseline is the latest non-deleted `transactions.created_at`. If the user has no transactions, `profiles.created_at` is the baseline. A deterministic source UUID includes this baseline, producing exactly one reminder for that financial inactivity cycle. A newly created successful transaction changes the baseline and resets future eligibility. Merely reopening the app does not reset financial inactivity.

### Copy and tap destination

Arabic:

- `صار لك فترة بدون عمليات` / `افتح مصاريفي وتأكد إن تتبع مصاريفك شغال تمام.`

English:

- `It has been a while since your last transaction` / `Open Masarifi for a quick check that expense tracking is set up the way you want.`

The copy remains neutral and includes no balance, amount, merchant, account number, or financial summary. The notification resolves to a typed Tracking target and opens the existing `/tracking` route.

## Notification Creation and Deduplication

The evaluator returns synthetic source claims compatible with the existing engagement ingestion method. Each claim contains:

- deterministic `source_event_id`;
- user ID and locale;
- reminder event type;
- authoritative cycle baseline in safe metadata;
- the existing Home or Tracking target.

`EngagementWorker` loads the existing published templates and event-specific preference rows, renders the localized content, inserts one `notification_events` row, and queues existing in-app and push deliveries. The unique source-event constraint is the final concurrency guard. It prevents duplicates across repeated evaluation, concurrent workers, restarts, and retry.

There is one logical notification per user and reminder stage. Existing delivery rules continue to select an eligible registered device and do not duplicate the logical reminder for multiple devices.

## Stale Delivery Revalidation

Before a reminder push is handed to Expo, FCM, or APNs, the engagement repository revalidates the specific cycle:

- App inactivity is stale when `profiles.last_seen_at` is newer than the baseline captured by the reminder.
- Financial inactivity is stale when tracking is disabled or a non-deleted transaction has a `created_at` newer than the captured baseline.
- Either reminder is suppressed when its push preference has since been disabled.

Stale deliveries use the existing `suppressed` terminal status and do not fabricate success. Missing or revoked tokens continue through the existing `TOKEN_UNAVAILABLE` or `TOKEN_INVALID` handling. Provider outages retain the existing retry and circuit-breaker behavior.

## Preferences and Backward Compatibility

The backend adds three event groups without creating a new preference system:

- Existing transaction event types map to `transaction` and remain the Automatic transaction alerts setting.
- `reminder.app_inactive.3d` and `reminder.app_inactive.7d` map to a new `app_inactivity` Mobile category.
- `reminder.financial_inactive.7d` maps to a new `financial_activity` Mobile category.

The notification settings screen displays natural Arabic and English labels for these categories. Saving either reminder category updates the corresponding existing backend event-type preference rows. Existing locally stored preference documents are normalized by adding enabled defaults for the two new reminder categories, preserving all prior values and versions.

The migration publishes Arabic and English in-app and push templates and seeds preference rows for existing profiles. The existing profile-insert trigger automatically seeds them for future users. No reminder email templates are created.

## Authenticated Push Registration

Pre-signup permission grant occurs before an authenticated device can be registered. After authentication, the app therefore invokes the existing Expo token and identity device-registration path once for the Clerk session when permission is already granted. The deterministic registration idempotency key is retained. Foreground activity does not repeatedly request permission or repeatedly register an unchanged token.

## Database and Query Constraints

- Candidate queries are bounded by the existing notification batch-size configuration.
- Eligibility queries use server timestamps and UTC interval comparisons.
- New partial indexes cover active-profile inactivity scanning, recent transaction lookup by user and creation time, and enabled tracking eligibility only where existing indexes do not already cover the predicate.
- User-supplied or device-clock timestamps never determine backend eligibility.
- The worker never calls a notification provider directly from reminder evaluation.

## Testing Strategy

Implementation follows strict red-green-refactor cycles.

Mobile focused tests cover:

- two schedules at 24h and 72h;
- no third reminder;
- duplicate onboarding visits;
- one-time permission denial;
- immediate cancellation after authentication and restored sessions;
- typed local tap routing to authentication;
- authenticated foreground activity touches with throttled server behavior;
- post-auth registration after a pre-auth permission grant;
- backward-compatible local preference normalization;
- existing automatic-transaction notification response behavior.

API and database focused tests cover:

- active users are ineligible;
- 3d and 7d stage selection;
- deterministic duplicate suppression and concurrent worker execution;
- cycle reset after a foreground touch;
- a later independent inactivity cycle;
- no-token and disabled-preference suppression;
- one logical reminder with multiple devices;
- financial eligibility based on successful transaction creation;
- recent transaction and tracking-disabled suppression;
- generic privacy-safe templates;
- Arabic/English rendering and valid Home/Tracking targets;
- delivery-time stale-cycle suppression;
- provider outage isolation;
- unchanged automatic-transaction event behavior.

Validation includes focused Mobile notification, Clerk/auth/onboarding, lifecycle, API engagement, worker, identity, security, contract, migration, typecheck, lint, and `git diff --check` commands. Database-gated tests are reported as skipped unless a real test database executes them.

## Staging Gates

Repository completion does not prove live delivery. Staging verification requires:

- Expo access token and Android FCM credentials, plus APNs credentials for iOS testing;
- live engagement provider mode on the worker;
- real push-token encryption and hash keys;
- physical development or release builds, not Expo Go;
- a staging database with the migration and governed daily job;
- controlled staging users and timestamps only.

The final report must distinguish repository tests from a real physical-device push receipt. No fake provider may be described as live delivery.

## Intentionally Unsupported

- Pre-signup reminders do not synchronize across devices because no authenticated identity exists.
- No reminders are scheduled when the one-time permission request is denied, and the app does not retry automatically.
- Registered reminder emails are not sent; the requested channel is push, with an in-app event retained for history and tap resolution.
- The financial reminder fires once per authoritative financial inactivity cycle rather than weekly forever. A successful transaction starts a new future cycle.
