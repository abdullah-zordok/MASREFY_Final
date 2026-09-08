import { resolveClientRuntime } from './client-runtime';

const liveEnvironment = {
  EXPO_PUBLIC_CLIENT_MODE: 'live',
  EXPO_PUBLIC_API_URL: 'https://api.masarifi.test',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_bWFzYXJpZmkudGVzdCQ'
};

describe('Mobile client runtime policy', () => {
  it.each(['live', 'demo', 'test'] as const)('accepts the explicit %s mode outside production', (mode) => {
    expect(
      resolveClientRuntime(
        mode === 'live' ? liveEnvironment : { EXPO_PUBLIC_CLIENT_MODE: mode },
        'development'
      ).mode
    ).toBe(mode);
  });

  it.each(['demo', 'test'] as const)('rejects %s mode in production', (mode) => {
    expect(() =>
      resolveClientRuntime({ EXPO_PUBLIC_CLIENT_MODE: mode }, 'production')
    ).toThrow('production requires live client mode');
  });

  it('requires a valid HTTPS API URL in live mode', () => {
    expect(() =>
      resolveClientRuntime(
        { ...liveEnvironment, EXPO_PUBLIC_API_URL: undefined },
        'development'
      )
    ).toThrow('valid HTTPS API URL');
    expect(() =>
      resolveClientRuntime(
        { ...liveEnvironment, EXPO_PUBLIC_API_URL: 'http://api.masarifi.test' },
        'development'
      )
    ).toThrow('valid HTTPS API URL');
  });

  it('requires a valid Clerk publishable key in live mode', () => {
    expect(() =>
      resolveClientRuntime(
        { ...liveEnvironment, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined },
        'development'
      )
    ).toThrow('valid Clerk publishable key');
    expect(() =>
      resolveClientRuntime(
        { ...liveEnvironment, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'sk_live_secret' },
        'development'
      )
    ).toThrow('valid Clerk publishable key');
    expect(() =>
      resolveClientRuntime(liveEnvironment, 'production')
    ).toThrow('production Clerk publishable key');
  });

  it.each([
    'EXPO_PUBLIC_OPENROUTER_API_KEY',
    'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
    'EXPO_PUBLIC_CLERK_SECRET_KEY',
    'EXPO_PUBLIC_STRIPE_SECRET_KEY'
  ])('rejects forbidden public secret variable %s', (name) => {
    expect(() =>
      resolveClientRuntime({ ...liveEnvironment, [name]: 'exposed' }, 'development')
    ).toThrow('forbidden public secret variable');
  });

  it('rejects invalid mode values and keeps billing unavailable', () => {
    expect(() =>
      resolveClientRuntime(
        { ...liveEnvironment, EXPO_PUBLIC_CLIENT_MODE: 'preview' },
        'development'
      )
    ).toThrow('invalid client mode');
    expect(resolveClientRuntime(liveEnvironment, 'development').billingAvailable).toBe(false);
  });
});
