import {
  privacyRequestSchema,
  representativeSessionSchema,
  securityEventSchema,
  userProfileInputSchema,
  userProfileSchema,
  type LocalDataDeletionResult,
  type PrivacyRequest,
  type RepresentativeSession,
  type SecurityEvent,
  type UserProfile,
  type UserProfileInput
} from '@/domain/settings';
import { isDemoModeEnabled } from '@/config/demo-mode';
import {
  subscriptionOfferCatalogSchema,
  subscriptionOperationSchema,
  subscriptionStateSchema,
  type SubscriptionOffer,
  type SubscriptionOperation,
  type SubscriptionOperationInput,
  type SubscriptionState
} from '@/domain/subscriptions';
import {
  settingsServiceCapability,
  subscriptionServiceCapability,
  type SettingsService,
  type SubscriptionService
} from '@/services/contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import type { CapabilityProviderKind } from '@/services/contracts/capability-contract';
import type { MutationResult } from '@/services/contracts/core-finance-service';
import { resetLocalUserData } from '@/storage/local-data-reset';
import { SubscriptionsRepository } from '@/storage/subscriptions-repository';
import { createSettingsStorage } from '@/storage/settings-storage';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';
import { createAppShellStorage } from '@/storage/app-shell-storage';
import { createLiveIdentityService } from '@/services/live/auth-service';

type Repository = Pick<
  SubscriptionsRepository,
  | 'getState'
  | 'saveState'
  | 'getOperation'
  | 'startOperation'
  | 'completeOperation'
>;
type Outcome = 'success' | 'failure' | 'cancelled';
type Page<T> = { items: T[]; nextCursor: string | null; total: number };

const catalogVersion = '2026-01';
const day = 24 * 60 * 60 * 1000;

