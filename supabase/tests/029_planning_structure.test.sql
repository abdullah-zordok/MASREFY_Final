begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', name, name || ' exists')
from unnest(array[
  'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
  'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
  'payment_matches','savings_goals','savings_goal_movements'
]) name;

select has_view('public', name, name || ' exists')
from unnest(array['v_salary_cycle_summary','v_budget_utilization','v_obligation_status']) name;

select has_pk('public', name, name || ' has a primary key')
from unnest(array[
  'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
  'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
  'payment_matches','savings_goals','savings_goal_movements'
]) name;

select has_column('public','salary_profiles',column_name,'salary profile ' || column_name || ' exists')
from unnest(array['user_id','amount_minor','currency_code','frequency','expected_day','custom_interval_days','account_id','status','version']) column_name;
select has_column('public','salary_receipts',column_name,'salary receipt ' || column_name || ' exists')
from unnest(array['user_id','salary_profile_id','transaction_id','expected_at','amount_minor','status','operation_id','replaces_receipt_id','version']) column_name;
select has_column('public','budgets',column_name,'budget ' || column_name || ' exists')
from unnest(array['user_id','currency_code','period_start','period_end','total_minor','rollover_minor','status','copied_from_budget_id','version']) column_name;
select has_column('public','budget_categories',column_name,'budget category ' || column_name || ' exists')
from unnest(array['user_id','budget_id','category_id','limit_minor','alert_thresholds','status','version']) column_name;
select has_column('public','obligations',column_name,'obligation ' || column_name || ' exists')
from unnest(array['user_id','direction','type','schedule_kind','currency_code','principal_minor','installment_amount_minor','frequency','start_date','status','version']) column_name;
select has_column('public','obligation_schedule_items',column_name,'schedule item ' || column_name || ' exists')
from unnest(array['user_id','obligation_id','due_at','amount_minor','paid_minor','status','sequence_no','kind','version']) column_name;
select has_column('public','obligation_payments',column_name,'payment ' || column_name || ' exists')
from unnest(array['user_id','obligation_id','transaction_id','amount_minor','allocation_intent','status','operation_id','version']) column_name;
select has_column('public','obligation_payment_allocations',column_name,'allocation ' || column_name || ' exists')
from unnest(array['user_id','payment_id','schedule_item_id','amount_minor']) column_name;
select has_column('public','payment_matches',column_name,'payment match ' || column_name || ' exists')
from unnest(array['user_id','transaction_id','obligation_id','schedule_item_id','confidence','evidence','status','version']) column_name;
select has_column('public','savings_goals',column_name,'savings goal ' || column_name || ' exists')
from unnest(array['user_id','currency_code','target_minor','opening_tracked_minor','status','linked_account_id','version']) column_name;
select has_column('public','savings_goal_movements',column_name,'savings movement ' || column_name || ' exists')
from unnest(array['user_id','goal_id','transaction_id','amount_minor','kind','operation_id','replaces_movement_id']) column_name;

select col_is_fk('public',table_name,column_name,table_name || '.' || column_name || ' is a foreign key')
from (values
  ('salary_profiles','user_id'),('salary_profiles','currency_code'),('salary_profiles','account_id'),
  ('salary_receipts','transaction_id'),
  ('budgets','currency_code'),('budget_categories','category_id'),
  ('obligations','currency_code'),('obligations','default_account_id'),
  ('obligation_payments','transaction_id'),('payment_matches','transaction_id'),
  ('savings_goals','currency_code'),('savings_goals','linked_account_id'),
  ('savings_goal_movements','transaction_id')
) expected(table_name,column_name);

select ok(exists(
  select 1 from pg_constraint c
  where c.conrelid=to_regclass('public.' || table_name)
    and c.conname=constraint_name and c.contype='f'
),constraint_name || ' enforces dependent ownership')
from (values
  ('salary_receipts','salary_receipts_profile_owner_fk'),
  ('budget_categories','budget_categories_budget_owner_fk'),
  ('obligation_schedule_items','obligation_schedule_items_obligation_owner_fk'),
  ('obligation_payments','obligation_payments_obligation_owner_fk'),
  ('obligation_payment_allocations','obligation_payment_allocations_payment_owner_fk'),
  ('obligation_payment_allocations','obligation_payment_allocations_schedule_owner_fk'),
  ('payment_matches','payment_matches_obligation_owner_fk'),
  ('savings_goal_movements','savings_goal_movements_goal_owner_fk')
) expected(table_name,constraint_name);

select has_index('public',table_name,index_name,index_name || ' exists')
from (values
  ('salary_receipts','salary_receipts_profile_expected_uq'),
  ('budget_categories','budget_categories_budget_category_uq'),
  ('obligation_schedule_items','obligation_schedule_items_obligation_sequence_uq'),
  ('obligation_payments','obligation_payments_active_transaction_uq'),
  ('obligation_payment_allocations','obligation_payment_allocations_payment_item_uq'),
  ('payment_matches','payment_matches_transaction_obligation_uq'),
  ('savings_goal_movements','savings_goal_movements_goal_transaction_kind_uq')
) expected(table_name,index_name);

select ok(coalesce((
  select count(*) = 9
  from pg_trigger
  where not tgisinternal and tgname like 'planning_%_set_updated_at_and_version'
),false),'all mutable planning roots have version triggers');

select ok(coalesce((
  select count(*) = 2
  from pg_trigger
  where not tgisinternal and tgname in (
    'planning_obligation_payment_allocations_immutable',
    'planning_savings_goal_movements_immutable'
  )
),false),'immutable planning histories have guards');

select * from finish();
rollback;
