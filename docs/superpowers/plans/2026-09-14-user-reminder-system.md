# Masarifi User Reminder System Implementation Plan

> **Scope update:** The later onboarding decision supersedes Tasks 1-3 and the pre-signup portions of Task 10. The shipped implementation intentionally has no first-launch notification prompt or unauthenticated local schedules.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-signup local reminders plus registered app-inactivity and financial-inactivity push reminders through Masarifi's existing notification infrastructure.

**Architecture:** Mobile schedules and cancels the two unauthenticated reminders through the existing Expo phone-notification service. The governed engagement scheduler evaluates authenticated reminder eligibility daily, creates deterministic source claims, and reuses templates, preferences, notification history, delivery queues, and Expo/FCM/APNs providers. Existing `notification_events.source_event_id` uniqueness persists reminder deduplication without a new reminder-state table.

**Tech Stack:** TypeScript, React Native 0.83, Expo 55, Clerk Expo, NestJS 11, PostgreSQL/Supabase migrations, Jest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-14-user-reminder-system-design.md`

## Global Constraints

- Use local notifications only for unauthenticated pre-signup reminders.
- Use backend push delivery for registered reminders.
- Request notification permission once during onboarding and never retry automatically after denial.
- Emit at most two pre-signup reminders, at approximately 24 and 72 hours from the first onboarding visit.
- Emit registered inactivity reminders at approximately 3 and 7 days, then stop for that activity cycle.
- Emit one financial inactivity reminder after 7 days per successful-financial-activity cycle.
- Use `profiles.last_seen_at` for app activity and non-deleted `transactions.created_at` for successful financial activity.
- Preserve existing automatic-transaction notifications and Demo/Test local-notification behavior.
- Reuse existing notification preferences, device registration, delivery retries, and Expo/FCM/APNs providers.
- Keep notification copy generic and free of balances, amounts, accounts, merchants, or summaries.
- Use server timestamps for backend eligibility.
- Do not add a reminder-state table or a notification provider.

---

### Task 1: Extend the Existing Phone Notification Abstraction for Scheduling

**Files:**
- Modify: `apps/mobile/src/services/contracts/assistant-notifications-service.ts`
- Modify: `apps/mobile/src/services/platform/phone-notification-service.ts`
- Test: `apps/mobile/src/services/platform/phone-notification-service.test.ts`

**Interfaces:**
- Consumes: Expo Notifications `scheduleNotificationAsync` and `cancelScheduledNotificationAsync`.
- Produces: `scheduleLocal(input)` and `cancelScheduled(identifier)` on `PhoneNotificationService`; typed local response payloads.

- [ ] **Step 1: Write failing platform tests**

Add tests proving a dated schedule passes a real `Date` trigger, the payload carries `localDestination: 'auth'`, cancellation delegates to Expo, and malformed responses remain rejected:

```ts
it('schedules a local auth reminder for the requested date', async () => {
  scheduleNotificationAsync.mockResolvedValue('pre-signup-1');
  await expect(service.scheduleLocal({
    title: 'Finish setting up Masarifi 👋',
    body: 'Create your account and let Masarifi organize your spending automatically.',
    destination: 'auth',
    scheduledAt: new Date('2026-09-15T12:00:00.000Z')
  })).resolves.toEqual({ status: 'scheduled', identifier: 'pre-signup-1' });
  expect(scheduleNotificationAsync).toHaveBeenCalledWith({
    content: expect.objectContaining({ data: { localDestination: 'auth' } }),
    trigger: new Date('2026-09-15T12:00:00.000Z')
  });
});

