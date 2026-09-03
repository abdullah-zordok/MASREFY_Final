\set ON_ERROR_STOP on
begin;
set local role masarifi_migration;

insert into public.profiles(id,status) values('ai_performance_owner','active');
insert into private.ai_usage_events(id,user_id,workload,model,provider,input_tokens,output_tokens,estimated_cost,latency_ms,fallback_used,request_id,reservation_status,created_at)
select md5('ai-usage:'||n)::uuid,'ai_performance_owner',case when n%2=0 then 'financial_assistant' else 'voice_transcription' end,
  'fixture/model','fixture',100,20,0.001,10,false,'ai-performance-usage-'||lpad(n::text,7,'0'),'completed',
  timestamptz '2026-09-03 12:00:00+00'-n*interval '1 millisecond'
from generate_series(1,1000000) n;
insert into private.ai_failure_events(id,user_id,workload,failure_code,request_id,created_at,updated_at)
select md5('ai-failure:'||n)::uuid,'ai_performance_owner',case when n%2=0 then 'financial_assistant' else 'voice_transcription' end,
  'AI_TEMPORARILY_UNAVAILABLE','ai-performance-failure-'||lpad(n::text,7,'0'),
  timestamptz '2026-09-03 12:00:00+00'-n*interval '1 millisecond',timestamptz '2026-09-03 12:00:00+00'-n*interval '1 millisecond'
from generate_series(1,1000000) n;
insert into public.voice_sessions(id,user_id,locale,storage_ref,content_type,size_bytes,status,duration_ms,expires_at,operation_id,created_at)
select md5('ai-voice:'||n)::uuid,'ai_performance_owner','en','voice/'||md5('ai-voice:'||n)::uuid||'/'||md5('ai-object:'||n)::uuid,
  'audio/wav',44,'failed',1000,clock_timestamp()-interval '1 hour',md5('ai-operation:'||n)::uuid,clock_timestamp()-interval '2 hours'
from generate_series(1,10000) n;
analyze private.ai_usage_events;
analyze private.ai_failure_events;
analyze public.voice_sessions;

do $assertions$
begin
  if (select count(*) from private.ai_usage_events where user_id='ai_performance_owner')<>1000000
    or (select count(*) from private.ai_failure_events where user_id='ai_performance_owner')<>1000000 then
    raise exception 'AI_PERFORMANCE_FIXTURE_INVALID';
  end if;
end $assertions$;

explain (analyze,buffers,format json)
select id,workload,estimated_cost,created_at from private.ai_usage_events
where user_id='ai_performance_owner' and (created_at,id)<('2026-09-04T00:00:00Z','ffffffff-ffff-ffff-ffff-ffffffffffff')
order by created_at desc,id limit 101;

explain (analyze,buffers,format json)
select id,failure_code,status,created_at from private.ai_failure_events
where workload='financial_assistant' order by created_at desc,id limit 101;

explain (analyze,buffers,format json)
select id,storage_ref from public.voice_sessions where storage_ref is not null and expires_at<=clock_timestamp()
order by expires_at,id limit 100;

rollback;
