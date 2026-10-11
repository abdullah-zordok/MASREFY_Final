'use strict';
// Construct the deployed module shape without starting any worker or external I/O.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const test = require('node:test');

if (process.argv[2] === 'child') {
  Object.assign(process.env, {
    NODE_ENV: 'test', MASARIFI_PROCESS_KIND: 'worker', MASARIFI_RELEASE_VERSION: 'a'.repeat(40),
    DATABASE_URL: 'postgresql://user:password@127.0.0.1:1/offline',
    CLERK_SECRET_KEY: ['sk', 'test', 'nonfunctionalfixture'].join('_'),
    CLERK_PUBLISHABLE_KEY: ['pk', 'test', 'nonfunctionalfixture'].join('_'),
    CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
    CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test',
    MASARIFI_PUSH_TOKEN_HASH_KEY: Buffer.alloc(32, 1).toString('base64url'),
    MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS: `active:${Buffer.alloc(32, 2).toString('base64url')}`,
    MASARIFI_SECURITY_IP_HASH_KEYS: `active:${Buffer.alloc(32, 3).toString('base64url')}`,
    MASARIFI_EXPORT_MAX_BYTES: '16777216', MASARIFI_EXPORT_MAX_ENTRIES: '100',
    MASARIFI_EXPORT_RETENTION_HOURS: '24', MASARIFI_DELETION_COOLING_OFF_HOURS: '72',
    MASARIFI_SECURITY_WORKER_POLL_MS: '500', MASARIFI_SECURITY_JOB_BATCH_SIZE: '25',
    MASARIFI_PRIVACY_HANDLER_MANIFEST: 'identity@1',
    EMAIL_SMTP_HOST: 'smtp.example.test', EMAIL_SMTP_PORT: '465',
    EMAIL_SMTP_USERNAME: 'smtp-user', EMAIL_SMTP_PASSWORD: 'nonfunctional-smtp-password',
    EMAIL_FROM: 'reports@example.test',
    SUPABASE_URL: 'https://qcffvfbpzvpwcwxwjyro.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'local_nonfunctional_service_role_fixture',
    MASARIFI_VOICE_ANALYSIS_ONLY: 'false', MASARIFI_AI_ASSISTANT_ONLY: 'false',
    OPENROUTER_API_KEY: ['offline', 'nonfunctional', 'fixture'].join('_'),
    MASARIFI_AI_PROVIDER_ENABLED: 'true', MASARIFI_AI_WORKER_POLL_MS: '500',
    MASARIFI_AI_JOB_BATCH_SIZE: '1', MASARIFI_AI_MAX_CONCURRENCY: '1',
    MASARIFI_AI_LEASE_SECONDS: '120',
    MASARIFI_STAGING_VOICE_EPOCH_ID: '11111111-1111-4111-8111-111111111111'
  });
  let databaseCalls = 0, networkCalls = 0, workerStarts = 0;
  const forbidDatabase = () => { databaseCalls++; throw Error('OFFLINE_DATABASE_FORBIDDEN'); };
  const pg = require(resolve(__dirname, '../../apps/api/node_modules/pg'));
  pg.Pool.prototype.connect = forbidDatabase;
  pg.Pool.prototype.query = forbidDatabase;
  pg.Client.prototype.connect = forbidDatabase;
  global.fetch = () => { networkCalls++; throw Error('OFFLINE_NETWORK_FORBIDDEN'); };
  for (const moduleName of ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls']) {
    const network = require(moduleName);
    for (const name of ['request', 'get', 'connect', 'createConnection']) {
      if (typeof network[name] === 'function')
        network[name] = () => { networkCalls++; throw Error('OFFLINE_NETWORK_FORBIDDEN'); };
    }
  }
  const { StagingVoiceWorker } = require(resolve(__dirname, '../../apps/api/dist/src/ai/staging-voice.worker'));
  const { AiWorker } = require(resolve(__dirname, '../../apps/api/dist/src/ai/ai.worker'));
  const { EngagementWorker } = require(resolve(__dirname, '../../apps/api/dist/src/engagement/engagement.worker'));
  for (const worker of [StagingVoiceWorker, AiWorker, EngagementWorker])
    worker.prototype.start = () => { workerStarts++; throw Error('OFFLINE_WORKER_START_FORBIDDEN'); };
  StagingVoiceWorker.prototype.tick = () => { workerStarts++; throw Error('OFFLINE_WORKER_START_FORBIDDEN'); };
  const { NestFactory } = require(resolve(__dirname, '../../apps/api/node_modules/@nestjs/core'));
  const { StagingVoiceWorkerModule } = require(resolve(__dirname, '../../apps/api/dist/src/staging-voice-worker.module'));
  (async () => {
    const application = await NestFactory.createApplicationContext(StagingVoiceWorkerModule, { abortOnError: false, logger: false });
    try {
      assert.ok(application.get(StagingVoiceWorker));
      assert.ok(application.get(EngagementWorker));
    } finally { await application.close(); }
    assert.deepEqual({ databaseCalls, networkCalls, workerStarts }, { databaseCalls: 0, networkCalls: 0, workerStarts: 0 });
    console.log('OFFLINE_MODULE_CONSTRUCTED_AND_CLOSED');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  test('compiled financial and confirmation dependencies construct and close without workers or external calls', () => {
    const environment = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'])
      if (process.env[key]) environment[key] = process.env[key];
    const child = spawnSync(process.execPath, [__filename, 'child'], { env: environment, encoding: 'utf8', timeout: 20000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, '');
    assert.equal(child.stdout.trim(), 'OFFLINE_MODULE_CONSTRUCTED_AND_CLOSED');
  });
}
