# Automatic Android SMS Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable consented, privacy-minimized Android SMS tracking in live mode by scanning on authenticated app start/resume, submitting idempotent imports to the existing backend, and rendering real results.

**Architecture:** A local Expo Android module reads a bounded recent inbox and reports connectivity. A pure TypeScript pipeline filters, minimizes, fingerprints, associates an eligible existing account, and persists safe import records before a coordinator submits them through the existing live tracking provider. Existing backend tracking/import/review/duplicate/idempotency/ledger behavior is reused unchanged.

**Tech Stack:** Expo 55, React Native 0.83, Expo Modules Kotlin API, TypeScript 5.9, React Query, AsyncStorage, Expo Crypto, Jest/Jest Expo, NestJS tracking API (unchanged)

**Spec:** `docs/superpowers/specs/2026-09-12-automatic-sms-tracking-design.md`

**Backend gap analysis:** `docs/superpowers/specs/2026-09-12-automatic-sms-tracking-backend-gap-analysis.md`

## Global Constraints

- Do not modify backend controllers, services, migrations, workers, duplicate/review logic, idempotency, or ledger integration; the gap analysis found no backend blocker.
- Reuse the existing authenticated `/api/v1/tracking/*`, `/api/v1/imports`, `/api/v1/reviews`, and `/api/v1/duplicates` APIs.
- Request only `android.permission.READ_SMS`; do not add `RECEIVE_SMS` or terminated-app/background capture.
- Never upload, persist, or log an unfiltered inbox or raw SMS body.
- Demo and test modes use fixtures only; live mode never imports the mock provider directly.
- Preserve existing user changes, especially the already-modified localization files; stage only task-owned hunks.
- Use one failing test before every non-trivial production behavior.

## File Structure

- `apps/mobile/src/services/automatic-tracking-service.ts`: single fixture/live provider selector.
- `apps/mobile/src/services/contracts/automatic-tracking-service.ts`: import-session and duplicate-list interfaces.
- `apps/mobile/src/services/live/automatic-tracking-service.ts`: strict existing-API import/session/duplicate mapping.
- `apps/mobile/src/domain/automatic-tracking.ts`: import-session and local sync-state domain schemas/types.
- `apps/mobile/modules/masarifi-sms-inbox/*`: autolinked Android inbox/connectivity module.
- `apps/mobile/src/services/platform/sms-inbox-service.ts`: unavailable non-Android adapter and native bridge contract.
- `apps/mobile/src/services/platform/sms-inbox-service.android.ts`: Android native-module adapter.
- `apps/mobile/src/services/platform/tracking-permission-service.android.ts`: Android permission adapter.
- `apps/mobile/src/features/tracking/sms-import.ts`: pure normalization, filtering, minimization, account matching, and fingerprint logic.
- `apps/mobile/src/storage/sms-import-queue.ts`: safe AsyncStorage queue, cursor, rule snapshot, and last-result persistence.
- `apps/mobile/src/services/automatic-tracking-coordinator.ts`: start/resume scan, queue flush, import polling, and safe state orchestration.
- `apps/mobile/app/tracking/permission.tsx`: reusable education/consent route for post-onboarding enablement.
- Existing tracking screens/hooks: live provider and real state/navigation wiring only.

---

### Task 1: Lock the backend boundary and select the correct mobile provider

**Files:**
- Create: `apps/mobile/src/services/automatic-tracking-service.ts`
- Create: `apps/mobile/src/services/automatic-tracking-service.test.ts`
- Modify: `apps/mobile/src/services/contracts/automatic-tracking-service.ts`
- Modify: `apps/mobile/src/domain/automatic-tracking.ts`
- Modify: `apps/mobile/src/services/live/automatic-tracking-service.ts`
- Modify: `apps/mobile/src/services/live/automatic-tracking-service.test.ts`
- Modify: `apps/mobile/src/services/mocks/automatic-tracking-service.ts`

**Interfaces:**
- Produces: `automaticTrackingService`, `selectAutomaticTrackingService(fixtureMode, live)`.
- Produces: `TrackingImportSubmission`, `TrackingImportSession`, `submitImport(input, idempotencyKey)`, `getImportSession(id)`, `listDuplicates()`.
- Consumes: existing Clerk token provider, client-mode selection, and current tracking endpoints.

