import { URL } from 'node:url';

const clerkKeyPattern = /^pk_(?:live|test)_[A-Za-z0-9_-]{10,}$/;
const publicSecretPattern = /^EXPO_PUBLIC_.*(?:API_KEY|SECRET|SERVICE_ROLE)/;

export function validateClientBuildEnvironment(environment = process.env) {
  const exposed = Object.entries(environment).find(
    ([name, value]) => value && publicSecretPattern.test(name)
  );
  if (exposed) throw new Error(`forbidden public secret variable: ${exposed[0]}`);
  if (environment.NODE_ENV !== 'production') return;
  if (environment.EXPO_PUBLIC_CLIENT_MODE !== 'live')
    throw new Error('production requires live client mode');
  let apiUrl;
  try {
    apiUrl = new URL(environment.EXPO_PUBLIC_API_URL ?? '');
  } catch {
    throw new Error('production requires a valid HTTPS API URL');
  }
  if (apiUrl.protocol !== 'https:' || !apiUrl.hostname || apiUrl.username || apiUrl.password)
    throw new Error('production requires a valid HTTPS API URL');
  const clerkKey = environment.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkKey || !clerkKeyPattern.test(clerkKey) || !clerkKey.startsWith('pk_live_'))
    throw new Error('production requires a valid Clerk live publishable key');
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href)
  validateClientBuildEnvironment();