export class SubscriptionServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function createMockSubscriptionService({
  repository = new MemorySubscriptionRepository(),
  now = Date.now
}: {
  repository?: Repository;
  now?: () => number;
} = {}): CapabilityProviderHandle<SubscriptionService> & {
  expireCurrentPeriod(
    operationId: string
  ): Promise<MutationResult<SubscriptionOperation>>;
} {
  const catalog = subscriptionOfferCatalogSchema.parse({
    version: catalogVersion,
    offers: [
      offer(
        'free',
        'free',
        'none',
        0,
        { assistantQuestions: 5, reports: 1 },
        false
      ),
      offer(
        'basic-monthly',
        'basic',
        'monthly',
        1900,
        { assistantQuestions: 30, reports: 12 },
        true
      ),
      offer(
        'premium-annual',
        'premium',
        'annual',
        19000,
        { assistantQuestions: 200, reports: 52 },
        true
      )
    ]
  });

  async function ensureState() {
    try {
      return await repository.getState();
    } catch {
      const initial = stateFromOffer(catalog.offers[0], now(), 1, 'free');
      await repository.saveState(initial, null).catch(() => undefined);
      return repository.getState();
    }
  }

  async function getOffer(input: SubscriptionOperationInput) {
    if (input.catalogVersion !== catalog.version)
      throw new SubscriptionServiceError('conflict');
    const selected = catalog.offers.find(
      (item) => item.offerId === input.offerId
    );
    if (!selected) throw new SubscriptionServiceError('validation');
    return selected;
  }

  async function start(
    input: SubscriptionOperationInput,
    expectedVersion: number,
    operationId: string
  ) {
    try {
      const replay = await repository.getOperation(operationId);
      return result(replay, [`subscriptions.operation.${operationId}`]);
    } catch {
      const current = await ensureState();
      if (current.version !== expectedVersion)
        throw new SubscriptionServiceError('conflict');
      const selected = await getOffer(input);
      const operation = subscriptionOperationSchema.parse({
        id: `subscription-operation-${operationId}`,
        operationId,
        kind: input.kind,
        offerId: selected.offerId,
        catalogVersion: catalog.version,
        priorStateVersion: current.version,
        status: 'review',
        requestedAt: now(),
        completedAt: null,
        safeFailure: null,
        resultStateVersion: null
      });
      return result(await repository.startOperation(operation), [
        `subscriptions.operation.${operationId}`
      ]);
    }
  }

  async function complete(operationId: string, outcome: Outcome) {
    const current = await repository.getOperation(operationId).catch(() => {
      throw new SubscriptionServiceError('not_found');
    });
    if (['succeeded', 'failed', 'cancelled'].includes(current.status))
      return result(current, scopesFor(current));
    const existingState = await ensureState();
    const status =
      outcome === 'success'
        ? 'succeeded'
        : outcome === 'failure'
          ? 'failed'
          : 'cancelled';
    const nextState =
      status === 'succeeded'
        ? nextStateFor(current, existingState, now())
        : undefined;
    const completion = subscriptionOperationSchema.parse({
      ...current,
      status,
      completedAt: now(),
      safeFailure:
        status === 'failed'
          ? 'representative_failure'
          : status === 'cancelled'
            ? 'cancelled'
            : null,
      resultStateVersion: nextState?.version ?? null
    });
    return result(
      await repository.completeOperation(completion, nextState),
      scopesFor(completion)
    );
  }

  return {
    metadata: {
      id: 'mock-subscription',
      capability: subscriptionServiceCapability.capability,
      majorVersion: subscriptionServiceCapability.majorVersion,
      kind: 'mock',
      availability: 'available'
    },
    getCatalog: async () => catalog,
    getState: ensureState,
    getOperation: (id: string) => repository.getOperation(id),
    startOperation: start,
    completeMockOperation: complete,
    async expireCurrentPeriod(operationId: string) {
      const current = await ensureState();
      const operation = await start(
        {
          kind: 'renew_mock',
          offerId: current.offerId,
          catalogVersion: current.catalogVersion
        },
        current.version,
        operationId
      );
      if (operation.value.status !== 'review') return operation;
      const selected =
        catalog.offers.find((item) => item.offerId === current.offerId) ??
        catalog.offers[0];
      const expired = subscriptionStateSchema.parse({
        ...stateFromOffer(selected, now(), current.version + 1, 'expired'),
        paidContentAccess: 'read_only',
        accessEndsAt: now()
      });
      const completion = subscriptionOperationSchema.parse({
        ...operation.value,
        status: 'succeeded',
        completedAt: now(),
        resultStateVersion: expired.version
      });
      return result(await repository.completeOperation(completion, expired), [
        `subscriptions.operation.${operationId}`,
        'subscriptions.state'
      ]);
    }
  };
}

export const subscriptionService = createMockSubscriptionService({
  repository: new SubscriptionsRepository()
});

function offer(
  offerId: string,
  plan: SubscriptionOffer['plan'],
  billingPeriod: SubscriptionOffer['billingPeriod'],
  priceMinor: number,
  limits: SubscriptionOffer['limits'],
  eligible: boolean
): SubscriptionOffer {
  return {
    offerId,
    plan,
    billingPeriod,
    priceMinor,
    currency: 'SAR',
    features: ['assistant', 'reports', 'subscriptions.feature.assistant'],
    limits,
    trial: {
      eligible,
      durationDays: eligible ? 7 : 0,
      trialPriceMinor: 0,
      postTrialPriceMinor: priceMinor
    },
    renewalTermsKey: `subscriptions.terms.renewal.${plan}`,
    cancellationTermsKey: `subscriptions.terms.cancellation.${plan}`,
    catalogVersion,
    effectiveAt: Date.UTC(2026, 0, 1)
  };
}

function stateFromOffer(
  offer: SubscriptionOffer,
  at: number,
  version: number,
  statusOverride?: SubscriptionState['status']
): SubscriptionState {
  const status = statusOverride ?? (offer.plan === 'free' ? 'free' : 'active');
  return subscriptionStateSchema.parse({
    plan: offer.plan,
    status,
    offerId: offer.offerId,
    catalogVersion: offer.catalogVersion,
    startedAt: status === 'free' ? null : at,
    trialEndsAt:
      status === 'trialing' ? at + offer.trial.durationDays * day : null,
    renewsAt: ['active', 'cancellation_scheduled'].includes(status)
      ? at + 30 * day
      : null,
    accessEndsAt:
      status === 'cancellation_scheduled'
        ? at + 30 * day
        : status === 'expired'
          ? at
          : null,
    limits: offer.limits,
    version,
    paidContentAccess: ['expired', 'representative_payment_failed'].includes(
      status
    )
      ? 'read_only'
      : 'editable',
    updatedAt: at
  });
}