it('cancels a scheduled local reminder', async () => {
  await service.cancelScheduled('pre-signup-1');
  expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith('pre-signup-1');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/platform/phone-notification-service.test.ts
```

Expected: FAIL because `scheduleLocal`, `cancelScheduled`, and typed local destinations do not exist.

- [ ] **Step 3: Add the minimum contract and Expo implementation**

Add these shapes without changing `presentLocal`:

```ts
export type LocalNotificationDestination = 'auth';

export type LocalNotificationSchedule = {
  title: string;
  body: string;
  destination: LocalNotificationDestination;
  scheduledAt: Date;
};

export type PhoneNotificationResponse =
  | { notificationId: string; action: NotificationActionKind }
  | { localDestination: LocalNotificationDestination; action: 'view' };

export interface PhoneNotificationService {
  // existing methods stay unchanged
  scheduleLocal(input: LocalNotificationSchedule): Promise<{
    status: 'scheduled' | 'failed';
    identifier: string | null;
  }>;
  cancelScheduled(identifier: string): Promise<void>;
}
```

Implement both methods with existing platform guards and exception handling. Extend `responseFromExpo` to return the local-destination branch only for `localDestination === 'auth'` and a view/default action.

- [ ] **Step 4: Run the focused platform test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- apps/mobile/src/services/contracts/assistant-notifications-service.ts apps/mobile/src/services/platform/phone-notification-service.ts apps/mobile/src/services/platform/phone-notification-service.test.ts
git commit -m "feat(mobile): support scheduled local reminders"
```

---

### Task 2: Implement Minimal Pre-Signup Reminder State

**Files:**
- Create: `apps/mobile/src/services/pre-signup-reminder-service.ts`
- Create: `apps/mobile/src/services/pre-signup-reminder-service.test.ts`

**Interfaces:**
- Consumes: `PhoneNotificationService`, SecureStore-compatible `getItemAsync`/`setItemAsync`, locale, and a supplied clock.
- Produces: `prepare()`, `scheduleAfterPermission()`, and `completeAuthentication()`.

- [ ] **Step 1: Write failing service tests**

Use an in-memory key/value adapter and a fake phone service. Cover the first visit, both thresholds, no third schedule, repeated visits, denial, expired targets, cancellation, restored authentication, and account sign-out:

```ts
it('schedules exactly the 24h and 72h reminders once', async () => {
  const service = createPreSignupReminderService({ phone, storage, now, locale: () => 'en' });
  expect(await service.prepare()).toEqual({ shouldRequestPermission: true });
  await service.scheduleAfterPermission('granted');
  await service.scheduleAfterPermission('granted');
  expect(phone.scheduleLocal).toHaveBeenCalledTimes(2);
  expect(phone.scheduleLocal.mock.calls.map(([input]) => input.scheduledAt.toISOString())).toEqual([
    '2026-09-15T12:00:00.000Z',
    '2026-09-17T12:00:00.000Z'
  ]);
});

it('cancels pending reminders and never recreates them after authentication', async () => {
  await service.scheduleAfterPermission('granted');
  await service.completeAuthentication();
  expect(phone.cancelScheduled).toHaveBeenCalledTimes(2);
  expect(await service.prepare()).toEqual({ shouldRequestPermission: false });
});
```

Table-drive Arabic and English expected titles and bodies using literal values from the design spec.

- [ ] **Step 2: Run the service test and verify RED**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/pre-signup-reminder-service.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the service**

Persist one versioned value under `masarifi.pre-signup-reminders.v1`:

```ts
type PreSignupReminderState = {
  startedAt: number;
  permissionAttempted: boolean;
  scheduledIds: string[];
  authenticated: boolean;
};
```

`prepare()` creates the state once and reports whether the one-time prompt is due. `scheduleAfterPermission()` marks the attempt before scheduling, schedules only future 24h/72h targets, and persists each returned ID. `completeAuthentication()` cancels all IDs best-effort, clears them, and sets `authenticated: true`.

- [ ] **Step 4: Run the service test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- apps/mobile/src/services/pre-signup-reminder-service.ts apps/mobile/src/services/pre-signup-reminder-service.test.ts
git commit -m "feat(mobile): add pre-signup reminder state"
```

---

### Task 3: Wire Onboarding Permission, Authentication Cancellation, and Local Tap Routing

**Files:**
- Modify: `apps/mobile/src/features/onboarding/FirstLaunchOnboardingScreen.tsx`
- Modify: `apps/mobile/src/state/AppShellProvider.tsx`
- Modify: `apps/mobile/src/features/notifications/notification-response-controller.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Test: `apps/mobile/src/state/AppShellProvider.test.tsx`
- Test: `apps/mobile/src/features/notifications/notification-response-controller.test.ts`
- Create: `apps/mobile/src/features/onboarding/FirstLaunchOnboardingScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 phone methods and Task 2 pre-signup service.
- Produces: one-time onboarding permission flow, Clerk-session cancellation, and `auth` destination navigation.

- [ ] **Step 1: Write failing UI and lifecycle tests**

Add tests that prove:

```ts
it('requests notification permission only after onboarding education confirmation', async () => {
  render(<FirstLaunchOnboardingScreen onContinue={jest.fn()} />);
  await user.press(screen.getByText('Get started'));
  expect(phoneNotificationService.requestPermission).not.toHaveBeenCalled();
  await user.press(screen.getByText('Allow notifications'));
  expect(phoneNotificationService.requestPermission).toHaveBeenCalledTimes(1);
});

it('completes pre-signup reminders when Clerk becomes authenticated', async () => {
  liveSessionKey = 'session-1';
  render(<AppShellProvider><Text>child</Text></AppShellProvider>);
  await waitFor(() => expect(preSignupReminders.completeAuthentication).toHaveBeenCalledTimes(1));
});

it('routes a local auth reminder without calling the backend notification API', async () => {
  await controller.handle({ localDestination: 'auth', action: 'view' });
  expect(navigate).toHaveBeenCalledWith('/(public)/welcome');
  expect(notificationService.resolveTarget).not.toHaveBeenCalled();
});
```

Also prove denial closes the education flow without another automatic request and restored authenticated sessions cancel stale schedules.

- [ ] **Step 2: Run the three test files and verify RED**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/features/onboarding/FirstLaunchOnboardingScreen.test.tsx src/state/AppShellProvider.test.tsx src/features/notifications/notification-response-controller.test.ts
```

Expected: FAIL on the missing permission flow, completion call, and local response branch.

- [ ] **Step 3: Implement the minimal wiring**

Use the existing `ConfirmationDialog` permission-education pattern. Add natural localized labels for the education title/body/allow/not-now actions. On confirmation call the existing `requestPermission()`, then Task 2 `scheduleAfterPermission(result)`. On dismissal record a denied/no-retry decision without requesting the OS permission.

In `AppShellProvider`, call `completeAuthentication()` when a real live Clerk session key becomes non-null. In `notification-response-controller`, branch on `'localDestination' in response` before backend resolution and navigate to `/(public)/welcome`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- apps/mobile/src/features/onboarding/FirstLaunchOnboardingScreen.tsx apps/mobile/src/state/AppShellProvider.tsx apps/mobile/src/features/notifications/notification-response-controller.ts apps/mobile/src/localization/messages/en.ts apps/mobile/src/localization/messages/ar.ts apps/mobile/src/features/onboarding/FirstLaunchOnboardingScreen.test.tsx apps/mobile/src/state/AppShellProvider.test.tsx apps/mobile/src/features/notifications/notification-response-controller.test.ts
git commit -m "feat(mobile): wire pre-signup reminders"
```

---

### Task 4: Refresh Authoritative Activity and Register an Already-Permitted Device

**Files:**
- Modify: `apps/mobile/src/services/contracts/app-shell-service.ts`
- Modify: `apps/mobile/src/features/auth/auth-flow.ts`
- Modify: `apps/mobile/src/services/live/auth-service.ts`
- Modify: `apps/mobile/src/services/mocks/auth-service.ts`
- Modify: `apps/mobile/src/services/live/engagement-service.ts`
- Modify: `apps/mobile/src/state/AppShellProvider.tsx`
- Test: `apps/mobile/src/services/live/auth-service.test.ts`
- Test: `apps/mobile/src/services/live/engagement-service.test.ts`
- Test: `apps/mobile/src/state/AppShellProvider.test.tsx`
- Test: `apps/api/test/integration/identity/profile-preferences.spec.ts`

**Interfaces:**
- Consumes: existing `GET /api/v1/me`, push permission, Expo token creation, and `POST /api/v1/me/devices/register`.
- Produces: `AuthService.touchActivity()` and `ensureLivePushDeviceRegistration()`.

- [ ] **Step 1: Write failing Mobile activity tests**

```ts
it('touches only the profile endpoint for foreground activity', async () => {
  await service.touchActivity();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/api/v1/me', expect.anything());
});

it('refreshes activity on authenticated foreground without blocking sync', async () => {
  emitAppState?.('active');
  await waitFor(() => expect(authService.touchActivity).toHaveBeenCalledTimes(1));
});
```

Add engagement-service tests showing permission `granted` registers the Expo token once per session and denial does not request permission or register.

- [ ] **Step 2: Write the failing API throttle integration test**

Extend `profile-preferences.spec.ts` to call `GET /api/v1/me` twice within 15 minutes and assert that `last_seen_at` advances at most once, then backdate it and prove a later call advances it.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/live/auth-service.test.ts src/services/live/engagement-service.test.ts src/state/AppShellProvider.test.tsx
cd ../api
node node_modules/jest/bin/jest.js --selectProjects integration --runInBand --runTestsByPath test/integration/identity/profile-preferences.spec.ts
```

Expected: Mobile FAIL because the activity/registration methods do not exist. The API test should demonstrate the already-existing 15-minute throttle and require no production API change.

- [ ] **Step 4: Implement the Mobile lifecycle methods**

Add `touchActivity(): Promise<void>` to `AuthService`; live mode calls only `GET /api/v1/me`, while mock/unavailable modes resolve without network access. Add `ensureLivePushDeviceRegistration()` that checks current permission, obtains the existing registration payload, and calls the existing device endpoint with the existing deterministic token-digest key. Guard one attempt per live Clerk session in `AppShellProvider`.

On authenticated restoration and active foreground, fire-and-forget `touchActivity()` alongside existing sync calls. Failures must be swallowed at this lifecycle boundary and must not cancel financial sync.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the commands from Step 3. Expected: Mobile PASS; API PASS or explicitly DB-gated skip.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- apps/mobile/src/services/contracts/app-shell-service.ts apps/mobile/src/features/auth/auth-flow.ts apps/mobile/src/services/live/auth-service.ts apps/mobile/src/services/mocks/auth-service.ts apps/mobile/src/services/live/engagement-service.ts apps/mobile/src/state/AppShellProvider.tsx apps/mobile/src/services/live/auth-service.test.ts apps/mobile/src/services/live/engagement-service.test.ts apps/mobile/src/state/AppShellProvider.test.tsx apps/api/test/integration/identity/profile-preferences.spec.ts
git commit -m "feat: refresh authenticated app activity"
```

---

### Task 5: Add Reminder Event Types, Templates, Preferences, Indexes, and Daily Job

**Files:**
- Create: `supabase/migrations/20260914090000_user_reminders.sql`
- Create: `supabase/tests/059_user_reminders.sql`
- Modify: `apps/api/src/engagement/engagement.events.ts`
- Modify: `apps/api/src/operations/job-registry.ts`
- Modify: `supabase/migration-checksums.sha256`
- Test: `apps/api/test/security/engagement/engagement-scope.security.spec.ts`
- Test: `apps/api/test/integration/operations/operations-scheduler.integration.spec.ts`

**Interfaces:**
- Consumes: system template seeding, profile preference trigger, and `private.register_job`.
- Produces: `reminder.app_inactive.3d`, `reminder.app_inactive.7d`, `reminder.financial_inactive.7d`, and `notification.reminders.evaluate`.

- [ ] **Step 1: Write failing pgTAP and registry tests**

The pgTAP test must assert:

```sql
select has_index('public', 'profiles', 'profiles_active_last_seen_idx');
select has_index('public', 'transactions', 'transactions_owner_created_active_idx');
select is((select count(*)::integer from public.notification_templates where key in (
  'reminder.app_inactive.3d','reminder.app_inactive.7d','reminder.financial_inactive.7d'
) and locale in ('ar','en') and channel in ('in_app','push') and status='published'), 12);
select is((select (schedule->>'everySeconds')::integer from private.scheduled_jobs where job_key='notification.reminders.evaluate'), 86400);
```

Extend engagement scope and job-registry tests so all three event types and the new job key are accepted.

- [ ] **Step 2: Run migration/registry tests and verify RED**

```powershell
cd apps/api
node node_modules/jest/bin/jest.js --selectProjects security integration --runInBand --runTestsByPath test/security/engagement/engagement-scope.security.spec.ts test/integration/operations/operations-scheduler.integration.spec.ts
cd ../..
npx supabase test db
```

Expected: FAIL because event types, templates, indexes, and job are absent. If local Supabase is unavailable, record the pgTAP command as environment-blocked rather than passed.

- [ ] **Step 3: Add the migration and registries**

The migration must:

```sql
create index profiles_active_last_seen_idx
  on public.profiles(last_seen_at,id) where status='active';
create index transactions_owner_created_active_idx
  on public.transactions(user_id,created_at desc) where deleted_at is null;
```

Insert six localized in-app templates and six localized push templates using the exact copy in the design spec, seed preference rows for existing profiles, and rely on the existing `profiles_seed_notification_preferences` trigger for new profiles. Register `notification.reminders.evaluate` with `everySeconds: 86400`, UTC, retry-safe true, and cancel-safe false. Add the event/job keys to their TypeScript registries.

- [ ] **Step 4: Update migration checksums**

```powershell
cd apps/api
npm run migration:checksums:update
```

- [ ] **Step 5: Run focused migration/registry tests and verify GREEN**

Repeat Step 2. Expected: Jest PASS and pgTAP PASS when Supabase is available.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- supabase/migrations/20260914090000_user_reminders.sql supabase/tests/059_user_reminders.sql supabase/migration-checksums.sha256 apps/api/src/engagement/engagement.events.ts apps/api/src/operations/job-registry.ts apps/api/test/security/engagement/engagement-scope.security.spec.ts apps/api/test/integration/operations/operations-scheduler.integration.spec.ts
git commit -m "feat(api): register reminder notification events"
```

---

### Task 6: Implement Bounded Reminder Eligibility and Deterministic Cycles

**Files:**
- Create: `apps/api/src/engagement/engagement.reminders.ts`
- Modify: `apps/api/src/engagement/engagement.repository.ts`
- Create: `apps/api/test/unit/engagement/engagement-reminders.spec.ts`
- Create: `apps/api/test/integration/engagement/reminder-eligibility.integration.spec.ts`
- Modify: `apps/api/test/performance/engagement/engagement.performance.spec.ts`
- Modify: `apps/api/test/performance/engagement/engagement-queries.sql`

**Interfaces:**
- Produces: `ReminderCandidate`, `reminderSource(candidate)`, and `EngagementRepository.listReminderCandidates(limit)`.
- Consumes: active profiles, push tokens, event-specific preferences, tracking preferences, transactions, and notification history.

- [ ] **Step 1: Write failing pure deterministic-cycle tests**

```ts
it.each([
  [3, 'reminder.app_inactive.3d'],
  [7, 'reminder.app_inactive.7d'],
  [30, 'reminder.app_inactive.7d']
])('selects one inactivity stage at %i days', (days, eventType) => {
  expect(reminderSource(candidate({ kind: 'app', inactiveDays: days })).event_type).toBe(eventType);
});

it('creates the same source id for duplicate evaluation and a new id after reset', () => {
  expect(reminderSource(candidate({ baselineAt: '2026-09-01T00:00:00.000Z' })).source_event_id)
    .toBe(reminderSource(candidate({ baselineAt: '2026-09-01T00:00:00.000Z' })).source_event_id);
  expect(reminderSource(candidate({ baselineAt: '2026-09-02T00:00:00.000Z' })).source_event_id)
    .not.toBe(reminderSource(candidate({ baselineAt: '2026-09-01T00:00:00.000Z' })).source_event_id);
});
```

- [ ] **Step 2: Write failing database eligibility tests**

Cover all required cases with literal server timestamps:

- active user: no candidate;
- 3d inactive: one `3d` candidate;
- 7d inactive: one `7d` candidate, never both;
- notification history with matching cycle/type: no duplicate;
- changed `last_seen_at`: future cycle eligible again;
- disabled push preference: no candidate;
- no unrevoked token: no candidate;
- multiple tokens: one logical candidate;
- recent financial transaction: no candidate;
- 7d financial gap plus recent app activity and tracking enabled: one candidate;
- tracking disabled: no financial candidate;
- newly created transaction changes the financial baseline.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
cd apps/api
node node_modules/jest/bin/jest.js --selectProjects unit integration --runInBand --runTestsByPath test/unit/engagement/engagement-reminders.spec.ts test/integration/engagement/reminder-eligibility.integration.spec.ts
```

Expected: FAIL because the reminder evaluator and repository query do not exist.

- [ ] **Step 4: Implement minimal deterministic mapping and one bounded query**

Use SHA-256 to produce an RFC-4122-compatible stable UUID from:

```ts
`${candidate.userId}:${candidate.eventType}:${candidate.baselineAt}`
```

The repository query must use one bounded union, `clock_timestamp()`, `exists` for push-token availability, enabled event-specific push preferences, and `not exists` against `notification_events` metadata for the same event type and cycle baseline. Financial baseline is `coalesce(max(active transactions.created_at), profiles.created_at)`. Order by baseline and user ID; limit with `MASARIFI_NOTIFICATION_BATCH_SIZE` supplied by the worker.

Return safe source claims with `target_kind: 'home' | 'tracking'` and `cycle_baseline` only. Do not return financial values.

- [ ] **Step 5: Add and verify query-plan protection**

Add EXPLAIN coverage to the existing engagement performance harness and assert the new active-profile and active-transaction indexes are used with a bounded fixture.

- [ ] **Step 6: Run focused tests and verify GREEN**

Repeat Step 3 and run:

```powershell
node node_modules/jest/bin/jest.js --selectProjects performance --runInBand --runTestsByPath test/performance/engagement/engagement.performance.spec.ts
```

Expected: PASS, or DB-gated integration/performance tests explicitly reported as skipped.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- apps/api/src/engagement/engagement.reminders.ts apps/api/src/engagement/engagement.repository.ts apps/api/test/unit/engagement/engagement-reminders.spec.ts apps/api/test/integration/engagement/reminder-eligibility.integration.spec.ts apps/api/test/performance/engagement/engagement.performance.spec.ts apps/api/test/performance/engagement/engagement-queries.sql
git commit -m "feat(api): evaluate reminder eligibility"
```

---

### Task 7: Route Reminder Candidates Through Existing Engagement Ingestion

**Files:**
- Modify: `apps/api/src/engagement/engagement.worker.ts`
- Modify: `apps/api/src/engagement/engagement.repository.ts`
- Create: `apps/api/test/unit/engagement/engagement-reminder-worker.spec.ts`
- Modify: `apps/api/test/integration/engagement/notification-create.integration.spec.ts`
- Modify: `apps/api/test/unit/operations/operations-worker.spec.ts`

**Interfaces:**
- Consumes: Task 5 job key and templates; Task 6 candidates/source claims.
- Produces: `EngagementWorker.runJob('notification.reminders.evaluate')` and reminder notification targets.

- [ ] **Step 1: Write failing worker tests**

```ts
it('ingests each daily reminder candidate through templates and deliveries', async () => {
  repository.listReminderCandidates.mockResolvedValue([candidate]);
  await expect(worker.runJob('notification.reminders.evaluate')).resolves.toBe(1);
  expect(repository.loadSourceTemplates).toHaveBeenCalledWith(expect.objectContaining({
    event_type: 'reminder.app_inactive.3d'
  }));
  expect(repository.createNotificationFromSource).toHaveBeenCalledTimes(1);
});

it('does not call a provider during reminder evaluation', async () => {
  await worker.runJob('notification.reminders.evaluate');
  expect(pushProvider.send).not.toHaveBeenCalled();
});
```

Extend notification-create integration coverage to assert app reminders store `{ targetKind: 'home' }`, financial reminders store `{ targetKind: 'tracking' }`, and concurrent duplicate source IDs insert only one event/delivery set.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd apps/api
node node_modules/jest/bin/jest.js --selectProjects unit integration --runInBand --runTestsByPath test/unit/engagement/engagement-reminder-worker.spec.ts test/integration/engagement/notification-create.integration.spec.ts test/unit/operations/operations-worker.spec.ts
```

Expected: FAIL because the job and reminder target mapping do not exist.

- [ ] **Step 3: Implement job dispatch and target persistence**

Add `notification.reminders.evaluate` to `EngagementJob` and dispatch it to a method that fetches one bounded candidate batch and calls the existing `ingest` method for each claim. Extend `createNotificationFromSource` to use optional source target metadata:

```ts
targetKind: source.target_kind ?? existingDerivedTargetKind,
targetId: source.target_id ?? existingDerivedTargetId,
cycleBaseline: source.cycle_baseline ?? null
```

Keep `source.consume` and automatic transaction event handling unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```powershell
git add -- apps/api/src/engagement/engagement.worker.ts apps/api/src/engagement/engagement.repository.ts apps/api/test/unit/engagement/engagement-reminder-worker.spec.ts apps/api/test/integration/engagement/notification-create.integration.spec.ts apps/api/test/unit/operations/operations-worker.spec.ts
git commit -m "feat(api): queue daily reminder notifications"
```

---

### Task 8: Suppress Stale Reminder Push Deliveries

**Files:**
- Modify: `apps/api/src/engagement/engagement.repository.ts`
- Modify: `apps/api/src/engagement/engagement.worker.ts`
- Create: `apps/api/test/integration/engagement/reminder-delivery-revalidation.integration.spec.ts`
- Modify: `apps/api/test/integration/engagement/notification-dispatch.integration.spec.ts`
- Modify: `apps/api/test/security/engagement/provider-isolation.security.spec.ts`

**Interfaces:**
- Produces: `EngagementRepository.reminderDeliveryEligible(eventId, userId)`.
- Consumes: notification event cycle metadata, current profile activity, tracking preference, ledger creation time, and push preference.

- [ ] **Step 1: Write failing revalidation tests**

Cover these literal state changes between event creation and dispatch:

```ts
it('suppresses app inactivity push after the user returns', async () => {
  await touchProfileAfter(notificationCycleBaseline);
  await worker.runJob('notification.dispatch');
  expect(provider.send).not.toHaveBeenCalled();
  expect(await deliveryStatus()).toEqual({ status: 'suppressed', errorCode: 'REMINDER_STALE' });
});

it('suppresses financial inactivity push after a successful transaction', async () => {
  await createTransactionAfter(notificationCycleBaseline);
  await worker.runJob('notification.dispatch');
  expect(provider.send).not.toHaveBeenCalled();
});
```

Also test preference disabled after queueing, tracking disabled after queueing, provider outage leaving a still-eligible reminder retryable, and ordinary transaction notifications bypassing reminder revalidation unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd apps/api
node node_modules/jest/bin/jest.js --selectProjects integration security --runInBand --runTestsByPath test/integration/engagement/reminder-delivery-revalidation.integration.spec.ts test/integration/engagement/notification-dispatch.integration.spec.ts test/security/engagement/provider-isolation.security.spec.ts
```

Expected: FAIL because queued reminders are not revalidated.

- [ ] **Step 3: Add reminder-only dispatch preflight**

Before calling a provider for a push delivery whose event type begins with `reminder.`, query current eligibility. If false, finish the claim as:

```ts
await repository.finishNotificationDelivery(
  claim.id,
  claim.claim_token,
  'suppressed',
  'REMINDER_STALE'
);
```

Do not apply this branch to in-app history or existing notification types. Do not call an external provider after the preflight rejects the reminder.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS or DB-gated integration skips explicitly reported.

- [ ] **Step 5: Commit Task 8**

```powershell
git add -- apps/api/src/engagement/engagement.repository.ts apps/api/src/engagement/engagement.worker.ts apps/api/test/integration/engagement/reminder-delivery-revalidation.integration.spec.ts apps/api/test/integration/engagement/notification-dispatch.integration.spec.ts apps/api/test/security/engagement/provider-isolation.security.spec.ts
git commit -m "fix(api): suppress stale reminder deliveries"
```

---

### Task 9: Add Separate Mobile Preferences and Registered Reminder Deep Links

**Files:**
- Modify: `apps/mobile/src/domain/notifications.ts`
- Modify: `apps/mobile/src/storage/assistant-notifications-repository.ts`
- Modify: `apps/mobile/src/services/live/engagement-service.ts`
- Modify: `apps/mobile/src/features/notifications/NotificationPreferencesScreen.tsx`
- Modify: `apps/mobile/src/features/notifications/notification-response-controller.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Test: `apps/mobile/src/storage/assistant-notifications-repository.test.ts`
- Test: `apps/mobile/src/services/live/engagement-service.test.ts`
- Test: `apps/mobile/src/features/notifications/NotificationPreferencesScreen.test.tsx`
- Test: `apps/mobile/src/features/notifications/notification-response-controller.test.ts`

**Interfaces:**
- Consumes: reminder event types and Home/Tracking target metadata.
- Produces: `app_inactivity` and `financial_activity` categories plus Home/Tracking targets.

- [ ] **Step 1: Write failing mapping, migration, UI, and deep-link tests**

```ts
it.each([
  ['reminder.app_inactive.3d', 'app_inactivity'],
  ['reminder.app_inactive.7d', 'app_inactivity'],
  ['reminder.financial_inactive.7d', 'financial_activity'],
  ['transaction.created', 'transaction']
])('maps %s to %s', async (eventType, category) => {
  expect(mapNotification(apiNotification({ type: eventType })).category).toBe(category);
});

it('fills new reminder categories when loading an older local preference document', async () => {
  await seedLegacyPreferencesWithoutReminderKeys();
  await expect(repository.loadNotificationPreferences()).resolves.toMatchObject({
    categoryEnabled: { app_inactivity: true, financial_activity: true }
  });
});

it.each([
  [{ kind: 'home' }, '/(tabs)/home'],
  [{ kind: 'tracking' }, '/tracking']
])('opens the existing reminder destination', async (target, route) => {
  notificationService.resolveTarget.mockResolvedValue({ status: 'exact', target });
  await controller.handle({ notificationId, action: 'view' });
  expect(navigate).toHaveBeenCalledWith(route);
});
```

Add UI tests for separate natural labels and saving one reminder category without altering transaction-alert preferences.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/storage/assistant-notifications-repository.test.ts src/services/live/engagement-service.test.ts src/features/notifications/NotificationPreferencesScreen.test.tsx src/features/notifications/notification-response-controller.test.ts
```

Expected: FAIL because categories, target kinds, compatibility normalization, labels, and routes are absent.

- [ ] **Step 3: Implement minimum schema and mapping changes**

Extend `notificationCategorySchema` with `app_inactivity` and `financial_activity`. Extend `notificationTargetSchema` with `{ kind: 'home' }` and `{ kind: 'tracking' }`. Normalize old stored preference objects before strict schema parsing by merging missing new category keys as `true`.

Map reminder event types explicitly before the existing prefix fallback. Map API `targetKind` values `home` and `tracking`. Render localized category labels rather than concatenating raw enum values. Saving remains the existing event-matrix update and changes only push rows whose event type maps to the selected category.

Extend `routeForTarget` with existing routes only:

```ts
if (target.kind === 'home') return '/(tabs)/home';
if (target.kind === 'tracking') return '/tracking';
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Run automatic-transaction regression tests**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/live/engagement-service.test.ts src/services/platform/phone-notification-service.test.ts src/features/notifications/notification-response-controller.test.ts
cd ../api
node node_modules/jest/bin/jest.js --selectProjects unit security integration --runInBand --runTestsByPath test/unit/engagement/notification-providers.spec.ts test/integration/engagement/notification-create.integration.spec.ts test/security/engagement/provider-isolation.security.spec.ts
```

Expected: PASS with canonical `notificationId`, transaction mapping, and transaction deep links unchanged.

- [ ] **Step 6: Commit Task 9**

```powershell
git add -- apps/mobile/src/domain/notifications.ts apps/mobile/src/storage/assistant-notifications-repository.ts apps/mobile/src/services/live/engagement-service.ts apps/mobile/src/features/notifications/NotificationPreferencesScreen.tsx apps/mobile/src/features/notifications/notification-response-controller.ts apps/mobile/src/localization/messages/en.ts apps/mobile/src/localization/messages/ar.ts apps/mobile/src/storage/assistant-notifications-repository.test.ts apps/mobile/src/services/live/engagement-service.test.ts apps/mobile/src/features/notifications/NotificationPreferencesScreen.test.tsx apps/mobile/src/features/notifications/notification-response-controller.test.ts
git commit -m "feat(mobile): expose reminder preferences and routes"
```

---

### Task 10: Complete Cross-Package Verification and Staging Runbook

**Files:**
- Create: `docs/runbooks/user-reminder-staging.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified repository result and a safe staging procedure.

- [ ] **Step 1: Write the staging runbook**

Document exact non-production scenarios:

```md
Scenario A: fresh physical-device install -> onboarding -> grant permission -> inspect two pending local schedules -> authenticate -> confirm both schedules are absent.
Scenario B: staging profile with controlled last_seen_at -> run notification.reminders.evaluate -> run dispatch -> receive push -> tap to Home -> foreground app -> confirm a future evaluator sees a new cycle.
Scenario C: recently active staging profile with tracking enabled and controlled transaction baseline -> evaluate/dispatch once -> tap to Tracking -> create a transaction -> confirm old delivery becomes stale and no duplicate cycle is produced.
```

State that production timestamps/users must never be manipulated and deterministic-provider success is not live push proof.

- [ ] **Step 2: Run focused Mobile verification**

```powershell
cd apps/mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/pre-signup-reminder-service.test.ts src/services/platform/phone-notification-service.test.ts src/features/onboarding/FirstLaunchOnboardingScreen.test.tsx src/state/AppShellProvider.test.tsx src/services/live/auth-service.test.ts src/services/live/engagement-service.test.ts src/storage/assistant-notifications-repository.test.ts src/features/notifications/NotificationPreferencesScreen.test.tsx src/features/notifications/notification-response-controller.test.ts
npm run typecheck
npm run lint -- --quiet
npm run check:app-shell
npm run check:assistant-notifications
```

Expected: all commands PASS.

- [ ] **Step 3: Run focused API verification**

```powershell
cd apps/api
npm run test:engagement:unit
npm run test:engagement:integration
npm run test:engagement:security
node node_modules/jest/bin/jest.js --selectProjects integration unit --runInBand --runTestsByPath test/integration/identity/profile-preferences.spec.ts test/integration/operations/operations-scheduler.integration.spec.ts test/unit/operations/operations-worker.spec.ts
npm run typecheck
npm run lint -- --quiet
npm run migration:checksums
```

Expected: all non-DB-gated commands PASS. Report every database suite that skips because local Supabase is unavailable.

- [ ] **Step 4: Run database and migration verification**

```powershell
cd apps/api
npm run db:lint
npm run test:db
npm run test:migration
```

Expected: PASS with a running local Supabase stack; otherwise report the exact environmental blocker without claiming success.

- [ ] **Step 5: Run final repository checks**

```powershell
cd ../..
git diff --check
git status --short
```

Review only files in this plan plus the pre-existing automatic-transaction notification changes. Confirm no inactivity logic was added outside Mobile lifecycle, identity activity, engagement, operations scheduling, migrations, or notification preferences.

- [ ] **Step 6: Perform physical Android staging checks when credentials are available**

Use a physical Android development/release build, not Expo Go. Record whether a real Expo/FCM push was received and tapped successfully. Do not mark provider delivery complete if credentials, staging services, or the native build are unavailable.

- [ ] **Step 7: Commit Task 10**

```powershell
git add -- docs/runbooks/user-reminder-staging.md
git commit -m "docs: add reminder staging verification"
```
