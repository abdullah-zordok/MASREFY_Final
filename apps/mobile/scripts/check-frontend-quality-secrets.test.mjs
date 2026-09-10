import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFrontendQualitySecrets } from './check-frontend-quality-secrets.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'spec010-secrets-'));
mkdirSync(path.join(root, 'src'), { recursive: true });
mkdirSync(path.join(root, 'src', 'services', 'platform'), { recursive: true });
mkdirSync(path.join(root, 'src', 'features'), { recursive: true });
writeFileSync(path.join(root, 'src', 'safe.ts'), "const fake = 'sb_publishable_fake_fixture';\n");
writeFileSync(path.join(root, 'src', 'secret.ts'), "const key = 'sk_live_123456789';\n");
writeFileSync(path.join(root, 'src', 'provider.ts'), "fetch('https://api.openai.com/v1/chat/completions');\n");
writeFileSync(path.join(root, 'src', 'console.ts'), "console.log({ amount: 123, accountId: 'a1' });\n");
writeFileSync(path.join(root, 'src', 'services', 'platform', 'notifications.ts'), 'getExpoPushTokenAsync();\n');
writeFileSync(path.join(root, 'src', 'features', 'notifications.ts'), 'getExpoPushTokenAsync();\n');

const findings = scanFrontendQualitySecrets(root);
const output = findings.map((item) => item.file).join('\n');

assert.match(output, /secret\.ts/);
assert.match(output, /provider\.ts/);
assert.match(output, /console\.ts/);
assert.doesNotMatch(output, /safe\.ts/);
assert.doesNotMatch(output, /services\/platform\/notifications\.ts/);
assert.match(output, /features\/notifications\.ts/);

console.log('frontend quality secrets RED test observed expected violations');
