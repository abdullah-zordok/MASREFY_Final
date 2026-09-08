export type ClientMode = 'live' | 'demo' | 'test';

type RuntimeEnvironment = Record<string, string | undefined>;

export interface ClientRuntime {
  apiUrl: string | null;
  billingAvailable: false;
  clerkPublishableKey: string | null;
  mode: ClientMode;
}

const clientModes = new Set<ClientMode>(['live', 'demo', 'test']);
const clerkKeyPattern = /^pk_(?:live|test)_[A-Za-z0-9_-]{10,}$/;
const publicSecretPattern = /^EXPO_PUBLIC_.*(?:API_KEY|SECRET|SERVICE_ROLE)/;
const bundledEnvironment = (): RuntimeEnvironment => ({
  EXPO_PUBLIC_CLIENT_MODE: process.env.EXPO_PUBLIC_CLIENT_MODE,
  EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
});

export function resolveClientMode(
  environment: RuntimeEnvironment = bundledEnvironment(),
  nodeEnvironment = process.env.NODE_ENV
): ClientMode {
  const rawMode =
    environment.EXPO_PUBLIC_CLIENT_MODE ??
    (environment.EXPO_PUBLIC_DEMO_MODE === '1'
      ? 'demo'
      : nodeEnvironment === 'test'
        ? 'test'
        : 'live');

  if (!clientModes.has(rawMode as ClientMode)) throw new Error('invalid client mode');
  if (nodeEnvironment === 'production' && rawMode !== 'live')
    throw new Error('production requires live client mode');
  return rawMode as ClientMode;
}

export function resolveClientRuntime(
  environment: RuntimeEnvironment = bundledEnvironment(),
  nodeEnvironment = process.env.NODE_ENV
): ClientRuntime {
  const exposedSecret = Object.entries(environment).find(
    ([name, value]) => value && publicSecretPattern.test(name)
  );
  if (exposedSecret) throw new Error('forbidden public secret variable');

  const mode = resolveClientMode(environment, nodeEnvironment);
  if (mode !== 'live')
    return { apiUrl: null, billingAvailable: false, clerkPublishableKey: null, mode };

  const apiUrl = validHttpsUrl(environment.EXPO_PUBLIC_API_URL);
  if (!apiUrl) throw new Error('live mode requires a valid HTTPS API URL');

  const clerkPublishableKey = environment.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkPublishableKey || !clerkKeyPattern.test(clerkPublishableKey))
    throw new Error('live mode requires a valid Clerk publishable key');
  if (nodeEnvironment === 'production' && !clerkPublishableKey.startsWith('pk_live_'))
    throw new Error('production Clerk publishable key must use pk_live');

  return { apiUrl, billingAvailable: false, clerkPublishableKey, mode };
}

function validHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
      return null;
    return value.replace(/\/+$/, '');
  } catch {
    return null;
  }
}
