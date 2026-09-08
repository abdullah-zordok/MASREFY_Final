import test from 'node:test';
import assert from 'node:assert/strict';

import { validateClientBuildEnvironment } from './check-client-runtime.mjs';

const live = {
  NODE_ENV: 'production',
  EXPO_PUBLIC_CLIENT_MODE: 'live',
  EXPO_PUBLIC_API_URL: 'https://api.masarifi.test',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_bWFzYXJpZmkudGVzdCQ'
};

test('accepts the free-only production client environment', () => {
  assert.doesNotThrow(() => validateClientBuildEnvironment(live));
});

test('rejects demo mode and every secret-shaped public variable', () => {
  assert.throws(
    () => validateClientBuildEnvironment({ ...live, EXPO_PUBLIC_CLIENT_MODE: 'demo' }),
    /live client mode/
  );
  assert.throws(
    () => validateClientBuildEnvironment({ ...live, EXPO_PUBLIC_PROVIDER_SECRET: 'leak' }),
    /forbidden public secret/
  );
});
