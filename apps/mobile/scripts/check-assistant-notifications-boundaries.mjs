import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkAssistantNotificationsBoundaries(root = process.cwd()) {
  const violations = [];
  for (const directory of ['app', 'src']) {
    const path = join(root, directory);
    try { walk(path, root, violations); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return violations;
}

function walk(path, root, violations) {
  if (!statSync(path).isDirectory()) return check(path, root, violations);
  for (const entry of readdirSync(path)) if (entry !== '__snapshots__') walk(join(path, entry), root, violations);
}

function check(path, root, violations) {
  if (!/\.(ts|tsx)$/.test(path)) return;
  const rel = relative(root, path).replaceAll('\\', '/');
  const text = readFileSync(path, 'utf8');
  if (!/^(app\/(\(tabs\)\/)?(notifications|assistant|subscriptions|profile|support|security)|src\/(features\/(notifications|assistant|subscriptions|settings|support)|services\/live\/engagement-service|analytics\/assistant-notifications|state\/assistant-notifications))/.test(rel)) return;
  reject(/expo-sqlite/i, 'direct SQLite', rel, text, violations);
  reject(/from ['"][^'"]*(openai|anthropic|stripe|revenuecat|intercom|zendesk|firebase|onesignal)[^'"]*['"]/i, 'provider import', rel, text, violations);
  reject(/getExpoPushTokenAsync|ExpoPushToken|sendPushNotification/i, 'remote push', rel, text, violations);
  reject(/payment succeeded|ticket submitted|export delivered|account deleted/i, 'production success', rel, text, violations);
  reject(/#[0-9a-f]{3,8}\b/i, 'semantic tokens', rel, text, violations);
  reject(/\b(?:create|use)(?:Assistant|Notification|Subscription|Support|Settings)\w*Store\b/i, 'Zustand', rel, text, violations);
  reject(/analytics\.(track|capture)\([^\n]*(amount|currency|title|body|question|answer|sourceId|email|phone|ticket|credential|token)/i, 'analytics', rel, text, violations);
  reject(/iOS[^\n]*(SMS|text message)|SMS[^\n]*iOS/i, 'iOS SMS', rel, text, violations);
  reject(/(?:AsyncStorage|SecureStore|SQLite)[\s\S]{0,120}(?:setItem|insert|execAsync)/i, 'engagement secret persistence', rel, text, violations);
  reject(/\/(?:api\/v1\/)?admin\/|support\/internal/i, 'unsafe engagement route', rel, text, violations);
  reject(/(?:internalNotes|claim_token|scan_status|token_ciphertext)/i, 'private server field', rel, text, violations);
  const executable = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g, '');
  const functions = executable.match(/(?:async\s+)?function\s+\w*\s*\([^)]*\)\s*\{[\s\S]*?\}/g) ?? [];
  const actionCalls = (executable.match(/executeAction\s*\(/g) ?? []).length;
  const guardedCalls = functions.filter((body) => /await\s+unlock\s*\([^)]*\)\s*;[\s\S]*await\s+revalidateAction\s*\([^)]*\)\s*;[\s\S]*executeAction\s*\(/.test(body)).length;
  if (actionCalls !== guardedCalls) violations.push(`${rel}: unguarded protected notification action`);
}

function reject(pattern, label, rel, text, violations) { if (pattern.test(text)) violations.push(`${rel}: ${label}`); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = checkAssistantNotificationsBoundaries();
  if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; } else console.log('assistant notifications boundary check passed');
}