function nextStateFor(
  operation: SubscriptionOperation,
  current: SubscriptionState,
  at: number
) {
  const selected = catalogOffer(operation.offerId);
  const status =
    operation.kind === 'start_trial' && selected.trial.eligible
      ? 'trialing'
      : operation.kind === 'cancel'
        ? 'cancellation_scheduled'
        : 'active';
  return stateFromOffer(selected, at, current.version + 1, status);
}

function catalogOffer(offerId: string) {
  const selected = [
    offer(
      'free',
      'free',
      'none',
      0,
      { assistantQuestions: 5, reports: 1 },
      false
    ),
    offer(
      'basic-monthly',
      'basic',
      'monthly',
      1900,
      { assistantQuestions: 30, reports: 12 },
      true
    ),
    offer(
      'premium-annual',
      'premium',
      'annual',
      19000,
      { assistantQuestions: 200, reports: 52 },
      true
    )
  ].find((item) => item.offerId === offerId);
  if (!selected) throw new SubscriptionServiceError('validation');
  return selected;
}

function result<T>(
  value: T,
  affectedScopes: readonly string[]
): MutationResult<T> {
  return { value, affectedScopes };
}

function scopesFor(operation: SubscriptionOperation) {
  return operation.status === 'succeeded'
    ? [
        `subscriptions.operation.${operation.operationId}`,
        'subscriptions.state'
      ]
    : [`subscriptions.operation.${operation.operationId}`];
}

class MemorySubscriptionRepository implements Repository {
  private state: SubscriptionState | null = null;
  private operations = new Map<string, SubscriptionOperation>();

  async getState() {
    if (!this.state) throw new Error('not_found');
    return this.state;
  }

  async saveState(input: SubscriptionState, expectedVersion: number | null) {
    if (this.state) throw new Error('state_immutable');
    if (expectedVersion !== null || input.version !== 1)
      throw new Error('conflict');
    this.state = subscriptionStateSchema.parse(input);
    return this.state;
  }

  async getOperation(operationId: string) {
    const operation = this.operations.get(operationId);
    if (!operation) throw new Error('not_found');
    return operation;
  }

  async startOperation(input: SubscriptionOperation) {
    const replay = this.operations.get(input.operationId);
    if (replay) return replay;
    if (!this.state || this.state.version !== input.priorStateVersion)
      throw new Error('conflict');
    const operation = subscriptionOperationSchema.parse(input);
    this.operations.set(operation.operationId, operation);
    return operation;
  }

  async completeOperation(
    input: SubscriptionOperation,
    nextState?: SubscriptionState
  ) {
    const current = await this.getOperation(input.operationId);
    if (['succeeded', 'failed', 'cancelled'].includes(current.status))
      return current;
    const completion = subscriptionOperationSchema.parse(input);
    if (completion.status === 'succeeded') {
      if (
        !nextState ||
        !this.state ||
        nextState.version !== this.state.version + 1
      )
        throw new Error('conflict');
      this.state = subscriptionStateSchema.parse(nextState);
    }
    this.operations.set(completion.operationId, completion);
    return completion;
  }
}

