grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create index transactions_report_summary_idx
on public.transactions(user_id,occurred_at,currency_code)
include(kind,amount_minor,fee_minor,category_id,reverses_transaction_id)
where status='confirmed' and deleted_at is null;

create view public.v_monthly_financial_summary with (security_invoker=true) as
with ledger_versions as (
  select a.user_id,coalesce(max(b.ledger_version),0)::bigint ledger_version
  from public.accounts a left join public.account_balances b on b.account_id=a.id
  group by a.user_id
), effects as (
  select t.user_id,
    date_trunc('month',t.occurred_at at time zone p.timezone)::date month_start,
    t.currency_code,
    case when t.kind='income' then t.amount_minor else 0 end::bigint income_minor,
    case
      when t.kind='expense' then t.amount_minor+t.fee_minor
      when t.kind='refund' then -t.amount_minor
      when t.fee_minor>0 then t.fee_minor
      else 0
    end::bigint expense_minor,
    case when t.kind in ('income','expense','refund') or t.fee_minor>0 then 1 else 0 end transaction_count
  from public.transactions t
  join public.profiles p on p.id=t.user_id
  where t.status='confirmed' and t.deleted_at is null
)
select e.user_id,e.month_start,e.currency_code,
  sum(e.income_minor)::bigint income_minor,
  sum(e.expense_minor)::bigint expense_minor,
  (sum(e.income_minor)-sum(e.expense_minor))::bigint net_cash_flow_minor,
  sum(e.transaction_count)::bigint transaction_count,
  coalesce(v.ledger_version,0)::bigint ledger_version
from effects e left join ledger_versions v on v.user_id=e.user_id
where e.transaction_count>0
group by e.user_id,e.month_start,e.currency_code,v.ledger_version;
alter view public.v_monthly_financial_summary owner to masarifi_migration;
comment on view public.v_monthly_financial_summary is
  'SPEC-BE-010 owner/month/currency ledger summary; security invoker and current confirmed truth.';

create view public.v_category_spending_summary with (security_invoker=true) as
with ledger_versions as (
  select a.user_id,coalesce(max(b.ledger_version),0)::bigint ledger_version
  from public.accounts a left join public.account_balances b on b.account_id=a.id
  group by a.user_id
), category_effects as (
  select t.user_id,t.occurred_at,t.currency_code,t.category_id,t.amount_minor::bigint expense_minor
  from public.transactions t
  where t.kind='expense' and t.status='confirmed' and t.deleted_at is null and t.category_id is not null
  union all
  select r.user_id,r.occurred_at,r.currency_code,o.category_id,-r.amount_minor::bigint
  from public.transactions r
  join public.transactions o on o.id=r.reverses_transaction_id and o.user_id=r.user_id
  where r.kind='refund' and r.status='confirmed' and r.deleted_at is null and o.category_id is not null
)
select e.user_id,
  date_trunc('month',e.occurred_at at time zone p.timezone)::date month_start,
  e.currency_code,e.category_id,c.label_ar category_label_ar,c.label_en category_label_en,
  sum(e.expense_minor)::bigint expense_minor,count(*)::bigint transaction_count,
  coalesce(v.ledger_version,0)::bigint ledger_version
from category_effects e
join public.profiles p on p.id=e.user_id
join public.categories c on c.id=e.category_id
left join ledger_versions v on v.user_id=e.user_id
group by e.user_id,date_trunc('month',e.occurred_at at time zone p.timezone)::date,
  e.currency_code,e.category_id,c.label_ar,c.label_en,v.ledger_version;
alter view public.v_category_spending_summary owner to masarifi_migration;
comment on view public.v_category_spending_summary is
  'SPEC-BE-010 owner/month/currency/category expense summary with original refund attribution.';

revoke all on public.v_monthly_financial_summary,public.v_category_spending_summary
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
grant select on public.v_monthly_financial_summary,public.v_category_spending_summary to masarifi_api;

reset role;
revoke masarifi_migration from current_user granted by current_user;
