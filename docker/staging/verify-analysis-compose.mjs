import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyAnalysisCompose(config) {
  const worker = config.services?.['analysis-worker'];
  if (!worker || worker.environment?.MASARIFI_PROCESS_KIND !== 'worker' ||
      worker.environment?.MASARIFI_VOICE_ANALYSIS_ONLY !== 'true' ||
      !/^[a-f0-9]{40}$/.test(worker.environment?.MASARIFI_RELEASE_VERSION ?? '')) {
    throw new Error('ANALYSIS_SCOPE_INVALID');
  }
  const health = worker.healthcheck;
  if (health?.disable !== false ||
      JSON.stringify(health.test) !== JSON.stringify(['CMD', '/nodejs/bin/node', 'dist/src/platform/health/container-healthcheck.js']) ||
      !['310s', '5m10s'].includes(health.start_period)) {
    throw new Error('ANALYSIS_HEALTH_DISABLED_OR_INVALID');
  }
  if (worker.user !== '65532:65532' || worker.read_only !== true ||
      !worker.tmpfs?.some((mount) => mount.startsWith('/tmp:'))) {
    throw new Error('ANALYSIS_HEALTH_ISOLATION_INVALID');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyAnalysisCompose(JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8')));
  console.log('scoped Analysis compose health verified');
}
