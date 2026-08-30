begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_function('private','post_transaction',array['text','jsonb'],'income/expense command exists');
select has_function('private','transfer_funds',array['text','jsonb'],'transfer command exists');
select has_function('private','revise_transaction',array['text','uuid','bigint','jsonb','text'],'revision command exists');
select has_function('private','refund_transaction',array['text','uuid','bigint','bigint','uuid','timestamp with time zone','text'],'refund command exists');
select has_function('private','reverse_transaction',array['text','uuid','bigint','timestamp with time zone','text'],'reversal command exists');
select has_function('private','soft_delete_transaction',array['text','uuid','bigint','text'],'delete command exists');
select has_function('private','restore_transaction',array['text','uuid','bigint'],'restore command exists');
select has_function('private','post_opening_transaction',array['text','uuid','bigint','text','timestamp with time zone','text'],'opening command exists');
select has_function('private','reconcile_account_balance',array['uuid','integer'],'reconciliation command exists');

grant masarifi_migration,masarifi_api,masarifi_worker to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;
set local role masarifi_migration;
insert into public.profiles(id,status) values ('ledger_owner_a','active'),('ledger_owner_b','active');
insert into public.accounts(id,user_id,name,type,currency_code) values
 ('50000000-0000-4000-8000-000000000001','ledger_owner_a','A','cash','SAR'),
 ('50000000-0000-4000-8000-000000000002','ledger_owner_a','B','bank','SAR'),
 ('50000000-0000-4000-8000-000000000003','ledger_owner_a','USD','bank','USD'),
 ('50000000-0000-4000-8000-000000000004','ledger_owner_b','Other','cash','SAR');
reset role;
select set_config('request.jwt.claims','{"sub":"ledger_owner_a","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table command_results(name text primary key,result jsonb) on commit drop;

insert into command_results values ('income',private.post_transaction('ledger_owner_a',jsonb_build_object(
  'kind','income','amountMinor',1000,'currency','SAR','accountId','50000000-0000-4000-8000-000000000001',
  'categoryId','04000000-0000-4000-8000-000000000016','title','Salary','occurredAt','2026-08-01T00:00:00Z')));
select is((select count(*)::integer from public.transactions where user_id='ledger_owner_a' and kind='income'),1,'income header inserted');
select is((select count(*)::integer from public.transaction_postings where transaction_id=((select result->>'transactionId' from command_results where name='income'))::uuid),1,'income has one posting');
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),1000::bigint,'income updates projection');
select is((select count(*)::integer from audit.transaction_revisions where transaction_id=((select result->>'transactionId' from command_results where name='income'))::uuid),1,'income has opening revision');

insert into command_results values ('expense',private.post_transaction('ledger_owner_a',jsonb_build_object(
  'kind','expense','amountMinor',250,'currency','SAR','accountId','50000000-0000-4000-8000-000000000001',
  'categoryId','04000000-0000-4000-8000-000000000002','title','Food','occurredAt','2026-08-02T00:00:00Z')));
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),750::bigint,'expense subtracts projection');

insert into command_results values ('transfer',private.transfer_funds('ledger_owner_a',jsonb_build_object(
  'sourceAccountId','50000000-0000-4000-8000-000000000001','destinationAccountId','50000000-0000-4000-8000-000000000002',
  'amountMinor',100,'currency','SAR','feeMinor',10,'title','Move','occurredAt','2026-08-03T00:00:00Z')));
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),640::bigint,'transfer source and fee subtract');
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000002'),100::bigint,'transfer destination adds');
select is((select count(*)::integer from public.transaction_postings where transaction_id=((select result->>'transactionId' from command_results where name='transfer'))::uuid),3,'fee transfer has three postings');

