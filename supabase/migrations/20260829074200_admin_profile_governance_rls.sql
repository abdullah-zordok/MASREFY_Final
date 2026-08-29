grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create policy profiles_api_admin_governance_select
on public.profiles
for select
to masarifi_api
using (
  exists (select 1 from public.admin_profiles where user_id = profiles.id)
  and private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp())
);

create policy roles_api_admin_team_select on public.roles for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy permissions_api_admin_team_select on public.permissions for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy role_permissions_api_admin_team_select on public.role_permissions for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.read', clock_timestamp()));
create policy admin_profiles_api_command_select on public.admin_profiles for select to masarifi_api
using (
  private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.disable', clock_timestamp())
  or private.admin_has_permission(public.current_clerk_user_id(), 'admin-team.sessions.revoke', clock_timestamp())
);
create policy roles_api_assignment_select on public.roles for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.assignments.write', clock_timestamp()));
create policy permissions_api_role_write_select on public.permissions for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));
create policy admin_role_assignments_api_role_write_select on public.admin_role_assignments for select to masarifi_api
using (private.admin_has_permission(public.current_clerk_user_id(), 'access.roles.write', clock_timestamp()));

reset role;
revoke masarifi_migration from current_user granted by current_user;
