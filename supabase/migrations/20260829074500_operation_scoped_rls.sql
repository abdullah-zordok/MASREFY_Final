grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

drop policy support_requests_api_all on private.support_access_requests;
create policy support_requests_api_select on private.support_access_requests for select to masarifi_api
using (
  user_id = public.current_clerk_user_id()
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.read', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
);
create policy support_requests_api_insert on private.support_access_requests for insert to masarifi_api
with check (
  requested_by = public.current_clerk_user_id()
  and private.admin_has_permission(public.current_clerk_user_id(), 'support.access.request', clock_timestamp())
);
create policy support_requests_api_update on private.support_access_requests for update to masarifi_api
using (
  user_id = public.current_clerk_user_id()
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
)
with check (
  user_id = public.current_clerk_user_id()
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
);

drop policy support_grants_api_all on private.support_access_grants;
create policy support_grants_api_select on private.support_access_grants for select to masarifi_api
using (
  private.admin_has_permission(public.current_clerk_user_id(), 'support.access.read', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
);
create policy support_grants_api_insert on private.support_access_grants for insert to masarifi_api
with check (private.admin_has_permission(public.current_clerk_user_id(), 'support.access.approve', clock_timestamp()));
create policy support_grants_api_update on private.support_access_grants for update to masarifi_api
using (
  private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
)
with check (
  private.admin_has_permission(public.current_clerk_user_id(), 'support.access.revoke', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'support.access.use', clock_timestamp())
);

drop policy retention_policies_api_all on private.retention_policies;
create policy retention_policies_api_select on private.retention_policies for select to masarifi_api
using (
  private.admin_has_permission(public.current_clerk_user_id(), 'retention.read', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp())
);
create policy retention_policies_api_update on private.retention_policies for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()));

drop policy retention_holds_api_all on private.retention_holds;
create policy retention_holds_api_select on private.retention_holds for select to masarifi_api
using (
  private.admin_has_permission(public.current_clerk_user_id(), 'retention.read', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp())
);
create policy retention_holds_api_insert on private.retention_holds for insert to masarifi_api
with check (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()));
create policy retention_holds_api_update on private.retention_holds for update to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()))
with check (private.admin_has_permission(public.current_clerk_user_id(), 'retention.write', clock_timestamp()));

reset role;
revoke masarifi_migration from current_user granted by current_user;
