begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_migration;
grant execute on all functions in schema extensions to masarifi_migration;
set local role masarifi_migration;

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'audit')
      and p.prosecdef
      and has_function_privilege('public', p.oid, 'EXECUTE')
  ),
  0,
  'SECURITY DEFINER functions are not executable by PUBLIC'
);

select * from finish();
rollback;
