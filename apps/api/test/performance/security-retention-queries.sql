explain (analyze,buffers,format json)
select exists(select 1 from private.retention_holds where resource_type='identity' and resource_id='performance_owner'
  and starts_at<=clock_timestamp() and (ends_at is null or ends_at>clock_timestamp()));

explain (analyze,buffers,format json)
select id from private.account_deletion_requests where status='verified' and cooling_off_ends_at<=clock_timestamp()
order by cooling_off_ends_at,id limit 25;
