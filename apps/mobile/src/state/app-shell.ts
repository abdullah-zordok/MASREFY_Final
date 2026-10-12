import { create } from 'zustand';

import type {
  AuthenticationSession,
  OnboardingProgress,
  PinCredential,
  PrivacyLockPreference,
  TrackingPreference
} from '@/domain/app-shell';
import type {
  ProfileSetupSnapshot,
  ProfileSetupStatus
} from '@/domain/settings';
import {
  applyOnboardingStep,
  type OnboardingStep,
  type StepResult
} from '@/features/onboarding/onboarding-progress';
import { isDemoModeEnabled } from '@/config/demo-mode';
import { resolveClientMode } from '@/config/client-runtime';
import {
  createClientDemoSession,
  createCompletedDemoOnboarding
} from '@/domain/demo-session';
import { createPinLock, failUnlock } from '@/features/security/privacy-lock';
import {
  clearAppShellStorageOwner,
  configureAppShellStorageOwner,
  createAppShellStorage
} from '@/storage/app-shell-storage';
import { synchronizeClientDemoLocale } from '@/services/mocks/client-demo-locale';
import { usePreferenceStore } from '@/state/preferences';
import {
  registerRuntimeUserDataReset,
  resetRuntimeIdentityData
} from '@/storage/runtime-user-data-reset';
import { clearDatabaseOwner, configureDatabaseOwner } from '@/storage/database';
import { clearLegacySmsImportQueue } from '@/storage/sms-import-queue';

interface AppShellState {
  bootstrapRevision: number;
  retryBootstrap: () => void;
  hydrated: boolean;
  session: AuthenticationSession | null;
  onboarding: OnboardingProgress | null;
  pendingDestination: string | null;
  privacyLock: PrivacyLockPreference | null;
  pinCredential: PinCredential | null;
  profilePromptDismissed: boolean;
  trackingHomeCardDismissed: boolean;
  profileSetupStatus: ProfileSetupStatus;
  profileSetupSnapshot: ProfileSetupSnapshot | null;
  hydrate: (now?: number) => Promise<void>;
  authenticate: (
    session: AuthenticationSession,
    isCurrent?: () => boolean
  ) => Promise<void>;
  expireSession: () => Promise<void>;
  signOut: () => Promise<void>;
  suspendUnavailableRestoration: () => Promise<void>;
  setOnboarding: (progress: OnboardingProgress) => Promise<void>;
  advanceOnboarding: (
    steps: readonly OnboardingStep[],
    result: StepResult,
    now?: number
  ) => Promise<OnboardingProgress | null>;
  skipOnboarding: (now?: number) => Promise<void>;
  setTrackingPreference: (preference: TrackingPreference) => Promise<void>;
  setPendingDestination: (
    destination: string | null,
    isCurrent?: () => boolean
  ) => Promise<void>;
  setPrivacyLock: (lock: PrivacyLockPreference) => Promise<void>;
  configurePrivacyLock: (
    credential: PinCredential,
    now?: number
  ) => Promise<void>;
  updatePinCredential: (credential: PinCredential) => Promise<void>;
  recordFailedUnlock: (now: number) => Promise<void>;
  lockNow: () => Promise<void>;
  resetPrivacyLock: () => Promise<void>;
  setProfileSetup: (
    status: ProfileSetupStatus,
    snapshot?: ProfileSetupSnapshot | null
  ) => void;
  dismissProfilePrompt: () => Promise<void>;
  reopenProfilePrompt: () => Promise<void>;
  dismissTrackingHomeCard: () => Promise<void>;
  unlock: () => Promise<void>;
  reset: () => void;
}

const storage = createAppShellStorage();

const signedOutSession: AuthenticationSession = {
  status: 'signed_out',
  userId: null,
  method: null,
  issuedAt: null,
  expiresAt: null,
  restoration: 'idle'
};

const initialState = {
  hydrated: false,
  session: null,
  onboarding: null,
  pendingDestination: null,
  privacyLock: null,
  pinCredential: null,
  profilePromptDismissed: false,
  trackingHomeCardDismissed: false,
  profileSetupStatus: 'unknown' as ProfileSetupStatus,
  profileSetupSnapshot: null as ProfileSetupSnapshot | null
};

