begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','support_categories','support categories exist');
select has_table('public','support_tickets','support tickets exist');
select has_table('public','support_messages','support messages exist');
select has_table('private','support_internal_notes','private support notes exist');
select has_table('private','support_attachments','private support attachments exist');
select columns_are('public','support_tickets',array[
  'id','user_id','category_id','subject','status','priority','assigned_admin_id',
  'last_message_at','closed_at','created_at','updated_at','version'
], 'tickets expose the exact storage contract');
select columns_are('private','support_internal_notes',array[
  'id','ticket_id','admin_id','body','created_at'
], 'internal notes remain a minimal private row');
select has_index('public','support_tickets','support_tickets_owner_cursor_idx','owner cursor is indexed');
select has_index('private','support_attachments','support_attachments_scan_idx','scanner claims are indexed');

select * from finish();
rollback;
