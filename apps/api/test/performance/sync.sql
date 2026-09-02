\set ON_ERROR_STOP on

delete from public.transaction_conflicts where user_id='sync_performance_owner';
delete from public.client_sync_state where user_id='sync_performance_owner';
delete from public.client_mutations where user_id='sync_performance_owner';
delete from public.user_devices where user_id='sync_performance_owner';
delete from private.outbox_events where aggregate_type='sync_performance';
delete from public.profiles where id='sync_performance_owner';

insert into public.profiles(id,status) values('sync_performance_owner','active');
insert into public.user_devices(
  id,user_id,device_fingerprint,clerk_session_id,platform,app_version
) values(
  '75000000-0000-4000-8000-000000000001','sync_performance_owner',
  'h1:'||repeat('d',64),'performance','ios','1.0.0'
);
alter table private.outbox_events disable trigger outbox_events_sync_metadata;
insert into private.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,created_at)
select md5('sync-performance-event:'||sample)::uuid,'sync_performance',
  md5('sync-performance-resource:'||sample)::uuid,'sync.performance',
  jsonb_build_object('sync',jsonb_build_object(
    'userId','sync_performance_owner','domain','accounts','cursor',sample,
    'resourceId',md5('sync-performance-resource:'||sample)::uuid,
    'resourceType','account','operation','upsert','version',1,
    'snapshot',jsonb_build_object('id',md5('sync-performance-resource:'||sample)::uuid)
  )),clock_timestamp()-sample*interval '1 second'
from generate_series(1,100000) sample;
alter table private.outbox_events enable trigger outbox_events_sync_metadata;

insert into public.client_mutations(
  user_id,device_id,operation_id,domain,resource_type,schema_version,depends_on,
  operation,payload_hash,payload,created_at
)
select 'sync_performance_owner','75000000-0000-4000-8000-000000000001',
  md5('sync-performance-mutation:'||sample)::uuid,'accounts','account',1,'{}','create',
  'sha256:'||repeat('a',64),jsonb_build_object('sample',sample),
  clock_timestamp()-sample*interval '1 second'
from generate_series(1,10000) sample;

analyze private.outbox_events;
analyze public.client_mutations;

explain (analyze,buffers,format json)
select (payload#>>'{sync,cursor}')::bigint
from private.outbox_events
where payload#>>'{sync,userId}'='sync_performance_owner'
  and payload?'sync'
  and payload#>>'{sync,domain}'='accounts'
  and (payload#>>'{sync,cursor}')::bigint>50000
order by (payload#>>'{sync,cursor}')::bigint,id limit 501;

explain (analyze,buffers,format json)
select id from public.client_mutations
where (status='received' and (next_attempt_at is null or next_attempt_at<=clock_timestamp()))
  and not exists(
    select 1 from unnest(depends_on) dependency_id
    join public.client_mutations dependency
      on dependency.user_id=client_mutations.user_id and dependency.operation_id=dependency_id
    where dependency.status<>'applied'
  )
  or (status='processing' and locked_until<=clock_timestamp())
order by coalesce(next_attempt_at,created_at),created_at,id limit 100;

explain (analyze,buffers,format json)
select id from public.transaction_conflicts
where user_id='sync_performance_owner' and status='open'
order by created_at,id limit 101;

explain (analyze,buffers,format json)
select last_cursor from public.client_sync_state
where user_id='sync_performance_owner'
  and device_id='75000000-0000-4000-8000-000000000001' and domain='accounts';