select throws_ok($$select private.transfer_funds('ledger_owner_a',jsonb_build_object(
  'sourceAccountId','50000000-0000-4000-8000-000000000001','destinationAccountId','50000000-0000-4000-8000-000000000003',
  'amountMinor',1,'currency','SAR','title','Bad','occurredAt','2026-08-03T00:00:00Z'))$$,
  'P0001','CURRENCY_MISMATCH','cross-currency transfer is atomic rejection');
select is((select count(*)::integer from public.transactions where user_id='ledger_owner_a'),3,'failed transfer leaves no header');

update command_results set result=private.revise_transaction('ledger_owner_a',(result->>'transactionId')::uuid,1,'{"amountMinor":1200}'::jsonb,'correct amount') where name='income';
select is((select version from public.transactions where id=((select result->>'transactionId' from command_results where name='income'))::uuid),2::bigint,'revision advances exact version');
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),840::bigint,'revision appends net delta');
select throws_ok($$select private.revise_transaction('ledger_owner_a',
  (select (result->>'transactionId')::uuid from command_results where name='income'),1,'{"title":"stale"}'::jsonb,'stale change')$$,
  'P0001','VERSION_CONFLICT','stale revision is rejected');

insert into command_results values ('refund',private.refund_transaction('ledger_owner_a',
  (select (result->>'transactionId')::uuid from command_results where name='expense'),1,100,null,'2026-08-04T00:00:00Z','partial refund'));
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),940::bigint,'refund credits projection');
select throws_ok($$select private.refund_transaction('ledger_owner_a',
  (select (result->>'transactionId')::uuid from command_results where name='expense'),2,151,null,'2026-08-04T00:00:00Z','too much refund')$$,
  'P0001','REFUND_EXCEEDS_AVAILABLE','refund cap is enforced');

insert into command_results values ('reversal',private.reverse_transaction('ledger_owner_a',
  (select (result->>'transactionId')::uuid from command_results where name='transfer'),1,'2026-08-05T00:00:00Z','reverse transfer'));
select is((select status from public.transactions where id=((select result->>'transactionId' from command_results where name='transfer'))::uuid),'reversed','original is reversed');
select throws_ok($$select private.reverse_transaction('ledger_owner_a',
  (select (result->>'transactionId')::uuid from command_results where name='transfer'),2,'2026-08-05T00:00:00Z','duplicate reversal')$$,
  'P0001','REVERSAL_EXISTS','second reversal is rejected');

update command_results set result=private.soft_delete_transaction('ledger_owner_a',(result->>'transactionId')::uuid,2,'remove mistake') where name='income';
select is((select status from public.transactions where id=((select result->>'transactionId' from command_results where name='income'))::uuid),'deleted','soft delete sets state');
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),-150::bigint,'delete appends exact compensation');
update command_results set result=private.restore_transaction('ledger_owner_a',(result->>'transactionId')::uuid,3) where name='income';
select is((select status from public.transactions where id=((select result->>'transactionId' from command_results where name='income'))::uuid),'confirmed','restore returns state');
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000001'),1050::bigint,'restore appends exact prior effect');

insert into command_results values ('opening',private.post_opening_transaction('ledger_owner_a','50000000-0000-4000-8000-000000000003',500,'Open','2026-08-01T00:00:00Z','manual'));
select is((select confirmed_minor from public.account_balances where account_id='50000000-0000-4000-8000-000000000003'),500::bigint,'opening projects signed amount');

reset role;
set local role masarifi_worker;
select is((select count(*)::integer from private.reconcile_account_balance(null,500)
  where matches and account_id in(
    '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003')),3,'bounded reconciliation matches all owner accounts');
reset role;
set local role masarifi_migration;
select throws_ok($$update public.transaction_postings set amount_minor=1 where true$$,'42501','LEDGER_EVIDENCE_IMMUTABLE','postings cannot update');
select throws_ok($$delete from audit.transaction_revisions where true$$,'42501','LEDGER_EVIDENCE_IMMUTABLE','revisions cannot delete');

reset role;
select * from finish();
rollback;
