explain (analyze,buffers,format json)
select id,event_type,severity,metadata,occurred_at from public.security_events
where user_id='performance_owner' order by occurred_at desc,id desc limit 101;
