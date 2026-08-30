import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import sql from 'k6/x/sql';
import postgres from 'k6/x/sql/driver/postgres';

const databaseUrl = __ENV.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const db = sql.open(postgres, databaseUrl, {
  max_open_conns: 1,
  max_idle_conns: 1,
  conn_max_lifetime: '5m',
});
const listDuration = new Trend('ledger_list_duration_ms', true);
const searchDuration = new Trend('ledger_search_duration_ms', true);
const accountDuration = new Trend('ledger_account_duration_ms', true);
const createDuration = new Trend('ledger_create_duration_ms', true);
const transferDuration = new Trend('ledger_transfer_duration_ms', true);
const lockWait = new Trend('ledger_lock_wait_ms', true);
const reconciliationDuration = new Trend('ledger_reconciliation_duration_ms', true);
const listPayloadBytes = new Trend('ledger_list_payload_bytes');
const accountPayloadBytes = new Trend('ledger_account_payload_bytes');
const mutationPayloadBytes = new Trend('ledger_mutation_payload_bytes');
const lockWaiters = new Trend('ledger_lock_waiters');
const errors = new Rate('ledger_errors');
const operations = new Counter('ledger_operations');

const hotUser = 'ledger_performance_hot';
const sourceAccount = 'b858cfb6-ee05-7868-fd08-66f2ad165fe5';
const destinationAccount = '44ec89b9-d37d-d651-7b2c-64417c6d8342';
const user = (index) => `ledger_performance_user_${String((index % 100) + 1).padStart(3, '0')}`;
const account = (owner, suffix) => {
  const values = {
    'ledger_performance_hot:source': sourceAccount,
    'ledger_performance_hot:destination': destinationAccount,
  };
  return (
    values[`${owner}:${suffix}`] ||
    db.query('select md5($1)::uuid::text id', `${owner}:${suffix}`)[0].id
  );
};

function measure(metric, action) {
  const started = Date.now();
  try {
    const result = action();
    metric.add(Date.now() - started);
    errors.add(false);
    operations.add(1);
    return result;
  } catch (_) {
    metric.add(Date.now() - started);
    errors.add(true);
    return [];
  }
}

function command(owner, statement, values) {
  db.exec(
    'select set_config($1, $2, false)',
    'request.jwt.claims',
    JSON.stringify({ role: 'authenticated', sub: owner }),
  );
  return db.query(statement, ...values);
}

function observeLockWaiters() {
  if (__VU !== 1 || __ITER % 10 !== 0) return;
  const rows = db.query(
    "select count(*)::int total from pg_stat_activity where wait_event_type = 'Lock'",
  );
  lockWaiters.add(Number(rows[0]?.total || 0));
}

export const options = {
  scenarios: {
    list: { executor: 'constant-vus', vus: 5, duration: '30s', exec: 'list' },
    search: { executor: 'constant-vus', vus: 5, duration: '30s', exec: 'search' },
    account: { executor: 'constant-vus', vus: 3, duration: '30s', exec: 'accountSummary' },
    mutations: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '30s',
      exec: 'mutate',
    },
    contention: {
      executor: 'constant-vus',
      vus: 8,
      duration: '30s',
      startTime: '60s',
      exec: 'contend',
    },
    reconciliation: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
      startTime: '90s',
      exec: 'reconcile',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    ledger_errors: ['rate==0'],
    ledger_operations: ['count>250', 'rate>1'],
    ledger_list_duration_ms: ['p(50)<150', 'p(95)<300', 'p(99)<600'],
    ledger_search_duration_ms: ['p(50)<150', 'p(95)<300', 'p(99)<600'],
    ledger_account_duration_ms: ['p(50)<150', 'p(95)<300', 'p(99)<600'],
    ledger_create_duration_ms: ['p(50)<150', 'p(95)<350', 'p(99)<800'],
    ledger_transfer_duration_ms: ['p(50)<200', 'p(95)<500', 'p(99)<1000'],
    ledger_lock_wait_ms: ['p(50)<250', 'p(95)<500', 'p(99)<1000'],
    ledger_reconciliation_duration_ms: ['p(50)<250', 'p(95)<500', 'p(99)<1000'],
    ledger_list_payload_bytes: ['max<204800'],
    ledger_account_payload_bytes: ['max<153600'],
    ledger_mutation_payload_bytes: ['max<51200'],
    ledger_lock_waiters: ['max<9'],
  },
};