export class SettingsServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function createMockSettingsService({
  now = Date.now,
  clearCurrentSession = async () => undefined,
  deleteLocalData = async (operationId: string) => ({
    deletedRows: 0,
    operationId
  }),
  profileStorage,
  registerForReset = false,
  providerKind = 'mock',
  initialProfile = defaultProfile(),
  initialSessions = defaultSessions(now()),
  securityEvents = () => defaultSecurityEvents(now()),
  createPrivacyRequest = fixturePrivacyRequest
}: {
  now?: () => number;
  clearCurrentSession?: () => void | Promise<void>;
  deleteLocalData?: (
    operationId: string
  ) => Promise<LocalDataDeletionResult & { operationId: string }>;
  profileStorage?: Pick<
    ReturnType<typeof createSettingsStorage>,
    'loadProfile' | 'saveProfile'
  >;
  registerForReset?: boolean;
  providerKind?: CapabilityProviderKind;
  initialProfile?: UserProfile;
  initialSessions?: RepresentativeSession[];
  securityEvents?: () => SecurityEvent[];
  createPrivacyRequest?: (
    kind: PrivacyRequest['kind'],
    operationId: string,
    requestedAt: number
  ) => PrivacyRequest;
} = {}): CapabilityProviderHandle<SettingsService> {
  let profile = userProfileSchema.parse(initialProfile);
  let profileHydration: Promise<void> | null = null;
  const ensureProfile = async () => {
    if (!profileStorage) return;
    profileHydration ??= profileStorage.loadProfile().then((stored) => {
      if (stored) profile = stored;
    });
    await profileHydration;
  };
  const sessions = new Map(
    initialSessions.map((session) => [session.id, session])
  );
  const profileOps = new Map<string, MutationResult<UserProfile>>();
  const sessionOps = new Map<string, MutationResult<RepresentativeSession>>();
  const allSessionOps = new Map<
    string,
    MutationResult<RepresentativeSession[]>
  >();
  const privacyOps = new Map<string, MutationResult<PrivacyRequest>>();
  const deletionOps = new Map<
    string,
    MutationResult<LocalDataDeletionResult>
  >();
  if (registerForReset)
    registerRuntimeUserDataReset(() => {
      profile = userProfileSchema.parse(initialProfile);
      profileHydration = null;
      profileOps.clear();
      sessionOps.clear();
      allSessionOps.clear();
      privacyOps.clear();
      deletionOps.clear();
    });

  return {
    metadata: {
      id: providerKind === 'live' ? 'local-settings' : 'mock-settings',
      capability: settingsServiceCapability.capability,
      majorVersion: settingsServiceCapability.majorVersion,
      kind: providerKind,
      availability: 'available'
    },
    async getProfile() {
      await ensureProfile();
      return profile;
    },
    async saveProfile(
      input: UserProfileInput,
      expectedVersion: number,
      operationId: string
    ) {
      await ensureProfile();
      const replay = profileOps.get(operationId);
      if (replay) return replay;
      const parsed = parseProfileInput(input);
      if (
        parsed.phone !== profile.phone ||
        parsed.googleAccount !== profile.googleAccount
      )
        throw new SettingsServiceError('identity_owner');
      if (profile.version !== expectedVersion)
        throw new SettingsServiceError('conflict');
      const next = userProfileSchema.parse({
        ...parsed,
        version: profile.version + 1
      });
      await profileStorage?.saveProfile(next);
      profile = next;
      const saved = result(profile, [
        'settings.profile',
        'reports.live',
        'assistant.context',
        'notifications.policy'
      ]);
      profileOps.set(operationId, saved);
      return saved;
    },
    async listSessions() {
      return [...sessions.values()];
    },
    async revokeSession(sessionId: string, operationId: string) {
      const replay = sessionOps.get(operationId);
      if (replay) return replay;
      const current = sessions.get(sessionId);
      if (!current) throw new SettingsServiceError('not_found');
      const next = representativeSessionSchema.parse({
        ...current,
        status: 'revoked'
      });
      sessions.set(sessionId, next);
      if (next.isCurrentDevice) await clearCurrentSession();
      const saved = result(next, ['settings.sessions']);
      sessionOps.set(operationId, saved);
      return saved;
    },
    async revokeAllSessions(operationId: string) {
      const replay = allSessionOps.get(operationId);
      if (replay) return replay;
      const next = [...sessions.values()].map((session) =>
        representativeSessionSchema.parse({ ...session, status: 'revoked' })
      );
      next.forEach((session) => sessions.set(session.id, session));
      if (next.some((session) => session.isCurrentDevice))
        await clearCurrentSession();
      const saved = result(next, ['settings.sessions']);
      allSessionOps.set(operationId, saved);
      return saved;
    },
    async listSecurityEvents(cursor?: string): Promise<Page<SecurityEvent>> {
      const events = securityEvents();
      const start = cursor ? Number(cursor) : 0;
      return {
        items: events.slice(start, start + 20),
        nextCursor: start + 20 < events.length ? String(start + 20) : null,
        total: events.length
      };
    },
    async requestPrivacyAction(
      kind: PrivacyRequest['kind'],
      operationId: string
    ) {
      const replay = privacyOps.get(operationId);
      if (replay) return replay;
      const request = createPrivacyRequest(kind, operationId, now());
      const saved = result(request, [`settings.privacy-request.${kind}`]);
      privacyOps.set(operationId, saved);
      return saved;
    },
    async deleteLocalData(operationId: string) {
      const replay = deletionOps.get(operationId);
      if (replay) return replay;
      const deleted = await deleteLocalData(operationId);
      const saved = result({ deletedRows: deleted.deletedRows }, [
        'settings.local-data',
        'notifications.list',
        'assistant.conversations'
      ]);
      deletionOps.set(operationId, saved);
      return saved;
    }
  };
}

