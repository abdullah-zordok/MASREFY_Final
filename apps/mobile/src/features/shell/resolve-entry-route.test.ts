import {
  resolveEntryRoute,
  resolveProtectedAccessGate
} from './resolve-entry-route';
import type {
  AuthenticationSession,
  PrivacyLockPreference
} from '@/domain/app-shell';

const authenticatedSession: AuthenticationSession = {
  status: 'authenticated',
  userId: 'user-live-1',
  method: 'phone',
  issuedAt: 10,
  expiresAt: 20,
  restoration: 'restored'
};

const unlocked: PrivacyLockPreference = {
  pinConfigured: true,
  biometricStatus: 'disabled',
  autoLockDuration: 'immediate',
  invalidAttempts: 0,
  lockedUntil: null,
  appLockStatus: 'unlocked'
};

const base = {
  hydrated: true,
  firstLaunchOnboardingCompleted: true,
  now: 15,
  session: authenticatedSession,
  profileSetupStatus: 'complete' as const,
  privacyLock: unlocked,
  onboarding: null,
  pendingDestination: null
};

describe('resolveEntryRoute', () => {
  test('waits for hydration before evaluating any account state', () => {
    expect(resolveEntryRoute({ ...base, hydrated: false })).toBe('/index');
  });

  test('shows the welcome screen to a signed-out fresh installation', () => {
    expect(
      resolveEntryRoute({
        ...base,
        session: null,
        firstLaunchOnboardingCompleted: false
      })
    ).toBe('/welcome');
  });

  test('shows the Clerk placeholder after the local welcome is seen', () => {
    expect(resolveEntryRoute({ ...base, session: null })).toBe(
      '/(public)/auth-pending'
    );
  });

  test('treats an expired session as signed out', () => {
    expect(resolveEntryRoute({ ...base, now: 21 })).toBe(
      '/(public)/auth-pending'
    );
  });

  test.each(['unknown', 'loading'] as const)(
    'keeps authenticated %s profile setup on the loading route',
    (profileSetupStatus) => {
      expect(resolveEntryRoute({ ...base, profileSetupStatus })).toBe('/index');
    }
  );

  test.each(['incomplete', 'error'] as const)(
    'routes authenticated %s profile setup to the recoverable form',
    (profileSetupStatus) => {
      expect(resolveEntryRoute({ ...base, profileSetupStatus })).toBe(
        '/(onboarding)/profile-setup'
      );
    }
  );

  test('lets a completed account bypass local first-launch state after reinstall', () => {
    expect(
      resolveEntryRoute({
        ...base,
        firstLaunchOnboardingCompleted: false
      })
    ).toBe('/(tabs)/home');
  });

  test('applies the privacy lock only after server profile setup completes', () => {
    expect(
      resolveEntryRoute({
        ...base,
        privacyLock: { ...unlocked, appLockStatus: 'locked' }
      })
    ).toBe('/security/unlock');
    expect(
      resolveEntryRoute({
        ...base,
        profileSetupStatus: 'incomplete',
        privacyLock: { ...unlocked, appLockStatus: 'locked' }
      })
    ).toBe('/(onboarding)/profile-setup');
  });

  test('returns safe pending destinations only for completed accounts', () => {
    expect(
      resolveEntryRoute({ ...base, pendingDestination: '/reports' })
    ).toBe('/reports');
    expect(
      resolveEntryRoute({
        ...base,
        pendingDestination: '/(public)/otp?code=123456'
      })
    ).toBe('/(tabs)/home');
  });

  test('returns only blocking gates for protected layouts', () => {
    expect(resolveProtectedAccessGate(base)).toBeNull();
    expect(
      resolveProtectedAccessGate({
        ...base,
        profileSetupStatus: 'incomplete'
      })
    ).toBe('/(onboarding)/profile-setup');
    expect(
      resolveProtectedAccessGate({ ...base, hydrated: false })
    ).toBe('/');
  });
});
