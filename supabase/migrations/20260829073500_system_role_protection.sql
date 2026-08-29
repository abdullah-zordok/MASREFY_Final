grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create or replace function private.protect_security_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'permissions'
    and (tg_op = 'DELETE' or new.key is distinct from old.key or new.resource is distinct from old.resource or new.action is distinct from old.action)
  then
    raise exception using errcode = '42501', message = 'PERMISSION_DEFINITION_PROTECTED';
  end if;
  if tg_table_name = 'roles' and old.system_role and current_user <> 'masarifi_migration' then
    raise exception using errcode = '42501', message = 'SYSTEM_ROLE_PROTECTED';
  end if;
  return coalesce(new, old);
end;
$$;

create function private.protect_system_role_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_role_id uuid;
begin
  target_role_id := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  if current_user <> 'masarifi_migration'
    and exists (select 1 from public.roles where id = target_role_id and system_role)
  then
    raise exception using errcode = '42501', message = 'SYSTEM_ROLE_PROTECTED';
  end if;
  return coalesce(new, old);
end;
$$;

alter function private.protect_system_role_permissions() owner to masarifi_migration;
revoke all on function private.protect_system_role_permissions() from public, anon, authenticated, service_role, masarifi_api, masarifi_worker;
create trigger role_permissions_system_protected before insert or update or delete on public.role_permissions
for each row execute function private.protect_system_role_permissions();

reset role;
revoke masarifi_migration from current_user granted by current_user;
