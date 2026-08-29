grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create function private.accept_admin_invitation(
  p_token_hash text,
  p_verified_email text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_id text := public.current_clerk_user_id();
  invitation public.admin_invitations%rowtype;
  assignment_id uuid;
  accepted_now boolean := false;
begin
  if subject_id is null or p_token_hash !~ '^h1:[0-9a-f]{64}$'
    or p_verified_email <> lower(btrim(p_verified_email))
    or p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or not exists(select 1 from public.profiles where id=subject_id and status='active')
  then
    raise exception using errcode='42501',message='INVITATION_ACCEPTANCE_DENIED';
  end if;

  select * into invitation from public.admin_invitations
  where token_hash=p_token_hash and email=p_verified_email and revoked_at is null
  for update;
  if invitation.id is null or (invitation.accepted_at is null and invitation.expires_at<=clock_timestamp()) then
    raise exception using errcode='42501',message='INVITATION_ACCEPTANCE_DENIED';
  end if;
  if invitation.accepted_at is null then
    update public.admin_invitations set accepted_at=clock_timestamp() where id=invitation.id;
    accepted_now := true;
  end if;

  insert into public.admin_profiles(user_id,status) values(subject_id,'active')
  on conflict(user_id) do update set status='active';
  insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
  values(subject_id,invitation.role_id,invitation.invited_by,'Accepted administrator invitation')
  on conflict(user_id,role_id) where revoked_at is null do nothing
  returning id into assignment_id;
  if assignment_id is null then
    select id into assignment_id from public.admin_role_assignments
    where user_id=subject_id and role_id=invitation.role_id and revoked_at is null;
  end if;
  if assignment_id is null then raise exception using errcode='P0001',message='INVITATION_ACCEPTANCE_FAILED'; end if;

  if accepted_now then
    perform audit.append_event(subject_id,'admin','admin.invitation_accepted','admin_invitation',invitation.id::text,
      null,null,'Accepted administrator invitation',p_request_id,jsonb_build_object('assignmentId',assignment_id::text));
  end if;
  return assignment_id;
end;
$$;
alter function private.accept_admin_invitation(text,text,text) owner to masarifi_migration;
revoke all on function private.accept_admin_invitation(text,text,text) from public,anon,authenticated,service_role,masarifi_worker;
grant execute on function private.accept_admin_invitation(text,text,text) to masarifi_api;

create function private.validate_support_grant_invariant()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare request private.support_access_requests%rowtype;
begin
  select * into request from private.support_access_requests where id=new.request_id for update;
  if request.id is null or request.status<>'approved' or new.admin_id<>request.assignee
    or not request.scope @> new.scope or new.starts_at<request.created_at or new.ends_at>request.expires_at
  then raise exception using errcode='23514',message='SUPPORT_GRANT_INVARIANT_INVALID'; end if;
  return new;
end;
$$;
alter function private.validate_support_grant_invariant() owner to masarifi_migration;
revoke all on function private.validate_support_grant_invariant() from public;
create trigger support_access_grants_validate before insert or update on private.support_access_grants
for each row execute function private.validate_support_grant_invariant();

create function private.protect_last_super_admin()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare protected_user text;
begin
  perform pg_advisory_xact_lock(hashtextextended('masarifi:last-super-admin',0));
  if tg_table_name='admin_profiles' then
    if old.status='active' and new.status<>'active' and exists(
      select 1 from public.admin_role_assignments a join public.roles r on r.id=a.role_id
      where a.user_id=old.user_id and r.key='super-admin' and r.enabled and a.revoked_at is null
        and a.starts_at<=clock_timestamp() and (a.ends_at is null or a.ends_at>clock_timestamp())
    ) then protected_user:=old.user_id; end if;
  elsif tg_table_name='admin_role_assignments' then
    if old.revoked_at is null and old.starts_at<=clock_timestamp() and (old.ends_at is null or old.ends_at>clock_timestamp())
      and (new.revoked_at is not null or new.starts_at>clock_timestamp() or (new.ends_at is not null and new.ends_at<=clock_timestamp()))
      and exists(select 1 from public.roles where id=old.role_id and key='super-admin' and enabled)
    then protected_user:=old.user_id; end if;
  elsif tg_table_name='roles' and old.key='super-admin' and old.enabled and not new.enabled then
    raise exception using errcode='23514',message='LAST_SUPER_ADMIN_REQUIRED';
  end if;
  if protected_user is not null and not exists(
    select 1 from public.admin_profiles p join public.admin_role_assignments a on a.user_id=p.user_id join public.roles r on r.id=a.role_id
    where p.status='active' and p.user_id<>protected_user and r.key='super-admin' and r.enabled and a.revoked_at is null
      and a.starts_at<=clock_timestamp() and (a.ends_at is null or a.ends_at>clock_timestamp())
  ) then raise exception using errcode='23514',message='LAST_SUPER_ADMIN_REQUIRED'; end if;
  return new;
end;
$$;
alter function private.protect_last_super_admin() owner to masarifi_migration;
revoke all on function private.protect_last_super_admin() from public;
create trigger admin_profiles_last_super before update on public.admin_profiles for each row execute function private.protect_last_super_admin();
create trigger admin_assignments_last_super before update on public.admin_role_assignments for each row execute function private.protect_last_super_admin();
create trigger roles_last_super before update on public.roles for each row execute function private.protect_last_super_admin();

create function private.prevent_retention_hold_overlap()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.resource_type||':'||new.resource_id,0));
  if exists(select 1 from private.retention_holds h where h.id<>new.id and h.resource_type=new.resource_type and h.resource_id=new.resource_id
    and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)'))
  then raise exception using errcode='23505',message='RETENTION_HOLD_OVERLAP'; end if;
  return new;
