begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

grant authenticated,masarifi_api,masarifi_worker,masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;

select ok(coalesce((
  select bool_and(c.relrowsecurity and c.relforcerowsecurity)
  from pg_class c
  where c.oid = any(array[
    to_regclass('public.salary_profiles'),to_regclass('public.salary_receipts'),
    to_regclass('public.budgets'),to_regclass('public.budget_categories'),
    to_regclass('public.obligations'),to_regclass('public.obligation_schedule_items'),
    to_regclass('public.obligation_payments'),to_regclass('public.obligation_payment_allocations'),
    to_regclass('public.payment_matches'),to_regclass('public.savings_goals'),
    to_regclass('public.savings_goal_movements')
  ])
),false),'every planning table forces RLS');

select ok(not has_table_privilege(role_name,to_regclass('public.salary_profiles'),privilege_name),
  role_name || ' cannot ' || lower(privilege_name) || ' salary profiles directly')
from (values
  ('anon','SELECT'),('authenticated','SELECT'),('authenticated','INSERT'),
  ('masarifi_api','INSERT'),('masarifi_api','UPDATE'),('masarifi_api','DELETE'),
  ('masarifi_worker','INSERT'),('masarifi_worker','UPDATE'),('masarifi_worker','DELETE')
) expected(role_name,privilege_name);

select ok(coalesce(has_table_privilege('masarifi_api',to_regclass('public.' || table_name),'SELECT'),false),
  'API can owner-read ' || table_name)
from unnest(array[
  'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
  'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
  'payment_matches','savings_goals','savings_goal_movements'
]) table_name;

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename=table_name and roles && array['masarifi_api']::name[]),
  1,table_name || ' has one API owner-read policy')
from unnest(array[
  'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
  'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
  'payment_matches','savings_goals','savings_goal_movements'
]) table_name;

select ok(not exists(
  select 1 from information_schema.role_table_grants
  where table_schema='public'
    and table_name in (
      'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
      'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
      'payment_matches','savings_goals','savings_goal_movements'
    )
    and grantee in ('anon','authenticated','service_role')
),'browser/service roles have no planning table grants');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname like '%planning%'
    and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') !~ 'search_path='
),'all planning definer functions pin search_path');

select ok(not has_function_privilege(
  'masarifi_api','private.generate_salary_receipts(text,uuid,date)','EXECUTE'
),'API cannot execute the worker salary generator');
select ok(has_function_privilege(
  'masarifi_worker','private.generate_salary_receipts(text,uuid,date)','EXECUTE'
),'worker retains salary generator execution');

reset role;
select * from finish();
rollback;
