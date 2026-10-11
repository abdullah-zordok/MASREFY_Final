import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAnalysisCompose } from './verify-analysis-compose.mjs';

const candidate = () => ({ services: { 'analysis-worker': {
  environment: { MASARIFI_PROCESS_KIND: 'worker', MASARIFI_VOICE_ANALYSIS_ONLY: 'true', MASARIFI_RELEASE_VERSION: 'a'.repeat(40) },
  user: '65532:65532', read_only: true, tmpfs: ['/tmp:rw,noexec,nosuid,size=64m'],
  healthcheck: { disable: false, test: ['CMD', '/nodejs/bin/node', 'dist/src/platform/health/container-healthcheck.js'], start_period: '5m10s' },
} } });

test('accepts scoped health and rejects inherited disable, missing writable state and inadequate startup', () => {
  assert.doesNotThrow(() => verifyAnalysisCompose(candidate()));
  const normalized = candidate();
  delete normalized.services['analysis-worker'].healthcheck.disable;
  assert.doesNotThrow(() => verifyAnalysisCompose(normalized));
  for (const alter of [
    worker => { worker.healthcheck.disable = true; },
    worker => { worker.healthcheck.start_period = '10s'; },
    worker => { worker.tmpfs = []; },
    worker => { worker.environment.MASARIFI_VOICE_ANALYSIS_ONLY = 'false'; },
  ]) {
    const config = candidate(); alter(config.services['analysis-worker']);
    assert.throws(() => verifyAnalysisCompose(config));
  }
});
