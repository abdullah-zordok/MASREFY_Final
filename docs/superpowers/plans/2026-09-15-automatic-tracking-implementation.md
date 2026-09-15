# Android Automatic Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android bank-notification capture as an independent automatic-tracking source while retaining optional SMS ingestion and the existing safe import, review, duplicate, and ledger pipeline.

**Architecture:** Extend the existing local Expo SMS module with Android's native `NotificationListenerService` and an app-private bounded queue. Normalize both notification and SMS records through the existing client parser and offline import queue, then submit notification records as `provider`/`android_notification` through the current API endpoint.

**Tech Stack:** Expo Modules Kotlin, Android NotificationListenerService, SharedPreferences, React Native 0.83, TypeScript 5.9, Jest 29.

**Spec:** `docs/superpowers/specs/2026-09-15-mobile-notifications-automatic-tracking-design.md`

## Global Constraints

- Notification Access and `READ_SMS` are independent, optional Android sources; push permission is not consulted.
- Do not add `RECEIVE_SMS`, an SMS broadcast receiver, a new backend endpoint, or a direct ledger write.
- Queue at most 200 notification records, expire records older than 7 days, and acknowledge raw records after safe normalization into the existing offline queue.
- Keep `android.allowBackup` false and never submit a record that fails financial-message detection.
- Apple Pay, mada, POS, Visa, and Mastercard are parsed metadata only.
- iOS must not render Android source controls.

---

### Task 1: Native Notification Access adapter and bounded queue

**Files:**
- Create: `apps/mobile/modules/masarifi-sms-inbox/android/src/main/AndroidManifest.xml`
- Create: `apps/mobile/modules/masarifi-sms-inbox/android/src/main/java/com/masarifi/smsinbox/MasarifiNotificationListenerService.kt`
- Modify: `apps/mobile/modules/masarifi-sms-inbox/android/src/main/java/com/masarifi/smsinbox/MasarifiSmsInboxModule.kt`
- Modify: `apps/mobile/modules/masarifi-sms-inbox/index.ts`
- Create: `apps/mobile/modules/masarifi-sms-inbox/android/src/test/java/com/masarifi/smsinbox/NotificationQueueTest.kt`

**Interfaces:**
- Consumes: Android `NotificationListenerService`, `Settings.Secure.ENABLED_NOTIFICATION_LISTENERS`, `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`, and app-private `SharedPreferences`.
- Produces: native `isNotificationAccessEnabled(): Promise<boolean>`, `openNotificationAccessSettings(): Promise<void>`, `readRecentNotifications(limit): Promise<unknown>`, and `acknowledgeNotifications(keys): Promise<void>`.

- [ ] **Step 1: Write the failing Kotlin queue test**

Test that adding 201 records retains 200, a record older than seven days is removed on read, and acknowledgement removes only named keys.

```kotlin
assertEquals(200, queue.read(500, now).size)
assertFalse(queue.read(500, now).any { it.key == "expired" })
queue.acknowledge(setOf("n-1"))
assertFalse(queue.read(500, now).any { it.key == "n-1" })
```

- [ ] **Step 2: Run the native unit test and confirm failure**

Run: `./gradlew :masarifi-sms-inbox:testDebugUnitTest`

Expected: FAIL because the queue and listener do not exist.

- [ ] **Step 3: Implement the listener and queue**

Declare a non-exported service protected by `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` with the standard listener intent action. On posted notifications, persist only key, package name, title, text, and `postTime`; reject Masarifi's own package and blank text. Store a compact JSON array in private SharedPreferences, prune by the fixed seven-day cutoff, and cap newest-first at 200.

```xml
<service
  android:name=".MasarifiNotificationListenerService"
  android:exported="false"
  android:label="Masarifi transaction tracking"
  android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
  <intent-filter>
    <action android:name="android.service.notification.NotificationListenerService" />
  </intent-filter>
</service>
```

- [ ] **Step 4: Expose the four native methods**

Check enabled components by parsing `Settings.Secure.ENABLED_NOTIFICATION_LISTENERS`, open `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` with `FLAG_ACTIVITY_NEW_TASK`, return at most 100 records per read, and acknowledge exact keys. Extend the TypeScript module interface with the same names.

