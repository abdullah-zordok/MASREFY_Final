begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration
  to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;

select has_table('public', 'profiles', 'profiles table exists');
select has_pk('public', 'profiles', 'profiles primary key exists');
select has_column('public', 'profiles', 'id', 'profile id exists');
select has_column('public', 'profiles', 'primary_email', 'profile email exists');
select has_column('public', 'profiles', 'phone_e164', 'profile phone exists');
select has_column('public', 'profiles', 'display_name', 'profile display name exists');
select has_column('public', 'profiles', 'locale', 'profile locale exists');
select has_column('public', 'profiles', 'timezone', 'profile timezone exists');
select has_column('public', 'profiles', 'status', 'profile status exists');
select has_column('public', 'profiles', 'last_seen_at', 'profile last seen exists');
select has_column('public', 'profiles', 'deleted_at', 'profile deletion time exists');
select has_column('public', 'profiles', 'created_at', 'profile creation time exists');
select has_column('public', 'profiles', 'updated_at', 'profile update time exists');
select has_column('public', 'profiles', 'version', 'profile version exists');
select has_index('public', 'profiles', 'profiles_primary_email_uq', 'email index exists');
select has_index('public', 'profiles', 'profiles_phone_e164_uq', 'phone index exists');
select has_index('public', 'profiles', 'profiles_status_created_idx', 'status index exists');
select has_function('public', 'current_clerk_user_id', array[]::text[], 'subject function exists');
select has_function('private', 'assert_active_profile', array['text'], 'active-profile function exists');
select function_owner_is('public', 'current_clerk_user_id', array[]::text[], 'masarifi_migration', 'subject function owner');
select function_owner_is('private', 'assert_active_profile', array['text'], 'masarifi_migration', 'assert function owner');
select is((select provolatile::text from pg_proc where oid = 'public.current_clerk_user_id()'::regprocedure), 's', 'subject function is stable');
select ok(not (select prosecdef from pg_proc where oid = 'public.current_clerk_user_id()'::regprocedure), 'subject function is invoker security');
select is((select proconfig[1] from pg_proc where oid = 'public.current_clerk_user_id()'::regprocedure), 'search_path=""', 'subject function search path is empty');
select ok((select prosecdef from pg_proc where oid = 'private.assert_active_profile(text)'::regprocedure), 'assert function is security definer');
select is((select proconfig[1] from pg_proc where oid = 'private.assert_active_profile(text)'::regprocedure), 'search_path=""', 'assert function search path is empty');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS is enabled and forced');
select table_owner_is('public', 'profiles', 'masarifi_migration', 'migration role owns profiles');
select ok(exists(select 1 from pg_roles where rolname = 'masarifi_api' and not rolsuper and not rolbypassrls), 'API cannot bypass RLS');
select ok(exists(select 1 from pg_roles where rolname = 'masarifi_worker' and not rolsuper and not rolbypassrls), 'worker cannot bypass RLS');
select ok(has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT'), 'authenticated may select safe profile columns');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'primary_email', 'SELECT') and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated cannot read contact fields or update profiles directly');
select ok(has_table_privilege('masarifi_api', 'public.profiles', 'SELECT'), 'API may select profiles through RLS');
select ok(has_column_privilege('masarifi_api', 'public.profiles', 'display_name', 'UPDATE') and not has_column_privilege('masarifi_api', 'public.profiles', 'status', 'UPDATE'), 'API may update only customer/server-observation columns');
select ok(has_table_privilege('masarifi_worker', 'public.profiles', 'SELECT'), 'worker may read profiles through worker policy');
select ok(has_table_privilege('masarifi_worker', 'public.profiles', 'INSERT'), 'worker may create synchronized profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous cannot select profiles');
select ok(not has_function_privilege('public', 'private.assert_active_profile(text)', 'EXECUTE'), 'PUBLIC cannot assert profiles');
select ok(not has_function_privilege('anon', 'private.assert_active_profile(text)', 'EXECUTE'), 'anonymous cannot assert profiles');
select ok(not has_function_privilege('authenticated', 'private.assert_active_profile(text)', 'EXECUTE'), 'Data API callers cannot assert profiles');
select ok(has_function_privilege('masarifi_api', 'private.assert_active_profile(text)', 'EXECUTE'), 'API may assert the active caller');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles' and roles && array['anon']::name[]), 0, 'anonymous has no profile policy');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT' and roles && array['authenticated']::name[]), 'authenticated owner-select policy exists');

insert into public.profiles (id, status) values
  ('clerk_owner_1', 'active'),
  ('clerk_owner_2', 'active'),
  ('clerk_inactive', 'suspended');

select set_config('request.jwt.claims', '{"sub":"clerk_owner_1","role":"authenticated"}', true);
set local role authenticated;
select is(public.current_clerk_user_id(), 'clerk_owner_1', 'subject comes from verified claims');
select is((select count(*)::integer from public.profiles), 1, 'owner sees one active profile');
select is((select count(*)::integer from public.profiles where id = 'clerk_owner_2'), 0, 'owner cannot see second owner');
reset role;

select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select is(public.current_clerk_user_id(), null, 'missing subject resolves to null');
select is((select count(*)::integer from public.profiles), 0, 'missing subject sees no profile');
reset role;

select set_config('request.jwt.claims', '{"sub":"clerk_inactive","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.profiles), 0, 'inactive profile is hidden');
reset role;

select set_config('request.jwt.claims', '{"sub":"clerk_owner_1","role":"authenticated"}', true);
set local role masarifi_api;
select extensions.lives_ok($$select private.assert_active_profile('clerk_owner_1')$$, 'API accepts matching active profile');
select extensions.throws_ok($$select private.assert_active_profile('clerk_owner_2')$$, '28000', 'AUTH_TOKEN_INVALID', 'API rejects a mismatched subject');
reset role;

select set_config('request.jwt.claims', '{"sub":"clerk_inactive","role":"authenticated"}', true);
set local role masarifi_api;
select extensions.throws_ok($$select private.assert_active_profile('clerk_inactive')$$, '42501', 'PROFILE_INACTIVE', 'API rejects an inactive profile');
reset role;

select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and roles && array['masarifi_migration']::name[]), 'forced-RLS owner policy exists');

select * from finish();
rollback;
