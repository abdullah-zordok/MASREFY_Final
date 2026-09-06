begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api;
grant execute on all functions in schema extensions to masarifi_api;
set local role masarifi_migration;

insert into public.profiles(id,status) values ('phase13-incident-admin','active');
insert into public.admin_profiles(user_id,status) values ('phase13-incident-admin','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'phase13-incident-admin',id,'phase13-incident-admin','Phase 13 incident lifecycle test' from public.roles where key='super-admin';

select throws_ok($$insert into private.system_incidents(title,severity,status,started_at,created_by_admin_id)
  values('bad','urgent','open',clock_timestamp(),'admin')$$,'23514',null,'incident severity and title are bounded');
select throws_ok($$insert into private.system_incidents(title,severity,status,started_at,resolved_at,created_by_admin_id)
  values('Valid incident','warning','resolved',clock_timestamp(),clock_timestamp()-interval '1 minute','admin')$$,'23514',null,'incident resolution cannot precede start');
insert into private.system_incidents(id,title,severity,status,started_at,created_by_admin_id)
values('13000000-0000-4000-8000-000000000057','Lifecycle incident','warning','open',clock_timestamp(),'phase13-incident-admin');
insert into private.system_incidents(id,title,severity,status,started_at,created_by_admin_id)
values('13000000-0000-4000-8000-000000000058','Independent incident','info','open',clock_timestamp(),'phase13-incident-admin');
select lives_ok($$insert into private.maintenance_windows(starts_at,ends_at,scope,public_message,created_by_admin_id,updated_by_admin_id)
  values('2026-09-07T10:00:00Z','2026-09-07T11:00:00Z',array['api'],
    '{"ar":"صيانة مجدولة","en":"Scheduled maintenance"}','admin','admin')$$,'valid maintenance persists');
select throws_ok($$insert into private.maintenance_windows(starts_at,ends_at,scope,public_message,created_by_admin_id,updated_by_admin_id)
  values('2026-09-07T10:30:00Z','2026-09-07T11:30:00Z',array['api'],
    '{"ar":"صيانة أخرى","en":"Other maintenance"}','admin','admin')$$,'23P01',null,'overlapping active scope is rejected');
select throws_ok($$insert into private.maintenance_windows(starts_at,ends_at,scope,public_message,created_by_admin_id,updated_by_admin_id)
  values('2026-09-07T10:00:00Z','2026-09-09T11:00:00Z',array['billing'],
    '{"ar":"غير صالح","en":"Invalid"}','admin','admin')$$,'23514',null,'paid scopes and windows over 24 hours are rejected');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"phase13-incident-admin","sid":"sess"}',true);
set local role masarifi_api;
select lives_ok($$select private.execute_operations_command('updateIncident','13000000-0000-4000-8000-000000000057','{"status":"investigating","expectedVersion":1,"reason":"Acknowledge the active incident safely."}','phase13-incident-admin','incident-ack','sha256:'||repeat('5',64))$$,'open incident is acknowledged');
select throws_ok($$select private.execute_operations_command('updateIncident','13000000-0000-4000-8000-000000000058','{"status":"investigating","expectedVersion":1,"reason":"Attempt cross-resource idempotency key reuse."}','phase13-incident-admin','incident-other','sha256:'||repeat('5',64))$$,'22023','OPERATIONS_IDEMPOTENCY_REUSED','an idempotency key cannot replay against another resource');
select lives_ok($$select private.execute_operations_command('updateIncident','13000000-0000-4000-8000-000000000057','{"status":"resolved","expectedVersion":2,"reason":"Resolve after service recovery evidence."}','phase13-incident-admin','incident-resolve','sha256:'||repeat('6',64))$$,'investigating incident resolves directly');
select throws_ok($$select private.execute_operations_command('updateIncident','13000000-0000-4000-8000-000000000057','{"status":"open","expectedVersion":3,"reason":"Reject reopening a resolved incident."}','phase13-incident-admin','incident-reopen','sha256:'||repeat('7',64))$$,'22023','OPERATIONS_INCIDENT_TRANSITION_INVALID','resolved incident is terminal');
reset role;
set local role masarifi_migration;
select ok((select resolved_at is not null from private.system_incidents where id='13000000-0000-4000-8000-000000000057'),'resolution timestamp is recorded');
select is((select count(*) from private.outbox_events where event_type='operations.incident-changed' and aggregate_id='13000000-0000-4000-8000-000000000057'),2::bigint,'successful incident transitions emit safe events exactly once');

select * from finish();
rollback;
