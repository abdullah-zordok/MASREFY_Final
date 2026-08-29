import 'reflect-metadata';

import type { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';

import { Test } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { ClerkAuthGuard } from '../../src/identity/clerk-auth.guard';
import { ReferenceController } from '../../src/reference/reference.controller';
import { ReferenceRepository } from '../../src/reference/reference.repository';
import { ReferenceService } from '../../src/reference/reference.service';
import { AdminAuthGuard } from '../../src/security/admin-auth.guard';

const percentile = (values: number[], fraction: number): number =>
  values.toSorted((left, right) => left - right)[Math.ceil(values.length * fraction) - 1] ??
  Number.POSITIVE_INFINITY;

async function samples(count: number, action: () => Promise<unknown>): Promise<number[]> {
  const durations: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await action();
    durations.push(performance.now() - startedAt);
  }
  return durations;
}

async function plan(client: PoolClient, sql: string): Promise<unknown> {
  return (
    await client.query<{ 'QUERY PLAN': unknown }>(`explain (analyze,buffers,format json) ${sql}`)
  ).rows[0]?.['QUERY PLAN'];
}

async function httpEvidence(): Promise<{
  coldMs: number;
  warmP95Ms: number;
  warmP99Ms: number;
  payloadBytes: number;
  hashChecks: number;
  invalidated: boolean;
}> {
  let digest = 'hash-1';
  let reads = 0;
  let hashChecks = 0;
  const repository = {
    sharedHash: () => {
      hashChecks += 1;
      return Promise.resolve(digest);
    },
    execute: () => {
      reads += 1;
      return Promise.resolve([{ code: 'SAR', name: `Saudi Riyal ${String(reads)}`, minorUnit: 2 }]);
    },
  };
  const principal = { userId: 'performance_user', sessionId: 'session', factorAgeSeconds: 0 };
  const setPrincipal = (context: ExecutionContext): boolean => {
    Object.assign(context.switchToHttp().getRequest<object>(), { clerkPrincipal: principal });
    return true;
  };
  const module = await Test.createTestingModule({
    controllers: [ReferenceController],
    providers: [ReferenceService, { provide: ReferenceRepository, useValue: repository }],
  })
    .overrideGuard(ClerkAuthGuard)
    .useValue({ canActivate: setPrincipal })
    .overrideGuard(AdminAuthGuard)
    .useValue({ canActivate: setPrincipal })
    .compile();
  const app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('REFERENCE_HTTP_ADDRESS_INVALID');
  const url = `http://127.0.0.1:${String(address.port)}/api/v1/reference/currencies`;
  try {
    const startedAt = performance.now();
    const cold = await fetch(url);
    const coldMs = performance.now() - startedAt;
    const payload = await cold.text();
    const warm = await samples(100, async () => {
      const response = await fetch(url);
      await response.arrayBuffer();
    });
    digest = 'hash-2';
    await fetch(url);
    return {
      coldMs,
      warmP95Ms: percentile(warm, 0.95),
      warmP99Ms: percentile(warm, 0.99),
      payloadBytes: Buffer.byteLength(payload),
      hashChecks,
      invalidated: reads === 2,
    };
  } finally {
    await app.close();
  }
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("set local session_replication_role = 'replica'");
    await client.query('grant masarifi_migration to current_user with set true,inherit false');
    await client.query('set local role masarifi_migration');
    await client.query(
      "insert into public.profiles(id,status) values('reference_performance_user','active') on conflict(id) do update set status='active'",
    );
    await client.query(
      "insert into public.profiles(id,status) values('reference_performance_other','active') on conflict(id) do update set status='active'",
    );
    await client.query(`insert into public.categories(user_id,kind,label_ar,label_en,sort_order)
      select case when sample % 1000 = 0 then 'reference_performance_user' else 'reference_performance_other' end,
        'expense','perf-ar-'||sample,'perf-en-'||sample,sample
      from generate_series(1,100000) sample`);
    await client.query(`insert into public.accounts(user_id,name,type,currency_code,sort_order)
      select case when sample % 1000 = 0 then 'reference_performance_user' else 'reference_performance_other' end,
        'Account '||sample,'cash','SAR',sample
      from generate_series(1,100000) sample`);
    await client.query('analyze public.categories');
    await client.query('analyze public.accounts');
    const categorySql = `select id,kind,sort_order from public.categories where user_id='reference_performance_user' and active order by sort_order,id limit 100`;
    const accountSql = `select id,status,sort_order from public.accounts where user_id='reference_performance_user' and status='active' order by sort_order,id limit 100`;
    const categories = await samples(100, () => client.query(categorySql));
    const accounts = await samples(100, () => client.query(accountSql));
    const http = await httpEvidence();
    const plans = {
      categories: await plan(client, categorySql),
      accounts: await plan(client, accountSql),
    };
    const evidence = {
      dataset: { categories: 100000, accounts: 100000 },
      categories: { p95Ms: percentile(categories, 0.95), thresholdP95Ms: 100 },
      accounts: { p95Ms: percentile(accounts, 0.95), thresholdP95Ms: 100 },
      http: {
        ...http,
        thresholdP95Ms: 300,
        thresholdP99Ms: 600,
        thresholdPayloadBytes: 153600,
      },
      ownerPlansIndexed: !JSON.stringify(plans).includes('"Node Type":"Seq Scan"'),
      plans,
    };
    const passed =
      evidence.categories.p95Ms <= evidence.categories.thresholdP95Ms &&
      evidence.accounts.p95Ms <= evidence.accounts.thresholdP95Ms &&
      evidence.http.warmP95Ms <= evidence.http.thresholdP95Ms &&
      evidence.http.warmP99Ms <= evidence.http.thresholdP99Ms &&
      evidence.http.payloadBytes <= evidence.http.thresholdPayloadBytes &&
      evidence.http.hashChecks === 102 &&
      evidence.http.invalidated &&
      evidence.ownerPlansIndexed;
    if (!passed) throw new Error('REFERENCE_PERFORMANCE_THRESHOLD_FAILED');
    await writeFile(
      'test/performance/artifacts/reference-summary.json',
      `${JSON.stringify({ ...evidence, passed }, null, 2)}\n`,
      'utf8',
    );
    await client.query('rollback');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    process.stderr.write(
      `REFERENCE_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
}