export const useAppShellStore = create<AppShellState>((set, get) => ({
  ...initialState,
  bootstrapRevision: 0,
  retryBootstrap: () => {
    if (get().profileSetupStatus === 'loading') return;
    set({
      bootstrapRevision: get().bootstrapRevision + 1,
      profileSetupStatus: 'loading'
    });
  },

  hydrate: async (now = Date.now()) => {
    try {
      const demoMode = isDemoModeEnabled();
      if (!demoMode && resolveClientMode() === 'live') {
        await clearDatabaseOwner();
        clearAppShellStorageOwner();
        set({ ...initialState, hydrated: true, session: signedOutSession });
        return;
      }
      if (demoMode && !usePreferenceStore.getState().hydrated)
        await usePreferenceStore.getState().hydrate();
      const locale = usePreferenceStore.getState().locale;
      const [
        storedSession,
        onboarding,
        pendingDestination,
        privacyLock,
        pinCredential,
        profilePromptDismissed,
        trackingHomeCardDismissed
      ] = await Promise.all([
        storage.loadSession(),
        storage.loadOnboarding(),
        storage.loadPendingDestination(),
        storage.loadPrivacyLock(),
        storage.loadPinCredential(),
        storage.loadProfilePromptDismissed(),
        storage.loadTrackingHomeCardDismissed(),
        demoMode
          ? synchronizeClientDemoLocale(locale, now).catch(() => false)
          : Promise.resolve(false)
      ]);
      const session =
        storedSession?.status === 'authenticated' &&
        storedSession.expiresAt !== null &&
        storedSession.expiresAt <= now
          ? { ...storedSession, status: 'expired' as const }
          : storedSession;
      if (demoMode) {
        const demoSession = createClientDemoSession(now);
        const demoOnboarding = createCompletedDemoOnboarding(now);
        await Promise.all([
          storage.saveSession(demoSession),
          storage.saveOnboarding(demoOnboarding),
          storage.savePendingDestination(null)
        ]);
        set({
          hydrated: true,
          session: demoSession,
          onboarding: demoOnboarding,
          pendingDestination: null,
          privacyLock: lockForLaunch(privacyLock, pinCredential, now),
          pinCredential,
          profilePromptDismissed,
          trackingHomeCardDismissed,
          profileSetupStatus: 'complete',
          profileSetupSnapshot: null
        });
        return;
      }
      set({
        hydrated: true,
        session,
        onboarding,
        pendingDestination,
        privacyLock: lockForLaunch(privacyLock, pinCredential, now),
        pinCredential,
        profilePromptDismissed,
        trackingHomeCardDismissed,
        profileSetupStatus: 'complete',
        profileSetupSnapshot: null
      });
    } catch {
      set({ ...initialState, hydrated: true, session: signedOutSession });
    }
  },

  authenticate: async (session, isCurrent = () => true) => {
    if (!isCurrent()) return;
    const liveMode = resolveClientMode() === 'live';
    if (
      liveMode &&
      session.status === 'authenticated' &&
      /^(?:mock|demo|fixture|test)(?:[-_]|$)/i.test(session.userId ?? '')
    )
      throw new Error('invalid live session');
    if (session.status === 'authenticated' && liveMode) {
      set(initialState);
      await resetRuntimeIdentityData({ restoringOwnerId: session.userId! });
      if (!isCurrent()) return;
      await configureDatabaseOwner(session.userId!);
      if (!isCurrent()) return;
      await configureAppShellStorageOwner(session.userId!);
      if (!isCurrent()) return;
      const [
        onboarding,
        pendingDestination,
        privacyLock,
        pinCredential,
        profilePromptDismissed,
        trackingHomeCardDismissed
      ] = await Promise.all([
        storage.loadOnboarding(),
        storage.loadPendingDestination(),
        storage.loadPrivacyLock(),
        storage.loadPinCredential(),
        storage.loadProfilePromptDismissed(),
        storage.loadTrackingHomeCardDismissed()
      ]);
      if (!isCurrent()) return;
      set({
        hydrated: true,
        session,
        onboarding,
        pendingDestination,
        privacyLock: lockForLaunch(privacyLock, pinCredential, Date.now()),
        pinCredential,
        profilePromptDismissed,
        trackingHomeCardDismissed
      });
      return;
    }
    await storage.saveSession(session);
    set({ hydrated: true, session });
  },

  expireSession: async () => {
    const session = get().session;
    if (!session || session.status !== 'authenticated') return;
    const expired = { ...session, status: 'expired' as const };
    await storage.saveSession(expired);
    set({ session: expired });
  },

  suspendUnavailableRestoration: async () => {
    set({ ...initialState, hydrated: true, session: signedOutSession });
    clearAppShellStorageOwner();
    await Promise.all([
      clearDatabaseOwner(),
      resetRuntimeIdentityData({ kind: 'restore-unavailable' })
    ]);
  },

  signOut: async () => {
    const ownerId = get().session?.userId;
    set({
      hydrated: true,
      session: signedOutSession,
      onboarding: null,
      pendingDestination: null,
      privacyLock: null,
      pinCredential: null,
      profilePromptDismissed: false,
      trackingHomeCardDismissed: false,
      profileSetupStatus: 'unknown',
      profileSetupSnapshot: null
    });
    await Promise.all([
      storage.clearSession(),
      (async () => {
        try {
          await clearDatabaseOwner(
            ownerId && resolveClientMode() === 'live' ? ownerId : undefined
          );
        } finally {
          await clearLegacySmsImportQueue();
        }
      })(),
      resetRuntimeIdentityData()
    ]);
    clearAppShellStorageOwner();
  },

  setOnboarding: async (onboarding) => {
    await storage.saveOnboarding(onboarding);
    set({ onboarding });
  },

  advanceOnboarding: async (steps, result, now = Date.now()) => {
    let onboarding = get().onboarding;
    if (!onboarding) return null;
    for (const step of steps) {
      onboarding = applyOnboardingStep(onboarding, step, result, now);
    }
    await storage.saveOnboarding(onboarding);
    set({ onboarding });
    return onboarding;
  },

  skipOnboarding: async (now = Date.now()) => {
    const onboarding = get().onboarding;
    if (!onboarding) return;
    const skipped = {
      ...onboarding,
      status: 'skipped' as const,
      currentStep: null,
      updatedAt: now
    };
    await storage.saveOnboarding(skipped);
    set({ onboarding: skipped });
  },

  setTrackingPreference: async (trackingPreference) => {
    const onboarding = get().onboarding;
    await storage.saveTrackingPreference(trackingPreference);
    if (!onboarding) return;
    const updated = { ...onboarding, trackingPreference };
    await storage.saveOnboarding(updated);
    set({ onboarding: updated });
  },

  setPendingDestination: async (pendingDestination, isCurrent = () => true) => {
    if (!isCurrent()) return;
    await storage.savePendingDestination(pendingDestination);
    if (isCurrent()) set({ pendingDestination });
  },

  setPrivacyLock: async (privacyLock) => {
    await storage.savePrivacyLock(privacyLock);
    set({ privacyLock });
  },

  configurePrivacyLock: async (pinCredential, now = Date.now()) => {
    const existing = get().privacyLock;
    const privacyLock = existing
      ? { ...existing, pinConfigured: true }
      : createPinLock(now);
    await Promise.all([
      storage.savePinCredential(pinCredential),
      storage.savePrivacyLock(privacyLock)
    ]);
    set({ privacyLock, pinCredential });
  },

  updatePinCredential: async (pinCredential) => {
    await storage.savePinCredential(pinCredential);
    set({ pinCredential });
  },

  recordFailedUnlock: async (now) => {
    const privacyLock = failUnlock(
      get().privacyLock ?? createPinLock(now),
      now
    );
    await storage.savePrivacyLock(privacyLock);
    set({ privacyLock });
  },

  lockNow: async () => {
    const privacyLock = get().privacyLock;
    if (!privacyLock || privacyLock.appLockStatus === 'locked') return;
    const locked = { ...privacyLock, appLockStatus: 'locked' as const };
    await storage.savePrivacyLock(locked);
    set({ privacyLock: locked });
  },

  resetPrivacyLock: async () => {
    await Promise.all([
      storage.clearPrivacyLock(),
      storage.clearPinCredential()
    ]);
    set({ privacyLock: null, pinCredential: null });
  },

  setProfileSetup: (profileSetupStatus, profileSetupSnapshot = null) => {
    set({ profileSetupStatus, profileSetupSnapshot });
  },

  dismissProfilePrompt: async () => {
    await storage.saveProfilePromptDismissed(true);
    set({ profilePromptDismissed: true });
  },

  reopenProfilePrompt: async () => {
    await storage.saveProfilePromptDismissed(false);
    set({ profilePromptDismissed: false });
  },

  dismissTrackingHomeCard: async () => {
    await storage.saveTrackingHomeCardDismissed(true);
    set({ trackingHomeCardDismissed: true });
  },

  unlock: async () => {
    const privacyLock = get().privacyLock;
    if (!privacyLock) return;
    const unlocked = {
      ...privacyLock,
      invalidAttempts: 0,
      lockedUntil: null,
      appLockStatus: 'unlocked' as const
    };
    await storage.savePrivacyLock(unlocked);
    set({ privacyLock: unlocked });
  },

  reset: () => {
    set(initialState);
  }
}));

