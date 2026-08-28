begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration
  to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;

select has_table('private', 'clerk_webhook_events', 'webhook inbox exists');
select has_pk('private', 'clerk_webhook_events', 'webhook inbox has primary key');
select has_index('private', 'clerk_webhook_events', 'clerk_webhook_events_delivery_uq', 'delivery ID is unique');
select has_index('private', 'clerk_webhook_events', 'clerk_webhook_events_status_created_idx', 'claim and retention index exists');
select has_index('private', 'clerk_webhook_events', 'clerk_webhook_events_claim_idx', 'ordered active claim index exists');
select has_index('private', 'clerk_webhook_events', 'clerk_webhook_events_type_processed_idx', 'event evidence index exists');
select has_trigger('private', 'clerk_webhook_events', 'clerk_webhook_events_protect_receipt', 'receipt immutability trigger exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.clerk_webhook_events'::regclass), 'inbox RLS is forced');

select ok(has_column_privilege('masarifi_api', 'private.clerk_webhook_events', 'clerk_event_id', 'INSERT'), 'API may durably receive events');
select ok(has_column_privilege('masarifi_api', 'private.clerk_webhook_events', 'clerk_event_id', 'SELECT'), 'API may compare delivery identity');
select ok(has_column_privilege('masarifi_api', 'private.clerk_webhook_events', 'payload_hash', 'SELECT'), 'API may compare payload hash');
select ok(not has_column_privilege('masarifi_api', 'private.clerk_webhook_events', 'payload', 'SELECT'), 'API cannot read retained payloads');
select ok(not has_column_privilege('masarifi_api', 'private.clerk_webhook_events', 'status', 'UPDATE'), 'API cannot process events');
select ok(has_table_privilege('masarifi_worker', 'private.clerk_webhook_events', 'SELECT'), 'worker may claim events');
select ok(has_column_privilege('masarifi_worker', 'private.clerk_webhook_events', 'status', 'UPDATE'), 'worker may update lifecycle');
select ok(not has_column_privilege('masarifi_worker', 'private.clerk_webhook_events', 'clerk_event_id', 'UPDATE'), 'worker cannot change delivery ID');
select ok(not has_column_privilege('masarifi_worker', 'private.clerk_webhook_events', 'payload_hash', 'UPDATE'), 'worker cannot change payload hash');
select ok(not has_table_privilege('authenticated', 'private.clerk_webhook_events', 'SELECT'), 'authenticated cannot read inbox');
select ok(not has_table_privilege('anon', 'private.clerk_webhook_events', 'SELECT'), 'anonymous cannot read inbox');

insert into private.clerk_webhook_events (
  clerk_event_id, event_type, signature_verified_at, payload_hash, payload
) values (
  'msg_fixture_a', 'user.created', now(), repeat('a',64),
  '{"type":"user.created","data":{"id":"user_fixture_a"}}'
);

select extensions.throws_ok(
  $$insert into private.clerk_webhook_events(clerk_event_id,event_type,signature_verified_at,payload_hash,payload) values(' ','user.created',now(),repeat('a',64),'{}')$$,
  '23514', null, 'blank delivery ID rejected'
);
select extensions.throws_ok(
  $$insert into private.clerk_webhook_events(clerk_event_id,event_type,signature_verified_at,payload_hash,payload) values('msg_bad_type','session.created',now(),repeat('a',64),'{}')$$,
  '23514', null, 'unsupported stored type rejected'
);
select extensions.throws_ok(
  $$insert into private.clerk_webhook_events(clerk_event_id,event_type,signature_verified_at,payload_hash,payload) values('msg_bad_hash','user.created',now(),'raw','{}')$$,
  '23514', null, 'invalid payload hash rejected'
);
select extensions.throws_ok(
  $$insert into private.clerk_webhook_events(clerk_event_id,event_type,signature_verified_at,payload_hash,payload) values('msg_bad_payload','user.created',now(),repeat('b',64),'[]')$$,
  '23514', null, 'non-object payload rejected'
);
select extensions.throws_ok(
  $$update private.clerk_webhook_events set clerk_event_id='msg_changed' where clerk_event_id='msg_fixture_a'$$,
  '22023', 'WEBHOOK_RECEIPT_IMMUTABLE', 'delivery identity is immutable'
);
select extensions.throws_ok(
  $$update private.clerk_webhook_events set payload='{}' where clerk_event_id='msg_fixture_a'$$,
  '22023', 'WEBHOOK_PAYLOAD_IMMUTABLE', 'young payload cannot be redacted'
);

update private.clerk_webhook_events
set status='processing', attempt_count=1 where clerk_event_id='msg_fixture_a';
select is((select status from private.clerk_webhook_events where clerk_event_id='msg_fixture_a'),'processing','worker lifecycle accepts processing');
select extensions.throws_ok(
  $$update private.clerk_webhook_events set status='processed' where clerk_event_id='msg_fixture_a'$$,
  '23514', null, 'processed state requires timestamp'
);
update private.clerk_webhook_events
set status='processed', processed_at=now() where clerk_event_id='msg_fixture_a';
select ok((select processed_at is not null from private.clerk_webhook_events where clerk_event_id='msg_fixture_a'),'processed timestamp retained');

insert into private.clerk_webhook_events (
  clerk_event_id, event_type, signature_verified_at, payload_hash, payload,
  status, processed_at, created_at
) values (
  'msg_old', 'user.deleted', now()-interval '8 days', repeat('c',64),
  '{"type":"user.deleted","data":{"id":"user_fixture_a"}}',
  'processed', now()-interval '8 days', now()-interval '8 days'
);
update private.clerk_webhook_events set payload='{}' where clerk_event_id='msg_old';
select is((select payload from private.clerk_webhook_events where clerk_event_id='msg_old'),'{}'::jsonb,'old terminal payload redacted');
select is((select payload_hash from private.clerk_webhook_events where clerk_event_id='msg_old'),repeat('c',64),'hash survives redaction');
select is((select event_type from private.clerk_webhook_events where clerk_event_id='msg_old'),'user.deleted','type survives redaction');
select is((select status from private.clerk_webhook_events where clerk_event_id='msg_old'),'processed','status survives redaction');
select is((select attempt_count from private.clerk_webhook_events where clerk_event_id='msg_old'),0,'attempt evidence survives redaction');

set local role masarifi_api;
select extensions.is((select count(*)::bigint from private.clerk_webhook_events where clerk_event_id='msg_fixture_a'),1::bigint,'API may compare an existing receipt');
select extensions.throws_ok(
  $$select payload from private.clerk_webhook_events limit 1$$,
  '42501', null, 'API cannot select payload'
);
reset role;

set local role authenticated;
select extensions.throws_ok(
  $$select count(*) from private.clerk_webhook_events$$,
  '42501', null, 'authenticated has no private inbox access'
);
reset role;

select * from finish();
rollback;
