begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;

select ok(not has_table_privilege('anon','public.currencies','SELECT'),'anonymous cannot read currencies');
select ok(has_column_privilege('authenticated','public.currencies','code','SELECT'),'authenticated may read safe currency code');
select ok(not has_table_privilege('authenticated','public.currencies','UPDATE'),'authenticated cannot update currencies');
select ok(has_table_privilege('masarifi_api','public.accounts','SELECT'),'API may select accounts through RLS');
select ok(has_column_privilege('masarifi_api','public.accounts','name','INSERT'),'API may insert allowlisted account fields through RLS');
select ok(not has_table_privilege('authenticated','public.accounts','INSERT'),'Data API role cannot insert accounts');
select ok(not has_table_privilege('masarifi_worker','public.accounts','UPDATE'),'worker cannot mutate accounts');
select ok(has_column_privilege('masarifi_worker','public.exchange_rates','rate','INSERT'),'worker may insert immutable rate fields');
select ok(not has_table_privilege('masarifi_worker','public.exchange_rates','UPDATE'),'worker cannot update rates');
select ok(not has_function_privilege('public','private.resolve_category(text,uuid,text)','EXECUTE'),'PUBLIC cannot resolve categories');
select ok(not has_function_privilege('authenticated','private.resolve_exchange_rate(character,character,timestamptz,interval)','EXECUTE'),'Data API cannot execute rate resolver');
select ok(has_function_privilege('masarifi_api','private.resolve_category(text,uuid,text)','EXECUTE'),'API may resolve categories');
select ok(has_function_privilege('masarifi_api','private.resolve_exchange_rate(character,character,timestamptz,interval)','EXECUTE'),'API may resolve rates');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='accounts' and roles && array['anon']::name[]),0,'anonymous has no account policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='categories' and roles && array['anon']::name[]),0,'anonymous has no category policy');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='accounts' and cmd='SELECT' and roles && array['masarifi_api']::name[]),'API account owner-select policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='categories' and cmd='SELECT' and roles && array['authenticated']::name[]),'authenticated system-category select policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='exchange_rates' and cmd='INSERT' and roles && array['masarifi_worker']::name[]),'worker rate insert policy exists');
select ok(not has_table_privilege('masarifi_api','public.exchange_rates','UPDATE'),'API cannot update immutable rates');
select ok(not has_table_privilege('masarifi_api','public.accounts','DELETE'),'API cannot physically delete accounts');

select * from finish();
rollback;
