import { AppRegistry, Platform } from 'react-native';
import { registerTrackingNotificationTask } from './platform/tracking-notification-task';
import type { TokenCache } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { trackingNativeRuntime } from './platform/tracking-native-runtime.android';
import { resolveClientRuntime } from '@/config/client-runtime';
import { configureDatabaseOwner } from '@/storage/database';
import {
  registerRuntimeIdentityReset,
  registerRuntimeUserDataReset
} from '@/storage/runtime-user-data-reset';
import {
  captureLiveClerkIdentity,
  registerLiveClerkBridge
} from './live/auth-service';
import { useAppShellStore } from '@/state/app-shell';
import {
  trackingSourcePreferences,
  invalidateTrackingConsent,
  trackingConsentEpoch
} from './tracking-source-preferences';
import type { SmsRuleSnapshot } from '@/storage/sms-import-queue';
import { compileFinancialDiscoveryPolicy } from '@masarifi/transaction-parser';

const contextKey = 'masarifi.tracking.background-context.v2';
const clerkSessionCache: TokenCache = {
  getToken: (key) => SecureStore.getItemAsync(`masarifi.clerk.${key}`),
  saveToken: (key, value) =>
    SecureStore.setItemAsync(`masarifi.clerk.${key}`, value),
  clearToken: (key) => SecureStore.deleteItemAsync(`masarifi.clerk.${key}`)
};
let nativeMutation: Promise<void> = Promise.resolve();
let nativeGeneration = 0;
let restorationBlocked = false;
function serializeNative(change: () => Promise<void>): Promise<void> {
  const operation = nativeMutation.then(change, change);
  nativeMutation = operation.catch(() => undefined);
  return operation;
}
export async function configureTrackingBackground(
  ownerId: string,
  rules: SmsRuleSnapshot,
  mode?: string,
  expectedEpoch = trackingConsentEpoch()
): Promise<void> {
  const expectedGeneration = nativeGeneration;
  return serializeNative(async () => {
    const current = () =>
      !restorationBlocked &&
      expectedGeneration === nativeGeneration &&
      expectedEpoch === trackingConsentEpoch() &&
      useAppShellStore.getState().session?.userId === ownerId;
    if (!current()) return;
    if (
      Platform.OS !== 'android' ||
      !trackingNativeRuntime?.configureTrackingOwner
    )
      return;
    const sources = await trackingSourcePreferences.load();
    const raw = await SecureStore.getItemAsync(contextKey);
    const stored = raw
      ? (JSON.parse(raw) as { ownerId: string; generation: string })
      : null;
    const generation =
      stored?.ownerId === ownerId ? stored.generation : Crypto.randomUUID();
    const ownerDigest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      ownerId
    );
    const packages = rules.senders
      .filter(
        (s) =>
          s.enabled &&
          s.trusted &&
          /^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(s.normalizedSender)
      )
      .map((s) => s.normalizedSender);
    if (!current()) return;
    await SecureStore.setItemAsync(
      contextKey,
      JSON.stringify({ ownerId, generation })
    );
    await trackingNativeRuntime.configureTrackingOwner(
      ownerDigest,
      generation,
      !rules.requiresRefresh && mode !== 'paused' && sources.smsEnabled,
      !rules.requiresRefresh &&
        mode !== 'paused' &&
        sources.notificationEnabled,
      packages,
      rules.senders
        .filter(
          (s) =>
            !s.enabled && /^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(s.normalizedSender)
        )
        .map((s) => s.normalizedSender),
      rules.snapshot
        ? JSON.stringify(
            compileFinancialDiscoveryPolicy(rules.snapshot, rules.keywords)
          )
        : null
    );
    if (!current()) {
      await trackingNativeRuntime.suspendTrackingOwner();
      return;
    }
    await registerTrackingNotificationTask('masarifi-tracking-confirmation-v2');
  });
}
export async function disableTrackingBackground(
  preserveNotifications = false
): Promise<void> {
  nativeGeneration++;
  return serializeNative(async () => {
    if (preserveNotifications && trackingNativeRuntime?.suspendTrackingOwner)
      await trackingNativeRuntime.suspendTrackingOwner();
    else {
      await trackingNativeRuntime?.clearTrackingOwner?.();
      await SecureStore.deleteItemAsync(contextKey);
    }
  });
}
async function restoreTrackingBackground(ownerId: string): Promise<void> {
  const generation = ++nativeGeneration;
  restorationBlocked = true;
  return serializeNative(async () => {
    try {
      const raw = await SecureStore.getItemAsync(contextKey);
      let stored: { ownerId: string; generation: string } | null = null;
      if (raw !== null) {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error();
        const candidate = value as Record<string, unknown>;
        if (
          Object.keys(candidate).sort().join(',') !== 'generation,ownerId' ||
          typeof candidate.ownerId !== 'string' ||
          candidate.ownerId.length < 1 ||
          candidate.ownerId.length > 256 ||
          typeof candidate.generation !== 'string' ||
          candidate.generation.length < 16 ||
          candidate.generation.length > 80
        )
          throw new Error();
        stored = candidate as { ownerId: string; generation: string };
      }
      if (generation !== nativeGeneration) throw new Error();
      if (Platform.OS === 'android') {
        if (!trackingNativeRuntime?.restoreTrackingOwner) throw new Error();
        const ownerDigest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          ownerId
        );
        if (generation !== nativeGeneration) throw new Error();
        const outcome = await trackingNativeRuntime.restoreTrackingOwner(
          ownerDigest,
          stored?.ownerId === ownerId ? stored.generation : null
        );
        if (!['PRESERVED', 'CLEARED', 'EMPTY'].includes(outcome))
          throw new Error();
      }
      if (generation !== nativeGeneration) throw new Error();
      if (stored && stored.ownerId !== ownerId)
        await SecureStore.deleteItemAsync(contextKey);
      if (generation !== nativeGeneration) throw new Error();
      restorationBlocked = false;
    } catch {
      // An ambiguous restoration must not fall back to destructive sign-out.
      // Keep durable notifications and make native intake dormant instead.
      await trackingNativeRuntime?.suspendTrackingOwner?.();
      throw new Error('tracking_restore_unavailable');
    }
  });
}

