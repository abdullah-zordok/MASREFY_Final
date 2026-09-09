import { z } from 'zod';

import {
  onboardingSteps,
  type AuthenticationSession,
  type OnboardingProgress
} from '@/domain/app-shell';
import type {
  RepresentativeSession,
  UserProfile,
  UserProfileInput
} from '@/domain/settings';
import {
  authServiceCapability,
  type AuthResult,
  type AuthService,
  type OnboardingService,
  type PhoneInput,
  type PhoneVerificationAttempt,
  type ReverificationInput,
  type VerificationInput
} from '@/services/contracts/app-shell-service';
import {
  settingsServiceCapability,
  type SettingsService
} from '@/services/contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { TrackingError } from '@/services/contracts/automatic-tracking-service';
import { resetLocalUserData } from '@/storage/local-data-reset';
import {
  configureMobileApiTokenProvider,
  HttpError,
  requestJson
} from './http-client';
import { configureAutomaticTrackingTokenProvider } from './automatic-tracking-service';
import { configureAssistantApiTokenProvider } from './assistant-api-service';
import { configureVoiceApiTokenProvider } from './voice-api-service';

type ClerkSession = {
  id: string;
  userId: string;
  method: 'phone' | 'google';
  issuedAt: number;
  expiresAt: number;
};

export interface LiveClerkBridge {
  getSession(): Promise<ClerkSession | null>;
  getToken(options: { skipCache: true }): Promise<string | null>;
  startPhone(input: PhoneInput): Promise<PhoneVerificationAttempt>;
  verifyPhone(input: VerificationInput): Promise<AuthResult>;
  resendPhone(sessionId: string): Promise<PhoneVerificationAttempt>;
  signInWithGoogle(): Promise<ClerkSession | null>;
  reverifyConflict(input: ReverificationInput): Promise<ClerkSession | null>;
  signOut(options: { scope: 'current' | 'all' }): Promise<void>;
}

type IdentityRequest = (
  path: string,
  options?: Omit<RequestInit, 'body'> & { body?: unknown; emptyValue?: unknown }
) => Promise<unknown>;

const profileSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1).max(100).nullable(),
    primaryEmailMasked: z.string().nullable(),
    phoneMasked: z.string().nullable(),
    locale: z.enum(['ar', 'en']),
    timezone: z.string().min(1).max(64),
    status: z.literal('active'),
    version: z.number().int().positive()
  })
  .strict();
const preferencesSchema = z
  .object({
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
    language: z.enum(['ar', 'en']),
    theme: z.enum(['light', 'dark', 'system']),
    calendar: z.enum(['gregorian', 'hijri']),
    weekStart: z.number().int().min(0).max(6),
    privacySettings: z.record(z.boolean()),
    version: z.number().int().positive()
  })
  .strict();
const ownerOnboardingSteps = ['welcome', ...onboardingSteps] as const;
const onboardingSchema = z
  .object({
    step: z.enum(ownerOnboardingSteps),
    completedSteps: z.array(z.enum(ownerOnboardingSteps)).max(12),
    completedAt: z.string().datetime().nullable(),
    version: z.number().int().positive()
  })
  .strict();
const deviceSchema = z
  .object({
    id: z.string().uuid(),
    platform: z.enum(['android', 'ios', 'web']),
    appVersion: z.string().min(1).max(32),
    deviceName: z.string().min(1).max(80).nullable(),
    trusted: z.boolean(),
    lastSeenAt: z.string().datetime(),
    current: z.boolean(),
    revokedAt: z.string().datetime().nullable(),
    version: z.number().int().positive()
  })
  .strict();
const devicePageSchema = z
  .object({
    items: z.array(deviceSchema).max(100),
    nextCursor: z.string().nullable()
  })
  .strict();
const emptySchema = z.null();
const syntheticId = /^(?:mock|demo|fixture|test)(?:[-_]|$)/i;
let registeredBridge: LiveClerkBridge | null = null;

export function registerLiveClerkBridge(bridge: LiveClerkBridge): void {
  registeredBridge = bridge;
  configureMobileApiTokenProvider(getLiveClerkToken);
  configureAssistantApiTokenProvider(getLiveClerkToken);
  configureVoiceApiTokenProvider(getLiveClerkToken);
  configureAutomaticTrackingTokenProvider(async () => {
    const token = await bridge.getToken({ skipCache: true });
    if (!token) throw new TrackingError('permission_required');
    return token;
  });
}

export async function getLiveClerkToken(): Promise<string> {
  const token = await registeredBridge?.getToken({ skipCache: true });
  if (!token) throw new HttpError('session_expired', 401);
  return token;
}

