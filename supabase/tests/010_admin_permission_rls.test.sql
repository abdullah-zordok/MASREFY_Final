begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

grant authenticated, masarifi_api, masarifi_worker, masarifi_migration to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;
set local role masarifi_migration;
insert into public.profiles(id,status) values ('rbac_admin','active'),('rbac_backup','active'),('rbac_customer','active'),('rbac_invitee','active'),('rbac_inactive','suspended');
insert into public.admin_profiles(user_id,status) values ('rbac_admin','active'),('rbac_backup','active'),('rbac_inactive','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'rbac_admin',id,'rbac_admin','Initial controlled bootstrap assignment' from public.roles where key='super-admin';
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select 'rbac_backup',id,'rbac_admin','Backup super administrator assignment' from public.roles where key='super-admin';
insert into public.admin_role_assignments(user_id,role_id,assigned_by,starts_at,reason)
select 'rbac_inactive',id,'rbac_admin',clock_timestamp()-interval '1 minute','Inactive profile permission test' from public.roles where key='super-admin';
insert into public.admin_invitations(email,role_id,token_hash,invited_by,expires_at)
select 'invitee@example.test',id,'h1:'||repeat('a',64),'rbac_admin',clock_timestamp()+interval '1 hour' from public.roles where key='support-agent';

select ok(private.admin_has_permission('rbac_admin','audit.read',clock_timestamp()),'active exact permission allows');
select ok(not private.admin_has_permission('rbac_admin','audit.logs.read',clock_timestamp()),'client alias is not a second authority');
select ok(not private.admin_has_permission('rbac_admin','audit.*',clock_timestamp()),'wildcard denies');
select ok(not private.admin_has_permission('rbac_customer','audit.read',clock_timestamp()),'customer without Admin profile denies');
select ok(not private.admin_has_permission('rbac_inactive','audit.read',clock_timestamp()),'inactive customer profile denies');
select throws_ok($$update public.roles set enabled=false where key='super-admin'$$,'23514','LAST_SUPER_ADMIN_REQUIRED','super role cannot be disabled');

update public.admin_role_assignments set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where user_id='rbac_admin';
select ok(not private.admin_has_permission('rbac_admin','audit.read',clock_timestamp()),'expired assignment denies immediately');
update public.admin_role_assignments set ends_at=null,revoked_at=clock_timestamp() where user_id='rbac_admin';
select ok(not private.admin_has_permission('rbac_admin','audit.read',clock_timestamp()),'revoked assignment denies immediately');
update public.admin_role_assignments set revoked_at=null,starts_at=clock_timestamp()+interval '1 hour' where user_id='rbac_admin';
select ok(not private.admin_has_permission('rbac_admin','audit.read',clock_timestamp()),'future assignment denies');
update public.admin_role_assignments set starts_at=clock_timestamp()-interval '1 hour' where user_id='rbac_admin';

select set_config('request.jwt.claims','{"role":"authenticated","sub":"rbac_admin","sid":"sess"}',true);
set local role masarifi_api;
select lives_ok($$select private.assert_admin_permission('audit.read')$$,'exact assertion allows');
select throws_ok($$select private.assert_admin_permission('audit.logs.read')$$,'42501','ADMIN_PERMISSION_DENIED','related alias assertion denies');
select is((select count(*)::integer from public.profiles where id='rbac_backup'),1,'governance reader sees another Admin profile');
select is((select count(*)::integer from public.profiles where id='rbac_customer'),0,'governance reader cannot enumerate a customer profile');
select throws_ok($$update public.roles set name='Changed system role' where key='super-admin'$$,'42501','SYSTEM_ROLE_PROTECTED','runtime cannot mutate a system role');
select throws_ok($$update public.permissions set action='write' where key='audit.read'$$,'42501','PERMISSION_DEFINITION_PROTECTED','runtime cannot mutate a permission definition');
select throws_ok($$delete from public.role_permissions where (role_id,permission_id)=(select rp.role_id,rp.permission_id from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.key='super-admin' limit 1)$$,'42501','SYSTEM_ROLE_PROTECTED','runtime cannot mutate system role permissions');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"rbac_invitee","sid":"sess"}',true);
set local role masarifi_api;
select lives_ok($$select private.accept_admin_invitation('h1:'||repeat('a',64),'invitee@example.test','request-accept-1')$$,'verified invitee can accept without prior Admin privilege');
select lives_ok($$select private.accept_admin_invitation('h1:'||repeat('a',64),'invitee@example.test','request-accept-2')$$,'identical acceptance is naturally idempotent');

select * from finish();
rollback;
