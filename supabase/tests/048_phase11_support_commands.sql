begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_api;
set local role masarifi_migration;
insert into public.profiles(id,status) values('phase11-support-owner','active'),('phase11-support-other','active');
reset role;
select set_config('request.jwt.claims','{"sub":"phase11-support-owner","role":"authenticated"}',true);
set local role masarifi_api;
create temporary table phase11_ticket as select private.create_support_ticket('phase11-support-owner',(select id from public.support_categories where key='other'),'Need help','Safe message') id;
grant select on phase11_ticket to masarifi_migration,masarifi_api;
select is((select count(*) from public.support_tickets),1::bigint,'owner sees created ticket');
select is((select count(*) from public.support_messages),1::bigint,'initial message is atomic');
select lives_ok($$select private.add_support_message('phase11-support-owner',(select id from phase11_ticket),'Follow up',1)$$,'owner can add a guarded message');
reset role;
select set_config('request.jwt.claims','{"sub":"phase11-support-other","role":"authenticated"}',true);
set local role masarifi_api;
select is((select count(*) from public.support_tickets),0::bigint,'non-owner cannot enumerate ticket');
select throws_ok($$select private.add_support_message('phase11-support-other',(select id from phase11_ticket),'Attack',2)$$,'P0002','SUPPORT_TICKET_UNAVAILABLE','non-owner command fails closed');
reset role;
set local role masarifi_migration;
insert into private.support_attachments(id,ticket_id,storage_ref,filename_safe,content_type,size_bytes,sha256)
values('10000000-0000-4000-8000-000000000048',(select id from phase11_ticket),'support/'||(select id from phase11_ticket)||'/10000000-0000-4000-8000-000000000048','evidence.pdf','application/pdf',1024,repeat('a',64));
reset role;
select set_config('request.jwt.claims','{"sub":"phase11-support-other","role":"authenticated"}',true);
set local role masarifi_api;
select throws_ok(
  $$select private.execute_engagement_command('phase11-support-other','finalizeSupportAttachment',(select id from phase11_ticket),'{"uploadId":"10000000-0000-4000-8000-000000000048","filename":"evidence.pdf","contentType":"application/pdf","sizeBytes":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","expectedVersion":1}'::jsonb,null,'phase11-finalize-bola',10000,168)$$,
  'P0002','ENGAGEMENT_RESOURCE_UNAVAILABLE','non-owner cannot finalize an attachment with exact metadata'
);
reset role;
set local role masarifi_migration;
select is((select scan_status from private.support_attachments where id='10000000-0000-4000-8000-000000000048'),'uploading','non-owner finalize leaves quarantine state unchanged');
reset role;
select * from finish();
rollback;
