grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

revoke all on function private.guard_published_parser_version() from public;
revoke all on function private.guard_tracking_history_change() from public;

reset role;
revoke masarifi_migration from current_user granted by current_user;