end;
$$;
alter function private.prevent_retention_hold_overlap() owner to masarifi_migration;
revoke all on function private.prevent_retention_hold_overlap() from public;
create trigger retention_holds_no_overlap before insert or update on private.retention_holds
for each row execute function private.prevent_retention_hold_overlap();

reset role;
grant usage on schema pgmq to masarifi_migration;
grant execute on function pgmq.send(text,jsonb,integer) to masarifi_migration;
grant select,insert on table pgmq."q_platform-events" to masarifi_migration;
grant usage,select on sequence pgmq."q_platform-events_msg_id_seq" to masarifi_migration;
set local role masarifi_migration;

create function private.dispatch_security_alerts(p_limit integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  event record;
  dispatched integer := 0;
  envelope_id uuid;
begin
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='SECURITY_ALERT_LIMIT_INVALID'; end if;
  for event in
    select s.id,s.severity,s.occurred_at from public.security_events s
    where s.severity in ('high','critical') and not exists(
      select 1 from audit.audit_events a where a.action='security.alert_dispatched' and a.resource_type='security_event' and a.resource_id=s.id::text)
    order by s.occurred_at,s.id for update skip locked limit p_limit
  loop
    envelope_id := extensions.gen_random_uuid();
    perform pgmq.send('platform-events',jsonb_build_object(
      'schemaVersion',1,'eventId',envelope_id,'eventType','security.alert','occurredAt',clock_timestamp(),
      'producer','masarifi-api','aggregate',jsonb_build_object('type','security_event','id',event.id),
      'correlationId','alert:'||event.id::text,'attempt',1,
      'payload',jsonb_build_object('schemaVersion',1,'category','security_event','severity',event.severity,
        'evidenceId',event.id,'occurredAt',event.occurred_at,'runbookKey','audit-security-incident','correlationId','alert:'||event.id::text)
    ),0);
    perform audit.append_event(null,'system','security.alert_dispatched','security_event',event.id::text,null,null,null,
      'alert:'||event.id::text,jsonb_build_object('severity',event.severity,'category','security_event'));
    dispatched := dispatched+1;
  end loop;
  return dispatched;
end;
$$;
alter function private.dispatch_security_alerts(integer) owner to masarifi_migration;
revoke all on function private.dispatch_security_alerts(integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.dispatch_security_alerts(integer) to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
