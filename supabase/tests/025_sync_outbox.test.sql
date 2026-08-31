begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_index('private','outbox_events','outbox_events_sync_cursor_uq','sync cursor uniqueness exists');
select has_index('private','outbox_events','outbox_events_sync_delta_idx','sync delta keyset index exists');
select ok(exists(select 1 from pg_trigger where tgrelid='private.outbox_events'::regclass and tgname='outbox_events_sync_metadata'),'sync metadata trigger exists');
select ok(exists(select 1 from pg_trigger where tgrelid='private.outbox_events'::regclass and tgname='outbox_events_payload_immutable'),'outbox payload immutability trigger exists');

grant masarifi_migration to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values ('sync_outbox_owner','active');
insert into public.accounts(id,user_id,name,type,currency_code) values
 ('61000000-0000-4000-8000-000000000001','sync_outbox_owner','Cash','cash','SAR');

select throws_ok($$select private.enqueue_outbox_event(
  'account.created','account','61000000-0000-4000-8000-000000000001',
  '{"accountId":"61000000-0000-4000-8000-000000000001","userId":"sync_outbox_owner","version":1,"occurredAt":"2026-08-31T00:00:00Z","sync":{}}')$$,
  '22023','SYNC_METADATA_RESERVED','caller cannot spoof sync metadata');

select lives_ok($$select private.enqueue_outbox_event(
  'account.created','account','61000000-0000-4000-8000-000000000001',
  '{"accountId":"61000000-0000-4000-8000-000000000001","userId":"sync_outbox_owner","version":1,"occurredAt":"2026-08-31T00:00:00Z"}')$$,
  'first owner event is enriched');
select lives_ok($$select private.enqueue_outbox_event(
  'account.updated','account','61000000-0000-4000-8000-000000000001',
  '{"accountId":"61000000-0000-4000-8000-000000000001","userId":"sync_outbox_owner","version":1,"occurredAt":"2026-08-31T00:00:01Z"}')$$,
  'second owner event is enriched');

select is((select min((payload#>>'{sync,cursor}')::bigint) from private.outbox_events where payload#>>'{sync,userId}'='sync_outbox_owner'),1::bigint,'owner cursor begins at one');
select is((select max((payload#>>'{sync,cursor}')::bigint) from private.outbox_events where payload#>>'{sync,userId}'='sync_outbox_owner'),2::bigint,'owner cursor is monotonic');
select is((select count(distinct payload#>>'{sync,domain}')::integer from private.outbox_events where payload#>>'{sync,userId}'='sync_outbox_owner'),1,'owner events map to one domain');
select is((select payload#>>'{sync,snapshot,name}' from private.outbox_events where event_type='account.created' and payload#>>'{sync,userId}'='sync_outbox_owner'),'Cash','snapshot is captured at insertion');
select throws_ok($$update private.outbox_events set payload=jsonb_set(payload,'{sync,cursor}','99') where payload#>>'{sync,userId}'='sync_outbox_owner'$$,
  '42501','OUTBOX_PAYLOAD_IMMUTABLE','published sync payload cannot be rewritten');

select lives_ok($$select private.enqueue_outbox_event(
  'exchange-rate.refreshed','exchange-rate',null,
  '{"exchangeRateId":"61000000-0000-4000-8000-000000000002","baseCurrency":"SAR","quoteCurrency":"USD","provider":"test","effectiveAt":"2026-08-31T00:00:00Z","occurredAt":"2026-08-31T00:00:00Z"}')$$,
  'non-sync event remains compatible');

reset role;
select * from finish();
rollback;
