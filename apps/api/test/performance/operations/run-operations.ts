import 'reflect-metadata';

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { OperationsController } from '../../../src/operations/operations.controller';
import { OperationsRepository } from '../../../src/operations/operations.repository';
import { OperationsService } from '../../../src/operations/operations.service';
import { PoolService } from '../../../src/platform/database/pool.service';
import { AdminAuthGuard } from '../../../src/security/admin-auth.guard';

const executeFile = promisify(execFile);
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.K6_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stress = process.argv.includes('--stress');

function runSql(path: string, capture = false): string {
  const result = spawnSync(
    process.execPath,
    [require.resolve('ts-node/dist/bin.js'), 'test/performance/run-psql.ts', path],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: capture ? 'utf8' : undefined,
      stdio: capture ? 'pipe' : 'inherit',
    },
  );
  if (result.error || result.status !== 0) throw new Error('OPERATIONS_SQL_FAILED');
  const output = capture ? String(result.stdout) : '';
  if (output) process.stdout.write(output);
  return output;
}

function runJest(): void {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--selectProjects',
      'performance',
      '--runInBand',
      '--testPathPatterns=operations',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, MASARIFI_OPERATIONS_STRESS: stress ? '1' : '0' },
      stdio: 'inherit',
    },
  );
  if (result.error || result.status !== 0) throw new Error('OPERATIONS_PERFORMANCE_TEST_FAILED');
}

async function runHttpLoad(): Promise<void> {
  const pool = new PoolService({
    get: (key: string) => (key === 'DATABASE_URL' ? databaseUrl : 10),
  } as never);
  await pool.query('grant masarifi_api to current_user with set true, inherit false');
  const service = new OperationsService(new OperationsRepository(pool));
  const module = await Test.createTestingModule({
    controllers: [OperationsController],
    providers: [
      {
        provide: OperationsService,
        useValue: service,
      },
    ],
  })
    .overrideGuard(AdminAuthGuard)
    .useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest<{ clerkPrincipal?: unknown }>().clerkPrincipal = {
          userId: 'operations-performance',
          sessionId: 'operations-performance',
          claims: {},
        };
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  try {
    await executeFile(
      'k6',
      [
        'run',
        '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
        '--summary-export',
        `test/performance/artifacts/operations-${stress ? 'stress' : 'load'}-summary.json`,
        'test/performance/operations/operations.k6.js',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MASARIFI_BASE_URL: await app.getUrl(),
          MASARIFI_TEST_JWT: 'signed.performance.fixture',
          MASARIFI_OPERATIONS_STRESS: stress ? '1' : '0',
        },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 120_000,
      },
    );
  } finally {
    await app.close();
    await pool.query('revoke masarifi_api from current_user granted by current_user');
    await pool.onModuleDestroy();
  }
}

async function run(): Promise<void> {
  runSql('test/performance/operations/operations-clean.sql');
  try {
    runSql('test/performance/operations/operations-seed.sql');
    const plans = runSql('test/performance/operations/operations-explain.sql', true);
    for (const index of [
      'scheduled_jobs_due_idx',
      'job_runs_status_time_idx',
      'provider_checks_key_time_idx',
      'system_incidents_status_time_idx',
      'feature_flag_rules_eval_idx',
      'maintenance_status_time_idx',
    ])
      if (!plans.includes(index)) throw new Error(`OPERATIONS_PLAN_MISSING:${index}`);
    runJest();
    await runHttpLoad();
  } finally {
    runSql('test/performance/operations/operations-clean.sql');
  }
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'OPERATIONS_PERFORMANCE_FAILED'}\n`,
  );
  process.exitCode = 1;
});
