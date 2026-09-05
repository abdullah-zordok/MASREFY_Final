import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkAssistantNotificationsBoundaries } from './check-assistant-notifications-boundaries.mjs';

const root = mkdtempSync(join(tmpdir(), 'assistant-boundaries-'));
try {
  const file = (name, contents) => {
    const path = join(root, 'app', '(tabs)', 'notifications', name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  };
  file('sqlite.tsx', "import * as SQLite from 'expo-sqlite';");
  file('providers.tsx', "import OpenAI from 'openai'; import Stripe from 'stripe'; import Zendesk from 'zendesk'; import * as Notifications from 'expo-notifications'; Notifications.getExpoPushTokenAsync();");
  file('claims.tsx', "const message = 'payment succeeded, ticket submitted, export delivered, account deleted'; const ios = 'iOS SMS';");
  file('tokens.tsx', "const color = '#123456';");
  file('state.tsx', "const useAssistantStore = createStore();");
  file('analytics.tsx', "analytics.track('event', { amount: 1, question: 'secret' });");
  file('actions.tsx', "executeAction('n1', 'undo', 'op1');");
  file('mixed.tsx', "async function safe() { await unlock(); await revalidateAction(); executeAction(); } async function unsafe() { executeAction(); }");
  file('bypass.tsx', "// await unlock(); await revalidateAction(); executeAction()\nconst text = 'await unlock(); await revalidateAction(); executeAction()'; async function unsafe() { executeAction(); }");
  const violations = checkAssistantNotificationsBoundaries(root);
  for (const expected of ['sqlite.tsx: direct SQLite', 'providers.tsx: provider import', 'providers.tsx: remote push', 'claims.tsx: production success', 'tokens.tsx: semantic tokens', 'state.tsx: Zustand', 'analytics.tsx: analytics', 'claims.tsx: iOS SMS', 'actions.tsx: unguarded protected notification action']) {
    assert.ok(violations.some((item) => item.includes(expected)), `${expected} was not rejected`);
  }
  assert.ok(violations.some((item) => item.includes('mixed.tsx: unguarded')));
  assert.ok(violations.some((item) => item.includes('bypass.tsx: unguarded')));
  file('guarded.tsx', 'async function handle() { await unlock(); await revalidateAction(); executeAction(); }');
  assert.ok(!checkAssistantNotificationsBoundaries(root).some((item) => item.includes('guarded.tsx: unguarded')));
  const live = join(root, 'src', 'services', 'live', 'engagement-service.ts');
  mkdirSync(join(live, '..'), { recursive: true });
  writeFileSync(live, "SecureStore.setItemAsync('token', value); fetch('/api/v1/admin/content'); const scan_status = 'clean';");
  const liveViolations = checkAssistantNotificationsBoundaries(root);
  for (const expected of ['engagement secret persistence', 'unsafe engagement route', 'private server field'])
    assert.ok(liveViolations.some((item) => item.includes(expected)), `${expected} was not rejected`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
