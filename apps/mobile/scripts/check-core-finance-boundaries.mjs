import fs from 'node:fs';
import path from 'node:path';

const files = ['app', 'src'].flatMap(collect);
const findings = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const normalized = file.replaceAll('\\', '/');
  const isTest = /\.(test|spec)\.(ts|tsx)$/.test(normalized);
  const isStorage = normalized.startsWith('src/storage/');
  const isCoreFinanceUi =
    /^(app\/(\(tabs\)\/(home|transactions|add)|accounts|categories|transactions|modals\/(transaction|account|category|sync))\/|src\/features\/(home|transactions|accounts|categories)\/)/.test(
      normalized
    );

  if (!isStorage && !isTest) {
    report(
      file,
      source,
      /from ['"]expo-sqlite['"]/g,
      'direct SQLite import outside storage'
    );
  }
  if (isCoreFinanceUi && !isTest) {
    report(file, source, /#[0-9a-f]{3,8}\b/gi, 'feature-local raw color');
    report(
      file,
      source,
      /(?<!=)>\s*[A-Za-z][A-Za-z ]{2,}\s*</g,
      'hard-coded English UI text'
    );
    report(
      file,
      source,
      /(?:label|title|placeholder|message)=["'][A-Za-z][^"']+["']/g,
      'hard-coded English UI property'
    );
  }
  if (!isTest && normalized !== 'src/config/client-runtime.ts') {
    report(
      file,
      source,
      /(?:openai|stripe|supabase|firebase|service[_-]?role)/gi,
      'production provider import'
    );
  }
  report(
    file,
    source,
    /console\.(?:log|info|warn|error)\([^)]*(?:amount|balance|merchant|account|note|conflict)/gi,
    'sensitive financial logging'
  );
}

if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Core-finance boundaries passed (${files.length} files checked).`
  );
}

function collect(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory()
      ? collect(entryPath)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [entryPath]
        : [];
  });
}

function report(file, source, pattern, label) {
  for (const match of source.matchAll(pattern)) {
    if (label.includes('hard-coded English UI') && isLocalizationMatch(match[0])) {
      continue;
    }
    findings.push(
      `${file}:${source.slice(0, match.index).split(/\r?\n/).length} ${label}`
    );
  }
}

function isLocalizationMatch(value) {
  const match = value.match(/["']([^"']+)["']/);
  return Boolean(match && /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/.test(match[1]));
}
