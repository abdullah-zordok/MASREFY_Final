import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import sql from 'k6/x/sql';
import postgres from 'k6/x/sql/driver/postgres';

if (!__ENV.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const db = sql.open(postgres, __ENV.DATABASE_URL, {
  max_open_conns: 8,
  max_idle_conns: 8,
  conn_max_lifetime: '2m',
});
const stress = __ENV.AI_STRESS === '1';
const requestDuration = new Trend('ai_request_duration_ms', true);
const readDuration = new Trend('ai_read_duration_ms', true);
const workerDuration = new Trend('ai_worker_duration_ms', true);
const cancelDuration = new Trend('ai_cancel_duration_ms', true);
const financeDuration = new Trend('ai_outage_finance_duration_ms', true);
const payloadBytes = new Trend('ai_payload_bytes');
const errors = new Rate('ai_errors');

export const options = {
  scenarios: {
    quota: {
      executor: 'constant-vus',
      vus: stress ? 16 : 4,
      duration: stress ? '45s' : '15s',
      exec: 'quota',
    },
    reads: {
      executor: 'constant-vus',
      vus: stress ? 12 : 3,
      duration: stress ? '45s' : '15s',
      exec: 'reads',
    },
    worker: {
      executor: 'constant-vus',
      vus: stress ? 8 : 2,
      duration: stress ? '45s' : '15s',
      exec: 'worker',
    },
    cancel: {
      executor: 'constant-vus',
      vus: stress ? 8 : 2,
      duration: stress ? '45s' : '15s',
      exec: 'cancel',
    },
    outageFinance: {
      executor: 'constant-vus',
      vus: stress ? 12 : 3,
      duration: stress ? '45s' : '15s',
      exec: 'outageFinance',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    ai_errors: ['rate==0'],
    ai_request_duration_ms: ['p(95)<300', 'p(99)<600'],
    ai_read_duration_ms: ['p(95)<500', 'p(99)<1000'],
    ai_worker_duration_ms: ['p(95)<500'],
    ai_cancel_duration_ms: ['p(95)<300'],
    ai_outage_finance_duration_ms: ['p(95)<300'],
    ai_payload_bytes: ['max<307200'],
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
function owner() {
  return `ai_performance_${__VU}`;
}
function claims(userId) {
  return JSON.stringify({ role: 'authenticated', sub: userId, sid: 'ai-performance' });
}
function ensureOwner(userId) {
  db.exec(
    "insert into public.profiles(id,status) values($1,'active') on conflict(id) do nothing",
    userId,
  );
}

export function quota() {
  const userId = owner();
  ensureOwner(userId);
  const rows = measured(requestDuration, () =>
    db.query(
      `with context as materialized (select set_config('request.jwt.claims',$1,true))
    select private.reserve_ai_quota($2,md5($3)::uuid,'voice_transcription') result from context`,
      claims(userId),
      userId,
      `${userId}:${__ITER}`,
    ),
  );
  check(rows, { 'quota returns one bounded decision': (value) => value.length === 1 });
  sleep(0.05);
}

export function reads() {
  const rows = measured(readDuration, () =>
    db.query("select private.get_effective_ai_route('voice_transcription') result"),
  );
  check(rows, { 'route lookup is bounded': (value) => value.length === 1 });
  sleep(0.05);
}

export function worker() {
  const rows = measured(workerDuration, () =>
    db.query('select private.reconcile_ai_state(100) result'),
  );
  check(rows, { 'reconcile returns one summary': (value) => value.length === 1 });
  sleep(0.05);
}

export function cancel() {
  const userId = `${owner()}_cancel`;
  ensureOwner(userId);
  const seed = `${userId}:${__ITER}`;
  const rows = measured(cancelDuration, () =>
    db.query(
      `with context as materialized (select set_config('request.jwt.claims',$1,true)),
    consent_state as materialized (select private.get_assistant_consent($2,'assistant-privacy-v1') result from context),
    consent as materialized (select private.set_assistant_consent($2,'assistant-privacy-v1',true,(result->>'version')::bigint) from consent_state),
    conversation as materialized (select private.create_assistant_conversation($2,'Performance') result from consent),
    message as materialized (select private.enqueue_assistant_message($2,(result->>'id')::uuid,'cancel fixture',array['budgets'],'async',md5($3||':operation')::uuid) result from conversation)
    select private.cancel_assistant_message($2,(result->>'id')::uuid) result from message`,
      claims(userId),
      userId,
      seed,
    ),
  );
  check(rows, {
    'cancel releases one queued item': (value) => value.length === 1 && value[0].result === true,
  });
  sleep(0.05);
}

export function outageFinance() {
  const userId = `${owner()}_finance`;
  ensureOwner(userId);
  const rows = measured(financeDuration, () =>
    db.query(
      `with context as materialized (select set_config('request.jwt.claims',$1,true))
    select count(*)::integer result from public.accounts,context where user_id=$2`,
      claims(userId),
      userId,
    ),
  );
  check(rows, { 'core finance remains available': (value) => value.length === 1 });
  sleep(0.05);
}

export function teardown() {
  db.close();
}
