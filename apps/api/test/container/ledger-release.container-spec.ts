import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { dockerResult, imageUnderTest, inspectImage, runNode } from './docker-test.utils';

jest.setTimeout(180_000);

describe('Phase 05 immutable release image', () => {
  it('ships the compiled API, worker, migration, ledger worker, and Phase 05 migrations as non-root', () => {
    const config = inspectImage().Config as { User?: string; Env?: string[] };
    expect(config.User).toBe('65532:65532');
    expect(config.Env ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/(?:SECRET|TOKEN|PASSWORD|KEY)=.+/i)]),
    );
    expect(
      JSON.parse(
        runNode(`
      const fs=require('node:fs');
      console.log(JSON.stringify({
        api:fs.existsSync('/app/dist/src/main.js'),
        worker:fs.existsSync('/app/dist/src/worker.js'),
        migration:fs.existsSync('/app/dist/src/migration.js'),
        ledger:fs.existsSync('/app/dist/src/ledger/ledger.repository.js'),
        reconciliation:fs.existsSync('/app/dist/src/ledger/ledger.worker.js'),
        idempotency:fs.existsSync('/app/supabase/migrations/20260830080000_phase05_idempotency_bridge.sql'),
        grants:fs.existsSync('/app/supabase/migrations/20260830080300_phase05_ledger_access.sql'),
        source:fs.existsSync('/app/src/ledger')
      }));
    `),
      ),
    ).toEqual({
      api: true,
      worker: true,
      migration: true,
      ledger: true,
      reconciliation: true,
      idempotency: true,
      grants: true,
      source: false,
    });
  });

  it.each([
    ['dist/src/main.js', 'API_BOOTSTRAP_FAILED'],
    ['dist/src/worker.js', 'WORKER_BOOTSTRAP_FAILED'],
    ['dist/src/migration.js', 'MIGRATION_FAILED'],
  ])('runs %s read-only and fails closed without configuration', (command, marker) => {
    const result = dockerResult(['run', '--rm', '--read-only', imageUnderTest, command]);
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(marker);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/postgres(?:ql)?:\/\/|password|secret/i);
  });

  it('retains the Node healthcheck and drains an active ledger batch on shutdown', () => {
    const config = inspectImage().Config as { Healthcheck?: { Test?: string[] } };
    expect(config.Healthcheck?.Test).toEqual([
      'CMD',
      '/nodejs/bin/node',
      'dist/src/platform/health/container-healthcheck.js',
    ]);
    expect(
      JSON.parse(
        runNode(`
      const {LedgerWorker}=require('/app/dist/src/ledger/ledger.worker.js');
      let finish;
      const repository={reconcile:()=>new Promise(resolve=>{finish=resolve}),recordReconciliationMismatch:async()=>{}};
      const worker=new LedgerWorker(repository);
      const running=worker.runOnce();
      const stopping=worker.stop().then(()=>true);
      finish({rows:[],nextCursor:null});
      Promise.all([running,stopping]).then(([,stopped])=>console.log(JSON.stringify({stopped})));
    `),
      ),
    ).toEqual({ stopped: true });
  });

  it('keeps the optional ledger threshold secret-free and validates it at startup', () => {
    const template = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');
    expect(template).not.toMatch(/^MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS=.+$/m);
    expect(
      runNode(`
      const {validateEnvironment}=require('/app/dist/src/platform/config/environment.schema.js');
      const base={...process.env,MASARIFI_PROCESS_KIND:'migration',DATABASE_URL:'postgresql://x:x@localhost:5432/x',MASARIFI_RELEASE_VERSION:'test'};
      let rejected=false;
      try{validateEnvironment({...base,MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS:'SAR:0'});}catch{rejected=true;}
      console.log(JSON.stringify({rejected}));
    `),
    ).toContain('"rejected":true');
  });
});
