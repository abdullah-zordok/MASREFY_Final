# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Masarifi push activation reflect the real OS permission while preserving the backend event preference matrix and safe payload behavior.

**Architecture:** Keep `expo-notifications` and the existing engagement service as the only push stack. Add one React Query permission source shared by Home and Settings, refresh it on foreground activation, complete the server-event category mapping, and delete UI for preferences that the live delivery path does not consume.

**Tech Stack:** Expo 55, React Native 0.83, TypeScript 5.9, TanStack Query 5, Jest 29.

**Spec:** `docs/superpowers/specs/2026-09-15-mobile-notifications-automatic-tracking-design.md`

## Global Constraints

- Push notifications are Masarifi-to-user messages and never control automatic transaction tracking.
- Preserve the existing Home card rail, Notification Preferences route, Arabic RTL, English LTR, accessibility, spacing, typography, colors, and navigation patterns.
- Use the OS permission as the source of truth; use the backend matrix only for category and quiet-hour preferences.
- Keep remote notification bodies safe and free of raw financial source text.
- Add no dependency and no second push registration path.

---

### Task 1: OS-backed push permission query

**Files:**
- Modify: `apps/mobile/src/services/platform/phone-notification-service.ts`
- Modify: `apps/mobile/src/features/notifications/notification-preferences-queries.ts`
- Test: `apps/mobile/src/services/platform/phone-notification-service.test.ts`
- Test: `apps/mobile/src/features/notifications/notification-preferences-queries.test.ts`

**Interfaces:**
- Consumes: `phoneNotificationService.getPermission()`, `notificationService.requestPermissionAfterEducation()`, and `notificationService.openSystemSettings()`.
- Produces: `notificationPermissionKeys.permission()`, `useNotificationPermission()`, `useRequestNotificationPermission()`, and `useOpenNotificationSettings()`.

- [ ] **Step 1: Write failing permission tests**

Add cases asserting that Expo `status: 'provisional'` maps to `granted`, an undetermined result maps to `not_requested`, and `canAskAgain: false` maps to `permanently_denied`. Add hook tests asserting the permission query calls the platform service and the request mutation invalidates the permission key.

```ts
expect(await service.getPermission()).toBe('granted');
expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
expect(invalidateQueries).toHaveBeenCalledWith({
  queryKey: notificationPermissionKeys.permission()
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- --runInBand src/services/platform/phone-notification-service.test.ts src/features/notifications/notification-preferences-queries.test.ts`

Expected: FAIL because provisional permission is not granted and the permission query key does not exist.

- [ ] **Step 3: Implement the shared query with existing services**

Export `notificationPermissionKeys`, query `phoneNotificationService.getPermission`, make the existing request mutation invalidate both permission and preferences, and expose the existing settings method through a mutation. In `mapPermission`, treat `granted === true` or `status === 'granted' || status === 'provisional'` as granted.

```ts
export const notificationPermissionKeys = {
  permission: () => ['notifications', 'os-permission'] as const
};

export function useNotificationPermission() {
  return useQuery({
    queryKey: notificationPermissionKeys.permission(),
    queryFn: () => phoneNotificationService.getPermission()
  });
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --runInBand src/services/platform/phone-notification-service.test.ts src/features/notifications/notification-preferences-queries.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/platform/phone-notification-service.ts apps/mobile/src/services/platform/phone-notification-service.test.ts apps/mobile/src/features/notifications/notification-preferences-queries.ts apps/mobile/src/features/notifications/notification-preferences-queries.test.ts
git commit -m "fix(mobile): use OS push permission state"
```

### Task 2: Direct Home activation and foreground refresh

**Files:**
- Modify: `apps/mobile/src/features/tracking/TrackingHomeCard.tsx`
- Modify: `apps/mobile/src/features/tracking/TrackingHomeCard.test.tsx`

**Interfaces:**
- Consumes: `useNotificationPermission`, `useRequestNotificationPermission`, `useOpenNotificationSettings`, and React Native `AppState`.
- Produces: Home behavior where askable states request permission, permanent denial opens settings, and granted state hides the push card.

- [ ] **Step 1: Write failing Home tests**

Replace cached-preference expectations with OS-state expectations. Assert `not_requested` invokes the request mutation without navigation, `permanently_denied` invokes settings, `granted` hides the card, and an `active` AppState event refetches permission.

