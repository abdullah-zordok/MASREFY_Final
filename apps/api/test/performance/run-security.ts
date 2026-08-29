import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { Pool, type PoolClient } from 'pg';

function percentile(values: number[], value: number): number {
  return (
    values.toSorted((left, right) => left - right)[Math.ceil(values.length * value) - 1] ??
    Number.POSITIVE_INFINITY
  );
}

async function samples(count: number, action: () => Promise<unknown>): Promise<number[]> {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await action();
    values.push(performance.now() - startedAt);
  }
  return values;
}

async function acceptanceSamples(
  count: number,
  action: (index: number) => Promise<unknown>,
): Promise<{
  p95Ms: number;
  p99Ms: number;
  payloadBytes: number;
}> {
  const durations: number[] = [];
  let payloadBytes = 0;
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    const result = await action(index);
    durations.push(performance.now() - startedAt);
    payloadBytes = Math.max(payloadBytes, Buffer.byteLength(JSON.stringify(result)));
  }
  return {
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(3)),
    payloadBytes,
  };
}

async function plan(client: PoolClient, sql: string): Promise<unknown> {
  return (
    await client.query<{ 'QUERY PLAN': unknown }>(`explain (analyze,buffers,format json) ${sql}`)
  ).rows[0]?.['QUERY PLAN'];
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('grant masarifi_migration to current_user with set true,inherit false');
    await client.query('set local role masarifi_migration');
    await client.query(
      "insert into public.profiles(id,status) values('performance_admin','active') on conflict(id) do update set status='active'",
    );
    await client.query(
      "insert into public.admin_profiles(user_id,status) values('performance_admin','active') on conflict(user_id) do update set status='active'",
    );
    await client.query(`insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
      select 'performance_admin',id,'performance_admin','Performance permission fixture' from public.roles where key='super-admin'
      on conflict(user_id,role_id) where revoked_at is null do nothing`);
    await client.query(`insert into public.security_events(user_id,event_type,severity,metadata,occurred_at)
      select 'performance_admin','security.performance-sample',case when sample%100=0 then 'high' else 'info' end,
        jsonb_build_object('sample',sample%1000),clock_timestamp()-(sample%2592000)*interval '1 second'
      from generate_series(1,1000000) sample`);
    await client.query('analyze public.security_events');

    const permission = await samples(500, () =>
      client.query(
        "select private.admin_has_permission('performance_admin','audit.read',clock_timestamp())",
      ),
    );
    const owner = await samples(100, () =>
      client.query(`select id,event_type,severity,occurred_at,metadata
      from public.security_events where user_id='performance_admin' order by occurred_at desc,id desc limit 100`),
    );
    const ownerPage = (
      await client.query(`select id,event_type,severity,occurred_at,metadata from public.security_events
      where user_id='performance_admin' order by occurred_at desc,id desc limit 100`)
    ).rows;
    await client.query(`insert into public.profiles(id,status)
      select 'performance_customer_'||sample,'active' from generate_series(0,49) sample`);
    const privacyAcceptance = await acceptanceSamples(
      25,
      async (index) =>
        (
          await client.query(
            `insert into private.privacy_export_requests(user_id,status,scope,verified_at)
       values($1,'verified','["identity@1"]',clock_timestamp())
       returning id,status,scope,requested_at as "requestedAt",version::int`,
            [`performance_customer_${String(index)}`],
          )
        ).rows[0] as unknown,
    );
    const deletionAcceptance = await acceptanceSamples(
      25,
      async (index) =>
        (
          await client.query(
            `insert into private.account_deletion_requests(user_id,status,verified_at,cooling_off_ends_at)
       values($1,'verified',clock_timestamp(),clock_timestamp()+interval '72 hours')
       returning id,status,requested_at as "requestedAt",cooling_off_ends_at as "coolingOffEndsAt",version::int`,
            [`performance_customer_${String(index + 25)}`],
          )
        ).rows[0] as unknown,
    );
    const evidence = {
      dataset: {
        securityEventRows: 1_000_000,
        hash: createHash('sha256').update('security-events:1000000:v1').digest('hex'),
      },
      permission: {
        samples: permission.length,
        p95Ms: Number(percentile(permission, 0.95).toFixed(3)),
        p99Ms: Number(percentile(permission, 0.99).toFixed(3)),
        thresholdP95Ms: 25,
      },
      ownerEvents: {
        samples: owner.length,
        p95Ms: Number(percentile(owner, 0.95).toFixed(3)),
        p99Ms: Number(percentile(owner, 0.99).toFixed(3)),
        payloadBytes: Buffer.byteLength(JSON.stringify(ownerPage)),
        thresholdP95Ms: 300,
        thresholdP99Ms: 600,
        thresholdPayloadBytes: 204_800,
      },
      acceptance: {
        privacyExport: {
          ...privacyAcceptance,
          thresholdP95Ms: 300,
          thresholdP99Ms: 600,
          thresholdPayloadBytes: 51_200,
        },
        deletionRequest: {
          ...deletionAcceptance,
          thresholdP95Ms: 300,
          thresholdP99Ms: 600,
          thresholdPayloadBytes: 51_200,
        },
      },
      plans: {
        permission: await plan(
          client,
          "select private.admin_has_permission('performance_admin','audit.read',clock_timestamp())",
        ),
        ownerEvents: await plan(
          client,
          `select id,event_type,severity,occurred_at,metadata from public.security_events
          where user_id='performance_admin' order by occurred_at desc,id desc limit 100`,
        ),
        retention: await plan(
          client,
          `select resource_type,retention_days from private.retention_policies
          where enabled order by resource_type limit 25`,
        ),
        privacyClaim: await plan(
          client,
          `select id from private.privacy_export_requests
          where status='verified' order by requested_at,id limit 25`,
        ),
        deletionClaim: await plan(
          client,
          `select id from private.account_deletion_requests
          where status='verified' order by cooling_off_ends_at,id limit 25`,
        ),
      },
    };
    const passed =
      evidence.permission.p95Ms <= evidence.permission.thresholdP95Ms &&
      evidence.ownerEvents.p95Ms <= evidence.ownerEvents.thresholdP95Ms &&
      evidence.ownerEvents.p99Ms <= evidence.ownerEvents.thresholdP99Ms &&
      evidence.ownerEvents.payloadBytes <= evidence.ownerEvents.thresholdPayloadBytes &&
      Object.values(evidence.acceptance).every(
        (value) =>
          value.p95Ms <= value.thresholdP95Ms &&
          value.p99Ms <= value.thresholdP99Ms &&
          value.payloadBytes <= value.thresholdPayloadBytes,
      );
    if (!passed) throw new Error('SECURITY_PERFORMANCE_THRESHOLD_FAILED');
    await writeFile(
      'test/performance/artifacts/security-permission-summary.json',
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
      `SECURITY_PERFORMANCE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`,
    );
    process.exitCode = 1;
  });
}
