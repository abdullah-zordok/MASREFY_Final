import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import sql from 'k6/x/sql';
import postgres from 'k6/x/sql/driver/postgres';

if (!__ENV.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const db = sql.open(postgres, __ENV.DATABASE_URL, {
  max_open_conns: 1,
  max_idle_conns: 1,
  conn_max_lifetime: '5m',
});
const stress = __ENV.TRACKING_STRESS === '1';
const readDuration = new Trend('tracking_read_duration_ms', true);
const intakeDuration = new Trend('tracking_intake_duration_ms', true);
const duplicateDuration = new Trend('tracking_duplicate_duration_ms', true);
const payloadBytes = new Trend('tracking_payload_bytes');
const errors = new Rate('tracking_errors');

export const options = {
  scenarios: {
    history: {
      executor: 'constant-vus',
      vus: stress ? 12 : 4,
      duration: stress ? '45s' : '20s',
      exec: 'history',
    },
    intake: {
      executor: 'constant-vus',
      vus: stress ? 8 : 3,
      duration: stress ? '45s' : '20s',
      exec: 'intake',
    },
    duplicates: {
      executor: 'constant-vus',
      vus: stress ? 6 : 2,
      duration: stress ? '45s' : '20s',
      exec: 'duplicates',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    tracking_errors: ['rate==0'],
    tracking_read_duration_ms: ['p(95)<500', 'p(99)<1000'],
    tracking_intake_duration_ms: ['p(95)<300', 'p(99)<750'],
    tracking_duplicate_duration_ms: ['p(95)<250'],
    tracking_payload_bytes: ['max<262144'],
  },
};

function measured(metric, action) {
  const started = Date.now();
  try {
    const rows = action();
    metric.add(Date.now() - started);
    payloadBytes.add(JSON.stringify(rows).length);
    errors.add(false);
    return rows;
  } catch (_) {
    errors.add(true);
    return [];
  }
}

export function history() {
  const rows = measured(readDuration, () =>
    db.query(
      `select id,source_type,source_ref,outcome,occurred_at from public.tracking_history
     where user_id=$1 and (occurred_at,id)<($2::timestamptz,$3::uuid)
     order by occurred_at desc,id desc limit 101`,
      'tracking_performance_owner',
      '2026-09-03T00:00:00.000Z',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ),
  );
  check(rows, { 'history page is bounded': (page) => page.length === 101 });
  sleep(0.05);
}

export function intake() {
  const nonce = `${__VU}-${__ITER}-${Date.now()}`;
  const hash = (nonce.replace(/[^0-9a-f]/gi, 'a') + 'b'.repeat(64)).slice(0, 64).toLowerCase();
  const events = JSON.stringify([
    { sourceItemKey: nonce, receivedAt: '2026-09-02T12:00:00.000Z', body: 'Fictional purchase' },
  ]);
  const rows = measured(intakeDuration, () =>
    db.query(
      "select private.create_import_session($1,'manual',null,1,$2,$3::jsonb)",
      'tracking_performance_owner',
      hash,
      events,
    ),
  );
  check(rows, { 'intake creates one session': (created) => created.length === 1 });
  sleep(0.1);
}

export function duplicates() {
  const rows = measured(duplicateDuration, () =>
    db.query(
      `select id from public.transactions where user_id=$1 and status='confirmed' and deleted_at is null
     and amount_minor=1000 and currency_code='SAR'
     and occurred_at between clock_timestamp()-interval '2 days' and clock_timestamp()+interval '5 minutes'
     order by occurred_at desc,id desc limit 100`,
      'tracking_performance_owner',
    ),
  );
  check(rows, { 'duplicate batch is bounded': (candidates) => candidates.length === 100 });
  sleep(0.05);
}

export function teardown() {
  db.close();
}
