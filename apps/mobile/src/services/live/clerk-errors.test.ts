import { classifyPhoneVerificationError } from './clerk-errors';

test.each([
  ['form_code_incorrect', 'invalid'],
  ['verification_expired', 'expired'],
  ['too_many_requests', 'rate_limited']
] as const)('maps Clerk phone verification code %s', (code, expected) => {
  expect(classifyPhoneVerificationError({ errors: [{ code }] })).toBe(expected);
});

test('does not misreport provider and transport failures as invalid OTP input', () => {
  expect(classifyPhoneVerificationError(new TypeError('network'))).toBeNull();
  expect(
    classifyPhoneVerificationError({ errors: [{ code: 'clerk_service_unavailable' }] })
  ).toBeNull();
});
