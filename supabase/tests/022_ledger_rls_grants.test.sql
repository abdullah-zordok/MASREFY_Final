begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

grant authenticated,masarifi_api,masarifi_worker,masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;

select ok(not has_table_privilege('anon','public.transactions','SELECT'),'anonymous cannot read headers');
select ok(not has_table_privilege('authenticated','public.transactions','SELECT'),'direct authenticated cannot read headers');
select ok(not has_table_privilege('authenticated','public.transaction_postings','SELECT'),'direct authenticated cannot read postings');
select ok(not has_table_privilege('authenticated','public.account_balances','SELECT'),'direct authenticated cannot read balances');
select ok(not has_table_privilege('masarifi_worker','public.transactions','SELECT'),'worker cannot read headers');
select ok(not has_table_privilege('masarifi_worker','public.transaction_postings','SELECT'),'worker cannot read postings');
select ok(not has_table_privilege('masarifi_worker','public.account_balances','UPDATE'),'worker cannot change projection amounts');
select ok(has_table_privilege('masarifi_api','public.transactions','SELECT'),'API may owner-read headers through RLS');
select ok(has_table_privilege('masarifi_api','public.transaction_postings','SELECT'),'API may owner-read postings through RLS');
select ok(has_table_privilege('masarifi_api','public.account_balances','SELECT'),'API may owner-read balances through RLS');
select ok(not has_table_privilege('masarifi_api','public.transactions','INSERT'),'API has no direct header insert');
select ok(not has_table_privilege('masarifi_api','public.transaction_postings','INSERT'),'API has no direct posting insert');
select ok(not has_table_privilege('masarifi_api','public.account_balances','UPDATE'),'API has no direct projection update');
select ok(not has_table_privilege('masarifi_api','audit.transaction_revisions','SELECT'),'API cannot read raw snapshots');
select ok(has_function_privilege('masarifi_api','private.post_transaction(text,jsonb)','EXECUTE'),'API executes post command');
select ok(has_function_privilege('masarifi_api','private.transfer_funds(text,jsonb)','EXECUTE'),'API executes transfer command');
select ok(not has_function_privilege('authenticated','private.post_transaction(text,jsonb)','EXECUTE'),'direct authenticated cannot execute post command');
select ok(not has_function_privilege('masarifi_worker','private.post_transaction(text,jsonb)','EXECUTE'),'worker cannot execute money command');
select ok(has_function_privilege('masarifi_worker','private.reconcile_account_balance(uuid,integer)','EXECUTE'),'worker executes reconciliation');
select ok(not has_function_privilege('public','private.reconcile_account_balance(uuid,integer)','EXECUTE'),'PUBLIC cannot reconcile');
select has_function('private','ledger_actor_is_admin',array['text'],'Admin boundary helper exists');
select ok(has_function_privilege('masarifi_api','private.ledger_actor_is_admin(text)','EXECUTE'),'API policy may evaluate Admin boundary');
select ok(not has_function_privilege('public','private.ledger_actor_is_admin(text)','EXECUTE'),'PUBLIC cannot inspect Admin boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='transactions' and cmd='SELECT' and roles && array['masarifi_api']::name[]),1,'one API owner header policy exists');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='transaction_postings' and cmd='SELECT' and roles && array['masarifi_api']::name[]),1,'one API owner posting policy exists');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='account_balances' and cmd='SELECT' and roles && array['masarifi_api']::name[]),1,'one API owner balance policy exists');

set local role masarifi_migration;
insert into public.profiles(id,status) values
  ('ledger_rls_owner','active'),('ledger_rls_other','active'),('ledger_rls_admin','active');
insert into public.admin_profiles(user_id,status) values ('ledger_rls_admin','active');
insert into public.accounts(id,user_id,name,type,currency_code) values
 ('51000000-0000-4000-8000-000000000001','ledger_rls_owner','Owner','cash','SAR'),
 ('51000000-0000-4000-8000-000000000002','ledger_rls_other','Other','cash','SAR');
reset role;
select set_config('request.jwt.claims','{"sub":"ledger_rls_owner","role":"authenticated"}',true);
set local role masarifi_api;
select lives_ok($$select private.post_transaction('ledger_rls_owner',jsonb_build_object(
  'kind','income','amountMinor',1,'currency','SAR','accountId','51000000-0000-4000-8000-000000000001',
  'categoryId','04000000-0000-4000-8000-000000000016','title','One','occurredAt','2026-08-01T00:00:00Z'))$$,'owner command succeeds');
select is((select count(*)::integer from public.transactions),1,'owner sees only own header');
select throws_ok($$select private.post_transaction('ledger_rls_owner',jsonb_build_object(
  'kind','income','amountMinor',1,'currency','SAR','accountId','51000000-0000-4000-8000-000000000002',
  'categoryId','04000000-0000-4000-8000-000000000016','title','Other','occurredAt','2026-08-01T00:00:00Z'))$$,
  'P0001','ACCOUNT_INVALID','cross-owner command is hidden');

reset role;
select * from finish();
rollback;