export function list() {
  const rows = measure(listDuration, () =>
    db.query(
      `select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,t.currency_code,t.title,t.merchant,t.occurred_at,
      array(select distinct p.account_id from public.transaction_postings p where p.transaction_id=t.id order by p.account_id) account_ids
     from public.transactions t
     where t.user_id=$1 order by t.occurred_at desc,t.id desc limit 101`,
      hotUser,
    ),
  );
  listPayloadBytes.add(JSON.stringify(rows).length);
  check(rows, { 'ledger list is bounded': (value) => value.length <= 101 && value.length > 0 });
}

export function search() {
  const rows = measure(searchDuration, () =>
    db.query(
      `select t.id,t.title,t.merchant,t.occurred_at from public.transactions t
     where t.user_id=$1 and to_tsvector('simple',coalesce(t.title,'')||' '||coalesce(t.merchant,''))
       @@ to_tsquery('simple',$2)
     order by t.occurred_at desc,t.id desc limit 101`,
      hotUser,
      'performance:* & search:*',
    ),
  );
  listPayloadBytes.add(JSON.stringify(rows).length);
  check(rows, { 'ledger search is bounded': (value) => value.length <= 101 && value.length > 0 });
}

export function accountSummary() {
  const rows = measure(accountDuration, () =>
    db.query(
      `with recent as (
        select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,t.currency_code,t.title,t.merchant,t.occurred_at
        from public.transactions t where t.user_id=$1
          and exists(select 1 from public.transaction_postings p
            where p.transaction_id=t.id and p.account_id=$2)
        order by t.occurred_at desc,t.id desc limit 25)
      select s.account_id,s.currency_code,s.confirmed_minor,s.pending_minor,s.ledger_version,r.*
      from public.v_account_balance_summary s left join recent r on true
      where s.account_id=$2 order by r.occurred_at desc,r.id desc`,
      hotUser,
      sourceAccount,
    ),
  );
  accountPayloadBytes.add(JSON.stringify(rows).length);
  check(rows, {
    'ledger account summary is bounded': (value) => value.length > 0 && value.length <= 25,
  });
}

export function mutate() {
  const owner = user(__VU + __ITER);
  const source = account(owner, 'source');
  const destination = account(owner, 'destination');
  const now = new Date().toISOString();
  const created = measure(createDuration, () =>
    command(owner, 'select private.post_transaction($1,$2::jsonb) result', [
      owner,
      JSON.stringify({
        kind: 'income',
        amountMinor: 1,
        currency: 'SAR',
        accountId: source,
        categoryId: null,
        title: 'Performance mutation',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: now,
        source: 'performance',
        externalRef: null,
      }),
    ]),
  );
  mutationPayloadBytes.add(JSON.stringify(created).length);
  check(created, { 'ledger create succeeds': (value) => value.length === 1 });
  const transferred = measure(transferDuration, () =>
    command(owner, 'select private.transfer_funds($1,$2::jsonb) result', [
      owner,
      JSON.stringify({
        sourceAccountId: source,
        destinationAccountId: destination,
        amountMinor: 1,
        currency: 'SAR',
        feeMinor: 0,
        feeAccountId: source,
        occurredAt: now,
        title: 'Performance transfer',
        note: null,
      }),
    ]),
  );
  mutationPayloadBytes.add(JSON.stringify(transferred).length);
  check(transferred, { 'ledger transfer succeeds': (value) => value.length === 1 });
  sleep(0.02);
}

export function contend() {
  const now = new Date().toISOString();
  const rows = measure(lockWait, () =>
    command(hotUser, 'select private.transfer_funds($1,$2::jsonb) result', [
      hotUser,
      JSON.stringify({
        sourceAccountId: sourceAccount,
        destinationAccountId: destinationAccount,
        amountMinor: 1,
        currency: 'SAR',
        feeMinor: 0,
        feeAccountId: sourceAccount,
        occurredAt: now,
        title: 'Performance hot-owner transfer',
        note: null,
      }),
    ]),
  );
  mutationPayloadBytes.add(JSON.stringify(rows).length);
  check(rows, { 'hot-owner transfer remains atomic': (value) => value.length === 1 });
  observeLockWaiters();
  sleep(0.02);
}

export function reconcile() {
  const rows = measure(reconciliationDuration, () =>
    db.query('select * from private.reconcile_account_balance(null, 500)'),
  );
  check(rows, {
    'reconciliation remains bounded': (value) => value.length > 0 && value.length <= 500,
  });
  sleep(0.5);
}

export function teardown() {
  db.close();
}
