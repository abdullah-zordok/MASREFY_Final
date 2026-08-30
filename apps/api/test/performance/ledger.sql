\set ON_ERROR_STOP on

-- The run wrapper starts this disposable fixture session with replication triggers
-- disabled, so reruns do not trip append-only evidence guards while cleaning up.
delete from audit.transaction_revisions r
using public.transactions t
where r.transaction_id = t.id
  and t.user_id like 'ledger_performance_%';
delete from public.transaction_postings p
using public.transactions t
where p.transaction_id = t.id
  and t.user_id like 'ledger_performance_%';
delete from public.account_balances b
using public.accounts a
where b.account_id = a.id
  and a.user_id like 'ledger_performance_%';
delete from public.transactions where user_id like 'ledger_performance_%';
delete from public.accounts where user_id like 'ledger_performance_%';
delete from public.profiles where id like 'ledger_performance_%';

insert into public.profiles (id, status)
values ('ledger_performance_hot', 'active');
insert into public.profiles (id, status)
select 'ledger_performance_user_' || lpad(sample::text, 3, '0'), 'active'
from generate_series(1, 100) sample;

insert into public.accounts (id, user_id, name, type, currency_code, is_default, sort_order)
select md5(profile.id || ':source')::uuid, profile.id, 'Performance source', 'cash', 'SAR', true, 0
from public.profiles profile
where profile.id like 'ledger_performance_%'
union all
select md5(profile.id || ':destination')::uuid, profile.id, 'Performance destination', 'cash', 'SAR', false, 1
from public.profiles profile
where profile.id like 'ledger_performance_%';

insert into public.transactions (
  id, user_id, kind, status, amount_minor, fee_minor, currency_code, title, occurred_at, source
)
select
  md5('ledger-performance-transaction:' || sample)::uuid,
  case when sample <= 80000 then 'ledger_performance_hot'
    else 'ledger_performance_user_' || lpad((((sample - 80001) % 100) + 1)::text, 3, '0') end,
  'transfer', 'confirmed', 100 + (sample % 10), 0, 'SAR',
  case when sample % 100 = 0 then 'Performance transaction search fixture' else 'Historical fixture' end,
  clock_timestamp() - sample * interval '1 second', 'manual'
from generate_series(1, 100000) sample;

insert into public.transaction_postings (
  id, transaction_id, account_id, amount_minor, clearing_state, posting_role, occurred_at
)
select
  md5('ledger-performance-posting:source:' || sample)::uuid,
  md5('ledger-performance-transaction:' || sample)::uuid,
  md5((case when sample <= 80000 then 'ledger_performance_hot'
    else 'ledger_performance_user_' || lpad((((sample - 80001) % 100) + 1)::text, 3, '0') end) || ':source')::uuid,
  -(100 + (sample % 10)), 'confirmed', 'source', clock_timestamp() - sample * interval '1 second'
from generate_series(1, 100000) sample
union all
select
  md5('ledger-performance-posting:destination:' || sample)::uuid,
  md5('ledger-performance-transaction:' || sample)::uuid,
  md5((case when sample <= 80000 then 'ledger_performance_hot'
    else 'ledger_performance_user_' || lpad((((sample - 80001) % 100) + 1)::text, 3, '0') end) || ':destination')::uuid,
  100 + (sample % 10), 'confirmed', 'destination', clock_timestamp() - sample * interval '1 second'
from generate_series(1, 100000) sample;

insert into public.account_balances (account_id, confirmed_minor, pending_minor, ledger_version)
select a.id, coalesce(sum(p.amount_minor) filter (where p.clearing_state = 'confirmed'), 0), 0, 1
from public.accounts a
left join public.transaction_postings p on p.account_id = a.id
where a.user_id like 'ledger_performance_%'
group by a.id;

analyze public.transactions;
analyze public.transaction_postings;
analyze public.account_balances;

do $assertions$
declare
  header_count bigint;
  posting_count bigint;
begin
  select count(*) into header_count from public.transactions where user_id like 'ledger_performance_%';
  select count(*) into posting_count from public.transaction_postings p
    join public.transactions t on t.id = p.transaction_id
    where t.user_id like 'ledger_performance_%';
  if (header_count, posting_count) <> (100000, 200000) then
    raise exception 'LEDGER_PERFORMANCE_FIXTURE_INVALID: headers %, postings %', header_count, posting_count;
  end if;
end
$assertions$;

explain (analyze, buffers, format json)
select t.id, t.kind, t.status, t.amount_minor, t.occurred_at
from public.transactions t
where t.user_id = 'ledger_performance_hot'
  and (t.occurred_at, t.id) < (clock_timestamp() + interval '1 second', 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
order by t.occurred_at desc, t.id desc
limit 101;

explain (analyze, buffers, format json)
select t.id, t.title, t.merchant, t.occurred_at
from public.transactions t
where t.user_id = 'ledger_performance_hot'
  and to_tsvector('simple', coalesce(t.title, '') || ' ' || coalesce(t.merchant, ''))
    @@ to_tsquery('simple', 'performance:* & search:*')
order by t.occurred_at desc, t.id desc
limit 101;

explain (analyze, buffers, format json)
with recent as (
  select t.id,t.kind,t.status,t.amount_minor,t.fee_minor,t.currency_code,t.title,t.merchant,t.occurred_at
  from public.transactions t
  where t.user_id='ledger_performance_hot'
    and exists(select 1 from public.transaction_postings p
      where p.transaction_id=t.id and p.account_id=md5('ledger_performance_hot:source')::uuid)
  order by t.occurred_at desc,t.id desc limit 25
)
select s.account_id,s.currency_code,s.confirmed_minor,s.pending_minor,s.ledger_version,r.*
from public.v_account_balance_summary s left join recent r on true
where s.account_id=md5('ledger_performance_hot:source')::uuid
order by r.occurred_at desc,r.id desc;

explain (analyze, buffers, format json)
select t.id,
  array(select distinct p.account_id from public.transaction_postings p where p.transaction_id = t.id order by p.account_id)
from public.transactions t
where t.id = md5('ledger-performance-transaction:1')::uuid
  and t.user_id = 'ledger_performance_hot';

explain (analyze, buffers, format json)
select * from private.reconcile_account_balance(null, 500);
