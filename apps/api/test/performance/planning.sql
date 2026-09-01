\set ON_ERROR_STOP on
\ir ledger.sql

delete from public.obligation_schedule_items where user_id='ledger_performance_hot';
delete from public.obligations where user_id='ledger_performance_hot';
delete from public.budget_categories where user_id='ledger_performance_hot';
delete from public.budgets where user_id='ledger_performance_hot';
delete from public.savings_goal_movements where user_id='ledger_performance_hot';
delete from public.savings_goals where user_id='ledger_performance_hot';

insert into public.budgets(id,user_id,name,currency_code,period_start,period_end,total_minor,
  income_target_minor,savings_target_minor,status)
select md5('planning-performance-budget:'||month)::uuid,'ledger_performance_hot','Budget '||month,
  'SAR',make_date(2026,month,1),(make_date(2026,month,1)+interval '1 month - 1 day')::date,
  500000,1200000,200000,'active' from generate_series(1,12) month;

insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,
  installment_amount_minor,installment_count,frequency,expected_day,start_date)
select md5('planning-performance-obligation:'||item)::uuid,'ledger_performance_hot','Obligation '||item,
  case when item%5=0 then 'receivable' else 'payable' end,'installment','fixed_term','SAR',240000,
  10000,24,'monthly',least(28,(item%31)+1),date '2026-01-01' from generate_series(1,100) item;

insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no)
select md5('planning-performance-schedule:'||item||':'||sequence)::uuid,'ledger_performance_hot',
  md5('planning-performance-obligation:'||item)::uuid,
  make_date(2026,1,least(28,(item%31)+1))+((sequence-1)||' months')::interval,10000,sequence
from generate_series(1,100) item cross join generate_series(1,24) sequence;

insert into public.savings_goals(id,user_id,name,currency_code,target_minor,opening_tracked_minor,target_date)
select md5('planning-performance-goal:'||item)::uuid,'ledger_performance_hot','Goal '||item,'SAR',
  1000000,item*1000,date '2027-12-31' from generate_series(1,50) item;

analyze public.budgets;analyze public.obligations;analyze public.obligation_schedule_items;analyze public.savings_goals;

do $assertions$
begin
  if (select count(*) from public.transactions where user_id like 'ledger_performance_%')<>100000
    or (select count(*) from public.budgets where user_id='ledger_performance_hot')<>12
    or (select count(*) from public.obligations where user_id='ledger_performance_hot')<>100
    or (select count(*) from public.obligation_schedule_items where user_id='ledger_performance_hot')<>2400
    or (select count(*) from public.savings_goals where user_id='ledger_performance_hot')<>50 then
    raise exception 'PLANNING_PERFORMANCE_FIXTURE_INVALID';
  end if;
end $assertions$;

explain (analyze,buffers,format json)
select * from public.budgets where user_id='ledger_performance_hot'
  and period_end>=date '2026-01-01' and period_start<=date '2026-12-31'
order by period_start desc,id limit 100;

explain (analyze,buffers,format json)
select o.id,o.name,s.* from public.obligations o join public.v_obligation_status s on s.obligation_id=o.id
where o.user_id='ledger_performance_hot' order by s.next_due_at nulls last,o.id limit 100;

explain (analyze,buffers,format json)
select g.id,g.target_minor,g.opening_tracked_minor+coalesce(sum(m.amount_minor),0) progress_minor
from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id
where g.user_id='ledger_performance_hot' group by g.id order by g.target_date nulls last,g.id limit 100;

explain (analyze,buffers,format json) select * from private.reconcile_planning(null,false,100);
