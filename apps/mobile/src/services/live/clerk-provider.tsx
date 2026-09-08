import {
  ClerkProvider,
  getClerkInstance,
  useAuth,
  useSignIn,
  useSignUp,
  useSSO,
  type TokenCache
} from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { resolveClientRuntime } from '@/config/client-runtime';
import type {
  AuthResult,
  PhoneVerificationAttempt
} from '@/services/contracts/app-shell-service';
import { registerLiveClerkBridge, type LiveClerkBridge } from './auth-service';
import { classifyPhoneVerificationError } from './clerk-errors';

type PendingPhoneAttempt = {
  countryCode: string;
  phoneValue: string;
  verify(code: string): Promise<{
    sessionId: string;
    userId: string;
    issuedAt: number;
    expiresAt: number;
  }>;
  resend(): Promise<void>;
};

const clerkCache: TokenCache = {
  getToken: (key) => SecureStore.getItemAsync(`masarifi.clerk.${key}`),
  saveToken: (key, token) =>
    SecureStore.setItemAsync(`masarifi.clerk.${key}`, token),
  clearToken: (key) => SecureStore.deleteItemAsync(`masarifi.clerk.${key}`)
};
const LiveClerkSessionContext = createContext<string | null | undefined>(
  undefined
);

export const useLiveClerkSessionKey = () =>
  useContext(LiveClerkSessionContext);

export function MobileIdentityProvider({ children }: { children: ReactNode }) {
  const runtime = resolveClientRuntime();
  if (runtime.mode !== 'live')
    return (
      <LiveClerkSessionContext.Provider value="demo">
        {children}
      </LiveClerkSessionContext.Provider>
    );
  return (
    <ClerkProvider
      publishableKey={runtime.clerkPublishableKey!}
      tokenCache={clerkCache}
    >
      <LiveClerkRuntime>{children}</LiveClerkRuntime>
    </ClerkProvider>
  );
}

function LiveClerkRuntime({ children }: { children: ReactNode }) {
  const [sessionKey, setSessionKey] = useState<string | null>();
  return (
    <LiveClerkSessionContext.Provider value={sessionKey}>
      <ClerkBridgeInstaller onSessionKey={setSessionKey} />
      {children}
    </LiveClerkSessionContext.Provider>
  );
}

