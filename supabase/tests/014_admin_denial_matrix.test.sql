begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
grant authenticated, masarifi_api, masarifi_worker, masarifi_migration to current_user with inherit true, set true;
grant usage on schema extensions to authenticated;
set local role masarifi_migration;
insert into public.profiles(id,status) values('event_owner','active'),('event_other','active'),('event_inactive','suspended');
insert into public.security_events(user_id,event_type,severity,metadata) values
('event_owner','security.login','info','{}'),('event_other','security.other_login','high','{}'),('event_inactive','security.inactive_login','medium','{}'),(null,'security.system','critical','{}');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"event_owner","sid":"sess"}',true);
set local role authenticated;
select is((select count(*)::int from public.security_events),1,'owner sees only own event');
select is((select count(*)::int from public.security_events where event_type='security.other_login'),0,'cross-owner hidden');
select is((select count(*)::int from public.security_events where event_type='security.system'),0,'system event hidden');
select ok(not has_table_privilege('authenticated','public.security_events','INSERT'),'authenticated cannot insert evidence');
select ok(not has_table_privilege('authenticated','public.security_events','UPDATE'),'authenticated cannot mutate evidence');
select * from finish();
rollback;
