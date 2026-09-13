import type {
  AuthenticationSession,
  OnboardingProgress,
  PrivacyLockPreference
} from '@/domain/app-shell';
import type { ProfileSetupStatus } from '@/domain/settings';
import { sanitizeReturnRoute } from './navigation-context';

export interface EntryRouteInput {
  hydrated: boolean;
  firstLaunchOnboardingCompleted: boolean;
  profileSetupStatus: ProfileSetupStatus;
  now?: number;
  session: AuthenticationSession | null;
  privacyLock: PrivacyLockPreference | null;
  onboarding: OnboardingProgress | null;
  pendingDestination: string | null;
}

const homeRoute = '/(tabs)/home';

export function resolveEntryRoute(input: EntryRouteInput): string {
  if (!input.hydrated) return '/index';
  if (!isSessionValid(input.session, input.now ?? Date.now())) {
    return input.firstLaunchOnboardingCompleted
      ? '/(public)/auth-pending'
      : '/welcome';
  }
  if (
    input.profileSetupStatus === 'unknown' ||
    input.profileSetupStatus === 'loading'
  )
    return '/index';
  if (
    input.profileSetupStatus === 'incomplete' ||
    input.profileSetupStatus === 'error'
  )
    return '/(onboarding)/profile-setup';
  if (input.privacyLock && input.privacyLock.appLockStatus !== 'unlocked') {
    return '/security/unlock';
  }
  return sanitizeReturnRoute(input.pendingDestination) ?? homeRoute;
}

export function resolveProtectedAccessGate(
  input: EntryRouteInput
): string | null {
  const destination = resolveEntryRoute({ ...input, pendingDestination: null });
  if (destination === '/index') return '/';
  return destination === homeRoute ? null : destination;
}

function isSessionValid(
  session: AuthenticationSession | null,
  now: number
): session is AuthenticationSession & { status: 'authenticated' } {
  return (
    session?.status === 'authenticated' &&
    session.expiresAt !== null &&
    session.expiresAt > now
  );
}
