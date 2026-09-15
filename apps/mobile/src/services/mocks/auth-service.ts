import type {
  AuthResult,
  AuthService,
  PhoneInput,
  PhoneVerificationAttempt
} from '@/services/contracts/app-shell-service';
import { authServiceCapability } from '@/services/contracts/app-shell-service';
import type { AuthenticationSession } from '@/domain/app-shell';
import {
  createVerificationAttempt,
  resendVerificationAttempt,
  verifyAttemptCode,
  type VerificationAttempt
} from '@/features/auth/phone-verification';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';

type GoogleMode = 'success' | 'cancelled' | 'offline' | 'conflict';

interface MockAuthOptions {
  now?: () => number;
  googleMode?: GoogleMode;
}

export function createMockAuthService(options: MockAuthOptions = {}): CapabilityProviderHandle<AuthService> {
  const now = options.now ?? Date.now;
  const attempts = new Map<string, VerificationAttempt>();
  let session: AuthenticationSession | null = null;
  let nextAttempt = 0;

  function authenticated(method: 'phone' | 'google'): AuthenticationSession {
    return {
      status: 'authenticated',
      userId: 'mock-user',
      method,
      issuedAt: now(),
      expiresAt: now() + 60 * 60 * 1000,
      restoration: 'restored'
    };
  }

  return {
    metadata: {
      id: 'mock-auth',
      capability: authServiceCapability.capability,
      majorVersion: authServiceCapability.majorVersion,
      kind: 'mock',
      availability: 'available'
    },
    async startPhone(input: PhoneInput): Promise<PhoneVerificationAttempt> {
      const attempt = createVerificationAttempt({
        ...input,
        sessionId: `attempt-${++nextAttempt}`,
        now: now()
      });
      attempts.set(attempt.sessionId, attempt);
      return attempt;
    },

    async verifyPhone({ sessionId, code }): Promise<AuthResult> {
      const attempt = attempts.get(sessionId);
      if (!attempt) return { status: 'failed', errorCode: 'expired' };
      const verified = verifyAttemptCode(attempt, code, now());
      attempts.set(sessionId, verified);
      if (verified.status !== 'verified') {
        return { status: 'failed', errorCode: verified.status };
      }
      attempts.delete(sessionId);
      session = authenticated('phone');
      return { status: 'authenticated', session };
    },

    async resendPhone(sessionId): Promise<PhoneVerificationAttempt> {
      const attempt = attempts.get(sessionId);
      if (!attempt) throw new Error('expired');
      const result = resendVerificationAttempt(
        attempt,
        `attempt-${++nextAttempt}`,
        now()
      );
      attempts.set(result.previous.sessionId, result.previous);
      attempts.set(result.next.sessionId, result.next);
      return result.next;
    },

    async signInWithGoogle(): Promise<AuthResult> {
      if (options.googleMode === 'cancelled') return { status: 'cancelled' };
      if (options.googleMode === 'offline') {
        return { status: 'failed', errorCode: 'offline' };
      }
      if (options.googleMode === 'conflict') {
        return {
          status: 'conflict',
          conflictId: 'mock-conflict',
          existingMethod: 'phone'
        };
      }
      session = authenticated('google');
      return { status: 'authenticated', session };
    },

    async reverifyConflict(): Promise<AuthResult> {
      session = authenticated('google');
      return { status: 'authenticated', session };
    },

    async restoreSession(): Promise<AuthenticationSession> {
      return (
        session ?? {
          status: 'signed_out',
          userId: null,
          method: null,
          issuedAt: null,
          expiresAt: null,
          restoration: 'missing'
        }
      );
    },

    async touchActivity(): Promise<void> {},

    async signOut(): Promise<void> {
      session = null;
    }
  };
}
