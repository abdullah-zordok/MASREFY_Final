begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

grant authenticated, anon, masarifi_api, masarifi_worker, masarifi_migration
  to current_user with inherit true, set true;
grant usage on schema extensions to authenticated, anon;

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.profiles'::regclass),'profiles force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.user_preferences'::regclass),'preferences force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.onboarding_progress'::regclass),'onboarding force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.user_devices'::regclass),'devices force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.push_tokens'::regclass),'push tokens force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.clerk_webhook_events'::regclass),'webhook inbox force RLS');

select ok(not exists(select 1 from information_schema.role_table_grants where grantee='anon' and table_name in ('profiles','user_preferences','onboarding_progress','user_devices','push_tokens','clerk_webhook_events')),'anonymous has no table grants');
select ok(not exists(select 1 from information_schema.role_table_grants where grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE') and table_name in ('profiles','user_preferences','onboarding_progress','user_devices','push_tokens','clerk_webhook_events')),'authenticated has no writes');
select ok(not has_table_privilege('authenticated','public.profiles','INSERT'),'authenticated cannot insert profiles');
select ok(not has_table_privilege('authenticated','public.profiles','UPDATE'),'authenticated cannot update profiles');
select ok(not has_table_privilege('authenticated','public.profiles','DELETE'),'authenticated cannot delete profiles');
select ok(not has_table_privilege('authenticated','public.push_tokens','SELECT'),'authenticated cannot read push tokens');
select ok(not has_table_privilege('authenticated','private.clerk_webhook_events','SELECT'),'authenticated cannot read webhook inbox');
select ok(not has_column_privilege('masarifi_api','public.profiles','status','UPDATE'),'API cannot perform Admin lifecycle changes');
select ok(not has_column_privilege('masarifi_api','private.clerk_webhook_events','payload','SELECT'),'API cannot inspect webhook payload');
select ok(not has_column_privilege('masarifi_api','public.push_tokens','token_ciphertext','SELECT'),'API cannot inspect push ciphertext');
select ok(not has_column_privilege('masarifi_worker','private.clerk_webhook_events','clerk_event_id','UPDATE'),'worker cannot rewrite webhook identity');
select ok(not has_table_privilege('masarifi_worker','public.profiles','DELETE'),'worker cannot delete profiles');
select ok(not exists(select 1 from pg_roles where rolname in ('masarifi_api','masarifi_worker') and rolbypassrls),'runtime roles cannot bypass RLS');
select ok(not exists(select 1 from pg_roles where rolname in ('masarifi_api','masarifi_worker') and rolcanlogin),'runtime roles cannot login directly');
select ok(not exists(select 1 from pg_roles where rolname ~* 'masarifi.*admin'),'no Masarifi Admin database role exists');

insert into public.profiles(id,status) values('admin_denial_owner','active'),('admin_denial_other','active');
insert into public.user_devices(id,user_id,device_fingerprint,platform,app_version)
values('0198f79d-98f3-7bb4-a820-f43bb4d0e180','admin_denial_owner','h1:'||repeat('d',64),'web','1.0.0'),
      ('0198f79d-98f3-7bb4-a820-f43bb4d0e181','admin_denial_other','h1:'||repeat('e',64),'web','1.0.0');

select set_config('request.jwt.claims','{"sub":"admin_denial_owner","role":"authenticated"}',true);
set local role authenticated;
select extensions.is((select count(id)::bigint from public.user_devices),1::bigint,'authenticated sees only own safe device');
select extensions.is((select count(id)::bigint from public.user_devices where id='0198f79d-98f3-7bb4-a820-f43bb4d0e181'),0::bigint,'authenticated cannot see other owner');
select extensions.throws_ok($$select primary_email from public.profiles$$,'42501',null,'authenticated cannot read provider contact');
reset role;

select set_config('request.jwt.claims','{"sub":"admin_denial_owner","role":"super-admin"}',true);
set local role authenticated;
select extensions.is((select count(id)::bigint from public.user_devices where id='0198f79d-98f3-7bb4-a820-f43bb4d0e181'),0::bigint,'simulated Admin claim grants no cross-owner authority');
reset role;

select * from finish();
rollback;
