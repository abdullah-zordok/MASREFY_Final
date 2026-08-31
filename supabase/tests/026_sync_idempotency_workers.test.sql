begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_column('private','idempotency_keys','lease_token','idempotency fence column exists');
select has_function('private','claim_sync_idempotency_key',array['text','text','text','text','interval'],'fenced claim exists');
select has_function('private','complete_sync_idempotency_key',array['text','text','text','text','uuid','integer','jsonb','text'],'fenced completion exists');
select has_function('private','receive_client_mutation',array['text','uuid','integer','uuid','text','text','integer','uuid[]','text','text','bigint','text','jsonb'],'mutation receive exists');
select has_function('private','claim_client_mutations',array['text','integer','integer'],'mutation claim exists');
select has_function('private','complete_client_mutation',array['uuid','uuid','text','jsonb','jsonb'],'mutation completion exists');
select has_function('private','check_sync_reconciliation',array[]::text[],'reconciliation check exists');

select (
  to_regprocedure('private.claim_sync_idempotency_key(text,text,text,text,interval)') is not null
  and to_regprocedure('private.complete_sync_idempotency_key(text,text,text,text,uuid,integer,jsonb,text)') is not null
  and to_regprocedure('private.receive_client_mutation(text,uuid,integer,uuid,text,text,integer,uuid[],text,text,bigint,text,jsonb)') is not null
  and to_regprocedure('private.claim_client_mutations(text,integer,integer)') is not null
  and to_regprocedure('private.complete_client_mutation(uuid,uuid,text,jsonb,jsonb)') is not null
) as sync_functions_exist \gset

\if :sync_functions_exist

grant masarifi_migration,masarifi_api,masarifi_worker to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api,masarifi_worker;
set local role masarifi_migration;
insert into public.profiles(id,status) values ('sync_worker_owner','active');
insert into public.user_devices(
  id,user_id,device_fingerprint,clerk_session_id,platform,app_version
) values(
  '62000000-0000-4000-8000-000000000009','sync_worker_owner',
  'h1:'||repeat('d',64),'sync-session','ios','1.0.0'
);
reset role;

select set_config('request.jwt.claims','{"sub":"sync_worker_owner","sid":"sync-session","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table first_claim as select * from private.claim_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:'||repeat('1',64),
  'sha256:'||repeat('2',64),interval '5 minutes');
select is((select outcome from first_claim),'new','first fenced claim is new');
select ok((select lease_token is not null from first_claim),'new claim returns a fence');

select is((select outcome from private.claim_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:'||repeat('1',64),
  'sha256:'||repeat('2',64),interval '5 minutes')),'in_progress','live claim is not stolen');
reset role;

set local role masarifi_migration;
update private.idempotency_keys set locked_until=created_at
where actor_id='sync_worker_owner' and scope='sync.mutations';
reset role;
set local role masarifi_api;
create temporary table second_claim as select * from private.claim_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:'||repeat('1',64),
  'sha256:'||repeat('2',64),interval '5 minutes');
select isnt((select lease_token from second_claim),(select lease_token from first_claim),'reclaim rotates the fence');
select throws_ok(format($$select private.complete_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:%s','sha256:%s','%s',200,'{"ok":true}','batch:one')$$,
  repeat('1',64),repeat('2',64),(select lease_token from first_claim)),
  'P0001','IDEMPOTENCY_LEASE_LOST','stale fence cannot complete');
select lives_ok(format($$select private.complete_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:%s','sha256:%s','%s',200,'{"ok":true}','batch:one')$$,
  repeat('1',64),repeat('2',64),(select lease_token from second_claim)),
  'current fence completes');
select is((select outcome from private.claim_sync_idempotency_key(
  'sync_worker_owner','sync.mutations','sha256:'||repeat('1',64),
  'sha256:'||repeat('2',64),interval '5 minutes')),'replay','completed fenced request replays');

