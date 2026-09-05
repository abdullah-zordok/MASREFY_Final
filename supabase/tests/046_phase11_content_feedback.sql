begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','feedback_items','feedback exists');
select has_table('public','abuse_reports','abuse reports exist');
select has_table('public','content_items','content exists');
select has_table('public','content_translations','content translations exist');
select columns_are('public','feedback_items',array[
  'id','user_id','type','subject','body','status','assigned_admin_id','created_at','updated_at','version'
], 'feedback exposes the exact storage contract');
select columns_are('public','content_items',array[
  'id','key','type','status','published_at','created_by','system_seed','created_at','updated_at','version'
], 'content exposes the exact lifecycle contract');
select has_index('public','abuse_reports','abuse_reports_active_uq','active duplicate reports are race-safe');
select has_index('public','content_items','content_items_public_idx','published content lookup is indexed');

select * from finish();
rollback;
