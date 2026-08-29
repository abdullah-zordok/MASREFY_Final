grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

revoke select on public.security_events from authenticated;
grant select (id,event_type,severity,metadata,occurred_at) on public.security_events to authenticated;

reset role;
revoke masarifi_migration from current_user granted by current_user;
