import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

import { buildOutboxK6Environment } from './run-outbox-k6';
import { buildPsqlArguments, buildPsqlEnvironment } from './run-psql';

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: environment, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('error', () => {
      reject(new Error(`${command.toUpperCase()}_NOT_AVAILABLE`));
    });
    child.once('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `${command.toUpperCase()}_FAILED`));
    });
  });
}

export function buildPlanningK6Arguments(): string[] {
  return [
    'run',
    '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
    '--summary-export=test/performance/artifacts/planning-summary.json',
    'test/performance/planning.k6.js',
  ];
}

export function hasUnboundedPlanningPlan(plans: string): boolean {
  return /"Node Type": "Seq Scan"[\s\S]{0,500}"Relation Name": "obligation_schedule_items"/.test(
    plans,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const k6Url = process.env.K6_DATABASE_URL ?? databaseUrl;
  if (!databaseUrl || !k6Url) throw new Error('DATABASE_URL_REQUIRED');
  await mkdir('test/performance/artifacts', { recursive: true });
  const plans = await run(
    'psql',
    [
      '--no-psqlrc',
      '--single-transaction',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      "set session_replication_role = 'replica'",
      ...buildPsqlArguments('test/performance/planning.sql'),
    ],
    buildPsqlEnvironment(databaseUrl),
  );
  await writeFile('test/performance/artifacts/planning-plans.txt', plans, 'utf8');
  if (hasUnboundedPlanningPlan(plans)) throw new Error('PLANNING_PERFORMANCE_UNBOUNDED_PLAN');
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
    await run('k6', buildPlanningK6Arguments(), buildOutboxK6Environment(k6Url, process.env));
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
      `PLANNING_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
