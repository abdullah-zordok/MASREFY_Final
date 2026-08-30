begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('private','idempotency_keys','idempotency table exists');
select has_pk('private','idempotency_keys','idempotency primary key exists');
select has_column('private','idempotency_keys','actor_id','actor subject exists');
select has_column('private','idempotency_keys','scope','scope exists');
select has_column('private','idempotency_keys','key_hash','key hash exists');
select has_column('private','idempotency_keys','request_hash','request hash exists');
select has_column('private','idempotency_keys','response_status','response status exists');
select has_column('private','idempotency_keys','response_body','response body exists');
select has_column('private','idempotency_keys','resource_ref','resource reference exists');
select has_column('private','idempotency_keys','state','state exists');
select has_column('private','idempotency_keys','locked_until','claim lease exists');
select has_column('private','idempotency_keys','expires_at','retention boundary exists');
select has_index('private','idempotency_keys','idempotency_keys_actor_scope_key_uq','actor/scope/key is unique');
select has_index('private','idempotency_keys','idempotency_keys_expires_idx','expiry index exists');
select has_index('private','idempotency_keys','idempotency_keys_active_lease_idx','active lease index exists');
select has_function('private','claim_idempotency_key',array['text','text','text','text','interval'],'claim function exists');
select has_function('private','lookup_idempotency_key',array['text','text','text','text'],'lookup function exists');
select has_function('private','complete_idempotency_key',array['text','text','text','text','integer','jsonb','text'],'complete function exists');

grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api;

select ok(not has_table_privilege('public','private.idempotency_keys','SELECT'),'PUBLIC has no table read');
select ok(not has_table_privilege('authenticated','private.idempotency_keys','SELECT'),'authenticated has no table read');
select ok(not has_table_privilege('masarifi_api','private.idempotency_keys','SELECT'),'API has no direct table read');
select ok(has_function_privilege('masarifi_api','private.claim_idempotency_key(text,text,text,text,interval)','EXECUTE'),'API can claim');
select ok(has_function_privilege('masarifi_api','private.lookup_idempotency_key(text,text,text,text)','EXECUTE'),'API can lookup completed replay');
select ok(not has_function_privilege('public','private.claim_idempotency_key(text,text,text,text,interval)','EXECUTE'),'PUBLIC cannot claim');
select ok(not has_function_privilege('public','private.lookup_idempotency_key(text,text,text,text)','EXECUTE'),'PUBLIC cannot lookup replay');

set local role masarifi_migration;
insert into public.profiles(id,status) values ('ledger_idem_owner','active');
reset role;
select set_config('request.jwt.claims','{"sub":"ledger_idem_owner","role":"authenticated"}',true);
set local role masarifi_api;

select is(
  (select outcome from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
    'sha256:'||repeat('b',64),interval '5 minutes')),
  'new','first claim is new');
select is(
  (select outcome from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('c',64),
    'sha256:'||repeat('d',64),interval '5 minutes')),
  'new','second key first claim is new');
select is(
  (select outcome from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('c',64),
    'sha256:'||repeat('d',64),interval '5 minutes')),
  'in_progress','active claim is reported');
select lives_ok($$select private.complete_idempotency_key(
  'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
  'sha256:'||repeat('b',64),201,'{"ok":true}'::jsonb,'transaction:test')$$,
  'completion succeeds');
select is(
  (select outcome from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
    'sha256:'||repeat('b',64),interval '5 minutes')),
  'replay','completed request replays');
select is(
  (select response_status from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
    'sha256:'||repeat('b',64),interval '5 minutes')),
  201,'replay preserves response status');
select is(
  (select outcome from private.lookup_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
    'sha256:'||repeat('b',64))),
  'replay','lookup returns a completed replay without claiming new work');
select is(
  (select outcome from private.claim_idempotency_key(
    'ledger_idem_owner','transactions.create','sha256:'||repeat('a',64),
    'sha256:'||repeat('e',64),interval '5 minutes')),
  'hash_mismatch','same key different request is rejected');

reset role;
set local role masarifi_migration;
select throws_ok($$insert into private.idempotency_keys(
  actor_id,scope,key_hash,request_hash,locked_until,expires_at)
  values ('ledger_idem_owner','transactions.create','bad','sha256:'||repeat('f',64),now(),now()+interval '1 hour')$$,
  '23514',null,'invalid hash is constrained');
select throws_ok($$update private.idempotency_keys set request_hash='sha256:'||repeat('f',64)
  where key_hash='sha256:'||repeat('a',64)$$,
  '42501','IDEMPOTENCY_KEY_IMMUTABLE','completed identity is immutable');

reset role;
select * from finish();
rollback;
