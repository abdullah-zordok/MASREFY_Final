# First-time Post-auth Profile Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route authenticated first-time Masarifi users through a server-backed name and base-currency setup screen exactly once per account.

**Architecture:** Extend the existing live identity service to load and save one profile-setup snapshot using the current profile, preferences, and onboarding endpoints. Keep the result in the existing app-shell store so the existing entry-route resolver remains the only navigation decision point; mark onboarding `welcome` complete only after profile and currency saves succeed.

**Tech Stack:** Expo Router, React Native, TypeScript, Zustand, Zod, Clerk Expo, Jest, Testing Library, NestJS identity APIs.

**Spec:** `docs/plans/2026-09-13-profile-setup-design.md`

## Global Constraints

- Clerk sessions and bearer tokens remain the only live authentication authority.
- `completedSteps.includes('welcome')` from `/api/v1/me/onboarding` is the account-level completion authority.
- The temporary auth route displays an integration notice and never creates a fake session.
- Reuse `/api/v1/me`, `/api/v1/me/preferences`, and `/api/v1/me/onboarding`; add no dependency or database field.
- Save name, then preferences, then onboarding completion; never navigate before the last response succeeds.
- Preserve entered form values through retry, locale switching, and currency selection.
- Use only currencies already exported by `src/domain/currencies.ts`; fallback to `SAR`.
- Preserve unrelated working-tree changes.

---

### Task 1: Identity service profile-setup contract

**Files:**
- Modify: `apps/mobile/src/domain/settings.ts`
- Modify: `apps/mobile/src/services/contracts/assistant-notifications-service.ts`
- Modify: `apps/mobile/src/services/live/auth-service.ts`
- Modify: `apps/mobile/src/services/mocks/subscription-settings-service.ts`
- Test: `apps/mobile/src/services/live/auth-service.test.ts`

**Interfaces:**
- Produces: `ProfileSetupSnapshot`, `ProfileSetupInput`, `SettingsService.getProfileSetup()`, and `SettingsService.saveProfileSetup(input, snapshot, operationId)`.
- Consumes: existing profile, preferences, onboarding DTOs and `MutationResult`.

- [ ] **Step 1: Write failing service tests**

Add cases asserting that `getProfileSetup()` derives completion only from remote `welcome`, defaults an unsupported currency to `SAR`, and that `saveProfileSetup()` sends `PATCH /me`, `PUT /preferences`, then `PUT /onboarding` with `welcome` preserved and completion last.

```ts
expect(calls.map(({ path }) => path)).toEqual([
  '/api/v1/me',
  '/api/v1/me/preferences',
  '/api/v1/me/onboarding'
]);
expect(onboardingBody.completedSteps).toContain('welcome');
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --dir apps/mobile test -- --runInBand src/services/live/auth-service.test.ts`

Expected: FAIL because the profile-setup methods and types do not exist.

- [ ] **Step 3: Add the minimum domain and service contract**

```ts
export type ProfileSetupSnapshot = {
  profile: UserProfile;
  preferences: OwnerPreferences;
  onboarding: OwnerOnboardingProgress;
  complete: boolean;
};

export type ProfileSetupInput = { name: string; currency: string };
```

Add both methods to `SettingsService`. Implement them in the existing live service using the already parsed responses. `saveProfileSetup` trims and validates the name, preserves every preference and onboarding field, uses operation-specific idempotency keys, and sends onboarding last. The mock implementation updates its existing in-memory profile and reports completion without creating another store.

- [ ] **Step 4: Preserve profile completion during later tracking saves**

Retain whether the loaded remote onboarding contains `welcome`; include it whenever `saveProgress()` writes tracking progress so the existing tracking flow cannot erase profile completion.

```ts
completedSteps: profileSetupComplete
  ? ['welcome', ...progress.completedSteps]
  : progress.completedSteps
```

- [ ] **Step 5: Run the service tests**

Run: `pnpm --dir apps/mobile test -- --runInBand src/services/live/auth-service.test.ts src/services/mocks/subscription-settings-service.test.ts`

Expected: PASS.

### Task 2: Clerk prefill and temporary authentication route