- [ ] **Step 1: Write provider-selection failing tests**

```ts
it('selects fixtures only for explicit fixture mode', () => {
  expect(selectAutomaticTrackingService(true, live)).toBe(fixture);
  expect(selectAutomaticTrackingService(false, live)).toBe(live);
});
```

The test must fail because the selector module does not exist.

- [ ] **Step 2: Run the selector test and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/services/automatic-tracking-service.test.ts`

Expected: FAIL resolving `automatic-tracking-service` or the missing selector export.

- [ ] **Step 3: Implement the minimal provider selector**

```ts
export function selectAutomaticTrackingService(
  fixtureMode: boolean,
  live: CapabilityProviderHandle<AutomaticTrackingService>
) {
  return fixtureMode ? fixtureAutomaticTrackingService : live;
}

export const automaticTrackingService = selectAutomaticTrackingService(
  isFixtureModeEnabled(),
  createLiveAutomaticTrackingService()
);
```

- [ ] **Step 4: Run the selector test and verify GREEN**

Run: `npx jest --runInBand --runTestsByPath src/services/automatic-tracking-service.test.ts`

Expected: 2 tests pass for fixture and live selection.

- [ ] **Step 5: Write failing live import mapping tests**

Use complete literal backend fixtures and assert observable request/response behavior:

```ts
await service.submitImport(
  {
    schemaVersion: 1,
    sourceType: 'sms',
    sourceChannel: 'android_sms',
    events: [{
      sourceItemKey: 'sha256:message',
      sender: 'BANK',
      amountMinor: -1250,
      currency: 'SAR',
      kind: 'expense',
      accountId,
      receivedAt: '2026-09-12T10:00:00.000Z'
    }]
  },
  'sms:sha256:message'
);
expect(request).toHaveBeenCalledWith(
  expect.stringEndingWith('/api/v1/imports'),
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'Idempotency-Key': 'sms:sha256:message' })
  })
);
```

Also cover `received`, `processing`, `review`, `complete`, `failed`, malformed sessions, paginated duplicates, and preservation of real review/duplicate IDs.

- [ ] **Step 6: Run live mapping tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/services/live/automatic-tracking-service.test.ts`

Expected: FAIL because import/session/list-duplicate methods are absent.

- [ ] **Step 7: Add strict domain types and existing-API methods**

Add the smallest public shapes:

```ts
export interface TrackingImportSession {
  id: string;
  status: 'received' | 'processing' | 'review' | 'complete' | 'failed' | 'cancelled';
  itemCount: number;
  acceptedCount: number;
  rejectedCount: number;
  completedAt: number | null;
  updatedAt: number;
}
```

Map only documented response fields. `submitImport` must pass the caller's original idempotency key to the existing `send` helper; `getImportSession` uses `GET /api/v1/imports/:id`; `listDuplicates` traverses `GET /api/v1/duplicates` with existing pagination. Implement compatible fixture methods without changing demo behavior.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `npx jest --runInBand --runTestsByPath src/services/automatic-tracking-service.test.ts src/services/live/automatic-tracking-service.test.ts src/services/mocks/automatic-tracking-service.test.ts`

Expected: all selected suites pass.

Commit only Task 1 files with message: `feat(mobile): select live automatic tracking service`

---

### Task 2: Restore consented Android SMS permission

**Files:**
- Create: `apps/mobile/src/services/platform/tracking-permission-service.android.ts`
- Modify: `apps/mobile/src/services/platform/tracking-permission-service.ts`
- Modify: `apps/mobile/src/services/platform/tracking-permission-service.test.ts`
- Create: `apps/mobile/app/tracking/permission.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.test.tsx`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/mobile/src/services/platform/platform-privacy-config.test.ts`

**Interfaces:**
- Produces: real `createTrackingPermissionService()` on Android; unavailable adapter elsewhere.
- Produces: `/tracking/permission?mode=automatic_clear|review_all` education route.
- Consumes: existing `PermissionEducation`, permission state schema, AsyncStorage, and selected tracking service.

- [ ] **Step 1: Replace the obsolete permission expectation with failing mapping tests**

Inject or mock `PermissionsAndroid`, AsyncStorage, and `Linking` at the platform boundary. Cover first use, grant, denial, never-ask-again, revoked-after-grant, settings, and non-Android unavailable. Each expectation uses literal state objects.

- [ ] **Step 2: Run permission tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/services/platform/tracking-permission-service.test.ts`