export async function captureLiveClerkIdentity() {
  const bridge = registeredBridge;
  const session = await bridge?.getSession();
  if (!bridge || !session) throw new HttpError('session_expired', 401);
  const assertCurrent = async () => {
    const currentBridge = registeredBridge;
    const current = await currentBridge?.getSession();
    if (
      registeredBridge !== currentBridge ||
      current?.id !== session.id ||
      current.userId !== session.userId
    )
      throw new HttpError('session_expired', 401);
  };
  const token = await bridge.getToken({ skipCache: true });
  if (!token) throw new HttpError('session_expired', 401);
  await assertCurrent();
  return { userId: session.userId, token, assertCurrent };
}

export function registeredLiveAuthService(): CapabilityProviderHandle<AuthService> | null {
  return registeredBridge ? createLiveAuthService(registeredBridge) : null;
}

export function createLiveAuthService(
  bridge: LiveClerkBridge
): CapabilityProviderHandle<AuthService> {
  return {
    metadata: {
      id: 'clerk-auth',
      capability: authServiceCapability.capability,
      majorVersion: authServiceCapability.majorVersion,
      kind: 'live',
      availability: 'available'
    },
    startPhone: (input) => bridge.startPhone(input),
    verifyPhone: (input) => bridge.verifyPhone(input),
    resendPhone: (sessionId) => bridge.resendPhone(sessionId),
    async signInWithGoogle() {
      const session = await bridge.signInWithGoogle();
      return session
        ? { status: 'authenticated', session: authenticated(session) }
        : { status: 'cancelled' };
    },
    async reverifyConflict(input) {
      const session = await bridge.reverifyConflict(input);
      return session
        ? { status: 'authenticated', session: authenticated(session) }
        : { status: 'failed', errorCode: 'verification_failed' };
    },
    async restoreSession() {
      const session = await bridge.getSession();
      return session ? authenticated(session) : signedOut();
    },
    signOut: (scope) =>
      bridge.signOut({ scope: scope === 'all' ? 'all' : 'current' })
  };
}

