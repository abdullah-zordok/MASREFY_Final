begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select table_privs_are('public','notification_events','masarifi_api',array['SELECT'],'notification table is read-only to API');
select table_privs_are('public','support_messages','masarifi_api',array['SELECT'],'support messages are read-only to API');
select table_privs_are('private','support_internal_notes','masarifi_api',array['SELECT'],'notes require RLS plus exact permission');
select table_privs_are('public','content_items','masarifi_api',array['SELECT'],'content table is read-only to API');
select has_function('private','mark_notification',array['text','uuid','bigint','boolean','boolean','text'],'notification transition is guarded');
select has_function('private','create_support_ticket',array['text','uuid','text','text'],'ticket creation is guarded');
select has_function('private','create_feedback',array['text','text','text','text'],'feedback creation is guarded');
select has_function('private','create_abuse_report',array['text','text','text','text'],'abuse creation is guarded');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notification_events'::regclass),'notification RLS is forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.support_internal_notes'::regclass),'note RLS is forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.content_items'::regclass),'content RLS is forced');
select is(
  (select count(*) from pg_policies
   where schemaname in ('public','private')
     and policyname in (
       'notification_events_migration_all','notification_preferences_migration_all',
       'notification_templates_migration_all','notification_campaigns_migration_all',
       'notification_deliveries_migration_all','support_categories_migration_all',
       'support_tickets_migration_all','support_messages_migration_all',
       'support_notes_migration_all','support_attachments_migration_all',
       'feedback_items_migration_all','abuse_reports_migration_all',
       'content_items_migration_all','content_translations_migration_all'
     ) and roles=array['masarifi_migration']::name[]),
  14::bigint,
  'all forced-RLS tables keep the established migration-owner policy'
);
select * from finish();
rollback;
