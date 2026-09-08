import { resolveClientMode } from './client-runtime';

export function isDemoModeEnabled(
  value = process.env.EXPO_PUBLIC_DEMO_MODE,
  mode = process.env.EXPO_PUBLIC_CLIENT_MODE,
  nodeEnvironment = process.env.NODE_ENV
): boolean {
  return resolveClientMode(
    {
      EXPO_PUBLIC_CLIENT_MODE: mode,
      EXPO_PUBLIC_DEMO_MODE: value
    },
    nodeEnvironment
  ) === 'demo';
}

export function isFixtureModeEnabled(
  nodeEnv = process.env.NODE_ENV,
  demoMode = isDemoModeEnabled()
): boolean {
  if (nodeEnv === 'production' && demoMode)
    throw new Error('production requires live client mode');
  return nodeEnv === 'test' || demoMode;
}
