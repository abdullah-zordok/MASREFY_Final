#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md']);
const rules = [
  ['production-secret', /\b(sk_live_[A-Za-z0-9_]+|service_role|sb_secret_[A-Za-z0-9_]+)\b/],
  ['direct-provider', /api\.openai\.com|api\.stripe\.com|supabase\.co/i],
  ['sensitive-console', /console\.(log|warn|error)\([^)]*(amount|balance|accountId|transaction|credential|secret)/is],
  ['push-token-outside-platform', /getExpoPushTokenAsync/]
];

export function scanFrontendQualitySecrets(root = process.cwd()) {
  const findings = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (isAllowed(rel)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const [rule, pattern] of rules) {
      if (rule === 'push-token-outside-platform' && rel.startsWith('src/services/platform/')) continue;
      if (pattern.test(source)) findings.push({ file: rel, rule });
    }
  }
  return findings;
}

function* walk(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (fileExtensions.has(path.extname(entry.name))) yield full;
  }
}

function isAllowed(rel) {
  return (
    rel.startsWith('scripts/check-') ||
    rel === 'src/config/client-runtime.ts' ||
    rel.endsWith('.test.ts') ||
    rel.endsWith('.test.tsx') ||
    rel.endsWith('.test.mjs') ||
    rel.includes('/test-utils/') ||
    /fake|fixture|mock/i.test(rel)
  );
}

async function main() {
  const findings = scanFrontendQualitySecrets(path.resolve(process.argv[2] ?? process.cwd()));
  if (findings.length) {
    console.error(findings.map((item) => `${item.file}: ${item.rule}`).join('\n'));
    process.exit(1);
  }
  console.log('Frontend-quality secrets scan passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
