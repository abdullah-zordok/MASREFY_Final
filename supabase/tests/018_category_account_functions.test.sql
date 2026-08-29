begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function('private','resolve_category',array['text','uuid','text'],'category resolver exists');
select has_function('private','resolve_exchange_rate',array['character','character','timestamp with time zone','interval'],'rate resolver exists');

grant masarifi_migration,masarifi_api,masarifi_worker to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api,masarifi_worker,masarifi_migration;
set local role masarifi_migration;
insert into public.profiles(id,status) values ('ref_owner_a','active'),('ref_owner_b','active');
insert into public.categories(id,user_id,kind,label_ar,label_en) values
 ('10000000-0000-4000-8000-000000000001','ref_owner_a','expense','أ','A'),
 ('10000000-0000-4000-8000-000000000002','ref_owner_b','expense','ب','B');
reset role;

select set_config('request.jwt.claims','{"sub":"ref_owner_a","role":"authenticated"}',true);
set local role masarifi_api;
select is((private.resolve_category('ref_owner_a','10000000-0000-4000-8000-000000000001','expense')).id::text,'10000000-0000-4000-8000-000000000001','owner category resolves');
select throws_ok($$select private.resolve_category('ref_owner_a','10000000-0000-4000-8000-000000000002','expense')$$,'P0001','CATEGORY_INVALID','cross-owner category is hidden');
select throws_ok($$select private.resolve_category('ref_owner_a','10000000-0000-4000-8000-000000000001','income')$$,'P0001','CATEGORY_INVALID','kind mismatch rejected');
select lives_ok($$insert into public.accounts(user_id,name,type,currency_code,is_default) values ('ref_owner_a','Cash','cash','SAR',true)$$,'first default allowed');
select throws_ok($$insert into public.accounts(user_id,name,type,currency_code,is_default) values ('ref_owner_a','Bank','bank','SAR',true)$$,'23505',null,'second active default rejected');
select throws_ok($$insert into public.accounts(user_id,name,type,currency_code,credit_limit_minor) values ('ref_owner_a','Bad','cash','SAR',1)$$,'23514',null,'credit limit only applies to credit cards');
select lives_ok($$insert into public.accounts(user_id,name,type,currency_code,credit_limit_minor) values ('ref_owner_a','Card','credit_card','SAR',100)$$,'credit card limit accepted');
select throws_ok($$update public.accounts set currency_code='USD' where user_id='ref_owner_a' and name='Cash'$$,'P0001','ACCOUNT_CURRENCY_LOCKED','currency updates fail closed');
select throws_ok($$update public.categories set parent_id='10000000-0000-4000-8000-000000000002' where id='10000000-0000-4000-8000-000000000001'$$,'P0001','CATEGORY_INVALID','cross-owner parent rejected');
select throws_ok($$update public.categories set parent_id=id where id='10000000-0000-4000-8000-000000000001'$$,'P0001','CATEGORY_CYCLE','self cycle rejected');
reset role;
set local role masarifi_worker;
select throws_ok($$insert into public.exchange_rates(base_currency,quote_currency,rate,effective_at,provider) values ('SAR','USD',0,clock_timestamp(),'test')$$,'23514',null,'zero rate rejected');
select lives_ok($$insert into public.exchange_rates(base_currency,quote_currency,rate,effective_at,provider) values ('SAR','USD',0.25,'2026-01-01T00:00:00Z','approved-test')$$,'approved rate inserted');
reset role;
set local role masarifi_api;
select is((select rate from private.resolve_exchange_rate('SAR','USD','2026-01-02T00:00:00Z','2 days'))::text,'0.250000000000','closest eligible rate resolves');
select is((select rate from private.resolve_exchange_rate('SAR','SAR','2026-01-02T00:00:00Z','2 days'))::text,'1.000000000000','identity rate resolves without row');
select throws_ok($$select private.resolve_exchange_rate('USD','SAR','2026-01-02T00:00:00Z','2 days')$$,'P0001','FX_UNAVAILABLE','missing pair is explicit');
reset role;
set local role masarifi_migration;
select throws_ok($$update public.exchange_rates set rate=0.3 where provider='approved-test'$$,'42501','EXCHANGE_RATE_IMMUTABLE','rate rows are immutable');

reset role;
select * from finish();
rollback;
