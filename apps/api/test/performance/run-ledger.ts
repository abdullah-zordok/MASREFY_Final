import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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
      else rejectRun(new Error(output || `${command.toUpperCase()}_FAILED`));
    });
  });
}

export function buildLedgerK6Arguments(): string[] {
  return [
    'run',
    '--summary-trend-stats=avg,min,med,max,p(50),p(90),p(95),p(99)',
    '--summary-export=test/performance/artifacts/ledger-summary.json',
    'test/performance/ledger.k6.js',
  ];
}

export function hasUnboundedLedgerPlan(plans: string): boolean {
  return /"Node Type": "Seq Scan"[\s\S]{0,500}"Relation Name": "(?:transactions|transaction_postings)"/.test(
    plans,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const k6DatabaseUrl = process.env.K6_DATABASE_URL ?? databaseUrl;
  if (!databaseUrl || !k6DatabaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const plansPath = 'test/performance/artifacts/ledger-plans.txt';
  await mkdir(dirname(plansPath), { recursive: true });
  const plans = await run(
    'psql',
    [
      '--no-psqlrc',
      '--single-transaction',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      "set session_replication_role = 'replica'",
      ...buildPsqlArguments('test/performance/ledger.sql'),
    ],
    buildPsqlEnvironment(databaseUrl),
  );
  await writeFile(plansPath, plans, 'utf8');
  if (hasUnboundedLedgerPlan(plans)) throw new Error('LEDGER_PERFORMANCE_UNBOUNDED_PLAN');
  const psqlEnvironment = buildPsqlEnvironment(databaseUrl);
  await run(
    'psql',
    [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'grant masarifi_api,masarifi_worker to current_user with inherit true,set true',
    ],
    psqlEnvironment,
  );
  try {
    await run('k6', buildLedgerK6Arguments(), buildOutboxK6Environment(k6DatabaseUrl, process.env));
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
      psqlEnvironment,
    );
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `LEDGER_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
}
