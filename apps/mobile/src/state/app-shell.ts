import { create } from 'zustand';

import type {
  AuthenticationSession,
  OnboardingProgress,
  PrivacyLockPreference,
  TrackingPreference
} from '@/domain/app-shell';
import {
  applyOnboardingStep,
  type OnboardingStep,
  type StepResult
} from '@/features/onboarding/onboarding-progress';
import { isDemoModeEnabled } from '@/config/demo-mode';
import {
  createClientDemoSession,
  createCompletedDemoOnboarding
} from '@/domain/demo-session';
import { failUnlock, resetLock } from '@/features/security/privacy-lock';
import { createAppShellStorage } from '@/storage/app-shell-storage';
import { synchronizeClientDemoLocale } from '@/services/mocks/client-demo-locale';
import { usePreferenceStore } from '@/state/preferences';
import { resetLocalUserData } from '@/storage/local-data-reset';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';

interface AppShellState {
  hydrated: boolean;
  session: AuthenticationSession | null;
  onboarding: OnboardingProgress | null;
  pendingDestination: string | null;
  privacyLock: PrivacyLockPreference | null;
  profilePromptDismissed: boolean;
  pinCredential: string | null;
  hydrate: (now?: number) => Promise<void>;
  authenticate: (session: AuthenticationSession) => Promise<void>;
  expireSession: () => Promise<void>;
  signOut: () => Promise<void>;
  setOnboarding: (progress: OnboardingProgress) => Promise<void>;
  advanceOnboarding: (
    steps: readonly OnboardingStep[],
    result: StepResult,
    now?: number
  ) => Promise<OnboardingProgress | null>;
  skipOnboarding: (now?: number) => Promise<void>;
  setTrackingPreference: (preference: TrackingPreference) => Promise<void>;
  setPendingDestination: (destination: string | null) => Promise<void>;
  setPrivacyLock: (lock: PrivacyLockPreference) => Promise<void>;
  configurePrivacyLock: (hash: string, now?: number) => Promise<void>;
  recordFailedUnlock: (now: number) => Promise<void>;
  lockNow: () => Promise<void>;
  resetPrivacyLock: () => Promise<void>;
  dismissProfilePrompt: () => Promise<void>;
  reopenProfilePrompt: () => Promise<void>;
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
  profilePromptDismissed: false,
  pinCredential: null
};

export const useAppShellStore = create<AppShellState>((set, get) => ({
  ...initialState,

  hydrate: async (now = Date.now()) => {
    try {
      const demoMode = isDemoModeEnabled();
      if (demoMode && !usePreferenceStore.getState().hydrated)
        await usePreferenceStore.getState().hydrate();
      const locale = usePreferenceStore.getState().locale;
      const [
        storedSession,
        onboarding,
        pendingDestination,
        privacyLock,
        pinCredential,
        profilePromptDismissed
      ] = await Promise.all([
        storage.loadSession(),
        storage.loadOnboarding(),
        storage.loadPendingDestination(),
        storage.loadPrivacyLock(),
        storage.loadPinCredential(),
        storage.loadProfilePromptDismissed(),
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
          privacyLock: null,
          pinCredential,
          profilePromptDismissed
        });
        return;
      }
      set({
        hydrated: true,
        session,
        onboarding,
        pendingDestination,
        privacyLock,
        pinCredential,
        profilePromptDismissed
      });
    } catch {
      set({ ...initialState, hydrated: true, session: signedOutSession });
    }
  },

  authenticate: async (session) => {
    await storage.saveSession(session);
    set({ session });
  },

  expireSession: async () => {
    const session = get().session;
    if (!session || session.status !== 'authenticated') return;
    const expired = { ...session, status: 'expired' as const };
    await storage.saveSession(expired);
    set({ session: expired });
  },

  signOut: async () => {
    const userId = get().session?.userId ?? 'anonymous';
    try {
      await resetLocalUserData(`sign-out-${userId}-${Date.now()}`);
    } finally {
      set({
        session: signedOutSession,
        pendingDestination: null,
        privacyLock: null,
        pinCredential: null
      });
      await Promise.all([
        storage.clearSession(),
        storage.clearPrivacyLock(),
        storage.clearPinCredential(),
        storage.savePendingDestination(null)
      ]);
    }
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

  setPendingDestination: async (pendingDestination) => {
    await storage.savePendingDestination(pendingDestination);
    set({ pendingDestination });
  },

  setPrivacyLock: async (privacyLock) => {
    await storage.savePrivacyLock(privacyLock);
    set({ privacyLock });
  },

  configurePrivacyLock: async (hash, now = Date.now()) => {
    const privacyLock = get().privacyLock ?? resetLock(now);
    await Promise.all([
      storage.savePinCredential(hash),
      storage.savePrivacyLock(privacyLock)
    ]);
    set({ privacyLock, pinCredential: hash });
  },

  recordFailedUnlock: async (now) => {
    const privacyLock = failUnlock(get().privacyLock ?? resetLock(now), now);
    await storage.savePrivacyLock(privacyLock);
    set({ privacyLock });
  },

  lockNow: async () => {
    const privacyLock = get().privacyLock;
    if (!privacyLock) return;
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

  dismissProfilePrompt: async () => {
    await storage.saveProfilePromptDismissed(true);
    set({ profilePromptDismissed: true });
  },

  reopenProfilePrompt: async () => {
    await storage.saveProfilePromptDismissed(false);
    set({ profilePromptDismissed: false });
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

registerRuntimeUserDataReset(() => {
  useAppShellStore.setState({
    ...initialState,
    hydrated: true,
    session: signedOutSession
  });
});
