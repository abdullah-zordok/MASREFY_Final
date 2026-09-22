import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
const expected = {
  api: { command: 'dist/src/main.js', kind: 'api', healthcheckDisabled: false },
  worker: { command: 'dist/src/worker.js', kind: 'worker', healthcheckDisabled: true },
  migration: {
    command: 'dist/src/migration.js',
    kind: 'migration',
    healthcheckDisabled: true,
  },
};
const images = new Set();

for (const [name, contract] of Object.entries(expected)) {
  const service = config.services?.[name];
  if (!service) throw new Error(`Missing service: ${name}`);
  if (!/^[^\s@:]+(?:\/[^\s@:]+)+@sha256:[a-f0-9]{64}$/.test(service.image)) {
    throw new Error(`${name} must use an immutable sha256 image digest`);
  }
  images.add(service.image);
  if (service.command?.length !== 1 || service.command[0] !== contract.command) {
    throw new Error(`Unexpected ${name} command`);
  }
  if (service.environment?.MASARIFI_PROCESS_KIND !== contract.kind) {
    throw new Error(`Unexpected ${name} process kind`);
  }
  if (service.environment?.COMPOSE_SENTINEL !== name) {
    throw new Error(`${name} must use its own environment file`);
  }
  if (
    service.user !== '65532:65532' ||
    service.read_only !== true ||
    !service.cap_drop?.includes('ALL') ||
    !service.security_opt?.includes('no-new-privileges:true')
  ) {
    throw new Error(`Unsafe ${name} container contract`);
  }
  if (Boolean(service.healthcheck?.disable) !== contract.healthcheckDisabled) {
    throw new Error(`Unexpected ${name} healthcheck contract`);
  }
}

if (images.size !== 1) throw new Error('All backend processes must use one image digest');

const apiPort = config.services.api.ports?.[0];
if (
  config.services.api.ports?.length !== 1 ||
  apiPort.host_ip !== '127.0.0.1' ||
  apiPort.target !== 3000
) {
  throw new Error('API must publish only port 3000 on loopback');
}
if (config.services.worker.ports || config.services.migration.ports) {
  throw new Error('Worker and migration must not publish ports');
}
if (config.networks?.backend?.internal === true) {
  throw new Error('Backend network must retain required provider egress');
}

console.log('staging compose contract verified');