Expected: FAIL because Android still resolves to unavailable.

- [ ] **Step 3: Restore the Android-specific adapter**

Reuse the previously proven repository pattern: `PermissionsAndroid.check`, persisted prior state, `PermissionsAndroid.request`, and `Linking.openSettings`. The request method performs no education itself; callers must reach it only from the accepted education action.

- [ ] **Step 4: Run permission tests and verify GREEN**

Run: `npx jest --runInBand --runTestsByPath src/services/platform/tracking-permission-service.test.ts`

Expected: all mapping tests pass.

- [ ] **Step 5: Write failing consent-route and tracking-screen tests**

Verify that tapping Enable on status navigates to education without calling `PermissionsAndroid.request`; accepting education requests once; blocked states open Settings; iOS/web controls stay unavailable; and the selected mode is sent only after a grant.

- [ ] **Step 6: Run UI permission tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/features/tracking/TrackingStatusScreen.test.tsx src/features/onboarding/PlatformOnboardingRoutes.test.tsx`

Expected: FAIL because the tracking permission route and navigation gate are absent.

- [ ] **Step 7: Add the consent route and permission declarations**

Reuse `PermissionEducation`. On accept: request permission, set the requested real tracking mode only when granted, then return to tracking. On skip or denial: return without enabling. Remove `blockedPermissions: READ_SMS`, add `android.permission.READ_SMS` to `android.permissions`, and replace the checked-in manifest's `tools:node="remove"` entry with one plain `uses-permission`. Do not add `RECEIVE_SMS`.

- [ ] **Step 8: Run Task 2 tests and commit**

Run: `npx jest --runInBand --runTestsByPath src/services/platform/tracking-permission-service.test.ts src/services/platform/platform-privacy-config.test.ts src/features/tracking/TrackingStatusScreen.test.tsx src/features/onboarding/PlatformOnboardingRoutes.test.tsx`

Expected: all selected suites pass.

Commit only Task 2 files with message: `feat(mobile): request Android SMS permission after consent`

---

### Task 3: Add the minimal prebuild-safe Android inbox bridge

**Files:**
- Create: `apps/mobile/modules/masarifi-sms-inbox/expo-module.config.json`
- Create: `apps/mobile/modules/masarifi-sms-inbox/android/build.gradle`
- Create: `apps/mobile/modules/masarifi-sms-inbox/android/src/main/java/com/masarifi/smsinbox/MasarifiSmsInboxModule.kt`
- Create: `apps/mobile/modules/masarifi-sms-inbox/index.ts`
- Create: `apps/mobile/src/services/platform/sms-inbox-service.ts`
- Create: `apps/mobile/src/services/platform/sms-inbox-service.android.ts`
- Create: `apps/mobile/src/services/platform/sms-inbox-service.test.ts`

**Interfaces:**
- Produces: `RawSmsMessage`, `SmsInboxService.readRecent({ since, limit })`, `SmsInboxService.isNetworkAvailable()`.
- Native module name: `MasarifiSmsInbox`.
- Consumes: Android `Telephony.Sms.Inbox`, `ConnectivityManager`, and Expo Modules Kotlin APIs already installed.

- [ ] **Step 1: Write failing JavaScript adapter contract tests**

```ts
await expect(service.readRecent({ since: 1_757_678_400_000, limit: 100 }))
  .resolves.toEqual([{
    id: '42', sender: 'BANK', body: 'fixture body', receivedAt: 1_757_678_401_000
  }]);
```

Also assert invalid native rows are rejected, non-Android returns an empty/unavailable result, and network availability is forwarded as a boolean.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/services/platform/sms-inbox-service.test.ts`

Expected: FAIL because the adapter/module contract is absent.

- [ ] **Step 3: Implement the TypeScript native-module adapter**

Use `requireOptionalNativeModule('MasarifiSmsInbox')` so web/iOS/test environments remain explicit and non-crashing. Validate every returned field before exposing it to the coordinator.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run: `npx jest --runInBand --runTestsByPath src/services/platform/sms-inbox-service.test.ts`

