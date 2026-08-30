begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

select has_table('public','transactions','transaction headers exist');
select has_table('public','transaction_postings','postings exist');
select has_table('audit','transaction_revisions','revisions exist');
select has_table('public','account_balances','balance projections exist');
select has_view('public','v_account_balance_summary','owner-safe balance view exists');
select has_pk('public','transactions','transaction PK exists');
select has_pk('public','transaction_postings','posting PK exists');
select has_pk('audit','transaction_revisions','revision PK exists');
select has_pk('public','account_balances','balance PK exists');
select has_column('public','transactions','user_id','transaction owner exists');
select has_column('public','transactions','kind','transaction kind exists');
select has_column('public','transactions','status','transaction state exists');
select has_column('public','transactions','amount_minor','declared amount exists');
select has_column('public','transactions','fee_minor','declared fee exists');
select has_column('public','transactions','currency_code','transaction currency exists');
select has_column('public','transactions','category_id','transaction category exists');
select has_column('public','transactions','title','Mobile title exists');
select has_column('public','transactions','payment_method','Mobile payment method exists');
select has_column('public','transactions','reverses_transaction_id','linked original exists');
select has_column('public','transactions','undo_expires_at','undo deadline exists');
select has_column('public','transactions','version','expected version exists');
select has_column('public','transaction_postings','amount_minor','signed minor units exist');
select has_column('public','transaction_postings','clearing_state','clearing state exists');
select has_column('public','transaction_postings','posting_role','posting role exists');
select has_column('audit','transaction_revisions','before_snapshot','before snapshot exists');
select has_column('audit','transaction_revisions','after_snapshot','after snapshot exists');
select has_column('public','account_balances','confirmed_minor','confirmed projection exists');
select has_column('public','account_balances','pending_minor','pending projection exists');
select has_column('public','account_balances','ledger_version','ledger version exists');
select col_is_fk('public','transactions','user_id','transaction owner FK exists');
select col_is_fk('public','transaction_postings','transaction_id','posting transaction FK exists');
select col_is_fk('public','transaction_postings','account_id','posting account FK exists');
select col_is_fk('public','account_balances','account_id','balance account FK exists');
select has_index('public','transactions','transactions_owner_cursor_idx','owner cursor index exists');
select has_index('public','transactions','transactions_owner_status_cursor_idx','owner/status cursor index exists');
select has_index('public','transactions','transactions_external_ref_uq','external reference is unique');
select has_index('public','transaction_postings','transaction_postings_transaction_idx','posting transaction index exists');
select has_index('public','transaction_postings','transaction_postings_account_cursor_idx','posting account cursor index exists');
select has_index('audit','transaction_revisions','transaction_revisions_number_uq','revision number is unique');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid=any(array[
  'public.transactions'::regclass,'public.transaction_postings'::regclass,
  'audit.transaction_revisions'::regclass,'public.account_balances'::regclass])),
  'all ledger tables force RLS');
select ok(exists(select 1 from pg_trigger where tgrelid='public.transaction_postings'::regclass and tgname='transaction_postings_immutable'),'posting immutable trigger exists');
select ok(exists(select 1 from pg_trigger where tgrelid='audit.transaction_revisions'::regclass and tgname='transaction_revisions_immutable'),'revision immutable trigger exists');
select ok(exists(select 1 from pg_trigger where tgrelid='public.account_balances'::regclass and tgname='account_balances_guard'),'projection guard exists');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name in ('balance','balance_minor','opening_balance_minor')),'account metadata has no balance source');

select * from finish();
rollback;
