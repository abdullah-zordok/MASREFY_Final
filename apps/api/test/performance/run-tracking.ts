import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { parseTrackingCsv } from '../../src/tracking/tracking.parser';
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

function measureCsv(): { rows: number; durationMs: number; heapDeltaBytes: number; bytes: number } {
  const lines = ['sourceItemKey,receivedAt,body'];
  for (let row = 1; row <= 10_000; row += 1)
    lines.push(`row-${String(row)},2026-09-02T12:00:00.000Z,Fictional purchase ${String(row)}`);
  const payload = Buffer.from(lines.join('\n'));
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const parsed = parseTrackingCsv(payload);
  const summary = {
    rows: parsed.length,
    durationMs: Number((performance.now() - started).toFixed(2)),
    heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heapBefore),
    bytes: payload.length,
  };
  if (
    summary.rows !== 10_000 ||
    summary.durationMs >= 5_000 ||
    summary.heapDeltaBytes >= 134_217_728
  )
    throw new Error(`TRACKING_CSV_PERFORMANCE_FAILED:${JSON.stringify(summary)}`);
  return summary;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const k6Url = process.env.K6_DATABASE_URL ?? databaseUrl;
  const stress = process.argv.includes('--stress');
  if (!databaseUrl || !k6Url) throw new Error('DATABASE_URL_REQUIRED');
  await mkdir('test/performance/artifacts', { recursive: true });
  await writeFile(
    'test/performance/artifacts/tracking-csv-summary.json',
    JSON.stringify(measureCsv(), null, 2),
  );
  const plans = await run(
    'psql',
    buildPsqlArguments('test/performance/tracking.sql'),
    buildPsqlEnvironment(databaseUrl),
  );
  await writeFile('test/performance/artifacts/tracking-plans.txt', plans, 'utf8');
  for (const index of ['tracking_history_owner_cursor_idx', 'import_items_session_status_idx'])
    if (!plans.includes(index)) throw new Error(`TRACKING_PERFORMANCE_INDEX_MISSING:${index}`);
  if (/"Node Type": "Seq Scan"[\s\S]{0,500}"Relation Name": "tracking_history"/.test(plans))
    throw new Error('TRACKING_HISTORY_UNBOUNDED_PLAN');
  const args = [
    'run',
    '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
    `--summary-export=test/performance/artifacts/tracking${stress ? '-stress' : ''}-summary.json`,
    ...(stress ? ['--env', 'TRACKING_STRESS=1'] : []),
    'test/performance/tracking.k6.js',
  ];
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
    await run('k6', args, buildOutboxK6Environment(k6Url, process.env));
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
      `TRACKING_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