function lockForLaunch(
  privacyLock: PrivacyLockPreference | null,
  pinCredential: PinCredential | null,
  now: number
): PrivacyLockPreference | null {
  if (!privacyLock) return pinCredential ? createPinLock(now) : null;
  if (
    !pinCredential &&
    !privacyLock.pinConfigured &&
    privacyLock.biometricStatus !== 'enabled'
  )
    return null;

  const lockoutExpired =
    pinCredential !== null &&
    privacyLock.lockedUntil !== null &&
    privacyLock.lockedUntil <= now;
  const lockoutActive =
    pinCredential !== null &&
    privacyLock.invalidAttempts >= 5 &&
    privacyLock.lockedUntil !== null &&
    privacyLock.lockedUntil > now;
  return {
    ...privacyLock,
    pinConfigured: pinCredential !== null,
    invalidAttempts:
      pinCredential && !lockoutExpired ? privacyLock.invalidAttempts : 0,
    lockedUntil:
      pinCredential && !lockoutExpired ? privacyLock.lockedUntil : null,
    appLockStatus: lockoutActive ? 'temporarily_locked' : 'locked'
  };
}

registerRuntimeUserDataReset(() => {
  useAppShellStore.setState({
    ...initialState,
    hydrated: true,
    session: signedOutSession
  });
});
