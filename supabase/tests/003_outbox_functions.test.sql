begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

grant masarifi_api, masarifi_worker to current_user with inherit true, set false;

select has_function('private', 'set_updated_at_and_version', array[]::text[], 'trigger helper exists');
select has_function('private', 'enqueue_outbox_event', array['text','text','uuid','jsonb'], 'enqueue exists');
select has_function('private', 'claim_outbox_batch', array['text','integer','integer'], 'claim exists');
select function_owner_is('private', 'set_updated_at_and_version', array[]::text[], 'masarifi_migration', 'trigger helper owner');
select function_owner_is('private', 'enqueue_outbox_event', array['text','text','uuid','jsonb'], 'masarifi_migration', 'enqueue owner');
select function_owner_is('private', 'claim_outbox_batch', array['text','integer','integer'], 'masarifi_migration', 'claim owner');
select is((select proconfig[1] from pg_proc where oid = 'private.set_updated_at_and_version()'::regprocedure), 'search_path=pg_catalog', 'trigger helper search path fixed');
select is((select proconfig[1] from pg_proc where oid = 'private.enqueue_outbox_event(text,text,uuid,jsonb)'::regprocedure), 'search_path=pg_catalog', 'enqueue search path fixed');
select is((select proconfig[1] from pg_proc where oid = 'private.claim_outbox_batch(text,integer,integer)'::regprocedure), 'search_path=pg_catalog', 'claim search path fixed');
select ok(has_table_privilege('masarifi_worker','pgmq."q_platform-events"','select'), 'worker can read platform event queue rows');
select ok(has_table_privilege('masarifi_worker','pgmq."q_platform-events"','insert'), 'worker can publish platform event queue rows');
select ok(has_sequence_privilege('masarifi_worker','pgmq."q_platform-events_msg_id_seq"','usage'), 'worker can allocate platform event queue ids');
set local synchronous_commit = on;
do $$ begin
  perform * from private.claim_outbox_batch('commit-mode-test', 1, 1);
end $$;
select is(current_setting('synchronous_commit'), 'off', 'claim lease commits asynchronously');
set local synchronous_commit = on;
select throws_ok($$select private.enqueue_outbox_event('bad', 'account', null, '{}'::jsonb)$$, '22023', 'OUTBOX_EVENT_TYPE_INVALID', 'event name is bounded');
select throws_ok($$select private.enqueue_outbox_event('account.changed', 'account', null, '{"token":"x"}'::jsonb)$$, '22023', 'OUTBOX_PAYLOAD_SENSITIVE', 'sensitive payload rejected');
select throws_ok($$select * from private.claim_outbox_batch('worker', 101, 30)$$, '22023', 'OUTBOX_CLAIM_LIMIT_INVALID', 'claim limit bounded');
select throws_ok($$select * from private.claim_outbox_batch('', 1, 30)$$, '22023', 'OUTBOX_WORKER_ID_INVALID', 'worker ID bounded');
select throws_ok($$select * from private.claim_outbox_batch('worker', 1, 301)$$, '22023', 'OUTBOX_LEASE_INVALID', 'lease bounded');
select lives_ok($$select private.enqueue_outbox_event('account.changed', 'account', null, '{}'::jsonb)$$, 'valid enqueue succeeds');

select * from finish();
rollback;
