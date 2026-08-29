begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
grant authenticated, masarifi_api, masarifi_worker, masarifi_migration to current_user with inherit true, set true;
grant usage on schema extensions to masarifi_api;
set local role masarifi_migration;
insert into public.profiles(id,status) values('support_admin','active'),('support_customer','active'),('support_approver','active');
insert into public.admin_profiles(user_id,status) values('support_admin','active'),('support_approver','active');
insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
select subject,id,'support_approver','Controlled support test assignment' from public.roles cross join (values('support_admin'),('support_approver')) s(subject) where key='super-admin';
insert into private.support_access_requests(user_id,requested_by,assignee,support_ticket_id,purpose,scope,status,approved_by,decided_at,expires_at)
values('support_customer','support_admin','support_admin','TICKET-1','Investigate masked account status','[{"resource":"account-status","actions":["read-status"]}]','approved','support_approver',clock_timestamp(),clock_timestamp()+interval '30 minutes');
insert into private.support_access_grants(request_id,admin_id,scope,starts_at,ends_at)
select id,'support_admin',scope,created_at,expires_at from private.support_access_requests;

select ok(private.is_valid_support_scope('[{"resource":"account-status","actions":["read-status"]}]'),'registered scope valid');
select ok(not private.is_valid_support_scope('[{"resource":"payments","actions":["write"]}]'),'financial write scope invalid');
select throws_ok($$update private.support_access_grants set scope='[{"resource":"profile-contact","actions":["read-masked"]}]'$$,'23514','SUPPORT_GRANT_INVARIANT_INVALID','approval cannot widen requested scope');
select throws_ok($$insert into private.support_access_requests(user_id,requested_by,assignee,support_ticket_id,purpose,scope,status,approved_by,decided_at,expires_at)
 values('support_customer','support_admin','support_admin','TICKET-2','Self approval must be rejected','[{"resource":"account-status","actions":["read-status"]}]','approved','support_admin',clock_timestamp(),clock_timestamp()+interval '10 minutes')$$,'23514',null,'self approval rejected');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"support_admin","sid":"sess"}',true);
set local role masarifi_api;
select lives_ok($$select private.assert_support_grant('support_customer','account-status','read-status')$$,'exact support grant allows');
select is((private.read_support_workspace((select id from private.support_access_requests where support_ticket_id='TICKET-1'))->'sections'->0->>'status'),'active','workspace returns only approved account status');
select throws_ok($$select private.assert_support_grant('support_customer','account-status','read-masked')$$,'42501','SUPPORT_GRANT_DENIED','wrong action denies');
select throws_ok($$select private.assert_support_grant('support_customer','subscription-summary','read-status')$$,'42501','SUPPORT_GRANT_DENIED','wrong resource denies');
select ok(not has_table_privilege('authenticated','private.support_access_grants','SELECT'),'customer cannot inspect grants');
select ok(not has_function_privilege('authenticated','private.read_support_workspace(uuid)','EXECUTE'),'customer cannot execute support workspace projection');
select * from finish();
rollback;
