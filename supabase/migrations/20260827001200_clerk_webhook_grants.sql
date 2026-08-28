grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

alter table private.clerk_webhook_events enable row level security;
alter table private.clerk_webhook_events force row level security;

revoke all on private.clerk_webhook_events
  from public, anon, authenticated, masarifi_api, masarifi_worker;

grant insert (clerk_event_id, event_type, signature_verified_at, payload_hash, payload)
  on private.clerk_webhook_events to masarifi_api;
grant select (clerk_event_id, payload_hash)
  on private.clerk_webhook_events to masarifi_api;
grant select on private.clerk_webhook_events to masarifi_worker;
grant update (payload, status, attempt_count, processed_at, last_error_code)
  on private.clerk_webhook_events to masarifi_worker;

create policy clerk_webhook_events_api_insert
on private.clerk_webhook_events for insert to masarifi_api with check (true);
create policy clerk_webhook_events_api_select
on private.clerk_webhook_events for select to masarifi_api using (true);
create policy clerk_webhook_events_worker_select
on private.clerk_webhook_events for select to masarifi_worker using (true);
create policy clerk_webhook_events_worker_update
on private.clerk_webhook_events for update to masarifi_worker using (true) with check (true);
create policy clerk_webhook_events_migration_all
on private.clerk_webhook_events for all to masarifi_migration using (true) with check (true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