Expected: adapter tests pass.

- [ ] **Step 5: Implement the local Expo Kotlin module**

Register exactly two async functions. `readRecentSms` must require `READ_SMS`, clamp `limit` to `1..100`, query `_ID`, `ADDRESS`, `BODY`, and `DATE` with `DATE >= ?`, sort oldest-first, close the cursor with `use`, and never log rows. `isNetworkAvailable` reads the active network capabilities and returns true only for a connected internet-capable network.

- [ ] **Step 6: Verify autolinking and native compilation**

Run: `npx expo-modules-autolinking resolve --platform android`

Expected: output includes `MasarifiSmsInboxModule` from `modules/masarifi-sms-inbox`.

Run: `./gradlew.bat :app:compileDebugKotlin` from `apps/mobile/android`.

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit Task 3**

Commit only the local module and inbox adapter files with message: `feat(mobile): add bounded Android SMS inbox bridge`

---

### Task 4: Filter, minimize, fingerprint, and associate accounts locally

**Files:**
- Create: `apps/mobile/src/features/tracking/sms-import.ts`
- Create: `apps/mobile/src/features/tracking/sms-import.test.ts`

**Interfaces:**
- Produces: `prepareSmsImport(messages, { keywordRules, senderRules, accounts, knownFingerprints })`.
- Produces: `PreparedSmsImport { events; skippedFingerprints; newestReceivedAt; accountRequiredCount }`.
- Consumes: existing keyword/sender/account domain models, `accountAllowsAutomaticTracking`, and Expo Crypto SHA-256.

- [ ] **Step 1: Write failing privacy/filter tests**

Use controlled Arabic and English fixtures. Prove:

- OTP and marketing-only messages are rejected even when they contain digits;
- enabled sender or keyword rules and conservative transaction-verb-plus-amount patterns admit financial messages;
- disabled rules do not match;
- Arabic-Indic digits and SAR/ر.س aliases normalize to literal minor-unit expectations;
- fingerprints are stable and distinct when sender/time/text changes;
- known fingerprints are omitted;
- raw card/account/phone/URL/OTP strings do not appear in the emitted event;
- account choice prefers exact last four plus currency, then sole eligible currency account, then eligible default; ambiguity emits no event and increments `accountRequiredCount`.

- [ ] **Step 2: Run the pipeline test and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/features/tracking/sms-import.test.ts`

Expected: FAIL because `prepareSmsImport` is absent.

- [ ] **Step 3: Implement the minimum pure pipeline**

Use Unicode normalization and small literal pattern tables; do not add a rule engine. Set `sourceItemKey` to the SHA-256 fingerprint, `sourceChannel` to `android_sms`, `receivedAt`/`occurredAt` to ISO timestamps, and include body only when structured amount data is insufficient. Never call logging APIs.

- [ ] **Step 4: Run the pipeline test and verify GREEN**

Run: `npx jest --runInBand --runTestsByPath src/features/tracking/sms-import.test.ts`

Expected: all filtering, privacy, account, and fingerprint tests pass.

- [ ] **Step 5: Commit Task 4**

Commit Task 4 files with message: `feat(mobile): minimize financial SMS imports locally`

---

### Task 5: Persist and synchronize the safe offline queue

**Files:**
- Create: `apps/mobile/src/storage/sms-import-queue.ts`
- Create: `apps/mobile/src/storage/sms-import-queue.test.ts`
- Create: `apps/mobile/src/services/automatic-tracking-coordinator.ts`
- Create: `apps/mobile/src/services/automatic-tracking-coordinator.test.ts`

**Interfaces:**
- Produces: `SmsImportQueue` with `load`, `enqueue`, `markSubmitted`, `markTerminal`, `saveRules`, and `clear`.
- Produces: `syncAutomaticTracking()` and `getAutomaticTrackingSyncState()`.
- State: `idle | scanning | queued | processing | imported | review | duplicate | account_required | error` with safe IDs/codes only.
- Consumes: selected tracking service, permission service, inbox service, account service/query repository, and `prepareSmsImport`.

- [ ] **Step 1: Write failing queue persistence tests**

Prove that enqueue persists only normalized events, stable idempotency key, cursor, bounded fingerprints, and safe rule snapshots; repeated enqueue is idempotent; raw fixture bodies not required by the normalized event are absent; owner/session reset clears the queue.

- [ ] **Step 2: Run queue tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/storage/sms-import-queue.test.ts`

