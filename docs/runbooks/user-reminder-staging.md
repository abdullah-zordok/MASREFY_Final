# User Reminder Staging Verification

Run these checks only against staging users and staging data. Never change production profile timestamps or transaction history to force eligibility.

## Android prerequisites

- Use a physical Android device with a development or release build; Expo Go cannot prove remote push delivery.
- Configure the staging API URL, Clerk authentication, notification worker, and a live Expo/FCM credential.
- Set the engagement provider mode to the live provider. Deterministic-provider success is not proof that a device received a push.

## A. Pre-signup reminders

1. Install with fresh app storage and open onboarding.
2. Tap **Start now**, accept the education prompt, and grant Android notification permission.
3. Inspect scheduled notifications and confirm exactly two entries near 24 and 72 hours from the first attempt.
4. Reopen onboarding and confirm no additional schedules are created.
5. Authenticate, then confirm both scheduled entries are cancelled.
6. Tap a pre-signup reminder before authentication and confirm it opens the public welcome/auth entry.

## B. Registered app inactivity

1. Use a staging profile with an active push token and enabled `reminder.app_inactive.*` push preferences.
2. Set its staging-only `last_seen_at` to a controlled 3-day or 7-day baseline.
3. Run `notification.reminders.evaluate`, then `notification.dispatch`.
4. Confirm one push arrives and opens Home.
5. Foreground the app and confirm `/api/v1/me` refreshes the activity baseline.
6. Re-run evaluation and confirm the old cycle is not duplicated; a later genuine inactivity cycle uses the new baseline.

## C. Registered financial inactivity

1. Use a recently active staging profile with tracking enabled, a live push token, enabled `reminder.financial_inactive.7d` preference, and a controlled transaction baseline older than seven days.
2. Run evaluation and dispatch once; confirm one push arrives and opens Tracking.
3. Queue another eligible reminder, create a successful transaction before dispatch, then run dispatch.
4. Confirm the queued push is suppressed as `REMINDER_STALE` and no provider call is made.
5. Re-run evaluation and confirm the prior financial cycle is not duplicated.

Record the build identifier, staging user ID, worker run IDs, notification event ID, delivery outcome, Android version, and device model with the test evidence.
