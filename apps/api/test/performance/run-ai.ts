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
      else reject(new Error(output));
    });
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL,
    k6Url = process.env.K6_DATABASE_URL ?? databaseUrl;
  const stress = process.argv.includes('--stress');
  if (!databaseUrl || !k6Url) throw new Error('DATABASE_URL_REQUIRED');
  const environment = buildPsqlEnvironment(databaseUrl);
  await mkdir('test/performance/artifacts', { recursive: true });
  await run(
    'psql',
    [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'grant masarifi_api,masarifi_worker,masarifi_migration to current_user with inherit true,set true',
    ],
    environment,
  );
  try {
    const plans = await run('psql', buildPsqlArguments('test/performance/ai.sql'), environment);
    await writeFile('test/performance/artifacts/ai-plans.txt', plans, 'utf8');
    for (const index of [
      'ai_usage_events_owner_time_idx',
      'ai_failure_events_workload_time_idx',
      'voice_sessions_expiry_idx',
    ])
      if (!plans.includes(index)) throw new Error(`AI_PERFORMANCE_INDEX_MISSING:${index}`);
    if (
      /"Node Type": "Seq Scan"[\s\S]{0,500}"Relation Name": "ai_(?:usage|failure)_events"/.test(
        plans,
      )
    )
      throw new Error('AI_PERFORMANCE_UNBOUNDED_PLAN');
    await run(
      'k6',
      [
        'run',
        '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
        `--summary-export=test/performance/artifacts/ai${stress ? '-stress' : ''}-summary.json`,
        ...(stress ? ['--env', 'AI_STRESS=1'] : []),
        'test/performance/ai.k6.js',
      ],
      buildOutboxK6Environment(k6Url, process.env),
    );
  } finally {
    await run(
      'psql',
      [
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        "grant masarifi_migration to current_user with set true,inherit false; set role masarifi_migration; delete from private.ai_usage_events where user_id like 'ai_performance_%'; delete from public.profiles where id like 'ai_performance_%'; reset role; revoke masarifi_api,masarifi_worker,masarifi_migration from current_user granted by current_user",
      ],
      environment,
    );
  }
}

if (require.main === module)
  void main().catch((error: unknown) => {
    process.stderr.write(
      `AI_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