```ts
readRecentNotifications(limit: number): Promise<unknown>;
acknowledgeNotifications(keys: readonly string[]): Promise<void>;
isNotificationAccessEnabled(): Promise<unknown>;
openNotificationAccessSettings(): Promise<void>;
```

- [ ] **Step 5: Run native tests and compile**

Run: `./gradlew :masarifi-sms-inbox:testDebugUnitTest :app:compileDebugKotlin`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/modules/masarifi-sms-inbox
git commit -m "feat(mobile): capture Android bank notifications"
```

### Task 2: JavaScript notification source service

**Files:**
- Create: `apps/mobile/src/services/platform/bank-notification-service.ts`
- Create: `apps/mobile/src/services/platform/bank-notification-service.android.ts`
- Create: `apps/mobile/src/services/platform/bank-notification-service.test.ts`

**Interfaces:**
- Consumes: the four native methods from Task 1.
- Produces: `BankNotificationService` with `getAccessState`, `openSettings`, `readRecent`, and `acknowledge`; `RawBankNotification` with `key`, `packageName`, `title`, `text`, and `postedAt`.

- [ ] **Step 1: Write failing adapter tests**

Assert malformed native rows are discarded, limits are clamped to 1–100, disabled/missing native modules map to `unavailable`, and acknowledgement forwards only non-empty keys.

```ts
await expect(service.readRecent(500)).resolves.toEqual([validRecord]);
expect(native.readRecentNotifications).toHaveBeenCalledWith(100);
```

- [ ] **Step 2: Run the adapter test and confirm failure**

Run: `npm test -- --runInBand src/services/platform/bank-notification-service.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the minimal platform pair**

The Android file validates unknown native output and calls the native module. The generic file returns `unavailable`, an empty list, and no-op acknowledgement for iOS/web.

```ts
export interface BankNotificationService {
  getAccessState(): Promise<'granted' | 'denied' | 'unavailable'>;
  openSettings(): Promise<void>;
  readRecent(limit: number): Promise<RawBankNotification[]>;
  acknowledge(keys: readonly string[]): Promise<void>;
}
```

- [ ] **Step 4: Run the adapter test**

Run: `npm test -- --runInBand src/services/platform/bank-notification-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/platform/bank-notification-service.ts apps/mobile/src/services/platform/bank-notification-service.android.ts apps/mobile/src/services/platform/bank-notification-service.test.ts
git commit -m "feat(mobile): expose bank notification source"
```

### Task 3: Shared financial-message parser

**Files:**
- Rename: `apps/mobile/src/features/tracking/sms-import.ts` to `apps/mobile/src/features/tracking/financial-message-import.ts`
- Rename: `apps/mobile/src/features/tracking/sms-import.test.ts` to `apps/mobile/src/features/tracking/financial-message-import.test.ts`
- Modify: import sites in `apps/mobile/src/services/automatic-tracking-coordinator.ts`

**Interfaces:**
- Consumes: SMS `{id,sender,body,receivedAt}` and bank notification `{key,packageName,title,text,postedAt}` records, enabled sender rules, trusted package allowlist, keyword rules, accounts, and known fingerprints.
- Produces: `prepareFinancialMessageImport(records, options): Promise<PreparedFinancialMessageImport>` with events, skipped fingerprints, consumed source keys, newest timestamp, and account-required count.

- [ ] **Step 1: Rename the parser tests and add failing cases**

Keep all existing SMS coverage. Add table cases for purchase, transfer, withdrawal, salary, refund, mada, Apple Pay, POS, merchant, and last-four parsing; reject OTP, percentage advertisements, missing currency, missing amount, and notification records without sender/package or structured transaction wording.

```ts
expect(result.events[0]).toMatchObject({
  sourceChannel: 'android_notification',
  paymentMethod: 'apple_pay',
  merchant: 'Example Store'
});
```

- [ ] **Step 2: Run the parser test and confirm failure**

Run: `npm test -- --runInBand src/features/tracking/financial-message-import.test.ts`

Expected: FAIL because only SMS input and fields are supported.

- [ ] **Step 3: Generalize the existing parser in place**

