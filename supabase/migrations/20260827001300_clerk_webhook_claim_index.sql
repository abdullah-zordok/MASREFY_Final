grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create index clerk_webhook_events_claim_idx
  on private.clerk_webhook_events(created_at, id)
  where status in ('received', 'failed');

reset role;
revoke masarifi_migration from current_user granted by current_user;
