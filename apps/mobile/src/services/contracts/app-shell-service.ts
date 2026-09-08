import type {
  AuthenticationSession,
  KeywordRule,
  OnboardingProgress,
  PermissionState,
  PrivacyLockPreference,
  TrackingPreference
} from '@/domain/app-shell';
import type { CapabilityContractMetadata } from './capability-contract';

export const authServiceCapability: CapabilityContractMetadata = {
  capability: 'app-shell.auth',
  majorVersion: 1,
  owner: 'app-shell',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'appShell.auth.unavailable'
};

export const onboardingServiceCapability: CapabilityContractMetadata = {
  capability: 'app-shell.onboarding',
  majorVersion: 1,
  owner: 'app-shell',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'appShell.onboarding.unavailable'
};

export const trackingPermissionServiceCapability: CapabilityContractMetadata = {
  capability: 'app-shell.tracking-permission',
  majorVersion: 1,
  owner: 'app-shell',
  providerKinds: ['mock', 'platform'],
  unavailableOutcome: 'appShell.tracking.permissionUnavailable'
};

export const biometricServiceCapability: CapabilityContractMetadata = {
  capability: 'app-shell.biometric',
  majorVersion: 1,
  owner: 'app-shell',
  providerKinds: ['mock', 'platform'],
  unavailableOutcome: 'security.biometric.unavailable'
};

export const appShellStorageCapability: CapabilityContractMetadata = {
  capability: 'app-shell.storage',
  majorVersion: 1,
  owner: 'app-shell',
  providerKinds: ['mock'],
  unavailableOutcome: 'appShell.error.persistenceFailed'
};

export interface PhoneInput {
  countryCode: string;
  phoneValue: string;
}

export interface VerificationInput {
  sessionId: string;
  code: string;
}

export interface ReverificationInput {
  conflictId: string;
  method: 'phone' | 'google';
  verificationToken: string;
}

export interface PhoneVerificationAttempt {
  sessionId: string;
  countryCode: string;
  phoneValue: string;
  codeLength: 6;
  status:
    | 'idle'
    | 'sending'
    | 'sent'
    | 'verifying'
    | 'verified'
    | 'invalid'
    | 'expired'
    | 'rate_limited'
    | 'failed';
  issuedAt: number;
  resendAvailableAt: number;
  invalidAttempts: number;
  replacedBy: string | null;
}

export type AuthResult =
  | { status: 'authenticated'; session: AuthenticationSession }
  | {
      status: 'conflict';
      conflictId: string;
      existingMethod: 'phone' | 'google';
    }
  | { status: 'cancelled' }
  | { status: 'failed'; errorCode: string };

export interface AuthService {
  startPhone(input: PhoneInput): Promise<PhoneVerificationAttempt>;
  verifyPhone(input: VerificationInput): Promise<AuthResult>;
  resendPhone(sessionId: string): Promise<PhoneVerificationAttempt>;
  signInWithGoogle(): Promise<AuthResult>;
  reverifyConflict(input: ReverificationInput): Promise<AuthResult>;
  restoreSession(): Promise<AuthenticationSession>;
  signOut(scope: 'local' | 'all'): Promise<void>;
}

export interface OnboardingService {
  loadProgress(): Promise<OnboardingProgress | null>;
  saveProgress(progress: OnboardingProgress): Promise<void>;
  resetProgress(): Promise<void>;
}

export interface TrackingPermissionService {
  getState(): Promise<PermissionState>;
  requestAfterEducation(): Promise<PermissionState>;
  openSettings(): Promise<void>;
}

export type BiometricKind = 'face' | 'fingerprint';

export interface BiometricAvailability {
  status: 'supported' | 'unsupported' | 'not_enrolled' | 'locked_out';
  /** Present only when hardware is supported and enrolled. */
  kinds?: readonly BiometricKind[];
}

export interface BiometricResult {
  status:
    'authenticated' | 'cancelled' | 'failed' | 'locked_out' | 'unavailable';
}

export interface BiometricService {
  getAvailability(): Promise<BiometricAvailability>;
  authenticate(): Promise<BiometricResult>;
}

export interface AppShellStorage {
  loadSession(): Promise<AuthenticationSession | null>;
  saveSession(session: AuthenticationSession): Promise<void>;
  clearSession(): Promise<void>;
  loadOnboarding(): Promise<OnboardingProgress | null>;
  saveOnboarding(progress: OnboardingProgress): Promise<void>;
  loadKeywords(): Promise<KeywordRule[]>;
  saveKeywords(rules: KeywordRule[]): Promise<void>;
  loadTrackingPreference(): Promise<TrackingPreference | null>;
  saveTrackingPreference(preference: TrackingPreference): Promise<void>;
  loadPendingDestination(): Promise<string | null>;
  savePendingDestination(destination: string | null): Promise<void>;
  loadPrivacyLock(): Promise<PrivacyLockPreference | null>;
  savePrivacyLock(lock: PrivacyLockPreference): Promise<void>;
  clearPrivacyLock(): Promise<void>;
  loadPinCredential(): Promise<string | null>;
  savePinCredential(hash: string): Promise<void>;
  clearPinCredential(): Promise<void>;
  loadProfilePromptDismissed(): Promise<boolean>;
  saveProfilePromptDismissed(dismissed: boolean): Promise<void>;
}