Normalize both inputs into `{sourceKey, sourceIdentity, body, receivedAt, sourceChannel}` before the existing loop. Require positive amount, currency, a transaction kind, and source evidence. Extract merchant after `at/from/لدى/من`, last four using the existing account hint expression, and payment rail from explicit `apple pay|mada|مدى|pos|visa|mastercard` tokens. Preserve SHA-256 fingerprints and account selection.

```ts
const sourceType = record.sourceChannel === 'android_sms' ? 'sms' : 'provider';
const sourceChannel = record.sourceChannel;
```

- [ ] **Step 4: Run the parser test**

Run: `npm test -- --runInBand src/features/tracking/financial-message-import.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/tracking apps/mobile/src/services/automatic-tracking-coordinator.ts
git commit -m "feat(mobile): parse financial notifications and SMS"
```

### Task 4: Feed both sources through the existing import queue

**Files:**
- Modify: `apps/mobile/src/domain/automatic-tracking.ts`
- Modify: `apps/mobile/src/services/automatic-tracking-coordinator.ts`
- Modify: `apps/mobile/src/services/automatic-tracking-coordinator.test.ts`
- Modify: `apps/mobile/src/storage/sms-import-queue.ts`
- Modify: `apps/mobile/src/storage/sms-import-queue.test.ts`
- Modify: `apps/mobile/src/services/live/automatic-tracking-service.ts`
- Modify: `apps/mobile/src/services/live/automatic-tracking-service.test.ts`
- Modify: `apps/api/src/tracking/tracking.dto.ts`
- Modify: `apps/api/test/unit/tracking/tracking.worker.spec.ts`

**Interfaces:**
- Consumes: parser output from Task 3 and the existing `submitImport` endpoint.
- Produces: imports accepting `sourceType: 'sms' | 'provider' | 'manual'` and `sourceChannel: 'android_sms' | 'android_notification'`, with notification acknowledgement only after queue persistence.

- [ ] **Step 1: Write failing coordinator and contract tests**

Assert a granted notification source is processed when SMS is denied, notification events are persisted as `provider`/`android_notification`, source keys are acknowledged after `sms-import-queue.enqueue`, rejected notifications are acknowledged without submission, and identical SMS/notification financial facts still reach the backend duplicate workflow rather than a direct ledger method.

```ts
expect(queue.enqueue).toHaveBeenCalledBefore(notificationSource.acknowledge);
expect(tracking.submitImport).toHaveBeenCalledWith(
  expect.objectContaining({ sourceType: 'provider', sourceChannel: 'android_notification' }),
  expect.any(String)
);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --runInBand src/services/automatic-tracking-coordinator.test.ts src/storage/sms-import-queue.test.ts src/services/live/automatic-tracking-service.test.ts`

Run: `npm test -- --runInBand test/unit/tracking/tracking.worker.spec.ts`

Expected: FAIL because notification source types and orchestration are not accepted.

- [ ] **Step 3: Extend existing unions and coordinator**

Add `provider` only where the API source-type union is currently `sms | manual`; retain `android_notification` in the existing channel union. In the coordinator, poll each granted source independently, normalize using Task 3, enqueue first, then acknowledge native notification keys. Keep network submission, retries, idempotency keys, review routing, and ledger calls unchanged.

```ts
if (notificationAccess === 'granted') {
  const records = await bankNotifications.readRecent(100);
  await stage(records);
  await bankNotifications.acknowledge(records.map(({ key }) => key));
}
```

- [ ] **Step 4: Run mobile and API focused tests**

Run: `npm test -- --runInBand src/services/automatic-tracking-coordinator.test.ts src/storage/sms-import-queue.test.ts src/services/live/automatic-tracking-service.test.ts`

Run: `npm test -- --runInBand test/unit/tracking/tracking.worker.spec.ts test/unit/tracking/tracking.review.spec.ts`

