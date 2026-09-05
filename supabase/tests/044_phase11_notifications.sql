begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','notification_events','notification events exist');
select has_table('public','notification_preferences','notification preferences exist');
select has_table('public','notification_templates','notification templates exist');
select has_table('public','notification_campaigns','notification campaigns exist');
select has_table('private','notification_deliveries','private deliveries exist');
select columns_are('public','notification_events',array[
  'id','source_event_id','user_id','type','title','body_safe','data','read_at','acted_at','expires_at',
  'created_at','updated_at','version'
], 'notification events expose the exact storage contract');
select columns_are('public','notification_preferences',array[
  'id','user_id','channel','event_type','enabled','quiet_hours','created_at','updated_at','version'
], 'preferences expose the exact storage contract');
select columns_are('public','notification_templates',array[
  'id','key','locale','channel','template_version','subject','body','status','published_at',
  'created_by','system_seed','created_at','updated_at','version'
], 'templates expose the reviewed seed provenance contract');
select has_index('public','notification_events','notification_events_owner_cursor_idx','owner cursor is indexed');
select has_index('public','notification_preferences','notification_preferences_owner_channel_uq','preference matrix is unique');
select has_index('private','notification_deliveries','notification_deliveries_due_idx','due claims are indexed');

select * from finish();
rollback;