**Files:**
- Modify: `apps/mobile/src/services/live/clerk-provider.tsx`
- Create: `apps/mobile/app/(public)/auth-pending.tsx`
- Modify: `apps/mobile/src/features/onboarding/first-launch-navigation.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Test: `apps/mobile/src/features/onboarding/FirstLaunchEntry.test.tsx`

**Interfaces:**
- Produces: `getLiveClerkDisplayName(): string | null` and route `/(public)/auth-pending`.
- Consumes: Clerk's actual `user.fullName`, `firstName`, and `lastName`.

- [ ] **Step 1: Write failing route and name-fallback tests**

Assert that the welcome CTA opens `/(public)/auth-pending`, the temporary route renders the localized integration notice, and the Clerk name helper chooses full name, then joined first/last names, then null.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/onboarding/FirstLaunchEntry.test.tsx src/services/live/auth-service.test.ts`

Expected: FAIL on the old Home destination and missing helper.

- [ ] **Step 3: Implement the real Clerk name helper**

```ts
export function getLiveClerkDisplayName(): string | null {
  const user = getClerkInstance().user;
  return user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    null;
}
```

- [ ] **Step 4: Add the localized temporary route**

Render one centered information state explaining that Clerk connection is pending. Add this exact maintenance marker above the route component:

```ts
// REMOVE_WITH_CLERK_UI: Delete this temporary route when the real Clerk sign-in/sign-up UI is connected.
```

The route has no continue action and does not call any auth service.

- [ ] **Step 5: Run the focused tests**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/onboarding/FirstLaunchEntry.test.tsx`

Expected: PASS.

### Task 3: One server-authoritative routing boundary

**Files:**
- Modify: `apps/mobile/src/domain/app-shell.ts`
- Modify: `apps/mobile/src/state/app-shell.ts`
- Modify: `apps/mobile/src/features/auth/session-controller.ts`
- Modify: `apps/mobile/src/state/AppShellProvider.tsx`
- Modify: `apps/mobile/src/features/shell/resolve-entry-route.ts`
- Modify: `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/features/shell/resolve-entry-route.test.ts`
- Test: `apps/mobile/src/features/auth/session-controller.test.ts`

**Interfaces:**
- Produces: `ProfileSetupState = 'unknown' | 'loading' | 'incomplete' | 'complete' | 'error'` in the app-shell store.
- Consumes: `SettingsService.getProfileSetup()` and the existing authenticated session.

- [ ] **Step 1: Write the entry-route truth table first**

Cover hydration, signed-out unseen welcome, signed-out seen welcome, authenticated unknown/loading, authenticated incomplete/error, authenticated complete, expired session, reinstall with authenticated completed account, privacy lock, and pending destination.

```ts
expect(resolveEntryRoute(authenticated({ profileSetup: 'incomplete' })))
  .toBe('/(onboarding)/profile-setup');
expect(resolveEntryRoute(authenticated({ profileSetup: 'complete' })))
  .toBe('/(tabs)/home');
```

- [ ] **Step 2: Run routing tests and confirm failure**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/shell/resolve-entry-route.test.ts`

Expected: FAIL because routing does not validate sessions or profile setup.

- [ ] **Step 3: Add profile-setup state to the existing store**

Initialize it to `unknown`, reset it on sign-out, and provide one setter. Demo hydration sets it to `complete`; live authentication sets `loading`, fetches the server snapshot, then stores `complete` or `incomplete`. A fetch failure stores `error` without signing out the valid Clerk session.

- [ ] **Step 4: Restore the single resolver order**

```ts
if (!hydrated) return '/index';
if (!isSessionValid(session, now))
  return firstLaunchOnboardingCompleted ? '/(public)/auth-pending' : '/welcome';
if (profileSetup === 'unknown' || profileSetup === 'loading') return '/index';
if (profileSetup === 'incomplete' || profileSetup === 'error')
  return '/(onboarding)/profile-setup';
if (privacyLock && privacyLock.appLockStatus !== 'unlocked') return '/security/unlock';
return sanitizeReturnRoute(pendingDestination) ?? '/(tabs)/home';
```

- [ ] **Step 5: Test restoration success and failure**

Assert server-complete accounts become `complete`, new accounts become `incomplete`, and a failed check becomes `error` while the authenticated session remains intact.