Expected: FAIL because the queue does not exist.

- [ ] **Step 3: Implement the bounded AsyncStorage queue**

Use one versioned key and a maximum of 100 pending entries plus 500 recent fingerprints. Persist the queue before advancing the cursor. Keep the same idempotency key for every retry.

- [ ] **Step 4: Run queue tests and verify GREEN**

Run: `npx jest --runInBand --runTestsByPath src/storage/sms-import-queue.test.ts`

Expected: queue tests pass.

- [ ] **Step 5: Write failing coordinator tests**

Cover these real outcomes:

- no scan when not live, unauthenticated, paused, unavailable, or permission denied;
- offline scan may enqueue minimized records but performs no HTTP request;
- reconnect flush reuses the original idempotency key;
- submitted `received/processing` session is polled rather than resubmitted;
- terminal `complete`, `review`, `failed`, and duplicate-list matches produce their corresponding safe state and real IDs;
- ambiguous account stays local as `account_required`;
- concurrent start/resume calls coalesce into one run.

- [ ] **Step 6: Run coordinator tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/services/automatic-tracking-coordinator.test.ts`

Expected: FAIL because the coordinator is absent.

- [ ] **Step 7: Implement the coordinator**

Stop at the first ineligible gate. Refresh rules/accounts only when online; otherwise use the last safe rule snapshot and existing synchronized accounts. Persist before submit. Poll submitted sessions on later syncs. Query real duplicates and match `leftItemId` to the import item/review identity before exposing a duplicate route ID. Catch errors into safe codes without logging payloads.

- [ ] **Step 8: Run Task 5 tests and commit**

Run: `npx jest --runInBand --runTestsByPath src/storage/sms-import-queue.test.ts src/services/automatic-tracking-coordinator.test.ts`

Expected: all selected suites pass.

Commit Task 5 files with message: `feat(mobile): queue and retry SMS tracking imports`

---

### Task 6: Wire live tracking screens and lifecycle states

**Files:**
- Modify: `apps/mobile/src/features/tracking/useAutomaticTracking.ts`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusScreen.test.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingStatusJourney.test.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingHistoryList.tsx`
- Modify: `apps/mobile/src/features/tracking/SenderRuleList.tsx`
- Modify: `apps/mobile/src/features/tracking/ReviewQueue.tsx`
- Modify: `apps/mobile/src/features/tracking/ReviewDetail.tsx`
- Modify: `apps/mobile/src/features/tracking/DuplicateComparison.tsx`
- Modify: `apps/mobile/src/features/tracking/AutomaticFeedback.tsx`
- Modify: `apps/mobile/src/features/transactions/TransactionActions.tsx`
- Modify: `apps/mobile/src/state/AppShellProvider.tsx`
- Modify: `apps/mobile/src/state/AppShellProvider.test.tsx`
- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`

**Interfaces:**
- Consumes: the selected service and coordinator from Tasks 1 and 5.
- Produces: real status/mode/rule/history/review/duplicate flows and app-start/resume synchronization.

- [ ] **Step 1: Write failing live-mode screen-state tests**

Cover unavailable, denied, blocked/settings, granted/paused, scanning, offline queued/retry, processing, imported, review with real review navigation, duplicate with real candidate navigation, account-required, and safe error. In Arabic, assert right alignment/writing direction and use formatted amount components for mixed numeric text.

- [ ] **Step 2: Run screen tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath src/features/tracking/TrackingStatusScreen.test.tsx src/features/tracking/TrackingStatusJourney.test.tsx`

Expected: FAIL because the screen still reads mock-only status and lacks coordinator states.

- [ ] **Step 3: Replace every production mock import with the selector**

Use:

```ts
import { automaticTrackingService } from '@/services/automatic-tracking-service';
```

Retain mock imports only in tests and the selector's fixture branch. Remove live access to `processMockEvent`; the demo route remains fixture-only.

- [ ] **Step 4: Add real mode and result UI**

