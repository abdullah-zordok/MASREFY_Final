begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration
  to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;

select has_table('public', 'user_preferences', 'preferences table exists');
select has_pk('public', 'user_preferences', 'preferences primary key exists');
select has_column('public', 'user_preferences', 'user_id', 'preferences owner exists');
select has_column('public', 'user_preferences', 'default_currency', 'currency exists');
select has_column('public', 'user_preferences', 'language', 'language exists');
select has_column('public', 'user_preferences', 'theme', 'theme exists');
select has_column('public', 'user_preferences', 'calendar', 'calendar exists');
select has_column('public', 'user_preferences', 'week_start', 'week start exists');
select has_column('public', 'user_preferences', 'privacy_settings', 'privacy settings exist');
select has_column('public', 'user_preferences', 'updated_at', 'updated time exists');
select has_column('public', 'user_preferences', 'version', 'version exists');
select col_is_pk('public', 'user_preferences', 'user_id', 'owner is the primary key');
select col_is_fk('public', 'user_preferences', 'user_id', 'preferences reference profiles');
select table_owner_is('public', 'user_preferences', 'masarifi_migration', 'migration owns preferences');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.user_preferences'::regclass),
  'preferences RLS is enabled and forced'
);
select has_trigger('public', 'user_preferences', 'user_preferences_set_updated_at_and_version', 'version trigger exists');
select ok(has_table_privilege('authenticated', 'public.user_preferences', 'SELECT'), 'authenticated may read own preferences');
select ok(not has_table_privilege('authenticated', 'public.user_preferences', 'UPDATE'), 'authenticated cannot update preferences directly');
select ok(has_table_privilege('masarifi_api', 'public.user_preferences', 'SELECT'), 'API may read preferences');
select ok(
  has_column_privilege('masarifi_api', 'public.user_preferences', 'language', 'UPDATE')
    and not has_column_privilege('masarifi_api', 'public.user_preferences', 'version', 'UPDATE'),
  'API may update only customer preference fields'
);
select ok(has_table_privilege('masarifi_worker', 'public.user_preferences', 'INSERT'), 'worker may create defaults');
select ok(not has_table_privilege('anon', 'public.user_preferences', 'SELECT'), 'anonymous cannot read preferences');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'user_preferences' and cmd = 'SELECT' and roles && array['authenticated']::name[]), 'authenticated owner policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'user_preferences' and cmd = 'UPDATE' and roles && array['masarifi_api']::name[]), 'API update policy exists');

insert into public.profiles (id, status) values
  ('pref_owner_1', 'active'),
  ('pref_owner_2', 'active'),
  ('pref_inactive', 'suspended'),
  ('bad_privacy_key', 'active');
insert into public.user_preferences (user_id) values
  ('pref_owner_1'), ('pref_owner_2'), ('pref_inactive');

select is((select default_currency::text from public.user_preferences where user_id = 'pref_owner_1'), 'SAR', 'currency defaults to SAR');
select is((select language from public.user_preferences where user_id = 'pref_owner_1'), 'ar', 'language defaults to ar');
select is((select theme from public.user_preferences where user_id = 'pref_owner_1'), 'system', 'theme defaults to system');
select is((select calendar from public.user_preferences where user_id = 'pref_owner_1'), 'gregorian', 'calendar defaults to gregorian');
select is((select week_start::integer from public.user_preferences where user_id = 'pref_owner_1'), 6, 'week starts on Saturday');
select is((select privacy_settings from public.user_preferences where user_id = 'pref_owner_1'), '{}'::jsonb, 'privacy defaults empty');
select is((select version from public.user_preferences where user_id = 'pref_owner_1'), 1::bigint, 'version defaults to one');

