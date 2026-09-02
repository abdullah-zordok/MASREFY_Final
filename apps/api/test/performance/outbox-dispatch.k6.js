import { check, sleep } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import sql from 'k6/x/sql';
import postgres from 'k6/x/sql/driver/postgres';

const databaseUrl = __ENV.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
const db = sql.open(postgres, databaseUrl, {
  max_open_conns: 1,
  max_idle_conns: 1,
  conn_max_lifetime: '5m',
});
const claimDuration = new Trend('outbox_claim_duration_ms', true);
const publicationDuration = new Trend('outbox_publication_duration_ms', true);
const claimFailure = new Rate('outbox_claim_failure');
const throughput = new Counter('outbox_published');
const backlog = new Gauge('outbox_unpublished_backlog');
const databaseSessionMemory = new Gauge('outbox_database_session_memory_bytes');
const claimBatchSize = 50;
const stress = __ENV.MASARIFI_STRESS === '1';

const normalScenarios = {
  concurrent_claim: {
    executor: 'constant-vus',
    vus: 5,
    duration: '45s',
    exec: 'dispatch',
  },
  queue_slowdown: {
    executor: 'constant-vus',
    vus: 5,
    duration: '30s',
    startTime: '45s',
    exec: 'slowdown',
  },
  queue_outage: {
    executor: 'constant-vus',
    vus: 5,
    duration: '15s',
    startTime: '75s',
    exec: 'outage',
  },
  worker_restart_replay: {
    executor: 'constant-vus',
    vus: 10,
    duration: '30s',
    startTime: '90s',
    exec: 'recover',
  },
  lease_churn: {
    executor: 'constant-vus',
    vus: 5,
    duration: '30s',
    startTime: '120s',
    exec: 'leaseChurn',
  },
  backlog_recovery: {
    executor: 'constant-vus',
    vus: 30,
    duration: '60s',
    startTime: '150s',
    exec: 'recover',
  },
};

export const options = {
  scenarios: stress
    ? {
        stress_recovery: {
          executor: 'ramping-vus',
          startVUs: 10,
          stages: [
            { duration: '30s', target: 50 },
            // ponytail: leaves connection headroom in the local Supabase stack; raise with a pooler.
            { duration: '1m', target: 75 },
            { duration: '30s', target: 0 },
          ],
          exec: 'recover',
        },
      }
    : normalScenarios,
  thresholds: {
    checks: ['rate==1'],
    outbox_claim_failure: ['rate<0.01'],
    ...(stress ? {} : { 'outbox_claim_duration_ms{phase:steady}': ['p(95)<50', 'p(99)<100'] }),
    outbox_publication_duration_ms: ['p(50)>=0', 'p(95)<500', 'p(99)<1000'],
    outbox_database_session_memory_bytes: ['value>0'],
  },
};

function claim(leaseSeconds, phase) {
  const started = Date.now();
  try {
    const rows = [
      ...db.query(
        'select * from private.claim_outbox_batch($1, $2, $3)',
        `k6-${__VU}`,
        claimBatchSize,
        leaseSeconds,
      ),
    ];
    claimDuration.add(Date.now() - started, { phase });
    claimFailure.add(false);
    return rows;
  } catch (error) {
    if (__ITER === 0) {
      console.error(String(error).replace(/postgres(?:ql)?:\/\/[^@\s]+@/g, 'postgresql://[redacted]@'));
    }
    claimFailure.add(true);
    return [];
  }
}

function recordBacklog() {
  if (__VU !== 1 || __ITER % 20 !== 0) return;
  const rows = [
    ...db.query(
      'select count(*)::bigint as total from private.outbox_events where published_at is null',
    ),
  ];
  backlog.add(Number(rows[0]?.total ?? 0));
}

function recordDatabaseSessionMemory() {
  if (__VU !== 1 || __ITER % 20 !== 0) return;
  const rows = [
    ...db.query(
      'select coalesce(sum(total_bytes), 0)::bigint as bytes from pg_backend_memory_contexts',
    ),
  ];
  databaseSessionMemory.add(Number(rows[0]?.bytes ?? 0));
}

function publish(rows, delaySeconds) {
  for (const row of rows) {
    if (delaySeconds) sleep(delaySeconds);
    const started = Date.now();
    db.exec(
      "select pgmq.send('platform-events', $1::jsonb, 0)",
      JSON.stringify({ eventId: row.id, schemaVersion: 1 }),
    );
    const result = db.exec(
      'update private.outbox_events set published_at=now(), locked_by=null, locked_until=null where id=$1 and locked_by=$2 and published_at is null',
      row.id,
      `k6-${__VU}`,
    );
    publicationDuration.add(Date.now() - started);
    throughput.add(result.rowsAffected());
    check(result, {
      'lease owner completes at most one row': (value) => value.rowsAffected() <= 1,
    });
  }
}

export function dispatch() {
  publish(claim(30, 'steady'), 0);
  recordDatabaseSessionMemory();
}

export function slowdown() {
  publish(claim(30, 'slowdown'), 0.2);
}

export function outage() {
  claim(5, 'outage');
  recordBacklog();
  sleep(1);
}

export function leaseChurn() {
  const rows = claim(1, 'lease-churn');
  sleep(1.2);
  publish(rows, 0);
}

export function recover() {
  publish(claim(30, stress ? 'stress' : 'recovery'), 0);
  recordBacklog();
  recordDatabaseSessionMemory();
}

export function teardown() {
  db.close();
}
