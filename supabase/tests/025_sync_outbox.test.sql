begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

insert into public.user_devices(
  id,user_id,device_fingerprint,clerk_session_id,platform,app_version
) values(
  '61000000-0000-4000-8000-000000000009','sync_outbox_owner',
  'h1:'||repeat('d',64),'sync-session','ios','1.0.0'
);
insert into public.client_sync_state(user_id,device_id,domain,last_cursor,last_issued_cursor)
values('sync_outbox_owner','61000000-0000-4000-8000-000000000009','accounts',2,2);
alter table private.outbox_events disable trigger outbox_events_payload_immutable;
update private.outbox_events
set published_at=clock_timestamp(),created_at=clock_timestamp()-interval '31 days'
where payload#>>'{sync,userId}'='sync_outbox_owner';
alter table private.outbox_events enable trigger outbox_events_payload_immutable;
select is(private.run_sync_maintenance('sync-state.cleanup',30),2,
  'acknowledged retained outbox events are removed');
select lives_ok($$select private.enqueue_outbox_event(
  'account.updated','account','61000000-0000-4000-8000-000000000001',
  '{"accountId":"61000000-0000-4000-8000-000000000001","userId":"sync_outbox_owner","version":1,"occurredAt":"2026-08-31T00:00:02Z"}')$$,
  'new owner event is enriched after retention cleanup');
select is((select payload#>>'{sync,cursor}' from private.outbox_events where payload#>>'{sync,userId}'='sync_outbox_owner'),
  '3','owner cursor high-water survives retention cleanup');

select lives_ok($$select private.enqueue_outbox_event(
  'exchange-rate.refreshed','exchange-rate',null,
  '{"exchangeRateId":"61000000-0000-4000-8000-000000000002","baseCurrency":"SAR","quoteCurrency":"USD","provider":"test","effectiveAt":"2026-08-31T00:00:00Z","occurredAt":"2026-08-31T00:00:00Z"}')$$,
  'non-sync event remains compatible');

reset role;
select * from finish();
rollback;