- [ ] **Step 6: Run routing and restoration tests**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/shell/resolve-entry-route.test.ts src/features/auth/session-controller.test.ts src/features/shell/ProtectedNavigation.test.tsx`

Expected: PASS.

### Task 4: Profile-setup screen and retry-safe submission

**Files:**
- Create: `apps/mobile/app/(onboarding)/profile-setup.tsx`
- Create: `apps/mobile/src/features/onboarding/ProfileSetupScreen.tsx`
- Create: `apps/mobile/src/features/onboarding/profile-setup-controller.ts`
- Modify: `apps/mobile/src/localization/messages/ar.ts`
- Modify: `apps/mobile/src/localization/messages/en.ts`
- Test: `apps/mobile/src/features/onboarding/ProfileSetupScreen.test.tsx`
- Test: `apps/mobile/src/features/onboarding/profile-setup-controller.test.ts`

**Interfaces:**
- Produces: `ProfileSetupScreen` and `submitProfileSetup({ input, snapshot, operationId })`.
- Consumes: `SettingsService.saveProfileSetup`, `getLiveClerkDisplayName`, `supportedCurrencies`, `FormField`, `ActionButton`, and the existing currency selection session.

- [ ] **Step 1: Write controller failure tests**

Assert empty trimmed names are rejected before any request, unsupported currencies are rejected, duplicate submit shares one promise, and failed profile/preferences/onboarding stages preserve the submitted input for retry.

- [ ] **Step 2: Run controller tests and confirm failure**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/onboarding/profile-setup-controller.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the minimal controller**

Validate with the existing supported currency list, keep one in-flight promise, and clear it in `finally`. Return the successful server snapshot; propagate typed HTTP failures for the screen to map.

- [ ] **Step 4: Write screen tests before the component**

Cover all required visible behavior: Arabic copy and RTL alignment; concise English and LTR alignment; Clerk full-name prefill; first/last fallback; backend-name fallback; blank editable name; SAR fallback; supported currency selection; form retention after locale switch; loading state; duplicate CTA press; recoverable load error; save error with retained fields; retry success; and Home navigation only after completion.

- [ ] **Step 5: Run screen tests and confirm failure**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/onboarding/ProfileSetupScreen.test.tsx`

Expected: FAIL because the screen and route do not exist.

- [ ] **Step 6: Implement the reference-aligned screen**

Use a safe-area keyboard-avoiding layout, current theme spacing/type/color tokens, an always-visible `FormField`, the existing selection-session currency route, helper/error text with accessibility roles, and a bottom CTA. Initialize the form only once per loaded snapshot so query refreshes and locale changes never overwrite edits.

- [ ] **Step 7: Complete only after authoritative success**

On success, set app-shell profile setup to `complete`, update the existing local base-currency preference as a cache, and `router.replace('/(tabs)/home')`. On failure, keep the current name/currency and expose a retry action.

- [ ] **Step 8: Run profile-setup tests**

Run: `pnpm --dir apps/mobile test -- --runInBand src/features/onboarding/ProfileSetupScreen.test.tsx src/features/onboarding/profile-setup-controller.test.ts`

Expected: PASS.

### Task 5: Regression verification and device check

**Files:**
- Modify only test expectations that directly encode the restored authentication/profile-setup routing contract.

**Interfaces:**
- Consumes: the completed flow from Tasks 1-4.
- Produces: verified mobile build with no unrelated code changes.

- [ ] **Step 1: Run focused onboarding, routing, and identity suites**

Run:

```powershell
pnpm --dir apps/mobile test -- --runInBand `
  src/services/live/auth-service.test.ts `
  src/features/auth/session-controller.test.ts `
  src/features/shell/resolve-entry-route.test.ts `
  src/features/shell/ProtectedNavigation.test.tsx `
  src/features/onboarding/FirstLaunchEntry.test.tsx `
  src/features/onboarding/ProfileSetupScreen.test.tsx `
  src/features/onboarding/profile-setup-controller.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run static checks**

Run:

```powershell
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the identity API regression suite**

Run: `pnpm --dir apps/api test -- --runInBand identity`

Expected: PASS with no API contract regression.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git diff -- apps/mobile docs/plans docs/superpowers/plans`.

Expected: no whitespace errors, no fake auth identifiers, no local authoritative profile-completion flag, and no unrelated file restored or overwritten.

- [ ] **Step 5: Verify on Android**

Open the app on the connected Android device and verify Arabic RTL and English LTR at normal and large font sizes, keyboard avoidance, currency selection/back navigation, offline retry, duplicate taps, and returning-user bypass. If the live Clerk UI is not connected, verify the temporary auth page physically and exercise post-auth screens with the focused component/integration harness; report the external gate explicitly.
