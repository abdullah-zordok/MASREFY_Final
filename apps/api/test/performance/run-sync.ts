import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

import { buildOutboxK6Environment } from './run-outbox-k6';
import { buildPsqlArguments, buildPsqlEnvironment } from './run-psql';

function run(
  command: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: environment,
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('error', () => {
      rejectRun(new Error(`${command.toUpperCase()}_NOT_AVAILABLE`));
    });
    child.once('exit', (code) => {
      if (code === 0) resolveRun(output);
      else rejectRun(new Error(output));
    });
  });
}

export function buildSyncK6Arguments(): string[] {
  return [
    'run',
    '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
    '--summary-export=test/performance/artifacts/sync-summary.json',
    'test/performance/sync.k6.js',
  ];
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const k6DatabaseUrl = process.env.K6_DATABASE_URL ?? databaseUrl;
  if (!databaseUrl || !k6DatabaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  await mkdir('test/performance/artifacts', { recursive: true });
  const plans = await run(
    'psql',
    buildPsqlArguments('test/performance/sync.sql'),
    buildPsqlEnvironment(databaseUrl),
  );
  await writeFile('test/performance/artifacts/sync-plans.txt', plans, 'utf8');
  for (const index of ['outbox_events_sync_delta_idx', 'client_mutations_claim_idx'])
    if (!plans.includes(index)) throw new Error(`SYNC_PERFORMANCE_INDEX_MISSING:${index}`);
  const environment = buildPsqlEnvironment(databaseUrl);
  await run(
    'psql',
    [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'grant masarifi_api,masarifi_worker to current_user with inherit true,set true',
    ],
    environment,
  );
  try {
    await run('k6', buildSyncK6Arguments(), buildOutboxK6Environment(k6DatabaseUrl, process.env));
  } finally {
    await run(
      'psql',
      [
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'revoke masarifi_api,masarifi_worker from current_user granted by current_user',
      ],
      environment,
    );
  }
}

if (require.main === module)
  void main().catch((error: unknown) => {
    process.stderr.write(
      `SYNC_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
