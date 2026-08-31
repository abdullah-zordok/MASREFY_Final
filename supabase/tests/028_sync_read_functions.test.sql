begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('private','get_sync_bounds',array['text','text'],'owner sync bounds function exists');
select has_function('private','get_sync_delta',array['text','text','bigint','integer'],'owner delta function exists');
select function_privs_are('private','get_sync_bounds',array['text','text'],'masarifi_api',array['EXECUTE'],'API can execute bounds only');
select function_privs_are('private','get_sync_delta',array['text','text','bigint','integer'],'masarifi_api',array['EXECUTE'],'API can execute delta only');
select function_privs_are('private','get_sync_bounds',array['text','text'],'public',array[]::text[],'public cannot execute bounds');
select function_privs_are('private','get_sync_delta',array['text','text','bigint','integer'],'public',array[]::text[],'public cannot execute delta');
select is((select proconfig[1] from pg_proc where oid='private.get_sync_bounds(text,text)'::regprocedure),'search_path=""','bounds fixes search path');
select is((select proconfig[1] from pg_proc where oid='private.get_sync_delta(text,text,bigint,integer)'::regprocedure),'search_path=""','delta fixes search path');

select * from finish();
rollback;
