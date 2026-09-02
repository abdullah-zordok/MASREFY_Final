begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private','save_salary_profile',array['text','jsonb'],'salary profile command exists');
select has_function('private','generate_salary_receipts',array['text','uuid','date'],'salary generator exists');
select has_function('private','link_salary_receipt',array['text','jsonb'],'salary receipt link command exists');
select has_function('private','save_budget',array['text','jsonb'],'budget command exists');
select has_function('private','replace_budget_categories',array['text','uuid','bigint','jsonb'],'budget allocation replacement exists');
select has_function('private','save_obligation',array['text','jsonb'],'obligation command exists');
select has_function('private','generate_obligation_schedule',array['text','uuid','date'],'obligation generator exists');
select has_function('private','mark_planning_overdue',array['timestamptz','integer'],'bounded overdue command exists');
select has_function('private','allocate_obligation_payment',array['text','jsonb'],'payment allocation command exists');
select has_function('private','decide_payment_match',array['text','jsonb'],'payment match decision exists');
select has_function('private','save_savings_goal',array['text','jsonb'],'savings goal command exists');
select has_function('private','record_savings_movement',array['text','jsonb'],'savings movement command exists');
select has_function('private','reverse_savings_movement',array['text','uuid','bigint','uuid'],'savings reversal command exists');

select ok(coalesce((select reloptions @> array['security_invoker=true']
  from pg_class where oid=to_regclass('public.v_salary_cycle_summary')),false),
  'salary summary uses invoker security');
select ok(coalesce((select reloptions @> array['security_invoker=true']
  from pg_class where oid=to_regclass('public.v_budget_utilization')),false),
  'budget summary uses invoker security');
select ok(coalesce((select reloptions @> array['security_invoker=true']
  from pg_class where oid=to_regclass('public.v_obligation_status')),false),
  'obligation summary uses invoker security');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in (
      'save_salary_profile','generate_salary_receipts','link_salary_receipt','save_budget',
      'replace_budget_categories','save_obligation','generate_obligation_schedule',
      'mark_planning_overdue','allocate_obligation_payment','decide_payment_match',
      'save_savings_goal','record_savings_movement','reverse_savings_movement'
    )
    and has_function_privilege('public',p.oid,'EXECUTE')
),'PUBLIC cannot execute planning commands');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values('planning_salary_pgtap','active');
insert into public.salary_profiles(
  id,user_id,name,amount_minor,currency_code,frequency,expected_day,custom_interval_days,created_at
) values
  ('07100000-0000-4000-8000-000000000001','planning_salary_pgtap','Monthly',1000,'SAR','monthly',31,null,'2028-01-01T00:00:00Z'),
  ('07100000-0000-4000-8000-000000000002','planning_salary_pgtap','Weekly',1000,'SAR','weekly',1,null,'2028-01-03T00:00:00Z'),
  ('07100000-0000-4000-8000-000000000003','planning_salary_pgtap','Biweekly',1000,'SAR','biweekly',1,null,'2028-01-03T00:00:00Z'),
  ('07100000-0000-4000-8000-000000000004','planning_salary_pgtap','Custom',1000,'SAR','custom',null,10,'2028-01-01T00:00:00Z'),
  ('07100000-0000-4000-8000-000000000005','planning_salary_pgtap','Paused',1000,'SAR','monthly',1,null,'2028-01-01T00:00:00Z');
update public.salary_profiles set status='paused' where id='07100000-0000-4000-8000-000000000005';

select lives_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000001','2028-03-31')$$,
  'monthly salary generation supports a leap-year month end');
select lives_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000002','2028-01-31')$$,
  'weekly salary generation is bounded');
select lives_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000003','2028-01-31')$$,
  'biweekly salary generation is bounded');
select lives_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000004','2028-01-31')$$,
  'custom salary generation is bounded');
select lives_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000001','2028-03-31')$$,
  'repeated salary generation is idempotent');

