\set ON_ERROR_STOP on

insert into private.clerk_webhook_events(
  clerk_event_id,event_type,signature_verified_at,payload_hash,payload,status,
  attempt_count,last_error_code,created_at
)
select
  'msg_perf_' || value,
  case value % 3 when 0 then 'user.created' when 1 then 'user.updated' else 'user.deleted' end,
  now(), md5('hash-a-' || value) || md5('hash-b-' || value),
  jsonb_build_object('type','user.updated','data',jsonb_build_object('id','perf_user_' || value)),
  case when value % 4 = 0 then 'failed' else 'received' end,
  case when value % 4 = 0 then 1 else 0 end,
  case when value % 4 = 0 then 'PROVIDER_UNAVAILABLE' else null end,
  now() - (value || ' seconds')::interval
from generate_series(1,10000) value
on conflict(clerk_event_id) do nothing;

analyze private.clerk_webhook_events;

explain (analyze,buffers,format text)
select id from private.clerk_webhook_events
where status in ('received','failed') and attempt_count < 10
order by created_at,id for update skip locked limit 1;

explain (analyze,buffers,format text)
select id from private.clerk_webhook_events
where created_at <= now()-interval '7 days'
  and status in ('processed','failed') and payload<>'{}'::jsonb
order by created_at,id limit 100;

delete from private.clerk_webhook_events where clerk_event_id like 'msg\_perf\_%' escape '\';
