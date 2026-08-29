grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create or replace function private.protect_security_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'permissions' then
    if tg_op = 'DELETE'
      or new.key is distinct from old.key
      or new.resource is distinct from old.resource
      or new.action is distinct from old.action
    then
      raise exception using errcode = '42501', message = 'PERMISSION_DEFINITION_PROTECTED';
    end if;
  elsif tg_table_name = 'roles' and old.system_role and current_user <> 'masarifi_migration' then
    raise exception using errcode = '42501', message = 'SYSTEM_ROLE_PROTECTED';
  end if;
  return coalesce(new, old);
end;
$$;

reset role;
revoke masarifi_migration from current_user granted by current_user;