export function createProductionSettingsService() {
  if (isDemoModeEnabled())
    return createMockSettingsService({
      deleteLocalData: resetLocalUserData,
      registerForReset: true
    });
  const settingsStorage = createSettingsStorage();
  const shellStorage = createAppShellStorage();
  return createLiveIdentityService({
    loadLocalProfile: settingsStorage.loadProfile,
    saveLocalProfile: settingsStorage.saveProfile,
    loadLocalOnboarding: shellStorage.loadOnboarding,
    saveLocalOnboarding: shellStorage.saveOnboarding
  });
}

export const settingsService = createProductionSettingsService();

function parseProfileInput(input: UserProfileInput) {
  try {
    return userProfileInputSchema.parse(input);
  } catch {
    throw new SettingsServiceError('validation');
  }
}

function defaultProfile(): UserProfile {
  return userProfileSchema.parse({
    name: 'Dana',
    avatar: 'default',
    phone: '+966500000000',
    googleAccount: null,
    email: 'dana@example.com',
    country: 'SA',
    currency: 'SAR',
    timeZone: 'Asia/Riyadh',
    completion: ['identity', 'currency'],
    version: 1
  });
}

function fixturePrivacyRequest(
  kind: PrivacyRequest['kind'],
  operationId: string,
  requestedAt: number
): PrivacyRequest {
  return privacyRequestSchema.parse({
    id: `privacy-${operationId}`,
    operationId,
    kind,
    status: 'accepted',
    requestedAt,
    updatedAt: requestedAt,
    safeFailure: null
  });
}

function defaultSessions(at: number): RepresentativeSession[] {
  return [
    representativeSessionSchema.parse({
      id: 'session-current',
      deviceLabel: 'Pixel 8',
      platform: 'android',
      createdAt: at - day,
      lastActiveAt: at,
      isCurrentDevice: true,
      status: 'active'
    }),
    representativeSessionSchema.parse({
      id: 'session-other',
      deviceLabel: 'Old iPhone',
      platform: 'ios',
      createdAt: at - 2 * day,
      lastActiveAt: at - day,
      isCurrentDevice: false,
      status: 'active'
    })
  ];
}

function defaultSecurityEvents(at: number): SecurityEvent[] {
  return [
    securityEventSchema.parse({
      id: 'event-1',
      type: 'new_session',
      deviceLabel: 'Pixel 8',
      platform: 'android',
      occurredAt: at,
      status: 'succeeded',
      recoveryDestination: { kind: 'security', securityEventId: 'event-1' }
    }),
    securityEventSchema.parse({
      id: 'event-2',
      type: 'access_protection_change',
      deviceLabel: 'Device',
      platform: 'android',
      occurredAt: at - day,
      status: 'pending',
      recoveryDestination: { kind: 'settings', key: 'security' }
    })
  ];
}