Expected: PASS and existing duplicate/review assertions remain green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/domain/automatic-tracking.ts apps/mobile/src/services/automatic-tracking-coordinator.ts apps/mobile/src/services/automatic-tracking-coordinator.test.ts apps/mobile/src/storage/sms-import-queue.ts apps/mobile/src/storage/sms-import-queue.test.ts apps/mobile/src/services/live/automatic-tracking-service.ts apps/mobile/src/services/live/automatic-tracking-service.test.ts apps/api/src/tracking/tracking.dto.ts apps/api/test/unit/tracking/tracking.worker.spec.ts
git commit -m "feat: ingest Android notifications through tracking"
```

### Task 5: Separate Tracking source controls and foreground status

**Files:**
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.test.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingHomeCard.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingHomeCard.test.tsx`
- Modify: `apps/mobile/src/features/tracking/useAutomaticTracking.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`

**Interfaces:**
- Consumes: independent SMS `TrackingPermissionService` state and bank notification `BankNotificationService` state.
- Produces: Android-only Bank Notifications and Financial SMS rows, notification settings launch, SMS runtime request, foreground refresh, and Home enabled state when either source is granted.

- [ ] **Step 1: Write failing screen and Home tests**

Assert Android renders two distinct source rows, iOS renders neither, each CTA calls only its own permission service, foreground activation refreshes both, and the Tracking Home card hides when either source is granted.

```ts
expect(screen.getByText('Bank notifications')).toBeTruthy();
expect(screen.getByText('Financial SMS')).toBeTruthy();
expect(requestSms).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npm test -- --runInBand src/features/tracking/TrackingStatusScreen.test.tsx src/features/tracking/TrackingHomeCard.test.tsx`

Expected: FAIL because tracking exposes only the singular SMS permission.

- [ ] **Step 3: Implement independent source rows**

Keep the existing screen layout and controls. Add one row for Notification Access that opens Android settings and one row for SMS that uses the current runtime permission request/settings recovery. Refresh both on AppState `active`. Derive `trackingSourceEnabled` as `notificationAccess === 'granted' || smsPermission.status === 'granted'`.

```ts
const sourceEnabled =
  notificationAccess.data === 'granted' || smsPermission.status === 'granted';
```

- [ ] **Step 4: Run UI and navigation tests**

Run: `npm test -- --runInBand src/features/tracking/TrackingStatusScreen.test.tsx src/features/tracking/TrackingHomeCard.test.tsx src/features/tracking/TrackingStatusJourney.test.tsx src/features/tracking/TrackingPermissionRoute.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/tracking apps/mobile/src/localization/messages/en.ts apps/mobile/src/localization/messages/ar.ts
git commit -m "feat(mobile): separate automatic tracking sources"
```

### Task 6: End-to-end verification on build and connected Android device

**Files:**
- Verify: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

**Interfaces:**
- Consumes: Tasks 1–5 and connected device `RK8XB00N33K`.
- Produces: evidence that native registration, source status, queue processing, and existing safety tests work together.

- [ ] **Step 1: Run complete static and automated checks**

Run from `apps/mobile`: `npm run typecheck`, `npm run lint`, `npm run check:assistant-notifications`, and `npm test -- --runInBand`.

Run from `apps/api`: `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand test/unit/tracking test/unit/engagement test/integration/engagement`.

Expected: every command exits 0.

- [ ] **Step 2: Verify generated Android configuration**

Run: `npx expo config --type public`

Run: `./gradlew :app:assembleDebug`

Run: `adb shell dumpsys package com.masarifi.mobile | Select-String 'MasarifiNotificationListenerService|READ_SMS|BIND_NOTIFICATION_LISTENER_SERVICE'`

Expected: backup remains disabled, `READ_SMS` remains the only SMS permission, and the notification listener is declared with bind-listener protection.

- [ ] **Step 3: Verify real device recovery flows**

Install the debug APK, open Automatic Tracking, launch Notification Access settings, grant Masarifi access, return to the app, and confirm the Bank Notifications row refreshes to enabled. Revoke it and confirm the row refreshes to disabled. Exercise the SMS row independently and confirm neither action changes push permission.

- [ ] **Step 4: Verify one safe notification import**

Post a test bank-style notification containing a positive SAR amount and structured purchase wording. Return to Masarifi, trigger foreground synchronization, and verify one import/history or review record is created and the native queue no longer returns the acknowledged key. Post an OTP and a percentage advertisement and verify neither creates an import.

- [ ] **Step 5: Confirm the final patch is mechanically clean**

```bash
git diff --check
```

Expected: no whitespace errors.
