grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

alter table public.notification_events enable row level security;
alter table public.notification_events force row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_templates force row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaigns force row level security;
alter table private.notification_deliveries enable row level security;
alter table private.notification_deliveries force row level security;
alter table public.support_categories enable row level security;
alter table public.support_categories force row level security;
alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.support_messages enable row level security;
alter table public.support_messages force row level security;
alter table private.support_internal_notes enable row level security;
alter table private.support_internal_notes force row level security;
alter table private.support_attachments enable row level security;
alter table private.support_attachments force row level security;
alter table public.feedback_items enable row level security;
alter table public.feedback_items force row level security;
alter table public.abuse_reports enable row level security;
alter table public.abuse_reports force row level security;
alter table public.content_items enable row level security;
alter table public.content_items force row level security;
alter table public.content_translations enable row level security;
alter table public.content_translations force row level security;

create policy notification_events_migration_all on public.notification_events for all to masarifi_migration using (true) with check (true);
create policy notification_preferences_migration_all on public.notification_preferences for all to masarifi_migration using (true) with check (true);
create policy notification_templates_migration_all on public.notification_templates for all to masarifi_migration using (true) with check (true);
create policy notification_campaigns_migration_all on public.notification_campaigns for all to masarifi_migration using (true) with check (true);
create policy notification_deliveries_migration_all on private.notification_deliveries for all to masarifi_migration using (true) with check (true);
create policy support_categories_migration_all on public.support_categories for all to masarifi_migration using (true) with check (true);
create policy support_tickets_migration_all on public.support_tickets for all to masarifi_migration using (true) with check (true);
create policy support_messages_migration_all on public.support_messages for all to masarifi_migration using (true) with check (true);
create policy support_notes_migration_all on private.support_internal_notes for all to masarifi_migration using (true) with check (true);
create policy support_attachments_migration_all on private.support_attachments for all to masarifi_migration using (true) with check (true);
create policy feedback_items_migration_all on public.feedback_items for all to masarifi_migration using (true) with check (true);
create policy abuse_reports_migration_all on public.abuse_reports for all to masarifi_migration using (true) with check (true);
create policy content_items_migration_all on public.content_items for all to masarifi_migration using (true) with check (true);
create policy content_translations_migration_all on public.content_translations for all to masarifi_migration using (true) with check (true);

revoke all on public.notification_events,public.notification_preferences,
  public.notification_templates,public.notification_campaigns,
  public.support_categories,public.support_tickets,public.support_messages,
  public.feedback_items,public.abuse_reports,public.content_items,
  public.content_translations from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
revoke all on private.notification_deliveries,private.support_internal_notes,
  private.support_attachments from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

grant select on public.notification_events,public.notification_preferences,
  public.notification_templates,public.notification_campaigns,
  public.support_categories,public.support_tickets,public.support_messages,
  public.feedback_items,public.abuse_reports,public.content_items,
  public.content_translations to masarifi_api;
grant select on private.notification_deliveries,private.support_internal_notes,
  private.support_attachments to masarifi_api;
grant select,insert,update on public.notification_events,public.notification_campaigns to masarifi_worker;
grant select on public.notification_preferences,public.notification_templates to masarifi_worker;
grant select,insert,update on private.notification_deliveries to masarifi_worker;
grant select,insert,update,delete on private.support_attachments to masarifi_worker;

create policy notification_events_api_select on public.notification_events for select to masarifi_api
using (user_id=(select public.current_clerk_user_id()) or private.admin_has_permission((select public.current_clerk_user_id()),'notifications.read',clock_timestamp()));
create policy notification_events_worker_all on public.notification_events for all to masarifi_worker using (true) with check (true);
create policy notification_preferences_api_select on public.notification_preferences for select to masarifi_api
using (user_id=(select public.current_clerk_user_id()));
create policy notification_preferences_worker_select on public.notification_preferences for select to masarifi_worker using (true);
create policy notification_templates_api_select on public.notification_templates for select to masarifi_api
using (private.admin_has_permission((select public.current_clerk_user_id()),'communications.templates.manage',clock_timestamp()));
create policy notification_templates_worker_select on public.notification_templates for select to masarifi_worker using (true);
create policy notification_campaigns_api_select on public.notification_campaigns for select to masarifi_api
using (private.admin_has_permission((select public.current_clerk_user_id()),'notifications.campaigns.read',clock_timestamp())
  or private.admin_has_permission((select public.current_clerk_user_id()),'notifications.campaigns.detail.read',clock_timestamp())
  or private.admin_has_permission((select public.current_clerk_user_id()),'notifications.campaigns.manage',clock_timestamp()));
create policy notification_campaigns_worker_all on public.notification_campaigns for all to masarifi_worker using (true) with check (true);
create policy notification_deliveries_api_select on private.notification_deliveries for select to masarifi_api
using (private.admin_has_permission((select public.current_clerk_user_id()),'notifications.delivery.read',clock_timestamp()));
create policy notification_deliveries_worker_all on private.notification_deliveries for all to masarifi_worker using (true) with check (true);

