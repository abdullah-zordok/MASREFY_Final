grant masarifi_migration to current_user with set true, inherit false;

set local role masarifi_migration;

create index profiles_active_last_seen_idx
  on public.profiles(last_seen_at,id) where status='active';

create index transactions_owner_created_active_idx
  on public.transactions(user_id,created_at desc) where deleted_at is null;

alter table public.notification_events
  drop constraint notification_events_type_check,
  add constraint notification_events_type_check
    check(type ~ '^[a-z][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$' and char_length(type)<=96);

alter table public.notification_preferences
  drop constraint notification_preferences_event_type_check,
  add constraint notification_preferences_event_type_check
    check(event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$' and char_length(event_type)<=96);

create function private.list_reminder_candidates(p_limit integer)
returns table(kind text,user_id text,locale text,time_zone text,baseline_at text,evaluated_at text,inactive_days integer)
language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 1000 then raise exception using errcode='22023',message='REMINDER_LIMIT_INVALID'; end if;
  return query
    with evaluated as (select clock_timestamp() now_at), candidates as (
      select 'app'::text kind,p.id user_id,p.locale,p.timezone time_zone,p.last_seen_at::text baseline_at,e.now_at::text evaluated_at,
        floor(extract(epoch from (e.now_at-p.last_seen_at))/86400)::integer inactive_days,
        case when p.last_seen_at<=e.now_at-interval '7 days' then 'reminder.app_inactive.7d' else 'reminder.app_inactive.3d' end event_type
      from public.profiles p cross join evaluated e
      where p.status='active' and p.last_seen_at<=e.now_at-interval '3 days'
      union all
      select 'financial'::text,p.id,p.locale,p.timezone,financial.baseline_at::text,e.now_at::text,
        floor(extract(epoch from (e.now_at-financial.baseline_at))/86400)::integer,
        'reminder.financial_inactive.7d' event_type
      from public.profiles p cross join evaluated e
      join public.tracking_preferences tracking on tracking.user_id=p.id and tracking.enabled
      cross join lateral (select coalesce(max(t.created_at),p.created_at) baseline_at
        from public.transactions t where t.user_id=p.id and t.deleted_at is null) financial
      where p.status='active' and p.last_seen_at>=e.now_at-interval '3 days'
        and financial.baseline_at<=e.now_at-interval '7 days'
    )
    select c.kind,c.user_id,c.locale,c.time_zone,c.baseline_at,c.evaluated_at,c.inactive_days
    from candidates c
    where exists(select 1 from public.push_tokens token where token.user_id=c.user_id and token.revoked_at is null)
      and exists(select 1 from public.notification_preferences pref
        where pref.user_id=c.user_id and pref.channel='push' and pref.event_type=c.event_type and pref.enabled)
      and not exists(select 1 from public.notification_events event
        where event.user_id=c.user_id and event.type=c.event_type and event.data->>'cycleBaseline'=c.baseline_at)
    order by c.baseline_at,c.user_id limit p_limit;
end $$;
alter function private.list_reminder_candidates(integer) owner to masarifi_migration;
revoke all on function private.list_reminder_candidates(integer) from public;
grant execute on function private.list_reminder_candidates(integer) to masarifi_worker;

create function private.reminder_delivery_eligible(p_event_id uuid,p_user_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(bool_and(
    p.status='active' and baseline.value is not null
    and exists(select 1 from public.notification_preferences pref
      where pref.user_id=e.user_id and pref.channel='push' and pref.event_type=e.type and pref.enabled)
    and case when e.type like 'reminder.app_inactive.%' then p.last_seen_at<=baseline.value
      when e.type='reminder.financial_inactive.7d' then exists(select 1 from public.tracking_preferences tracking
        where tracking.user_id=e.user_id and tracking.enabled)
        and not exists(select 1 from public.transactions t
          where t.user_id=e.user_id and t.deleted_at is null and t.created_at>baseline.value)
      else false end
  ),false)
  from public.notification_events e join public.profiles p on p.id=e.user_id
  cross join lateral (select case when e.data->>'cycleBaseline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    then (e.data->>'cycleBaseline')::timestamptz end value) baseline
  where e.id=p_event_id and e.user_id=p_user_id and e.type like 'reminder.%'
$$;
alter function private.reminder_delivery_eligible(uuid,text) owner to masarifi_migration;
revoke all on function private.reminder_delivery_eligible(uuid,text) from public;
grant execute on function private.reminder_delivery_eligible(uuid,text) to masarifi_worker;

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