function ClerkBridgeInstaller({
  onSessionKey
}: {
  onSessionKey: (sessionKey: string | null) => void;
}) {
  const auth = useAuth();
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const { startSSOFlow } = useSSO();
  const attempts = useRef(new Map<string, PendingPhoneAttempt>());
  const lastMethod = useRef<'phone' | 'google'>('google');

  const currentSession = (): LiveClerkBridge extends {
    getSession(): Promise<infer T>;
  }
    ? T
    : never => {
    if (!auth.isSignedIn) return null;
    const claims = auth.sessionClaims as { iat?: number; exp?: number };
    if (!claims.iat || !claims.exp || claims.exp <= claims.iat) return null;
    return {
      id: auth.sessionId,
      userId: auth.userId,
      method: lastMethod.current,
      issuedAt: claims.iat * 1_000,
      expiresAt: claims.exp * 1_000
    };
  };

  const bridge: LiveClerkBridge = {
    getSession: async () => currentSession(),
    getToken: (options) => auth.getToken(options),
    async startPhone({ countryCode, phoneValue }) {
      const identifier = `${countryCode}${phoneValue}`;
      const attemptId = Crypto.randomUUID();
      try {
        const signIn = signInState.signIn;
        const created = await signIn.create({ identifier });
        if (created.error) throw created.error;
        const sent = await signIn.phoneCode.sendCode({
          phoneNumber: identifier
        });
        if (sent.error) throw sent.error;
        attempts.current.set(attemptId, {
          countryCode,
          phoneValue,
          async verify(code) {
            const verified = await signIn.phoneCode.verifyCode({ code });
            if (verified.error) throw verified.error;
            if (signIn.status !== 'complete' || !signIn.createdSessionId)
              throw new Error('phone verification incomplete');
            const finalized = await signIn.finalize();
            if (finalized.error) throw finalized.error;
            const clerk = getClerkInstance();
            const userId = clerk.user?.id;
            if (!userId) throw new Error('Clerk user missing');
            const session = clerk.session;
            if (!session || session.id !== signIn.createdSessionId)
              throw new Error('Clerk session missing');
            return {
              sessionId: signIn.createdSessionId,
              userId,
              issuedAt: session.lastActiveAt.getTime(),
              expiresAt: session.expireAt.getTime()
            };
          },
          async resend() {
            const resent = await signIn.phoneCode.sendCode();
            if (resent.error) throw resent.error;
          }
        });
      } catch (error) {
        if (!isIdentifierNotFound(error)) throw error;
        const signUp = signUpState.signUp;
        const created = await signUp.create({ phoneNumber: identifier });
        if (created.error) throw created.error;
        const sent = await signUp.verifications.sendPhoneCode();
        if (sent.error) throw sent.error;
        attempts.current.set(attemptId, {
          countryCode,
          phoneValue,
          async verify(code) {
            const verified = await signUp.verifications.verifyPhoneCode({
              code
            });
            if (verified.error) throw verified.error;
            if (
              signUp.status !== 'complete' ||
              !signUp.createdSessionId ||
              !signUp.createdUserId
            )
              throw new Error('phone verification incomplete');
            const finalized = await signUp.finalize();
            if (finalized.error) throw finalized.error;
            const session = getClerkInstance().session;
            if (!session || session.id !== signUp.createdSessionId)
              throw new Error('Clerk session missing');
            return {
              sessionId: signUp.createdSessionId,
              userId: signUp.createdUserId,
              issuedAt: session.lastActiveAt.getTime(),
              expiresAt: session.expireAt.getTime()
            };
          },
          async resend() {
            const resent = await signUp.verifications.sendPhoneCode();
            if (resent.error) throw resent.error;
          }
        });
      }
      return phoneAttempt(attemptId, countryCode, phoneValue);
    },
    async verifyPhone({ sessionId, code }): Promise<AuthResult> {
      const attempt = attempts.current.get(sessionId);
      if (!attempt) return { status: 'failed', errorCode: 'expired' };
      try {
        const verified = await attempt.verify(code);
        attempts.current.delete(sessionId);
        lastMethod.current = 'phone';
        return {
          status: 'authenticated',
          session: {
            status: 'authenticated',
            userId: verified.userId,
            method: 'phone',
            issuedAt: verified.issuedAt,
            expiresAt: verified.expiresAt,
            restoration: 'restored'
          }
        };
      } catch (error) {
        const errorCode = classifyPhoneVerificationError(error);
        if (!errorCode) throw error;
        return { status: 'failed', errorCode };
      }
    },
    async resendPhone(sessionId) {
      const attempt = attempts.current.get(sessionId);
      if (!attempt) throw new Error('expired');
      await attempt.resend();
      return phoneAttempt(sessionId, attempt.countryCode, attempt.phoneValue);
    },
    async signInWithGoogle() {
      const result = await startSSOFlow({ strategy: 'oauth_google' });
      if (!result.createdSessionId || !result.setActive) return null;
      await result.setActive({ session: result.createdSessionId });
      const userId =
        result.signUp?.createdUserId ?? getClerkInstance().user?.id;
      if (!userId) throw new Error('Clerk user missing');
      lastMethod.current = 'google';
      const session = getClerkInstance().session;
      if (!session || session.id !== result.createdSessionId)
        throw new Error('Clerk session missing');
      return {
        id: result.createdSessionId,
        userId,
        method: 'google',
        issuedAt: session.lastActiveAt.getTime(),
        expiresAt: session.expireAt.getTime()
      };
    },
    reverifyConflict: async () => null,
    signOut: ({ scope }) =>
      auth.signOut(
        scope === 'current'
          ? { sessionId: auth.sessionId ?? undefined }
          : undefined
      )
  };
  useEffect(() => {
    if (!auth.isLoaded) return;
    registerLiveClerkBridge(bridge);
    onSessionKey(auth.isSignedIn ? auth.sessionId : null);
  });
  return null;
}

function isIdentifierNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('errors' in error)) return false;
  const errors = (error as { errors?: unknown }).errors;
  return (
    Array.isArray(errors) &&
    errors.some((item) => {
      if (!item || typeof item !== 'object' || !('code' in item)) return false;
      const code = (item as { code?: unknown }).code;
      return code === 'form_identifier_not_found' || code === 'identifier_not_found';
    })
  );
}

function phoneAttempt(
  sessionId: string,
  countryCode: string,
  phoneValue: string
): PhoneVerificationAttempt {
  const now = Date.now();
  return {
    sessionId,
    countryCode,
    phoneValue,
    codeLength: 6,
    status: 'sent',
    issuedAt: now,
    resendAvailableAt: now + 30_000,
    invalidAttempts: 0,
    replacedBy: null
  };
}
