begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration
  to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;

select has_table('public', 'user_devices', 'devices table exists');
select has_pk('public', 'user_devices', 'devices primary key exists');
select col_is_fk('public', 'user_devices', 'user_id', 'devices reference profiles');
select has_column('public', 'user_devices', 'device_fingerprint', 'fingerprint exists');
select has_column('public', 'user_devices', 'clerk_session_id', 'session link exists');
select has_column('public', 'user_devices', 'platform', 'platform exists');
select has_column('public', 'user_devices', 'app_version', 'app version exists');
select has_column('public', 'user_devices', 'device_name', 'device name exists');
select has_column('public', 'user_devices', 'trusted_at', 'trust time exists');
select has_column('public', 'user_devices', 'last_seen_at', 'last seen exists');
select has_column('public', 'user_devices', 'revoked_at', 'revocation time exists');
select has_column('public', 'user_devices', 'version', 'device version exists');
select has_index('public', 'user_devices', 'user_devices_owner_fingerprint_uq', 'owner fingerprint unique index exists');
select has_index('public', 'user_devices', 'user_devices_id_owner_uq', 'same-owner key exists');
select has_index('public', 'user_devices', 'user_devices_lifecycle_idx', 'device lifecycle index exists');
select has_index('public', 'user_devices', 'user_devices_cursor_idx', 'device cursor index exists');
select has_index('public', 'user_devices', 'user_devices_session_idx', 'session retry index exists');
select has_trigger('public', 'user_devices', 'user_devices_set_updated_at_and_version', 'device version trigger exists');

select has_table('public', 'push_tokens', 'push token table exists');
select has_pk('public', 'push_tokens', 'push token primary key exists');
select col_is_fk('public', 'push_tokens', 'user_id', 'push token references profile');
select has_fk('public', 'push_tokens', 'push token has same-owner device foreign key');
select has_column('public', 'push_tokens', 'token_hash', 'token hash exists');
select has_column('public', 'push_tokens', 'token_ciphertext', 'token ciphertext exists');
select has_column('public', 'push_tokens', 'provider', 'push provider exists');
select has_index('public', 'push_tokens', 'push_tokens_provider_hash_uq', 'provider hash unique index exists');
select has_index('public', 'push_tokens', 'push_tokens_owner_revoked_idx', 'push owner revocation index exists');
select has_index('public', 'push_tokens', 'push_tokens_device_owner_idx', 'push device owner index exists');
select has_trigger('public', 'push_tokens', 'push_tokens_set_updated_at_and_version', 'push version trigger exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.user_devices'::regclass), 'device RLS is forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.push_tokens'::regclass), 'push RLS is forced');
select ok(has_column_privilege('authenticated', 'public.user_devices', 'id', 'SELECT'), 'authenticated reads safe device ID');
select ok(not has_column_privilege('authenticated', 'public.user_devices', 'device_fingerprint', 'SELECT') and not has_column_privilege('authenticated', 'public.user_devices', 'clerk_session_id', 'SELECT'), 'authenticated cannot read fingerprint or session');
select ok(not has_table_privilege('authenticated', 'public.push_tokens', 'SELECT'), 'authenticated cannot read push tokens');
select ok(not has_column_privilege('masarifi_api', 'public.push_tokens', 'token_ciphertext', 'SELECT'), 'API cannot select push ciphertext');
select ok(has_column_privilege('masarifi_worker', 'public.push_tokens', 'token_ciphertext', 'SELECT'), 'worker may decrypt push ciphertext');
select ok(not has_table_privilege('anon', 'public.user_devices', 'SELECT') and not has_table_privilege('anon', 'public.push_tokens', 'SELECT'), 'anonymous has no device or push access');
select ok(has_column_privilege('masarifi_api', 'public.user_devices', 'revoked_at', 'UPDATE') and not has_column_privilege('masarifi_api', 'public.user_devices', 'version', 'UPDATE'), 'API updates lifecycle but not version');
select ok(has_table_privilege('masarifi_api', 'public.push_tokens', 'INSERT'), 'API may register push tokens');
select ok(has_column_privilege('masarifi_api', 'public.push_tokens', 'device_id', 'UPDATE'), 'API may relink a same-owner push token');
select ok(has_table_privilege('masarifi_worker', 'public.user_devices', 'SELECT'), 'worker may inspect device session links');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='user_devices' and roles && array['authenticated']::name[]), 'authenticated device policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='push_tokens' and roles && array['masarifi_api']::name[]), 'API push policy exists');

insert into public.profiles (id, status) values ('device_owner_1','active'), ('device_owner_2','active');
insert into public.user_devices (id, user_id, device_fingerprint, clerk_session_id, platform, app_version)
values
  ('0198f79d-98f3-7bb4-a820-f43bb4d0e17e', 'device_owner_1', 'h1:' || repeat('a',64), 'session_a', 'android', '1.0.0'),
  ('0198f79d-98f3-7bb4-a820-f43bb4d0e17f', 'device_owner_2', 'h1:' || repeat('b',64), 'session_b', 'ios', '1.0.0');

select extensions.throws_ok($$insert into public.user_devices(user_id,device_fingerprint,platform,app_version) values('device_owner_1','raw','android','1')$$, '23514', null, 'raw fingerprint rejected');
select extensions.throws_ok($$insert into public.user_devices(user_id,device_fingerprint,platform,app_version) values('device_owner_1','h1:'||repeat('c',64),'desktop','1')$$, '23514', null, 'invalid platform rejected');
select extensions.throws_ok($$insert into public.push_tokens(user_id,device_id,token_hash,token_ciphertext,provider) values('device_owner_1','0198f79d-98f3-7bb4-a820-f43bb4d0e17e','raw','v1.active.a.b.c','expo')$$, '23514', null, 'raw push hash rejected');
select extensions.throws_ok($$insert into public.push_tokens(user_id,device_id,token_hash,token_ciphertext,provider) values('device_owner_1','0198f79d-98f3-7bb4-a820-f43bb4d0e17e','h1:'||repeat('c',64),'raw','expo')$$, '23514', null, 'invalid ciphertext envelope rejected');
select extensions.throws_ok($$insert into public.push_tokens(user_id,device_id,token_hash,token_ciphertext,provider) values('device_owner_2','0198f79d-98f3-7bb4-a820-f43bb4d0e17e','h1:'||repeat('c',64),'v1.active.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AA','expo')$$, '23503', null, 'cross-owner device link rejected');

select set_config('request.jwt.claims','{"sub":"device_owner_1","role":"authenticated"}',true);
set local role authenticated;
select is((select count(id)::integer from public.user_devices),1,'owner sees one device');
select is((select count(id)::integer from public.user_devices where id='0198f79d-98f3-7bb4-a820-f43bb4d0e17f'),0,'owner cannot see another device');
reset role;

select * from finish();
rollback;
