\set ON_ERROR_STOP on

select set_config('app.tracking_retention','on',true);
delete from public.transactions where user_id='tracking_performance_owner';
delete from public.profiles where id='tracking_performance_owner';

insert into public.profiles(id,status) values('tracking_performance_owner','active');

insert into public.tracking_history(id,user_id,source_type,source_ref,outcome,occurred_at,created_at)
select md5('tracking-history:'||sample)::uuid,'tracking_performance_owner','manual',
  'fixture-'||sample,'parsed',timestamptz '2026-09-02 12:00:00+00'-sample*interval '1 millisecond',
  timestamptz '2026-09-02 12:00:00+00'-sample*interval '1 millisecond'
from generate_series(1,1000000) sample;

insert into public.import_sessions(id,user_id,source_type,request_hash,status,item_count)
values(md5('tracking-performance-session')::uuid,'tracking_performance_owner','file',repeat('a',64),'review',10000);

insert into public.import_items(id,user_id,session_id,source_item_key,normalized_hash,source_hash,
  occurred_at,amount_minor,currency_code,merchant,normalized_payload,confidence_basis_points,status)
select md5('tracking-item:'||sample)::uuid,'tracking_performance_owner',md5('tracking-performance-session')::uuid,
  'row-'||sample,encode(extensions.digest(convert_to('normalized-'||sample,'UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('source-'||sample,'UTF8'),'sha256'),'hex'),
  timestamptz '2026-09-02 12:00:00+00'-sample*interval '1 second',1000,'SAR','Fictional merchant',
  jsonb_build_object('sourceItemKey','row-'||sample,'kind','expense'),6000,'review'
from generate_series(1,10000) sample;

insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,merchant,occurred_at,source)
select md5('tracking-transaction:'||sample)::uuid,'tracking_performance_owner','expense','confirmed',1000,'SAR',
  'Fictional transaction','Fictional merchant',clock_timestamp()-sample*interval '1 minute','manual'
from generate_series(1,1000) sample;

analyze public.tracking_history;
analyze public.import_items;
analyze public.import_sessions;
analyze public.transactions;

do $assertions$
begin
  if (select count(*) from public.tracking_history where user_id='tracking_performance_owner')<>1000000
    or (select count(*) from public.import_items where user_id='tracking_performance_owner')<>10000 then
    raise exception 'TRACKING_PERFORMANCE_FIXTURE_INVALID';
  end if;
end $assertions$;

explain (analyze,buffers,format json)
select id,source_type,source_ref,outcome,occurred_at from public.tracking_history
where user_id='tracking_performance_owner'
  and (occurred_at,id)<(timestamptz '2026-09-03 00:00:00+00','ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
order by occurred_at desc,id desc limit 101;

explain (analyze,buffers,format json)
select id,status,occurred_at from public.import_items
where session_id=md5('tracking-performance-session')::uuid and status='review'
order by id limit 101;

explain (analyze,buffers,format json)
select id from public.transactions
where user_id='tracking_performance_owner' and status='confirmed' and deleted_at is null
  and amount_minor=1000 and currency_code='SAR'
  and occurred_at between clock_timestamp()-interval '2 days' and clock_timestamp()+interval '5 minutes'
order by occurred_at desc,id desc limit 100;
