import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFrontendQualitySecrets } from './check-frontend-quality-secrets.mjs';

const providerPattern = /from ['"][^'"]*(?:expo-notifications|openai|stripe|supabase|firebase|zendesk|twilio)[^'"]*['"]/i;
const secretPattern = /(?:sk_live_[a-z0-9_]{12,}|service[_-]?role|api[_-]?key\s*[:=]\s*['"][^'"]+['"]|client[_-]?secret\s*[:=]\s*['"][^'"]+['"])/i;
const sensitiveOutputPattern = /(?:analytics\.\w+|track|logEvent|console\.(?:log|info|warn|error))\s*\([^)]*(?:amount|balance|accountId|transactionId|message|transcript|question|answer|support|credential|raw[-_]?error)/is;
const rawColorPattern = /#[0-9a-f]{3,8}\b/i;
const iosSmsPattern = /ios[^'\n"]{0,40}sms|sms[^'\n"]{0,40}ios/i;
const mutationPattern = /\b(?:service|repo|repository)\.(?:create|update|delete|undo|confirm|execute|submit|resolve|save|mark|purchase|cancel|change)[A-Z][\w]*\s*\(([^)]*)\)/g;

export function checkFrontendQualityBoundaries(root = process.cwd()) {
  const findings = [];
  for (const file of collect(root)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    const scanned = stripComments(source);
    const isTest = /\.(test|spec)\.(ts|tsx)$/.test(relative) || relative.includes('/__tests__/');
    const isFixture = relative.includes('fixtures') || relative.includes('/test-utils/');

    if (isTest || isFixture) continue;

    const inAppOrFeature = relative.startsWith('app/') || relative.startsWith('src/features/');
    const validationRoute = relative.startsWith('app/foundation/');
    const storageAllowedRoute = validationRoute || relative === 'app/(onboarding)/tracking-keywords.tsx' || relative === 'app/tracking/keywords.tsx';
    if (inAppOrFeature && !storageAllowedRoute && /from ['"][^'"]*(?:expo-sqlite|src\/storage|@\/storage|\.\.?\/.*storage\/)[^'"]*['"]/.test(scanned)) {
      add(findings, relative, scanned, /(?:expo-sqlite|src\/storage|@\/storage|\.\.?\/.*storage\/)/, 'direct storage import');
    }

    if (!relative.startsWith('src/services/platform/') && providerPattern.test(scanned)) {
      add(findings, relative, scanned, providerPattern, 'provider SDK import');
    }

    if (relative.startsWith('src/state/') && /\[[\s\S]*\b(?:accountId|transactionId|amount|balance|serverId)\b[\s\S]*\]/.test(scanned)) {
      add(findings, relative, scanned, /\[[\s\S]*\b(?:accountId|transactionId|amount|balance|serverId)\b/, 'server-shaped Zustand state');
    }

    if (relative !== 'src/config/client-runtime.ts' && secretPattern.test(scanned)) {
      add(findings, relative, scanned, secretPattern, 'production secret');
    }
    if (sensitiveOutputPattern.test(scanned)) add(findings, relative, scanned, sensitiveOutputPattern, 'sensitive analytics/logging');
    if (hasIosSmsString(scanned) && !relative.includes('/localization/messages/') && !relative.includes('/services/mocks/')) {
      add(findings, relative, scanned, iosSmsPattern, 'unsupported iOS SMS claim');
    }

    if (relative.startsWith('src/features/') || relative.startsWith('app/')) {
      if (rawColorPattern.test(scanned)) add(findings, relative, scanned, rawColorPattern, 'raw brand color');
      if (relative.endsWith('.tsx')) reportRawJsxText(findings, relative, scanned);
      reportUnguardedMutations(findings, relative, scanned);
    }
  }
  findings.push(
    ...scanFrontendQualitySecrets(root).map((finding) => `${finding.file}: ${finding.rule}`)
  );
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = checkFrontendQualityBoundaries();
  if (findings.length) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Frontend-quality boundaries passed.');
  }
}

function collect(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.expo', 'android', 'ios'].includes(entry.name)) return [];
      return collect(entryPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function reportRawJsxText(findings, relative, source) {
  for (const match of source.matchAll(/<(?:Text|StyledText)\b[^>]*>\s*([A-Z][A-Za-z ]{2,})\s*<\/(?:Text|StyledText)>/g)) {
    findings.push(`${relative}: raw user-facing string (line ${lineOf(source, match.index)})`);
  }
}

function reportUnguardedMutations(findings, relative, source) {
  if (relative === 'src/features/support/useSupportDraft.ts') return;
  for (const match of source.matchAll(mutationPattern)) {
    if (/\boperationId\b/.test(match[1])) continue;
    findings.push(`${relative}: mutation without operationId (line ${lineOf(source, match.index)})`);
  }
}

function add(findings, relative, source, pattern, label) {
  const match = source.match(pattern);
  findings.push(`${relative}: ${label} (line ${lineOf(source, match?.index ?? 0)})`);
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function hasIosSmsString(source) {
  return [...source.matchAll(/['"]([^'"\r\n]*)['"]/g)].some((match) => {
    const value = match[1];
    return iosSmsPattern.test(value) && !/^[a-z][\w-]*(?:\.[\w-]+)+$/.test(value);
  });
}
