import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mobileRoot = fileURLToPath(new URL('../', import.meta.url));

function decoderProbe(guarded) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
      const { readFileSync } = require('node:fs');
      const Module = require('node:module');
      const ts = require('typescript');
      const filename = require('node:path').resolve('app/+native-intent.tsx');
      const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS }
      }).outputText;
      const intent = new Module(filename);
      intent.filename = filename;
      intent.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
      intent._compile(compiled, filename);
      const queryString = require('query-string');
      const { extractExpoPathFromURL } = require('expo-router/build/fork/extractPathFromURL');
      const malformed = '%C0'.repeat(2000);
      if (${guarded}) {
        for (const initial of [true, false]) {
          for (const query of [malformed, encodeURIComponent(malformed)]) {
            const path = intent.exports.redirectSystemPath({ path: 'masarifi://reports?label=' + query, initial });
            if (path !== '/') throw new Error('Malformed link escaped the native boundary');
            extractExpoPathFromURL([], path);
          }
          for (const query of [encodeURIComponent(encodeURIComponent(malformed)), '100%2525']) {
            const original = 'masarifi://reports?label=' + query;
            const path = intent.exports.redirectSystemPath({ path: original, initial });
            if (path !== original) throw new Error('Router-compatible encoding changed');
            const extracted = extractExpoPathFromURL([], path);
            new URL(extracted, 'masarifi://app').searchParams.get('label');
          }
          const arabic = 'masarifi://reports?label=%D9%85%D8%B5%D8%B1%D9%88%D9%81';
          if (intent.exports.redirectSystemPath({ path: arabic, initial }) !== arabic) throw new Error('Valid Arabic link changed');
        }
      } else {
        queryString.parse('label=' + malformed);
      }
    `
    ],
    { cwd: mobileRoot, encoding: 'utf8', timeout: 2000 }
  );
}

test('installed CommonJS decoder handles malformed input within the bounded subprocess', () => {
  const control = decoderProbe(false);
  assert.equal(control.error, undefined, control.stderr);
  assert.equal(control.status, 0, control.stderr);
});

test('CommonJS decoder preserves legacy plus and partial UTF-8 semantics', () => {
  const decode = require('decode-uri-component');
  assert.equal(typeof decode, 'function');
  for (const [input, expected] of [
    ['a+b%2Bc', 'a b+c'], ['%D9%85%D8%B5%D8%B1%D9%88%D9%81', 'مصروف'],
    ['%F0%9F%92%B0', '💰'], ['%C0%AF', '%C0%AF'], ['%E0%A4%A', '%E0%A4%A'],
    ['%41%C0%42', 'A%C0B'], ['%FE%FF', '\uFFFD\uFFFD'], ['%C2', '\uFFFD'],
    ['100%25', '100%'], ['%2525', '%25'], ['%G1', '%G1']
  ]) assert.equal(decode(input), expected, input);
  for (const input of [undefined, null, 1, {}, []]) assert.throws(() => decode(input), TypeError);
});

test('installed decoder and frozen archive match the reviewed backport', () => {
  const archive = readFileSync(new URL('../vendor/decode-uri-component-0.2.2-masarifi.1.tgz', import.meta.url));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const dependency = lock.packages['node_modules/decode-uri-component'];
  assert.equal(dependency.integrity, 'sha512-' + createHash('sha512').update(archive).digest('base64'));
  assert.equal(require('decode-uri-component/package.json').version, '0.2.2-masarifi.1');
  assert.deepEqual(readFileSync(require.resolve('decode-uri-component')),
    readFileSync(new URL('../vendor/decode-uri-component/index.js', import.meta.url)));
});

test('actual React Navigation parser preserves parameters and bounds malformed queries', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { getStateFromPath } from './node_modules/@react-navigation/core/lib/module/getStateFromPath.js';
    const config = { screens: { Reports: 'reports', Callback: 'sso-callback' } };
    const malformed = '%C0'.repeat(2000);
    for (const label of [malformed, '%41%C0%42', '%D9%85%D8%B5%D8%B1%D9%88%D9%81', 'a+b%2Bc']) {
      const state = getStateFromPath('/reports?label=' + label, config);
      assert.equal(state.routes[0].name, 'Reports');
      assert.equal(state.routes[0].params.label,
        label === malformed ? malformed : label === '%41%C0%42' ? 'A%C0B' : label.startsWith('%D9') ? 'مصروف' : 'a b+c');
    }
    const callback = getStateFromPath('/sso-callback?code=fixture%2Bonly&state=fixture%2525', config);
    assert.equal(callback.routes[0].params.code, 'fixture+only');
    assert.equal(callback.routes[0].params.state, 'fixture%25');
  `], { cwd: mobileRoot, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test('native guard bounds malformed extraction and preserves safe percent/Arabic inputs', () => {
  const guarded = decoderProbe(true);
  assert.equal(guarded.error, undefined, guarded.stderr);
  assert.equal(guarded.status, 0, guarded.stderr);
});