Automatic-clear and review-all enable actions route through education if permission is missing; pause calls the backend immediately. The status screen renders coordinator state with localized retry/open-settings/accounts/review/duplicate actions. ReviewQueue fetches real duplicate candidates and routes duplicate-backed reviews to `/tracking/duplicates/:id`; other reviews route to `/tracking/review/:id`.

- [ ] **Step 5: Add authenticated start/resume synchronization**

In the existing live authenticated branches of `AppShellProvider`, invoke `syncAutomaticTracking().catch(() => undefined)` beside the existing core-finance/platform refreshes. The coordinator itself owns safe error state and coalescing, so the provider adds no payload logging or retry loop.

- [ ] **Step 6: Run the tracking and app-shell tests**

Run: `npx jest --runInBand --runTestsByPath src/features/tracking/TrackingStatusScreen.test.tsx src/features/tracking/TrackingStatusJourney.test.tsx src/features/tracking/TrackingRulesJourney.test.tsx src/features/tracking/ReviewJourney.test.tsx src/features/tracking/duplicate-resolution.test.ts src/state/AppShellProvider.test.tsx`

Expected: all selected suites pass.

- [ ] **Step 7: Run a production mock-import scan**

Run: `rg -n "services/mocks/automatic-tracking-service" src --glob "!**/*.test.*"`

Expected: only `src/services/automatic-tracking-service.ts` imports the fixture provider.

- [ ] **Step 8: Commit Task 6**

Stage only Task 6 hunks, preserving unrelated localization edits. Commit with message: `feat(mobile): show real automatic tracking results`

---

### Task 7: Verify configuration, Android dev client, device, and backend result

**Files:**
- Create: `apps/mobile/specs/005-automatic-tracking/android-evidence/2026-09-12-live-sms-verification.md`
- Modify only if evidence finds a product defect: files owned by Tasks 1-6, after a failing regression test.

**Interfaces:**
- Consumes: completed implementation and an optional connected physical Android device/live environment.
- Produces: explicit code/device/backend/release-gate verification report.

- [ ] **Step 1: Run focused mobile tests**

Run all Task 1-6 test files plus existing tracking privacy/accessibility tests. Expected: zero failures and no raw SMS content in output.

- [ ] **Step 2: Run static quality gates**

Run from `apps/mobile`:

```powershell
npm run typecheck
npm run lint
npm run check:client-runtime
```

Expected: all exit 0.

- [ ] **Step 3: Verify Expo permission and module configuration**

Run:

```powershell
npx expo config --type public
npx expo-modules-autolinking resolve --platform android
```

Expected: public config contains `android.permission.READ_SMS`, omits `RECEIVE_SMS`, and autolinking includes `MasarifiSmsInboxModule`.

- [ ] **Step 4: Verify a clean Android prebuild does not lose the module**

First preserve the exact current generated Android tree as a recoverable copy outside the repository. Run `npx expo prebuild --platform android --clean --no-install`, then repeat the manifest permission, autolinking, and Kotlin compile checks. Review the generated diff and keep only intended native/config changes.

- [ ] **Step 5: Build and reinstall the Android dev client**

Run `npm run android` with a connected device. Expected: Gradle/install/launch succeed and Android package permission state contains `READ_SMS`.

- [ ] **Step 6: Exercise a safe controlled SMS fixture**

Use a non-personal test sender/body containing a known financial verb, amount, currency, and an eligible configured account hint. Confirm education appears before the OS request, the scan occurs on resume, no raw text appears in logs, and the UI shows queued/processing then the actual backend terminal state.

- [ ] **Step 7: Confirm the backend result without changing backend code**

Using the authenticated mobile UI/API response, verify the import session ID exists, status reaches `complete` or `review`, review/duplicate links use returned IDs, and any accepted transaction came through the existing tracking ledger source. Do not insert directly into backend tables.

- [ ] **Step 8: Record evidence and final release gates**

Write four explicit sections: code implemented/verified, physical-device result, backend readiness/result, and remaining Play Store/privacy/consent requirements. Mark unavailable device or backend evidence as unverified rather than passed.

- [ ] **Step 9: Run final verification and commit evidence**

Freshly rerun focused tests, typecheck, lint, client-runtime check, Expo config, autolinking, and Android compile. Commit only the evidence document and any test-proven fixes with message: `test(mobile): verify live Android SMS tracking`.
