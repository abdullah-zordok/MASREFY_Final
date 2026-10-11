import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

import { dockerResult, imageUnderTest, inspectImage } from './docker-test.utils';

jest.setTimeout(180_000);

describe('same-image process commands', () => {
  it('contains the patched glibc libraries and runs Node 24 as the protected user', () => {
    // CVE-2026-5450/CVE-2026-5928: package metadata alone cannot prove patched library bytes.
    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const crypto = require('node:crypto');
      assert.equal(process.versions.node.split('.')[0], '24');
      assert.equal(process.getuid(), 65532);
      assert.equal(process.getgid(), 65532);
      const report = process.report.getReport();
      assert.equal(report.header.glibcVersionRuntime, '2.41');
      assert.ok(report.sharedObjects.some(path => path.endsWith('/libc.so.6')));
      const prefix = '/var/lib/dpkg/status.d/libc6';
      assert.match(fs.readFileSync(prefix, 'utf8'), /^Version: 2\\.41-12\\+deb13u4$/m);
      const checksums = fs.readFileSync(prefix + '.md5sums', 'utf8').trim().split('\\n');
      const libraryPaths = [];
      for (const line of checksums) {
        const [expected, path] = line.trim().split(/\\s+/);
        if (!path.startsWith('usr/lib/')) continue;
        const actual = crypto.createHash('md5').update(fs.readFileSync('/' + path)).digest('hex');
        assert.equal(actual, expected, path);
        libraryPaths.push(path);
      }
      assert.ok(libraryPaths.some(path => path.endsWith('/libc.so.6')));
      assert.ok(libraryPaths.some(path => path.includes('/ld-linux-')));
    `;
    const result = dockerResult([
      'run',
      '--rm',
      '--read-only',
      '--network',
      'none',
      '--entrypoint',
      '/nodejs/bin/node',
      imageUnderTest,
      '-e',
      script,
    ]);
    expect(result.status).toBe(0);
  });

  it('contains the patched OpenSSL packages and matching library files', () => {
    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const crypto = require('node:crypto');
      for (const name of ['libssl3t64', 'openssl-provider-legacy']) {
        const prefix = '/var/lib/dpkg/status.d/' + name;
        assert.match(fs.readFileSync(prefix, 'utf8'), /^Version: 3\\.5\\.7-1~deb13u3$/m);
        const checksums = fs.readFileSync(prefix + '.md5sums', 'utf8').trim().split('\\n');
        for (const line of checksums) {
          const [expected, path] = line.trim().split(/\\s+/);
          if (!path.startsWith('usr/lib/')) continue;
          const actual = crypto.createHash('md5').update(fs.readFileSync('/' + path)).digest('hex');
          assert.equal(actual, expected, path);
        }
      }
    `;
    const result = dockerResult([
      'run',
      '--rm',
      '--read-only',
      '--network',
      'none',
      '--entrypoint',
      '/nodejs/bin/node',
      imageUnderTest,
      '-e',
      script,
    ]);
    expect(result.status).toBe(0);
  });

  it.each([
    ['dist/src/main.js', 'API_BOOTSTRAP_FAILED'],
    ['dist/src/worker.js', 'WORKER_BOOTSTRAP_FAILED'],
    ['dist/src/staging-voice-worker.js', 'VOICE_SCOPED_BOOTSTRAP_FAILED'],
    ['dist/src/migration.js', 'MIGRATION_FAILED'],
  ])(
    'runs %s from the reviewed image and fails closed without runtime configuration',
    (command, marker) => {
      const result = dockerResult(['run', '--rm', '--read-only', imageUnderTest, command]);

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(marker);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(
        /postgres(?:ql)?:\/\/|password|secret/i,
      );
    },
  );

  it('uses the Node liveness probe and publishes a port only for the API service', () => {
    const inspection = inspectImage();
    const config = inspection.Config as {
      Healthcheck?: { Test?: string[] };
      Cmd?: string[];
    };
    expect(config.Cmd).toEqual(['dist/src/main.js']);
    expect(config.Healthcheck?.Test).toEqual([
      'CMD',
      '/nodejs/bin/node',
      'dist/src/platform/health/container-healthcheck.js',
    ]);

    const probe = dockerResult([
      'run',
      '--rm',
      '--read-only',
      '--entrypoint',
      '/nodejs/bin/node',
      imageUnderTest,
      'dist/src/platform/health/container-healthcheck.js',
    ]);
    expect(probe.status).toBe(1);

    const root = resolve(__dirname, '../../../..');
    const compose = load(
      readFileSync(resolve(root, 'docker/local/compose.backend.yml'), 'utf8'),
    ) as {
      services: Record<string, { ports?: string[]; command?: string[] }>;
    };
    expect(compose.services['backend-api']?.ports).toEqual(['3000:3000']);
    expect(compose.services.worker?.ports).toBeUndefined();
    expect(compose.services['backend-api']?.command).toEqual(['dist/src/main.js']);
    expect(compose.services.worker?.command).toEqual(['dist/src/worker.js']);
  });
});
