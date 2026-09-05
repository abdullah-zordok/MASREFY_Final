import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import sql from 'k6/x/sql';
import postgres from 'k6/x/sql/driver/postgres';

const databaseUrl = __ENV.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
const db = sql.open(postgres, databaseUrl, { max_open_conns: 5, max_idle_conns: 5 });
const deltaDuration = new Trend('sync_delta_duration_ms', true);
const mutationDuration = new Trend('sync_mutation_batch_duration_ms', true);
const payloadBytes = new Trend('sync_payload_bytes');
const failures = new Rate('sync_failures');
const owner = 'sync_performance_owner';
const claims = JSON.stringify({ role: 'authenticated', sub: owner, sid: 'performance' });

export const options = {
  scenarios: {
    delta: { executor: 'constant-vus', vus: 3, duration: '10s', exec: 'delta' },
    mutations: { executor: 'constant-vus', vus: 2, duration: '10s', exec: 'mutations' },
  },
  thresholds: {
    checks: ['rate==1'],
    sync_failures: ['rate==0'],
    sync_delta_duration_ms: ['p(95)<500'],
    sync_mutation_batch_duration_ms: ['p(95)<800'],
    sync_payload_bytes: ['max<524288'],
  },
};

export function delta() {
  const started = Date.now();
  try {
    const rows = db.query(
      `with context as materialized (
         select set_config('request.jwt.claims',$1,false),set_config('role','masarifi_api',false)
       ) select delta.* from context
       cross join lateral private.get_sync_delta($2,$3,$4,$5) delta`,
      claims,
      owner,
      'accounts',
      50000,
      500,
    );
    deltaDuration.add(Date.now() - started);
    payloadBytes.add(JSON.stringify(rows).length);
    failures.add(false);
    check(rows, { 'delta is bounded': (value) => value.length === 500 });
  } catch (_) {
    failures.add(true);
  }
}

export function mutations() {
  const started = Date.now();
  try {
    const nonce = `${__VU}:${__ITER}:${Date.now()}`;
    const rows = db.query(
      `with context as materialized (
         select set_config('request.jwt.claims',$1,false),set_config('role','masarifi_api',false)
       ) select count(*)::int total from context cross join generate_series(1,100) sample
       cross join lateral private.receive_client_mutation(
         $2,$3,0,md5($4||sample)::uuid,'accounts','account',1,'{}'::uuid[],
         'create',null,null,$5,$6::jsonb
       )`,
      claims,
      owner,
      '75000000-0000-4000-8000-000000000001',
      nonce,
      `sha256:${'b'.repeat(64)}`,
      JSON.stringify({ name: 'Performance account' }),
    );
    mutationDuration.add(Date.now() - started);
    payloadBytes.add(JSON.stringify(rows).length + 100 * 128);
    failures.add(false);
    check(rows, { '100-operation batch is accepted': (value) => value[0]?.total === 100 });
  } catch (_) {
    failures.add(true);
  }
}

export function teardown() {
  db.close();
}