select set_config('request.jwt.claims', '{"sub":"pref_owner_1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.user_preferences), 1, 'owner reads one preference row');
select is((select count(*)::integer from public.user_preferences where user_id = 'pref_owner_2'), 0, 'owner cannot read another preference row');
reset role;

select set_config('request.jwt.claims', '{"sub":"pref_inactive","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.user_preferences), 0, 'inactive owner reads no preferences');
reset role;

select set_config('request.jwt.claims', '{"sub":"pref_owner_1","role":"authenticated"}', true);
set local role masarifi_api;
select extensions.lives_ok(
  $$update public.user_preferences set default_currency='EGP', language='en', theme='dark', calendar='hijri', week_start=0, privacy_settings='{"hideBalances":true}' where user_id='pref_owner_1'$$,
  'API updates the active owner'
);
select is((select count(*)::integer from public.user_preferences where user_id = 'pref_owner_2' and language = 'en'), 0, 'API cannot update another owner');
reset role;

select is((select version from public.user_preferences where user_id = 'pref_owner_1'), 2::bigint, 'update advances version once');
select extensions.throws_ok(
  $$insert into public.user_preferences (user_id, privacy_settings) values ('bad_privacy_key', '{"unknown":true}')$$,
  '23514', null, 'unknown privacy keys are rejected'
);
select extensions.throws_ok(
  $$update public.user_preferences set privacy_settings='{"hideBalances":"yes"}' where user_id='pref_owner_1'$$,
  '23514', null, 'privacy values must be booleans'
);
select extensions.throws_ok(
  $$update public.user_preferences set default_currency='sar' where user_id='pref_owner_1'$$,
  '23514', null, 'currency must be uppercase ASCII'
);
select extensions.throws_ok(
  $$update public.user_preferences set week_start=7 where user_id='pref_owner_1'$$,
  '23514', null, 'week start is bounded'
);

select has_table('public', 'onboarding_progress', 'onboarding table exists');
select has_pk('public', 'onboarding_progress', 'onboarding primary key exists');
select has_column('public', 'onboarding_progress', 'user_id', 'onboarding owner exists');
select has_column('public', 'onboarding_progress', 'step', 'onboarding step exists');
select has_column('public', 'onboarding_progress', 'completed_steps', 'completed steps exist');
select has_column('public', 'onboarding_progress', 'completed_at', 'completion time exists');
select has_column('public', 'onboarding_progress', 'updated_at', 'onboarding update time exists');
select has_column('public', 'onboarding_progress', 'version', 'onboarding version exists');
select col_is_fk('public', 'onboarding_progress', 'user_id', 'onboarding references profiles');
select table_owner_is('public', 'onboarding_progress', 'masarifi_migration', 'migration owns onboarding');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.onboarding_progress'::regclass),
  'onboarding RLS is enabled and forced'
);
select has_trigger('public', 'onboarding_progress', 'onboarding_progress_set_updated_at_and_version', 'onboarding version trigger exists');
select ok(has_table_privilege('authenticated', 'public.onboarding_progress', 'SELECT'), 'authenticated may read own onboarding');
select ok(not has_table_privilege('authenticated', 'public.onboarding_progress', 'UPDATE'), 'authenticated cannot update onboarding directly');
select ok(has_table_privilege('masarifi_api', 'public.onboarding_progress', 'SELECT'), 'API may read onboarding');
select ok(
  has_column_privilege('masarifi_api', 'public.onboarding_progress', 'step', 'UPDATE')
    and not has_column_privilege('masarifi_api', 'public.onboarding_progress', 'version', 'UPDATE'),
  'API may update only onboarding projection fields'
);
select ok(has_table_privilege('masarifi_worker', 'public.onboarding_progress', 'INSERT'), 'worker may create onboarding defaults');
select ok(not has_table_privilege('anon', 'public.onboarding_progress', 'SELECT'), 'anonymous cannot read onboarding');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'onboarding_progress' and cmd = 'SELECT' and roles && array['authenticated']::name[]), 'authenticated onboarding owner policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'onboarding_progress' and cmd = 'UPDATE' and roles && array['masarifi_api']::name[]), 'API onboarding update policy exists');

insert into public.profiles (id, status) values
  ('onboard_owner_1', 'active'),
  ('onboard_owner_2', 'active'),
  ('onboard_inactive', 'suspended');
insert into public.onboarding_progress (user_id) values
  ('onboard_owner_1'), ('onboard_owner_2'), ('onboard_inactive');

select is((select step from public.onboarding_progress where user_id = 'onboard_owner_1'), 'welcome', 'onboarding defaults to welcome');
select is((select completed_steps from public.onboarding_progress where user_id = 'onboard_owner_1'), array[]::text[], 'completed steps default empty');
select ok((select completed_at is null from public.onboarding_progress where user_id = 'onboard_owner_1'), 'completion time defaults null');
select is((select version from public.onboarding_progress where user_id = 'onboard_owner_1'), 1::bigint, 'onboarding version defaults one');

select set_config('request.jwt.claims', '{"sub":"onboard_owner_1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.onboarding_progress), 1, 'owner reads one onboarding row');
select is((select count(*)::integer from public.onboarding_progress where user_id = 'onboard_owner_2'), 0, 'owner cannot read another onboarding row');
reset role;

select set_config('request.jwt.claims', '{"sub":"onboard_inactive","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.onboarding_progress), 0, 'inactive owner reads no onboarding');
reset role;

select set_config('request.jwt.claims', '{"sub":"onboard_owner_1","role":"authenticated"}', true);
set local role masarifi_api;
select extensions.lives_ok(
  $$update public.onboarding_progress set step='permission_education', completed_steps=array['welcome','tracking_intro'] where user_id='onboard_owner_1'$$,
  'API updates valid owner onboarding'
);
reset role;
select is((select version from public.onboarding_progress where user_id = 'onboard_owner_1'), 2::bigint, 'onboarding update advances version');

select extensions.throws_ok($$update public.onboarding_progress set step='unknown' where user_id='onboard_owner_1'$$, '23514', null, 'unknown step rejected');
select extensions.throws_ok($$update public.onboarding_progress set completed_steps=array_fill('welcome'::text, array[13]) where user_id='onboard_owner_1'$$, '23514', null, 'completed steps are bounded');
select extensions.throws_ok($$update public.onboarding_progress set completed_steps=array['welcome',null] where user_id='onboard_owner_1'$$, '23514', null, 'null completed step rejected');
select extensions.throws_ok($$update public.onboarding_progress set completed_steps=array[''] where user_id='onboard_owner_1'$$, '23514', null, 'blank completed step rejected');
select extensions.throws_ok($$update public.onboarding_progress set completed_steps=array['unknown'] where user_id='onboard_owner_1'$$, '23514', null, 'unknown completed step rejected');
select extensions.throws_ok($$update public.onboarding_progress set step='complete', completed_steps=array['complete'], completed_at=null where user_id='onboard_owner_1'$$, '23514', null, 'complete step requires completion time');
select extensions.throws_ok($$update public.onboarding_progress set step='demo', completed_steps=array['welcome'], completed_at=now() where user_id='onboard_owner_1'$$, '23514', null, 'incomplete step forbids completion time');
select extensions.throws_ok($$update public.onboarding_progress set step='complete', completed_steps=array['welcome'], completed_at=now() where user_id='onboard_owner_1'$$, '23514', null, 'completed state contains complete marker');
select extensions.throws_ok($$update public.onboarding_progress set step='tracking_intro', completed_steps=array['tracking_intro'] where user_id='onboard_owner_1'$$, '23514', null, 'current incomplete step is not already completed');

select * from finish();
rollback;
