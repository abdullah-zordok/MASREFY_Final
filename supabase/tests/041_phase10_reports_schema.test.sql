begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_view('public','v_monthly_financial_summary','monthly report view exists');
select has_view('public','v_category_spending_summary','category report view exists');
select has_index('public','transactions','transactions_report_summary_idx','report source has a bounded covering index');
select columns_are('public','v_monthly_financial_summary',array[
  'user_id','month_start','currency_code','income_minor','expense_minor',
  'net_cash_flow_minor','transaction_count','ledger_version'
], 'monthly report view has the exact contract');
select columns_are('public','v_category_spending_summary',array[
  'user_id','month_start','currency_code','category_id','category_label_ar',
  'category_label_en','expense_minor','transaction_count','ledger_version'
], 'category report view has the exact contract');

select ok(coalesce((select 'security_invoker=true'=any(c.reloptions)
  from pg_class c where c.oid='public.v_monthly_financial_summary'::regclass),false),
  'monthly report view invokes caller security');
select ok(coalesce((select 'security_invoker=true'=any(c.reloptions)
  from pg_class c where c.oid='public.v_category_spending_summary'::regclass),false),
  'category report view invokes caller security');

grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
set local role masarifi_migration;
select set_config('masarifi.ledger_command','on',true);
insert into public.profiles(id,status) values
  ('report-view-owner-a','active'),('report-view-owner-b','active');
insert into public.accounts(id,user_id,name,type,currency_code) values
  ('a1000000-0000-4000-8000-000000000001','report-view-owner-a','A','bank','SAR'),
  ('b1000000-0000-4000-8000-000000000001','report-view-owner-b','B','bank','SAR');
insert into public.categories(id,user_id,kind,label_ar,label_en) values
  ('ca000000-0000-4000-8000-000000000001','report-view-owner-a','expense','طعام','Food');
insert into public.transactions(id,user_id,kind,amount_minor,currency_code,category_id,title,occurred_at,reverses_transaction_id) values
  ('10000000-0000-4000-8000-000000000001','report-view-owner-a','income',100,'SAR',null,'Income','2026-08-01T10:00:00Z',null),
  ('10000000-0000-4000-8000-000000000002','report-view-owner-a','expense',40,'SAR','ca000000-0000-4000-8000-000000000001','Food','2026-08-02T10:00:00Z',null),
  ('10000000-0000-4000-8000-000000000003','report-view-owner-a','transfer',500,'SAR',null,'Transfer','2026-08-03T10:00:00Z',null),
  ('10000000-0000-4000-8000-000000000004','report-view-owner-a','refund',10,'SAR',null,'Refund','2026-08-04T10:00:00Z','10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001','report-view-owner-b','expense',999,'SAR',null,'Other','2026-08-02T10:00:00Z',null);
insert into public.account_balances(account_id,confirmed_minor,pending_minor,ledger_version)
values
  ('a1000000-0000-4000-8000-000000000001',70,0,4),
  ('b1000000-0000-4000-8000-000000000001',-999,0,1);
reset role;

select set_config('request.jwt.claims','{"sub":"report-view-owner-a","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table report_test_monthly as select * from public.v_monthly_financial_summary;
create temporary table report_test_categories as select * from public.v_category_spending_summary;
reset role;
select is((select income_minor from report_test_monthly
  where month_start='2026-08-01' and currency_code='SAR'),100::bigint,'income reconciles');
select is((select expense_minor from report_test_monthly
  where month_start='2026-08-01' and currency_code='SAR'),30::bigint,'expense and refund reconcile');
select is((select net_cash_flow_minor from report_test_monthly
  where month_start='2026-08-01' and currency_code='SAR'),70::bigint,'cash flow reconciles');
select is((select transaction_count from report_test_monthly
  where month_start='2026-08-01' and currency_code='SAR'),3::bigint,'transfers are excluded');
select is((select ledger_version from report_test_monthly
  where month_start='2026-08-01' and currency_code='SAR'),4::bigint,'ledger version reconciles');
select is((select expense_minor from report_test_categories
  where month_start='2026-08-01' and currency_code='SAR'),30::bigint,
  'refunds retain original category attribution');
select is((select transaction_count from report_test_categories
  where month_start='2026-08-01' and currency_code='SAR'),2::bigint,
  'category transaction count includes refund');
select is((select category_label_en from report_test_categories
  where month_start='2026-08-01' and currency_code='SAR'),'Food'::text,
  'category label is stable');
select is((select count(*) from report_test_monthly),1::bigint,
  'caller RLS hides another owner aggregate');

select * from finish();
rollback;
