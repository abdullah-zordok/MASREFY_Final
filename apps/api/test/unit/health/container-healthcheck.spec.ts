import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

import { isLiveResponse, runHealthcheck } from '../../../src/platform/health/container-healthcheck';

describe('container healthcheck', () => {
  it('executes scoped worker health without HTTP and fails closed on invalid local evidence', () => {
    const path = resolve(mkdtempSync(resolve(tmpdir(), 'worker-healthcheck-')), 'health.json');
    const env = {
      MASARIFI_PROCESS_KIND: 'worker',
      MASARIFI_VOICE_ANALYSIS_ONLY: 'true',
      MASARIFI_RELEASE_VERSION: 'a'.repeat(40),
    };
    const prior = process.exitCode;
    try {
      for (const content of [
        JSON.stringify({
          sourceSha: env.MASARIFI_RELEASE_VERSION,
          scope: 'analysis',
          state: 'ready',
          observedAt: Date.now(),
        }),
        'invalid',
        'x'.repeat(1025),
      ]) {
        writeFileSync(path, content);
        runHealthcheck(env, path);
        expect(process.exitCode).toBe(content.startsWith('{') ? 0 : 1);
      }
      runHealthcheck(env, path + '.missing');
      expect(process.exitCode).toBe(1);
      runHealthcheck({ ...env, MASARIFI_AI_ASSISTANT_ONLY: 'true' }, path);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prior;
    }
  });

  it('enables the scoped Analysis overlay healthcheck while preserving the general worker boundary', () => {
    // Parse the actual deployment artifacts, including their inherited health setting.
    type Compose = {
      services: Record<
        'worker' | 'analysis-worker',
        { healthcheck: { disable: boolean; test?: string[]; start_period?: string } }
      >;
    };
    const root = resolve(__dirname, '../../../../..');
    const base = load(
      readFileSync(resolve(root, 'docker/staging/compose.backend.yml'), 'utf8'),
    ) as Compose;
    const overlay = load(
      readFileSync(resolve(root, 'docker/staging/voice-analysis.yml'), 'utf8'),
    ) as Compose;
    const health = {
      ...base.services.worker.healthcheck,
      ...overlay.services['analysis-worker'].healthcheck,
    };
    expect(base.services.worker.healthcheck.disable).toBe(true);
    expect(health.disable).toBe(false);
    expect(health.test).toEqual([
      'CMD',
      '/nodejs/bin/node',
      'dist/src/platform/health/container-healthcheck.js',
    ]);
    expect(health.start_period).toBe('310s');
  });
  it('accepts only the exact successful liveness result', () => {
    expect(isLiveResponse(200, '{"status":"ok"}')).toBe(true);
    expect(isLiveResponse(503, '{"status":"ok"}')).toBe(false);
    expect(isLiveResponse(200, '{"status":"not_ready"}')).toBe(false);
    expect(isLiveResponse(200, 'not-json')).toBe(false);
  });

  it('queries liveness without probing readiness dependencies', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/platform/health/container-healthcheck.ts'),
      'utf8',
    );
    expect(source).toContain("path: '/health/live'");
    expect(source).not.toContain('/health/ready');
  });
});