select is((select count(*)::integer from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000001'),3,'monthly generation inserts three stable cycles');
select is((select count(*)::integer from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000002'),5,'weekly generation inserts five Mondays');
select is((select count(*)::integer from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000003'),3,'biweekly generation inserts three Mondays');
select is((select count(*)::integer from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000004'),4,'custom generation inserts four ten-day cycles');
select is((select count(*)::integer from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000005'),0,'paused profiles do not generate cycles');
select is((select (expected_at at time zone 'Asia/Riyadh')::date from public.salary_receipts where salary_profile_id='07100000-0000-4000-8000-000000000001' order by expected_at offset 1 limit 1),'2028-02-29'::date,'day 31 clamps to leap-day in the owner timezone');
select throws_ok($$select * from private.generate_salary_receipts(
  'planning_salary_pgtap','07100000-0000-4000-8000-000000000001','2029-08-01')$$,
  '22023','PLANNING_HORIZON_INVALID','salary horizon over eighteen months is rejected');

reset role;

set local role masarifi_migration;
insert into public.profiles(id,status) values('planning_budget_pgtap','active');
insert into public.budgets(id,user_id,name,currency_code,period_start,period_end,total_minor,status) values
  ('07200000-0000-4000-8000-000000000001','planning_budget_pgtap','September','SAR','2026-09-01','2026-09-30',1000,'active'),
  ('07200000-0000-4000-8000-000000000002','planning_budget_pgtap','Overlap','SAR','2026-09-15','2026-10-15',500,'active'),
  ('07200000-0000-4000-8000-000000000003','planning_budget_pgtap','Zero','SAR','2026-09-01','2026-09-30',0,'draft'),
  ('07200000-0000-4000-8000-000000000004','planning_budget_pgtap','Closed','SAR','2026-09-01','2026-09-30',1000,'closed');

select lives_ok($$select private.replace_budget_categories(
  'planning_budget_pgtap','07200000-0000-4000-8000-000000000001',1,
  '[{"categoryId":"04000000-0000-4000-8000-000000000002","limitMinor":"600","rolloverMinor":"0","alertThresholds":[80,100],"status":"active"},{"categoryId":"04000000-0000-4000-8000-000000000003","limitMinor":"400","rolloverMinor":"0","alertThresholds":[90,100],"status":"active"}]')$$,
  'complete budget allocation set applies atomically');
select is((select count(*)::integer from public.budget_categories where budget_id='07200000-0000-4000-8000-000000000001'),2,'two unique category allocations exist');
select is((select sum(limit_minor)::bigint from public.budget_categories where budget_id='07200000-0000-4000-8000-000000000001'),1000::bigint,'active allocation sum equals total');
select throws_ok($$select private.replace_budget_categories(
  'planning_budget_pgtap','07200000-0000-4000-8000-000000000001',2,
  '[{"categoryId":"04000000-0000-4000-8000-000000000002","limitMinor":"1001","rolloverMinor":"0","alertThresholds":[100],"status":"active"}]')$$,
  'P0001','BUDGET_ALLOCATION_EXCEEDS_TOTAL','allocation over total is rejected');
select lives_ok($$select private.replace_budget_categories(
  'planning_budget_pgtap','07200000-0000-4000-8000-000000000003',1,
  '[{"categoryId":"04000000-0000-4000-8000-000000000002","limitMinor":"0","rolloverMinor":"0","alertThresholds":[100],"status":"active"}]')$$,
  'zero-total budget accepts zero allocation');
select throws_ok($$select private.replace_budget_categories(
  'planning_budget_pgtap','07200000-0000-4000-8000-000000000004',1,'[]')$$,
  'P0001','BUDGET_INELIGIBLE','closed budget rejects allocation replacement');

insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,category_id,title,occurred_at,created_at,reverses_transaction_id) values
  ('07210000-0000-4000-8000-000000000001','planning_budget_pgtap','expense','confirmed',300,'SAR','04000000-0000-4000-8000-000000000002','Expense','2026-09-10T00:00:00Z','2026-09-30T00:00:00Z',null),
  ('07210000-0000-4000-8000-000000000002','planning_budget_pgtap','refund','confirmed',50,'SAR',null,'Refund','2026-09-11T00:00:00Z','2026-09-30T00:00:00Z','07210000-0000-4000-8000-000000000001'),
  ('07210000-0000-4000-8000-000000000003','planning_budget_pgtap','transfer','confirmed',999,'SAR',null,'Transfer','2026-09-12T00:00:00Z','2026-09-30T00:00:00Z',null),
  ('07210000-0000-4000-8000-000000000004','planning_budget_pgtap','expense','reversed',999,'SAR','04000000-0000-4000-8000-000000000002','Reversed','2026-09-13T00:00:00Z','2026-09-30T00:00:00Z',null);
select is((select spent_minor from public.v_budget_utilization where budget_id='07200000-0000-4000-8000-000000000001' and category_id='04000000-0000-4000-8000-000000000002'),250::bigint,'utilization counts eligible expense once and subtracts refund');
select is((select remaining_minor from public.v_budget_utilization where budget_id='07200000-0000-4000-8000-000000000001' and category_id='04000000-0000-4000-8000-000000000002'),350::bigint,'remaining budget is exact');
select is((select count(*)::integer from public.budgets where user_id='planning_budget_pgtap' and period_start<='2026-09-30' and period_end>='2026-09-15'),4,'overlapping budgets remain independent rows');

reset role;

set local role masarifi_migration;
insert into public.profiles(id,status) values('planning_obligation_pgtap','active');
insert into public.obligations(
  id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,opening_paid_minor,
  installment_amount_minor,installment_count,frequency,expected_day,custom_interval_days,start_date,status
) values
  ('07300000-0000-4000-8000-000000000001','planning_obligation_pgtap','Fixed','payable','installment','fixed_term','SAR',1000,0,300,4,'monthly',31,null,current_date,'active'),
  ('07300000-0000-4000-8000-000000000002','planning_obligation_pgtap','Open','payable','utility','open_ended','SAR',0,0,50,null,'monthly',15,null,current_date,'active'),
  ('07300000-0000-4000-8000-000000000003','planning_obligation_pgtap','Irregular','payable','other','irregular','SAR',0,0,null,null,'irregular',null,null,current_date,'active'),
  ('07300000-0000-4000-8000-000000000004','planning_obligation_pgtap','Paused','payable','bill','open_ended','SAR',0,0,50,null,'weekly',1,null,current_date,'paused'),
  ('07300000-0000-4000-8000-000000000005','planning_obligation_pgtap','Receivable','receivable','debt','fixed_term','SAR',200,0,200,1,'monthly',1,null,current_date,'active');

select lives_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000001',(current_date+interval '6 months')::date)$$,
  'fixed schedule generation is bounded and month-end safe');
select lives_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000002',(current_date+interval '6 months')::date)$$,
  'open-ended schedule stops at the requested horizon');
select lives_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000003',(current_date+interval '6 months')::date)$$,
  'irregular schedule creates no inferred occurrence');
select lives_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000004',(current_date+interval '6 months')::date)$$,
  'paused obligation generation is a no-op');
select lives_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000001',(current_date+interval '6 months')::date)$$,
  'schedule generation retry is idempotent');

select is((select count(*)::integer from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001'),4,'fixed schedule has exactly four stable sequences');
select is((select sum(amount_minor)::bigint from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001'),1000::bigint,'fixed schedule preserves exact principal');
select is((select amount_minor from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=4),100::bigint,'fixed final item carries the residual');
select is((select extract(day from due_at at time zone 'Asia/Riyadh')::integer from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=1),extract(day from (date_trunc('month',current_date)+interval '1 month'-interval '1 day'))::integer,'monthly day clamps to month end');
select ok((select count(*)>0 from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000002'),'open-ended schedule produces bounded recurring items');
select is((select count(*)::integer from public.obligation_schedule_items where obligation_id in ('07300000-0000-4000-8000-000000000003','07300000-0000-4000-8000-000000000004')),0,'irregular and inactive roots infer no schedule');
select throws_ok($$select * from private.generate_obligation_schedule(
  'planning_obligation_pgtap','07300000-0000-4000-8000-000000000001',(current_date+interval '19 months')::date)$$,
  '22023','PLANNING_HORIZON_INVALID','schedule horizon over eighteen months is rejected');

update public.obligation_schedule_items set status='paid',paid_minor=amount_minor
where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=1;
update public.obligation_schedule_items set status='skipped'
where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=2;
select lives_ok($$select * from private.mark_planning_overdue((current_date+interval '1 year')::timestamptz,500)$$,
  'bounded overdue marking is retry safe');
select is((select status from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=1),'paid','overdue marking preserves paid items');
select is((select status from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001' and sequence_no=2),'skipped','overdue marking preserves skipped items');
select ok((select count(*)>0 from public.obligation_schedule_items where obligation_id='07300000-0000-4000-8000-000000000001' and status='overdue'),'eligible unpaid items become overdue');
select is((select count(distinct direction)::integer from public.v_obligation_status where obligation_id in ('07300000-0000-4000-8000-000000000001','07300000-0000-4000-8000-000000000005')),2,'payable and receivable summaries remain separate');

reset role;

set local role masarifi_migration;
insert into public.profiles(id,status) values('planning_payment_pgtap','active');
insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,
  installment_amount_minor,installment_count,frequency,expected_day,start_date,status)
values('07400000-0000-4000-8000-000000000001','planning_payment_pgtap','Loan','payable','installment','fixed_term','SAR',600,300,2,'monthly',1,current_date,'active');
insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no) values
  ('07410000-0000-4000-8000-000000000001','planning_payment_pgtap','07400000-0000-4000-8000-000000000001',current_date,300,1),
  ('07410000-0000-4000-8000-000000000002','planning_payment_pgtap','07400000-0000-4000-8000-000000000001',current_date+interval '1 month',300,2);
insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values
  ('07420000-0000-4000-8000-000000000001','planning_payment_pgtap','expense','confirmed',300,'SAR','Payment',clock_timestamp()),
  ('07420000-0000-4000-8000-000000000002','planning_payment_pgtap','expense','confirmed',400,'SAR','Excess',clock_timestamp());

select lives_ok($$select private.allocate_obligation_payment('planning_payment_pgtap',
  '{"operation":"record","obligationId":"07400000-0000-4000-8000-000000000001","paymentId":"07430000-0000-4000-8000-000000000001","transactionId":"07420000-0000-4000-8000-000000000001","expectedVersion":1,"paymentMethod":null,"paymentCase":"partial","allocationIntent":"later_installments","source":"manual","allocations":[{"scheduleItemId":"07410000-0000-4000-8000-000000000001","amountMinor":"200"},{"scheduleItemId":"07410000-0000-4000-8000-000000000002","amountMinor":"100"}],"operationId":"07440000-0000-4000-8000-000000000001","requestId":"payment-pgtap-record"}')$$,
  'payment and multiple allocations commit atomically');
select is((select count(*)::integer from public.obligation_payments where id='07430000-0000-4000-8000-000000000001'),1,'one payment row exists');
select is((select sum(amount_minor)::bigint from public.obligation_payment_allocations where payment_id='07430000-0000-4000-8000-000000000001'),300::bigint,'allocation sum equals transaction effect');
select is((select paid_minor from public.obligation_schedule_items where id='07410000-0000-4000-8000-000000000001'),200::bigint,'partial current allocation is retained');
select is((select status from public.obligation_schedule_items where id='07410000-0000-4000-8000-000000000002'),'partial','later installment remains partial');
select is((select version from public.obligations where id='07400000-0000-4000-8000-000000000001'),2::bigint,'payment advances root version once');
select throws_ok($$select private.allocate_obligation_payment('planning_payment_pgtap',
  '{"operation":"record","obligationId":"07400000-0000-4000-8000-000000000001","paymentId":"07430000-0000-4000-8000-000000000002","transactionId":"07420000-0000-4000-8000-000000000002","expectedVersion":2,"paymentMethod":null,"paymentCase":"over","allocationIntent":"current","source":"manual","allocations":[{"scheduleItemId":"07410000-0000-4000-8000-000000000002","amountMinor":"400"}],"operationId":"07440000-0000-4000-8000-000000000002","requestId":"payment-pgtap-excess"}')$$,
  'P0001','PAYMENT_ALLOCATION_EXCEEDS_REMAINDER','implicit excess is rejected');
select is((select count(*)::integer from public.obligation_payments where id='07430000-0000-4000-8000-000000000002'),0,'failed allocation leaves no partial payment');
select lives_ok($$select private.allocate_obligation_payment('planning_payment_pgtap',
  '{"operation":"reverse","obligationId":"07400000-0000-4000-8000-000000000001","paymentId":"07430000-0000-4000-8000-000000000001","expectedVersion":1,"operationId":"07440000-0000-4000-8000-000000000003","requestId":"payment-pgtap-reverse"}')$$,
  'payment reversal reconstructs schedule projections');
select is((select status from public.obligation_payments where id='07430000-0000-4000-8000-000000000001'),'reversed','payment history is retained as reversed');
select is((select sum(paid_minor)::bigint from public.obligation_schedule_items where obligation_id='07400000-0000-4000-8000-000000000001'),0::bigint,'reversal removes the derived allocation projection');
select is((select count(*)::integer from private.outbox_events where aggregate_id='07430000-0000-4000-8000-000000000001'),2,'record and reversal each emit one outbox event');

reset role;

set local role masarifi_migration;
insert into public.profiles(id,status) values('planning_savings_pgtap','active');
insert into public.savings_goals(id,user_id,name,currency_code,target_minor,opening_tracked_minor,status)
values('07500000-0000-4000-8000-000000000001','planning_savings_pgtap','Emergency','SAR',1000,100,'active');
insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values
  ('07510000-0000-4000-8000-000000000001','planning_savings_pgtap','income','confirmed',500,'SAR','Contribution',clock_timestamp()),
  ('07510000-0000-4000-8000-000000000002','planning_savings_pgtap','expense','confirmed',200,'SAR','Withdrawal',clock_timestamp()),
  ('07510000-0000-4000-8000-000000000003','planning_savings_pgtap','expense','confirmed',700,'SAR','Overdraft',clock_timestamp());
select lives_ok($$select private.record_savings_movement('planning_savings_pgtap',
  '{"goalId":"07500000-0000-4000-8000-000000000001","movementId":"07520000-0000-4000-8000-000000000001","transactionId":"07510000-0000-4000-8000-000000000001","expectedVersion":1,"kind":"contribution","amountMinor":"500","replacesMovementId":null,"operationId":"07530000-0000-4000-8000-000000000001","requestId":"savings-pgtap-contribution"}')$$,
  'contribution appends one positive ledger-backed effect');
select lives_ok($$select private.record_savings_movement('planning_savings_pgtap',
  '{"goalId":"07500000-0000-4000-8000-000000000001","movementId":"07520000-0000-4000-8000-000000000002","transactionId":"07510000-0000-4000-8000-000000000002","expectedVersion":2,"kind":"withdrawal","amountMinor":"-200","replacesMovementId":null,"operationId":"07530000-0000-4000-8000-000000000002","requestId":"savings-pgtap-withdrawal"}')$$,
  'withdrawal appends one negative effect');
select is((select (opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id where g.id='07500000-0000-4000-8000-000000000001' group by g.opening_tracked_minor),400::bigint,'progress is one exact derived sum');
select throws_ok($$select private.record_savings_movement('planning_savings_pgtap',
  '{"goalId":"07500000-0000-4000-8000-000000000001","movementId":"07520000-0000-4000-8000-000000000003","transactionId":"07510000-0000-4000-8000-000000000003","expectedVersion":3,"kind":"withdrawal","amountMinor":"-700","replacesMovementId":null,"operationId":"07530000-0000-4000-8000-000000000003","requestId":"savings-pgtap-overdraft"}')$$,
  'P0001','PLANNING_PROGRESS_INSUFFICIENT','withdrawal cannot overdraw derived progress');
select lives_ok($$select private.reverse_savings_movement('planning_savings_pgtap',
  '07520000-0000-4000-8000-000000000002',3,'07530000-0000-4000-8000-000000000004')$$,
  'reversal appends an opposite immutable effect');
select is((select count(*)::integer from public.savings_goal_movements where goal_id='07500000-0000-4000-8000-000000000001'),3,'reversal preserves original movement history');
select is((select (opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id where g.id='07500000-0000-4000-8000-000000000001' group by g.opening_tracked_minor),600::bigint,'reversal reconstructs exact progress');
select is((select count(*)::integer from private.outbox_events where event_type like 'planning.savings_movement_%' and payload->>'userId'='planning_savings_pgtap'),3,'movement and reversal events are emitted exactly once');

reset role;

select * from finish();
rollback;
