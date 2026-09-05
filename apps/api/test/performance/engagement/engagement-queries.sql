\set ON_ERROR_STOP on
begin;
grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

-- Synthetic owner rows stay inside the transaction and are rolled back.
insert into public.profiles(id,status,locale,timezone)
select 'engagement_perf_'||g,'active',case when g%2=0 then 'ar' else 'en' end,'Asia/Riyadh'
from generate_series(1,1000) g on conflict do nothing;

insert into public.notification_events(user_id,type,title,body_safe,created_at)
select 'engagement_perf_1','report.ready','Masarifi','A safe update is available.',clock_timestamp()-(g||' seconds')::interval
from generate_series(1,10000) g;

insert into public.support_categories(key,name,sort_order) values('performance','Performance',999);
insert into public.support_tickets(user_id,category_id,subject,status,last_message_at)
select 'engagement_perf_'||((g-1)%1000+1),(select id from public.support_categories where key='performance'),
  'Performance ticket '||g,case when g%2=0 then 'waiting_support' else 'open' end,
  clock_timestamp()-(g||' seconds')::interval from generate_series(1,5000) g;

insert into public.profiles(id,status,locale,timezone) values('engagement_perf_admin','active','en','Asia/Riyadh');
insert into public.admin_profiles(user_id,status) values('engagement_perf_admin','active');
insert into public.content_items(key,type,status,published_at,created_by)
select 'performance_help_'||g,case when g%2=0 then 'faq' else 'article' end,'published',clock_timestamp(),'engagement_perf_admin'
from generate_series(1,500) g;
insert into public.content_translations(content_id,locale,title,body)
select c.id,l.locale,'Performance help '||c.key,'Safe indexed content body'
from public.content_items c cross join unnest(array['ar','en']) l(locale)
where c.key like 'performance_help_%';

insert into public.notification_campaigns(name,audience_definition,template_id,status,approved_by,created_by)
select 'Performance campaign','{"locales":["ar","en"],"activity":"all"}'::jsonb,t.id,'running','engagement_perf_admin','engagement_perf_admin'
from public.notification_templates t where t.status='published' limit 1;

analyze public.notification_events;
analyze public.support_tickets;
analyze public.content_items;
analyze public.content_translations;

do $$ declare plan json; begin
  execute $query$explain (analyze,buffers,format json) select id,type,title,body_safe,read_at,version,created_at from public.notification_events where user_id='engagement_perf_1' and read_at is null order by created_at desc,id desc limit 101$query$ into plan;
  if (plan->0->>'Execution Time')::numeric > 50 then raise exception 'notification query exceeded 50 ms: %',plan->0->>'Execution Time'; end if;
end $$;

do $$ declare plan json; begin
  execute $query$explain (analyze,buffers,format json) select id,subject,status,priority,last_message_at,version from public.support_tickets where user_id='engagement_perf_1' order by last_message_at desc,id desc limit 101$query$ into plan;
  if (plan->0->>'Execution Time')::numeric > 50 then raise exception 'support query exceeded 50 ms: %',plan->0->>'Execution Time'; end if;
end $$;

do $$ declare plan json; begin
  execute $query$explain (analyze,buffers,format json) select c.id,t.locale,t.title from public.content_items c join public.content_translations t on t.content_id=c.id and t.locale='en' where c.status='published' order by c.updated_at desc,c.id desc limit 101$query$ into plan;
  if (plan->0->>'Execution Time')::numeric > 50 then raise exception 'content query exceeded 50 ms: %',plan->0->>'Execution Time'; end if;
end $$;

do $$ declare plan json; begin
  execute $query$explain (analyze,buffers,format json) select p.id from public.profiles p where p.status='active' and p.id>'engagement_perf_0' order by p.id limit 500$query$ into plan;
  if (plan->0->>'Execution Time')::numeric > 50 then raise exception 'campaign keyset query exceeded 50 ms: %',plan->0->>'Execution Time'; end if;
end $$;

rollback;
