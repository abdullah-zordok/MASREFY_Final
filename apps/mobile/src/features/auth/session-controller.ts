import { Platform } from 'react-native';
import { resolveClientMode } from '@/config/client-runtime';
import { HttpError } from '@/services/live/http-client';

import type { AuthenticationSession } from '@/domain/app-shell';
import type { ProfileSetupSnapshot } from '@/domain/settings';
import {
  createOnboardingProgress,
  routeForOnboardingProgress
} from '@/features/onboarding/onboarding-progress';
import type { PlatformPathInput } from '@/features/onboarding/platform-path';
import { resolvePlatformPath } from '@/features/onboarding/platform-path';
import type { AuthService } from '@/services/contracts/app-shell-service';
import type { SettingsService } from '@/services/contracts/assistant-notifications-service';
import { settingsService } from '@/services/mocks/subscription-settings-service';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

interface CompleteSessionOptions {
  platform?: PlatformPathInput;
  now?: () => number;
}

export async function restoreAppShellSession(
  authService: AuthService,
  isCurrent: () => boolean = () => true,
  identityService: Pick<SettingsService, 'getProfileSetup'> = settingsService
): Promise<void> {
  let active = true;
  let unavailableSuspension: Promise<void> | undefined;
  const suspendUnavailable = () =>
    (unavailableSuspension ??= useAppShellStore
      .getState()
      .suspendUnavailableRestoration());
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      active = false;
      reject(new Error('bootstrap unavailable'));
    }, 30_000);
  });
  try {
    await Promise.race([
      restoreCurrentSession(
        authService,
        () => active && isCurrent(),
        identityService,
        suspendUnavailable
      ),
      deadline
    ]);
  } catch (error) {
    if (resolveClientMode() === 'live' && isCurrent())
      await suspendUnavailable();
    throw error;
  } finally {
    active = false;
    clearTimeout(timer!);
  }
}

async function restoreCurrentSession(
  authService: AuthService,
  isCurrent: () => boolean,
  identityService: Pick<SettingsService, 'getProfileSetup'>,
  suspendUnavailable: () => Promise<void>
): Promise<void> {
  const session = await authService.restoreSession();
  if (!isCurrent()) return;
  if (session.status === 'authenticated') {
    const currentSession = useAppShellStore.getState().session;
    if (
      currentSession?.status !== 'authenticated' ||
      currentSession.userId !== session.userId
    )
      await useAppShellStore.getState().authenticate(session, isCurrent);
    else useAppShellStore.setState({ session });
    if (!isCurrent()) return;
    useAppShellStore.getState().setProfileSetup('loading');
    let snapshot: ProfileSetupSnapshot;
    try {
      snapshot = await identityService.getProfileSetup();
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof HttpError && error.code === 'session_expired') {
        await useAppShellStore.getState().expireSession();
        if (isCurrent()) useAppShellStore.getState().setProfileSetup('unknown');
      } else useAppShellStore.getState().setProfileSetup('error');
      return;
    }
    if (!isCurrent()) return;
    const preferences = usePreferenceStore.getState();
    // Optional local persistence must not invalidate the server profile.
    await preferences.hydrate().catch(() => undefined);
    if (!isCurrent()) return;
    if (snapshot.profile?.currency) {
      usePreferenceStore
        .getState()
        .setBaseCurrencyCode(snapshot.profile.currency);
    }
    useAppShellStore
      .getState()
      .setProfileSetup(snapshot.complete ? 'complete' : 'incomplete', snapshot);
    return;
  }
  if (isCurrent()) {
    if (resolveClientMode() === 'live') await suspendUnavailable();
    else await useAppShellStore.getState().signOut();
  }
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
  // Live Clerk activation triggers the provider's single bootstrap path.
  if (resolveClientMode() === 'live') {
    const state = useAppShellStore.getState();
    if (
      state.session?.status !== 'authenticated' ||
      state.session.userId !== session.userId ||
      state.profileSetupStatus === 'error' ||
      state.profileSetupStatus === 'unknown'
    )
      state.retryBootstrap();
    return '/';
  }
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
  const progress = createOnboardingProgress(
    platformPath,
    options.now?.() ?? Date.now()
  );
  await useAppShellStore.getState().setOnboarding(progress);
  return routeForOnboardingProgress(progress);
}
