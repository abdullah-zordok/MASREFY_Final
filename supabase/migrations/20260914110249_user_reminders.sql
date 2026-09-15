grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create index profiles_active_last_seen_idx
  on public.profiles(last_seen_at,id) where status='active';

create index transactions_owner_created_active_idx
  on public.transactions(user_id,created_at desc) where deleted_at is null;

insert into public.notification_templates(
  key,locale,channel,template_version,subject,body,status,published_at,created_by,system_seed
)
values
  ('reminder.app_inactive.3d','en','in_app',1,'How is your spending going? 👀','It has been a little while since you checked in. Open Masarifi for a quick look.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.3d','en','push',1,'How is your spending going? 👀','It has been a little while since you checked in. Open Masarifi for a quick look.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.3d','ar','in_app',1,'وين وصلت مصاريفك؟ 👀','صار لك فترة ما راجعت صرفك، افتح مصاريفي وخذ نظرة سريعة.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.3d','ar','push',1,'وين وصلت مصاريفك؟ 👀','صار لك فترة ما راجعت صرفك، افتح مصاريفي وخذ نظرة سريعة.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.7d','en','in_app',1,'Check in on your spending','Open Masarifi and review your latest financial updates.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.7d','en','push',1,'Check in on your spending','Open Masarifi and review your latest financial updates.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.7d','ar','in_app',1,'شيّك على صرفك','افتح مصاريفي وراجع آخر تحديثاتك المالية.','published',transaction_timestamp(),null,true),
  ('reminder.app_inactive.7d','ar','push',1,'شيّك على صرفك','افتح مصاريفي وراجع آخر تحديثاتك المالية.','published',transaction_timestamp(),null,true),
  ('reminder.financial_inactive.7d','en','in_app',1,'It has been a while since your last transaction','Open Masarifi for a quick check that expense tracking is set up the way you want.','published',transaction_timestamp(),null,true),
  ('reminder.financial_inactive.7d','en','push',1,'It has been a while since your last transaction','Open Masarifi for a quick check that expense tracking is set up the way you want.','published',transaction_timestamp(),null,true),
  ('reminder.financial_inactive.7d','ar','in_app',1,'صار لك فترة بدون عمليات','افتح مصاريفي وتأكد إن تتبع مصاريفك شغال تمام.','published',transaction_timestamp(),null,true),
  ('reminder.financial_inactive.7d','ar','push',1,'صار لك فترة بدون عمليات','افتح مصاريفي وتأكد إن تتبع مصاريفك شغال تمام.','published',transaction_timestamp(),null,true)
on conflict(key,locale,channel,template_version) do nothing;

insert into public.notification_preferences(user_id,channel,event_type)
select p.id,t.channel,t.key
from public.profiles p
cross join (
  select distinct key,channel
  from public.notification_templates
  where system_seed and key like 'reminder.%'
) t
on conflict(user_id,channel,event_type) do nothing;

select private.register_job(
  'notification.reminders.evaluate',11::smallint,'notification.reminders.evaluate',
  '{"kind":"interval","everySeconds":86400,"timezone":"UTC"}'::jsonb,
  true,300,3::smallint,'{}'::jsonb,true,false
);

reset role;
