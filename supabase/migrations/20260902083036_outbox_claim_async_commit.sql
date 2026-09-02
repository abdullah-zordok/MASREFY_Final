grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create or replace function private.claim_outbox_batch(
  p_worker_id text,
  p_limit_count integer,
  p_lease_seconds integer
)
returns setof private.outbox_events
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'OUTBOX_WORKER_ID_INVALID';
  end if;
  if p_limit_count is null or p_limit_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'OUTBOX_CLAIM_LIMIT_INVALID';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 300 then
    raise exception using errcode = '22023', message = 'OUTBOX_LEASE_INVALID';
  end if;

  -- Claiming only advances a recoverable lease. Avoid making the worker poll loop
  -- wait for a WAL flush; a crash simply makes the event claimable again.
  perform set_config('synchronous_commit', 'off', true);

  return query
  with eligible as (
    select id
    from private.outbox_events
    where published_at is null
      and available_at <= now()
      and (locked_until is null or locked_until <= now())
    order by available_at, id
    for update skip locked
    limit p_limit_count
  )
  update private.outbox_events as event
  set locked_by = btrim(p_worker_id),
      locked_until = now() + make_interval(secs => p_lease_seconds)
  from eligible
  where event.id = eligible.id
  returning event.*;
end
$function$;

reset role;
revoke masarifi_migration from current_user granted by current_user;
