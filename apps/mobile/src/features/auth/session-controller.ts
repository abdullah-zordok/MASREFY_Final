import { Platform } from 'react-native';

import type { AuthenticationSession } from '@/domain/app-shell';
import {
  createOnboardingProgress,
  routeForOnboardingProgress
} from '@/features/onboarding/onboarding-progress';
import type { PlatformPathInput } from '@/features/onboarding/platform-path';
import { resolvePlatformPath } from '@/features/onboarding/platform-path';
import type { AuthService } from '@/services/contracts/app-shell-service';
import { useAppShellStore } from '@/state/app-shell';

interface CompleteSessionOptions {
  platform?: PlatformPathInput;
  now?: () => number;
}

export async function restoreAppShellSession(
  authService: AuthService,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const session = await authService.restoreSession();
  if (!isCurrent()) return;
  if (session.status === 'authenticated') {
    await useAppShellStore.getState().authenticate(session, isCurrent);
    return;
  }
  if (isCurrent()) await useAppShellStore.getState().signOut();
}

export async function signOutAppShellSession(
  authService: AuthService,
  scope: 'local' | 'all'
): Promise<void> {
  let failure: unknown;
  try {
    await authService.signOut(scope);
  } catch (error) {
    failure = error;
  } finally {
    try {
      await useAppShellStore.getState().signOut();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
}

export async function completeAuthenticatedSession(
  session: AuthenticationSession,
  options: CompleteSessionOptions = {}
): Promise<string> {
  const store = useAppShellStore.getState();
  await store.authenticate(session);
  const onboarding = useAppShellStore.getState().onboarding;
  if (onboarding) {
    return routeForOnboardingProgress(onboarding);
  }
  const platformPath = resolvePlatformPath(
    options.platform ?? {
      os: Platform.OS,
      smsAvailable: Platform.OS === 'android'
    }
  );
  const progress = createOnboardingProgress(platformPath, options.now?.() ?? Date.now());
  await useAppShellStore.getState().setOnboarding(progress);
  return routeForOnboardingProgress(progress);
}
