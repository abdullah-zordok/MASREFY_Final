begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api;
grant execute on all functions in schema extensions to masarifi_api;
set local role masarifi_migration;

insert into public.profiles(id,status) values ('phase13-flag-admin','active');
insert into public.admin_profiles(user_id,status) values ('phase13-flag-admin','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'phase13-flag-admin',id,'phase13-flag-admin','Phase 13 feature lifecycle test' from public.roles where key='super-admin';

select is((select value from private.system_settings where setting_key='operations.ai.allowance'),'5'::jsonb,'Free-only AI allowance is exactly five');
select ok(not exists(select 1 from private.system_settings where setting_key ~* 'secret|token|password|credential|url|sql|command'),'setting keys reject secret and arbitrary execution concepts');
select throws_ok($$insert into private.feature_flags(flag_key,description,created_by_admin_id,updated_by_admin_id)
  values('billing.checkout','This must never activate','admin','admin')$$,'23514',null,'billing and security invariant flags are rejected');
select lives_ok($$insert into private.feature_flags(flag_key,description,status,default_enabled,created_by_admin_id,updated_by_admin_id)
  values('mobile.safe-demo','A safe deterministic feature','active',false,'admin','admin')$$,'safe feature flag persists');
select lives_ok($$insert into private.feature_flags(flag_key,description,status,default_enabled,created_by_admin_id,updated_by_admin_id)
  values('mobile.lifecycle-demo','A bounded lifecycle feature','draft',false,'phase13-flag-admin','phase13-flag-admin')$$,'draft lifecycle flag persists');
insert into private.feature_flags(flag_key,description,status,default_enabled,created_by_admin_id,updated_by_admin_id)
select 'meta.bound-'||lpad(value::text,3,'0'),'Bounded public projection','active',false,'phase13-flag-admin','phase13-flag-admin'
from generate_series(1,50) value;
select lives_ok($$insert into private.feature_flag_rules(feature_flag_id,priority,audience)
  select id,10,'{"platform":"ios","locale":"en"}' from private.feature_flags where flag_key='mobile.safe-demo'$$,'bounded audience rule persists');
select throws_ok($$insert into private.feature_flag_rules(feature_flag_id,priority,audience)
  select id,20,'{"role":"admin"}' from private.feature_flags where flag_key='mobile.safe-demo'$$,'23514',null,'forged role audience is rejected');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"phase13-flag-admin","sid":"sess"}',true);
set local role masarifi_api;
select extensions.is(private.evaluate_feature_flag('mobile.safe-demo','{"platform":"ios","locale":"en"}')->>'source','rule','first matching rule wins');
select extensions.is(private.evaluate_feature_flag('mobile.safe-demo','{"role":"admin"}')->>'source','invalid_context','forged context fails closed');
select extensions.is(private.evaluate_feature_flag('missing.flag','{}')->>'enabled','false','missing feature fails closed');
select extensions.is((select count(*) from jsonb_object_keys(private.read_safe_platform_meta('{}')->'featureFlags')),50::bigint,'safe metadata exposes at most fifty active flags');
select lives_ok($$select private.execute_operations_command('updateFeatureFlag','mobile.lifecycle-demo','{"status":"active","expectedVersion":1,"reason":"Activate after bounded operator review."}','phase13-flag-admin','flag-activate','sha256:'||repeat('1',64))$$,'draft flag activates');
select throws_ok($$select private.execute_operations_command('updateFeatureFlag','mobile.lifecycle-demo','{"status":"draft","expectedVersion":2,"reason":"Reject unsafe lifecycle reversal."}','phase13-flag-admin','flag-reverse','sha256:'||repeat('2',64))$$,'22023','OPERATIONS_FLAG_TRANSITION_INVALID','active flag cannot return to draft');
select lives_ok($$select private.execute_operations_command('updateFeatureFlag','mobile.lifecycle-demo','{"status":"retired","expectedVersion":2,"reason":"Retire after bounded operator review."}','phase13-flag-admin','flag-retire','sha256:'||repeat('3',64))$$,'active flag retires');
select throws_ok($$select private.execute_operations_command('updateFeatureFlag','mobile.lifecycle-demo','{"description":"A changed retired feature","expectedVersion":3,"reason":"Reject retired flag mutation safely."}','phase13-flag-admin','flag-retired-edit','sha256:'||repeat('4',64))$$,'22023','OPERATIONS_FLAG_TRANSITION_INVALID','retired flag is immutable');
reset role;
set local role masarifi_migration;
select is((select count(*) from private.outbox_events where event_type='operations.feature-flag-changed' and payload->>'flagKey'='mobile.lifecycle-demo'),2::bigint,'successful flag transitions emit safe events exactly once');
select ok(not exists(select 1 from private.outbox_events where event_type like 'operations.%' and payload::text ~* 'reason|audience|description|value'),'operation events exclude sensitive mutation details');

select * from finish();
rollback;
