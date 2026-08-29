begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public','currencies','currencies exist');
select has_table('public','supported_countries','countries exist');
select has_table('public','categories','categories exist');
select has_table('public','accounts','accounts exist');
select has_table('public','exchange_rates','exchange rates exist');
select has_pk('public','currencies','currency primary key');
select has_pk('public','supported_countries','country primary key');
select has_pk('public','categories','category primary key');
select has_pk('public','accounts','account primary key');
select has_pk('public','exchange_rates','rate primary key');
select has_column('public','categories','label_ar','Arabic label exists');
select has_column('public','categories','label_en','English label exists');
select has_column('public','categories','merged_into_id','merge target exists');
select has_column('public','accounts','credit_limit_minor','credit limit exists');
select has_column('public','accounts','include_in_totals','totals flag exists');
select has_column('public','accounts','closed_at','close date exists');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='balance'), 'account has no balance');
select has_index('public','categories','categories_system_key_uq','system keys are unique');
select has_index('public','categories','categories_user_label_ar_uq','active Arabic labels are unique');
select has_index('public','categories','categories_user_label_en_uq','active English labels are unique');
select has_index('public','accounts','accounts_active_default_uq','one active default index exists');
select has_index('public','exchange_rates','exchange_rates_pair_effective_idx','rate lookup index exists');
select is((select count(*)::integer from public.currencies),12,'12 executable currencies seeded');
select is((select count(*)::integer from public.supported_countries),11,'11 ISO countries seeded');
select is((select count(*)::integer from public.categories where user_id is null),19,'19 system categories seeded');
select is((select count(*)::integer from public.permissions where key in ('reference.read','reference.write')),2,'two reference permissions seeded');
grant masarifi_migration to current_user with inherit true, set true;
set local role masarifi_migration;
create temporary table repeated_seed_counts(resource text primary key,inserted integer) on commit drop;
with repeated as (insert into public.currencies(code,name,minor_unit,enabled) select code,name,minor_unit,enabled from public.currencies on conflict(code) do nothing returning 1)
insert into repeated_seed_counts select 'currencies',count(*)::integer from repeated;
with repeated as (insert into public.supported_countries(code,name,default_currency,enabled) select code,name,default_currency,enabled from public.supported_countries on conflict(code) do nothing returning 1)
insert into repeated_seed_counts select 'countries',count(*)::integer from repeated;
with repeated as (insert into public.categories(id,user_id,kind,label_ar,label_en,icon,color,system_key,sort_order) select id,user_id,kind,label_ar,label_en,icon,color,system_key,sort_order from public.categories where user_id is null on conflict(id) do nothing returning 1)
insert into repeated_seed_counts select 'categories',count(*)::integer from repeated;
select is((select inserted from repeated_seed_counts where resource='currencies'),0,'repeated currency seed inserts zero rows');
select is((select inserted from repeated_seed_counts where resource='countries'),0,'repeated country seed inserts zero rows');
select is((select inserted from repeated_seed_counts where resource='categories'),0,'repeated system-category seed inserts zero rows');
reset role;
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid=any(array['public.currencies'::regclass,'public.supported_countries'::regclass,'public.categories'::regclass,'public.accounts'::regclass,'public.exchange_rates'::regclass])), 'all five tables force RLS');
select col_is_fk('public','user_preferences','default_currency','preference currency FK validates');

select * from finish();
rollback;