registerRuntimeIdentityReset((context) => {
  invalidateTrackingConsent();
  if (context && 'restoringOwnerId' in context)
    return restoreTrackingBackground(context.restoringOwnerId);
  restorationBlocked = true;
  if (context?.kind === 'restore-unavailable') {
    nativeGeneration++;
    return serializeNative(async () => {
      if (Platform.OS !== 'android') return;
      if (!trackingNativeRuntime?.suspendTrackingOwner)
        throw new Error('tracking_restore_unavailable');
      await trackingNativeRuntime.suspendTrackingOwner();
    });
  }
  return disableTrackingBackground();
});
registerRuntimeUserDataReset(() => {
  invalidateTrackingConsent();
  restorationBlocked = true;
  return disableTrackingBackground();
});

export async function runTrackingBackground(input: {
  ownerDigest?: string;
  generation?: string;
}): Promise<void> {
  if (restorationBlocked) return;
  const generation = nativeGeneration;
  const current = () => !restorationBlocked && generation === nativeGeneration;
  const runtime = resolveClientRuntime();
  if (runtime.mode !== 'live') return;
  const raw = await SecureStore.getItemAsync(contextKey);
  if (!raw || !current()) return;
  const context = JSON.parse(raw) as { ownerId: string; generation: string };
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    context.ownerId
  );
  if (input.generation !== context.generation || input.ownerDigest !== digest)
    return;
  try {
    const identity = await captureLiveClerkIdentity();
    if (identity.userId !== context.ownerId) return;
  } catch {
    if (!current()) return;
    const { getClerkInstance } = await import('@clerk/expo');
    const clerk = getClerkInstance({
      publishableKey: runtime.clerkPublishableKey!,
      tokenCache: clerkSessionCache
    });
    if (!clerk.loaded) await clerk.load({ standardBrowser: false });
    if (
      clerk.session?.user?.id !== context.ownerId ||
      !(await clerk.session?.getToken({ skipCache: true }))
    )
      return;
    if (
      (await SecureStore.getItemAsync(contextKey)) !== raw ||
      !current() ||
      (useAppShellStore.getState().session?.userId &&
        useAppShellStore.getState().session?.userId !== context.ownerId)
    )
      return;
    const interactive = async (): Promise<never> => {
      throw new Error('tracking_interactive_auth_unavailable');
    };
    registerLiveClerkBridge({
      async getSession() {
        const session = clerk.session;
        if (!session || session.user.id !== context.ownerId) return null;
        return {
          id: session.id,
          userId: session.user.id,
          method: 'google',
          issuedAt: session.lastActiveAt.getTime(),
          expiresAt: session.expireAt.getTime()
        };
      },
      getToken: (options) =>
        clerk.session?.getToken(options) ?? Promise.resolve(null),
      startPhone: interactive,
      verifyPhone: interactive,
      resendPhone: interactive,
      signInWithGoogle: interactive,
      reverifyConflict: interactive,
      signOut: interactive
    });
    await configureDatabaseOwner(context.ownerId);
    if ((await SecureStore.getItemAsync(contextKey)) !== raw || !current())
      return;
    useAppShellStore.setState({
      session: {
        status: 'authenticated',
        userId: context.ownerId,
        method: 'google',
        issuedAt: clerk.session.lastActiveAt.getTime(),
        expiresAt: clerk.session.expireAt.getTime(),
        restoration: 'restored'
      }
    });
  }
  if ((await SecureStore.getItemAsync(contextKey)) !== raw || !current())
    return;
  const { syncAutomaticTracking } =
    await import('./automatic-tracking-coordinator');
  if (!current()) return;
  const result = await syncAutomaticTracking();
  if (['processing', 'queued', 'error'].includes(result.status))
    throw new Error('tracking_background_retry');
}
export function registerTrackingHeadlessTask(): void {
  AppRegistry.registerHeadlessTask('MasarifiTracking', () => async (input) => {
    try {
      await runTrackingBackground(input);
      await trackingNativeRuntime?.finishTrackingWork?.(input.workId, true);
    } catch {
      await trackingNativeRuntime?.finishTrackingWork?.(input.workId, false);
    }
  });
}
