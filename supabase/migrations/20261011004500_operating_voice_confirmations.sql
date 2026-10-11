-- Preparation only: no policy activation, historical outbox publication or delivery replay.
grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.voice_confirmation_sources(p_epoch uuid,p_limit integer)
returns table(source_event_id uuid,source_id text,event_type text,user_id text,locale text,time_zone text,occurred_at text,expires_at text)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'worker'
    or p_limit is null or p_limit not between 1 and 10 then
    raise exception using errcode='42501',message='VOICE_NOTIFICATION_CLAIM_FORBIDDEN';
  end if;
  if not private.voice_epoch_open(p_epoch) then return; end if;
  return query
    select o.id,t.id::text,o.event_type,t.user_id,
      case when p.locale='en' then 'en' else 'ar' end,p.timezone,o.created_at::text,null::text
    from private.staging_voice_epochs e
    join private.staging_voice_members m on m.epoch_id=e.id and m.capture_at>=e.started_at
    join private.voice_batches b on b.session_id=m.session_id
    join private.voice_events v on v.batch_id=b.id and v.status='committed'
    join public.transactions t on t.id=v.transaction_id and t.user_id=m.user_id and t.source='voice' and t.status='confirmed'
    join public.profiles p on p.id=t.user_id and p.status='active'
    join private.outbox_events o on o.aggregate_id=t.id and o.event_type='transaction.created' and o.created_at>=e.started_at
    where e.id=p_epoch and e.mode='operating' and e.state='active'
      and not exists(select 1 from public.notification_events n where n.source_event_id=o.id)
    order by o.created_at,o.id limit p_limit;
end $$;
alter function private.voice_confirmation_sources(uuid,integer) owner to masarifi_migration;
revoke all on function private.voice_confirmation_sources(uuid,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.voice_confirmation_sources(uuid,integer) to masarifi_worker;

create function private.claim_voice_notification_deliveries(p_epoch uuid,p_worker_id text,p_limit integer,p_lease_seconds integer)
returns setof private.notification_deliveries language plpgsql security definer set search_path='' as $$
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'worker'
    or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_limit is null or p_limit not between 1 and 10
    or p_lease_seconds is null or p_lease_seconds not between 10 and 120 then
    raise exception using errcode='42501',message='VOICE_NOTIFICATION_CLAIM_FORBIDDEN';
  end if;
  if not private.voice_epoch_open(p_epoch) then return; end if;
  return query with due as (
    select d.id from private.notification_deliveries d
    where (d.status in ('queued','failed') or (d.status='sending' and d.lease_until<clock_timestamp()))
      and coalesce(d.next_attempt_at,'-infinity')<=clock_timestamp()
      and (d.lease_until is null or d.lease_until<clock_timestamp())
      and exists (
        select 1 from private.staging_voice_epochs e
        join private.staging_voice_members m on m.epoch_id=e.id and m.capture_at>=e.started_at
        join private.voice_batches b on b.session_id=m.session_id
        join private.voice_events v on v.batch_id=b.id and v.status='committed'
        join public.transactions t on t.id=v.transaction_id and t.user_id=m.user_id and t.source='voice' and t.status='confirmed'
        join public.profiles p on p.id=t.user_id and p.status='active'
        join private.outbox_events o on o.aggregate_id=t.id and o.event_type='transaction.created' and o.created_at>=e.started_at
        join public.notification_events n on n.source_event_id=o.id and n.user_id=t.user_id
        where e.id=p_epoch and e.mode='operating' and e.state='active' and n.id=d.event_id and d.user_id=t.user_id
      )
    order by d.next_attempt_at nulls first,d.id limit p_limit for update of d skip locked
  ) update private.notification_deliveries d set status='sending',claim_token=extensions.gen_random_uuid(),
    claimed_by=p_worker_id,lease_until=clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds),attempt_count=d.attempt_count+1
    from due where d.id=due.id returning d.*;
end $$;
alter function private.claim_voice_notification_deliveries(uuid,text,integer,integer) owner to masarifi_migration;
revoke all on function private.claim_voice_notification_deliveries(uuid,text,integer,integer) from public,anon,authenticated,service_role,masarifi_api;
grant execute on function private.claim_voice_notification_deliveries(uuid,text,integer,integer) to masarifi_worker;

reset role;