export function createLiveIdentityService({
  request = defaultIdentityRequest,
  loadLocalProfile = async () => emptyProfile(),
  saveLocalProfile = async () => undefined,
  loadLocalOnboarding = async () => null,
  saveLocalOnboarding = async () => undefined
}: {
  request?: IdentityRequest;
  loadLocalProfile?: () => Promise<UserProfile | null>;
  saveLocalProfile?: (profile: UserProfile) => Promise<void>;
  loadLocalOnboarding?: () => Promise<OnboardingProgress | null>;
  saveLocalOnboarding?: (progress: OnboardingProgress) => Promise<void>;
} = {}): CapabilityProviderHandle<SettingsService & OnboardingService> {
  let onboardingVersion = 1;
  const sessions = new Map<string, RepresentativeSession>();

  async function getProfile(): Promise<UserProfile> {
    const [remote, preferences, local] = await Promise.all([
      parsedRequest(request, '/api/v1/me', profileSchema),
      parsedRequest(request, '/api/v1/me/preferences', preferencesSchema),
      loadLocalProfile()
    ]);
    const merged: UserProfile = {
      ...(local ?? emptyProfile()),
      name: remote.displayName,
      phone: remote.phoneMasked,
      googleAccount: remote.primaryEmailMasked,
      email: remote.primaryEmailMasked,
      currency: preferences.defaultCurrency,
      timeZone: remote.timezone,
      version: remote.version
    };
    await saveLocalProfile(merged);
    return merged;
  }

  async function loadProgress(): Promise<OnboardingProgress | null> {
    const [remote, local] = await Promise.all([
      parsedRequest(request, '/api/v1/me/onboarding', onboardingSchema),
      loadLocalOnboarding()
    ]);
    onboardingVersion = remote.version;
    const completedSteps = remote.completedSteps.filter(isClientOnboardingStep);
    const currentStep = isClientOnboardingStep(remote.step)
      ? remote.step
      : 'tracking_intro';
    const merged: OnboardingProgress = {
      ...(local ?? emptyOnboarding()),
      status: remote.completedAt ? 'completed' : 'in_progress',
      completedSteps,
      currentStep: remote.completedAt ? null : currentStep
    };
    await saveLocalOnboarding(merged);
    return merged;
  }

  async function listSessions(): Promise<RepresentativeSession[]> {
    const devices: z.infer<typeof deviceSchema>[] = [];
    let cursor: string | null = null;
    do {
      const page: z.infer<typeof devicePageSchema> = await parsedRequest(
        request,
        `/api/v1/me/devices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        devicePageSchema
      );
      devices.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    const mapped = devices.map(deviceSession);
    mapped.forEach((session) => sessions.set(session.id, session));
    return mapped;
  }

  return {
    metadata: {
      id: 'live-owner-identity',
      capability: settingsServiceCapability.capability,
      majorVersion: settingsServiceCapability.majorVersion,
      kind: 'live',
      availability: 'available'
    },
    getProfile,
    async saveProfile(
      input: UserProfileInput,
      expectedVersion: number,
      operationId: string
    ) {
      const remote = await parsedRequest(request, '/api/v1/me', profileSchema, {
        method: 'PATCH',
        headers: { 'Idempotency-Key': operationId },
        body: {
          displayName: input.name,
          timezone: input.timeZone,
          expectedVersion
        }
      });
      const next = {
        ...input,
        name: remote.displayName,
        timeZone: remote.timezone,
        version: remote.version
      };
      await saveLocalProfile(next);
      return mutation(next, ['settings.profile']);
    },
    listSessions,
    async revokeSession(sessionId: string, operationId: string) {
      await parsedRequest(
        request,
        `/api/v1/me/devices/${encodeURIComponent(sessionId)}`,
        emptySchema,
        {
          method: 'DELETE',
          headers: { 'Idempotency-Key': operationId },
          emptyValue: null
        }
      );
      const current = sessions.get(sessionId);
      if (!current) throw new HttpError('not_found', 404);
      const revoked = { ...current, status: 'revoked' as const };
      sessions.set(sessionId, revoked);
      return mutation(revoked, ['settings.sessions']);
    },
    async revokeAllSessions() {
      throw new HttpError('provider_unavailable', 503);
    },
    async listSecurityEvents() {
      throw new HttpError('provider_unavailable', 503);
    },
    async requestPrivacyAction() {
      throw new HttpError('provider_unavailable', 503);
    },
    async deleteLocalData(operationId: string) {
      const deleted = await resetLocalUserData(operationId);
      return mutation({ deletedRows: deleted.deletedRows }, [
        'settings.local-data'
      ]);
    },
    loadProgress,
    async saveProgress(progress) {
      const remote = await parsedRequest(
        request,
        '/api/v1/me/onboarding',
        onboardingSchema,
        {
          method: 'PUT',
          headers: { 'Idempotency-Key': `onboarding-${onboardingVersion}` },
          body: {
            step: progress.currentStep ?? 'complete',
            completedSteps: progress.completedSteps,
            complete: progress.status === 'completed',
            expectedVersion: onboardingVersion
          }
        }
      );
      onboardingVersion = remote.version;
      await saveLocalOnboarding(progress);
    },
    async resetProgress() {
      const progress = emptyOnboarding();
      await saveLocalOnboarding(progress);
    }
  };
}

async function defaultIdentityRequest(
  path: string,
  options: Omit<RequestInit, 'body'> & {
    body?: unknown;
    emptyValue?: unknown;
  } = {}
): Promise<unknown> {
  return requestJson(path, z.unknown(), options);
}

async function parsedRequest<T>(
  request: IdentityRequest,
  path: string,
  schema: z.ZodType<T>,
  options?: Omit<RequestInit, 'body'> & { body?: unknown; emptyValue?: unknown }
): Promise<T> {
  const parsed = schema.safeParse(await request(path, options));
  if (!parsed.success) throw new HttpError('contract_mismatch', 502);
  return parsed.data;
}

function authenticated(session: ClerkSession): AuthenticationSession {
  if (
    syntheticId.test(session.id) ||
    syntheticId.test(session.userId) ||
    !session.id ||
    !session.userId ||
    session.expiresAt <= session.issuedAt
  )
    throw new HttpError('contract_mismatch', 502);
  return {
    status: 'authenticated',
    userId: session.userId,
    method: session.method,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    restoration: 'restored'
  };
}

function signedOut(): AuthenticationSession {
  return {
    status: 'signed_out',
    userId: null,
    method: null,
    issuedAt: null,
    expiresAt: null,
    restoration: 'missing'
  };
}

function deviceSession(
  device: z.infer<typeof deviceSchema>
): RepresentativeSession {
  const lastSeenAt = Date.parse(device.lastSeenAt);
  return {
    id: device.id,
    deviceLabel: device.deviceName ?? `${device.platform} device`,
    platform: device.platform,
    createdAt: lastSeenAt,
    lastActiveAt: lastSeenAt,
    isCurrentDevice: device.current,
    status: device.revokedAt ? 'revoked' : 'active'
  };
}

function isClientOnboardingStep(
  value: string
): value is (typeof onboardingSteps)[number] {
  return (onboardingSteps as readonly string[]).includes(value);
}

function emptyProfile(): UserProfile {
  return {
    name: null,
    avatar: 'default',
    phone: null,
    googleAccount: null,
    email: null,
    country: 'SA',
    currency: 'SAR',
    timeZone: 'Asia/Riyadh',
    completion: [],
    version: 1
  };
}

function emptyOnboarding(): OnboardingProgress {
  return {
    platformPath: 'conservative',
    status: 'not_started',
    completedSteps: [],
    skippedSteps: [],
    currentStep: 'tracking_intro',
    permissionEducationSeen: false,
    trackingPreference: null,
    updatedAt: 0
  };
}

function mutation<T>(value: T, affectedScopes: readonly string[]) {
  return { value, affectedScopes };
}
