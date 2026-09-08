import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'src'];
const files = roots.flatMap((root) => collect(root));
const findings = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const normalized = file.replaceAll('\\', '/');
  const isTest = /\.(test|spec)\.(ts|tsx)$/.test(normalized);
  const isAppShellUi = /^(app\/\((public|onboarding|tabs)\)|app\/(accounts|assistant|modals|security)\/|src\/features\/(auth|onboarding|shell|security)\/)/.test(
    normalized
  );
  const isAndroidSmsBoundary =
    normalized === 'app/(onboarding)/android-sms-permission.tsx' ||
    normalized.endsWith('src/services/platform/tracking-permission-service.android.ts');

  if (!isTest) {
    reportMatches(
      file,
      source,
      /(?:openai|stripe|supabase|firebase|@react-native-google-signin|expo-auth-session)/gi,
      'provider SDK or production-provider import'
    );
  }
  reportMatches(
    file,
    source,
    /(?:sk-[a-z0-9_-]{16,}|(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][^'"]+)/gi,
    'production secret'
  );
  reportMatches(
    file,
    source,
    /console\.(?:log|info|warn|error)\([^)]*(?:phone|otp|pin|amount|balance|message|account)/gi,
    'sensitive logging'
  );

  if (isAppShellUi && !isTest) {
    reportMatches(file, source, /#[0-9a-f]{3,8}\b/gi, 'feature-local raw color');
  }

  if (!isTest && !isAndroidSmsBoundary) {
    reportMatches(
      file,
      source,
      /\b(?:READ_SMS|SmsAndroid|Telephony|SMS permission|inbox)\b/g,
      'SMS behavior outside Android boundary'
    );
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`App-shell boundaries passed (${files.length} files checked).`);
}

function collect(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collect(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function reportMatches(file, source, pattern, label) {
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    findings.push(`${file}:${line} ${label}`);
  }
}
