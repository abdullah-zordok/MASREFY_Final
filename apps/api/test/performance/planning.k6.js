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
const duration = new Trend('planning_duration_ms', true);
const payload = new Trend('planning_payload_bytes');
const errors = new Rate('planning_errors');
export const options = {
  scenarios: {
    summary: { executor: 'constant-vus', vus: 5, duration: '30s', exec: 'summary' },
    jobs: { executor: 'constant-vus', vus: 2, duration: '30s', exec: 'jobs' },
    reconcile: { executor: 'constant-vus', vus: 2, duration: '30s', exec: 'reconcile' },
  },
  thresholds: {
    checks: ['rate==1'],
    planning_errors: ['rate==0'],
    planning_duration_ms: ['p(95)<500', 'p(99)<1000'],
    planning_payload_bytes: ['max<262144'],
  },
};

function measured(action) {
  const started = Date.now();
  try {
    const rows = action();
    duration.add(Date.now() - started);
    payload.add(JSON.stringify(rows).length);
    errors.add(false);
    return rows;
  } catch (_) {
    errors.add(true);
    return [];
  }
}
export function summary() {
  const rows = measured(() =>
    db.query(
      `select o.id,o.name,s.remaining_minor,s.overdue_minor,s.next_due_at
  from public.obligations o join public.v_obligation_status s on s.obligation_id=o.id
  where o.user_id=$1 order by s.next_due_at nulls last,o.id limit 100`,
      'ledger_performance_hot',
    ),
  );
  check(rows, { 'planning summary bounded': (value) => value.length === 100 });
  sleep(0.05);
}
export function jobs() {
  const rows = measured(() =>
    db.query('select * from private.mark_planning_overdue(clock_timestamp(),100)'),
  );
  check(rows, { 'planning job bounded': (value) => value.length === 1 });
  sleep(0.1);
}
export function reconcile() {
  const rows = measured(() => db.query('select * from private.reconcile_planning(null,false,100)'));
  check(rows, { 'planning reconciliation bounded': (value) => value.length <= 100 });
  sleep(0.1);
}
export function teardown() {
  db.close();
}