```ts
fireEvent.press(screen.getByText('Enable notifications'));
expect(requestPermission).toHaveBeenCalledTimes(1);
expect(router.push).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the Home test and confirm failure**

Run: `npm test -- --runInBand src/features/tracking/TrackingHomeCard.test.tsx`

Expected: FAIL because the card currently reads cached preferences and navigates to `/notifications/preferences`.

- [ ] **Step 3: Implement direct activation**

Read the shared permission query. Add one `AppState.addEventListener('change', ...)` effect that refetches only on `active`. Choose the CTA action from the current OS state and keep tracking navigation unchanged.

```tsx
const activatePush = () => {
  if (permission.data === 'permanently_denied') openSettings.mutate();
  else requestPermission.mutate();
};
```

- [ ] **Step 4: Run the Home test**

Run: `npm test -- --runInBand src/features/tracking/TrackingHomeCard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/tracking/TrackingHomeCard.tsx apps/mobile/src/features/tracking/TrackingHomeCard.test.tsx
git commit -m "fix(mobile): activate push from Home card"
```

### Task 3: Honest Notification Preferences UI

**Files:**
- Modify: `apps/mobile/src/features/notifications/NotificationPreferencesScreen.tsx`
- Modify: `apps/mobile/src/features/notifications/NotificationPreferencesScreen.test.tsx`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`

**Interfaces:**
- Consumes: the OS permission hooks from Task 1 and backend `NotificationPreferencesInput` for categories and quiet hours.
- Produces: a Phone Notifications row controlled by the OS plus backend-backed category and quiet-hour controls only.

- [ ] **Step 1: Write failing screen tests**

Assert the Phone Notifications switch value comes from OS state, enabling requests permission, permanent denial opens settings, daily/weekly summaries and lock-screen amount controls are absent, and category/quiet-hour saves retain their existing backend values.

```ts
expect(screen.queryByText('Daily summary')).toBeNull();
expect(screen.queryByText('Weekly summary')).toBeNull();
expect(screen.queryByText('Hide amounts on lock screen')).toBeNull();
```

- [ ] **Step 2: Run the screen test and confirm failure**

Run: `npm test -- --runInBand src/features/notifications/NotificationPreferencesScreen.test.tsx`

Expected: FAIL because ineffective controls are rendered and the switch reads `phoneEnabled`.

- [ ] **Step 3: Implement the minimal UI correction**

Remove the ineffective controls and their labels. Bind the switch to `permission.data === 'granted'`; on an off-to-on interaction request permission or open settings. When saving backend preferences, preserve non-rendered schema fields from the loaded object so the API contract remains compatible.

```tsx
<SettingsSwitchRow
  label={t('notifications.preferences.phone')}
  value={permission.data === 'granted'}
  onValueChange={() => activatePush()}
/>
```

- [ ] **Step 4: Run the screen test**

Run: `npm test -- --runInBand src/features/notifications/NotificationPreferencesScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/notifications/NotificationPreferencesScreen.tsx apps/mobile/src/features/notifications/NotificationPreferencesScreen.test.tsx apps/mobile/src/localization/messages/en.ts apps/mobile/src/localization/messages/ar.ts
git commit -m "fix(mobile): show only effective notification settings"
```

### Task 4: Complete server event category mapping

**Files:**
- Modify: `apps/mobile/src/services/live/engagement-service.ts`
- Modify: `apps/mobile/src/services/live/engagement-service.test.ts`

**Interfaces:**
- Consumes: every system-seeded event key in `20260905070527_phase11_notifications.sql` plus current reminder keys.
- Produces: a total `notificationCategory(type: string): NotificationCategory` mapping that never throws for valid backend rows.

- [ ] **Step 1: Write a failing table-driven test**

Load preferences containing all seeded event keys and assert `getPreferences()` succeeds. Include transaction, transfer, balance, ledger, planning salary/obligation/savings, tracking, unsupported, voice, assistant, AI, report, and export families.

```ts
await expect(service.getPreferences()).resolves.toMatchObject({
  categoryEnabled: expect.any(Object)
});
```

- [ ] **Step 2: Run the service test and confirm failure**

Run: `npm test -- --runInBand src/services/live/engagement-service.test.ts`

Expected: FAIL on the first currently unmapped seeded event.

- [ ] **Step 3: Implement one exhaustive prefix mapping**

Map existing product families to the existing enum: transaction/transfer/balance to `transaction`, ledger/system/unsupported/export to `system`, planning salary to `salary`, planning obligation to `obligation`, planning savings to `savings`, tracking to `financial_activity`, voice/assistant/ai to `assistant`, and report to `report`. Keep an explicit `system` fallback so a newly seeded safe backend event does not make preferences unusable.

```ts
if (type.startsWith('planning.salary_')) return 'salary';
if (type.startsWith('planning.obligation_')) return 'obligation';
if (type.startsWith('planning.savings_')) return 'savings';
```

- [ ] **Step 4: Run push tests, typecheck, and lint**

Run: `npm test -- --runInBand src/services/live/engagement-service.test.ts src/services/platform/phone-notification-service.test.ts src/features/notifications/notification-preferences-queries.test.ts src/features/notifications/NotificationPreferencesScreen.test.tsx src/features/tracking/TrackingHomeCard.test.tsx`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/live/engagement-service.ts apps/mobile/src/services/live/engagement-service.test.ts
git commit -m "fix(mobile): map all notification event categories"
```
