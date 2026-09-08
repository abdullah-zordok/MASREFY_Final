export type PhoneVerificationFailure = 'invalid' | 'expired' | 'rate_limited';

const phoneVerificationCodes: Readonly<Record<string, PhoneVerificationFailure>> = {
  form_code_incorrect: 'invalid',
  verification_expired: 'expired',
  too_many_requests: 'rate_limited'
};

export function classifyPhoneVerificationError(
  error: unknown
): PhoneVerificationFailure | null {
  if (!error || typeof error !== 'object' || !('errors' in error)) return null;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return null;
  for (const item of errors) {
    if (!item || typeof item !== 'object' || !('code' in item)) continue;
    const code = (item as { code?: unknown }).code;
    if (typeof code === 'string' && phoneVerificationCodes[code])
      return phoneVerificationCodes[code];
  }
  return null;
}