select is((select outcome from private.receive_client_mutation(
  'sync_worker_owner','62000000-0000-4000-8000-000000000009',700,'62000000-0000-4000-8000-000000000001',
  'transactions','transaction',1,'{}','create','local-1',null,'sha256:'||repeat('3',64),'{}')),'received','first mutation is received');
select is((select outcome from private.receive_client_mutation(
  'sync_worker_owner','62000000-0000-4000-8000-000000000009',700,'62000000-0000-4000-8000-000000000001',
  'transactions','transaction',1,'{}','create','local-1',null,'sha256:'||repeat('3',64),'{}')),'replay','same mutation replays');
select is((select outcome from private.receive_client_mutation(
  'sync_worker_owner','62000000-0000-4000-8000-000000000009',700,'62000000-0000-4000-8000-000000000001',
  'transactions','transaction',1,'{}','create','local-1',null,'sha256:'||repeat('4',64),'{}')),'hash_mismatch','different payload is rejected');
reset role;

set local role masarifi_worker;
create temporary table mutation_claim as select * from private.claim_client_mutations('worker-one',1,60);
select is((select status from mutation_claim),'processing','worker claims pending mutation');
select is((select factor_age_seconds from mutation_claim),700,'worker receives acceptance-time recent-auth age');
select ok((select lease_token is not null from mutation_claim),'worker claim is fenced');
select lives_ok(format($$select private.complete_client_mutation('%s','%s','applied','{"resourceId":"server-1"}',null)$$,
  (select id from mutation_claim),(select lease_token from mutation_claim)),'current worker fence completes mutation');
select throws_ok(format($$select private.complete_client_mutation('%s','%s','applied','{}',null)$$,
  (select id from mutation_claim),extensions.gen_random_uuid()),'P0001','SYNC_MUTATION_LEASE_LOST','wrong worker fence is rejected');

reset role;
set local role masarifi_api;
create temporary table dependency_parent as select * from private.receive_client_mutation(
  'sync_worker_owner','62000000-0000-4000-8000-000000000009',700,
  '62000000-0000-4000-8000-000000000005','accounts','account',1,'{}','create',
  'local-parent',null,'sha256:'||repeat('5',64),'{}');
create temporary table dependency_child as select * from private.receive_client_mutation(
  'sync_worker_owner','62000000-0000-4000-8000-000000000009',700,
  '62000000-0000-4000-8000-000000000006','accounts','account',1,
  array['62000000-0000-4000-8000-000000000005'::uuid],'create',
  'local-child',null,'sha256:'||repeat('6',64),'{}');
reset role;
set local role masarifi_worker;
create temporary table dependency_claim as select * from private.claim_client_mutations('worker-two',10,60);
select is((select operation_id from dependency_claim),'62000000-0000-4000-8000-000000000005'::uuid,
  'a dependant waits until its parent is terminally applied');
select lives_ok(format($$select private.complete_client_mutation('%s','%s','rejected',null,'{"code":"INVALID_PARENT"}')$$,
  (select id from dependency_claim),(select lease_token from dependency_claim)),
  'a failed parent completes terminally');
create temporary table blocked_dependency_claim as select * from private.claim_client_mutations('worker-two',10,60);
reset role;
set local role masarifi_migration;
select is((select status from public.client_mutations where operation_id='62000000-0000-4000-8000-000000000006'),
  'rejected','a dependant of a rejected parent is rejected without dispatch');
select is(private.check_sync_reconciliation(),0,'reconciliation reports no drift for consistent state');
insert into public.client_sync_state(user_id,device_id,domain,last_cursor,last_issued_cursor)
values('sync_worker_owner','62000000-0000-4000-8000-000000000009','accounts',1,1);
select is(private.check_sync_reconciliation(),1,'reconciliation detects an ahead checkpoint');

\else
select * from skip(19,'Phase 06 functions are not implemented yet');
\endif

reset role;
select * from finish();
rollback;