create policy support_categories_api_select on public.support_categories for select to masarifi_api
using (active or private.admin_has_permission((select public.current_clerk_user_id()),'support.categories.read',clock_timestamp()) or private.admin_has_permission((select public.current_clerk_user_id()),'support.categories.manage',clock_timestamp()));
create policy support_tickets_api_select on public.support_tickets for select to masarifi_api
using (user_id=(select public.current_clerk_user_id())
  or private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.read',clock_timestamp())
  or private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.detail.read',clock_timestamp()));
create policy support_messages_api_select on public.support_messages for select to masarifi_api
using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.user_id=(select public.current_clerk_user_id()) or private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.read',clock_timestamp()) or private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.detail.read',clock_timestamp()))));
create policy support_notes_api_select on private.support_internal_notes for select to masarifi_api
using (private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.notes',clock_timestamp()));
create policy support_attachments_api_select on private.support_attachments for select to masarifi_api
using (exists(select 1 from public.support_tickets t where t.id=ticket_id and
  ((t.user_id=(select public.current_clerk_user_id()) and scan_status='clean') or
   private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.read',clock_timestamp()) or
   private.admin_has_permission((select public.current_clerk_user_id()),'support.tickets.detail.read',clock_timestamp()))));
create policy support_attachments_worker_all on private.support_attachments for all to masarifi_worker using (true) with check (true);

create policy feedback_items_api_select on public.feedback_items for select to masarifi_api
using (user_id=(select public.current_clerk_user_id()) or private.admin_has_permission((select public.current_clerk_user_id()),'feedback.read',clock_timestamp()));
create policy abuse_reports_api_select on public.abuse_reports for select to masarifi_api
using (reporter_id=(select public.current_clerk_user_id()) or private.admin_has_permission((select public.current_clerk_user_id()),'feedback.abuse.manage',clock_timestamp()));
create policy content_items_api_select on public.content_items for select to masarifi_api
using (status='published' or private.admin_has_permission((select public.current_clerk_user_id()),'content.manage',clock_timestamp()));
create policy content_translations_api_select on public.content_translations for select to masarifi_api
using (exists(select 1 from public.content_items c where c.id=content_id and (c.status='published' or private.admin_has_permission((select public.current_clerk_user_id()),'content.manage',clock_timestamp()))));

create function private.assert_engagement_admin(p_permission text,p_factor_age_seconds integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_factor_age_seconds is null or p_factor_age_seconds not between 0 and 600 then
    raise exception using errcode='42501',message='RECENT_MFA_REQUIRED';
  end if;
  perform private.assert_admin_permission(p_permission);
end $$;
alter function private.assert_engagement_admin(text,integer) owner to masarifi_migration;
revoke all on function private.assert_engagement_admin(text,integer) from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

create function private.create_notification_event(
  p_user_id text,p_type text,p_title text,p_body_safe text,p_data jsonb,
  p_expires_at timestamptz,p_channels text[] default array['in_app']::text[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_event_id uuid; channel_name text;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_channels is null or cardinality(p_channels) not between 1 and 3
    or array_position(p_channels,null) is not null
    or exists(select 1 from unnest(p_channels) c where c not in ('in_app','push','email')) then
    raise exception using errcode='42501',message='NOTIFICATION_CREATE_FORBIDDEN';
  end if;
  insert into public.notification_events(user_id,type,title,body_safe,data,expires_at)
  values(p_user_id,p_type,p_title,p_body_safe,p_data,p_expires_at) returning id into created_event_id;
  foreach channel_name in array p_channels loop
    insert into private.notification_deliveries(event_id,user_id,channel,provider,rendered_title,rendered_body,rendered_data,next_attempt_at)
    values(created_event_id,p_user_id,channel_name,case channel_name when 'push' then 'deterministic_push' when 'email' then 'smtp' else 'database' end,p_title,p_body_safe,p_data,clock_timestamp())
    on conflict(event_id,user_id,channel) where event_id is not null do nothing;
  end loop;
  return created_event_id;
end $$;
alter function private.create_notification_event(text,text,text,text,jsonb,timestamptz,text[]) owner to masarifi_migration;
revoke all on function private.create_notification_event(text,text,text,text,jsonb,timestamptz,text[]) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.create_notification_event(text,text,text,text,jsonb,timestamptz,text[]) to masarifi_worker;

create function private.mark_notification(p_user_id text,p_id uuid,p_expected_version bigint,p_read boolean,p_action boolean,p_action_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value public.notification_events;
begin
  perform private.assert_active_profile(p_user_id);
  if not exists(select 1 from public.notification_events where id=p_id and user_id=p_user_id and (expires_at is null or expires_at>clock_timestamp())) then
    raise exception using errcode='P0002',message='NOTIFICATION_UNAVAILABLE';
  end if;
  if not exists(select 1 from public.notification_events where id=p_id and user_id=p_user_id and version=p_expected_version) then
    raise exception using errcode='40001',message='NOTIFICATION_STALE';
  end if;
  if p_action and not exists(
    select 1 from jsonb_array_elements(coalesce((select data->'actions' from public.notification_events where id=p_id and user_id=p_user_id),'[]')) action
    where action->>'key'=p_action_key and (action->>'expiresAt' is null or (action->>'expiresAt')::timestamptz>clock_timestamp())
  ) then raise exception using errcode='P0002',message='NOTIFICATION_ACTION_UNAVAILABLE'; end if;
  update public.notification_events n set
    read_at=case when p_action or p_read then coalesce(n.read_at,clock_timestamp()) else null end,
    acted_at=case when p_action then coalesce(n.acted_at,clock_timestamp()) else n.acted_at end
  where n.id=p_id and n.user_id=p_user_id and n.version=p_expected_version
    and (n.expires_at is null or n.expires_at>clock_timestamp()) returning * into row_value;
  if row_value.id is null then raise exception using errcode='P0002',message='NOTIFICATION_UNAVAILABLE'; end if;
  perform private.enqueue_outbox_event(case when p_action then 'notification.acted' else 'notification.read' end,
    'notification',row_value.id,jsonb_build_object('schemaVersion',1,'notificationId',row_value.id));
  return jsonb_build_object('id',row_value.id,'version',row_value.version,'readAt',row_value.read_at,'actedAt',row_value.acted_at);
end $$;
alter function private.mark_notification(text,uuid,bigint,boolean,boolean,text) owner to masarifi_migration;
revoke all on function private.mark_notification(text,uuid,bigint,boolean,boolean,text) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.mark_notification(text,uuid,bigint,boolean,boolean,text) to masarifi_api;

create function private.create_support_ticket(p_user_id text,p_category_id uuid,p_subject text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare ticket_id uuid;
begin
  perform private.assert_active_profile(p_user_id);
  if not exists(select 1 from public.support_categories where id=p_category_id and active) then
    raise exception using errcode='22023',message='SUPPORT_CATEGORY_UNAVAILABLE';
  end if;
  insert into public.support_tickets(user_id,category_id,subject,status)
  values(p_user_id,p_category_id,p_subject,'waiting_support') returning id into ticket_id;
  insert into public.support_messages(ticket_id,sender_id,sender_type,body)
  values(ticket_id,p_user_id,'customer',p_body);
  perform private.enqueue_outbox_event('support.ticket_opened','support_ticket',ticket_id,
    jsonb_build_object('schemaVersion',1,'ticketId',ticket_id));
  return ticket_id;
end $$;
alter function private.create_support_ticket(text,uuid,text,text) owner to masarifi_migration;
revoke all on function private.create_support_ticket(text,uuid,text,text) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.create_support_ticket(text,uuid,text,text) to masarifi_api;

create function private.add_support_message(p_user_id text,p_ticket_id uuid,p_body text,p_expected_version bigint,p_attachment_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets; new_message_id uuid; bound_count integer;
begin
  perform private.assert_active_profile(p_user_id);
  select * into ticket from public.support_tickets where id=p_ticket_id and user_id=p_user_id for update;
  if ticket.id is null or ticket.version<>p_expected_version or ticket.status not in ('open','waiting_customer','waiting_support') then
    raise exception using errcode='P0002',message='SUPPORT_TICKET_UNAVAILABLE';
  end if;
  insert into public.support_messages(ticket_id,sender_id,sender_type,body)
  values(ticket.id,p_user_id,'customer',p_body) returning id into new_message_id;
  update private.support_attachments a set message_id=new_message_id
    where a.ticket_id=ticket.id and a.id=any(p_attachment_ids) and a.message_id is null and a.scan_status in ('pending','clean');
  get diagnostics bound_count=row_count;
  if bound_count<>cardinality(p_attachment_ids) then
    raise exception using errcode='22023',message='SUPPORT_ATTACHMENT_UNAVAILABLE';
  end if;
  update public.support_tickets set status='waiting_support',last_message_at=clock_timestamp() where id=ticket.id;
  perform private.enqueue_outbox_event('support.message_added','support_ticket',ticket.id,
    jsonb_build_object('schemaVersion',1,'ticketId',ticket.id,'messageId',new_message_id));
  perform private.enqueue_outbox_event('support.status_changed','support_ticket',ticket.id,
    jsonb_build_object('schemaVersion',1,'ticketId',ticket.id,'status','waiting_support'));
  return jsonb_build_object('id',new_message_id,'ticketId',ticket.id);
end $$;
alter function private.add_support_message(text,uuid,text,bigint,uuid[]) owner to masarifi_migration;
revoke all on function private.add_support_message(text,uuid,text,bigint,uuid[]) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.add_support_message(text,uuid,text,bigint,uuid[]) to masarifi_api;

create function private.create_feedback(p_user_id text,p_type text,p_subject text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare item_id uuid;
begin
  perform private.assert_active_profile(p_user_id);
  insert into public.feedback_items(user_id,type,subject,body) values(p_user_id,p_type,p_subject,p_body) returning id into item_id;
  perform private.enqueue_outbox_event('feedback.received','feedback',item_id,
    jsonb_build_object('schemaVersion',1,'feedbackId',item_id,'type',p_type));
  return item_id;
end $$;
alter function private.create_feedback(text,text,text,text) owner to masarifi_migration;
revoke all on function private.create_feedback(text,text,text,text) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.create_feedback(text,text,text,text) to masarifi_api;

create function private.create_abuse_report(p_user_id text,p_resource_type text,p_resource_id text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
  perform private.assert_active_profile(p_user_id);
  insert into public.abuse_reports(reporter_id,resource_type,resource_id,reason)
  values(p_user_id,p_resource_type,p_resource_id,p_reason)
  on conflict(reporter_id,resource_type,resource_id) where status in ('open','reviewing')
  do update set reporter_id=excluded.reporter_id returning id into report_id;
  return report_id;
end $$;
alter function private.create_abuse_report(text,text,text,text) owner to masarifi_migration;
revoke all on function private.create_abuse_report(text,text,text,text) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.create_abuse_report(text,text,text,text) to masarifi_api;

create function private.claim_notification_deliveries(p_worker_id text,p_limit integer,p_lease_seconds integer)
returns setof private.notification_deliveries language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_worker_id !~ '^[A-Za-z0-9._:-]{1,128}$' or p_limit not between 1 and 100 or p_lease_seconds not between 10 and 300 then
    raise exception using errcode='42501',message='NOTIFICATION_CLAIM_FORBIDDEN';
  end if;
  return query with due as (
    select d.id from private.notification_deliveries d
    where d.status in ('queued','failed') and coalesce(d.next_attempt_at,'-infinity')<=clock_timestamp()
      and (d.lease_until is null or d.lease_until<clock_timestamp())
    order by d.next_attempt_at nulls first,d.id limit p_limit for update skip locked
  ) update private.notification_deliveries d set status='sending',claim_token=extensions.gen_random_uuid(),
    claimed_by=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=d.attempt_count+1
    from due where d.id=due.id returning d.*;
end $$;
alter function private.claim_notification_deliveries(text,integer,integer) owner to masarifi_migration;
revoke all on function private.claim_notification_deliveries(text,integer,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.claim_notification_deliveries(text,integer,integer) to masarifi_worker;

create function private.guard_notification_template() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.status in ('published','retired') and
    (new.key,new.locale,new.channel,new.template_version,new.subject,new.body) is distinct from
    (old.key,old.locale,old.channel,old.template_version,old.subject,old.body) then
    raise exception using errcode='42501',message='NOTIFICATION_TEMPLATE_IMMUTABLE';
  end if;
  return new;
end $$;
alter function private.guard_notification_template() owner to masarifi_migration;
revoke all on function private.guard_notification_template() from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
create trigger notification_templates_immutable before update on public.notification_templates
for each row execute function private.guard_notification_template();

create function private.guard_immutable_engagement_row() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if pg_catalog.current_setting('masarifi.engagement_privacy_delete',true)='on' and tg_op='DELETE' then
    return old;
  end if;
  raise exception using errcode='42501',message='ENGAGEMENT_ROW_IMMUTABLE';
end $$;
alter function private.guard_immutable_engagement_row() owner to masarifi_migration;
revoke all on function private.guard_immutable_engagement_row() from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
create trigger support_messages_immutable before update or delete on public.support_messages
for each row execute function private.guard_immutable_engagement_row();
create trigger support_notes_immutable before update or delete on private.support_internal_notes
for each row execute function private.guard_immutable_engagement_row();

create function private.execute_engagement_command(
  p_actor text,p_operation text,p_resource_id uuid,p_body jsonb,p_factor_age_seconds integer,p_request_id text,p_approval_threshold integer,p_reopen_hours integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb; permission_name text; row_id uuid; message_id uuid; action_name text; expected_version bigint;
begin
  if p_actor is distinct from public.current_clerk_user_id() or jsonb_typeof(coalesce(p_body,'{}'))<>'object' then
    raise exception using errcode='42501',message='ENGAGEMENT_COMMAND_FORBIDDEN';
  end if;
  if p_reopen_hours not between 1 and 720 then
    raise exception using errcode='22023',message='ENGAGEMENT_CONFIG_INVALID';
  end if;
  action_name:=p_body->>'action';
  expected_version:=nullif(p_body->>'expectedVersion','')::bigint;
  permission_name:=case
    when p_operation like 'admin%NotificationTemplate' then 'communications.templates.manage'
    when p_operation like 'admin%NotificationCampaign' then 'notifications.campaigns.manage'
    when p_operation='adminPreviewNotificationAudience' then 'notifications.audience.preview'
    when p_operation='adminRetryNotificationDelivery' then 'notifications.campaigns.manage'
    when p_operation='adminActOnSupportTicket' and action_name='assign' then 'support.tickets.assign'
    when p_operation='adminActOnSupportTicket' and action_name='priority' then 'support.tickets.priority'
    when p_operation='adminActOnSupportTicket' and action_name='reply' then 'support.tickets.reply'
    when p_operation='adminActOnSupportTicket' and action_name in ('resolve','close','reopen') then 'support.tickets.resolve'
    when p_operation='adminAddSupportInternalNote' then 'support.tickets.notes'
    when p_operation='adminCreateSupportCategory' then 'support.categories.manage'
    when p_operation='adminActOnSupportCategory' then 'support.categories.manage'
    when p_operation='adminActOnFeedback' then 'feedback.manage'
    when p_operation='adminActOnAbuseReport' then 'feedback.abuse.manage'
    when p_operation like 'admin%Content' then 'content.manage'
  end;
  if p_operation like 'admin%' then
    if permission_name is null then raise exception using errcode='42501',message='ENGAGEMENT_COMMAND_FORBIDDEN'; end if;
    perform private.assert_engagement_admin(permission_name,p_factor_age_seconds);
  else
    perform private.assert_active_profile(p_actor);
  end if;

  if p_operation='adminPreviewNotificationAudience' then
    expected_version:=extract(epoch from clock_timestamp())::bigint;
    result:=jsonb_build_object(
      'previewId',(md5(p_actor||coalesce((p_body-'previewId'-'audienceVersion')::text,'{}')||expected_version::text))::uuid,
      'audienceVersion',expected_version::text,
      'eligible',(select count(*) from public.profiles p where p.status='active'
        and (not (p_body?'locales') or p.locale in (select jsonb_array_elements_text(p_body->'locales')))
        and (coalesce(p_body->>'activity','all')='all'
          or (p_body->>'activity'='active' and p.last_seen_at>=clock_timestamp()-interval '30 days')
          or (p_body->>'activity'='inactive' and (p.last_seen_at is null or p.last_seen_at<clock_timestamp()-interval '30 days')))
        and (not (p_body?'platforms') or exists(select 1 from public.user_devices d where d.user_id=p.id and d.revoked_at is null and d.platform in (select jsonb_array_elements_text(p_body->'platforms'))))
        and (not (coalesce(p_body->'segmentKeys','[]'::jsonb)?'salary_users') or exists(select 1 from public.salary_profiles s where s.user_id=p.id and s.deleted_at is null))),
      'excluded',(select count(*) from public.profiles p where p.status<>'active'),
      'optedOut',(select count(distinct pref.user_id) from public.notification_preferences pref where not pref.enabled),
      'expiresAt',clock_timestamp()+interval '10 minutes');
  elsif p_operation='replaceNotificationPreferences' then
    if coalesce((select max(version) from public.notification_preferences where user_id=p_actor),1)<>(p_body->>'expectedVersion')::bigint then
      raise exception using errcode='40001',message='NOTIFICATION_PREFERENCES_STALE';
    end if;
    delete from public.notification_preferences where user_id=p_actor;
    insert into public.notification_preferences(user_id,channel,event_type,enabled,quiet_hours,version)
    select p_actor,x.channel,x.event_type,x.enabled,coalesce(x.quiet_hours,'{}'),(p_body->>'expectedVersion')::bigint+1
    from jsonb_to_recordset(coalesce(p_body->'items','[]'))
      as x(channel text,event_type text,enabled boolean,quiet_hours jsonb);
    result:=jsonb_build_object('items',coalesce(p_body->'items','[]'),'version',(p_body->>'expectedVersion')::bigint+1);
  elsif p_operation in ('closeSupportTicket','reopenSupportTicket') then
    if not exists(select 1 from public.support_tickets where id=p_resource_id and user_id=p_actor) then
      raise exception using errcode='P0002',message='SUPPORT_TICKET_UNAVAILABLE';
    end if;
    if not exists(select 1 from public.support_tickets where id=p_resource_id and user_id=p_actor and version=expected_version) then
      raise exception using errcode='40001',message='SUPPORT_TICKET_STALE';
    end if;
    update public.support_tickets set
      status=case when p_operation='closeSupportTicket' then 'closed' else 'waiting_support' end,
      closed_at=case when p_operation='closeSupportTicket' then clock_timestamp() else null end
    where id=p_resource_id and user_id=p_actor and version=expected_version
      and ((p_operation='closeSupportTicket' and status in ('open','waiting_customer','waiting_support','resolved'))
        or (p_operation='reopenSupportTicket' and ((status='closed' and closed_at>clock_timestamp()-make_interval(hours=>p_reopen_hours))
          or (status='resolved' and updated_at>clock_timestamp()-make_interval(hours=>p_reopen_hours)))))
    returning jsonb_build_object('resourceId',id,'outcome','success','currentState',status,'version',version) into result;
  elsif p_operation='initializeSupportAttachment' then
    if not exists(select 1 from public.support_tickets where id=p_resource_id and user_id=p_actor) then
      raise exception using errcode='P0002',message='SUPPORT_TICKET_UNAVAILABLE';
    end if;
    row_id:=extensions.gen_random_uuid();
    insert into private.support_attachments(id,ticket_id,storage_ref,filename_safe,content_type,size_bytes,sha256)
    values(row_id,p_resource_id,'support/'||p_resource_id||'/'||row_id,p_body->>'filename',p_body->>'contentType',(p_body->>'sizeBytes')::bigint,p_body->>'sha256');
    result:=jsonb_build_object('uploadId',row_id,'storageRef','support/'||p_resource_id||'/'||row_id);
  elsif p_operation='finalizeSupportAttachment' then
    update private.support_attachments set scan_status='pending',next_attempt_at=clock_timestamp()
    where id=(p_body->>'uploadId')::uuid and ticket_id=p_resource_id and filename_safe=p_body->>'filename'
      and content_type=p_body->>'contentType' and size_bytes=(p_body->>'sizeBytes')::bigint
      and sha256=p_body->>'sha256' and scan_status='uploading'
      and exists(select 1 from public.support_tickets t where t.id=p_resource_id and t.user_id=p_actor)
    returning jsonb_build_object('id',id,'filename',filename_safe,'contentType',content_type,'sizeBytes',size_bytes,'status',scan_status) into result;
  elsif p_operation='adminCreateNotificationTemplate' then
    insert into public.notification_templates(key,locale,channel,template_version,subject,body,status,created_by)
    values(p_body->>'key',p_body->>'locale',p_body->>'channel',
      coalesce((select max(template_version)+1 from public.notification_templates where key=p_body->>'key' and locale=p_body->>'locale' and channel=p_body->>'channel'),1),
      p_body->>'subject',p_body->>'body','draft',p_actor) returning id into row_id;
  elsif p_operation='adminActOnNotificationTemplate' then
    if action_name='publish' then
      update public.notification_templates old set status='retired'
      from public.notification_templates candidate where candidate.id=p_resource_id
        and old.key=candidate.key and old.locale=candidate.locale and old.channel=candidate.channel
        and old.status='published' and old.id<>candidate.id;
    end if;
    update public.notification_templates set status=case action_name when 'test' then 'testing' when 'publish' then 'published' when 'retire' then 'retired' else status end,
      published_at=case when action_name in ('publish','retire') then coalesce(published_at,clock_timestamp()) else published_at end
    where id=p_resource_id and version=expected_version and (
      (action_name='test' and status='draft') or (action_name='publish' and status='testing') or
      (action_name='retire' and status='published')) returning id into row_id;
  elsif p_operation='adminCreateNotificationCampaign' then
    if (p_body->>'audienceVersion')::bigint<extract(epoch from clock_timestamp()-interval '10 minutes')::bigint
      or (p_body->>'previewId')::uuid<>(md5(p_actor||(p_body->'audience')::text||(p_body->>'audienceVersion')))::uuid then
      raise exception using errcode='22023',message='CAMPAIGN_PREVIEW_STALE';
    end if;
    insert into public.notification_campaigns(name,audience_definition,template_id,status,scheduled_at,created_by)
    select p_body->>'name',p_body->'audience',t.id,'draft',nullif(p_body->>'scheduledAt','')::timestamptz,p_actor
    from public.notification_templates t where t.id=(p_body->>'templateId')::uuid and t.status='published'
    returning id into row_id;
  elsif p_operation='adminActOnNotificationCampaign' then
    if action_name='approve' and exists(
      select 1 from public.notification_campaigns c where c.id=p_resource_id and c.created_by=p_actor
        and (select count(*) from public.profiles p where p.status='active')>p_approval_threshold
    ) then raise exception using errcode='42501',message='CAMPAIGN_APPROVER_SEPARATION_REQUIRED'; end if;
    update public.notification_campaigns set
      status=case action_name when 'approve' then 'approved' when 'schedule' then 'scheduled' when 'send_now' then 'running' when 'pause' then 'paused' when 'resume' then 'running' when 'cancel' then 'cancelled' else status end,
      approved_by=case when action_name='approve' then p_actor else approved_by end,
      scheduled_at=case when action_name='schedule' then (p_body->>'scheduledAt')::timestamptz else scheduled_at end
    where id=p_resource_id and version=expected_version and (
      (action_name='approve' and status='draft') or
      (action_name='schedule' and status='approved' and (p_body->>'scheduledAt')::timestamptz>clock_timestamp()) or
      (action_name='send_now' and status='approved') or
      (action_name='pause' and status in ('scheduled','running')) or
      (action_name='resume' and status='paused') or
      (action_name='cancel' and status in ('approved','scheduled','running','paused'))
    ) returning id into row_id;
  elsif p_operation='adminRetryNotificationDelivery' then
    update private.notification_deliveries set status='queued',error_code=null,next_attempt_at=clock_timestamp(),claim_token=null,claimed_by=null,lease_until=null
    where id=p_resource_id and status='failed' returning id into row_id;
  elsif p_operation='adminActOnSupportTicket' then
    if action_name='reply' then
      insert into public.support_messages(ticket_id,sender_id,sender_type,body)
      select id,p_actor,'admin',p_body->>'message' from public.support_tickets where id=p_resource_id and version=expected_version and status in ('open','waiting_customer','waiting_support') returning id into message_id;
      update public.support_tickets set status='waiting_customer',last_message_at=clock_timestamp() where id=p_resource_id and version=expected_version;
      if message_id is not null then
        row_id:=p_resource_id;
        perform private.enqueue_outbox_event('support.message_added','support_ticket',p_resource_id,
          jsonb_build_object('schemaVersion',1,'ticketId',p_resource_id,'messageId',message_id));
        perform private.enqueue_outbox_event('support.status_changed','support_ticket',p_resource_id,
          jsonb_build_object('schemaVersion',1,'ticketId',p_resource_id,'status','waiting_customer'));
      end if;
    else
      update public.support_tickets set
        status=case when action_name='resolve' then 'resolved' when action_name='close' then 'closed' when action_name='reopen' then 'waiting_support' else status end,
        closed_at=case when action_name='close' then clock_timestamp() when action_name='reopen' then null else closed_at end,
        assigned_admin_id=case when action_name='assign' then nullif(p_body->>'assigneeId','') else assigned_admin_id end,
        priority=case when action_name='priority' then p_body->>'priority' else priority end
      where id=p_resource_id and version=expected_version and (
        (action_name in ('assign','priority') and status<>'closed') or
        (action_name='resolve' and status in ('open','waiting_customer','waiting_support')) or
        (action_name='close' and status in ('open','waiting_customer','waiting_support','resolved')) or
        (action_name='reopen' and ((status='closed' and closed_at>clock_timestamp()-make_interval(hours=>p_reopen_hours))
          or (status='resolved' and updated_at>clock_timestamp()-make_interval(hours=>p_reopen_hours))))
      ) returning id into row_id;
    end if;
  elsif p_operation='adminAddSupportInternalNote' then
    if not exists(select 1 from public.support_tickets where id=p_resource_id and version=expected_version) then
      raise exception using errcode='P0002',message='SUPPORT_TICKET_UNAVAILABLE';
    end if;
    insert into private.support_internal_notes(ticket_id,admin_id,body) values(p_resource_id,p_actor,p_body->>'body') returning id into row_id;
  elsif p_operation='adminCreateSupportCategory' then
    insert into public.support_categories(key,name,sort_order) values(p_body->>'key',p_body->>'name',(p_body->>'sortOrder')::integer) returning id into row_id;
  elsif p_operation='adminActOnSupportCategory' then
    if action_name='retire' and exists(select 1 from public.support_tickets where category_id=p_resource_id and status<>'closed') then
      if not exists(select 1 from public.support_categories where id=(p_body->>'replacementCategoryId')::uuid and id<>p_resource_id and active) then
        raise exception using errcode='22023',message='SUPPORT_CATEGORY_REPLACEMENT_REQUIRED';
      end if;
      update public.support_tickets set category_id=(p_body->>'replacementCategoryId')::uuid where category_id=p_resource_id and status<>'closed';
    end if;
    update public.support_categories set active=(action_name='activate')
    where id=p_resource_id and version=expected_version and
      ((action_name='retire' and active) or (action_name='activate' and not active)) returning id into row_id;
  elsif p_operation='adminActOnFeedback' then
    update public.feedback_items set status=case action_name when 'review' then 'reviewing' when 'plan' then 'planned' when 'resolve' then 'resolved' when 'close' then 'closed' else status end,
      assigned_admin_id=case when action_name='assign' then nullif(p_body->>'assigneeId','') else assigned_admin_id end
    where id=p_resource_id and version=expected_version and (
      (action_name='assign' and status<>'closed') or
      (action_name='review' and status in ('new','planned')) or
      (action_name='plan' and status='reviewing') or
      (action_name='resolve' and status in ('reviewing','planned')) or
      (action_name='close' and status in ('new','reviewing','planned','resolved'))
    ) returning id into row_id;
  elsif p_operation='adminActOnAbuseReport' then
    update public.abuse_reports set status=case action_name when 'review' then 'reviewing' when 'action' then 'actioned' when 'dismiss' then 'dismissed' else status end,
      reviewed_by=p_actor,reviewed_at=clock_timestamp()
    where id=p_resource_id and version=expected_version and (
      (action_name='review' and status='open') or
      (action_name in ('action','dismiss') and status in ('open','reviewing'))
    ) returning id into row_id;
  elsif p_operation='adminCreateContent' then
    insert into public.content_items(key,type,status,created_by) values(p_body->>'key',p_body->>'type','draft',p_actor) returning id into row_id;
    insert into public.content_translations(content_id,locale,title,body)
    select row_id,x.locale,x.title,x.body from jsonb_to_recordset(p_body->'translations') as x(locale text,title text,body text);
  elsif p_operation='adminActOnContent' then
    if p_body?'translations' then
      if not exists(select 1 from public.content_items where id=p_resource_id and version=expected_version and status in ('draft','review')) then
        raise exception using errcode='40001',message='CONTENT_STALE';
      end if;
      insert into public.content_translations(content_id,locale,title,body)
      select p_resource_id,x.locale,x.title,x.body from jsonb_to_recordset(p_body->'translations') as x(locale text,title text,body text)
      on conflict(content_id,locale) do update set title=excluded.title,body=excluded.body;
    end if;
    update public.content_items set status=case action_name when 'review' then 'review' when 'publish' then 'published' when 'retire' then 'retired' else status end,
      published_at=case when action_name in ('publish','retire') then coalesce(published_at,clock_timestamp()) else published_at end
    where id=p_resource_id and version=expected_version and (
      (action_name='review' and status='draft') or
      (action_name='publish' and status='review' and (select count(distinct locale) from public.content_translations where content_id=p_resource_id)=2) or
      (action_name='retire' and status='published')
    ) returning id into row_id;
  else
    raise exception using errcode='22023',message='ENGAGEMENT_OPERATION_INVALID';
  end if;
  if result is null then
    if row_id is null then raise exception using errcode='P0002',message='ENGAGEMENT_RESOURCE_UNAVAILABLE'; end if;
    select jsonb_build_object('resourceId',id,'outcome','success','currentState',status,'version',version)
      into result from (
        select id,status,version from public.notification_templates where id=row_id
        union all select id,status,version from public.notification_campaigns where id=row_id
        union all select id,status,version from public.support_tickets where id=row_id
        union all select id,status,version from public.feedback_items where id=row_id
        union all select id,status,version from public.abuse_reports where id=row_id
        union all select id,status,version from public.content_items where id=row_id
        union all select id,case when active then 'active' else 'retired' end,version from public.support_categories where id=row_id
      ) resource limit 1;
    result:=coalesce(result,jsonb_build_object('resourceId',row_id,'outcome','accepted','currentState','created','version',1));
  end if;
  if p_operation='adminActOnSupportTicket' and action_name in ('resolve','close','reopen') then
    perform private.enqueue_outbox_event('support.status_changed','support_ticket',p_resource_id,
      jsonb_build_object('schemaVersion',1,'ticketId',p_resource_id,'status',result->>'currentState'));
  elsif p_operation='adminActOnContent' and action_name in ('publish','retire') then
    perform private.enqueue_outbox_event(case action_name when 'publish' then 'content.published' else 'content.retired' end,
      'content',p_resource_id,jsonb_build_object('schemaVersion',1,'contentId',p_resource_id));
  end if;
  if p_operation like 'admin%' then
    perform audit.append_event(p_actor,'admin','engagement.admin_action','engagement',coalesce(p_resource_id,row_id)::text,
      null,null,case when char_length(coalesce(p_body->>'reason','')) between 10 and 500 then p_body->>'reason' end,
      p_request_id,jsonb_build_object('operation',p_operation));
  end if;
  return result;
end $$;
alter function private.execute_engagement_command(text,text,uuid,jsonb,integer,text,integer,integer) owner to masarifi_migration;
revoke all on function private.execute_engagement_command(text,text,uuid,jsonb,integer,text,integer,integer) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.execute_engagement_command(text,text,uuid,jsonb,integer,text,integer,integer) to masarifi_api;

create function private.export_engagement_batch(p_user_id text,p_kind text,p_after uuid,p_limit integer)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_limit not between 1 and 500 then raise exception using errcode='42501',message='ENGAGEMENT_EXPORT_FORBIDDEN'; end if;
  if p_kind='notifications' then return query select to_jsonb(n)-array['user_id'] from public.notification_events n where n.user_id=p_user_id and (p_after is null or n.id>p_after) order by n.id limit p_limit;
  elsif p_kind='preferences' then return query select to_jsonb(p)-array['user_id'] from public.notification_preferences p where p.user_id=p_user_id and (p_after is null or p.id>p_after) order by p.id limit p_limit;
  elsif p_kind='tickets' then return query select to_jsonb(t)-array['user_id','assigned_admin_id'] from public.support_tickets t where t.user_id=p_user_id and (p_after is null or t.id>p_after) order by t.id limit p_limit;
  elsif p_kind='messages' then return query select to_jsonb(m)-array['sender_id'] from public.support_messages m join public.support_tickets t on t.id=m.ticket_id where t.user_id=p_user_id and (p_after is null or m.id>p_after) order by m.id limit p_limit;
  elsif p_kind='attachments' then return query select jsonb_build_object('id',a.id,'ticketId',a.ticket_id,'filename',a.filename_safe,'contentType',a.content_type,'sizeBytes',a.size_bytes,'status',a.scan_status,'createdAt',a.created_at) from private.support_attachments a join public.support_tickets t on t.id=a.ticket_id where t.user_id=p_user_id and (p_after is null or a.id>p_after) order by a.id limit p_limit;
  elsif p_kind='feedback' then return query select to_jsonb(f)-array['user_id','assigned_admin_id'] from public.feedback_items f where f.user_id=p_user_id and (p_after is null or f.id>p_after) order by f.id limit p_limit;
  elsif p_kind='abuse_reports' then return query select to_jsonb(a)-array['reporter_id','reviewed_by','resource_id'] from public.abuse_reports a where a.reporter_id=p_user_id and (p_after is null or a.id>p_after) order by a.id limit p_limit;
  else raise exception using errcode='22023',message='ENGAGEMENT_EXPORT_KIND_INVALID'; end if;
end $$;
alter function private.export_engagement_batch(text,text,uuid,integer) owner to masarifi_migration;
revoke all on function private.export_engagement_batch(text,text,uuid,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.export_engagement_batch(text,text,uuid,integer) to masarifi_worker;

create function private.read_engagement_attachment_refs(p_user_id text,p_after uuid,p_limit integer)
returns table(id uuid,storage_ref text) language sql security definer set search_path='' as $$
  select a.id,a.storage_ref from private.support_attachments a join public.support_tickets t on t.id=a.ticket_id
  where t.user_id=p_user_id and (p_after is null or a.id>p_after) order by a.id limit p_limit
$$;
alter function private.read_engagement_attachment_refs(text,uuid,integer) owner to masarifi_migration;
revoke all on function private.read_engagement_attachment_refs(text,uuid,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.read_engagement_attachment_refs(text,uuid,integer) to masarifi_worker;

create function private.delete_engagement_owner_data(p_user_id text,p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer:=0; part integer;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'<>'worker'
    or p_limit not between 1 and 500 then raise exception using errcode='42501',message='ENGAGEMENT_DELETE_FORBIDDEN'; end if;
  perform pg_catalog.set_config('masarifi.engagement_privacy_delete','on',true);
  delete from private.notification_deliveries where id in (select id from private.notification_deliveries where user_id=p_user_id order by id limit p_limit); get diagnostics changed=row_count;
  delete from public.notification_events where id in (select id from public.notification_events where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.notification_preferences where id in (select id from public.notification_preferences where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.support_tickets where id in (select id from public.support_tickets where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.feedback_items where id in (select id from public.feedback_items where user_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  delete from public.abuse_reports where id in (select id from public.abuse_reports where reporter_id=p_user_id order by id limit greatest(0,p_limit-changed)); get diagnostics part=row_count; changed:=changed+part;
  return changed;
end $$;
alter function private.delete_engagement_owner_data(text,integer) owner to masarifi_migration;
revoke all on function private.delete_engagement_owner_data(text,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.delete_engagement_owner_data(text,integer) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
