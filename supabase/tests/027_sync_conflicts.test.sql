begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;

insert into public.profiles(id,status) values('sync_conflict_owner','active');
insert into public.user_devices(id,user_id,device_fingerprint,platform,app_version)
values('72000000-0000-4000-8000-000000000009','sync_conflict_owner','h1:'||repeat('d',64),'ios','1.0.0');
insert into public.accounts(id,user_id,name,type,currency_code)
values('72000000-0000-4000-8000-000000000001','sync_conflict_owner','Cash','cash','SAR');
insert into public.transactions(id,user_id,kind,amount_minor,currency_code,title,occurred_at)
values('72000000-0000-4000-8000-000000000002','sync_conflict_owner','expense',100,'SAR','Coffee',clock_timestamp());
insert into public.client_mutations(id,user_id,device_id,operation_id,domain,resource_type,schema_version,depends_on,operation,resource_id,
  base_version,payload_hash,payload)
values('72000000-0000-4000-8000-000000000003','sync_conflict_owner','72000000-0000-4000-8000-000000000009',
  '72000000-0000-4000-8000-000000000004','transactions','transaction',1,'{}','update',
  '72000000-0000-4000-8000-000000000002',1,'sha256:'||repeat('a',64),'{}');

select lives_ok($$select private.create_transaction_conflict(
  'sync_conflict_owner','72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002',2,1,array['title'],'{"title":"Server"}',
  '{"title":"Client"}')$$,'creates an explicit owner financial conflict');
select is((select count(*)::int from public.transaction_conflicts),1,'one conflict exists');
select lives_ok($$select private.create_transaction_conflict(
  'sync_conflict_owner','72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002',2,1,array['title'],'{"title":"Server"}',
  '{"title":"Client"}')$$,'duplicate conflict creation replays');
select is((select count(*)::int from public.transaction_conflicts),1,'duplicate creation adds no row');
select lives_ok($$select private.resolve_transaction_conflict('sync_conflict_owner',
  (select id from public.transaction_conflicts),'server',null,'request-one',
  'sha256:'||repeat('1',64),'sha256:'||repeat('2',64))$$,'resolves once');
select lives_ok($$select private.resolve_transaction_conflict('sync_conflict_owner',
  (select id from public.transaction_conflicts),'server',null,'request-two',
  'sha256:'||repeat('1',64),'sha256:'||repeat('2',64))$$,'identical resolution replays');
select throws_ok($$select private.resolve_transaction_conflict('sync_conflict_owner',
  (select id from public.transaction_conflicts),'client','{}','request-three',
  'sha256:'||repeat('3',64),'sha256:'||repeat('4',64))$$,
  'P0001','SYNC_CONFLICT_ALREADY_RESOLVED','different terminal resolution is rejected');
select throws_ok($$select private.resolve_transaction_conflict('sync_conflict_owner',
  (select id from public.transaction_conflicts),'keep_both',null,'request-four',
  'sha256:'||repeat('5',64),'sha256:'||repeat('6',64))$$,
  '22023','SYNC_CONFLICT_RESOLUTION_INVALID','financial keep-both is rejected');

select * from finish();
rollback;
